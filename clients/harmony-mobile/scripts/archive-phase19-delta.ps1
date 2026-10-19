# Seal only changed/added owned files against the existing source archive; never traverse dependency junctions or extract private host data.
$ErrorActionPreference = 'Stop'
$phase19Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($phase19Root -ne [IO.Path]::GetFullPath('D:\workspace\agents\deepseek-harness\clients\harmony-mobile')) { throw 'Unexpected owned client root' }
$phase19Base = Get-Content -LiteralPath (Join-Path $phase19Root 'evidence/archive-v15.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
if ((Get-FileHash -LiteralPath $phase19Base.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase19Base.sha256) { throw 'Sealed v15 source base changed' }
$phase19ZipPath = 'D:\Temp\dsh-harmony-client-20261012-source-v19-delta.zip'
$phase19ManifestName = 'evidence/phase19-source-delta.json'
$phase19Predecessors = @('evidence/phase17-source-delta.json','evidence/phase17-source-supplement.json','evidence/phase18-source-delta.json')
foreach ($phase19ManifestPath in $phase19Predecessors) {
  $phase19Previous = Get-Content -LiteralPath (Join-Path $phase19Root $phase19ManifestPath) -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
  if ((Get-FileHash -LiteralPath $phase19Previous.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase19Previous.sha256) { throw 'Sealed predecessor archive changed' }
  foreach ($name in $phase19Previous.files.Keys) { $phase19Base.ownedHashes[$name] = $phase19Previous.files[$name] }
  $phase19Base.path = $phase19Previous.path
  $phase19Base.sha256 = $phase19Previous.sha256
}
if (Test-Path -LiteralPath $phase19ZipPath) { throw 'Preserve existing delta archive; do not overwrite it' }
$phase19Files = [ordered]@{}
function Read-Phase19OwnedDirectory([string]$directory) {
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    $relative = [IO.Path]::GetRelativePath($phase19Root, $entry.FullName).Replace('\','/')
    if ($entry.PSIsContainer) {
      if ($entry.Name -in @('.build','node_modules','.git','.hvigor','oh_modules') -or $relative -eq 'harmony/entry/build') { continue }
      Read-Phase19OwnedDirectory $entry.FullName
    } else {
      if ($entry.Name -like '.env*' -or $entry.Extension -in @('.pem','.key','.p12','.pfx') -or $relative -eq $phase19ManifestName) { continue }
      $phase19Files[$relative] = [ordered]@{path=$entry.FullName; sha256=(Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$entry.Length}
    }
  }
}
Read-Phase19OwnedDirectory $phase19Root
$phase19Removed = @($phase19Base.ownedHashes.Keys | Where-Object { -not $phase19Files.Contains($_) })
if ($phase19Removed.Count -gt 0) { throw ('Base files are absent: ' + ($phase19Removed -join ', ')) }
$phase19Changed = @($phase19Files.Keys | Where-Object { $phase19Base.ownedHashes[$_] -ne $phase19Files[$_].sha256 })
Add-Type -AssemblyName System.IO.Compression.FileSystem
$phase19Stream = [IO.File]::Open($phase19ZipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
$phase19Archive = [IO.Compression.ZipArchive]::new($phase19Stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try {
  foreach ($relative in $phase19Changed) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($phase19Archive,$phase19Files[$relative].path,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $phase19Archive.Dispose(); $phase19Stream.Dispose() }
$phase19Verify = [IO.Compression.ZipFile]::OpenRead($phase19ZipPath)
try {
  if ($phase19Verify.Entries.Count -ne $phase19Changed.Count) { throw 'Delta entry count differs' }
  foreach ($entry in $phase19Verify.Entries) {
    $stream = $entry.Open()
    try { $actual = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() }
    finally { $stream.Dispose() }
    if ($actual -ne $phase19Files[$entry.FullName].sha256) { throw ('Archived bytes differ: ' + $entry.FullName) }
    if ((Get-FileHash -LiteralPath $phase19Files[$entry.FullName].path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $actual) { throw ('Source changed during archive: ' + $entry.FullName) }
  }
} finally { $phase19Verify.Dispose() }
$phase19Manifest = [ordered]@{schema='dsh-client-source-delta/1'; path=$phase19ZipPath; sha256=(Get-FileHash -LiteralPath $phase19ZipPath -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=(Get-Item -LiteralPath $phase19ZipPath).Length; entries=$phase19Changed.Count; basePath=$phase19Base.path; baseSha256=$phase19Base.sha256; requiresBase=$true; removed=@(); allEntriesVerified=$true; dependenciesBundled=$false; unchangedEntriesOmitted=$true; archiveActivatedResources=$false; offlineAuditSummary='evidence/phase19-offline-review.json'; files=[ordered]@{}}
foreach ($relative in $phase19Changed) { $phase19Manifest.files[$relative] = $phase19Files[$relative].sha256 }
[IO.File]::WriteAllText((Join-Path $phase19Root $phase19ManifestName),($phase19Manifest | ConvertTo-Json -Depth 8).Replace("`r`n","`n").TrimEnd()+"`n",[Text.UTF8Encoding]::new($false))
Write-Output ('PASS: sealed verified v19 delta, ' + $phase19Changed.Count + ' entries; v15 base unchanged; no dependencies copied')
