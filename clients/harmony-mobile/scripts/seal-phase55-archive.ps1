# Archive only staged public manifest entries, using portable slash names and verifying every entry digest.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$phase55Source = [IO.Path]::GetFullPath($env:DSH_PUBLIC_ARCHIVE_SOURCE)
$phase55Destination = [IO.Path]::GetFullPath($env:DSH_PUBLIC_ARCHIVE_DESTINATION)
if (Test-Path -LiteralPath $phase55Destination) { throw 'archive already exists' }
$phase55Manifest = Get-Content -LiteralPath (Join-Path $phase55Source 'changed-files.json') -Raw | ConvertFrom-Json
$phase55Expected = @($phase55Manifest.records | ForEach-Object { [pscustomobject]@{ path=$_.path; bytes=$_.bytes; sha256=$_.sha256 } }) + @($phase55Manifest.rollbackPreimages | ForEach-Object { [pscustomobject]@{ path=('rollback-preimages/' + $_.path); bytes=$_.bytes; sha256=$_.sha256 } })
$phase55ManifestBytes = [IO.File]::ReadAllBytes((Join-Path $phase55Source 'changed-files.json'))
$phase55Digest = [Security.Cryptography.SHA256]::Create()
try { $phase55ManifestHash = [BitConverter]::ToString($phase55Digest.ComputeHash($phase55ManifestBytes)).Replace('-','').ToLowerInvariant() } finally { $phase55Digest.Dispose() }
$phase55Expected += [pscustomobject]@{ path='changed-files.json'; bytes=$phase55ManifestBytes.Length; sha256=$phase55ManifestHash }
$phase55Archive = [IO.Compression.ZipFile]::Open($phase55Destination, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($phase55Record in $phase55Expected) {
    $phase55File = [IO.Path]::GetFullPath((Join-Path $phase55Source $phase55Record.path))
    if (-not $phase55File.StartsWith($phase55Source + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'staged file escaped source directory' }
    $phase55Entry = $phase55Archive.CreateEntry($phase55Record.path.Replace('\','/'))
    $phase55Input = [IO.File]::OpenRead($phase55File)
    $phase55Output = $phase55Entry.Open()
    try { $phase55Input.CopyTo($phase55Output) } finally { $phase55Output.Dispose(); $phase55Input.Dispose() }
  }
} finally { $phase55Archive.Dispose() }
$phase55Archive = [IO.Compression.ZipFile]::OpenRead($phase55Destination)
try {
  if ($phase55Archive.Entries.Count -ne $phase55Expected.Count) { throw 'archive entry count mismatch' }
  foreach ($phase55Record in $phase55Expected) {
    $phase55Entry = $phase55Archive.GetEntry($phase55Record.path)
    if ($null -eq $phase55Entry -or $phase55Entry.Length -ne $phase55Record.bytes) { throw ('archive entry size mismatch: ' + $phase55Record.path) }
    $phase55Stream = $phase55Entry.Open()
    $phase55Digest = [Security.Cryptography.SHA256]::Create()
    try { $phase55Hash = [BitConverter]::ToString($phase55Digest.ComputeHash($phase55Stream)).Replace('-','').ToLowerInvariant() } finally { $phase55Stream.Dispose(); $phase55Digest.Dispose() }
    if ($phase55Hash -ne $phase55Record.sha256) { throw ('archive entry digest mismatch: ' + $phase55Record.path) }
  }
} finally { $phase55Archive.Dispose() }
