/** Local presentation fixture for the actual Index and document-start bridge; no Host, identity, credentials or model is used. */
import { common } from '@kit.AbilityKit'
import { util } from '@kit.ArkTS'
import { NativeAssets } from '../../harmony/entry/src/main/ets/native/NativeAssets'
import { NativeProductOwner, NativeProductConfiguration } from '../../harmony/entry/src/main/ets/product/NativeProductOwner'
import { ProductView } from '../../harmony/entry/src/main/ets/product/ProductView'

const origin = 'https://workspace.dsh.invalid'
export class PluginTargetFixtureProduct extends NativeProductOwner {
  private fixtureAssets: NativeAssets | undefined = undefined
  private fixturePublish: (view: string) => void = () => {}
  private fixtureSelected: string = 'plugin-target-session'
  private fixtureGeneration: number = 1
  private startupRequest: string = ''
  private readonly replaceDuringStartup: boolean
  constructor(config: NativeProductConfiguration, replaceDuringStartup: boolean = false) { super(config); this.replaceDuringStartup = replaceDuringStartup }
  initialize(context: common.UIAbilityContext, publish: (view: string) => void): Promise<void> {
    this.fixtureAssets = new NativeAssets(context); this.fixturePublish = publish; this.publishView(); return Promise.resolve()
  }
  private publishView(): void {
    const view = new ProductView(); view.pairing = 'paired'; view.connection = 'connected'; view.connectionGeneration = this.fixtureGeneration
    view.selected = this.fixtureSelected; view.sessions = [{ sessionId: 'plugin-target-session', projectId: null, title: 'Plugin target fixture' }]
    this.fixturePublish(JSON.stringify(view))
  }
  deviceBindingMode(): boolean { return true }
  connectionEnabled(): boolean { return false }
  connectionHost(): string { return '' }
  foreground(): Promise<void> { return Promise.resolve() }
  close(): Promise<void> { return Promise.resolve() }
  refreshSessions(): Promise<void> { this.publishView(); return Promise.resolve() }
  select(sessionId: string): Promise<void> { if (sessionId !== 'plugin-target-session') return Promise.reject(new Error('fixture Session denied')); this.fixtureSelected = sessionId; this.publishView(); return Promise.resolve() }
  workspaceGeneration(): number { return this.fixtureGeneration }
  workspaceContext(): Promise<string> { return Promise.resolve(JSON.stringify({ origin, generation: this.fixtureGeneration })) }
  workspacePrepare(id: string, generation: number): Promise<string> {
    if (generation !== this.fixtureGeneration) return Promise.reject(new Error('fixture generation retired'))
    const manifest = JSON.stringify({ revision: 'b'.repeat(64), resources: [] })
    if (!this.replaceDuringStartup || this.fixtureGeneration !== 1) return Promise.resolve(manifest)
    this.startupRequest = id
    return new Promise<string>(resolve => {
      setTimeout(() => {
        this.fixtureGeneration++
        this.publishView()
        this.startupRequest = ''
        console.info('WORKSPACE_STARTUP_REPLACEMENT_DELIVERED')
        resolve(manifest)
      }, 0)
    })
  }
  workspaceRequest(_id: string, _raw: string, _generation: number): Promise<string> { return Promise.resolve('null') }
  workspaceResource(_id: string, url: string, _generation: number, _maxBytes: number, _maxChunkBytes: number): Promise<string> {
    if (url !== origin + '/' || this.fixtureAssets === undefined) return Promise.resolve(JSON.stringify({ status: 404, headers: [], body: '' }))
    const bytes = new util.TextEncoder().encodeInto(this.fixtureAssets.read('workspace-plugin-target.html'))
    const body = new util.Base64Helper().encodeToStringSync(bytes, util.Type.BASIC_URL_SAFE)
    return Promise.resolve(JSON.stringify({ status: 200, headers: [['content-type', 'text/html; charset=utf-8']], body }))
  }
  cancelWorkspaceRequest(id: string): void { if (id === this.startupRequest) console.info('WORKSPACE_STARTUP_REPLACEMENT_CANCELLED') }
}
