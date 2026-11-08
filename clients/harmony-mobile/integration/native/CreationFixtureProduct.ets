/** Test-only metadata provider for the unchanged native Index UI; no trust files, pairing, engine or model dispatch. */
import { common } from '@kit.AbilityKit'
import { NativeProductOwner, NativeProductConfiguration } from '../../harmony/entry/src/main/ets/product/NativeProductOwner'
import { ProductView, ProductSession, ProductProject } from '../../harmony/entry/src/main/ets/product/ProductView'
import { WorkspaceFixtureProduct } from './WorkspaceFixtureProduct'

interface Directory { sessions: ProductSession[]; projects: ProductProject[] }
interface Created { sessionId: string }
export class CreationFixtureProduct extends NativeProductOwner {
  private fixtureProvider: WorkspaceFixtureProduct | undefined = undefined
  private fixturePublish: (view: string) => void = () => {}
  private fixtureSelected: string = ''
  constructor(config: NativeProductConfiguration) { super(config) }
  async initialize(context: common.UIAbilityContext, publish: (view: string) => void): Promise<void> {
    this.fixtureProvider = new WorkspaceFixtureProduct(context); this.fixturePublish = publish
    await this.fixtureProvider.initialize(); await this.fixtureRefresh()
  }
  connectionEnabled(): boolean { return false }
  connectionHost(): string { return '' }
  creationOptions(): Promise<string> { return this.fixtureCall('creation-options') }
  async manage(raw: string): Promise<string> {
    const result = JSON.parse(await this.fixtureCall('creation-manage', raw)) as Created
    if (typeof result.sessionId !== 'string' || result.sessionId.length === 0) throw new Error('creation fixture result refused')
    this.fixtureSelected = result.sessionId; await this.fixtureRefresh(); return result.sessionId
  }
  async select(sessionId: string): Promise<void> { this.fixtureSelected = sessionId; await this.fixtureRefresh() }
  foreground(): Promise<void> { return Promise.resolve() }
  close(): Promise<void> { return Promise.resolve() }
  private fixtureCall(operation: string, raw?: string): Promise<string> {
    if (this.fixtureProvider === undefined) throw new Error('creation fixture not initialized')
    return this.fixtureProvider.creationOperation(operation, raw)
  }
  private async fixtureRefresh(): Promise<void> {
    const directory = JSON.parse(await this.fixtureCall('creation-directory')) as Directory
    const view = new ProductView(); view.pairing = 'paired'; view.connection = 'connected'; view.connectionGeneration = 1
    view.sessions = directory.sessions; view.projects = directory.projects; view.manageable = true; view.readOnly = false; view.selected = this.fixtureSelected
    this.fixturePublish(JSON.stringify(view))
  }
}
