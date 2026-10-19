# Create a new owned snapshot; never overwrite v1–v6 or follow filesystem links.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$expectedRoot = [System.IO.Path]::GetFullPath('D:\workspace\agents\deepseek-harness\clients\harmony-mobile')
if ($taskRoot -ne $expectedRoot) { throw 'Unexpected client root' }
$destination = 'D:\Temp\dsh-harmony-client-20261010-source-v6.zip'
if (Test-Path -LiteralPath $destination) { throw 'Snapshot already exists; never overwrite it' }
$summary = Get-Content -LiteralPath (Join-Path $taskRoot 'evidence/phase6-summary.json') -Raw | ConvertFrom-Json
if (!$summary.completedBatch) { throw 'Completed phase6 evidence required' }
$stack = [System.Collections.Generic.Stack[string]]::new(); $stack.Push($taskRoot)
$files = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
while ($stack.Count -gt 0) {
  foreach ($entry in Get-ChildItem -LiteralPath $stack.Pop() -Force) {
    if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    if ($entry.PSIsContainer) {
      if ($entry.Name -notin @('.build', '.git', 'node_modules', '.hvigor', 'oh_modules')) { $stack.Push($entry.FullName) }
    } elseif ($entry.Name -notlike '.env*') { $files.Add($entry) }
  }
}
$stream = [System.IO.File]::Open($destination, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
$zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
try {
  foreach ($file in $files) {
    $relative = [System.IO.Path]::GetRelativePath($taskRoot, $file.FullName).Replace('\', '/')
    $entry = $zip.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::Optimal)
    $inputStream = $file.OpenRead(); $outputStream = $entry.Open()
    try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose(); $inputStream.Dispose() }
  }
} finally { $zip.Dispose(); $stream.Dispose() }
$metadata = [ordered]@{ path = $destination; sha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash; entries = $files.Count; bytes = (Get-Item -LiteralPath $destination).Length; scope = 'owned client source, artifacts and evidence; .build and dependencies excluded'; olderSnapshotsUnchanged = $true }
$text = (($metadata | ConvertTo-Json) -replace "`r`n", "`n").TrimEnd() + "`n"
[System.IO.File]::WriteAllText((Join-Path $taskRoot 'evidence/archive-v6.json'), $text, [System.Text.UTF8Encoding]::new($false))
Write-Output ($metadata | ConvertTo-Json -Compress)
