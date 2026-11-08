/** Test-only UI exercising real ArkWeb containers against a synthetic loopback Host. */
import { common } from '@kit.AbilityKit'
import { KeyboardAvoidMode } from '@kit.ArkUI'
import { window } from '@kit.ArkUI'
import { NativeWorkspaceOwner } from '../../harmony/entry/src/main/ets/product/NativeWorkspaceOwner'
import { WorkspaceSurface } from '../../harmony/entry/src/main/ets/product/WorkspaceSurface'
import { WorkspaceRichSurface } from '../../harmony/entry/src/main/ets/product/WorkspaceRichSurface'
import { NativeLifecycle } from '../../harmony/entry/src/main/ets/native/NativeLifecycle'
import { productConfiguration } from '../../harmony/entry/src/main/ets/product/ProductConfiguration'
import { WorkspaceFixtureProduct } from './WorkspaceFixtureProduct'

@Entry
@Component
struct WorkspaceReview {
  @State private state: string = 'initializing'
  @State private mounted: boolean = false
  @State private rich: boolean = false
  @State private busy: boolean = false
  @State private generation: number = 0
  @State private diagnostic: string = ''
  @State private keyboard: string = '{"height":0}'
  @State private measurement: string = '{}'
  private hostWindow: window.Window | undefined = undefined
  private observing: boolean = false
  private openedAt: number = 0
  private keyboardChanged: (height: number) => void = (height: number) => {
    const host = this.hostWindow
    if (host === undefined || !this.observing) return
    const rectangle = host.getWindowAvoidArea(window.AvoidAreaType.TYPE_KEYBOARD).bottomRect
    this.keyboard = JSON.stringify({ height, top: rectangle.top, areaHeight: rectangle.height, window: host.getWindowProperties().windowRect })
  }
  private owner: NativeWorkspaceOwner | undefined = undefined
  private product: WorkspaceFixtureProduct | undefined = undefined
  private session: string = ''
  aboutToAppear(): void {
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE)
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext
    this.observing = true
    void window.getLastWindow(context).then((host: window.Window) => {
      if (!this.observing) return
      this.hostWindow = host
      host.on('keyboardHeightChange', this.keyboardChanged)
      this.keyboardChanged(0)
    }).catch((error: Error) => { this.state = 'failed'; this.diagnostic = error.message })
    const product = new WorkspaceFixtureProduct(context), owner = new NativeWorkspaceOwner(product, productConfiguration.corePolicyJson)
    this.product = product; this.owner = owner
    owner.initialize(context, (state: string) => {
      if (state === 'unmount') this.mounted = false
      else if (state === 'rich-open') this.rich = true
      else if (state === 'rich-closed') this.rich = false
      else this.state = state
      if (state === 'ready') this.measurement = JSON.stringify({ phase: 'native-ready', elapsedMs: Date.now() - this.openedAt })
      console.info('WORKSPACE_FIXTURE_STATE ' + state)
    })
    NativeLifecycle.registerWorkspace(owner)
    this.run(async () => { this.session = await product.initialize(); await this.open() })
  }
  aboutToDisappear(): void {
    this.observing = false
    this.hostWindow?.off('keyboardHeightChange', this.keyboardChanged)
    this.hostWindow = undefined
    void this.owner?.close().catch((error: Error) => { console.error('WORKSPACE_FIXTURE_CLOSE ' + error.message) })
  }
  onBackPress(): boolean { this.run(async () => { if (this.rich) await this.owner?.richClose(); else { await this.owner?.close(); this.mounted = false; this.state = 'closed' } }); return true }
  private run(work: () => Promise<void>): void { if (this.busy) return; this.busy = true; void work().catch((error: Error) => { this.state = 'failed'; this.diagnostic = error.message; console.error('WORKSPACE_FIXTURE_ERROR ' + error.message) }).finally(() => { this.busy = false }) }
  private async open(plugin?: string): Promise<void> { const owner = this.owner; if (owner === undefined) throw new Error('native fixture owner missing'); this.openedAt = Date.now(); await owner.open(this.session, plugin); this.generation = owner.viewGeneration(); this.mounted = true; this.rich = false }
  private async close(): Promise<void> { const started = Date.now(); await this.owner?.close(); this.mounted = false; this.rich = false; this.state = 'closed'; this.measurement = JSON.stringify({ phase: 'native-closed', elapsedMs: Date.now() - started }) }
  private async inspect(): Promise<void> {
    if (this.owner === undefined || !this.mounted) return
    this.diagnostic = await this.owner.controller.runJavaScript('JSON.stringify({online:navigator.onLine,title:document.title,body:document.body.innerText.slice(0,2500),transport:typeof window.__DSH_TRANSPORT__,richCards:document.querySelectorAll("button[data-workspace-rich]").length})')
    console.error('WORKSPACE_FIXTURE_INSPECT ' + this.diagnostic)
  }
  build() {
    Column() {
      Text('Isolated workspace / ' + this.state).id('workspace-fixture-state').fontSize(14).fontColor(Color.White)
      Flex({ wrap: FlexWrap.Wrap }) {
        Button('Open').id('workspace-fixture-open').enabled(!this.busy).onClick(() => this.run(() => this.open()))
        Button('Plugins').id('workspace-fixture-plugins').enabled(!this.busy).onClick(() => this.run(() => this.open('')))
        Button('Back').id('workspace-fixture-back').enabled(!this.busy).onClick(() => this.run(async () => { if (this.rich) await this.owner?.richClose(); else await this.close() }))
        Button('Inspect').id('workspace-fixture-inspect').enabled(!this.busy).onClick(() => this.run(() => this.inspect()))
        Button('Network').id('workspace-fixture-network').enabled(!this.busy).onClick(() => this.run(async () => { await this.owner?.controller.runJavaScript('window.dispatchEvent(new Event("online"))'); await this.inspect() }))
      }.width('100%')
      TextInput({ placeholder: 'Native keyboard control' }).id('workspace-fixture-native-input').height(40).fontSize(14).maxLength(128)
      Text(this.diagnostic).id('workspace-fixture-diagnostic').fontSize(10).fontColor(Color.White).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis })
      Text(this.keyboard).id('workspace-fixture-keyboard').fontSize(10).fontColor(Color.White).maxLines(1)
      Text(this.measurement).id('workspace-fixture-measurement').fontSize(10).fontColor(Color.White).maxLines(1)
      Stack() {
        if (this.mounted && this.owner !== undefined) {
          ForEach([this.generation], (generation: number) => {
            WorkspaceSurface({ owner: this.owner!, generation }).visibility(this.rich ? Visibility.Hidden : Visibility.Visible)
          }, (generation: number) => generation.toString())
          if (this.rich) { WorkspaceRichSurface({ owner: this.owner.richGuest() }) }
        }
      }.layoutWeight(1).width('100%')
    }.width('100%').height('100%').backgroundColor('#0D0F13')
  }
}
