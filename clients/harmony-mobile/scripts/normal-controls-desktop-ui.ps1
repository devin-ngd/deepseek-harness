# Operate only the approved DSH Plugin Manager. This helper never reads conversation rows or message bodies.
param([ValidateSet('locate','open-sidebar','click-sidebar','open-plugins','plugin-controls','open-install','fill-install','run-install','prepare-install','enable-installed-bundle')][string]$Action='locate')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class HarmonyDshWindow { [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd,int nCmdShow); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr info); }'
$dshProcesses=@(Get-Process -Name 'DeepSeek Harness' | Where-Object {$_.MainWindowHandle -ne 0})
if($dshProcesses.Count -ne 1){throw 'One DSH main window is required'}
$dshHandle=$dshProcesses[0].MainWindowHandle
[void][HarmonyDshWindow]::ShowWindowAsync($dshHandle,9)
[void][HarmonyDshWindow]::SetForegroundWindow($dshHandle)
Start-Sleep -Milliseconds 500
$dshForeground=([HarmonyDshWindow]::GetForegroundWindow() -eq $dshHandle)
$dshRoot=[System.Windows.Automation.AutomationElement]::FromHandle($dshHandle)
$dshLabels=Get-Content -LiteralPath '.build/normal-controls-ui-labels.json' -Raw | ConvertFrom-Json
function Find-DshNamed([string]$name){
  return $dshRoot.FindFirst([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,$name))
}
function Find-DshButton([string]$name){
  return $dshRoot.FindFirst([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.AndCondition]::new([System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,$name),[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)))
}
function Invoke-DshNamed($node){
  for($depth=0;$depth -lt 5 -and $null -ne $node;$depth++){
    if($node.Current.ControlType -eq [System.Windows.Automation.ControlType]::Window){break}
    $pattern=$null
    if($node.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)){
      if(!$node.Current.IsEnabled){throw 'Navigation control disabled'}
      if($node.Current.IsKeyboardFocusable){$node.SetFocus()}
      $pattern.Invoke()
      return
    }
    $node=[System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($node)
  }
  throw 'Named DSH control has no invocation action'
}
if($Action -eq 'prepare-install'){
  if($null -eq (Find-DshNamed $dshLabels.installSpecLabel)){
    $dshAdd=Find-DshButton $dshLabels.addPlugin
    if($null -eq $dshAdd){
      $dshPlugins=Find-DshNamed $dshLabels.panel
      if($null -eq $dshPlugins){
        $dshSidebar=Find-DshButton (-join [char[]]@(0x6253,0x5f00,0x4fa7,0x8fb9,0x680f))
        if($null -eq $dshSidebar){throw 'Expected desktop navigation controls unavailable'}
        Invoke-DshNamed $dshSidebar
        Start-Sleep -Milliseconds 800
        $dshPlugins=Find-DshNamed $dshLabels.panel
      }
      if($null -eq $dshPlugins){throw 'Plugin navigation unavailable after sidebar action'}
      Invoke-DshNamed $dshPlugins
      Start-Sleep -Milliseconds 800
      $dshAdd=Find-DshButton $dshLabels.addPlugin
    }
    if($null -eq $dshAdd){throw 'Plugin Manager was not established'}
    Invoke-DshNamed $dshAdd
    Start-Sleep -Milliseconds 800
    if($null -eq (Find-DshNamed $dshLabels.installSpecLabel)){throw 'Installation input was not established; no installation requested'}
  }
  $Action='fill-install'
}
if($Action -eq 'open-sidebar' -or $Action -eq 'click-sidebar'){
  $dshSidebar=Find-DshNamed (-join [char[]]@(0x6253,0x5f00,0x4fa7,0x8fb9,0x680f))
  if($null -eq $dshSidebar -or !$dshSidebar.Current.IsEnabled){throw 'Open sidebar button unavailable'}
  $dshSidebar.SetFocus()
  if($Action -eq 'click-sidebar'){
    if([HarmonyDshWindow]::GetForegroundWindow() -ne $dshHandle){throw 'DSH foreground required for mouse input'}
    $dshRect=$dshSidebar.Current.BoundingRectangle
    if($dshSidebar.Current.IsOffscreen -or $dshRect.Width -le 0 -or $dshRect.Height -le 0){throw 'Visible sidebar control required'}
    [void][HarmonyDshWindow]::SetCursorPos([int]($dshRect.X+$dshRect.Width/2),[int]($dshRect.Y+$dshRect.Height/2))
    [HarmonyDshWindow]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
    [HarmonyDshWindow]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  }else{$dshSidebar.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()}
  Start-Sleep -Milliseconds 800
  $dshStillClosed=($null -ne (Find-DshNamed (-join [char[]]@(0x6253,0x5f00,0x4fa7,0x8fb9,0x680f))))
  @{at=[DateTime]::UtcNow.ToString('o');sidebarOpened=(!$dshStillClosed);invoked=$true;otherSessionsRead=$false}|ConvertTo-Json -Compress
}elseif($Action -eq 'locate' -or $Action -eq 'open-plugins'){
  $dshPlugins=Find-DshButton $dshLabels.panel
  if($Action -eq 'open-plugins'){
    if($null -eq $dshPlugins){
      $dshSidebar=Find-DshNamed (-join [char[]]@(0x6253,0x5f00,0x4fa7,0x8fb9,0x680f))
      if($null -ne $dshSidebar -and $dshSidebar.Current.IsEnabled){
        $dshSidebar.SetFocus()
        $dshSidebar.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        Start-Sleep -Milliseconds 800
        $dshPlugins=Find-DshButton $dshLabels.panel
      }
    }
    if($null -eq $dshPlugins -or !$dshPlugins.Current.IsEnabled){throw 'DSH Plugin Manager button unavailable'}
    Invoke-DshNamed $dshPlugins
    Start-Sleep -Milliseconds 800
    @{at=[DateTime]::UtcNow.ToString('o');openedPlugins=$true;otherSessionsRead=$false}|ConvertTo-Json -Compress
  }else{
    @{at=[DateTime]::UtcNow.ToString('o');pluginButtonPresent=($null -ne $dshPlugins);foreground=$dshForeground;otherSessionsRead=$false}|ConvertTo-Json -Compress
  }
}elseif($Action -eq 'open-install'){
  $dshAdd=Find-DshButton $dshLabels.addPlugin
  if($null -eq $dshAdd){throw 'Add plugin button unavailable'}
  Invoke-DshNamed $dshAdd
  Start-Sleep -Milliseconds 800
  if($null -eq (Find-DshNamed $dshLabels.installSpecLabel)){throw 'Plugin installation input was not established'}
  @{at=[DateTime]::UtcNow.ToString('o');installDialogOpened=$true}|ConvertTo-Json -Compress
}elseif($Action -eq 'enable-installed-bundle'){
  $dshState=Get-Content -LiteralPath 'evidence/normal-controls-deployment.json' -Raw -Encoding UTF8 | ConvertFrom-Json
  $dshObserved=Get-Content -LiteralPath 'evidence/normal-controls-desktop-install-observation.json' -Raw -Encoding UTF8 | ConvertFrom-Json
  if($dshObserved.installedVersion -ne '0.0.0-normal-controls.1' -or !$dshObserved.onlyTargetManifestDependencyChanged){throw 'Exact installed package has not been verified'}
  $dshSubject=Find-DshNamed 'D:/Temp/dsh-experimental-harmony-mobile-0.0.0-normal-controls.1.tgz'
  if($null -eq $dshSubject -or $dshSubject.Current.IsOffscreen){throw 'Exact installed package not visible in current completion dialog'}
  $dshEnable=Find-DshButton $dshLabels.installEnableNow
  if($null -eq $dshEnable -or !$dshEnable.Current.IsEnabled){throw 'Normal enable-now action unavailable'}
  Invoke-DshNamed $dshEnable
  @{at=[DateTime]::UtcNow.ToString('o');enableExactInstalledBundleRequested=$true;grantStarted=$false}|ConvertTo-Json -Compress
}elseif($Action -eq 'fill-install' -or $Action -eq 'run-install'){
  $dshCandidate='D:/Temp/dsh-experimental-harmony-mobile-0.0.0-normal-controls.1.tgz'
  if((Get-FileHash -LiteralPath $dshCandidate -Algorithm SHA256).Hash.ToLowerInvariant() -ne '3a2212f0825b5698990b6c8b11ebd34e818e95934ad2a35599a104adde232892'){throw 'Approved plugin artifact changed'}
  $dshInput=Find-DshNamed $dshLabels.installSpecLabel
  if($null -eq $dshInput -or $dshInput.Current.ControlType -ne [System.Windows.Automation.ControlType]::Edit){throw 'Exact plugin input unavailable'}
  $dshValue=$dshInput.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
  if($Action -eq 'fill-install'){
    if($dshValue.Current.Value -ne '' -and $dshValue.Current.Value -ne $dshCandidate){throw 'Existing installation input retained'}
    $dshInput.SetFocus()
    $dshValue.SetValue($dshCandidate)
    Start-Sleep -Milliseconds 500
    $dshInput=Find-DshNamed $dshLabels.installSpecLabel
    if($null -eq $dshInput){throw 'Plugin installation input disappeared'}
    $dshValue=$dshInput.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if($dshValue.Current.Value -ne $dshCandidate){throw 'Plugin input did not retain exact approved path'}
    @{at=[DateTime]::UtcNow.ToString('o');exactPackageEntered=$true;installationStarted=$false}|ConvertTo-Json -Compress
  }else{
    if($dshValue.Current.Value -ne $dshCandidate){throw 'Plugin input differs from approved package'}
    $dshState=Get-Content -LiteralPath 'evidence/normal-controls-deployment.json' -Raw -Encoding UTF8 | ConvertFrom-Json
    $dshAttempt=Join-Path $dshState.run 'desktop-install-attempt.json'
    if(Test-Path -LiteralPath $dshAttempt){throw 'An installation attempt already exists; inspect without repeating'}
    $dshRun=Find-DshButton $dshLabels.installRun
    if($null -eq $dshRun -or !$dshRun.Current.IsEnabled){throw 'Normal install button unavailable'}
    [IO.File]::WriteAllText($dshAttempt,((@{at=[DateTime]::UtcNow.ToString('o');approval='Sentinel_e2d971bb3abc8191b9b8f261d185e4fb';artifact=$dshCandidate;outcome='unknown'}|ConvertTo-Json)+"`n"),[Text.UTF8Encoding]::new($false))
    Invoke-DshNamed $dshRun
    @{at=[DateTime]::UtcNow.ToString('o');normalInstallRequested=$true;outcome='verify-existing-only'}|ConvertTo-Json -Compress
  }
}else{
  if($null -eq (Find-DshNamed (-join [char[]]@(0x6dfb,0x52a0,0x63d2,0x4ef6)))){throw 'Plugin Manager page was not established'}
  $dshControls=$dshRoot.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.OrCondition]::new([System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit),[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)))
  foreach($dshNode in $dshControls){
    $dshName=$dshNode.Current.Name
    if($dshName -match '\u5b89\u88c5|\u63d2\u4ef6|\u6765\u6e90|\u5305|\u6587\u4ef6|Install|Plugin|\u5237\u65b0|\u8fd4\u56de'){
      @{name=$dshName;type=$dshNode.Current.ControlType.ProgrammaticName;id=$dshNode.Current.AutomationId;enabled=$dshNode.Current.IsEnabled}|ConvertTo-Json -Compress
    }
  }
}
