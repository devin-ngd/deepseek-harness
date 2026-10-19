/** Offline native entry; no credentials, IPC, desktop transport or device permissions. */
import { UIAbility } from '@kit.AbilityKit'
import { window } from '@kit.ArkUI'
import { NativeLifecycle } from '../native/NativeLifecycle'

export default class EntryAbility extends UIAbility {
  onBackground(): void { void NativeLifecycle.background() }
  onForeground(): void { void NativeLifecycle.foreground() }
  async onDestroy(): Promise<void> { await NativeLifecycle.destroy() }
  onWindowStageCreate(stage: window.WindowStage): void {
    stage.loadContent('pages/Index', (error) => {
      if (error.code !== 0) console.error('Offline lab page failed to load: ' + error.code)
    })
  }
}
