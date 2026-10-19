# Inspect only currently present Huawei USB interfaces; never emit instance IDs, serials or change a driver/device.
$ErrorActionPreference = 'Stop'
$phase60Rows = @()
$phase60Failure = $null
try {
  $phase60Devices = @(Get-CimInstance -ClassName Win32_PnPEntity -Filter "PNPDeviceID LIKE 'USB%VID_12D1%'" | Where-Object { $_.PNPDeviceID -like 'USB\VID_12D1*' -and $_.Present -ne $false })
  foreach ($phase60Device in $phase60Devices) {
    $phase60Product = [regex]::Match($phase60Device.PNPDeviceID, 'PID_([A-Fa-f0-9]{4})').Groups[1].Value
    $phase60Suffix = ($phase60Device.PNPDeviceID -split '\\')[-1]
    $phase60Digest = [Security.Cryptography.SHA256]::Create()
    try { $phase60SerialMatched = [BitConverter]::ToString($phase60Digest.ComputeHash([Text.Encoding]::UTF8.GetBytes($phase60Suffix))).Replace('-','').ToLowerInvariant().StartsWith('54cfb7ac') } finally { $phase60Digest.Dispose() }
    if ($phase60Product -ne '1101' -and -not $phase60SerialMatched) { continue }
    $phase60Interface = [regex]::Match($phase60Device.PNPDeviceID, 'MI_([A-Fa-f0-9]{2})').Groups[1].Value
    $phase60Kind = if ($phase60Device.Name -match 'HDC') { 'HDC interface' } elseif ($phase60Device.Name -match 'MTP') { 'MTP interface' } else { 'Huawei USB interface' }
    $phase60Rows += [pscustomobject]@{ vendor='12D1'; product=$phase60Product; interface=$phase60Interface; approvedSerialMatched=$phase60SerialMatched; kind=$phase60Kind; class=$phase60Device.PNPClass; status=$phase60Device.Status; configManagerErrorCode=$phase60Device.ConfigManagerErrorCode; driverServicePresent=([bool]$phase60Device.Service) }
  }
} catch {
  $phase60Failure = [ordered]@{ category=$_.CategoryInfo.Category.ToString(); exceptionType=$_.Exception.GetType().FullName; hresult=$_.Exception.HResult; rawMessageRetained=$false }
}
$phase60Port = [ordered]@{ querySucceeded=$false; listeners=@(); failureCategory=$null }
try {
  $phase60Listeners = @(Get-CimInstance -Namespace root/StandardCimv2 -ClassName MSFT_NetTCPConnection -Filter 'LocalPort = 8710 AND State = 2')
  $phase60Port.querySucceeded=$true
  $phase60Port.listeners=@($phase60Listeners | ForEach-Object { [pscustomobject]@{ address=$_.LocalAddress; port=$_.LocalPort; owningProcess=$_.OwningProcess } })
} catch { $phase60Port.failureCategory=$_.CategoryInfo.Category.ToString() }
$phase60Report = [ordered]@{ at=[DateTime]::UtcNow.ToString('o'); querySucceeded=($null -eq $phase60Failure); scope='Huawei USB interfaces projected only for original serial hash or observed phone PID_1101; existing HDC port 8710'; count=$phase60Rows.Count; interfaces=$phase60Rows; failure=$phase60Failure; sharedHdcPort=$phase60Port; rawIdentifiersRetained=$false; driversOrSettingsChanged=$false; deviceCommandsExecuted=$false }
[IO.File]::WriteAllText((Join-Path (Get-Location) 'evidence/phase60-usb-inspection.json'), (($phase60Report | ConvertTo-Json -Depth 7) + "`n"), [Text.UTF8Encoding]::new($false))
$phase60Report | ConvertTo-Json -Depth 7
