# Archive exact owned stage files only. No sessions, credentials, installed profiles or remote access.
$ErrorActionPreference = 'Stop'
$taskClient = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskStage = [System.IO.Path]::GetFullPath((Join-Path $taskClient '.build/phase36-delta'))
$taskArchive = 'D:\Temp\dsh-harmony-client-20261013-source-v36-delta.zip'
if (Test-Path -LiteralPath $taskArchive) { throw 'Preserve existing phase36 source archive' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskFiles = Get-Content -LiteralPath (Join-Path $taskClient '.build/phase36-source-files.json') -Raw | ConvertFrom-Json
$taskZip = [System.IO.Compression.ZipFile]::Open($taskArchive, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($taskFile in $taskFiles) {
        $taskResolved = [System.IO.Path]::GetFullPath((Join-Path $taskStage $taskFile.file))
        if (-not $taskResolved.StartsWith($taskStage + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escaped stage' }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip, $taskResolved, $taskFile.file, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $taskZip.Dispose() }
$taskOpened = [System.IO.Compression.ZipFile]::OpenRead($taskArchive)
$taskVerified = @()
try {
    if ($taskOpened.Entries.Count -ne $taskFiles.Count) { throw 'Unexpected entry count' }
    foreach ($taskFile in $taskFiles) {
        $taskEntry = $taskOpened.GetEntry($taskFile.file)
        if ($null -eq $taskEntry) { throw 'Missing archive entry' }
        $taskStream = $taskEntry.Open()
        $taskSha = [System.Security.Cryptography.SHA256]::Create()
        try { $taskDigest = [System.Convert]::ToHexString($taskSha.ComputeHash($taskStream)).ToLowerInvariant() } finally { $taskStream.Dispose(); $taskSha.Dispose() }
        if ($taskDigest -ne $taskFile.sha256) { throw ('Archive bytes differ: ' + $taskFile.file) }
        $taskVerified += @{ file = $taskFile.file; sha256 = $taskDigest }
    }
} finally { $taskOpened.Dispose() }
[System.IO.File]::WriteAllText((Join-Path $taskClient '.build/phase36-verified-entries.json'), ($taskVerified | ConvertTo-Json -Depth 5) + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Output ('PASS: exact phase36 archive entries verified: ' + $taskVerified.Count)
