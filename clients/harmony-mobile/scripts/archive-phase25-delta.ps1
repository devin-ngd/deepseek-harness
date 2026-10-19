# Seal only changed/added owned files against the existing source archive; never traverse dependency junctions or extract private host data.
$ErrorActionPreference = 'Stop'
$phase25Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($phase25Root -ne [IO.Path]::GetFullPath('D:\workspace\agents\deepseek-harness\clients\harmony-mobile')) { throw 'Unexpected owned client root' }
$phase25Base = Get-Content -LiteralPath (Join-Path $phase25Root 'evidence/archive-v15.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
if ((Get-FileHash -LiteralPath $phase25Base.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase25Base.sha256) { throw 'Sealed v15 source base changed' }
$phase25ZipPath = 'D:\Temp\dsh-harmony-client-20261012-source-v25-delta.zip'
$phase25ManifestName = 'evidence/phase25-source-delta.json'
$phase25Predecessors = @('evidence/phase17-source-delta.json','evidence/phase17-source-supplement.json','evidence/phase18-source-delta.json','evidence/phase19-source-delta.json','evidence/phase20-source-delta.json','evidence/phase21-source-delta.json','evidence/phase22-source-delta.json','evidence/phase23-source-delta.json','evidence/phase24-source-delta.json')
foreach ($phase25ManifestPath in $phase25Predecessors) {
  $phase25Previous = Get-Content -LiteralPath (Join-Path $phase25Root $phase25ManifestPath) -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
  if ((Get-FileHash -LiteralPath $phase25Previous.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase25Previous.sha256) { throw 'Sealed predecessor archive changed' }
  foreach ($name in $phase25Previous.files.Keys) { $phase25Base.ownedHashes[$name] = $phase25Previous.files[$name] }
  $phase25Base.path = $phase25Previous.path
  $phase25Base.sha256 = $phase25Previous.sha256
}
if (Test-Path -LiteralPath $phase25ZipPath) { throw 'Preserve existing delta archive; do not overwrite it' }
$phase25Files = [ordered]@{}
function Read-Phase25OwnedDirectory([string]$directory) {
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    $relative = [IO.Path]::GetRelativePath($phase25Root, $entry.FullName).Replace('\','/')
    if ($entry.PSIsContainer) {
      if ($entry.Name -in @('.build','node_modules','.git','.hvigor','oh_modules') -or $relative -eq 'harmony/entry/build') { continue }
      Read-Phase25OwnedDirectory $entry.FullName
    } else {
      if ($entry.Name -like '.env*' -or $entry.Extension -in @('.pem','.key','.p12','.pfx') -or $relative -eq $phase25ManifestName) { continue }
      $phase25Files[$relative] = [ordered]@{path=$entry.FullName; sha256=(Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$entry.Length}
    }
  }
}
Read-Phase25OwnedDirectory $phase25Root
$phase25Removed = @($phase25Base.ownedHashes.Keys | Where-Object { -not $phase25Files.Contains($_) })
if ($phase25Removed.Count -gt 0) { throw ('Base files are absent: ' + ($phase25Removed -join ', ')) }
$phase25Changed = @($phase25Files.Keys | Where-Object { $phase25Base.ownedHashes[$_] -ne $phase25Files[$_].sha256 })
Add-Type -AssemblyName System.IO.Compression.FileSystem
$phase25Stream = [IO.File]::Open($phase25ZipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
$phase25Archive = [IO.Compression.ZipArchive]::new($phase25Stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try {
  foreach ($relative in $phase25Changed) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($phase25Archive,$phase25Files[$relative].path,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $phase25Archive.Dispose(); $phase25Stream.Dispose() }
$phase25Verify = [IO.Compression.ZipFile]::OpenRead($phase25ZipPath)
try {
  if ($phase25Verify.Entries.Count -ne $phase25Changed.Count) { throw 'Delta entry count differs' }
  foreach ($entry in $phase25Verify.Entries) {
    $stream = $entry.Open()
    try { $actual = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() }
    finally { $stream.Dispose() }
    if ($actual -ne $phase25Files[$entry.FullName].sha256) { throw ('Archived bytes differ: ' + $entry.FullName) }
    if ((Get-FileHash -LiteralPath $phase25Files[$entry.FullName].path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $actual) { throw ('Source changed during archive: ' + $entry.FullName) }
  }
} finally { $phase25Verify.Dispose() }
$phase25Manifest = [ordered]@{schema='dsh-client-source-delta/1'; path=$phase25ZipPath; sha256=(Get-FileHash -LiteralPath $phase25ZipPath -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=(Get-Item -LiteralPath $phase25ZipPath).Length; entries=$phase25Changed.Count; basePath=$phase25Base.path; baseSha256=$phase25Base.sha256; requiresBase=$true; removed=@(); allEntriesVerified=$true; dependenciesBundled=$false; unchangedEntriesOmitted=$true; archiveActivatedResources=$false; offlineSocketTrace='evidence/phase25-trace.json'; files=[ordered]@{}}
foreach ($relative in $phase25Changed) { $phase25Manifest.files[$relative] = $phase25Files[$relative].sha256 }
[IO.File]::WriteAllText((Join-Path $phase25Root $phase25ManifestName),($phase25Manifest | ConvertTo-Json -Depth 8).Replace("`r`n","`n").TrimEnd()+"`n",[Text.UTF8Encoding]::new($false))
Write-Output ('PASS: sealed verified v25 delta, ' + $phase25Changed.Count + ' entries; v15 base unchanged; no dependencies copied')
