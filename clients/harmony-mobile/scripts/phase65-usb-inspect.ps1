# Inspect only currently present Huawei USB interfaces; never emit instance IDs, serials or change a driver/device.
$ErrorActionPreference = 'Stop'
$phase65Rows = @()
$phase65Failure = $null
try {
  $phase65Devices = @(Get-CimInstance -ClassName Win32_PnPEntity -Filter "PNPDeviceID LIKE 'USB%VID_12D1%'" | Where-Object { $_.PNPDeviceID -like 'USB\VID_12D1*' -and $_.Present -ne $false })
  foreach ($phase65Device in $phase65Devices) {
    $phase65Product = [regex]::Match($phase65Device.PNPDeviceID, 'PID_([A-Fa-f0-9]{4})').Groups[1].Value
    $phase65Suffix = ($phase65Device.PNPDeviceID -split '\\')[-1]
    $phase65Digest = [Security.Cryptography.SHA256]::Create()
    try { $phase65SerialMatched = [BitConverter]::ToString($phase65Digest.ComputeHash([Text.Encoding]::UTF8.GetBytes($phase65Suffix))).Replace('-','').ToLowerInvariant().StartsWith('54cfb7ac') } finally { $phase65Digest.Dispose() }
    if ($phase65Product -ne '1101' -and -not $phase65SerialMatched) { continue }
    $phase65Interface = [regex]::Match($phase65Device.PNPDeviceID, 'MI_([A-Fa-f0-9]{2})').Groups[1].Value
    $phase65Kind = if ($phase65Device.Name -match 'HDC') { 'HDC interface' } elseif ($phase65Device.Name -match 'MTP') { 'MTP interface' } else { 'Huawei USB interface' }
    $phase65Rows += [pscustomobject]@{ vendor='12D1'; product=$phase65Product; interface=$phase65Interface; approvedSerialMatched=$phase65SerialMatched; kind=$phase65Kind; class=$phase65Device.PNPClass; status=$phase65Device.Status; configManagerErrorCode=$phase65Device.ConfigManagerErrorCode; driverServicePresent=([bool]$phase65Device.Service) }
  }
} catch {
  $phase65Failure = [ordered]@{ category=$_.CategoryInfo.Category.ToString(); exceptionType=$_.Exception.GetType().FullName; hresult=$_.Exception.HResult; rawMessageRetained=$false }
}
$phase65Port = [ordered]@{ querySucceeded=$false; listeners=@(); failureCategory=$null }
try {
  $phase65Listeners = @(Get-CimInstance -Namespace root/StandardCimv2 -ClassName MSFT_NetTCPConnection -Filter 'LocalPort = 8710 AND State = 2')
  $phase65Port.querySucceeded=$true
  $phase65Port.listeners=@($phase65Listeners | ForEach-Object { [pscustomobject]@{ address=$_.LocalAddress; port=$_.LocalPort; owningProcess=$_.OwningProcess } })
} catch { $phase65Port.failureCategory=$_.CategoryInfo.Category.ToString() }
$phase65Report = [ordered]@{ at=[DateTime]::UtcNow.ToString('o'); querySucceeded=($null -eq $phase65Failure); scope='Huawei USB interfaces projected only for original serial hash or observed phone PID_1101; existing HDC port 8710'; count=$phase65Rows.Count; interfaces=$phase65Rows; failure=$phase65Failure; sharedHdcPort=$phase65Port; rawIdentifiersRetained=$false; driversOrSettingsChanged=$false; deviceCommandsExecuted=$false }
[IO.File]::WriteAllText((Join-Path (Get-Location) 'evidence/phase65-usb-inspection.json'), (($phase65Report | ConvertTo-Json -Depth 7) + "`n"), [Text.UTF8Encoding]::new($false))
$phase65Report | ConvertTo-Json -Depth 7
