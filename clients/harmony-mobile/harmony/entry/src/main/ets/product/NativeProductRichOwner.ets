/** Verified app document and one private ArkWeb port. Generated content has only the existing opaque-frame rich SDK. */
import { webview } from '@kit.ArkWeb'
import { common } from '@kit.AbilityKit'
import { util } from '@kit.ArkTS'
import { NativeAssets } from '../native/NativeAssets'
import { NativeProductOwner } from './NativeProductOwner'
const DOCUMENT: string = 'https://product.dsh.invalid/rich'
interface OwnedMount { mountId: string }
interface RendererTransportLimits { maxPending: number; maxPacketBytes: number }
interface RendererLimits { transport: RendererTransportLimits }
/** UI owner keeps task/trust methods outside the Web document and revokes its port on navigation/background. */
export class NativeProductRichOwner {
  readonly controller: webview.WebviewController = new webview.WebviewController()
  private product: NativeProductOwner
  private policyJson: string
  private assets: NativeAssets | undefined = undefined
  private port: webview.WebMessagePort | undefined = undefined
  private html: string = ''
  private mount: string = ''
  private sentMount: string | undefined = undefined
  private ready: boolean = false
  private closed: boolean = false
  private generation: number = 0
  private work: Set<Promise<void>> = new Set()
  private closing: Promise<void> | undefined = undefined
  private failed: boolean = false
  private mountGeneration: number = 0
  private maxPending: number
  private maxPacketBytes: number
  constructor(product: NativeProductOwner, policyJson: string) { this.product = product; this.policyJson = policyJson; const limits = JSON.parse(policyJson) as RendererLimits; this.maxPending = limits.transport.maxPending; this.maxPacketBytes = limits.transport.maxPacketBytes; if (![this.maxPending, this.maxPacketBytes].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('native rich limits denied') }
  initialize(context: common.UIAbilityContext): void { this.assets = new NativeAssets(context) }
  attached(): void {
    if (this.assets === undefined || this.closed) return; webview.WebviewController.setWebDebuggingAccess(false); webview.WebCookieManager.putAcceptCookieEnabled(false); webview.WebCookieManager.putAcceptThirdPartyCookieEnabled(false)
    const code = this.assets.read('product-rich-document.js').replace(/<\/script/gi, '<\\/script')
    this.html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; frame-src \'self\'; connect-src \'none\'; worker-src \'none\'; form-action \'none\'; base-uri \'none\'; object-src \'none\'"><style>html,body{margin:0}iframe{width:100%;height:100vh;border:0}</style></head><body><iframe id="rich-frame" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe><script type="module">' + code + '</script></body></html>'
    this.controller.loadData(this.html, 'text/html', 'UTF-8', DOCUMENT, DOCUMENT)
  }
  bind(url: string): void {
    if (this.closed || this.port !== undefined || this.controller.getUrl() !== DOCUMENT || url !== DOCUMENT && !this.exactData(url)) return; this.html = ''; const ports = this.controller.createWebMessagePorts(false); if (ports.length !== 2) throw new Error('native rich port denied'); const port = ports[0], generation = ++this.generation; this.port = port
    port.onMessageEvent((raw: webview.WebMessage) => { if (this.closed || generation !== this.generation || this.port !== port || typeof raw !== 'string') return; if (new util.TextEncoder().encodeInto(raw).length > this.maxPacketBytes || this.work.size >= this.maxPending) { this.failed = true; void this.close().catch((error: Error) => { void error }); return }; if (raw === '{"kind":"rich.ready"}') { this.ready = true; this.flush(); return }; if (raw === '{"kind":"rich.failed"}') { void this.close().catch((error: Error) => { void error }); return }; const mountGeneration = this.mountGeneration, operation = this.product.richRequest(raw).then((reply: string) => { if (!this.closed && this.port === port && generation === this.generation && mountGeneration === this.mountGeneration) port.postMessageEvent(reply) }).catch((error: Error) => { void error; if (this.closed || generation !== this.generation || mountGeneration !== this.mountGeneration) return; try { port.postMessageEvent(this.product.richRefusal(raw)) } catch (replyError) { void replyError; this.failed = true; void this.close().catch((cleanupError: Error) => { void cleanupError }) } }); this.work.add(operation); void operation.finally(() => this.work.delete(operation)) })
    this.controller.postMessage('{"protocol":"harmony-product-rich/1","policy":' + this.policyJson + '}', [ports[1]], 'https://product.dsh.invalid')
  }
  private exactData(url: string): boolean { if (this.html.length === 0) return false; const comma = url.indexOf(','), metadata = url.substring(0, comma).toLowerCase(); if (comma < 0 || comma > 80) return false; const payload = url.substring(comma + 1); if (metadata === 'data:text/html;charset=utf-8;base64' || metadata === 'data:text/html;base64') { const expected = new util.Base64Helper().encodeToStringSync(new util.TextEncoder().encodeInto(this.html)); return payload === expected || payload === encodeURIComponent(expected) }; if (metadata !== 'data:text/html;charset=utf-8' && metadata !== 'data:text/html') return false; try { return decodeURIComponent(payload) === this.html } catch (error) { void error; return false } }
  setMount(mount: string): void { const previous = this.mount === '' ? '' : (JSON.parse(this.mount) as OwnedMount).mountId, next = mount === '' ? '' : (JSON.parse(mount) as OwnedMount).mountId; if (previous !== next) this.mountGeneration++; this.mount = mount; this.flush() }
  private flush(): void { if (this.closed || !this.ready || this.port === undefined || this.sentMount === this.mount) return; this.sentMount = this.mount; this.port.postMessageEvent(this.mount === '' ? '{"kind":"rich.clear"}' : '{"kind":"rich.mount","mount":' + this.mount + '}') }
  allow(url: string, main: boolean): boolean { return !this.closed && (main ? url === DOCUMENT || !this.ready && url === 'about:blank' || this.exactData(url) : url === 'about:blank' || url === 'about:srcdoc') }
  navigation(url: string): void { if (!this.allow(url, true)) void this.close() }
  async foreground(): Promise<void> { await this.closing; if (!this.closed) return; this.closed = false; this.closing = undefined; this.attached() }
  close(): Promise<void> { if (this.closing !== undefined) return this.closing; this.closed = true; this.ready = false; this.generation++; const port = this.port; this.port = undefined; this.mount = ''; this.sentMount = undefined; this.html = ''; try { port?.close() } catch (error) { void error; this.failed = true }; this.closing = (async () => { const results = await Promise.allSettled(this.work); this.work.clear(); if (this.failed || results.some(result => result.status === 'rejected')) throw new Error('native rich cleanup failed') })(); return this.closing }
}
