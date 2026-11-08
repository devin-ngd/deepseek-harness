/** One separately network-blocked ArkWeb document; generated content gets only the canonical rich guest SDK. */
import { webview } from '@kit.ArkWeb'
import { util } from '@kit.ArkTS'
import { NativeAssets } from '../native/NativeAssets'
import { workspaceRichGuestMessage } from './ProductCore'
import { NativeWebRenderer } from './NativeWebRenderer'

export interface NativeWorkspaceRichPolicy { maxGuests: number; maxQueuedPackets: number; maxQueuedBytes: number; documentBytes: number; sdkBytes: number; guestPacketBytes: number; hostPacketBytes: number; closeTimeoutMs: number }
interface GuestMessage { id: string; packet: string }
const DOCUMENT: string = 'https://workspace-rich.dsh.invalid/document'
/** The workspace owner supplies committed bytes and owns the destination of every returned guest packet. */
export class NativeWorkspaceRichGuest {
  readonly controller: webview.WebviewController = new webview.WebviewController()
  readonly renderToken: string = util.generateRandomUUID(false)
  private html: string = ''
  private port: webview.WebMessagePort | undefined = undefined
  private closed: boolean = false
  private generation: number = 0
  private failed: boolean = false
  private readonly renderer: NativeWebRenderer
  private closing: Promise<void> | undefined = undefined
  private readonly initializeJson: string
  private readonly assets: NativeAssets
  private readonly policy: NativeWorkspaceRichPolicy
  private readonly packet: (raw: string, id: string) => void
  private readonly failure: () => void
  constructor(assets: NativeAssets, lease: string, requestJson: string, policy: NativeWorkspaceRichPolicy,
    packet: (raw: string, id: string) => void, failure: () => void, remove: () => void) {
    this.assets = assets; this.policy = policy; this.packet = packet; this.failure = failure
    this.renderer = new NativeWebRenderer(this.controller, policy.closeTimeoutMs, remove)
    this.initializeJson = '{"protocol":"harmony-workspace-rich/1","lease":' + JSON.stringify(lease) + ',"limits":' + JSON.stringify(policy) + ',"request":' + requestJson + '}'
  }
  attached(): void {
    if (this.closed) return
    this.renderer.attach()
    webview.WebviewController.setWebDebuggingAccess(false)
    const code = this.assets.read('workspace-rich-document.js').replace(/<\/script/gi, '<\\/script')
    this.html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; frame-src \'self\'; connect-src \'none\'; worker-src \'none\'; form-action \'none\'; base-uri \'none\'; object-src \'none\'"><style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style></head><body><iframe id="rich-frame" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><script type="module">' + code + '</script></body></html>'
    this.controller.loadData(this.html, 'text/html', 'UTF-8', DOCUMENT, DOCUMENT)
  }
  bind(url: string): void {
    if (this.closed || this.port !== undefined || this.controller.getUrl() !== DOCUMENT || url !== DOCUMENT && !this.exactData(url)) return
    this.html = ''
    const ports = this.controller.createWebMessagePorts(false)
    if (ports.length !== 2) throw new Error('native rich port unavailable')
    const port = ports[0], generation = ++this.generation; this.port = port
    port.onMessageEvent((raw: webview.WebMessage) => {
      if (this.closed || generation !== this.generation || port !== this.port || typeof raw !== 'string') return
      if (raw === '{"kind":"rich.ready"}') return
      try { if (raw === '{"kind":"rich.failed"}') throw new Error('native rich document failed'); const message = JSON.parse(workspaceRichGuestMessage(raw, this.policy.guestPacketBytes)) as GuestMessage; this.packet(message.packet, message.id) }
      catch (error) { void error; this.fail() }
    })
    this.controller.postMessage(this.initializeJson, [ports[1]], 'https://workspace-rich.dsh.invalid')
  }
  send(raw: string): void {
    if (this.closed || this.port === undefined || new util.TextEncoder().encodeInto(raw).byteLength > this.policy.hostPacketBytes) throw new Error('native rich delivery unavailable')
    this.port.postMessageEvent(raw)
  }
  acknowledge(id: string): void { if (!this.closed) this.port?.postMessageEvent(JSON.stringify({ kind: 'rich.ack', id })) }
  private exactData(url: string): boolean {
    if (this.html.length === 0) return false
    const comma = url.indexOf(','), metadata = url.substring(0, comma).toLowerCase()
    if (comma < 0 || comma > 80) return false
    const payload = url.substring(comma + 1)
    if (metadata === 'data:text/html;charset=utf-8;base64' || metadata === 'data:text/html;base64') {
      const expected = new util.Base64Helper().encodeToStringSync(new util.TextEncoder().encodeInto(this.html))
      return payload === expected || payload === encodeURIComponent(expected)
    }
    if (metadata !== 'data:text/html;charset=utf-8' && metadata !== 'data:text/html') return false
    try { return decodeURIComponent(payload) === this.html } catch (error) { void error; return false }
  }
  allow(url: string, main: boolean): boolean { return !this.closed && (main ? url === DOCUMENT || this.port === undefined && url === 'about:blank' || this.exactData(url) : url === 'about:blank' || url === 'about:srcdoc') }
  navigation(url: string): void { if (!this.allow(url, true)) this.fail() }
  private fail(): void {
    if (this.closed) return
    void this.close().catch((error: Error) => { void error /* close() retains cleanup failure for the workspace owner. */ }).finally(() => this.failure())
  }
  /** Native callbacks report a lost document while retaining cleanup failures for the workspace owner. */
  retire(): void { this.fail() }
  /** Render exit is the acknowledgement for a requested stop; unexpected exits also retire the lease. */
  exited(): void { if (!this.renderer.exited() && !this.closed) this.fail() }
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    this.closed = true; this.generation++; this.html = ''
    const port = this.port; this.port = undefined
    try { port?.close() } catch (error) { void error; this.failed = true }
    this.closing = (async () => {
      try {
        await this.renderer.close()
        if (this.failed) throw new Error('native rich document cleanup failed')
      } catch (error) { void error; this.failed = true; throw new Error('native rich document cleanup failed') }
    })()
    return this.closing
  }
}
