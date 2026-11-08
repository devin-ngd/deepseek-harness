/** Actual device facade feeds the native Index; only the public test identity and loopback frame transport are substituted. */
import { common } from '@kit.AbilityKit'
import { NativeProductOwner, NativeProductConfiguration } from '../../harmony/entry/src/main/ets/product/NativeProductOwner'
import { ProductView } from '../../harmony/entry/src/main/ets/product/ProductView'
import { WorkspaceCipherProduct } from './WorkspaceCipherProduct'

export class CreationCipherProduct extends NativeProductOwner {
  private fixture: WorkspaceCipherProduct | undefined = undefined
  private fixtureGeneration: number = 0
  private readonly selectInitialSession: boolean
  private readonly reconnectReview: boolean
  constructor(config: NativeProductConfiguration, selectInitialSession: boolean = false, reconnectReview: boolean = false) {
    super(config)
    this.selectInitialSession = selectInitialSession
    this.reconnectReview = reconnectReview
  }
  async initialize(context: common.UIAbilityContext, publish: (view: string) => void): Promise<void> {
    const generation = ++this.fixtureGeneration
    const fixture = new WorkspaceCipherProduct(context, (raw: string) => {
      if (generation !== this.fixtureGeneration) return
      const view = JSON.parse(raw) as ProductView
      view.connectionGeneration = generation
      view.storageRecoveryAudit = ''; view.storageRecovery = ''; view.startupStorage = ''
      publish(JSON.stringify(view))
    })
    this.fixture = fixture
    const sessionId = await fixture.initialize()
    if (this.selectInitialSession) await fixture.select(sessionId)
  }
  connectionEnabled(): boolean { return this.reconnectReview && this.fixture !== undefined }
  connectionHost(): string { return this.connectionEnabled() ? '127.0.0.1' : '' }
  deviceBindingMode(): boolean { return true }
  private provider(): WorkspaceCipherProduct { if (this.fixture === undefined) throw new Error('creation cipher not initialized'); return this.fixture }
  connect(approved: boolean): Promise<void> { if (!this.reconnectReview) throw new Error('fixture reconnect disabled'); return this.provider().connect(approved) }
  stopRoute(): Promise<void> { if (!this.reconnectReview) throw new Error('fixture reconnect disabled'); return this.provider().stopRoute() }
  creationOptions(): Promise<string> { return this.provider().creationOptions() }
  manage(raw: string): Promise<string> { return this.provider().manage(raw) }
  select(sessionId: string): Promise<void> { return this.provider().select(sessionId) }
  refreshSessions(): Promise<void> { return this.provider().refreshSessions() }
  submit(request: string, text: string): Promise<string> { return this.provider().submit(request, text) }
  receipt(request: string): Promise<string> { return this.provider().receipt(request) }
  cancel(): Promise<void> { return this.provider().cancel() }
  workspaceGeneration(): number { return this.provider().workspaceGeneration() }
  workspaceContext(): Promise<string> { return this.provider().workspaceContext() }
  workspacePrepare(id: string, generation: number): Promise<string> { return this.provider().workspacePrepare(id, generation) }
  workspaceRequest(id: string, raw: string, generation: number): Promise<string> { return this.provider().workspaceRequest(id, raw, generation) }
  workspaceResource(id: string, url: string, generation: number, maxBytes: number, maxChunkBytes: number): Promise<string> { return this.provider().workspaceResource(id, url, generation, maxBytes, maxChunkBytes) }
  cancelWorkspaceRequest(id: string): void { this.provider().cancelWorkspaceRequest(id) }
  foreground(): Promise<void> { return Promise.resolve() }
  async close(): Promise<void> { ++this.fixtureGeneration; await this.fixture?.close() }
}
