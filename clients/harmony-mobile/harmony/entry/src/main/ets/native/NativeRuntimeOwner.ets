/** Native-owned document/port/cache lifetimes. The offline UI has no production activation or approval RPC. */
import { common } from '@kit.AbilityKit'
import { webview } from '@kit.ArkWeb'
import { util } from '@kit.ArkTS'
import { NativeAssets } from './NativeAssets'
import { NativeCacheFile } from './NativeCacheFile'
import { NativeFailure } from './NativeFailure'
import { NativeDiagnostics } from './NativeDiagnostics'
import { isWireCursor, isWireNatural, isWireId } from '../generated/WireFields'
import { NativeFixtureBytes, NativeHttpStream, NativeStreamPolicy, NativeByteSink } from './NativeByteStream'
import { NativeHttpIo, NativeHttpIoPolicy, NativeHttpRead } from './NativeHttpIo'
import { NativeMessage, NativeView } from '../generated/NativePresentation'
import { NATIVE_REPLAY_TEST, NATIVE_ACCEPTANCE_TEST } from '../generated/NativeBuildMode'

/** Exact app-owned document origin; it is a base URL for local loadData, never a network destination. */
export const NATIVE_ORIGIN: string = 'https://dsh-runtime.invalid'
export const NATIVE_DOCUMENT: string = NATIVE_ORIGIN + '/offline/'

interface PortPolicy { generation: number; maxBytes: number; maxPending: number; timeoutMs: number }
interface HostPolicy { port: PortPolicy; maxFrames: number; chunkBytes: number; read: ReadPolicy; maxRows: number; domain: DomainPolicy }
interface DomainPolicy { maxText: number }
interface ReadPolicy { maxSnapshotBytes: number }
interface AppPolicy { schema: string; host: HostPolicy; nativeHttp: NativeStreamPolicy; nativeHttpIo: NativeHttpIoPolicy; maxResourceBytes: number; maxRuntimeBytes: number }
interface IoPayload { text?: string; chunkBytes?: number; maxBytes?: number; endpoint?: string; body?: string; handle?: string }
interface RuntimeView { sessionId: string; desktopId: string; task: string; connection: string; error: string; readOnly: boolean; messages: NativeMessage[]; hasMore: boolean; totalMessages: number; offline: boolean }
interface PortPacket { protocol: string; kind: string; id?: string; generation: number; method?: string; payload?: IoPayload; view?: RuntimeView; ok?: boolean; code?: string; value?: UiResult }
interface UiResult { saved?: boolean; restored?: boolean; error?: string; code?: string; probe?: string; passed?: boolean; forwarded?: number; previousInstance?: string; instance?: string; commandId?: string; operation?: string; generatedAt?: number; expiresAt?: number; ttlMs?: number; clockSource?: string; unit?: string; relayCursor?: number; kind?: string; payloadSha256?: string; domainCursor?: number; connection?: string; readOnly?: boolean; liveTextBytes?: number; liveTextSha256?: string }
interface NativeLiveMessageDiagnostic { sessionId: string; messageId: string; text: string; connection: string; readOnly: boolean; task: string; error: string }
interface IoReply { protocol: string; kind: string; id: string; generation: number; ok: boolean; value?: string | null | boolean | ByteReply | HttpBeginReply | NativeHttpRead; code?: string }
interface ByteReply { chunks: string[] }
interface HttpBeginReply { handle: string }
interface UiPacket { protocol: string; kind: string; id: string; generation: number; method: string; payload: UiPayload }
interface UiPayload { sessionId?: string; requestId?: string; text?: string }
interface BootstrapPacket { protocol: string; policy: HostPolicy; replay?: ReplayIdentity }
interface ReplayIdentity { desktopId: string; deviceId: string; sessionId: string; baseUrl: string }
/** Native-only probe result; no callback captures or forwards Web content. */
class PermissionProbeSink implements NativeByteSink {
  result: string = 'probe-unconfirmed'
  chunk(bytes: Uint8Array): void { void bytes; this.result = 'probe-unexpected-bytes' }
  end(): void { this.result = 'probe-unexpected-success' }
  failed(code: string): void { this.result = code }
}

