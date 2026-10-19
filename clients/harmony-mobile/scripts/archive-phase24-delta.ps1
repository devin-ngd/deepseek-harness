# Seal only changed/added owned files against the existing source archive; never traverse dependency junctions or extract private host data.
$ErrorActionPreference = 'Stop'
$phase24Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($phase24Root -ne [IO.Path]::GetFullPath('D:\workspace\agents\deepseek-harness\clients\harmony-mobile')) { throw 'Unexpected owned client root' }
$phase24Base = Get-Content -LiteralPath (Join-Path $phase24Root 'evidence/archive-v15.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
if ((Get-FileHash -LiteralPath $phase24Base.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase24Base.sha256) { throw 'Sealed v15 source base changed' }
$phase24ZipPath = 'D:\Temp\dsh-harmony-client-20261012-source-v24-delta.zip'
$phase24ManifestName = 'evidence/phase24-source-delta.json'
$phase24Predecessors = @('evidence/phase17-source-delta.json','evidence/phase17-source-supplement.json','evidence/phase18-source-delta.json','evidence/phase19-source-delta.json','evidence/phase20-source-delta.json','evidence/phase21-source-delta.json','evidence/phase22-source-delta.json','evidence/phase23-source-delta.json')
foreach ($phase24ManifestPath in $phase24Predecessors) {
  $phase24Previous = Get-Content -LiteralPath (Join-Path $phase24Root $phase24ManifestPath) -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
  if ((Get-FileHash -LiteralPath $phase24Previous.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase24Previous.sha256) { throw 'Sealed predecessor archive changed' }
  foreach ($name in $phase24Previous.files.Keys) { $phase24Base.ownedHashes[$name] = $phase24Previous.files[$name] }
  $phase24Base.path = $phase24Previous.path
  $phase24Base.sha256 = $phase24Previous.sha256
}
if (Test-Path -LiteralPath $phase24ZipPath) { throw 'Preserve existing delta archive; do not overwrite it' }
$phase24Files = [ordered]@{}
function Read-Phase24OwnedDirectory([string]$directory) {
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    $relative = [IO.Path]::GetRelativePath($phase24Root, $entry.FullName).Replace('\','/')
    if ($entry.PSIsContainer) {
      if ($entry.Name -in @('.build','node_modules','.git','.hvigor','oh_modules') -or $relative -eq 'harmony/entry/build') { continue }
      Read-Phase24OwnedDirectory $entry.FullName
    } else {
      if ($entry.Name -like '.env*' -or $entry.Extension -in @('.pem','.key','.p12','.pfx') -or $relative -eq $phase24ManifestName) { continue }
      $phase24Files[$relative] = [ordered]@{path=$entry.FullName; sha256=(Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$entry.Length}
    }
  }
}
Read-Phase24OwnedDirectory $phase24Root
$phase24Removed = @($phase24Base.ownedHashes.Keys | Where-Object { -not $phase24Files.Contains($_) })
if ($phase24Removed.Count -gt 0) { throw ('Base files are absent: ' + ($phase24Removed -join ', ')) }
$phase24Changed = @($phase24Files.Keys | Where-Object { $phase24Base.ownedHashes[$_] -ne $phase24Files[$_].sha256 })
Add-Type -AssemblyName System.IO.Compression.FileSystem
$phase24Stream = [IO.File]::Open($phase24ZipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
$phase24Archive = [IO.Compression.ZipArchive]::new($phase24Stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try {
  foreach ($relative in $phase24Changed) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($phase24Archive,$phase24Files[$relative].path,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $phase24Archive.Dispose(); $phase24Stream.Dispose() }
$phase24Verify = [IO.Compression.ZipFile]::OpenRead($phase24ZipPath)
try {
  if ($phase24Verify.Entries.Count -ne $phase24Changed.Count) { throw 'Delta entry count differs' }
  foreach ($entry in $phase24Verify.Entries) {
    $stream = $entry.Open()
    try { $actual = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() }
    finally { $stream.Dispose() }
    if ($actual -ne $phase24Files[$entry.FullName].sha256) { throw ('Archived bytes differ: ' + $entry.FullName) }
    if ((Get-FileHash -LiteralPath $phase24Files[$entry.FullName].path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $actual) { throw ('Source changed during archive: ' + $entry.FullName) }
  }
} finally { $phase24Verify.Dispose() }
$phase24Manifest = [ordered]@{schema='dsh-client-source-delta/1'; path=$phase24ZipPath; sha256=(Get-FileHash -LiteralPath $phase24ZipPath -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=(Get-Item -LiteralPath $phase24ZipPath).Length; entries=$phase24Changed.Count; basePath=$phase24Base.path; baseSha256=$phase24Base.sha256; requiresBase=$true; removed=@(); allEntriesVerified=$true; dependenciesBundled=$false; unchangedEntriesOmitted=$true; archiveActivatedResources=$false; nativeAttemptSummary='evidence/phase24-summary.json'; files=[ordered]@{}}
foreach ($relative in $phase24Changed) { $phase24Manifest.files[$relative] = $phase24Files[$relative].sha256 }
[IO.File]::WriteAllText((Join-Path $phase24Root $phase24ManifestName),($phase24Manifest | ConvertTo-Json -Depth 8).Replace("`r`n","`n").TrimEnd()+"`n",[Text.UTF8Encoding]::new($false))
Write-Output ('PASS: sealed verified v24 delta, ' + $phase24Changed.Count + ' entries; v15 base unchanged; no dependencies copied')
