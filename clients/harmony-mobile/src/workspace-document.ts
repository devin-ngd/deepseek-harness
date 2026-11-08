/** Verified document-start bridge: standard Web plugins receive workspace transport, never native identities or rich-guest ports. */
import { WorkspaceClient } from './workspace-client.ts'
import { WorkspaceNativeRich } from './workspace-native-rich.ts'
import { workspaceRichOwnerPacketSchema } from './workspace-rich-protocol.ts'
import { WORKSPACE_ROUTE_HEADER } from './workspace-protocol.ts'
import { workspaceDocumentInitSchema, workspaceNativeMessageSchema, type WorkspaceLoadFailure } from './workspace-document-protocol.ts'
import type { ClientTransportHooks } from '@deepseek-ai/dsh-client-connection/client'

type Init = ReturnType<typeof workspaceDocumentInitSchema.parse>
interface Waiting { resolve(value: unknown): void; reject(error: Error): void; dispose(): void }
const pending = new Map<string, Waiting>()
let port: MessagePort | undefined, initialized = false, counter = 0, stopped = false, navigationReady = false, announced = false, failed = false
let resolvedClient: WorkspaceClient | undefined, rich: WorkspaceNativeRich | undefined
let target: Pick<Init, 'sessionId' | 'plugin'> | undefined
let start: (value: { port: MessagePort; init: Init }) => void = () => {}
let fail: (error: Error) => void = () => {}
const ready = new Promise<{ port: MessagePort; init: Init }>((resolve, reject) => { start = resolve; fail = reject })
void ready.catch(error => { void error })
const bootObserver = new MutationObserver(publishBootState)

/** ArkWeb reports `navigator.onLine=false` even while the native carrier is reachable, which would pause the unmodified Web Connection. Connection reads this value at start and follows `online`/`offline` events, so only carrier state may drive both: platform-originated (trusted) events are stopped before Connection's listeners run. */
const carrierAvailable = (): boolean => initialized && !stopped
Object.defineProperty(navigator, 'onLine', { configurable: true, get: carrierAvailable })
for (const type of ['online', 'offline']) window.addEventListener(type, event => { if (event.isTrusted) event.stopImmediatePropagation() }, { capture: true })
function announceCarrier(): void { window.dispatchEvent(new Event(carrierAvailable() ? 'online' : 'offline')) }

function close(): void {
  if (stopped) return
  stopped = true
  bootObserver.disconnect()
  announceCarrier()
  const error = new Error('workspace document closed')
  fail(error)
  for (const wait of pending.values()) { wait.dispose(); wait.reject(error) }
  pending.clear(); rich?.close(); port?.close()
  void resolvedClient?.close().catch(error => { void error /* The native owner separately drains the original Host lease. */ })
}
function reportFailure(stage: WorkspaceLoadFailure): void {
  if (stopped || failed || port === undefined) return
  failed = true
  bootObserver.disconnect()
  port.postMessage(JSON.stringify({ kind: 'workspace.failed', stage }))
}
function publishBootState(): void {
  if (!initialized || stopped || failed || announced) return
  const root = document.getElementById('root')
  if (root === null) return
  // The standard renderer replaces the direct boot page only after all entries activate.
  // A failed boot keeps that page and replaces its spinner with the failure report.
  const boot = root.querySelector(':scope > [data-dsh-boot]')
  if (boot !== null) {
    if (boot.querySelector('[data-dsh-boot-spinner]') === null) reportFailure('renderer-boot')
    return
  }
  if (navigationReady && root.firstElementChild !== null) {
    announced = true
    bootObserver.disconnect()
    port?.postMessage('{"kind":"workspace.ready"}')
  }
}
function navigate(): void {
  if (!navigationReady || !initialized || stopped || failed) return
  if (target !== undefined) {
    const detail = target; target = undefined
    if (detail.sessionId !== '' || detail.plugin !== undefined) window.dispatchEvent(new CustomEvent('harmony:workspace:navigate', { detail }))
  }
  publishBootState()
}
window.addEventListener('harmony:workspace:navigation-ready', () => { navigationReady = true; navigate() })
window.addEventListener('harmony:workspace:navigation-disposed', () => { navigationReady = false })
window.addEventListener('harmony:workspace:navigation-failed', () => reportFailure('navigation'))
window.addEventListener('harmony:workspace:selection', event => {
  if (stopped || port === undefined || !(event instanceof CustomEvent)) return
  const sessionId: unknown = event.detail
  if (sessionId !== null && typeof sessionId !== 'string') { close(); return }
  port.postMessage(JSON.stringify({ kind: 'workspace.selection', sessionId }))
})
window.addEventListener('message', event => {
  if (initialized || stopped || event.ports.length !== 1) return
  let input: unknown = event.data
  try { if (typeof input === 'string') input = JSON.parse(input) }
  catch (error) { void error; return }
  const parsed = workspaceDocumentInitSchema.safeParse(input)
  if (!parsed.success || parsed.data.limits.origin !== location.origin) return
  initialized = true; port = event.ports[0]!
  port.onmessage = message => {
    if (stopped || typeof message.data !== 'string') return
    let reply: ReturnType<typeof workspaceNativeMessageSchema.parse>
    try {
      if (new TextEncoder().encode(message.data).byteLength > parsed.data.limits.maxPacketBytes) throw new Error('workspace reply too large')
      reply = workspaceNativeMessageSchema.parse(JSON.parse(message.data))
    } catch (error) { void error; reportFailure('native-reply'); close(); return }
    if (reply.kind === 'workspace.closed') { close(); return }
    if (reply.kind === 'workspace.rich-packet') {
      try {
        const delivery = reply, packet = workspaceRichOwnerPacketSchema.parse(JSON.parse(delivery.packet)), owner = rich
        if (owner === undefined) throw new Error('native rich carrier unavailable')
        void owner.receive(delivery.lease, packet).then(async () => {
          if (delivery.id !== undefined && !stopped) await documentRequest('workspace.rich-request', JSON.stringify({ operation: 'ack', lease: delivery.lease, id: delivery.id }), new AbortController().signal)
        }).catch(error => {
          void error
          if (!stopped) void owner.receive(delivery.lease, { type: 'native.error', code: 'RICH_NATIVE_DELIVERY_FAILED' }).catch(failure => { void failure })
        })
      } catch (error) { void error; close() }
      return
    }
    const wait = pending.get(reply.id)
    if (wait === undefined) return
    pending.delete(reply.id); wait.dispose()
    if (reply.error) wait.reject(new Error('workspace request failed; outcome may be unknown'))
    else {
      try { wait.resolve(JSON.parse(reply.value)) }
      catch (error) { wait.reject(error instanceof Error ? error : new Error('workspace reply invalid')) }
    }
  }
  port.onmessageerror = close; port.start()
  target = { sessionId: parsed.data.sessionId, ...(parsed.data.plugin === undefined ? {} : { plugin: parsed.data.plugin }) }
  if (parsed.data.rich !== undefined) {
    rich = new WorkspaceNativeRich({ request: value => documentRequest('workspace.rich-request', JSON.stringify(value), new AbortController().signal) }, parsed.data.rich)
    ;(window as Window & { __DSH_RICH_CARRIER__?: WorkspaceNativeRich }).__DSH_RICH_CARRIER__ = rich
  }
  bootObserver.observe(document, { childList: true, subtree: true })
  start({ port, init: parsed.data }); announceCarrier(); publishBootState(); navigate()
}, { once: false })
window.addEventListener('pagehide', close, { once: true })
window.addEventListener('error', event => { if (event instanceof ErrorEvent) reportFailure('script-error') })
window.addEventListener('unhandledrejection', () => reportFailure('promise-rejection'))

