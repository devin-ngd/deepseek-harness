# Read only related command and standard installation locations; never launch, install or inspect account/signing data.
$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$commands = @('ohpm', 'hvigorw', 'hdc', 'deveco', 'node') | ForEach-Object {
  $toolName = $_
  $found = @(Get-Command -Name $toolName -ErrorAction SilentlyContinue)
  [ordered]@{ name = $toolName; paths = @($found | ForEach-Object { $_.Source } | Where-Object { $_ }) }
}
$locations = @('C:\Program Files\Huawei\DevEco Studio', 'C:\Program Files\DevEco Studio', 'D:\DevEco Studio', 'D:\Huawei\DevEco Studio') | ForEach-Object {
  [ordered]@{ path = $_; present = (Test-Path -LiteralPath $_ -PathType Container) }
}
$result = [ordered]@{ checkedAt = [DateTime]::UtcNow.ToString('o'); commands = @($commands); standardLocations = @($locations); detectionScope = 'PATH and four known IDE directories only; absence is scoped, not an entire-disk claim'; installed = $false; signed = $false; deviceConnected = $false; arkTsCompiled = $false }
$text = (($result | ConvertTo-Json -Depth 5) -replace "`r`n", "`n").TrimEnd() + "`n"
[System.IO.File]::WriteAllText((Join-Path $taskRoot 'evidence/phase6-native-preflight.json'), $text, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Read-only native preflight recorded. No tools, accounts, keys, permissions or devices were activated.'