/** UI owner receives validated display data; the Web renderer cannot confirm sensitive approvals. */
export class NativeRuntimeOwner {
  private diagnostics: NativeDiagnostics = new NativeDiagnostics()
  /** @returns sticky diagnostic failures; invalid product packets still retire the port. */
  get diagnosticFailures(): number { return this.diagnostics.failures }
  controller: webview.WebviewController = new webview.WebviewController()
  private assets: NativeAssets | null = null
  private cache: NativeCacheFile | null = null
  private bytes: NativeFixtureBytes | null = null
  private http: NativeHttpStream | null = null
  private httpIo: NativeHttpIo | null = null
  private permissionProbe: NativeHttpStream | null = null
  private policy: AppPolicy | null = null
  private port: webview.WebMessagePort | null = null
  private generation: number = 1
  private alive: boolean = false
  private ready: boolean = false
  private initialDocumentPending: boolean = true
  private loadingHtml: string = ''
  private timer: number = -1
  private publish: (view: NativeView) => void = () => {}
  private failed: (code: string) => void = () => {}
  private inFlight: Set<Promise<void>> = new Set()
  private closing: Promise<void> | null = null
  private closeAccept: (() => void) | null = null
  private closeId: string = ''
  private pendingId: string = ''
  private pendingMethod: string = ''
  private pendingTimer: number = -1
  private busy: (value: boolean) => void = () => {}
  private lastView: NativeView | null = null
  private selectedSession: string = ''

