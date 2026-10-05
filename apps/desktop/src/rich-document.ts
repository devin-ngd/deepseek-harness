/** Prepare complete, inline documents without allowing generated code to choose a source URL. */
import { randomUUID } from 'node:crypto'
import { RICH_NATIVE_LIMITS } from './rich-limits.ts'
import type { DesktopRichRequest } from './rich-types.ts'

export { RICH_NATIVE_LIMITS } from './rich-limits.ts'
export type RichPacketDirection = 'guest-to-host' | 'host-to-guest'

/** @param value - caller-provided JSON. @returns a bounded request or throws before reserving a guest. */
export function readRichRequest(value: unknown): DesktopRichRequest {
  if (typeof value !== 'object' || value === null || !('mountId' in value) || !('mountNonce' in value)
    || !('html' in value) || !('css' in value) || !('js' in value)) throw new Error('desktop rich: invalid request')
  const { mountId, mountNonce, html, css, js } = value
  const sdk = 'sdk' in value ? value.sdk : undefined
  if (typeof mountId !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{1,95}$/.test(mountId)
    || typeof mountNonce !== 'string' || mountNonce.length < 16 || mountNonce.length > 128
    || typeof html !== 'string' || typeof css !== 'string' || typeof js !== 'string'
    || sdk !== undefined && typeof sdk !== 'string'
    || Object.keys(value).some(key => !['mountId', 'mountNonce', 'html', 'css', 'js', 'sdk'].includes(key))) {
    throw new Error('desktop rich: invalid request')
  }
  if (sdk !== undefined && Buffer.byteLength(sdk, 'utf8') > RICH_NATIVE_LIMITS.sdkBytes) throw new Error('RICH_SDK_TOO_LARGE')
  const bytes = Buffer.byteLength(html, 'utf8') + Buffer.byteLength(css, 'utf8') + Buffer.byteLength(js, 'utf8') + Buffer.byteLength(sdk ?? '', 'utf8')
  if (bytes > RICH_NATIVE_LIMITS.documentBytes) throw new Error('RICH_DOCUMENT_TOO_LARGE')
  return { mountId, mountNonce, html, css, js, ...sdk === undefined ? {} : { sdk } }
}

/** @param value - incoming IPC JSON. @param direction - trusted call-site direction, never read from payload. @returns bounded JSON. */
export function readRichPacket(value: unknown, direction: RichPacketDirection = 'guest-to-host'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('desktop rich: packet must be an object')
  const visit = (item: unknown, depth: number): void => {
    if (depth > 16) throw new Error('desktop rich: packet nesting limit')
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return
    if (typeof item === 'number' && Number.isFinite(item)) return
    if (Array.isArray(item)) { for (const child of item) visit(child, depth + 1); return }
    if (typeof item === 'object' && Object.getPrototypeOf(item) === Object.prototype) {
      for (const child of Object.values(item)) visit(child, depth + 1)
      return
    }
    throw new Error('desktop rich: packet is not JSON')
  }
  visit(value, 0)
  const serialized = JSON.stringify(value)
  const budget = direction === 'host-to-guest' ? RICH_NATIVE_LIMITS.hostPacketBytes : RICH_NATIVE_LIMITS.guestPacketBytes
  if (Buffer.byteLength(serialized, 'utf8') > budget) {
    throw new Error(direction === 'host-to-guest' ? 'RICH_HOST_PACKET_TOO_LARGE' : 'RICH_GUEST_PACKET_TOO_LARGE')
  }
  return JSON.parse(serialized) as Record<string, unknown>
}

/** @param request - complete fragment, style and program. @returns the complete document and its immutable response policy. */
export function richDocument(request: DesktopRichRequest): { html: string; policy: string } {
  const nonce = randomUUID()
  const payload = Buffer.from(JSON.stringify({ html: request.html, css: request.css, js: request.js, sdk: request.sdk ?? '' }), 'utf8').toString('base64')
  const policy = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'`
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>html,body{margin:0;background:transparent;color:inherit;color-scheme:light dark}*,*::before,*::after{box-sizing:border-box}[data-rich-content-root]{display:flow-root}</style></head><body><script nonce="${nonce}">(()=>{const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${payload}'),c=>c.charCodeAt(0))));const style=document.createElement('style');style.textContent=data.css;document.head.append(style);const root=document.createElement('div');root.setAttribute('data-rich-content-root','');root.innerHTML=data.html;document.body.append(root);for(const source of [data.sdk,data.js]){const program=document.createElement('script');program.nonce='${nonce}';program.textContent=source;document.body.append(program)}})()</script></body></html>`
  return { html, policy }
}

/** @param request - complete fragment, style and program. @returns an inert encoding used by serialization tests. */
export function richDocumentUrl(request: DesktopRichRequest): string {
  return 'data:text/html;base64,' + Buffer.from(richDocument(request).html, 'utf8').toString('base64')
}
