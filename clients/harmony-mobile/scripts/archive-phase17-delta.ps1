param([switch]$Supplement)
# Seal only changed/added owned files against the existing source archive; never traverse dependency junctions or extract private host data.
$ErrorActionPreference = 'Stop'
$phase17Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($phase17Root -ne [IO.Path]::GetFullPath('D:\workspace\agents\deepseek-harness\clients\harmony-mobile')) { throw 'Unexpected owned client root' }
$phase17Base = Get-Content -LiteralPath (Join-Path $phase17Root 'evidence/archive-v15.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
if ((Get-FileHash -LiteralPath $phase17Base.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase17Base.sha256) { throw 'Sealed v15 source base changed' }
$phase17ZipPath = 'D:\Temp\dsh-harmony-client-20261012-source-v17-delta.zip'
$phase17ManifestName = 'evidence/phase17-source-delta.json'
if ($Supplement) {
  $phase17Delta = Get-Content -LiteralPath (Join-Path $phase17Root $phase17ManifestName) -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
  if ((Get-FileHash -LiteralPath $phase17Delta.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase17Delta.sha256) { throw 'Sealed first delta changed' }
  foreach ($name in $phase17Delta.files.Keys) { $phase17Base.ownedHashes[$name] = $phase17Delta.files[$name] }
  $phase17Base.path = $phase17Delta.path
  $phase17Base.sha256 = $phase17Delta.sha256
  $phase17ZipPath = 'D:\Temp\dsh-harmony-client-20261012-source-v17-supplement.zip'
  $phase17ManifestName = 'evidence/phase17-source-supplement.json'
}
if (Test-Path -LiteralPath $phase17ZipPath) { throw 'Preserve existing delta archive; do not overwrite it' }
$phase17Files = [ordered]@{}
function Read-Phase17OwnedDirectory([string]$directory) {
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    $relative = [IO.Path]::GetRelativePath($phase17Root, $entry.FullName).Replace('\','/')
    if ($entry.PSIsContainer) {
      if ($entry.Name -in @('.build','node_modules','.git','.hvigor','oh_modules') -or $relative -eq 'harmony/entry/build') { continue }
      Read-Phase17OwnedDirectory $entry.FullName
    } else {
      if ($entry.Name -like '.env*' -or $entry.Extension -in @('.pem','.key','.p12','.pfx') -or $relative -eq $phase17ManifestName) { continue }
      $phase17Files[$relative] = [ordered]@{path=$entry.FullName; sha256=(Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$entry.Length}
    }
  }
}
Read-Phase17OwnedDirectory $phase17Root
$phase17Removed = @($phase17Base.ownedHashes.Keys | Where-Object { -not $phase17Files.Contains($_) })
if ($phase17Removed.Count -gt 0) { throw ('Base files are absent: ' + ($phase17Removed -join ', ')) }
$phase17Changed = @($phase17Files.Keys | Where-Object { $phase17Base.ownedHashes[$_] -ne $phase17Files[$_].sha256 })
Add-Type -AssemblyName System.IO.Compression.FileSystem
$phase17Stream = [IO.File]::Open($phase17ZipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
$phase17Archive = [IO.Compression.ZipArchive]::new($phase17Stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try {
  foreach ($relative in $phase17Changed) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($phase17Archive,$phase17Files[$relative].path,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $phase17Archive.Dispose(); $phase17Stream.Dispose() }
$phase17Verify = [IO.Compression.ZipFile]::OpenRead($phase17ZipPath)
try {
  if ($phase17Verify.Entries.Count -ne $phase17Changed.Count) { throw 'Delta entry count differs' }
  foreach ($entry in $phase17Verify.Entries) {
    $stream = $entry.Open()
    try { $actual = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() }
    finally { $stream.Dispose() }
    if ($actual -ne $phase17Files[$entry.FullName].sha256) { throw ('Archived bytes differ: ' + $entry.FullName) }
    if ((Get-FileHash -LiteralPath $phase17Files[$entry.FullName].path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $actual) { throw ('Source changed during archive: ' + $entry.FullName) }
  }
} finally { $phase17Verify.Dispose() }
$phase17Manifest = [ordered]@{schema='dsh-client-source-delta/1'; path=$phase17ZipPath; sha256=(Get-FileHash -LiteralPath $phase17ZipPath -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=(Get-Item -LiteralPath $phase17ZipPath).Length; entries=$phase17Changed.Count; basePath=$phase17Base.path; baseSha256=$phase17Base.sha256; requiresBase=$true; removed=@(); allEntriesVerified=$true; dependenciesBundled=$false; unchangedEntriesOmitted=$true; nativeActivated=$false; files=[ordered]@{}}
foreach ($relative in $phase17Changed) { $phase17Manifest.files[$relative] = $phase17Files[$relative].sha256 }
[IO.File]::WriteAllText((Join-Path $phase17Root $phase17ManifestName),($phase17Manifest | ConvertTo-Json -Depth 8).Replace("`r`n","`n").TrimEnd()+"`n",[Text.UTF8Encoding]::new($false))
Write-Output ('PASS: sealed verified v17 delta, ' + $phase17Changed.Count + ' entries; v15 base unchanged; no dependencies copied')
