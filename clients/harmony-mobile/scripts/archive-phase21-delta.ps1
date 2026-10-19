# Seal only changed/added owned files against the existing source archive; never traverse dependency junctions or extract private host data.
$ErrorActionPreference = 'Stop'
$phase21Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($phase21Root -ne [IO.Path]::GetFullPath('D:\workspace\agents\deepseek-harness\clients\harmony-mobile')) { throw 'Unexpected owned client root' }
$phase21Base = Get-Content -LiteralPath (Join-Path $phase21Root 'evidence/archive-v15.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
if ((Get-FileHash -LiteralPath $phase21Base.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase21Base.sha256) { throw 'Sealed v15 source base changed' }
$phase21ZipPath = 'D:\Temp\dsh-harmony-client-20261012-source-v21-delta.zip'
$phase21ManifestName = 'evidence/phase21-source-delta.json'
$phase21Predecessors = @('evidence/phase17-source-delta.json','evidence/phase17-source-supplement.json','evidence/phase18-source-delta.json','evidence/phase19-source-delta.json','evidence/phase20-source-delta.json')
foreach ($phase21ManifestPath in $phase21Predecessors) {
  $phase21Previous = Get-Content -LiteralPath (Join-Path $phase21Root $phase21ManifestPath) -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
  if ((Get-FileHash -LiteralPath $phase21Previous.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase21Previous.sha256) { throw 'Sealed predecessor archive changed' }
  foreach ($name in $phase21Previous.files.Keys) { $phase21Base.ownedHashes[$name] = $phase21Previous.files[$name] }
  $phase21Base.path = $phase21Previous.path
  $phase21Base.sha256 = $phase21Previous.sha256
}
if (Test-Path -LiteralPath $phase21ZipPath) { throw 'Preserve existing delta archive; do not overwrite it' }
$phase21Files = [ordered]@{}
function Read-Phase21OwnedDirectory([string]$directory) {
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    $relative = [IO.Path]::GetRelativePath($phase21Root, $entry.FullName).Replace('\','/')
    if ($entry.PSIsContainer) {
      if ($entry.Name -in @('.build','node_modules','.git','.hvigor','oh_modules') -or $relative -eq 'harmony/entry/build') { continue }
      Read-Phase21OwnedDirectory $entry.FullName
    } else {
      if ($entry.Name -like '.env*' -or $entry.Extension -in @('.pem','.key','.p12','.pfx') -or $relative -eq $phase21ManifestName) { continue }
      $phase21Files[$relative] = [ordered]@{path=$entry.FullName; sha256=(Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$entry.Length}
    }
  }
}
Read-Phase21OwnedDirectory $phase21Root
$phase21Removed = @($phase21Base.ownedHashes.Keys | Where-Object { -not $phase21Files.Contains($_) })
if ($phase21Removed.Count -gt 0) { throw ('Base files are absent: ' + ($phase21Removed -join ', ')) }
$phase21Changed = @($phase21Files.Keys | Where-Object { $phase21Base.ownedHashes[$_] -ne $phase21Files[$_].sha256 })
Add-Type -AssemblyName System.IO.Compression.FileSystem
$phase21Stream = [IO.File]::Open($phase21ZipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
$phase21Archive = [IO.Compression.ZipArchive]::new($phase21Stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try {
  foreach ($relative in $phase21Changed) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($phase21Archive,$phase21Files[$relative].path,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $phase21Archive.Dispose(); $phase21Stream.Dispose() }
$phase21Verify = [IO.Compression.ZipFile]::OpenRead($phase21ZipPath)
try {
  if ($phase21Verify.Entries.Count -ne $phase21Changed.Count) { throw 'Delta entry count differs' }
  foreach ($entry in $phase21Verify.Entries) {
    $stream = $entry.Open()
    try { $actual = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() }
    finally { $stream.Dispose() }
    if ($actual -ne $phase21Files[$entry.FullName].sha256) { throw ('Archived bytes differ: ' + $entry.FullName) }
    if ((Get-FileHash -LiteralPath $phase21Files[$entry.FullName].path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $actual) { throw ('Source changed during archive: ' + $entry.FullName) }
  }
} finally { $phase21Verify.Dispose() }
$phase21Manifest = [ordered]@{schema='dsh-client-source-delta/1'; path=$phase21ZipPath; sha256=(Get-FileHash -LiteralPath $phase21ZipPath -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=(Get-Item -LiteralPath $phase21ZipPath).Length; entries=$phase21Changed.Count; basePath=$phase21Base.path; baseSha256=$phase21Base.sha256; requiresBase=$true; removed=@(); allEntriesVerified=$true; dependenciesBundled=$false; unchangedEntriesOmitted=$true; archiveActivatedResources=$false; offlineExpiryReview='evidence/phase21-expiry-review.json'; files=[ordered]@{}}
foreach ($relative in $phase21Changed) { $phase21Manifest.files[$relative] = $phase21Files[$relative].sha256 }
[IO.File]::WriteAllText((Join-Path $phase21Root $phase21ManifestName),($phase21Manifest | ConvertTo-Json -Depth 8).Replace("`r`n","`n").TrimEnd()+"`n",[Text.UTF8Encoding]::new($false))
Write-Output ('PASS: sealed verified v21 delta, ' + $phase21Changed.Count + ' entries; v15 base unchanged; no dependencies copied')
