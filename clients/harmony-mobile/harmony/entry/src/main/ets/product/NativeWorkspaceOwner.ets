/** One trusted standard workspace. Native identity, rich guests and another connection generation never share its port. */
import { webview } from '@kit.ArkWeb'
import { util } from '@kit.ArkTS'
import { common } from '@kit.AbilityKit'
import { NativeAssets } from '../native/NativeAssets'
import { NativeWorkspaceProduct } from './NativeWorkspaceProduct'
import { workspaceDiagnosticFailure, workspacePortMessage } from './ProductCore'
import { NativeWorkspaceRich } from './NativeWorkspaceRich'
import { NativeWorkspaceRichGuest, NativeWorkspaceRichPolicy } from './NativeWorkspaceRichGuest'
import { NativeWorkspaceCache, NativeWorkspaceCachePolicy } from './NativeWorkspaceCache'
import { NativeWebRenderer } from './NativeWebRenderer'

export interface NativeWorkspacePolicy { cache?: NativeWorkspaceCachePolicy; rich?: NativeWorkspaceRichPolicy; closeTimeoutMs: number; maxResourceRequests: number; maxQueuedResources: number; maxPending: number; maxPacketBytes: number; maxRequestBytes: number; maxResponseBytes: number; maxChunkBytes: number }
interface PolicyDocument { workspace?: NativeWorkspacePolicy }
interface WorkspaceContext { origin: string; generation: number }
interface WorkspaceDocumentLimits { origin: string; maxPending: number; maxPacketBytes: number; maxRequestBytes: number; maxResponseBytes: number; maxChunkBytes: number }
interface WorkspaceDocumentInit { protocol: string; sessionId: string; plugin?: string; limits: WorkspaceDocumentLimits; rich?: NativeWorkspaceRichPolicy }
interface ResourceWait { generation: number; resolve: (allowed: boolean) => void }
interface PortMessage { kind: string; id?: string; request?: string; sessionId?: string | null; stage?: string }
interface ResourceResult { status: number; headers: string[][]; body: string }
interface BootAssets { loaded: number; cacheHits: number; httpErrors: number; resourceErrors: number; cacheErrors: number; queueRejected: number; pluginErrors: number }
/** A new owner/document generation is opened explicitly and discarded on back, navigation, disconnect or background. */
export class NativeWorkspaceOwner {
  controller: webview.WebviewController = new webview.WebviewController()
  private renderer: NativeWebRenderer | undefined = undefined
  private viewId: number = 0
  private readonly identity: string = util.generateRandomUUID(false)
  private readonly product: NativeWorkspaceProduct
  private readonly policy: NativeWorkspacePolicy | undefined
  private code: string = ''
  private origin: string = ''
  private connectionGeneration: number = -1
  private generation: number = 0
  private openAttempt: number = 0
  private counter: number = 0
  private target: string = ''
  private plugin: string | undefined = undefined
  private selected: string = ''
  private closed: boolean = true
  private navigated: boolean = false
  private failed: boolean = false
  private port: webview.WebMessagePort | undefined = undefined
  private readonly work: Set<Promise<void>> = new Set()
  private readonly requests: Set<string> = new Set()
  private activeResources: number = 0
  private readonly queuedResources: ResourceWait[] = []
  private bootAssets: BootAssets | undefined = undefined
  private closing: Promise<void> | undefined = undefined
  private hostCloseUnconfirmed: boolean = false
  private nativeRich: NativeWorkspaceRich | undefined = undefined
  private context: common.UIAbilityContext | undefined = undefined
  private readonly cache: NativeWorkspaceCache | undefined
  private publish: (state: string) => void = () => {}

