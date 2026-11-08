/** Actual Index fixture backed by the isolated standard workspace Host; no native identity, pairing or engine is opened. */
import { common } from '@kit.AbilityKit'
import { NativeProductOwner, NativeProductConfiguration } from '../../harmony/entry/src/main/ets/product/NativeProductOwner'
import { ProductView } from '../../harmony/entry/src/main/ets/product/ProductView'
import { WorkspaceFixtureProduct } from './WorkspaceFixtureProduct'

export class PluginTargetHostProduct extends NativeProductOwner {
  private fixtureProvider: WorkspaceFixtureProduct | undefined = undefined
  private fixturePublish: (view: string) => void = () => {}
  private fixtureSession: string = ''
  constructor(config: NativeProductConfiguration) { super(config) }
  async initialize(context: common.UIAbilityContext, publish: (view: string) => void): Promise<void> {
    this.fixtureProvider = new WorkspaceFixtureProduct(context); this.fixturePublish = publish
    this.fixtureSession = await this.fixtureProvider.initialize(); this.publishView()
  }
  private provider(): WorkspaceFixtureProduct { if (this.fixtureProvider === undefined) throw new Error('fixture workspace not ready'); return this.fixtureProvider }
  private publishView(): void {
    const view = new ProductView(); view.pairing = 'paired'; view.connection = 'connected'; view.connectionGeneration = 1
    view.selected = this.fixtureSession; view.sessions = [{ sessionId: this.fixtureSession, projectId: null, title: 'Standard plugin panel fixture' }]
    this.fixturePublish(JSON.stringify(view))
  }
  deviceBindingMode(): boolean { return true }
  connectionEnabled(): boolean { return false }
  connectionHost(): string { return '' }
  foreground(): Promise<void> { return Promise.resolve() }
  close(): Promise<void> { return Promise.resolve() }
  refreshSessions(): Promise<void> { this.publishView(); return Promise.resolve() }
  select(sessionId: string): Promise<void> { if (sessionId !== this.fixtureSession) return Promise.reject(new Error('fixture Session denied')); this.publishView(); return Promise.resolve() }
  workspaceGeneration(): number { return this.provider().workspaceGeneration() }
  workspaceContext(): Promise<string> { return this.provider().workspaceContext() }
  workspacePrepare(id: string, generation: number): Promise<string> { return this.provider().workspacePrepare(id, generation) }
  workspaceRequest(id: string, raw: string, generation: number): Promise<string> { return this.provider().workspaceRequest(id, raw, generation) }
  workspaceResource(id: string, url: string, generation: number, maxBytes: number, maxChunkBytes: number): Promise<string> { return this.provider().workspaceResource(id, url, generation, maxBytes, maxChunkBytes) }
  cancelWorkspaceRequest(id: string): void { this.provider().cancelWorkspaceRequest(id) }
}
