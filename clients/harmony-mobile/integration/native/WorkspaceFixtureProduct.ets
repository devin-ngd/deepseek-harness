/** Test-only loopback provider for the real native workspace owner; it is never included in the product HAP. */
import { http } from '@kit.NetworkKit'
import { common } from '@kit.AbilityKit'
import { NativeAssets } from '../../harmony/entry/src/main/ets/native/NativeAssets'
import { NativeWorkspaceProduct } from '../../harmony/entry/src/main/ets/product/NativeWorkspaceProduct'

interface FixtureConfiguration { schema: string; token: string }
interface FixtureMeta { sessionId: string; origin: string; generation: number }
interface FixtureOperation { operation: string; id: string; generation: number; raw?: string; url?: string; maxBytes?: number; maxChunkBytes?: number }
interface FixturePending { cancelled: boolean }
interface FixtureReply { state: string; value?: string }
/** The app alone owns this test token. Every IO destination is the explicit emulator loopback mapping. */
export class WorkspaceFixtureProduct implements NativeWorkspaceProduct {
  private readonly token: string
  private readonly requests: Map<string, FixturePending> = new Map()
  private meta: FixtureMeta | undefined = undefined
  private creationCounter: number = 0
  constructor(context: common.UIAbilityContext) {
    const config = JSON.parse(new NativeAssets(context).read('workspace-fixture.json')) as FixtureConfiguration
    if (config.schema !== 'harmony-workspace-native-fixture/1' || !/^[a-f0-9]{64}$/.test(config.token)) throw new Error('native fixture configuration refused')
    this.token = config.token
  }
  async initialize(): Promise<string> {
    const meta = JSON.parse(await this.request({ operation: 'meta', id: 'fixture-meta', generation: 1 })) as FixtureMeta
    if (meta.origin !== 'https://workspace.dsh.invalid' || meta.generation !== 1 || meta.sessionId.length === 0) throw new Error('native fixture identity refused')
    this.meta = meta; return meta.sessionId
  }
  workspaceGeneration(): number { if (this.meta === undefined) throw new Error('native fixture not ready'); return this.meta.generation }
  creationOperation(operation: string, raw?: string): Promise<string> {
    if (operation !== 'creation-options' && operation !== 'creation-directory' && operation !== 'creation-manage') throw new Error('creation fixture operation refused')
    return this.request({ operation, id: 'fixture-creation-' + ++this.creationCounter, generation: 1, raw })
  }
  workspaceContext(): Promise<string> { if (this.meta === undefined) return Promise.reject(new Error('native fixture not ready')); return Promise.resolve(JSON.stringify({ origin: this.meta.origin, generation: this.meta.generation })) }
  workspacePrepare(id: string, generation: number): Promise<string> { return this.request({ operation: 'prepare', id, generation }) }
  workspaceRequest(id: string, raw: string, generation: number): Promise<string> { return this.request({ operation: 'request', id, raw, generation }) }
  workspaceResource(id: string, url: string, generation: number, maxBytes: number, maxChunkBytes: number): Promise<string> { return this.request({ operation: 'resource', id, url, generation, maxBytes, maxChunkBytes }) }
  cancelWorkspaceRequest(id: string): void {
    const pending = this.requests.get(id); if (pending === undefined) return
    pending.cancelled = true
    void this.post({ operation: 'cancel', id, generation: 1 }).catch((error: Error) => { console.error('WORKSPACE_FIXTURE_CANCEL ' + error.message) })
  }
  private async request(value: FixtureOperation): Promise<string> {
    if (this.requests.has(value.id)) throw new Error('native fixture duplicate request')
    const pending: FixturePending = { cancelled: false }; this.requests.set(value.id, pending)
    try {
      let reply = await this.post(value)
      while (reply.state === 'pending') {
        if (pending.cancelled) throw new Error('native fixture request cancelled')
        await new Promise<void>(resolve => { setTimeout(resolve, 100) })
        if (pending.cancelled) throw new Error('native fixture request cancelled')
        reply = await this.post({ operation: 'poll', id: value.id, generation: value.generation })
      }
      if (pending.cancelled) throw new Error('native fixture request cancelled')
      if (reply.state !== 'ready' || reply.value === undefined) throw new Error('native fixture operation refused')
      return reply.value
    } catch (error) { const failure = error as Error; console.error('WORKSPACE_FIXTURE_IO ' + value.operation + ' ' + failure.message); throw failure }
    finally { this.requests.delete(value.id) }
  }
  private async post(value: FixtureOperation): Promise<FixtureReply> {
    const request = http.createHttp()
    try {
      const response = await request.request('http://127.0.0.1:18082/native', { method: http.RequestMethod.POST,
        header: { 'content-type': 'application/json', 'x-workspace-fixture': this.token }, extraData: JSON.stringify(value),
        expectDataType: http.HttpDataType.STRING, usingCache: false, connectTimeout: 10000, readTimeout: 10000, maxLimit: 33554432 })
      if (response.responseCode !== 200 || typeof response.result !== 'string') throw new Error('native fixture delivery refused')
      return JSON.parse(response.result) as FixtureReply
    } finally { request.destroy() }
  }
}
