/** Disposable native renderers for untrusted rich documents, with main-owned transport and revocation. */
import { randomUUID } from 'node:crypto'
import { session, type IpcMainEvent, type Session, type WebContents } from 'electron'
import { DESKTOP_IPC, SCHEME } from './ipc.ts'
import { readRichPacket, readRichRequest, richDocument } from './rich-document.ts'
import type { DesktopRichBootstrap, DesktopRichReservation } from './rich-types.ts'

interface RichLease {
  readonly id: string
  readonly owner: WebContents
  readonly browserSession: Session
  readonly partition: string
  readonly mountId: string
  readonly mountNonce: string
  readonly documentUrl: string
  attached: boolean
  ready: boolean
  guest?: WebContents
  packetWindow: number
  packetCount: number
  cleanup?: Promise<void>
}

const fileGuard = '(()=>{const block=event=>{const transfer=event.dataTransfer||event.clipboardData;if(transfer&&(transfer.types.includes(\'Files\')||transfer.files.length)){event.preventDefault();event.stopImmediatePropagation()}};for(const type of [\'dragenter\',\'dragover\',\'drop\',\'paste\'])window.addEventListener(type,block,true);window.addEventListener(\'click\',event=>{const path=event.composedPath();if(path.some(node=>node instanceof HTMLInputElement&&node.type===\'file\')){event.preventDefault();event.stopImmediatePropagation()}},true)})()'
const networkGuard = '(()=>{for(const name of [\'RTCPeerConnection\',\'webkitRTCPeerConnection\'])Object.defineProperty(globalThis,name,{value:undefined,writable:false,configurable:false})})()'

/** Owns one memory partition and renderer for each committed rich mount. */
export class DesktopRichGuests {
  private readonly leases = new Map<string, RichLease>()
  private readonly byGuest = new WeakMap<WebContents, RichLease>()
  private readonly bySession = new Map<Session, RichLease>()

  /** @param preload - fixed, bundled guest preload; callers cannot choose it. */
  constructor(private readonly preload: string) {}

