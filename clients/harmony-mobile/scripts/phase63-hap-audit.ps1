param([Parameter(Mandatory=$true)][string]$Candidate,[Parameter(Mandatory=$true)][string]$Previous,[Parameter(Mandatory=$true)][string]$Report)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Read-PublicHap([string]$Path) {
  $archive = [IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $rows = @()
    foreach ($entry in $archive.Entries) {
      $stream=$entry.Open(); $digest=[Security.Cryptography.SHA256]::Create()
      try { $hash=[BitConverter]::ToString($digest.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } finally { $digest.Dispose(); $stream.Dispose() }
      $rows += [pscustomobject]@{ path=$entry.FullName; bytes=$entry.Length; sha256=$hash }
    }
    if (@($rows | Group-Object path | Where-Object Count -gt 1).Count -ne 0) { throw 'Duplicate HAP entry' }
    $reader=[IO.StreamReader]::new($archive.GetEntry('module.json').Open())
    try { $module=$reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    return [pscustomobject]@{ entries=$rows; app=$module.app; permissions=@($module.module.requestPermissions | ForEach-Object name) }
  } finally { $archive.Dispose() }
}
$before=Read-PublicHap $Previous; $after=Read-PublicHap $Candidate
if ($after.app.bundleName -ne $before.app.bundleName -or $after.app.versionCode -ne $before.app.versionCode -or $after.app.versionName -ne $before.app.versionName) { throw 'Application identity or version changed' }
if (($after.permissions | ConvertTo-Json -Compress) -ne ($before.permissions | ConvertTo-Json -Compress)) { throw 'Permissions changed' }
$old=@{}; foreach ($entry in $before.entries) { $old[$entry.path]=$entry.sha256 }
$changed=@($after.entries | Where-Object { -not $old.ContainsKey($_.path) -or $old[$_.path] -ne $_.sha256 } | ForEach-Object path)
$result=[ordered]@{ at=[DateTime]::UtcNow.ToString('o'); unsigned=$true; candidate=$Candidate; previous=$Previous; bundleName=$after.app.bundleName; versionCode=$after.app.versionCode; versionName=$after.app.versionName; permissions=$after.permissions; permissionDelta=@(); changedEntries=$changed; candidateEntries=$after.entries; previousEntryCount=$before.entries.Count; signed=$false; installed=$false; identityKeysRead=$false; nativeKeyOperationsExecuted=$false }
[IO.File]::WriteAllText($Report,(($result | ConvertTo-Json -Depth 8)+"`n"),[Text.UTF8Encoding]::new($false))
Write-Output ('PASS: unsigned payload identity and permissions retained; changed entries=' + $changed.Count)
