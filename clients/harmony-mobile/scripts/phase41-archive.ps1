# Exact precomputed local candidate entries; preserve existing archives and all installed/deployed state.
$ErrorActionPreference = 'Stop'
$taskClient = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskArchives = Get-Content -LiteralPath (Join-Path $taskClient '.build/phase41-archives.json') -Raw | ConvertFrom-Json
$taskResults = @()
foreach ($taskArchive in $taskArchives) {
  if (Test-Path -LiteralPath $taskArchive.path) { throw 'Preserve sealed archive' }
  $taskBase = [System.IO.Path]::GetFullPath($taskArchive.directory)
  if (-not $taskBase.StartsWith($taskClient + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Archive source escaped client' }
  $taskZip = [System.IO.Compression.ZipFile]::Open($taskArchive.path, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($taskFile in $taskArchive.files) {
      $taskResolved = [System.IO.Path]::GetFullPath((Join-Path $taskBase $taskFile.file))
      if (-not $taskResolved.StartsWith($taskBase + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Entry escaped source' }
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip, $taskResolved, $taskFile.file, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally { $taskZip.Dispose() }
  $taskRead = [System.IO.Compression.ZipFile]::OpenRead($taskArchive.path)
  try {
    if ($taskRead.Entries.Count -ne $taskArchive.files.Count) { throw 'Unexpected archive count' }
    foreach ($taskFile in $taskArchive.files) {
      $taskEntry = $taskRead.GetEntry($taskFile.file)
      if ($null -eq $taskEntry) { throw 'Missing entry' }
      $taskStream = $taskEntry.Open(); $taskSha = [System.Security.Cryptography.SHA256]::Create()
      try { $taskDigest = [System.Convert]::ToHexString($taskSha.ComputeHash($taskStream)).ToLowerInvariant() } finally { $taskStream.Dispose(); $taskSha.Dispose() }
      if ($taskDigest -ne $taskFile.sha256) { throw 'Archive entry bytes differ' }
    }
  } finally { $taskRead.Dispose() }
  $taskResults += @{ name = $taskArchive.name; path = $taskArchive.path; bytes = (Get-Item -LiteralPath $taskArchive.path).Length; entries = $taskArchive.files.Count; sha256 = (Get-FileHash -LiteralPath $taskArchive.path -Algorithm SHA256).Hash.ToLowerInvariant(); entriesVerified = $true }
}
$taskSeal = @{ schema = 'harmony-first-use-seal/1'; archives = $taskResults; hap = (Get-Content -LiteralPath (Join-Path $taskClient '.build/phase41-hap.json') -Raw | ConvertFrom-Json); installed = $false; signed = $false; realKeysCreated = $false; currentDesktopChanged = $false; serverChanged = $false; realModels = 0; uploads = 0 }
[System.IO.File]::WriteAllText((Join-Path $taskClient 'evidence/phase41-seal.json'), ($taskSeal | ConvertTo-Json -Depth 8) + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Output ($taskResults | ConvertTo-Json -Depth 4)
