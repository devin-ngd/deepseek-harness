# Project public ZIP entry digests and app metadata; the calling Node verifier admits only the pinned signer addition.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Read-Phase59Entries([string]$phase59Path) {
  $phase59Archive = [IO.Compression.ZipFile]::OpenRead($phase59Path)
  try {
    $phase59Records = @()
    foreach ($phase59Entry in $phase59Archive.Entries) {
      $phase59Stream = $phase59Entry.Open()
      $phase59Digest = [Security.Cryptography.SHA256]::Create()
      try { $phase59Hash = [BitConverter]::ToString($phase59Digest.ComputeHash($phase59Stream)).Replace('-','').ToLowerInvariant() } finally { $phase59Digest.Dispose(); $phase59Stream.Dispose() }
      $phase59Records += [pscustomobject]@{ path=$phase59Entry.FullName; bytes=$phase59Entry.Length; sha256=$phase59Hash }
    }
    if (@($phase59Records | Group-Object path | Where-Object Count -gt 1).Count -ne 0) { throw 'duplicate HAP entry' }
    return $phase59Records
  } finally { $phase59Archive.Dispose() }
}
$phase59Input = @(Read-Phase59Entries $env:DSH_UNSIGNED_HAP | Sort-Object path)
$phase59Signed = @(Read-Phase59Entries $env:DSH_SIGNED_HAP | Sort-Object path)
$phase59Archive = [IO.Compression.ZipFile]::OpenRead($env:DSH_UNSIGNED_HAP)
try {
  $phase59Entry = $phase59Archive.GetEntry('module.json')
  if ($null -eq $phase59Entry) { throw 'module.json missing' }
  $phase59Reader = [IO.StreamReader]::new($phase59Entry.Open())
  try { $phase59Module = $phase59Reader.ReadToEnd() | ConvertFrom-Json } finally { $phase59Reader.Dispose() }
} finally { $phase59Archive.Dispose() }
$phase59Report = [ordered]@{ inputEntries=$phase59Input; signedEntries=$phase59Signed; metadata=[ordered]@{ bundleName=$phase59Module.app.bundleName; versionName=$phase59Module.app.versionName; versionCode=$phase59Module.app.versionCode; permissions=@($phase59Module.module.requestPermissions | ForEach-Object name) } }
[IO.File]::WriteAllText($env:DSH_PUBLIC_PAYLOAD_REPORT, (($phase59Report | ConvertTo-Json -Depth 8) + "`n"), [Text.UTF8Encoding]::new($false))
