# Only exact local source/rollback manifest entries; no deployment, credentials or installation.
$ErrorActionPreference = 'Stop'
$taskClient = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskStage = [System.IO.Path]::GetFullPath((Join-Path $taskClient '.build/offline-product-delta'))
$taskArchive = 'D:\Temp\dsh-harmony-client-20261013-offline-product-delta.zip'
if (Test-Path -LiteralPath $taskArchive) { throw 'Preserve sealed archive' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskFiles = Get-Content -LiteralPath (Join-Path $taskClient '.build/product-source-files.json') -Raw | ConvertFrom-Json
$taskZip = [System.IO.Compression.ZipFile]::Open($taskArchive, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($taskFile in $taskFiles) {
        $taskResolved = [System.IO.Path]::GetFullPath((Join-Path $taskStage $taskFile.file))
        if (-not $taskResolved.StartsWith($taskStage + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escaped stage' }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip, $taskResolved, $taskFile.file, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $taskZip.Dispose() }
$taskOpened = [System.IO.Compression.ZipFile]::OpenRead($taskArchive)
$taskEntries = @()
try {
    if ($taskOpened.Entries.Count -ne $taskFiles.Count) { throw 'Unexpected archive count' }
    foreach ($taskFile in $taskFiles) {
        $taskEntry = $taskOpened.GetEntry($taskFile.file)
        if ($null -eq $taskEntry) { throw 'Missing archive entry' }
        $taskStream = $taskEntry.Open()
        $taskSha = [System.Security.Cryptography.SHA256]::Create()
        try { $taskDigest = [System.Convert]::ToHexString($taskSha.ComputeHash($taskStream)).ToLowerInvariant() } finally { $taskStream.Dispose(); $taskSha.Dispose() }
        if ($taskDigest -ne $taskFile.sha256) { throw ('Archive bytes differ: ' + $taskFile.file) }
        $taskEntries += @{ file = $taskFile.file; sha256 = $taskDigest }
    }
} finally { $taskOpened.Dispose() }
[System.IO.File]::WriteAllText((Join-Path $taskClient '.build/product-verified-entries.json'), ($taskEntries | ConvertTo-Json -Depth 6) + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Output ('PASS: exact source/rollback entries: ' + $taskEntries.Count)