  /** @param context - native app directory/resource owner. @param publish - trusted ArkUI sink. @param failed - sanitized failure code owner; resource denial codes remain visible. @param busy - trusted pending-command sink. */
  initialize(context: common.UIAbilityContext, publish: (view: NativeView) => void, failed: (code: string) => void, busy: (value: boolean) => void): void {
    this.publish = publish; this.failed = failed; this.busy = busy
    this.busy(true)
    try { this.initializeVerified(context) }
    catch (error) { this.assets = null; this.policy = null; this.busy(false); this.failed(error instanceof NativeFailure ? error.code : 'native-initialize-failed') }
  }
  private initializeVerified(context: common.UIAbilityContext): void {
    this.assets = new NativeAssets(context)
    const policy = JSON.parse(this.assets.read('native-policy.json')) as AppPolicy
    if (policy.nativeHttp.enabled !== false || policy.nativeHttp.url !== '' || policy.host.port.generation !== 1) throw new NativeFailure('native-config-invalid')
    if (NATIVE_REPLAY_TEST) {
      if (policy.schema !== 'dsh-native-approved-replay-policy/1' || policy.nativeHttpIo.enabled !== true || policy.nativeHttpIo.baseUrl !== 'http://127.0.0.1:18081/') throw new NativeFailure('native-config-invalid')
    } else if (policy.schema !== 'dsh-native-offline-policy/1' || policy.nativeHttpIo.enabled !== false || policy.nativeHttpIo.baseUrl !== '') throw new NativeFailure('native-config-invalid')
    this.policy = policy
    this.cache = new NativeCacheFile(context.filesDir, policy.host.read.maxSnapshotBytes)
    this.bytes = new NativeFixtureBytes(policy.host.read.maxSnapshotBytes, policy.nativeHttp.maxChunkBytes)
    this.http = new NativeHttpStream(policy.nativeHttp)
    this.httpIo = new NativeHttpIo(policy.nativeHttpIo)
  }
  /** Native UI-only negative probe uses emulator loopback with no permission request, credential or real command. @returns sanitized SDK denial or unexpected outcome; this does not activate BFF transport. */
  async probeHttpPermission(): Promise<string> {
    if (this.policy === null || !this.alive || this.permissionProbe !== null) return 'probe-unavailable'
    const policy = this.policy.nativeHttp
    const request = new NativeHttpStream(new NativeStreamPolicy(true, 'http://127.0.0.1:1/mobile/command', policy.maxChunkBytes, policy.maxTotalBytes, policy.timeoutMs))
    this.permissionProbe = request
    const sink = new PermissionProbeSink()
    this.diagnostics.observe(() => 'DSH native HTTP permission probe started: emulator loopback, no permission declaration')
    try {
      await request.open('{}', sink)
      return sink.result
    } finally { await request.close(); this.permissionProbe = null; this.diagnostics.observe(() => 'DSH native HTTP permission probe result: ' + sink.result) }
  }
  /** Load verified code once the empty Web component has attached; no initial page completion is required. */
  attached(): void {
    this.diagnostics.observe(() => 'DSH native controller attached: ' + (this.policy === null ? 'uninitialized' : this.initialDocumentPending ? 'initial' : 'retired'))
    if (this.policy === null || !this.initialDocumentPending) return
    this.load()
  }
  /** Controller must be attached before this verified local-only loadData call. */
  load(): void {
    try { this.loadVerified() }
    catch (error) { this.failed(error instanceof NativeFailure ? error.code : 'native-load-failed'); void this.close() }
  }
  private loadVerified(): void {
    if (this.assets === null || this.policy === null) { this.failed('native-not-initialized'); return }
    this.initialDocumentPending = false; clearTimeout(this.timer)
    this.httpIo = new NativeHttpIo(this.policy.nativeHttpIo)
    this.alive = true; this.ready = false
    webview.WebviewController.setWebDebuggingAccess(false)
    webview.WebCookieManager.putAcceptCookieEnabled(false)
    webview.WebCookieManager.putAcceptThirdPartyCookieEnabled(false)
    const code = this.assets.read('native-offline-core.js').replace(/<\/script/gi, '<\\/script')
    const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; frame-src \'self\'; connect-src \'none\'; worker-src \'none\'; form-action \'none\'; base-uri \'none\'; object-src \'none\'"><style>html,body{margin:0;background:#101216}iframe{display:block;width:100%;height:240px;border:0}</style></head><body><iframe id="rich-frame" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe><script type="module">' + code + '</script></body></html>'
    if (new util.TextEncoder().encodeInto(html).byteLength > this.policy.maxRuntimeBytes) throw new NativeFailure('native-runtime-too-large')
    this.loadingHtml = html
    this.timer = setTimeout(() => { this.failed('native-document-timeout'); void this.close() }, this.policy.host.port.timeoutMs)
    this.controller.loadData(html, 'text/html', 'UTF-8', NATIVE_DOCUMENT, NATIVE_DOCUMENT)
    this.diagnostics.observe(() => 'DSH native verified document loaded')
  }
  /** @param url - actual main-document completion; navigation to any other document cannot obtain a port. */
  bind(url: string): void {
    try { this.bindVerified(url) }
    catch (error) { this.failed(error instanceof NativeFailure ? error.code : 'native-bind-failed'); void this.close() }
  }
  private bindVerified(url: string): void {
    this.diagnostics.observe(() => 'DSH native completed: ' + this.locationKind(url))
    if (!this.alive || this.port !== null || this.policy === null) return
    const actual = this.controller.getUrl()
    this.diagnostics.observe(() => 'DSH native document locations: ' + this.locationKind(url) + ', ' + this.locationKind(actual))
    if (actual !== NATIVE_DOCUMENT || url !== NATIVE_DOCUMENT && !this.exactLoadingData(url)) { this.failed('native-document-denied'); return }
    this.loadingHtml = ''; clearTimeout(this.timer)
    const ports = this.controller.createWebMessagePorts(false)
    if (ports.length !== 2) throw new NativeFailure('native-port-invalid')
    this.port = ports[0]
    const generation = this.generation, port = ports[0]
    port.onMessageEvent((raw: webview.WebMessage) => {
      if (!this.alive || this.port !== port || generation !== this.generation || typeof raw !== 'string') return
      const work = this.receive(raw, port, generation).catch((error: Error) => { void error; this.failed('native-port-failed'); void this.close() })
      this.inFlight.add(work); void work.finally(() => { this.inFlight.delete(work) })
    })
    this.policy.host.port.generation = generation
    const bootstrap: BootstrapPacket = { protocol: NATIVE_REPLAY_TEST ? 'dsh-native-replay-bootstrap/1' : 'dsh-native-bootstrap/1', policy: this.policy.host }
    if (NATIVE_REPLAY_TEST) bootstrap.replay = { desktopId: 'phase11-desktop', deviceId: 'phase11-phone', sessionId: 'phase11-session', baseUrl: 'http://127.0.0.1:18081/' }
    this.controller.postMessage(JSON.stringify(bootstrap), [ports[1]], NATIVE_ORIGIN)
    this.timer = setTimeout(() => { if (!this.ready) { this.failed('native-bootstrap-timeout'); void this.close() } }, this.policy.host.port.timeoutMs)
  }
  private locationKind(url: string): string {
    if (url === NATIVE_DOCUMENT) return 'document'
    if (url === NATIVE_ORIGIN || url === NATIVE_ORIGIN + '/') return 'origin'
    if (url === 'about:blank') return 'blank'
    if (url.startsWith('data:')) return 'data'
    if (url.startsWith(NATIVE_ORIGIN + '/')) return 'local-other'
    return 'other'
  }
  private async receive(raw: string, port: webview.WebMessagePort, generation: number): Promise<void> {
    if (this.policy === null || new util.TextEncoder().encodeInto(raw).byteLength > this.policy.host.port.maxBytes) throw new NativeFailure('native-packet-too-large')
    const packet = JSON.parse(raw) as PortPacket
    if (packet === null || Array.isArray(packet) || packet.protocol !== 'dsh-native-host/1' || packet.generation !== generation
      || Object.keys(packet).some(key => !['protocol', 'kind', 'id', 'generation', 'method', 'payload', 'view', 'ok', 'code', 'value'].includes(key))) throw new NativeFailure('native-packet-invalid')
    if (packet.kind === 'ready') { this.ready = true; clearTimeout(this.timer); this.busy(false); this.diagnostics.observe(() => 'DSH native core ready'); return }
    if (packet.kind === 'view') { if (this.closing === null) this.acceptView(packet.view); return }
    if (packet.kind === 'ui.reply') {
      if (packet.id === this.closeId && packet.ok === true) { this.closeAccept?.(); return }
      const method = packet.id === this.pendingId ? this.pendingMethod : ''
      if (packet.id === this.pendingId) { clearTimeout(this.pendingTimer); this.pendingId = ''; this.pendingMethod = ''; this.busy(false) }
      if (packet.ok === true && method === 'cache.save' && packet.value?.saved === true) this.diagnostics.observe(() => 'DSH native cache saved: true')
      if (packet.ok === true && method === 'cache.restore' && typeof packet.value?.restored === 'boolean') {
        const restored = packet.value.restored
        this.diagnostics.observe(() => 'DSH native cache restored: ' + restored.toString())
      }
      if (NATIVE_ACCEPTANCE_TEST && packet.id === 'native-acceptance-report' && packet.ok === true) {
        try { this.acceptDiagnostic(packet.value) }
        catch (error) { this.diagnostics.reject(error instanceof NativeFailure ? error.code : 'native-diagnostic-invalid') }
        return
      }
      if (packet.ok !== true) this.failed('native-operation-failed')
      return
    }
    if (packet.kind !== 'io' || typeof packet.id !== 'string' || packet.id.length > 128 || packet.payload === undefined || packet.payload === null || this.inFlight.size >= this.policy.host.port.maxPending) throw new NativeFailure('native-packet-invalid')
    const reply: IoReply = { protocol: 'dsh-native-host/1', kind: 'io.reply', id: packet.id, generation, ok: false }
    try {
      const payload = packet.payload
      if (this.closing !== null && packet.method !== 'http.close') throw new NativeFailure('native-http-retired')
      switch (packet.method) {
        case 'http.begin':
          if (Object.keys(payload).length !== 2 || typeof payload.endpoint !== 'string' || typeof payload.body !== 'string' || this.httpIo === null) throw new NativeFailure('native-packet-invalid')
          reply.value = { handle: this.httpIo.begin(payload.endpoint, payload.body) }; break
        case 'http.read':
          if (Object.keys(payload).length !== 1 || typeof payload.handle !== 'string' || payload.handle.length > 128 || this.httpIo === null) throw new NativeFailure('native-packet-invalid')
          reply.value = await this.httpIo.read(payload.handle); break
        case 'http.close':
          if (Object.keys(payload).length !== 1 || typeof payload.handle !== 'string' || payload.handle.length > 128 || this.httpIo === null) throw new NativeFailure('native-packet-invalid')
          reply.value = await this.httpIo.closeHandle(payload.handle); break
        case 'fixture.bytes':
          if (Object.keys(payload).length !== 2 || typeof payload.text !== 'string' || typeof payload.chunkBytes !== 'number') throw new NativeFailure('native-packet-invalid')
          if (this.bytes === null) throw new NativeFailure('native-not-initialized')
          reply.value = { chunks: this.bytes.split(payload.text, payload.chunkBytes) }; break
        case 'cache.read':
          if (Object.keys(payload).length !== 1 || typeof payload.maxBytes !== 'number' || this.cache === null) throw new NativeFailure('native-packet-invalid')
          reply.value = await this.cache.read(payload.maxBytes); break
        case 'cache.write':
          if (Object.keys(payload).length !== 1 || typeof payload.text !== 'string' || this.cache === null) throw new NativeFailure('native-packet-invalid')
          await this.cache.write(payload.text); reply.value = true; break
        case 'cache.clear':
          if (Object.keys(payload).length !== 0 || this.cache === null) throw new NativeFailure('native-packet-invalid')
          await this.cache.clear(); reply.value = true; break
        default: throw new NativeFailure('native-method-denied')
      }
      reply.ok = true
    } catch (error) { reply.code = error instanceof NativeFailure ? error.code : 'native-io-failed' }
    if (this.alive && this.port === port && generation === this.generation) port.postMessageEvent(JSON.stringify(reply))
  }
  private acceptDiagnostic(value: UiResult | undefined): void {
    if (value?.probe === 'observation-failed') {
      if (value.code !== 'native-observer-failed') throw new NativeFailure('native-acceptance-report-invalid')
      this.diagnostics.reject(value.code); return
    }
    if (value?.probe === 'command-generation') {
      if (typeof value.commandId !== 'string' || !isWireId(value.commandId) || typeof value.operation !== 'string' || value.operation.length > 64 || typeof value.generatedAt !== 'number' || !isWireNatural(value.generatedAt) || typeof value.expiresAt !== 'number' || !isWireNatural(value.expiresAt) || !Number.isSafeInteger(value.ttlMs) || value.ttlMs! < 1 || value.expiresAt! - value.generatedAt! !== value.ttlMs || value.clockSource !== 'ArkWeb monotonic epoch' || value.unit !== 'epoch-ms') throw new NativeFailure('native-command-diagnostic-invalid')
      this.diagnostics.observe(() => 'DSH native command generated: ' + JSON.stringify(value)); return
    }
    if (value?.probe === 'follow-decoded' || value?.probe === 'follow-admitted') {
      if (typeof value.commandId !== 'string' || !isWireId(value.commandId) || typeof value.instance !== 'string' || !isWireId(value.instance) || typeof value.relayCursor !== 'number' || !isWireCursor(value.relayCursor)) throw new NativeFailure('native-follow-diagnostic-invalid')
      if (value.probe === 'follow-decoded') {
        if (!['reset', 'event'].includes(value.kind ?? '') || typeof value.payloadSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.payloadSha256)) throw new NativeFailure('native-follow-diagnostic-invalid')
      } else if (typeof value.domainCursor !== 'number' || !isWireCursor(value.domainCursor) || !['connected', 'disconnected'].includes(value.connection ?? '') || typeof value.readOnly !== 'boolean' || !Number.isSafeInteger(value.liveTextBytes) || value.liveTextBytes! < 0 || typeof value.liveTextSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.liveTextSha256)) throw new NativeFailure('native-follow-diagnostic-invalid')
      this.diagnostics.observe(() => 'DSH native follow diagnostic: ' + JSON.stringify(value)); return
    }
    if (value === undefined || value.probe !== 'old-mount-generation' || typeof value.passed !== 'boolean' || !Number.isSafeInteger(value.forwarded) || value.forwarded! < 0 || typeof value.previousInstance !== 'string' || typeof value.instance !== 'string' || !isWireId(value.previousInstance) || !isWireId(value.instance)) throw new NativeFailure('native-acceptance-report-invalid')
    this.diagnostics.observe(() => 'DSH native acceptance report: ' + JSON.stringify(value))
  }
  private acceptView(view: RuntimeView | undefined): void {
    if (this.policy === null || view === undefined || view === null || view.desktopId !== (NATIVE_REPLAY_TEST ? 'phase11-desktop' : 'mock-desktop') || view.sessionId !== this.selectedSession || !(NATIVE_REPLAY_TEST ? ['phase11-session'] : ['mock-session-a', 'mock-session-b']).includes(view.sessionId)
      || !['idle', 'accepted', 'running', 'pending_confirmation', 'completed', 'cancel_requested', 'cancelled', 'failed', 'outcome_unknown'].includes(view.task) || !['connected', 'disconnected'].includes(view.connection) || typeof view.error !== 'string' || view.error.length > 128
      || typeof view.readOnly !== 'boolean' || typeof view.hasMore !== 'boolean' || typeof view.offline !== 'boolean' || !Array.isArray(view.messages) || view.messages.length > this.policy.host.maxRows + 1 || !Number.isSafeInteger(view.totalMessages) || view.totalMessages < 0) throw new NativeFailure('native-view-invalid')
    const rows: NativeMessage[] = []
    for (const row of view.messages) {
      if (row === null || typeof row.id !== 'string' || row.id.length > 256 || rows.some(previous => previous.id === row.id) || !['user', 'assistant', 'tool', 'system'].includes(row.role) || typeof row.text !== 'string' || row.text.length > this.policy.host.domain.maxText || typeof row.hasRich !== 'boolean' || typeof row.hasImage !== 'boolean' || !Number.isSafeInteger(row.imageWidth) || row.imageWidth < 0 || !Number.isSafeInteger(row.imageHeight) || row.imageHeight < 0) throw new NativeFailure('native-view-invalid')
      rows.push(new NativeMessage(row.id, row.role, row.text, row.hasRich, row.hasImage, row.imageWidth, row.imageHeight))
    }
    this.lastView = new NativeView(view.desktopId, view.task, view.connection, view.error, view.readOnly, rows, view.hasMore, view.totalMessages, view.offline)
    this.diagnostics.observe(() => 'DSH native view: ' + view.sessionId + ', ' + view.task + ', ' + view.connection + ', rows=' + rows.length.toString() + ', readOnly=' + view.readOnly.toString() + ', error=' + (/^[a-z0-9-]{1,128}$/.test(view.error) ? view.error : view.error.length > 0 ? 'present' : 'none'))
    if (NATIVE_ACCEPTANCE_TEST) {
      const live = rows.find(row => row.id === 'native-live-' + view.sessionId)
      if (live !== undefined && live.text.startsWith('DSH read checkpoint ') && live.text.length <= 256) {
        const diagnostic: NativeLiveMessageDiagnostic = { sessionId: view.sessionId, messageId: live.id, text: live.text, connection: view.connection, readOnly: view.readOnly, task: view.task, error: view.error }
        this.diagnostics.observe(() => 'DSH native live message admitted: ' + JSON.stringify(diagnostic))
      }
    }
    this.publish(this.lastView)
  }
  /** @param method - trusted ArkUI action only. @param sessionId - fixed demo selection. @param requestId - native-minted stable user intent. @param text - native composer contents. */
  command(method: string, sessionId: string = '', requestId: string = '', text: string = ''): void {
    if (!this.ready || this.port === null || this.policy === null || this.closing !== null || this.pendingId.length > 0 || !['connect.demo', 'submit', 'cancel', 'disconnect', 'cache.save', 'cache.restore'].includes(method)) { this.failed('native-not-ready'); return }
    const payload: UiPayload = {}
    if (method === 'connect.demo') { if (!(NATIVE_REPLAY_TEST ? ['phase11-session'] : ['mock-session-a', 'mock-session-b']).includes(sessionId)) throw new NativeFailure('native-scope-denied'); this.selectedSession = sessionId; payload.sessionId = sessionId }
    if (method === 'submit') { payload.requestId = requestId; payload.text = text }
    const packet: UiPacket = { protocol: 'dsh-native-host/1', kind: 'ui', id: util.generateRandomUUID(false), generation: this.generation, method, payload }
    this.pendingId = packet.id; this.pendingMethod = method; this.busy(true)
    this.pendingTimer = setTimeout(() => { this.failed('native-command-outcome-unknown'); void this.close() }, this.policy.host.port.timeoutMs)
    try { this.port.postMessageEvent(JSON.stringify(packet)) }
    catch (error) { void error; this.failed('native-command-outcome-unknown'); void this.close() }
  }
  /** @param url - requested Web URL. @param mainFrame - SDK frame identity, never a guest field. @returns only the local app document and iframe srcdoc may load. */
  allow(url: string, mainFrame: boolean): boolean {
    const allowed = mainFrame ? url === NATIVE_DOCUMENT || !this.ready && url === 'about:blank' || this.exactLoadingData(url) : url === 'about:srcdoc' || url === 'about:blank'
    this.diagnostics.observe(() => 'DSH native request: ' + (mainFrame ? 'main' : 'frame') + ', ' + this.locationKind(url) + ', ' + (allowed ? 'allowed' : 'denied'))
    return allowed
  }
  private exactLoadingData(url: string): boolean {
    if (!this.alive || this.ready || this.port !== null || this.loadingHtml.length === 0 || this.policy === null || url.length > this.policy.maxRuntimeBytes * 4) return false
    const comma = url.indexOf(','), metadata = url.substring(0, comma).toLowerCase()
    if (comma >= 0 && comma <= 80 && /^data:[a-z0-9/;=\-]+$/.test(metadata)) this.diagnostics.observe(() => 'DSH native data metadata: ' + metadata + ', chars=' + url.length.toString())
    if (comma < 0 || comma > 80) return false
    if (metadata === 'data:text/html;charset=utf-8;base64' || metadata === 'data:text/html;base64') {
      const expected = new util.Base64Helper().encodeToStringSync(new util.TextEncoder().encodeInto(this.loadingHtml)), payload = url.substring(comma + 1)
      return payload === expected || payload === encodeURIComponent(expected)
    }
    if (metadata !== 'data:text/html;charset=utf-8' && metadata !== 'data:text/html') return false
    try { return decodeURIComponent(url.substring(comma + 1)) === this.loadingHtml }
    catch (error) { void error; return false } // Malformed percent encoding cannot identify the verified document.
  }
  /** Reload only the verified local document after background cleanup; it cannot reconnect or submit. */
  async foreground(): Promise<void> { await this.closing; if (!this.alive && this.assets !== null) this.load() }
  /** @param url - SDK main-document navigation. Revoke a departed app document before any new page can keep its IO port. */
  navigation(url: string): void { if (!this.allow(url, true)) { this.failed('native-navigation-denied'); void this.close() } }
  /** Close shared core leases first with a bounded native acknowledgment; then revoke generation/port and drain native IO. */
  async close(): Promise<void> {
    if (this.closing !== null) return this.closing
    this.closing = this.dispose()
    try { await this.closing } finally { this.closing = null }
  }
  private async dispose(): Promise<void> {
    const port = this.port, canCloseCore = this.alive && this.ready && port !== null && this.policy !== null
    this.initialDocumentPending = false; this.loadingHtml = ''; this.ready = false; clearTimeout(this.timer); clearTimeout(this.pendingTimer); this.pendingId = ''; this.busy(false)
    if (canCloseCore && port !== null && this.policy !== null) {
      this.closeId = util.generateRandomUUID(false)
      await new Promise<void>((accept) => {
        const deadline = setTimeout(() => { this.failed('native-close-unconfirmed'); accept() }, this.policy!.host.port.timeoutMs)
        this.closeAccept = () => { clearTimeout(deadline); accept() }
        const packet: UiPacket = { protocol: 'dsh-native-host/1', kind: 'ui', id: this.closeId, generation: this.generation, method: 'close', payload: {} }
        try { port.postMessageEvent(JSON.stringify(packet)) }
        catch (error) { void error; this.failed('native-close-unconfirmed'); this.closeAccept?.() }
      })
    }
    this.closeAccept = null; this.closeId = ''; this.alive = false; this.generation++; this.port = null
    try { port?.close() } catch (error) { void error; this.failed('native-port-cleanup-failed') }
    try { await this.httpIo?.close() } catch (error) { void error; this.failed('native-http-cleanup-failed') }
    try { await this.http?.close() } catch (error) { void error; this.failed('native-http-cleanup-failed') }
    try { await this.permissionProbe?.close() } catch (error) { void error; this.failed('native-http-cleanup-failed') }
    await Promise.all(Array.from(this.inFlight)); this.inFlight.clear()
    const view = this.lastView
    if (view !== null) this.acceptView({ sessionId: this.selectedSession, desktopId: view.desktopId, task: view.task, connection: 'disconnected', error: view.error, readOnly: true, messages: view.messages, hasMore: view.hasMore, totalMessages: view.totalMessages, offline: view.offline })
  }
}
