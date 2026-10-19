# Seal only changed/added owned files against the existing source archive; never traverse dependency junctions or extract private host data.
$ErrorActionPreference = 'Stop'
$phase20Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($phase20Root -ne [IO.Path]::GetFullPath('D:\workspace\agents\deepseek-harness\clients\harmony-mobile')) { throw 'Unexpected owned client root' }
$phase20Base = Get-Content -LiteralPath (Join-Path $phase20Root 'evidence/archive-v15.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
if ((Get-FileHash -LiteralPath $phase20Base.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase20Base.sha256) { throw 'Sealed v15 source base changed' }
$phase20ZipPath = 'D:\Temp\dsh-harmony-client-20261012-source-v20-delta.zip'
$phase20ManifestName = 'evidence/phase20-source-delta.json'
$phase20Predecessors = @('evidence/phase17-source-delta.json','evidence/phase17-source-supplement.json','evidence/phase18-source-delta.json','evidence/phase19-source-delta.json')
foreach ($phase20ManifestPath in $phase20Predecessors) {
  $phase20Previous = Get-Content -LiteralPath (Join-Path $phase20Root $phase20ManifestPath) -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
  if ((Get-FileHash -LiteralPath $phase20Previous.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase20Previous.sha256) { throw 'Sealed predecessor archive changed' }
  foreach ($name in $phase20Previous.files.Keys) { $phase20Base.ownedHashes[$name] = $phase20Previous.files[$name] }
  $phase20Base.path = $phase20Previous.path
  $phase20Base.sha256 = $phase20Previous.sha256
}
if (Test-Path -LiteralPath $phase20ZipPath) { throw 'Preserve existing delta archive; do not overwrite it' }
$phase20Files = [ordered]@{}
function Read-Phase20OwnedDirectory([string]$directory) {
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    $relative = [IO.Path]::GetRelativePath($phase20Root, $entry.FullName).Replace('\','/')
    if ($entry.PSIsContainer) {
      if ($entry.Name -in @('.build','node_modules','.git','.hvigor','oh_modules') -or $relative -eq 'harmony/entry/build') { continue }
      Read-Phase20OwnedDirectory $entry.FullName
    } else {
      if ($entry.Name -like '.env*' -or $entry.Extension -in @('.pem','.key','.p12','.pfx') -or $relative -eq $phase20ManifestName) { continue }
      $phase20Files[$relative] = [ordered]@{path=$entry.FullName; sha256=(Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$entry.Length}
    }
  }
}
Read-Phase20OwnedDirectory $phase20Root
$phase20Removed = @($phase20Base.ownedHashes.Keys | Where-Object { -not $phase20Files.Contains($_) })
if ($phase20Removed.Count -gt 0) { throw ('Base files are absent: ' + ($phase20Removed -join ', ')) }
$phase20Changed = @($phase20Files.Keys | Where-Object { $phase20Base.ownedHashes[$_] -ne $phase20Files[$_].sha256 })
Add-Type -AssemblyName System.IO.Compression.FileSystem
$phase20Stream = [IO.File]::Open($phase20ZipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
$phase20Archive = [IO.Compression.ZipArchive]::new($phase20Stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try {
  foreach ($relative in $phase20Changed) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($phase20Archive,$phase20Files[$relative].path,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $phase20Archive.Dispose(); $phase20Stream.Dispose() }
$phase20Verify = [IO.Compression.ZipFile]::OpenRead($phase20ZipPath)
try {
  if ($phase20Verify.Entries.Count -ne $phase20Changed.Count) { throw 'Delta entry count differs' }
  foreach ($entry in $phase20Verify.Entries) {
    $stream = $entry.Open()
    try { $actual = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() }
    finally { $stream.Dispose() }
    if ($actual -ne $phase20Files[$entry.FullName].sha256) { throw ('Archived bytes differ: ' + $entry.FullName) }
    if ((Get-FileHash -LiteralPath $phase20Files[$entry.FullName].path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $actual) { throw ('Source changed during archive: ' + $entry.FullName) }
  }
} finally { $phase20Verify.Dispose() }
$phase20Manifest = [ordered]@{schema='dsh-client-source-delta/1'; path=$phase20ZipPath; sha256=(Get-FileHash -LiteralPath $phase20ZipPath -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=(Get-Item -LiteralPath $phase20ZipPath).Length; entries=$phase20Changed.Count; basePath=$phase20Base.path; baseSha256=$phase20Base.sha256; requiresBase=$true; removed=@(); allEntriesVerified=$true; dependenciesBundled=$false; unchangedEntriesOmitted=$true; archiveActivatedResources=$false; nativeAttemptSummary='evidence/phase20-round5-summary.json'; files=[ordered]@{}}
foreach ($relative in $phase20Changed) { $phase20Manifest.files[$relative] = $phase20Files[$relative].sha256 }
[IO.File]::WriteAllText((Join-Path $phase20Root $phase20ManifestName),($phase20Manifest | ConvertTo-Json -Depth 8).Replace("`r`n","`n").TrimEnd()+"`n",[Text.UTF8Encoding]::new($false))
Write-Output ('PASS: sealed verified v20 delta, ' + $phase20Changed.Count + ' entries; v15 base unchanged; no dependencies copied')
