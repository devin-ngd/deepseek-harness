# Exercise the production NSIS directory transaction with private installation directories.
param(
  [Parameter(Mandatory)][string]$Makensis,
  [Parameter(Mandatory)][string]$SevenZip,
  [Parameter(Mandatory)][string]$FrameLibrary,
  [scriptblock]$SignExecutable
)
$ErrorActionPreference = 'Stop'
$Makensis = [System.IO.Path]::GetFullPath($Makensis)
$SevenZip = [System.IO.Path]::GetFullPath($SevenZip)
if ($FrameLibrary) { $FrameLibrary = [System.IO.Path]::GetFullPath($FrameLibrary) }
$scratch = [System.IO.Directory]::CreateTempSubdirectory('dsh-directory-smoke-').FullName
$fixture = Join-Path $PSScriptRoot '../tests/fixtures/installer-directory-smoke.nsi'

function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
  & $Executable @Arguments | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "$Executable exited with $LASTEXITCODE" }
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DshMandatoryLabelProbe {
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode)]
  private static extern uint GetNamedSecurityInfoW(string pObjectName, int ObjectType, uint SecurityInfo,
    IntPtr psidOwner, IntPtr psidGroup, IntPtr pDacl, out IntPtr pSacl, out IntPtr ppSecurityDescriptor);
  [DllImport("advapi32.dll")]
  private static extern bool GetAce(IntPtr pAcl, uint dwAceIndex, out IntPtr pAce);
  [DllImport("advapi32.dll")]
  private static extern bool IsValidSid(IntPtr pSid);
  [DllImport("advapi32.dll")]
  private static extern IntPtr GetSidSubAuthorityCount(IntPtr pSid);
  [DllImport("advapi32.dll")]
  private static extern IntPtr GetSidSubAuthority(IntPtr pSid, uint nSubAuthority);
  [DllImport("kernel32.dll")]
  private static extern IntPtr LocalFree(IntPtr hMem);
  public static uint GetLowestRid(string path) {
    IntPtr sacl, sd;
    if (GetNamedSecurityInfoW(path, 1, 0x10, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, out sacl, out sd) != 0) return 0xFFFFFFFF;
    try {
      uint lowest = 0x2000;
      if (sacl == IntPtr.Zero) return lowest;
      ushort count = (ushort)Marshal.ReadInt16(sacl, 4);
      bool found = false;
      for (uint i = 0; i < count; i++) {
        IntPtr ace;
        if (!GetAce(sacl, i, out ace)) break;
        if (Marshal.ReadByte(ace, 0) != 0x11) continue;
        IntPtr sid = IntPtr.Add(ace, 8);
        if (!IsValidSid(sid)) continue;
        byte subCount = Marshal.ReadByte(GetSidSubAuthorityCount(sid));
        if (subCount == 0) continue;
        uint rid = (uint)Marshal.ReadInt32(GetSidSubAuthority(sid, (uint)(subCount - 1)));
        if (!found || rid < lowest) lowest = rid;
        found = true;
      }
      return lowest;
    } finally { if (sd != IntPtr.Zero) LocalFree(sd); }
  }
}
"@

