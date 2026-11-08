/** Local-only resource fixtures for actual ArkWeb interception; no device identity, Host, network or model is used. */
import { util } from '@kit.ArkTS'
import { common } from '@kit.AbilityKit'
import { NativeAssets } from '../../harmony/entry/src/main/ets/native/NativeAssets'
import { NativeWorkspaceProduct } from '../../harmony/entry/src/main/ets/product/NativeWorkspaceProduct'

interface FixtureRequest { operation: string }
interface FixtureResource { path: string; bytes: number; sha256: string; mediaType: string }
interface FixtureManifest { revision: string; resources: FixtureResource[] }
const origin = 'https://workspace.dsh.invalid'
const emptySha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

/** Supplies one static document and controlled empty, failed and root resources to the unchanged native owner. */
export class WorkspaceResourceProduct implements NativeWorkspaceProduct {
  private readonly assets: NativeAssets
  private rootFailure: boolean = false
  constructor(context: common.UIAbilityContext) { this.assets = new NativeAssets(context) }
  initialize(): Promise<string> { return Promise.resolve('workspace-resource-fixture') }
  workspaceGeneration(): number { return 1 }
  failRoot(): void { this.rootFailure = true }
  workspaceContext(): Promise<string> { return Promise.resolve(JSON.stringify({ origin, generation: 1 })) }
  workspacePrepare(_id: string, _generation: number): Promise<string> {
    const manifest: FixtureManifest = { revision: 'a'.repeat(64), resources: [
      { path: '/empty.css?read=1', bytes: 0, sha256: emptySha, mediaType: 'text/css' },
      { path: '/empty.css?read=2', bytes: 0, sha256: emptySha, mediaType: 'text/css' },
    ] }
    return Promise.resolve(JSON.stringify(manifest))
  }
  workspaceRequest(_id: string, raw: string, _generation: number): Promise<string> {
    const request = JSON.parse(raw) as FixtureRequest
    if (request.operation === 'bootstrap') return Promise.resolve(JSON.stringify({ id: 'fixture-boot', bytes: 2 }))
    if (request.operation === 'read') return Promise.resolve(JSON.stringify({ offset: 0, body: 'W10', done: true }))
    return Promise.resolve('null')
  }
  workspaceResource(_id: string, url: string, _generation: number, _maxBytes: number, _maxChunkBytes: number): Promise<string> {
    console.info('WORKSPACE_RESOURCE_REQUEST ' + url.slice(origin.length))
    if (url === origin + '/optional.css') return Promise.reject(new Error('controlled optional resource failure'))
    if (url === origin + '/') {
      if (this.rootFailure) return Promise.reject(new Error('controlled root resource failure'))
      const content = new util.TextEncoder().encodeInto(this.assets.read('workspace-resource-document.html'))
      const body = new util.Base64Helper().encodeToStringSync(content, util.Type.BASIC_URL_SAFE)
      return Promise.resolve(JSON.stringify({ status: 200, headers: [['content-type', 'text/html; charset=utf-8']], body }))
    }
    const empty = url === origin + '/empty.css?read=1' || url === origin + '/empty.css?read=2'
    return Promise.resolve(JSON.stringify({ status: empty ? 200 : 404, headers: [['content-type', 'text/css'], ['cache-control', 'no-store']], body: '' }))
  }
  cancelWorkspaceRequest(_id: string): void {}
}