  /** @param owner - authenticated application renderer. @param value - untrusted IPC request. @returns inert reservation. */
  acquire(owner: WebContents, value: unknown): DesktopRichReservation {
    const request = readRichRequest(value)
    if ([...this.leases.values()].some(lease => lease.owner === owner && lease.mountId === request.mountId)) {
      throw new Error('desktop rich: mount already reserved')
    }
    const id = 'dsh-rich-' + randomUUID()
    const partition = id
    const browserSession = session.fromPartition(partition, { cache: false })
    const document = richDocument(request)
    const documentUrl = `${SCHEME}://${id}/`
    const lease: RichLease = { id, owner, browserSession, partition, mountId: request.mountId, mountNonce: request.mountNonce,
      documentUrl, attached: false, ready: false, packetWindow: 0, packetCount: 0 }
    this.leases.set(id, lease)
    this.bySession.set(browserSession, lease)
    browserSession.enableNetworkEmulation({ offline: true })
    browserSession.protocol.handle(SCHEME, (request) => {
      if (!this.leases.has(id) || request.url !== documentUrl || request.method !== 'GET') return new Response('', { status: 403 })
      return new Response(document.html, { headers: { 'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': document.policy, 'X-DNS-Prefetch-Control': 'off', 'Cache-Control': 'no-store' } })
    })
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => { callback(false) })
    browserSession.setPermissionCheckHandler(() => false)
    browserSession.setDevicePermissionHandler(() => false)
    browserSession.setDisplayMediaRequestHandler((_request, callback) => { callback({}) })
    browserSession.on('will-download', (event) => { event.preventDefault() })
    browserSession.webRequest.onBeforeRequest((details, callback) => {
      const protocol = new URL(details.url).protocol
      callback({ cancel: !this.leases.has(id) || !(details.url === documentUrl || ['about:', 'data:', 'blob:'].includes(protocol)) })
    })
    return { lease: id, partition, src: 'about:blank#' + id }
  }

  /**
   * @param owner - parent renderer. @param event - attachment event.
   * @param preferences - mutable Electron preferences. @param params - requested tag attributes.
   * @returns whether this manager handled the attachment.
   */
  prepareAttach(owner: WebContents, event: Electron.Event, preferences: Electron.WebPreferences, params: Record<string, string>): boolean {
    if (!params.src?.startsWith('about:blank#dsh-rich-')) return false
    const lease = this.leases.get(params.src.slice('about:blank#'.length))
    if (lease === undefined || lease.owner !== owner || lease.attached || params.partition !== lease.partition) {
      event.preventDefault()
      return true
    }
    lease.attached = true
    for (const key of Object.keys(preferences)) Reflect.deleteProperty(preferences, key)
    Object.assign(preferences, { partition: lease.partition, preload: this.preload,
      nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
      contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
      webviewTag: false, plugins: false, navigateOnDragDrop: false, disableDialogs: true, devTools: false })
    params.httpreferrer = ''
    return true
  }

  /** @param owner - parent renderer. @param guest - attached native renderer. @returns whether it belongs to a rich reservation. */
  bindGuest(owner: WebContents, guest: WebContents): boolean {
    const lease = this.bySession.get(guest.session)
    if (lease === undefined) return false
    if (lease.owner !== owner || !lease.attached || lease.guest !== undefined || !this.leases.has(lease.id)) {
      guest.close({ waitForBeforeUnload: false })
      return true
    }
    lease.guest = guest
    this.byGuest.set(guest, lease)
    guest.setWindowOpenHandler(() => ({ action: 'deny' }))
    guest.on('will-frame-navigate', (event) => { event.preventDefault() })
    guest.on('will-redirect', (event) => { event.preventDefault() })
    guest.on('will-attach-webview', (event) => { event.preventDefault() })
    guest.on('login', (event, _details, _info, callback) => { event.preventDefault(); callback() })
    guest.on('unresponsive', () => {
      void this.fail(lease, 'RENDERER_UNRESPONSIVE').catch((error: unknown) => { console.error('Unresponsive rich guest cleanup failed', error) })
    })
    guest.on('render-process-gone', () => {
      void this.fail(lease, 'RENDERER_GONE').catch((error: unknown) => { console.error('Crashed rich guest cleanup failed', error) })
    })
    guest.once('destroyed', () => {
      lease.ready = false
      this.byGuest.delete(guest)
      this.leases.delete(lease.id)
      this.bySession.delete(lease.browserSession)
      void this.cleanup(lease).catch((error: unknown) => { console.error('Destroyed rich guest cleanup failed', error) })
    })
    guest.once('dom-ready', () => {
      void this.start(lease, guest).catch(async (error: unknown) => {
        console.error('Rich guest failed to initialize', error)
        try { await this.fail(lease, 'CONTAINER_UNAVAILABLE') }
        catch (failure) { console.error('Rich guest initialization cleanup failed', failure) }
      })
    })
    return true
  }

  private async start(lease: RichLease, guest: WebContents): Promise<void> {
    if (guest.isDestroyed() || !this.leases.has(lease.id)) return
    const guestPid = guest.getOSProcessId()
    if (guestPid <= 0 || guestPid === lease.owner.getOSProcessId()) throw new Error('desktop rich: renderer isolation unavailable')
    guest.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
    guest.debugger.attach('1.3')
    guest.debugger.on('message', (_event, method, params: Record<string, unknown>) => {
      if (method !== 'Page.fileChooserOpened') return
      void guest.debugger.sendCommand('DOM.setFileInputFiles', { files: [], backendNodeId: params.backendNodeId }).catch(async (error: unknown) => {
        console.error('Rich guest file chooser interception failed', error)
        try { await this.fail(lease, 'FILE_CHOOSER_UNAVAILABLE') }
        catch (failure) { console.error('Rich guest chooser cleanup failed', failure) }
      })
    })
    await guest.debugger.sendCommand('Page.enable')
    await guest.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true, cancel: true })
    await guest.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: fileGuard, worldName: 'dsh-rich-file-guard' })
    await guest.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: networkGuard })
    if (!this.leases.has(lease.id) || guest.isDestroyed()) return
    lease.ready = true
    await guest.loadURL(lease.documentUrl)
  }

  /** @param event - synchronous request from an isolated preload. @returns registered identity only for its current main document. */
  bootstrap(event: Pick<IpcMainEvent, 'sender' | 'senderFrame'>): DesktopRichBootstrap | undefined {
    const lease = this.leaseForEvent(event)
    if (lease === undefined) return undefined
    return { mountId: lease.mountId, mountNonce: lease.mountNonce }
  }

  /** @param event - native caller. @param value - mount identity and JSON packet. */
  receive(event: Pick<IpcMainEvent, 'sender' | 'senderFrame'>, value: unknown): void {
    const lease = this.leaseForEvent(event)
    if (lease === undefined || typeof value !== 'object' || value === null || !('mountId' in value)
      || !('mountNonce' in value) || !('packet' in value) || value.mountId !== lease.mountId || value.mountNonce !== lease.mountNonce) return
    const now = Date.now()
    if (now - lease.packetWindow >= 1000) { lease.packetWindow = now; lease.packetCount = 0 }
    if (++lease.packetCount > 100) {
      void this.fail(lease, 'RICH_PACKET_RATE_LIMIT').catch((error: unknown) =>{  console.error('Rich rate limit cleanup failed', error) })
      return
    }
    const packet = readRichPacket(value.packet)
    if (packet.type === 'native.packet-limit') {
      void this.fail(lease, 'RICH_PACKET_RATE_LIMIT').catch((error: unknown) => { console.error('Rich rate limit cleanup failed', error) })
      return
    }
    if (!lease.owner.isDestroyed()) lease.owner.send(DESKTOP_IPC.richPacket, { lease: lease.id, packet })
  }

  private leaseForEvent(event: Pick<IpcMainEvent, 'sender' | 'senderFrame'>): RichLease | undefined {
    const lease = this.byGuest.get(event.sender)
    return lease !== undefined && lease.ready && this.leases.get(lease.id) === lease && !event.sender.isDestroyed()
      && event.senderFrame === event.sender.mainFrame && event.senderFrame.url === lease.documentUrl ? lease : undefined
  }

  /** @param owner - authenticated application renderer. @param id - lease. @param value - JSON packet. */
  send(owner: WebContents, id: unknown, value: unknown): void {
    const lease = typeof id === 'string' ? this.leases.get(id) : undefined
    if (lease === undefined || lease.owner !== owner || !lease.ready || lease.guest === undefined || lease.guest.isDestroyed()) {
      throw new Error('desktop rich: unavailable lease')
    }
    lease.guest.send(DESKTOP_IPC.richToGuest, readRichPacket(value, 'host-to-guest'))
  }

  private async fail(lease: RichLease, code: string): Promise<void> {
    if (!this.leases.has(lease.id)) return
    if (!lease.owner.isDestroyed()) lease.owner.send(DESKTOP_IPC.richPacket, { lease: lease.id, packet: { type: 'native.error', code } })
    await this.release(lease.owner, lease.id)
  }

  /** @param owner - authenticated application renderer. @param id - lease. @returns after renderer destruction and storage cleanup. */
  async release(owner: WebContents, id: unknown): Promise<void> {
    if (typeof id !== 'string') throw new Error('desktop rich: invalid lease')
    const lease = this.leases.get(id)
    if (lease === undefined) return
    if (lease.owner !== owner) throw new Error('desktop rich: lease belongs to another window')
    lease.ready = false
    this.leases.delete(lease.id)
    this.bySession.delete(lease.browserSession)
    const guest = lease.guest
    if (guest !== undefined) this.byGuest.delete(guest)
    if (guest !== undefined && !guest.isDestroyed()) {
      const destroyed = new Promise<void>((resolve) => { guest.once('destroyed', resolve) })
      // Detach first: Electron 44 otherwise delivers the renderer-exit notification, or the destroyed guest's
      // session teardown, to a released Debugger client and crashes the browser process.
      if (guest.debugger.isAttached()) guest.debugger.detach()
      const pid = guest.getOSProcessId()
      if (pid > 0 && pid !== lease.owner.getOSProcessId()) guest.forcefullyCrashRenderer()
      guest.close({ waitForBeforeUnload: false })
      await destroyed
    }
    await this.cleanup(lease)
  }

  private cleanup(lease: RichLease): Promise<void> {
    lease.cleanup ??= (async () => {
      await lease.browserSession.clearStorageData()
      lease.browserSession.protocol.unhandle(SCHEME)
      lease.browserSession.webRequest.onBeforeRequest(null)
    })()
    return lease.cleanup
  }

  /**
   * Release every guest of a navigating, crashed or destroyed application document.
   *
   * @param owner - application document being retired.
   */
  releaseAll(owner: WebContents): void {
    for (const lease of [...this.leases.values()]) {
      if (lease.owner !== owner) continue
      void this.release(owner, lease.id).catch((error: unknown) => { console.error('Rich guest cleanup failed', error) })
    }
  }
}