try {
  $localeModule = [uri]::new((Join-Path $PSScriptRoot 'installer-locales.mjs')).AbsoluteUri
  $strings = Join-Path $scratch 'strings.nsh'
  $node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
  Invoke-Checked $node @('--input-type=module', '-e', 'import { writeFileSync } from "node:fs"; const { readInstallerLocales, renderInstallerStrings } = await import(process.argv[1]); writeFileSync(process.argv[2], renderInstallerStrings(readInstallerLocales()), "utf8")', $localeModule, $strings)
  $payload = Join-Path $scratch 'payload'
  New-Item -ItemType Directory -Path $payload | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $payload 'asset.txt'), 'new asset')
  $deepPayload = Join-Path $payload (('nested-' * 20) + '\asset-' + ('x' * 60) + '.txt')
  [IO.Directory]::CreateDirectory((Split-Path $deepPayload -Parent)) | Out-Null
  [IO.File]::WriteAllText($deepPayload, 'long path asset')
  $archive = Join-Path $scratch 'payload.7z'
  Invoke-Checked $SevenZip @('a', '-bd', '-t7z', $archive, "$payload/*")
  $brokenArchive = Join-Path $scratch 'broken.7z'
  [System.IO.File]::WriteAllText($brokenArchive, 'invalid archive')

  foreach ($mode in @('first', 'upgrade', 'transient-lock', 'locked', 'locked-stage', 'missing-stage', 'restore-conflict', 'broken', 'cancelled', 'access-denied')) {
    $caseRoot = Join-Path $scratch $mode
    $target = Join-Path $caseRoot 'Application'
    New-Item -ItemType Directory -Path $caseRoot | Out-Null
    if ($mode -in @('first', 'upgrade', 'transient-lock')) {
      & icacls $caseRoot /grant '*S-1-15-2-1:(OI)(CI)(RX)' | Out-Host
      if ($LASTEXITCODE -ne 0) { throw "Cannot pollute $caseRoot with application-package access" }
      & icacls $caseRoot /deny '*S-1-1-0:(OI)(CI)(IO)(DC)' | Out-Host
      if ($LASTEXITCODE -ne 0) { throw "Cannot pollute $caseRoot with a deny-delete rule" }
      & icacls $caseRoot /setintegritylevel '(OI)(CI)L' | Out-Host
      if ($LASTEXITCODE -ne 0) { throw "Cannot pollute $caseRoot with a low mandatory integrity label" }
    }
    if ($mode -eq 'access-denied') {
      # OWNER RIGHTS removes the staging owner's implicit WRITE_DAC while leaving payload IO and cleanup available.
      & icacls $caseRoot /deny '*S-1-3-4:(OI)(CI)(IO)(WDAC)' | Out-Host
      if ($LASTEXITCODE -ne 0) { throw "Cannot deny staging permission changes under $caseRoot" }
    }
    if ($mode -ne 'first') {
      New-Item -ItemType Directory -Path $target | Out-Null
      [System.IO.File]::WriteAllText((Join-Path $target 'asset.txt'), 'old asset')
      [System.IO.File]::WriteAllText((Join-Path $target 'obsolete.txt'), 'old only')
      $oldDeep = Join-Path $target ([IO.Path]::GetRelativePath($payload, $deepPayload))
      [IO.Directory]::CreateDirectory((Split-Path $oldDeep -Parent)) | Out-Null
      [IO.File]::WriteAllText($oldDeep, 'old long path asset')
    }
    $probe = Join-Path $scratch "probe-$mode.exe"
    $caseArchive = if ($mode -eq 'broken') { $brokenArchive } else { $archive }
    $reportDir = Join-Path $caseRoot 'installer-logs'
    $compileArgs = @('/V2', "/DOUTPUT_FILE=$probe", "/DPAYLOAD_FILE=$caseArchive", "/DTARGET_DIR=$target", "/DDSH_SEVENZIP_PATH=$SevenZip")
    if ($FrameLibrary) { $compileArgs += @("/DSOURCE_DLL=$FrameLibrary", "/DREPORT_DIR=$reportDir", "/DINSTALLER_STRINGS_FILE=$strings") }
    if ($mode -eq 'missing-stage') { $compileArgs += '/DMISSING_STAGE' }
    if ($mode -eq 'locked-stage') { $compileArgs += '/DLOCKED_STAGE' }
    if ($mode -eq 'restore-conflict') { $compileArgs += '/DRESTORE_CONFLICT' }
    if ($mode -eq 'cancelled') { $compileArgs += '/DCANCELLED' }
    Invoke-Checked $Makensis ($compileArgs + $fixture)
    if ($null -ne $SignExecutable) { & $SignExecutable $probe }
    $handle = $null
    $process = $null
    try {
      if ($mode -in @('locked', 'transient-lock')) {
        $handle = [System.IO.File]::Open((Join-Path $target 'asset.txt'), 'Open', 'Read', 'Read')
      }
      $startInfo = [Diagnostics.ProcessStartInfo]::new($probe, '/S')
      $startInfo.UseShellExecute = $false
      $startInfo.CreateNoWindow = $true
      $process = [Diagnostics.Process]::Start($startInfo)
      if ($mode -eq 'transient-lock') {
        $deadline = [Diagnostics.Stopwatch]::StartNew()
        $observedFailure = $false
        while (-not $process.HasExited -and $deadline.Elapsed.TotalSeconds -lt 30) {
          $pluginPath = "$target.plugin-dir"
          if (Test-Path -LiteralPath $pluginPath) {
            $trace = Join-Path ([IO.File]::ReadAllText($pluginPath)) 'directory-operations.log'
            if (Test-Path -LiteralPath $trace) {
              $stream = [IO.File]::Open($trace, 'Open', 'Read', 'ReadWrite')
              $reader = [IO.StreamReader]::new($stream)
              try { $attempts = $reader.ReadToEnd() } finally { $reader.Dispose() }
              if ($attempts -match 'Windows error: (5|32|33)\b') {
                $observedFailure = $true
                break
              }
            }
          }
          Start-Sleep -Milliseconds 20
        }
        if (-not $observedFailure) { throw 'Transient-lock smoke did not observe the failed operation before release' }
        $handle.Dispose()
        $handle = $null
      }
      if (-not $process.WaitForExit(60000)) {
        $process.Kill($true)
        $process.WaitForExit()
        throw "Directory smoke $mode did not exit within 60 seconds"
      }
      $expectedExit = if ($mode -in @('first', 'upgrade', 'transient-lock')) { 0 } else { 2 }
      if ($process.ExitCode -ne $expectedExit) {
        throw "Directory smoke $mode exited with $($process.ExitCode), expected $expectedExit"
      }
    } finally {
      if ($null -ne $handle) { $handle.Dispose() }
      if ($null -ne $process) {
        if (-not $process.HasExited) { $process.Kill($true); $process.WaitForExit() }
        $process.Dispose()
      }
    }
    if ($mode -eq 'restore-conflict') {
      $backups = @(Get-ChildItem -LiteralPath $caseRoot -Directory -Filter 'Application.old-*')
      if ($backups.Count -ne 1 -or [IO.File]::ReadAllText((Join-Path $backups[0].FullName 'asset.txt')) -ne 'old asset' -or
          [IO.File]::ReadAllText((Join-Path $backups[0].FullName 'obsolete.txt')) -ne 'old only' -or
          [IO.File]::ReadAllText((Join-Path "$target.conflict" 'unrelated.txt')) -ne 'unrelated file') {
        throw 'Failed restoration did not preserve the backup and the conflicting destination'
      }
      if ((Test-Path -LiteralPath $target) -or @(Get-ChildItem -LiteralPath $caseRoot -Directory -Filter 'Application.new-*').Count -ne 0) {
        throw 'Reported restoration failure retried recovery or retained its unlocked staging directory'
      }
      if ($FrameLibrary) {
        $reports = @(Get-ChildItem -LiteralPath $reportDir -File)
        if ($reports.Count -ne 1) { throw 'Failed restoration did not save exactly one report' }
        $report = Get-Content -LiteralPath $reports[0].FullName -Raw -Encoding UTF8
        foreach ($expected in @('promote: Windows error: 183', 'restore: Windows error: 183', 'Restoration error: 183', "Preserved backup: $($backups[0].FullName)")) {
          if (-not $report.Contains($expected)) { throw "Failed restoration report lacks '$expected'" }
        }
      }
      Write-Output "Directory replacement smoke passed: $mode"
      continue
    }
    $expectedAsset = if ($mode -in @('first', 'upgrade', 'transient-lock')) { 'new asset' } else { 'old asset' }
    if ([System.IO.File]::ReadAllText((Join-Path $target 'asset.txt')) -ne $expectedAsset) {
      throw "Directory smoke $mode changed the wrong version"
    }
    $expectObsolete = $mode -notin @('first', 'upgrade', 'transient-lock')
    if (-not $expectObsolete) {
      foreach ($entry in @($target, (Join-Path $target 'asset.txt'), (Join-Path $target ([IO.Path]::GetRelativePath($payload, $deepPayload))))) {
        $rules = @((Get-Acl -LiteralPath $entry).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | Where-Object {
          $_.IdentityReference.Value -in @('S-1-15-2-1', 'S-1-1-0')
        })
        if ($rules.Count -ne 0) { throw "Polluted parent authorization remained on $entry" }
        $labelRid = [DshMandatoryLabelProbe]::GetLowestRid($entry)
        if ($labelRid -lt 0x2000 -or $labelRid -eq 0xFFFFFFFF) { throw "Low mandatory integrity label remained on $entry (rid=0x$($labelRid.ToString('X')))" }
      }
    }
    if ((Test-Path -LiteralPath (Join-Path $target 'obsolete.txt')) -ne $expectObsolete) {
      throw "Directory smoke $mode did not preserve the expected old-only file state"
    }
    if (@(Get-ChildItem -LiteralPath $caseRoot -Directory | Where-Object Name -notin @('Application', 'installer-logs')).Count -ne 0) {
      throw "Directory smoke $mode left transaction directories behind"
    }
    if ($FrameLibrary) {
      $reports = @(if (Test-Path -LiteralPath $reportDir) { Get-ChildItem -LiteralPath $reportDir -File })
      if ($mode -eq 'broken') {
        if ($reports.Count -ne 1 -or $reports[0].Name -notmatch '^extract-failure-20\d{6}-\d{5,6}\.log$') {
          throw "Directory smoke $mode did not save exactly one extraction report"
        }
        $report = Get-Content -LiteralPath $reports[0].FullName -Raw -Encoding UTF8
        foreach ($expected in @('Result: 7-Zip exit code 2 (fatal error)', "Archive: $caseArchive", 'Cannot open the file as [7z] archive')) {
          if (-not $report.Contains($expected)) { throw "Directory smoke $mode report lacks '$expected'" }
        }
      } elseif ($mode -in @('locked', 'locked-stage', 'missing-stage')) {
        if ($reports.Count -ne 1 -or $reports[0].Name -notmatch '^directory-failure-20\d{6}-\d{5,6}\.log$') {
          throw "Directory smoke $mode did not save exactly one directory report"
        }
        $report = Get-Content -LiteralPath $reports[0].FullName -Raw -Encoding UTF8
        $expectedError = if ($mode -ne 'missing-stage') { '(5|32|33)' } else { '2' }
        if ($report -notmatch "Windows error: $expectedError\b") { throw "Directory smoke $mode reported an unexpected Windows error" }
        foreach ($expected in @('Operation: MoveFileExW', 'Restoration error: 0')) {
          if (-not $report.Contains($expected)) { throw "Directory smoke $mode report lacks '$expected'" }
        }
        $attempts = ([regex]::Matches($report, 'Windows error: ')).Count - 1
        $expectedAttempts = if ($mode -ne 'missing-stage') { 10 } else { 1 }
        if ($attempts -ne $expectedAttempts) { throw "Directory smoke $mode recorded $attempts failed attempts, expected $expectedAttempts" }
      } elseif ($reports.Count -ne 0) {
        throw "Directory smoke $mode saved an unexpected extraction report"
      }
    }
    Write-Output "Directory replacement smoke passed: $mode"
  }
} finally {
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  $resolvedScratch = [System.IO.Path]::GetFullPath($scratch)
  if (-not $resolvedScratch.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing cleanup outside the temporary root: $resolvedScratch"
  }
  Remove-Item -LiteralPath $resolvedScratch -Recurse -Force
}
