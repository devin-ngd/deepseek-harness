# Read only the official HDC helper and this lab's existing fixed-world processes; never start or stop a process.
$ErrorActionPreference = 'Stop'
$phase65ExpectedHdc = 'D:\Program Files\HuaWei\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe'
$phase65Hdc = @(Get-CimInstance Win32_Process -Filter "Name = 'hdc.exe'" | ForEach-Object {
  [pscustomobject]@{ pid=$_.ProcessId; officialExecutable=($_.ExecutablePath -eq $phase65ExpectedHdc); serverMode=($_.CommandLine -match '(?:^|\s)(?:-m|server|start)(?:\s|$)'); explicitLoopback8710=($_.CommandLine -match '127\.0\.0\.1:8710') }
})
$phase65Owned = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like '*dsh-harmony-real-field-20261015-lEUAMM*' })
$phase65Connections = @(Get-CimInstance -Namespace root/StandardCimv2 -ClassName MSFT_NetTCPConnection -Filter 'LocalPort = 8710 AND State = 2' | ForEach-Object { [pscustomobject]@{ address=$_.LocalAddress; port=$_.LocalPort; pid=$_.OwningProcess } })
$phase65Report = [ordered]@{ at=[DateTime]::UtcNow.ToString('o'); hdcProcessCount=$phase65Hdc.Count; hdc=$phase65Hdc; originalLoopback8710Listeners=$phase65Connections; ownedFieldProcessCount=$phase65Owned.Count; processMutation=$false; serverStartedOrRestarted=$false; commandLinesRetained=$false }
[IO.File]::WriteAllText((Join-Path (Get-Location) 'evidence/phase65-host-processes.json'), (($phase65Report | ConvertTo-Json -Depth 6)+"`n"), [Text.UTF8Encoding]::new($false))
$phase65Report | ConvertTo-Json -Depth 6
