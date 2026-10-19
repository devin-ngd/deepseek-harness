# Read-only verification of every sealed public entry against the staged manifest.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$phase58Source = [IO.Path]::GetFullPath($env:DSH_PUBLIC_ARCHIVE_SOURCE)
$phase58Destination = [IO.Path]::GetFullPath($env:DSH_PUBLIC_ARCHIVE_DESTINATION)
$phase58ManifestPath = Join-Path $phase58Source 'changed-files.json'
$phase58Manifest = Get-Content -LiteralPath $phase58ManifestPath -Raw | ConvertFrom-Json
$phase58Expected = @($phase58Manifest.records | ForEach-Object { [pscustomobject]@{ path=$_.path; bytes=$_.bytes; sha256=$_.sha256 } }) + @($phase58Manifest.rollbackPreimages | ForEach-Object { [pscustomobject]@{ path=('rollback-preimages/' + $_.path); bytes=$_.bytes; sha256=$_.sha256 } })
$phase58Bytes = [IO.File]::ReadAllBytes($phase58ManifestPath)
$phase58Digest = [Security.Cryptography.SHA256]::Create()
try { $phase58Hash = [BitConverter]::ToString($phase58Digest.ComputeHash($phase58Bytes)).Replace('-','').ToLowerInvariant() } finally { $phase58Digest.Dispose() }
$phase58Expected += [pscustomobject]@{ path='changed-files.json'; bytes=$phase58Bytes.Length; sha256=$phase58Hash }
$phase58Archive = [IO.Compression.ZipFile]::OpenRead($phase58Destination)
try {
  if ($phase58Archive.Entries.Count -ne $phase58Expected.Count) { throw 'archive entry count mismatch' }
  if (@($phase58Archive.Entries | Group-Object FullName | Where-Object Count -gt 1).Count -ne 0) { throw 'duplicate archive entry' }
  foreach ($phase58Record in $phase58Expected) {
    $phase58Entry = $phase58Archive.GetEntry($phase58Record.path)
    if ($null -eq $phase58Entry -or $phase58Entry.Length -ne $phase58Record.bytes) { throw ('archive entry size mismatch: ' + $phase58Record.path) }
    $phase58Stream = $phase58Entry.Open()
    $phase58Digest = [Security.Cryptography.SHA256]::Create()
    try { $phase58Hash = [BitConverter]::ToString($phase58Digest.ComputeHash($phase58Stream)).Replace('-','').ToLowerInvariant() } finally { $phase58Stream.Dispose(); $phase58Digest.Dispose() }
    if ($phase58Hash -ne $phase58Record.sha256) { throw ('archive entry digest mismatch: ' + $phase58Record.path) }
  }
} finally { $phase58Archive.Dispose() }
