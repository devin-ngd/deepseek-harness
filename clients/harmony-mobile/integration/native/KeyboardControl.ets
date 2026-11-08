/** Offline comparison of ordinary ArkUI and ArkWeb input; no workspace, transport, credentials or model. */
import { common } from '@kit.AbilityKit'
import { window, KeyboardAvoidMode } from '@kit.ArkUI'
import { webview } from '@kit.ArkWeb'

@Entry
@Component
struct KeyboardControl {
  @State private keyboard: string = '{"height":0}'
  private controller: webview.WebviewController = new webview.WebviewController()
  private hostWindow: window.Window | undefined = undefined
  private observing: boolean = false
  private changed = (height: number): void => {
    const host = this.hostWindow
    if (host === undefined || !this.observing) return
    const area = host.getWindowAvoidArea(window.AvoidAreaType.TYPE_KEYBOARD).bottomRect
    this.keyboard = JSON.stringify({ height, top: area.top, areaHeight: area.height })
    console.info('KEYBOARD_CONTROL_HEIGHT ' + this.keyboard)
  }
  aboutToAppear(): void {
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE)
    webview.WebviewController.setRenderProcessMode(webview.RenderProcessMode.MULTIPLE)
    webview.WebviewController.setWebDestroyMode(webview.WebDestroyMode.FAST_MODE)
    this.observing = true
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext
    void window.getLastWindow(context).then((host: window.Window) => {
      if (!this.observing) return
      this.hostWindow = host; host.on('keyboardHeightChange', this.changed); this.changed(0)
    }).catch((error: Error) => { this.keyboard = error.message })
  }
  aboutToDisappear(): void {
    this.observing = false; this.hostWindow?.off('keyboardHeightChange', this.changed); this.hostWindow = undefined
  }
  build() {
    Column() {
      Text('Offline keyboard baseline').fontColor(Color.White).fontSize(18)
      TextInput({ placeholder: 'Native baseline' }).id('keyboard-control-native').height(48).maxLength(128)
      Text(this.keyboard).id('keyboard-control-height').fontColor(Color.White).fontSize(12)
      Web({ src: $rawfile('keyboard-control.html'), controller: this.controller, sharedRenderProcessToken: 'dsh-keyboard-control' })
        .javaScriptAccess(true).fileAccess(false).domStorageAccess(true).databaseAccess(false).onlineImageAccess(false)
        .geolocationAccess(false).multiWindowAccess(false).mixedMode(MixedMode.None)
        .onPermissionRequest((event: OnPermissionRequestEvent) => event.request.deny())
        .onConsole((event: OnConsoleEvent) => { console.info('KEYBOARD_CONTROL_WEB ' + event.message.getMessage()); return false })
        .width('100%').layoutWeight(1)
    }.width('100%').height('100%').backgroundColor('#0D0F13')
  }
}
