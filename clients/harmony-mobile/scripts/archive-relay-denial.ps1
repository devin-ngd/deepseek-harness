# Exact local candidate entries only. The deployed predecessor and server are untouched.
$ErrorActionPreference = 'Stop'
$taskClient = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskStage = [System.IO.Path]::GetFullPath((Join-Path $taskClient '.build/relay-denial-candidate'))
$taskArchive = 'D:\Temp\harmony-light-relay-0.0.0-phase40.2.zip'
if (Test-Path -LiteralPath $taskArchive) { throw 'Preserve candidate archive' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskFiles = Get-Content -LiteralPath (Join-Path $taskClient 'evidence/relay-denial-package-files.json') -Raw | ConvertFrom-Json
$taskZip = [System.IO.Compression.ZipFile]::Open($taskArchive, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($taskFile in $taskFiles) {
        $taskResolved = [System.IO.Path]::GetFullPath((Join-Path $taskStage $taskFile.file))
        if (-not $taskResolved.StartsWith($taskStage + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Candidate path escaped stage' }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip, $taskResolved, $taskFile.file, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $taskZip.Dispose() }
$taskOpened = [System.IO.Compression.ZipFile]::OpenRead($taskArchive)
$taskEntries = @()
try {
    if ($taskOpened.Entries.Count -ne $taskFiles.Count) { throw 'Unexpected candidate count' }
    foreach ($taskFile in $taskFiles) {
        $taskEntry = $taskOpened.GetEntry($taskFile.file)
        if ($null -eq $taskEntry) { throw 'Missing candidate entry' }
        $taskStream = $taskEntry.Open(); $taskSha = [System.Security.Cryptography.SHA256]::Create()
        try { $taskDigest = [System.Convert]::ToHexString($taskSha.ComputeHash($taskStream)).ToLowerInvariant() } finally { $taskStream.Dispose(); $taskSha.Dispose() }
        if ($taskDigest -ne $taskFile.sha256) { throw ('Candidate bytes differ: ' + $taskFile.file) }
        $taskEntries += @{ file = $taskFile.file; sha256 = $taskDigest }
    }
} finally { $taskOpened.Dispose() }
[System.IO.File]::WriteAllText((Join-Path $taskClient 'evidence/relay-denial-verified-entries.json'), ($taskEntries | ConvertTo-Json -Depth 6) + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Output ('PASS: exact candidate entries: ' + $taskEntries.Count)
