# Seal only changed/added owned files against the existing source archive; never traverse dependency junctions or extract private host data.
$ErrorActionPreference = 'Stop'
$phase22Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($phase22Root -ne [IO.Path]::GetFullPath('D:\workspace\agents\deepseek-harness\clients\harmony-mobile')) { throw 'Unexpected owned client root' }
$phase22Base = Get-Content -LiteralPath (Join-Path $phase22Root 'evidence/archive-v15.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
if ((Get-FileHash -LiteralPath $phase22Base.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase22Base.sha256) { throw 'Sealed v15 source base changed' }
$phase22ZipPath = 'D:\Temp\dsh-harmony-client-20261012-source-v22-delta.zip'
$phase22ManifestName = 'evidence/phase22-source-delta.json'
$phase22Predecessors = @('evidence/phase17-source-delta.json','evidence/phase17-source-supplement.json','evidence/phase18-source-delta.json','evidence/phase19-source-delta.json','evidence/phase20-source-delta.json','evidence/phase21-source-delta.json')
foreach ($phase22ManifestPath in $phase22Predecessors) {
  $phase22Previous = Get-Content -LiteralPath (Join-Path $phase22Root $phase22ManifestPath) -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
  if ((Get-FileHash -LiteralPath $phase22Previous.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase22Previous.sha256) { throw 'Sealed predecessor archive changed' }
  foreach ($name in $phase22Previous.files.Keys) { $phase22Base.ownedHashes[$name] = $phase22Previous.files[$name] }
  $phase22Base.path = $phase22Previous.path
  $phase22Base.sha256 = $phase22Previous.sha256
}
if (Test-Path -LiteralPath $phase22ZipPath) { throw 'Preserve existing delta archive; do not overwrite it' }
$phase22Files = [ordered]@{}
function Read-Phase22OwnedDirectory([string]$directory) {
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    $relative = [IO.Path]::GetRelativePath($phase22Root, $entry.FullName).Replace('\','/')
    if ($entry.PSIsContainer) {
      if ($entry.Name -in @('.build','node_modules','.git','.hvigor','oh_modules') -or $relative -eq 'harmony/entry/build') { continue }
      Read-Phase22OwnedDirectory $entry.FullName
    } else {
      if ($entry.Name -like '.env*' -or $entry.Extension -in @('.pem','.key','.p12','.pfx') -or $relative -eq $phase22ManifestName) { continue }
      $phase22Files[$relative] = [ordered]@{path=$entry.FullName; sha256=(Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$entry.Length}
    }
  }
}
Read-Phase22OwnedDirectory $phase22Root
$phase22Removed = @($phase22Base.ownedHashes.Keys | Where-Object { -not $phase22Files.Contains($_) })
if ($phase22Removed.Count -gt 0) { throw ('Base files are absent: ' + ($phase22Removed -join ', ')) }
$phase22Changed = @($phase22Files.Keys | Where-Object { $phase22Base.ownedHashes[$_] -ne $phase22Files[$_].sha256 })
Add-Type -AssemblyName System.IO.Compression.FileSystem
$phase22Stream = [IO.File]::Open($phase22ZipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
$phase22Archive = [IO.Compression.ZipArchive]::new($phase22Stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try {
  foreach ($relative in $phase22Changed) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($phase22Archive,$phase22Files[$relative].path,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $phase22Archive.Dispose(); $phase22Stream.Dispose() }
$phase22Verify = [IO.Compression.ZipFile]::OpenRead($phase22ZipPath)
try {
  if ($phase22Verify.Entries.Count -ne $phase22Changed.Count) { throw 'Delta entry count differs' }
  foreach ($entry in $phase22Verify.Entries) {
    $stream = $entry.Open()
    try { $actual = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() }
    finally { $stream.Dispose() }
    if ($actual -ne $phase22Files[$entry.FullName].sha256) { throw ('Archived bytes differ: ' + $entry.FullName) }
    if ((Get-FileHash -LiteralPath $phase22Files[$entry.FullName].path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $actual) { throw ('Source changed during archive: ' + $entry.FullName) }
  }
} finally { $phase22Verify.Dispose() }
$phase22Manifest = [ordered]@{schema='dsh-client-source-delta/1'; path=$phase22ZipPath; sha256=(Get-FileHash -LiteralPath $phase22ZipPath -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=(Get-Item -LiteralPath $phase22ZipPath).Length; entries=$phase22Changed.Count; basePath=$phase22Base.path; baseSha256=$phase22Base.sha256; requiresBase=$true; removed=@(); allEntriesVerified=$true; dependenciesBundled=$false; unchangedEntriesOmitted=$true; archiveActivatedResources=$false; nativeAttemptSummary='evidence/phase22-round6-summary.json'; files=[ordered]@{}}
foreach ($relative in $phase22Changed) { $phase22Manifest.files[$relative] = $phase22Files[$relative].sha256 }
[IO.File]::WriteAllText((Join-Path $phase22Root $phase22ManifestName),($phase22Manifest | ConvertTo-Json -Depth 8).Replace("`r`n","`n").TrimEnd()+"`n",[Text.UTF8Encoding]::new($false))
Write-Output ('PASS: sealed verified v22 delta, ' + $phase22Changed.Count + ' entries; v15 base unchanged; no dependencies copied')