  constructor(product: NativeWorkspaceProduct, policyJson: string) { this.product = product; this.policy = (JSON.parse(policyJson) as PolicyDocument).workspace; this.cache = this.policy?.cache === undefined ? undefined : new NativeWorkspaceCache(this.policy.cache) }
  /** Configure ArkWeb before the first Web component. Failure leaves native chat usable and prevents workspace requests. */
  initialize(context: common.UIAbilityContext, publish: (state: string) => void): void {
    this.context = context; this.publish = publish
    if (this.policy === undefined || this.code.length > 0) return
    try {
      webview.WebviewController.setRenderProcessMode(webview.RenderProcessMode.MULTIPLE)
      webview.WebviewController.setWebDestroyMode(webview.WebDestroyMode.FAST_MODE)
      if (webview.WebviewController.getRenderProcessMode() !== webview.RenderProcessMode.MULTIPLE) throw new Error('native workspace renderer isolation unavailable')
      this.code = 'if(window.top===window){' + new NativeAssets(context).read('workspace-document.js') + '}'
    } catch (error) { void error; this.documentFailure('native-init') }
  }
  supported(): boolean { return this.policy !== undefined }
  /** Report an active startup failure before a workspace Web document has been mounted. */
  startupFailure(error: Error): string {
    if (this.policy !== undefined && this.code.length === 0) return 'native-init'
    const category = workspaceDiagnosticFailure(error)
    if (category !== 'cancelled') console.warn('DSH_WORKSPACE_RPC operation=prepare failure=' + category)
    return category
  }
  private documentFailure(stage: string): void {
    if (this.failed) return
    this.failed = true
    console.warn('DSH_WORKSPACE_LOAD stage=' + stage)
    if (stage === 'renderer-boot' && this.bootAssets !== undefined) {
      console.warn('DSH_WORKSPACE_BOOT_ASSETS ' + JSON.stringify(this.bootAssets))
    }
    this.bootAssets = undefined
    this.publish('failed')
  }
  selectedSession(): string { return this.selected }
  /** @returns the package target retained for retry; undefined opens the normal workspace and '' opens the plugin list. */
  pluginTarget(): string | undefined { return this.plugin }
  /** Identifies the native Web component; old component callbacks cannot mutate its replacement. */
  viewGeneration(): number { return this.viewId }
  /** Native-selected token keeps a replacement Web distinct from its predecessor. */
  renderToken(): string { return this.identity + '-' + this.viewId }
  /** The standard client sees a public origin and budgets, never a key, ticket or native product object. */
  scripts(viewId: number = this.viewId): ScriptItem[] { return viewId !== this.viewId || this.origin.length === 0 ? [] : [{ script: this.code, scriptRules: [this.origin] }] }
  async open(sessionId: string, plugin?: string): Promise<void> {
    const attempt = ++this.openAttempt
    let previousCloseError: Error | undefined
    try { await this.closeCurrent() }
    catch (error) {
      const failure: Error = error instanceof Error ? error : new Error('native workspace cleanup failed')
      if (!this.hostCloseUnconfirmed) throw failure
      previousCloseError = failure
    }
    if (attempt !== this.openAttempt) throw new Error('native workspace startup retired')
    if (this.policy === undefined) throw new Error('native workspace not configured')
    if (this.code.length === 0) throw new Error('native workspace initialization unavailable')
    const selected = JSON.parse(await this.product.workspaceContext()) as WorkspaceContext
    if (attempt !== this.openAttempt) throw new Error('native workspace startup retired')
    // Only a replacement connection owns a separate Host workspace.
    if (previousCloseError !== undefined && selected.generation === this.connectionGeneration) throw previousCloseError
    this.controller = new webview.WebviewController(); this.viewId++
    const viewId = this.viewId
    this.renderer = new NativeWebRenderer(this.controller, this.policy.closeTimeoutMs, () => { if (viewId === this.viewId) this.publish('unmount') })
    this.connectionGeneration = selected.generation; this.origin = selected.origin; this.target = sessionId; this.selected = sessionId; this.plugin = plugin
    this.bootAssets = { loaded: 0, cacheHits: 0, httpErrors: 0, resourceErrors: 0, cacheErrors: 0, queueRejected: 0, pluginErrors: 0 }
    this.closed = false; this.navigated = false; this.failed = false; this.closing = undefined; this.hostCloseUnconfirmed = false; this.generation++; this.publish('loading')
    const generation = this.generation, key = this.key('prepare')
    const preparation = this.product.workspacePrepare(key, this.connectionGeneration).then((manifest: string) => {
      if (this.closed || generation !== this.generation) throw new Error('native workspace startup retired')
      this.cache?.select(this.origin, manifest)
    })
    this.track(key, preparation.catch((error: Error) => { void error /* The opening caller owns preparation failure reporting. */ }))
    try { await preparation; if (this.closed || generation !== this.generation) throw new Error('native workspace startup retired') }
    catch (error) { const failure: Error = error instanceof Error ? error : new Error('native workspace startup failed'); if (!this.closed && generation === this.generation) { this.failed = true; this.publish('failed'); await this.close() }; throw failure }
    if (this.policy.rich !== undefined && this.context !== undefined) {
      this.nativeRich = new NativeWorkspaceRich(new NativeAssets(this.context), this.policy.rich, (lease: string, packet: string, id?: string) => {
        if (!this.closed && generation === this.generation) this.port?.postMessageEvent(JSON.stringify({ kind: 'workspace.rich-packet', lease, packet, id }))
      }, (opened: boolean) => { if (viewId === this.viewId && (!opened || !this.closed && generation === this.generation)) this.publish(opened ? 'rich-open' : 'rich-closed') })
    }
  }
  richGuest(): NativeWorkspaceRichGuest | undefined { return this.nativeRich?.view() }
  richClose(): Promise<void> { return this.nativeRich?.closeView() ?? Promise.resolve() }
  richDiscard(): Promise<void> { return this.nativeRich?.discardView() ?? Promise.resolve() }
  attached(viewId: number = this.viewId): void {
    if (viewId !== this.viewId || this.closed || this.failed) return
    try {
      this.renderer?.attach()
      webview.WebviewController.setWebDebuggingAccess(false)
      this.controller.loadUrl(this.origin + '/')
    } catch (error) { void error; this.failNativeStartup('controller-attach') }
  }
  allow(url: string, main: boolean, viewId: number = this.viewId): boolean { return viewId === this.viewId && !this.closed && (main ? url === this.origin + '/' || url === 'about:blank' && !this.navigated : url === 'about:blank' || url.startsWith(this.origin + '/') || url.startsWith('data:') || url.startsWith('blob:' + this.origin + '/')) }
  navigation(url: string, viewId: number = this.viewId): void { if (viewId !== this.viewId || this.closed) return; if (url === this.origin + '/') this.navigated = true; if (!this.allow(url, true)) void this.close().catch((error: Error) => { void error; this.publish('failed') }) }
  private key(kind: string): string { return 'w-' + this.identity + '-' + this.generation + '-' + kind + '-' + ++this.counter }
  private track(key: string, operation: Promise<void>, active: boolean = true): void {
    if (active) this.requests.add(key)
    this.work.add(operation)
    void operation.then(() => { this.requests.delete(key); this.work.delete(operation) }, () => { this.requests.delete(key); this.work.delete(operation) })
  }
  bind(url: string, viewId: number = this.viewId): void {
    const policy = this.policy
    if (viewId !== this.viewId || policy === undefined || this.closed || this.failed || this.port !== undefined || url !== this.origin + '/') return
    let ports: webview.WebMessagePort[] = []
    try {
      if (this.controller.getUrl() !== url) return
      ports = this.controller.createWebMessagePorts(false)
      if (ports.length !== 2) throw new Error('native workspace port denied')
      this.bindDocument(ports, policy)
    } catch (error) { void error; this.failNativeStartup('port-bind', ports) }
  }
  private bindDocument(ports: webview.WebMessagePort[], policy: NativeWorkspacePolicy): void {
    const port = ports[0], generation = this.generation; this.port = port
    port.onMessageEvent((raw: webview.WebMessage) => {
      if (this.closed || generation !== this.generation || port !== this.port || typeof raw !== 'string') return
      let message: PortMessage
      try { message = JSON.parse(workspacePortMessage(raw, policy.maxPacketBytes)) as PortMessage }
      catch (error) { void error; this.documentFailure('port-packet'); void this.close().catch((cleanup: Error) => { void cleanup }); return }
      if (message.kind === 'workspace.selection') { this.selected = message.sessionId ?? ''; return }
      if (message.kind === 'workspace.ready') { this.bootAssets = undefined; if (!this.failed) this.publish('ready'); return }
      if (message.kind === 'workspace.failed') { this.documentFailure(message.stage ?? 'unclassified'); return }
      const id = message.id ?? '', key = 'w-' + this.identity + '-' + generation + '-port-' + id
      if (message.kind === 'workspace.cancel') { this.product.cancelWorkspaceRequest(key); return }
      if (this.requests.has(key) || this.requests.size >= policy.maxPending) {
        console.warn('DSH_WORKSPACE_RPC operation=port failure=' + (this.requests.has(key) ? 'invalid-packet' : 'queue-full'))
        port.postMessageEvent(JSON.stringify({ kind: 'workspace.reply', id, value: 'null', error: true }))
        return
      }
      const request = message.kind === 'workspace.rich-request' ? this.nativeRich?.request(message.request ?? '') ?? Promise.reject(new Error('native rich carrier unavailable'))
        : this.product.workspaceRequest(key, message.request ?? '', this.connectionGeneration)
      const operation = request.then((value: string) => {
        if (!this.closed && generation === this.generation && port === this.port) port.postMessageEvent(JSON.stringify({ kind: 'workspace.reply', id, value, error: false }))
      }).catch((error: Error) => {
        void error
        if (!this.closed && generation === this.generation && port === this.port) port.postMessageEvent(JSON.stringify({ kind: 'workspace.reply', id, value: 'null', error: true }))
      })
      this.track(key, operation)
    })
    const init: WorkspaceDocumentInit = { protocol: 'harmony-workspace/1', sessionId: this.target, limits: { origin: this.origin,
      maxRequestBytes: policy.maxRequestBytes, maxResponseBytes: policy.maxResponseBytes, maxChunkBytes: policy.maxChunkBytes,
      maxPending: policy.maxPending - policy.maxResourceRequests, maxPacketBytes: policy.maxPacketBytes } }
    if (policy.rich !== undefined) init.rich = policy.rich
    if (this.plugin !== undefined) init.plugin = this.plugin
    this.controller.postMessage(JSON.stringify(init), [ports[1]], this.origin)
  }
  private failNativeStartup(stage: 'controller-attach' | 'port-bind', untransferredPorts: webview.WebMessagePort[] = []): void {
    this.documentFailure(stage)
    this.openAttempt++
    void this.closeCurrent(untransferredPorts).catch((error: Error) => { void error /* A retained cleanup rejection prevents unsafe reopening. */ })
  }
  /** Every resource is answered locally, including denied external URLs; ArkWeb never acquires its own Host connection. */
  intercept(request: WebResourceRequest, viewId: number = this.viewId): WebResourceResponse {
    const response = new WebResourceResponse(), url = request.getRequestUrl(), policy = this.policy
    response.setResponseCode(403); response.setReasonMessage('Workspace unavailable'); response.setResponseData(''); response.setResponseMimeType('text/plain'); response.setResponseEncoding('UTF-8')
    if (viewId !== this.viewId || this.closed || policy === undefined || !url.startsWith(this.origin + '/') || request.getRequestMethod() !== 'GET') return response
    const boot = this.bootAssets, pluginAsset = url.startsWith(this.origin + '/plugins/')
    const cached = this.cache?.get(url)
    if (cached !== undefined) {
      this.resourceResponse(response, cached)
      if (boot !== undefined) boot.cacheHits++
      return response
    }
    if (this.activeResources >= policy.maxResourceRequests && this.queuedResources.length >= policy.maxQueuedResources) {
      if (boot !== undefined) { boot.queueRejected++; if (pluginAsset) boot.pluginErrors++ }
      return response
    }
    response.setResponseIsReady(false)
    const generation = this.generation, key = this.key('asset')
    let checkingCache = false
    const operation = (async () => {
      if (!await this.resourceSlot(generation)) return
      if (this.closed || generation !== this.generation) { this.releaseResource(); return }
      this.requests.add(key)
      try {
      const raw = await this.product.workspaceResource(key, url, this.connectionGeneration, policy.maxResponseBytes, policy.maxChunkBytes)
      if (this.closed || generation !== this.generation) return
        checkingCache = true
      this.cache?.put(url, raw)
        checkingCache = false
      const result = JSON.parse(raw) as ResourceResult
      if (result.status >= 400 && url === this.origin + '/') this.documentFailure('document-response')
      this.resourceResponse(response, raw)
        if (boot !== undefined) {
          if (result.status >= 400) { boot.httpErrors++; if (pluginAsset) boot.pluginErrors++ }
          else boot.loaded++
        }
      } finally { this.requests.delete(key); this.releaseResource() }
    })().catch((error: Error) => {
      void error
      response.setResponseCode(502); response.setReasonMessage('Workspace resource unavailable'); response.setResponseData(new ArrayBuffer(0))
      if (!this.closed && generation === this.generation) {
        if (boot !== undefined) {
          if (checkingCache) boot.cacheErrors++
          else boot.resourceErrors++
          if (pluginAsset) boot.pluginErrors++
        }
        if (url === this.origin + '/') this.documentFailure('document-transfer')
      }
    })
      .finally(() => response.setResponseIsReady(true))
    this.track(key, operation, false)
    return response
  }
  private resourceResponse(response: WebResourceResponse, raw: string): void {
    const result = JSON.parse(raw) as ResourceResult
    response.setResponseCode(result.status); response.setReasonMessage('Workspace')
    const headers: Header[] = result.headers.map((row: string[]): Header => ({ headerKey: row[0], headerValue: row[1] }))
    response.setResponseHeader(headers)
    const media = result.headers.find((row: string[]) => row[0].toLowerCase() === 'content-type')
    response.setResponseMimeType(media === undefined ? 'application/octet-stream' : media[1].split(';')[0])
    response.setResponseData(result.body.length === 0 ? new ArrayBuffer(0) : new util.Base64Helper().decodeSync(result.body, util.Type.BASIC_URL_SAFE).slice().buffer)
  }
  private resourceSlot(generation: number): Promise<boolean> {
    if (this.closed || generation !== this.generation || this.policy === undefined) return Promise.resolve(false)
    if (this.activeResources < this.policy.maxResourceRequests) { this.activeResources++; return Promise.resolve(true) }
    return new Promise<boolean>(resolve => { this.queuedResources.push({ generation, resolve }) })
  }
  private releaseResource(): void {
    this.activeResources--
    const next = this.queuedResources.shift()
    if (next === undefined) return
    if (this.closed || next.generation !== this.generation) next.resolve(false)
    else { this.activeResources++; next.resolve(true) }
  }
  /** Native component callbacks cannot await teardown; the owner retains the failure for its page. */
  retire(viewId: number = this.viewId): void { if (viewId === this.viewId && !this.closed) void this.close().catch((error: Error) => { void error; this.failed = true; this.publish('failed') }) }
  /** An unexpected render exit retires the current document; Web detachment confirms removal separately. */
  exited(viewId: number = this.viewId): void { if (viewId !== this.viewId) return; if (!this.renderer?.exited() && !this.closed) { this.documentFailure('renderer-exit'); this.retire(viewId) } }
  close(): Promise<void> {
    this.openAttempt++
    return this.closeCurrent()
  }
  private closeCurrent(untransferredPorts: webview.WebMessagePort[] = []): Promise<void> {
    if (this.closing !== undefined) return this.closing
    if (this.closed) return Promise.resolve()
    this.closed = true; this.generation++; this.bootAssets = undefined
    for (const wait of this.queuedResources.splice(0)) wait.resolve(false)
    const port = this.port; this.port = undefined
    if (untransferredPorts.length === 0) {
      try { port?.postMessageEvent('{"kind":"workspace.closed"}') } catch (error) { void error; this.publish('failed') }
    }
    let portCloseFailed = false
    try { port?.close() } catch (error) { void error; portCloseFailed = true; this.publish('failed') }
    for (const pending of untransferredPorts) {
      if (pending === port) continue
      try { pending.close() } catch (error) { void error; portCloseFailed = true }
    }
    for (const key of this.requests) this.product.cancelWorkspaceRequest(key)
    const connection = this.connectionGeneration
    this.closing = (async () => {
      const rich = this.nativeRich; this.nativeRich = undefined
      let rendererFailed = false
      try { await rich?.close() } catch (error) { void error; rendererFailed = true }
      try { await this.renderer?.close() } catch (error) { void error; rendererFailed = true }
      const work = await Promise.allSettled(this.work); this.work.clear(); this.requests.clear()
      let current: number = -1
      try { current = this.product.workspaceGeneration() } catch (error) { void error /* A disconnected generation has already lost its Host workspace. */ }
      const nativeCleanupFailed = portCloseFailed || rendererFailed || work.some(result => result.status === 'rejected')
      if (current === connection) {
        try { await this.product.workspaceRequest(this.key('close'), '{"operation":"close"}', connection) }
        catch (error) {
          this.hostCloseUnconfirmed = !nativeCleanupFailed
          throw error instanceof Error ? error : new Error('Host workspace close unconfirmed')
        }
      }
      if (nativeCleanupFailed) throw new Error('native workspace cleanup failed')
    })()
    return this.closing
  }
}
