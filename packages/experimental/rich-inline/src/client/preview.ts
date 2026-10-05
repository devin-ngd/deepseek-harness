/** Disposable read-only preview: append decoding, frame coalescing and no Host action capability. */
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { PreviewDecoder } from '../shared/authored.ts'
import type { NativeRichBridge, RichReservation } from './native.ts'
import type { RichAppearance } from '../shared/theme.ts'
import { richThemeCss } from '../shared/theme.ts'

/** Trusted preview bootstrap. Generated HTML is inert; no generated JavaScript is installed. */
const previewSdk = String.raw`(() => {
  const bridge = window.richGuest, root = document.querySelector('[data-rich-content-root]');
  document.body.inert = true;
  const stable = document.createElement('div'), tail = document.createElement('div'), style = document.createElement('style');
  root.append(stable, tail); document.head.append(style);
  let html = '', cutoff = 0, scan = 0, depth = 0, tagStart = -1, quote = '', raw = '', comment = false, seq = 0;
  let lastHeight = 0;
  const resize = () => {
    const height = Math.ceil(root.getBoundingClientRect().height);
    if (height !== lastHeight) { lastHeight = height; bridge.send({ type: 'preview.resize', height }); }
  };
  const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  const inertHtml = (element, source) => {
    element.innerHTML = source;
    for (const node of element.querySelectorAll('script,iframe,object,embed,base,meta,link')) node.remove();
    for (const node of element.querySelectorAll('*')) for (const attribute of [...node.attributes])
      if (/^on/i.test(attribute.name) || attribute.name === 'autofocus') node.removeAttribute(attribute.name);
  };
  bridge.subscribe(packet => {
    if (packet.type !== 'preview.append' || packet.seq !== seq + 1 || typeof packet.html !== 'string' || typeof packet.css !== 'string') return;
    seq++; html += packet.html; style.append(document.createTextNode(packet.css));
    const previous = cutoff;
    for (; scan < html.length; scan++) {
      const ch = html[scan];
      if (comment) { if (html.slice(scan - 2, scan + 1) === '-->') { comment = false; tagStart = -1; if (!depth) cutoff = scan + 1; } continue; }
      if (tagStart < 0) {
        if (raw && ch === '<' && ('</' + raw).startsWith(html.slice(scan).toLowerCase())) break;
        if (ch === '<' && (!raw || html.slice(scan, scan + raw.length + 2).toLowerCase() === '</' + raw)) tagStart = scan;
        continue;
      }
      if (html.slice(tagStart, scan + 1) === '<!--') { comment = true; continue; }
      if (quote) { if (ch === quote) quote = ''; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch !== '>') continue;
      const token = html.slice(tagStart, scan + 1), match = /^<\/?([a-z][a-z0-9:-]*)\b/i.exec(token);
      tagStart = -1;
      if (match) {
        const name = match[1].toLowerCase(), closing = token.startsWith('</');
        if (closing) { depth = Math.max(0, depth - 1); if (raw === name) raw = ''; }
        else if (!voidTags.has(name) && !token.endsWith('/>')) { depth++; if (['script','style','textarea','title'].includes(name)) raw = name; }
      }
      if (!depth) cutoff = scan + 1;
    }
    if (cutoff > previous) { const fragment = document.createElement('div'); inertHtml(fragment, html.slice(previous, cutoff)); stable.append(...fragment.childNodes); }
    // Bound unfinished-tail reparsing; completed siblings are never rebuilt.
    inertHtml(tail, html.slice(cutoff, cutoff + 32768)); resize();
  });
  new ResizeObserver(resize).observe(root);
  bridge.send({ type: 'preview.ready' }); resize();
})();`

/** Ephemeral preview lifetime; subscriptions see only native layout state. */
export class RichPreview {
  private readonly decoder = new PreviewDecoder()
  private readonly listeners = new Set<() => void>()
  private view: { reservation: RichReservation | null; height: number; error: boolean; closed: boolean }
    = { reservation: null, height: 120, error: false, closed: false }
  private source = ''
  private sentHtml = 0
  private sentCss = 0
  private seq = 0
  private ready = false
  private stopped = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private unsubscribe: (() => void) | undefined
  private sending = false

  /** @param native - trusted native adapter; absent on Web. @param appearance - Host profile preferences, shared with final rendering. */
  constructor(private readonly native: NativeRichBridge | undefined, private readonly appearance: RichAppearance) {}
  /** Read current disposable preview state. @returns current preview state. */
  getSnapshot = () => this.view
  /** Observe native preview layout changes. @param listener - state subscriber. @returns unsubscribe. */
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(change: Partial<typeof this.view>): void {
    this.view = { ...this.view, ...change }
    for (const listener of this.listeners) { try { listener() } catch (error) { console.error('Rich preview subscriber failed', error) } }
  }

  /** Start the native container without a durable Host mount or business SDK. */
  async open(): Promise<void> {
    if (this.native === undefined) return
    try {
      const reservation = await this.native.acquire({ mountId: `preview-${randomUUID()}`, mountNonce: randomUUID(), html: '', css: richThemeCss(this.appearance), js: '', sdk: previewSdk })
      if (this.stopped) { await this.native.release(reservation.lease); return }
      this.unsubscribe = this.native.subscribe(reservation.lease, (packet) => {
        if (this.stopped) return
        if (packet.type === 'preview.ready') { this.ready = true; this.schedule() }
        if (packet.type === 'preview.resize' && typeof packet.height === 'number' && Number.isFinite(packet.height))
          this.publish({ height: Math.max(24, Math.min(12000, Math.ceil(packet.height) + 1)) })
        if (packet.type === 'native.error') this.publish({ error: true })
      })
      this.publish({ reservation })
    } catch { this.publish({ error: true }) } // Preview failure leaves source available in the trusted fallback.
  }
  /**
   * Queue the newest assistant prefix for the next preview frame.
   * @param source - Append-only JSON prefix from the assistant stream.
   */
  update(source: string): void {
    if (!source.startsWith(this.source)) { this.publish({ error: true }); return }
    this.source = source; this.schedule()
  }
  private schedule(): void {
    if (!this.ready || this.stopped || this.timer !== null || this.sending) return
    this.timer = setTimeout(() => { this.timer = null; void this.flush() }, 34)
  }
  private async flush(): Promise<void> {
    const reservation = this.view.reservation
    if (this.native === undefined || reservation === null || this.stopped) return
    this.sending = true
    const captured = this.source
    try {
      const decoded = this.decoder.append(captured)
      if (decoded.failed || decoded.html.length < this.sentHtml || decoded.css.length < this.sentCss) {
        this.publish({ error: true }); return
      }
      if (decoded.html.length === this.sentHtml && decoded.css.length === this.sentCss) return
      await this.native.send(reservation.lease, { type: 'preview.append', seq: ++this.seq,
        html: decoded.html.slice(this.sentHtml), css: decoded.css.slice(this.sentCss) })
      this.sentHtml = decoded.html.length; this.sentCss = decoded.css.length
    } catch { this.publish({ error: true }) } // Failed preview cannot create or replay a Host action.
    finally { this.sending = false; if (captured !== this.source) this.schedule() }
  }
  /** Revoke and release before the settled executable block is created. */
  async close(): Promise<void> {
    this.stopped = true
    if (this.timer !== null) clearTimeout(this.timer)
    this.unsubscribe?.()
    const reservation = this.view.reservation
    this.publish({ reservation: null, closed: true })
    if (reservation !== null) await this.native?.release(reservation.lease)
  }
}