async function documentRequest(kind: 'workspace.request' | 'workspace.rich-request', request: string, signal: AbortSignal): Promise<unknown> {
  const {port,init}=await ready

    if (stopped || signal.aborted || pending.size >= init.limits.maxPending) return Promise.reject(new Error('workspace wait unavailable'))
    const id = String(++counter), raw = JSON.stringify({ kind, id, request })
    if (new TextEncoder().encode(raw).byteLength > init.limits.maxPacketBytes) return Promise.reject(new Error('workspace request too large'))
    return new Promise((resolve, reject) => {
      const cancel = () => {
        if (!pending.delete(id)) return
        signal.removeEventListener('abort', cancel)
        try { port.postMessage(JSON.stringify({ kind: 'workspace.cancel', id })) }
        finally { reject(new Error('workspace wait cancelled')) }
      }
      pending.set(id, { resolve, reject, dispose: () => signal.removeEventListener('abort', cancel) })
      signal.addEventListener('abort', cancel, { once: true })
      try { if (signal.aborted) cancel(); else port.postMessage(raw) }
      catch (error) { pending.delete(id); signal.removeEventListener('abort', cancel); reject(error) }
    })

}
const client = ready.then(({ init }) => resolvedClient = new WorkspaceClient({
  request: (value, signal) => documentRequest('workspace.request', JSON.stringify(value), signal),
  encode: bytes => {
    let raw = ''
    for (const byte of bytes) raw += String.fromCharCode(byte)
    return btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  },
  decode: value => {
    const raw = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
    return Uint8Array.from(raw, character => character.charCodeAt(0))
  },
}, init.limits))
void client.catch(error => { void error; close() })
const hooks: ClientTransportHooks = {
  fetch: async (input, init) => (await client).fetch(new Request(new URL(input, location.href), init)),
  openStream: async function* (endpoint, payload, signal, uplink) { yield* (await client).openStream(endpoint, payload, signal, uplink) },
}
;(window as Window & { __DSH_TRANSPORT__?: ClientTransportHooks }).__DSH_TRANSPORT__ = hooks
window.fetch = async (input, init) => {
  const request = input instanceof Request ? new Request(input, init) : new Request(new URL(input, location.href), init)
  const response = await (await client).fetch(request)
  const reason = response.headers.get(WORKSPACE_ROUTE_HEADER)
  if (reason !== null) {
    const path = new URL(request.url).pathname
    console.warn('[workspace] ' + path + ' is not served to phone devices (' + reason + ')')
    window.dispatchEvent(new CustomEvent('harmony:workspace:route-unavailable', { detail: { path, reason } }))
  }
  return response
}
