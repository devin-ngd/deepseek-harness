# Archive only exact verified entries; no install, service, trust or identity activation.
$ErrorActionPreference = 'Stop'
$taskClient = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskArchives = Get-Content -LiteralPath (Join-Path $taskClient '.build/phase42-archives.json') -Raw | ConvertFrom-Json
$taskResults = @()
foreach ($taskArchive in $taskArchives) {
  if (Test-Path -LiteralPath $taskArchive.path) { throw 'Preserve existing sealed archive' }
  $taskBase = [System.IO.Path]::GetFullPath($taskArchive.directory)
  if (-not $taskBase.StartsWith($taskClient + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Archive source escaped client' }
  $taskZip = [System.IO.Compression.ZipFile]::Open($taskArchive.path, [System.IO.Compression.ZipArchiveMode]::Create)
  try { foreach ($taskFile in $taskArchive.files) {
    $taskResolved = [System.IO.Path]::GetFullPath((Join-Path $taskBase $taskFile.file))
    if (-not $taskResolved.StartsWith($taskBase + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Entry escaped source' }
    if ((Get-FileHash -LiteralPath $taskResolved -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskFile.sha256) { throw 'Source changed after manifest' }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip, $taskResolved, $taskFile.file, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  } } finally { $taskZip.Dispose() }
  $taskRead = [System.IO.Compression.ZipFile]::OpenRead($taskArchive.path)
  try {
    if ($taskRead.Entries.Count -ne $taskArchive.files.Count) { throw 'Unexpected entry count' }
    foreach ($taskFile in $taskArchive.files) {
      $taskEntry = $taskRead.GetEntry($taskFile.file); if ($null -eq $taskEntry) { throw 'Missing entry' }
      $taskStream = $taskEntry.Open(); $taskSha = [System.Security.Cryptography.SHA256]::Create()
      try { $taskDigest = [System.Convert]::ToHexString($taskSha.ComputeHash($taskStream)).ToLowerInvariant() } finally { $taskStream.Dispose(); $taskSha.Dispose() }
      if ($taskDigest -ne $taskFile.sha256 -or $taskEntry.Length -ne $taskFile.bytes) { throw 'Archived bytes differ' }
    }
  } finally { $taskRead.Dispose() }
  $taskResults += @{ name=$taskArchive.name; path=$taskArchive.path; bytes=(Get-Item -LiteralPath $taskArchive.path).Length; entries=$taskArchive.files.Count; entriesVerified=$true; sha256=(Get-FileHash -LiteralPath $taskArchive.path -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$taskRetained = Get-Content -LiteralPath (Join-Path $taskClient '.build/phase42-retained.json') -Raw | ConvertFrom-Json
foreach ($taskPrevious in $taskRetained) { if ((Get-FileHash -LiteralPath $taskPrevious.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskPrevious.sha256) { throw 'Predecessor changed' } }
$taskHap = Get-Content -LiteralPath (Join-Path $taskClient '.build/phase42-hap.json') -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath $taskHap.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskHap.sha256) { throw 'HAP differs' }
$taskSeal = @{ schema='harmony-first-use-wiring-seal/1'; archives=$taskResults; hap=$taskHap; predecessorsPreserved=$taskRetained.Count; installed=$false; signed=$false; realKeysCreated=$false; currentDesktopChanged=$false; serverChanged=$false; realModels=0; uploads=0; tests=5; strictSourceModules=155; nativeCompiled=$true; nativeExecuted=$false; relayTrustActivated=$false }
[System.IO.File]::WriteAllText((Join-Path $taskClient 'evidence/phase42-seal.json'), ($taskSeal | ConvertTo-Json -Depth 8) + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Output ($taskResults | ConvertTo-Json -Depth 4)
