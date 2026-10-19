/** HAP-owned offline document bootstrap. No global native proxy or credential is created. */
import { NativePortClient } from './native-port.ts'
import type { NativeHostPolicy, NativeHostView, NativeAppHost } from './native-app-host.ts'
import { jsonPayload, TransportError } from './wire.ts'

/** Native-owned bootstrap constructs exactly one private runtime, without attaching IO to window. */
export interface NativeDocumentConfig { readonly policy: NativeHostPolicy; create(io: NativePortClient, frame: HTMLIFrameElement, publish: (view: NativeHostView) => void): NativeAppHost }
/** @param parse - strict mode-specific native bootstrap parser. */
export function bindNativeDocument(parse: (raw: string) => NativeDocumentConfig): void {
let active = false
const bootstrap = (event: MessageEvent): void => {
  if (active || typeof event.data !== 'string' || event.ports.length !== 1) return
  let configuration: NativeDocumentConfig
  try {
    configuration = parse(event.data)
  } catch (error) { void error; return } // A malformed bootstrap creates no IO or renderer.
  const policy = configuration.policy
  active = true; window.removeEventListener('message', bootstrap)
  const carrier = new NativePortClient(event.ports[0]!, policy.port)
  const frame = document.querySelector<HTMLIFrameElement>('#rich-frame')
  if (!frame || typeof crypto?.subtle?.digest !== 'function' || typeof structuredClone !== 'function' || typeof AbortController !== 'function' || typeof performance?.now !== 'function') {
    carrier.publish({ protocol: 'dsh-native-host/1', kind: 'ui.reply', generation: policy.port.generation, id: 'bootstrap', ok: false, code: 'native-capability-unavailable' })
    void carrier.close(); return
  }
  const host = configuration.create(carrier, frame, view => carrier.publish(jsonPayload({ protocol: 'dsh-native-host/1', kind: 'view', generation: policy.port.generation, view })))
  const listener = (packet: MessageEvent): void => {
    if (typeof packet.data !== 'string') return
    let call: { kind?: string; id?: string; method?: string }
    try { call = JSON.parse(packet.data) } catch (error) { void error; return } // The host's parser owns command validation; IO replies have a separate listener.
    if (call.kind !== 'ui') return
    void host.receive(packet.data).then(value => {
      carrier.publish(jsonPayload({ protocol: 'dsh-native-host/1', kind: 'ui.reply', generation: policy.port.generation, id: call.id, ok: true, value }))
      if (call.method === 'close') { event.ports[0]!.removeEventListener('message', listener); return host.close().then(() => carrier.close()) }
    }).catch((error: unknown) => {
      const code = error instanceof TransportError ? error.code : 'native-runtime-failed'
      try { carrier.publish(jsonPayload({ protocol: 'dsh-native-host/1', kind: 'ui.reply', generation: policy.port.generation, id: call.id, ok: false, code })) }
      catch (publishError) { void publishError; void carrier.close() } // A lost native port cannot report or retry an unknown command result.
    })
  }
  event.ports[0]!.addEventListener('message', listener)
  carrier.publish({ protocol: 'dsh-native-host/1', kind: 'ready', generation: policy.port.generation })
  window.addEventListener('pagehide', () => { void host.close().catch((error: unknown) => { void error }).then(() => carrier.close()) }, { once: true })
}
window.addEventListener('message', bootstrap)
}
