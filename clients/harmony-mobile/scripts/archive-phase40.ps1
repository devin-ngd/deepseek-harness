# Exact local manifests only. No deployment, credentials, signing or server access.
$ErrorActionPreference = 'Stop'
$taskClient = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskVerified = @{}
foreach ($taskKind in @('release', 'source')) {
    $taskStageName = if ($taskKind -eq 'release') { '.build/phase40-release' } else { '.build/phase40-delta' }
    $taskManifestName = if ($taskKind -eq 'release') { '.build/phase40-release-files.json' } else { '.build/phase40-source-files.json' }
    $taskArchive = if ($taskKind -eq 'release') { 'D:\Temp\harmony-light-relay-0.0.0-phase40.1.zip' } else { 'D:\Temp\dsh-harmony-client-20261013-source-v40-delta.zip' }
    if (Test-Path -LiteralPath $taskArchive) { throw 'Preserve sealed archive' }
    $taskStage = [System.IO.Path]::GetFullPath((Join-Path $taskClient $taskStageName))
    $taskFiles = Get-Content -LiteralPath (Join-Path $taskClient $taskManifestName) -Raw | ConvertFrom-Json
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
    $taskVerified[$taskKind] = $taskEntries
}
[System.IO.File]::WriteAllText((Join-Path $taskClient '.build/phase40-verified-entries.json'), ($taskVerified | ConvertTo-Json -Depth 6) + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Output ('PASS: exact release/source entries: ' + $taskVerified.release.Count + '/' + $taskVerified.source.Count)
