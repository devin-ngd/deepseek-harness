/** Browser reference renderer using the canonical guest SDK and the same restricted gate intended for a native message port. */
import type { RichMountValue, RichSnapshot } from './upstream.ts'
import type { GuestRequestOwner } from './relay-guest.ts'
import { RelayGuestGate } from './relay-guest.ts'
import { canonicalRichJson, guestSdk, richThemeCss } from './upstream-domain.ts'

/** Code version belongs to the trusted renderer, independently of publication renderRevision. */
export const MOBILE_RENDERER_VERSION = 'mobile-rich-renderer/1'
/** Trusted surface policy; no token, endpoint, Session selector or filesystem method reaches the guest. */
export interface RendererPolicy { readonly rendererVersion: string; readonly packetBytes: number; readonly maxPackets: number }
/** Receiver registered against a native port identity; approval, host execution and file grants have no methods. */
export interface NativeRichPort {
  /** @param raw - untrusted bounded guest packet. @param source - carrier identity supplied by native code, never a payload field. @returns scoped operation response. */
  receive(raw: string, source: object): Promise<unknown>
  /** @returns after local routing is revoked and owned requests settle; it does not cancel accepted actions. */
  close(): Promise<void>
}
/** @param snapshot - admitted publication. @returns SHA-256 validation for exactly the original rich content fields. */
export async function verifyRichContent(snapshot: RichSnapshot): Promise<boolean> {
  const m = snapshot.manifest, content = canonicalRichJson({ html: m.html, css: m.css, js: m.js, stateSchemaVersion: m.stateSchemaVersion })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') === m.contentHash
}
/** Scoped HTML/CSS/JS reference carrier, qualified only in Chrome until native ArkWeb APIs are compiled and exercised. */
export class BrowserRichRenderer {
  private gate: RelayGuestGate | undefined
  private mount: RichMountValue | undefined
  private sequence = 0
  private listener: ((event: MessageEvent) => void) | undefined
  private errorValue: string | null = null
  /** @param frame - trusted-owned disposable iframe. @param owner - native request owner, retained outside its realm. @param policy - explicit renderer version and packet caps. */
  constructor(private readonly frame: HTMLIFrameElement, private readonly owner: GuestRequestOwner, private readonly policy: RendererPolicy) {
    for (const value of [policy.packetBytes, policy.maxPackets]) if (!Number.isSafeInteger(value) || value < 1) throw new Error('invalid-renderer-config')
  }
  /** @returns last sanitized rendering/bridge failure; generated packets cannot mark a task completed. */
  get error(): string | null { return this.errorValue }
  private send(type: string, payload: unknown): void {
    if (this.mount === undefined) return
    this.frame.contentWindow?.postMessage({ protocol: 'lumina-rich/1', mountId: this.mount.mountId, renderRevision: this.mount.snapshot.scope.renderRevision, seq: ++this.sequence, packetId: 'mobile-host-' + this.sequence, type, payload }, '*')
  }
  /** @param mount - already decoded native-owned mount. @returns whether executable rendering was activated; incompatibility uses useful static text. */
  async open(mount: RichMountValue): Promise<boolean> {
    await this.close(); this.mount = mount; this.sequence = 0; this.errorValue = null
    const snapshot = mount.snapshot, m = snapshot.manifest
    const mismatch = this.policy.rendererVersion !== MOBILE_RENDERER_VERSION ? 'renderer-version-mismatch' : snapshot.protocol !== 'lumina-rich/1' ? 'rich-protocol-mismatch' : !await verifyRichContent(snapshot) ? 'content-hash-mismatch' : null
    this.frame.setAttribute('sandbox', 'allow-scripts allow-forms'); this.frame.setAttribute('referrerpolicy', 'no-referrer')
    if (mismatch !== null) { this.errorValue = mismatch; this.frame.srcdoc = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;"><p>' + m.fallbackText.replaceAll('&', '&amp;').replaceAll('<', '&lt;') + '</p>'; return false }
    if (this.frame.contentWindow === null) throw new Error('renderer-source-unavailable')
    this.gate = new RelayGuestGate(this.owner, { source: this.frame.contentWindow, sessionId: snapshot.scope.sessionId, mountId: mount.mountId, renderRevision: snapshot.scope.renderRevision, packetBytes: this.policy.packetBytes, maxPackets: this.policy.maxPackets })
    const current = this.gate
    this.listener = event => {
      if (event.source === null || event.source !== this.frame.contentWindow || this.gate !== current) return
      const packet: unknown = event.data
      if (packet === null || typeof packet !== 'object' || !('packetId' in packet) || !('type' in packet) || !('mountId' in packet) || packet.mountId !== mount.mountId) return
      let encoded: string
      try { encoded = JSON.stringify(packet) } catch (error) { this.errorValue = 'invalid-guest-json'; return } // Structured-clone packets may contain cycles; no routing occurred.
      void current.receive(encoded, event.source).then(async result => {
        if (this.gate !== current) return
        if (packet.type === 'ready') this.send('init', { snapshot })
        if (['draft.save', 'action.invoke', 'action.status'].includes(String(packet.type))) {
          this.send('result', { requestId: packet.packetId, ...(packet.type === 'action.status' ? { result } : { receipt: result }) })
          const value = await this.owner.request('rich.snapshot', { mountId: mount.mountId })
          if (this.gate === current) this.send('snapshot', { snapshot: value })
        }
      }).catch((error: unknown) => {
        if (this.gate !== current) return
        this.errorValue = error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'bridge-failed'
        this.send('result', { requestId: packet.packetId, error: { code: this.errorValue } })
      })
    }
    window.addEventListener('message', this.listener)
    const nonce = crypto.randomUUID().replaceAll('-', '')
    const shim = `(() => { const listeners=new Set(); Object.defineProperty(window,'richGuest',{value:Object.freeze({send:packet=>parent.postMessage(packet,'*'),subscribe:callback=>{listeners.add(callback);return()=>listeners.delete(callback)}})}); addEventListener('message',event=>{if(event.source===parent)for(const listener of listeners)listener(event.data)}); addEventListener('click',event=>{if(event.target instanceof Element && event.target.closest('a'))event.preventDefault()},true); })();`
    const code = (shim + '\n' + guestSdk(mount.mountId, snapshot.scope.renderRevision, this.policy.packetBytes) + '\n' + m.js).replace(/<\/script/gi, '<\\/script')
    const css = richThemeCss({ theme: 'dark', accent: 'auto' }) + '\n' + m.css + '\nhtml,body{margin:0;max-width:100%;overflow-wrap:anywhere}*{box-sizing:border-box}img,svg,canvas{max-width:100%;height:auto}input,select,textarea,button{min-height:44px;max-width:100%;font:inherit}pre,.rich-table-wrap{overflow:auto;max-width:100%}form{min-width:0}label{min-width:0}@media(max-width:480px){.rich-grid{grid-template-columns:1fr!important}.rich-actions{flex-wrap:wrap}}'
    const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; media-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; worker-src 'none'; object-src 'none'`
    // The opaque sandbox prevents generated HTML from observing the trusted parent bridge. CSP blocks all guest network access.
    this.frame.srcdoc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div data-rich-content-root>${m.html}</div><script nonce="${nonce}">${code}</script></body></html>`
    return true
  }
  /** @param snapshot - decoded update. @returns false when committed code changed and a fresh native mount is required. */
  update(snapshot: RichSnapshot): boolean {
    if (this.mount === undefined || snapshot.scope.blockId !== this.mount.snapshot.scope.blockId || snapshot.scope.renderRevision !== this.mount.snapshot.scope.renderRevision) return false
    this.send('snapshot', { snapshot }); return true
  }
  /** Revoke guest routing before disposing the mount; accepted actions remain desktop-owned. */
  async close(): Promise<void> {
    const gate = this.gate, mount = this.mount; this.gate = undefined
    if (this.listener !== undefined) window.removeEventListener('message', this.listener)
    this.listener = undefined; this.mount = undefined
    if (gate !== undefined) await gate.close()
    else if (mount !== undefined) await this.owner.request('rich.dispose', { mountId: mount.mountId })
  }
}
