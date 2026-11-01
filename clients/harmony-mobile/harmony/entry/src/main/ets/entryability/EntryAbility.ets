/** Offline native entry; no credentials, IPC, desktop transport or device permissions. The product UI is dark-only. */
import { ConfigurationConstant, UIAbility } from '@kit.AbilityKit'
import { window } from '@kit.ArkUI'
import { NativeLifecycle } from '../native/NativeLifecycle'

const PAGE_BACKGROUND: string = '#0D0F13'
const SYSTEM_BAR_CONTENT: string = '#E8EAF0'

export default class EntryAbility extends UIAbility {
  onBackground(): void { void NativeLifecycle.background() }
  onForeground(): void { void NativeLifecycle.foreground() }
  async onDestroy(): Promise<void> { await NativeLifecycle.destroy() }
  onWindowStageCreate(stage: window.WindowStage): void {
    // Colour mode and system-bar colours are cosmetic; a refusal must not block the page.
    try {
      this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_DARK)
    } catch (error) {
      console.warn('Dark colour mode refused: ' + (error as Error).message)
    }
    let main: window.Window | undefined = undefined
    try {
      main = stage.getMainWindowSync()
    } catch (error) {
      console.warn('Main window unavailable for colouring: ' + (error as Error).message)
    }
    main?.setWindowSystemBarProperties({ statusBarColor: PAGE_BACKGROUND, statusBarContentColor: SYSTEM_BAR_CONTENT, navigationBarColor: PAGE_BACKGROUND, navigationBarContentColor: SYSTEM_BAR_CONTENT }).catch((error: Error) => { console.warn('System bar colour refused: ' + error.message) })
    stage.loadContent('pages/Index', (error) => {
      if (error.code !== 0) { console.error('Offline lab page failed to load: ' + error.code); return }
      // The gesture-bar strip below the page shows the window background, not navigationBarColor.
      try {
        main?.setWindowBackgroundColor(PAGE_BACKGROUND)
      } catch (backgroundError) {
        console.warn('Window background colour refused: ' + (backgroundError as Error).message)
      }
    })
  }
}
