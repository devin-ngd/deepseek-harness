# Seal only changed/added owned files against the existing source archive; never traverse dependency junctions or extract private host data.
$ErrorActionPreference = 'Stop'
$phase26Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($phase26Root -ne [IO.Path]::GetFullPath('D:\workspace\agents\deepseek-harness\clients\harmony-mobile')) { throw 'Unexpected owned client root' }
$phase26Base = Get-Content -LiteralPath (Join-Path $phase26Root 'evidence/archive-v15.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
if ((Get-FileHash -LiteralPath $phase26Base.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase26Base.sha256) { throw 'Sealed v15 source base changed' }
$phase26ZipPath = 'D:\Temp\dsh-harmony-client-20261013-source-v26-delta.zip'
$phase26ManifestName = 'evidence/phase26-source-delta.json'
$phase26Predecessors = @('evidence/phase17-source-delta.json','evidence/phase17-source-supplement.json','evidence/phase18-source-delta.json','evidence/phase19-source-delta.json','evidence/phase20-source-delta.json','evidence/phase21-source-delta.json','evidence/phase22-source-delta.json','evidence/phase23-source-delta.json','evidence/phase24-source-delta.json','evidence/phase25-source-delta.json','evidence/phase25-source-supplement.json')
foreach ($phase26ManifestPath in $phase26Predecessors) {
  $phase26Previous = Get-Content -LiteralPath (Join-Path $phase26Root $phase26ManifestPath) -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
  if ((Get-FileHash -LiteralPath $phase26Previous.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $phase26Previous.sha256) { throw 'Sealed predecessor archive changed' }
  foreach ($name in $phase26Previous.files.Keys) { $phase26Base.ownedHashes[$name] = $phase26Previous.files[$name] }
  $phase26Base.path = $phase26Previous.path
  $phase26Base.sha256 = $phase26Previous.sha256
}
if (Test-Path -LiteralPath $phase26ZipPath) { throw 'Preserve existing delta archive; do not overwrite it' }
$phase26Files = [ordered]@{}
function Read-Phase26OwnedDirectory([string]$directory) {
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    $relative = [IO.Path]::GetRelativePath($phase26Root, $entry.FullName).Replace('\','/')
    if ($entry.PSIsContainer) {
      if ($entry.Name -in @('.build','node_modules','.git','.hvigor','oh_modules') -or $relative -eq 'harmony/entry/build') { continue }
      Read-Phase26OwnedDirectory $entry.FullName
    } else {
      if ($entry.Name -like '.env*' -or $entry.Extension -in @('.pem','.key','.p12','.pfx') -or $relative -eq $phase26ManifestName) { continue }
      $phase26Files[$relative] = [ordered]@{path=$entry.FullName; sha256=(Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$entry.Length}
    }
  }
}
Read-Phase26OwnedDirectory $phase26Root
$phase26Removed = @($phase26Base.ownedHashes.Keys | Where-Object { -not $phase26Files.Contains($_) })
if ($phase26Removed.Count -gt 0) { throw ('Base files are absent: ' + ($phase26Removed -join ', ')) }
$phase26Changed = @($phase26Files.Keys | Where-Object { $phase26Base.ownedHashes[$_] -ne $phase26Files[$_].sha256 })
Add-Type -AssemblyName System.IO.Compression.FileSystem
$phase26Stream = [IO.File]::Open($phase26ZipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
$phase26Archive = [IO.Compression.ZipArchive]::new($phase26Stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try {
  foreach ($relative in $phase26Changed) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($phase26Archive,$phase26Files[$relative].path,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $phase26Archive.Dispose(); $phase26Stream.Dispose() }
$phase26Verify = [IO.Compression.ZipFile]::OpenRead($phase26ZipPath)
try {
  if ($phase26Verify.Entries.Count -ne $phase26Changed.Count) { throw 'Delta entry count differs' }
  foreach ($entry in $phase26Verify.Entries) {
    $stream = $entry.Open()
    try { $actual = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() }
    finally { $stream.Dispose() }
    if ($actual -ne $phase26Files[$entry.FullName].sha256) { throw ('Archived bytes differ: ' + $entry.FullName) }
    if ((Get-FileHash -LiteralPath $phase26Files[$entry.FullName].path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $actual) { throw ('Source changed during archive: ' + $entry.FullName) }
  }
} finally { $phase26Verify.Dispose() }
$phase26Manifest = [ordered]@{schema='dsh-client-source-delta/1'; path=$phase26ZipPath; sha256=(Get-FileHash -LiteralPath $phase26ZipPath -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=(Get-Item -LiteralPath $phase26ZipPath).Length; entries=$phase26Changed.Count; basePath=$phase26Base.path; baseSha256=$phase26Base.sha256; requiresBase=$true; removed=@(); allEntriesVerified=$true; dependenciesBundled=$false; unchangedEntriesOmitted=$true; archiveActivatedResources=$false; nativeAttemptSummary='evidence/phase26-summary.json'; files=[ordered]@{}}
foreach ($relative in $phase26Changed) { $phase26Manifest.files[$relative] = $phase26Files[$relative].sha256 }
[IO.File]::WriteAllText((Join-Path $phase26Root $phase26ManifestName),($phase26Manifest | ConvertTo-Json -Depth 8).Replace("`r`n","`n").TrimEnd()+"`n",[Text.UTF8Encoding]::new($false))
Write-Output ('PASS: sealed verified v26 delta, ' + $phase26Changed.Count + ' entries; v15 base unchanged; no dependencies copied')
