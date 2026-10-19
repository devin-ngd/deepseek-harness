# Read only explicitly owned v1-v6 backups; never extract or inspect unrelated host files.
$ErrorActionPreference = 'Stop'
$phase6Project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Add-Type -AssemblyName System.IO.Compression.FileSystem
$phase6History = Get-Content -LiteralPath (Join-Path $phase6Project 'evidence/phase6-summary.json') -Raw | ConvertFrom-Json
$phase6Latest = Get-Content -LiteralPath (Join-Path $phase6Project 'evidence/archive-v6.json') -Raw | ConvertFrom-Json
$phase6Archives = @()
foreach ($phase6Version in 1..6) {
  $phase6Path = 'D:\Temp\dsh-harmony-client-20261010-source-v' + $phase6Version + '.zip'
  $phase6ExpectedHash = if ($phase6Version -eq 6) { $phase6Latest.sha256 } else { ($phase6History.continuity.archives | Where-Object version -eq $phase6Version).sha256 }
  if (!$phase6ExpectedHash -or (Get-FileHash -LiteralPath $phase6Path -Algorithm SHA256).Hash -ne $phase6ExpectedHash) { throw ('Historical snapshot changed: v' + $phase6Version) }
  $phase6Zip = [IO.Compression.ZipFile]::OpenRead($phase6Path)
  try {
    $phase6Entries = @()
    foreach ($phase6Entry in $phase6Zip.Entries) {
      if ($phase6Entry.FullName -notmatch '^(src|tests|integration|network-tests|harmony)/' -or $phase6Entry.FullName.EndsWith('/')) { continue }
      $phase6Reader = $phase6Entry.Open()
      try { $phase6Bytes = [IO.MemoryStream]::new(); $phase6Reader.CopyTo($phase6Bytes); $phase6Array = $phase6Bytes.ToArray(); $phase6Bytes.Dispose() }
      finally { $phase6Reader.Dispose() }
      $phase6Sha = [Security.Cryptography.SHA256]::Create()
      try { $phase6Hash = [Convert]::ToHexString($phase6Sha.ComputeHash($phase6Array)).ToLowerInvariant() }
      finally { $phase6Sha.Dispose() }
      $phase6Entries += [ordered]@{path=$phase6Entry.FullName; sha256=$phase6Hash; testSource=$(if ($phase6Entry.FullName -match '(\.test\.mjs|\.spec\.ts)$') { [Text.Encoding]::UTF8.GetString($phase6Array) } else { $null })}
    }
    $phase6Archives += [ordered]@{version=$phase6Version; path=$phase6Path; sha256=(Get-FileHash -LiteralPath $phase6Path -Algorithm SHA256).Hash; files=$phase6Entries}
  } finally { $phase6Zip.Dispose() }
}
$phase6Output = Join-Path $phase6Project '.build\continuity-archives.json'
[IO.File]::WriteAllText($phase6Output, ($phase6Archives | ConvertTo-Json -Depth 8).Replace("`r`n", "`n").TrimEnd() + "`n", [Text.UTF8Encoding]::new($false))
Write-Output 'PASS: read six owned v1-v6 archives; no extraction or changes'
