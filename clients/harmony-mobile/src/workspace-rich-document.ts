/** Verified app document inside the native network-blocked rich Web; the opaque frame gets the unchanged standard guest SDK. */
import { workspaceRichDocumentInitSchema, workspaceRichPacket } from './workspace-rich-protocol.ts'

let initialized = false
window.addEventListener('message', function initialize(event: MessageEvent) {
  if (initialized || event.ports.length !== 1 || typeof event.data !== 'string') return
  let candidate: unknown
  try { candidate = JSON.parse(event.data) } catch (error) { void error; return }
  const parsed = workspaceRichDocumentInitSchema.safeParse(candidate)
  if (!parsed.success) return
  initialized = true; window.removeEventListener('message', initialize)
  const { request, limits } = parsed.data, port = event.ports[0]!, frame = document.querySelector<HTMLIFrameElement>('#rich-frame')
  if (frame === null) { port.close(); return }
  let closed = false
  let counter = 0, queuedBytes = 0
  const pending = new Map<string, number>()
  const close = () => { if (closed) return; closed = true; window.removeEventListener('message', receive); frame.srcdoc = ''; port.close() }
  const failed = () => { if (!closed) { port.postMessage('{"kind":"rich.failed"}'); close() } }
  const receive = (message: MessageEvent) => {
    if (closed || message.source !== frame.contentWindow) return
    try {
      const packet = workspaceRichPacket(JSON.stringify(message.data), limits.guestPacketBytes), bytes = new TextEncoder().encode(packet).byteLength
      if (pending.size >= limits.maxQueuedPackets || bytes > limits.maxQueuedBytes - queuedBytes) throw new Error('rich guest queue capacity')
      const id = String(++counter); pending.set(id, bytes); queuedBytes += bytes
      port.postMessage(JSON.stringify({ kind: 'rich.packet', id, packet }))
    }
    catch (error) { void error; failed() }
  }
  window.addEventListener('message', receive)
  port.onmessage = message => {
    if (closed || typeof message.data !== 'string') return
    try {
      if (new TextEncoder().encode(message.data).byteLength > limits.hostPacketBytes) throw new Error('rich Host packet capacity')
      const packet = JSON.parse(message.data) as Record<string, unknown>
      if (packet.kind === 'rich.ack' && typeof packet.id === 'string') {
        const bytes = pending.get(packet.id)
        if (bytes !== undefined) { pending.delete(packet.id); queuedBytes -= bytes }
        return
      }
      frame.contentWindow?.postMessage(packet, '*')
    } catch (error) { void error; failed() }
  }
  port.onmessageerror = failed; port.start()
  // All generated strings are data until inserted into the opaque child document.
  const payload = JSON.stringify({ html: request.html, css: request.css, sdk: request.sdk ?? '', js: request.js })
  let binary = ''; for (const byte of new TextEncoder().encode(payload)) binary += String.fromCharCode(byte)
  const code = `(() => {
    const listeners = new Set();
    Object.defineProperty(window,'richGuest',{value:Object.freeze({send:packet=>parent.postMessage(packet,'*'),subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}})});
    addEventListener('message',event=>{if(event.source===parent)for(const listener of listeners)listener(event.data)});
    addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('a'))event.preventDefault()},true);
    const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${btoa(binary)}'),value=>value.charCodeAt(0))));
    const style=document.createElement('style');style.textContent=data.css;document.head.append(style);
    const root=document.createElement('div');root.setAttribute('data-rich-content-root','');root.innerHTML=data.html;document.body.append(root);
    for(const source of [data.sdk,data.js]){const script=document.createElement('script');script.textContent=source;document.body.append(script)}
  })();`
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"
  frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('referrerpolicy', 'no-referrer')
  frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="' + csp + '"></head><body><script>' + code + '</script></body></html>'
  port.postMessage('{"kind":"rich.ready"}')
  window.addEventListener('pagehide', close, { once: true })
})
