# Seal only changed/added owned files against the existing source archive; never traverse dependency junctions or extract private host data.
$ErrorActionPreference = 'Stop'
$phase18Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($phase18Root -ne [IO.Path]::GetFullPath('D:\workspace\agents\deepseek-harness\clients\harmony-mobile')) { throw 'Unexpected owned client root' }
$phase18Base = Get-Content -LiteralPath (Join-Path $phase18Root 'evidence/archive-v15.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
if ((Get-FileHash -LiteralPath $phase18Base.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase18Base.sha256) { throw 'Sealed v15 source base changed' }
$phase18ZipPath = 'D:\Temp\dsh-harmony-client-20261012-source-v18-delta.zip'
$phase18ManifestName = 'evidence/phase18-source-delta.json'
$phase18Predecessors = @('evidence/phase17-source-delta.json','evidence/phase17-source-supplement.json')
foreach ($phase18ManifestPath in $phase18Predecessors) {
  $phase18Previous = Get-Content -LiteralPath (Join-Path $phase18Root $phase18ManifestPath) -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
  if ((Get-FileHash -LiteralPath $phase18Previous.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase18Previous.sha256) { throw 'Sealed predecessor archive changed' }
  foreach ($name in $phase18Previous.files.Keys) { $phase18Base.ownedHashes[$name] = $phase18Previous.files[$name] }
  $phase18Base.path = $phase18Previous.path
  $phase18Base.sha256 = $phase18Previous.sha256
}
if (Test-Path -LiteralPath $phase18ZipPath) { throw 'Preserve existing delta archive; do not overwrite it' }
$phase18Files = [ordered]@{}
function Read-Phase18OwnedDirectory([string]$directory) {
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    $relative = [IO.Path]::GetRelativePath($phase18Root, $entry.FullName).Replace('\','/')
    if ($entry.PSIsContainer) {
      if ($entry.Name -in @('.build','node_modules','.git','.hvigor','oh_modules') -or $relative -eq 'harmony/entry/build') { continue }
      Read-Phase18OwnedDirectory $entry.FullName
    } else {
      if ($entry.Name -like '.env*' -or $entry.Extension -in @('.pem','.key','.p12','.pfx') -or $relative -eq $phase18ManifestName) { continue }
      $phase18Files[$relative] = [ordered]@{path=$entry.FullName; sha256=(Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$entry.Length}
    }
  }
}
Read-Phase18OwnedDirectory $phase18Root
$phase18Removed = @($phase18Base.ownedHashes.Keys | Where-Object { -not $phase18Files.Contains($_) })
if ($phase18Removed.Count -gt 0) { throw ('Base files are absent: ' + ($phase18Removed -join ', ')) }
$phase18Changed = @($phase18Files.Keys | Where-Object { $phase18Base.ownedHashes[$_] -ne $phase18Files[$_].sha256 })
Add-Type -AssemblyName System.IO.Compression.FileSystem
$phase18Stream = [IO.File]::Open($phase18ZipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
$phase18Archive = [IO.Compression.ZipArchive]::new($phase18Stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try {
  foreach ($relative in $phase18Changed) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($phase18Archive,$phase18Files[$relative].path,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $phase18Archive.Dispose(); $phase18Stream.Dispose() }
$phase18Verify = [IO.Compression.ZipFile]::OpenRead($phase18ZipPath)
try {
  if ($phase18Verify.Entries.Count -ne $phase18Changed.Count) { throw 'Delta entry count differs' }
  foreach ($entry in $phase18Verify.Entries) {
    $stream = $entry.Open()
    try { $actual = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() }
    finally { $stream.Dispose() }
    if ($actual -ne $phase18Files[$entry.FullName].sha256) { throw ('Archived bytes differ: ' + $entry.FullName) }
    if ((Get-FileHash -LiteralPath $phase18Files[$entry.FullName].path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $actual) { throw ('Source changed during archive: ' + $entry.FullName) }
  }
} finally { $phase18Verify.Dispose() }
$phase18Manifest = [ordered]@{schema='dsh-client-source-delta/1'; path=$phase18ZipPath; sha256=(Get-FileHash -LiteralPath $phase18ZipPath -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=(Get-Item -LiteralPath $phase18ZipPath).Length; entries=$phase18Changed.Count; basePath=$phase18Base.path; baseSha256=$phase18Base.sha256; requiresBase=$true; removed=@(); allEntriesVerified=$true; dependenciesBundled=$false; unchangedEntriesOmitted=$true; archiveActivatedResources=$false; nativeAttemptSummary='evidence/phase18-round4-summary.json'; files=[ordered]@{}}
foreach ($relative in $phase18Changed) { $phase18Manifest.files[$relative] = $phase18Files[$relative].sha256 }
[IO.File]::WriteAllText((Join-Path $phase18Root $phase18ManifestName),($phase18Manifest | ConvertTo-Json -Depth 8).Replace("`r`n","`n").TrimEnd()+"`n",[Text.UTF8Encoding]::new($false))
Write-Output ('PASS: sealed verified v18 delta, ' + $phase18Changed.Count + ' entries; v15 base unchanged; no dependencies copied')
