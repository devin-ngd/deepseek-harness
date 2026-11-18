/** Dormant API20+ native WSS adapter. It creates no socket until an explicitly approved native owner calls connectNative; no guest bridge exposes it. */
import { webSocket } from '@kit.NetworkKit'
import { util } from '@kit.ArkTS'
import { BusinessError } from '@kit.BasicServicesKit'
import { DEVICE_ENDPOINT_SUBPROTOCOL, DEVICE_REVERSE_SUBPROTOCOL } from '../paired/PairedCore'
/** Public endpoint and bounded lifetime policy; join capabilities are passed in memory only. Device API must be confirmed separately. */
export class NativeRelayPolicy {
  readonly authority: object
  readonly expectedHost: string
  readonly deviceApiVerified: number
  readonly handshakeMs: number
  readonly maxFrameBytes: number
  readonly maxTotalSendBytes: number
  constructor(authority: object, expectedHost: string, deviceApiVerified: number, handshakeMs: number, maxFrameBytes: number, maxTotalSendBytes: number) { this.authority = authority; this.expectedHost = expectedHost; this.deviceApiVerified = deviceApiVerified; this.handshakeMs = handshakeMs; this.maxFrameBytes = maxFrameBytes; this.maxTotalSendBytes = maxTotalSendBytes }
}
/** NetworkKit byte encoding and TLS behavior need device evidence; compile success is not runtime/security acceptance. */
export class NativeRelaySocket {
  private socket: webSocket.WebSocket | undefined = undefined
  private closed: boolean = false
  private opened: boolean = false
  private totalSent: number = 0
  private timer: number = -1
  private closing: Promise<void> | undefined = undefined
  private cleanupFailed: boolean = false
  private closedNotice: (failed: boolean) => void = () => {}
  private firstMessage: boolean = true
  private finishUpgrade: (opened: boolean) => void = () => {}
  private policy: NativeRelayPolicy
  constructor(policy: NativeRelayPolicy) { this.policy = policy }
  async connectNative(authority: object, room: string, role: string, token: string, onFrame: (data: string | ArrayBuffer) => void, onClosed: (cleanupFailed: boolean) => void): Promise<void> {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(room) || !/^[a-f0-9]{64}$/.test(token)) throw new Error('native WSS activation denied')
    const options: webSocket.WebSocketRequestOptions = { header: { Authorization: 'Bearer ' + token, 'X-DSH-Relay-Room': room, 'X-DSH-Relay-Role': role }, protocol: 'dsh-relay-v1', skipServerCertVerification: false }
    await this.connectOwned(authority, role, options, '/harmony/relay/v1', onFrame, onClosed)
  }
  /** Known paired control identity only; the server requires fresh signed challenges before data capabilities exist. */
  async connectControlNative(authority: object, pair: string, role: string, onFrame: (data: string | ArrayBuffer) => void, onClosed: (cleanupFailed: boolean) => void, endpointOnly: boolean = false, reverse: boolean = false): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(pair)) throw new Error('native control activation denied')
    const protocol = reverse ? DEVICE_REVERSE_SUBPROTOCOL : endpointOnly ? DEVICE_ENDPOINT_SUBPROTOCOL : 'harmony-relay-control-v1'
    const options: webSocket.WebSocketRequestOptions = { header: { 'X-DSH-Relay-Pair': pair, 'X-DSH-Relay-Role': role }, protocol, skipServerCertVerification: false }
    await this.connectOwned(authority, role, options, '/harmony/relay/control/v1', onFrame, onClosed)
  }
  /** The device owner supplies a validated local address and an exact LAN protocol. */
  async connectLanNative(authority: object, address: string, port: number, path: string, protocol: string, onFrame: (data: string | ArrayBuffer) => void, onClosed: (cleanupFailed: boolean) => void, upgradeMs?: number): Promise<void> {
    const options: webSocket.WebSocketRequestOptions = { protocol, proxy: 'no-proxy' }
    await this.connectOwned(authority, 'phone', options, path, onFrame, onClosed, 'ws://' + address + ':' + port.toString(), upgradeMs)
  }
  private async connectOwned(authority: object, role: string, options: webSocket.WebSocketRequestOptions, path: string, onFrame: (data: string | ArrayBuffer) => void, onClosed: (cleanupFailed: boolean) => void, lanOrigin?: string, upgradeMs?: number): Promise<void> {
    if (authority !== this.policy.authority || this.closed || this.socket !== undefined || this.policy.deviceApiVerified < 20
      || !/^[a-z0-9.-]+$/.test(this.policy.expectedHost) || this.policy.expectedHost.endsWith('.invalid') || (role !== 'phone' && role !== 'desktop')
      || !Number.isSafeInteger(this.policy.handshakeMs) || this.policy.handshakeMs <= 0 || !Number.isSafeInteger(this.policy.maxFrameBytes) || this.policy.maxFrameBytes <= 0 || !Number.isSafeInteger(this.policy.maxTotalSendBytes) || this.policy.maxTotalSendBytes < this.policy.maxFrameBytes) throw new Error('native WSS activation denied')
    const plane = lanOrigin !== undefined ? 'lan' : path === '/harmony/relay/control/v1' ? 'control' : 'data'
    const report = (stage: string): void => { console.info('DSH_CONNECTION_STAGE=' + role + '-' + plane + '-' + stage + ' at=' + Date.now()) }
    report('dial-started')
    const socket = webSocket.createWebSocket(); this.socket = socket; this.closedNotice = onClosed
    let upgradeTimer: number | undefined
    const upgraded = upgradeMs === undefined ? undefined : new Promise<boolean>(resolve => {
      this.finishUpgrade = resolve
      upgradeTimer = setTimeout(() => { this.finishUpgrade(false); this.retire(authority) }, upgradeMs)
    })
    socket.on('open', () => { this.opened = true; if (this.closed) { this.socket = socket; this.closing = this.releaseSocket(socket); void this.closing.then(() => this.notice(), () => this.notice()) } else { this.finishUpgrade(true); report('http-upgraded') } })
    socket.on('error', (error: BusinessError, response?: BusinessError) => {
      const detail = error ?? response, code = detail?.code, status = detail?.data; const http = typeof status === 'string' && /^[1-5][0-9]{2}$/.test(status) ? Number(status) : 0
      console.info('DSH_CONNECTION_FAILURE=' + role + '-' + plane + '-socket-error code=' + (typeof code === 'number' && Number.isSafeInteger(code) ? code : -1) + ' http=' + http)
      // API26 reports 200 for a rejected HTTP upgrade; no WebSocket connection exists before open.
      if (!this.opened && code === 200) { this.closed = true; clearTimeout(this.timer); if (this.socket === socket) this.socket = undefined; this.notice() } else this.retire(authority)
    })
    socket.on('close', () => { report('socket-closed'); this.closed = true; clearTimeout(this.timer); if (this.socket === socket) this.socket = undefined; this.notice() })
    socket.on('message', (error, data) => {
      if (this.closed) return
      if (this.firstMessage) { this.firstMessage = false; report('first-frame') }
      if (error) { if (plane === 'control') { const code = typeof error.code === 'number' && Number.isSafeInteger(error.code) && Math.abs(error.code) <= 0x7fffffff ? error.code : -1; console.info('DSH_CONTROL_IO=phone-receive-failed code=' + code + ' at=' + Date.now()) }; report('message-error'); this.retire(authority); return }
      const bytes = typeof data === 'string' ? data.length * 4 : data.byteLength
      if (bytes === 0 || bytes > this.policy.maxFrameBytes) { report('message-budget-rejected'); this.retire(authority); return }
      try { onFrame(data) } catch (failure) { void failure; this.retire(authority) }
    })
    this.timer = setTimeout(() => { report('authentication-deadline'); this.retire(authority) }, this.policy.handshakeMs)
    try {
      const connected = await socket.connect((lanOrigin === undefined ? 'wss://' + this.policy.expectedHost : lanOrigin) + path, options)
      report('dial-returned')
      if (this.closed) {
        try { await this.closing } catch (error) { void error; /* Even a failed earlier close cannot skip release of a late acquisition. */ }
        this.socket = socket; this.closing = this.releaseSocket(socket); await this.closing; throw new Error('native WSS connection closed')
      }
      if (!connected || upgraded !== undefined && !await upgraded || this.closed) throw new Error('native WSS connection failed')
    } catch (error) { void error; await this.closeNative(authority); throw new Error('native WSS connection failed') }
    finally { if (upgradeTimer !== undefined) clearTimeout(upgradeTimer); this.finishUpgrade = () => {} }
  }
  /** Only a mutually authenticated E2E owner may clear the pre-auth deadline. HTTP-upgrade success alone does not clear it. */
  authenticatedNative(authority: object): void { if (authority !== this.policy.authority || this.closed || this.socket === undefined) throw new Error('native WSS not active'); clearTimeout(this.timer) }
  async sendNative(authority: object, data: ArrayBuffer): Promise<void> {
    await this.sendOwned(authority, data, data.byteLength)
  }
  /** Control JSON is encoded only by the trusted protocol owner; no guest message can invoke this sender. */
  async sendControlNative(authority: object, data: string): Promise<void> {
    console.info('DSH_CONTROL_IO=phone-send-started at=' + Date.now())
    try { await this.sendOwned(authority, data, new util.TextEncoder().encodeInto(data).length); console.info('DSH_CONTROL_IO=phone-send-completed at=' + Date.now()) }
    catch (error) { void error; console.info('DSH_CONTROL_IO=phone-send-failed at=' + Date.now()); throw new Error('native control send failed') }
  }
  private async sendOwned(authority: object, data: string | ArrayBuffer, bytes: number): Promise<void> {
    if (authority !== this.policy.authority || this.closed || this.socket === undefined || bytes === 0 || bytes > this.policy.maxFrameBytes || this.totalSent + bytes > this.policy.maxTotalSendBytes) throw new Error('native WSS send denied')
    this.totalSent += bytes
    try { const sent = await this.socket.send(data); if (!sent || this.closed) throw new Error('native WSS send failed') }
    catch (error) { void error; await this.closeNative(authority); throw new Error('native WSS send failed') }
  }
  closeNative(authority: object): Promise<void> {
    if (authority !== this.policy.authority) throw new Error('native WSS close denied')
    this.finishUpgrade(false)
    this.closed = true; clearTimeout(this.timer)
    if (this.closing !== undefined) return this.closing
    const socket = this.socket
    this.closing = socket === undefined ? Promise.resolve() : this.releaseSocket(socket)
    return this.closing
  }
  /** A close event confirms release even when a concurrent SDK close returns false or rejects. Without that event, failed release remains terminal. */
  private async releaseSocket(socket: webSocket.WebSocket): Promise<void> { try { const closed = await socket.close(); if (!closed && this.socket === socket) throw new Error('native WSS close unknown'); if (this.socket === socket) this.socket = undefined } catch (error) { if (this.socket !== socket) return; const code = (error as BusinessError).code; console.info('DSH_CONNECTION_CLEANUP=socket-close-failed code=' + (typeof code === 'number' && Number.isSafeInteger(code) ? code : -1)); this.cleanupFailed = true; this.notice(); throw new Error('native WSS cleanup failed') } }
  private retire(authority: object): void { void this.closeNative(authority).then(() => this.notice(), () => this.notice()) }
  private notice(): void { this.finishUpgrade(false); try { this.closedNotice(this.cleanupFailed) } catch (error) { void error; this.cleanupFailed = true } }
}
