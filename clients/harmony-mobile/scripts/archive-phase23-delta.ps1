# Seal only changed/added owned files against the existing source archive; never traverse dependency junctions or extract private host data.
$ErrorActionPreference = 'Stop'
$phase23Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($phase23Root -ne [IO.Path]::GetFullPath('D:\workspace\agents\deepseek-harness\clients\harmony-mobile')) { throw 'Unexpected owned client root' }
$phase23Base = Get-Content -LiteralPath (Join-Path $phase23Root 'evidence/archive-v15.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
if ((Get-FileHash -LiteralPath $phase23Base.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase23Base.sha256) { throw 'Sealed v15 source base changed' }
$phase23ZipPath = 'D:\Temp\dsh-harmony-client-20261012-source-v23-delta.zip'
$phase23ManifestName = 'evidence/phase23-source-delta.json'
$phase23Predecessors = @('evidence/phase17-source-delta.json','evidence/phase17-source-supplement.json','evidence/phase18-source-delta.json','evidence/phase19-source-delta.json','evidence/phase20-source-delta.json','evidence/phase21-source-delta.json','evidence/phase22-source-delta.json')
foreach ($phase23ManifestPath in $phase23Predecessors) {
  $phase23Previous = Get-Content -LiteralPath (Join-Path $phase23Root $phase23ManifestPath) -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
  if ((Get-FileHash -LiteralPath $phase23Previous.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase23Previous.sha256) { throw 'Sealed predecessor archive changed' }
  foreach ($name in $phase23Previous.files.Keys) { $phase23Base.ownedHashes[$name] = $phase23Previous.files[$name] }
  $phase23Base.path = $phase23Previous.path
  $phase23Base.sha256 = $phase23Previous.sha256
}
if (Test-Path -LiteralPath $phase23ZipPath) { throw 'Preserve existing delta archive; do not overwrite it' }
$phase23Files = [ordered]@{}
function Read-Phase23OwnedDirectory([string]$directory) {
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    $relative = [IO.Path]::GetRelativePath($phase23Root, $entry.FullName).Replace('\','/')
    if ($entry.PSIsContainer) {
      if ($entry.Name -in @('.build','node_modules','.git','.hvigor','oh_modules') -or $relative -eq 'harmony/entry/build') { continue }
      Read-Phase23OwnedDirectory $entry.FullName
    } else {
      if ($entry.Name -like '.env*' -or $entry.Extension -in @('.pem','.key','.p12','.pfx') -or $relative -eq $phase23ManifestName) { continue }
      $phase23Files[$relative] = [ordered]@{path=$entry.FullName; sha256=(Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$entry.Length}
    }
  }
}
Read-Phase23OwnedDirectory $phase23Root
$phase23Removed = @($phase23Base.ownedHashes.Keys | Where-Object { -not $phase23Files.Contains($_) })
if ($phase23Removed.Count -gt 0) { throw ('Base files are absent: ' + ($phase23Removed -join ', ')) }
$phase23Changed = @($phase23Files.Keys | Where-Object { $phase23Base.ownedHashes[$_] -ne $phase23Files[$_].sha256 })
Add-Type -AssemblyName System.IO.Compression.FileSystem
$phase23Stream = [IO.File]::Open($phase23ZipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
$phase23Archive = [IO.Compression.ZipArchive]::new($phase23Stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try {
  foreach ($relative in $phase23Changed) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($phase23Archive,$phase23Files[$relative].path,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $phase23Archive.Dispose(); $phase23Stream.Dispose() }
$phase23Verify = [IO.Compression.ZipFile]::OpenRead($phase23ZipPath)
try {
  if ($phase23Verify.Entries.Count -ne $phase23Changed.Count) { throw 'Delta entry count differs' }
  foreach ($entry in $phase23Verify.Entries) {
    $stream = $entry.Open()
    try { $actual = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() }
    finally { $stream.Dispose() }
    if ($actual -ne $phase23Files[$entry.FullName].sha256) { throw ('Archived bytes differ: ' + $entry.FullName) }
    if ((Get-FileHash -LiteralPath $phase23Files[$entry.FullName].path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $actual) { throw ('Source changed during archive: ' + $entry.FullName) }
  }
} finally { $phase23Verify.Dispose() }
$phase23Manifest = [ordered]@{schema='dsh-client-source-delta/1'; path=$phase23ZipPath; sha256=(Get-FileHash -LiteralPath $phase23ZipPath -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=(Get-Item -LiteralPath $phase23ZipPath).Length; entries=$phase23Changed.Count; basePath=$phase23Base.path; baseSha256=$phase23Base.sha256; requiresBase=$true; removed=@(); allEntriesVerified=$true; dependenciesBundled=$false; unchangedEntriesOmitted=$true; archiveActivatedResources=$false; offlineClockReview='evidence/phase23-clock-review.json'; files=[ordered]@{}}
foreach ($relative in $phase23Changed) { $phase23Manifest.files[$relative] = $phase23Files[$relative].sha256 }
[IO.File]::WriteAllText((Join-Path $phase23Root $phase23ManifestName),($phase23Manifest | ConvertTo-Json -Depth 8).Replace("`r`n","`n").TrimEnd()+"`n",[Text.UTF8Encoding]::new($false))
Write-Output ('PASS: sealed verified v23 delta, ' + $phase23Changed.Count + ' entries; v15 base unchanged; no dependencies copied')
