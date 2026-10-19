# Create-only owned source snapshot, verify contents and all six predecessor hashes; never follow filesystem links.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($taskRoot -ne [IO.Path]::GetFullPath('D:\workspace\agents\deepseek-harness\clients\harmony-mobile')) { throw 'Unexpected client root' }
$destination = 'D:\Temp\dsh-harmony-client-20261010-source-v7.zip'
if (Test-Path -LiteralPath $destination) { throw 'Snapshot already exists; never overwrite it' }
$summary = Get-Content -LiteralPath (Join-Path $taskRoot 'evidence/phase7-summary.json') -Raw | ConvertFrom-Json
if (!$summary.completedBatch -or !$summary.fullRegression.allStagesPassed) { throw 'Completed phase7 evidence required' }
foreach ($previous in $summary.continuity.archives) {
  $previousPath = 'D:\Temp\dsh-harmony-client-20261010-source-v' + $previous.version + '.zip'
  if ((Get-FileHash -LiteralPath $previousPath -Algorithm SHA256).Hash -ne $previous.sha256) { throw 'Historical snapshot changed' }
}
$stack = [Collections.Generic.Stack[string]]::new(); $stack.Push($taskRoot)
$files = [Collections.Generic.List[IO.FileInfo]]::new()
while ($stack.Count -gt 0) {
  foreach ($entry in Get-ChildItem -LiteralPath $stack.Pop() -Force) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    if ($entry.PSIsContainer) {
      if ($entry.Name -notin @('.build', '.git', 'node_modules', '.hvigor', 'oh_modules')) { $stack.Push($entry.FullName) }
    } elseif ($entry.Name -notlike '.env*') { $files.Add($entry) }
  }
}
$stream = [IO.File]::Open($destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
$zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
try {
  foreach ($file in $files) {
    $relative = [IO.Path]::GetRelativePath($taskRoot, $file.FullName).Replace('\', '/')
    $entry = $zip.CreateEntry($relative, [IO.Compression.CompressionLevel]::Optimal)
    $inputStream = $file.OpenRead(); $outputStream = $entry.Open()
    try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose(); $inputStream.Dispose() }
  }
} finally { $zip.Dispose(); $stream.Dispose() }
$verify = [IO.Compression.ZipFile]::OpenRead($destination)
try {
  foreach ($property in $summary.ownedHashes.PSObject.Properties) {
    $entry = $verify.GetEntry($property.Name.Replace('\', '/'))
    if (!$entry) { throw ('Missing owned source: ' + $property.Name) }
    $inputStream = $entry.Open(); $algorithm = [Security.Cryptography.SHA256]::Create()
    try { $actual = [Convert]::ToHexString($algorithm.ComputeHash($inputStream)).ToLowerInvariant() }
    finally { $algorithm.Dispose(); $inputStream.Dispose() }
    if ($actual -ne $property.Value) { throw ('Packaged source differs: ' + $property.Name) }
  }
} finally { $verify.Dispose() }
$metadata = [ordered]@{ path = $destination; sha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash; entries = $files.Count; bytes = (Get-Item -LiteralPath $destination).Length; scope = 'owned client source, generated inactive resources and evidence; .build/dependencies/credentials excluded'; verifiedOwnedHashes = @($summary.ownedHashes.PSObject.Properties).Count; olderSnapshotsUnchanged = $true; installableHap = $false }
$text = (($metadata | ConvertTo-Json) -replace "`r`n", "`n").TrimEnd() + "`n"
[IO.File]::WriteAllText((Join-Path $taskRoot 'evidence/archive-v7.json'), $text, [Text.UTF8Encoding]::new($false))
Write-Output ($metadata | ConvertTo-Json -Compress)
