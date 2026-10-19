/** Default-disabled fetch transport; connection status is local state and cannot be set by a remote payload. */
import type { MobileCommand } from './link-protocol.ts'
import type { JsonValue } from './upstream.ts'
import { NdjsonDecoder, parseWireItem, parseWireReply, TransportError } from './wire.ts'
import type { WireItem, WireResume } from './wire.ts'
import { parseRemoteStreamServerMessage } from './upstream-stream.ts'

/** Explicit deployment selection; configured-https is reserved and rejected until a separately reviewed authenticated provider exists. */
export type NetworkConfig = { readonly enabled: false } | {
  readonly enabled: true
  readonly mode: 'loopback-fixed-replay' | 'configured-https'
  readonly baseUrl: string
  readonly maxFrameBytes: number
  readonly maxReadChunkBytes: number
  readonly requestTimeoutMs: number
  readonly maxInFlight: number
}
/** Native UI owns localized labels for these states. Connected here means decoded transport traffic, not task success. */
export interface NetworkState { readonly mode: 'disabled' | 'loopback-fixed-replay' | 'configured-https'; readonly connection: 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'closed'; readonly error: string | null }
interface ResolvedNetworkConfig { readonly mode: 'loopback-fixed-replay' | 'configured-https'; readonly baseUrl: URL; readonly maxFrameBytes: number; readonly maxReadChunkBytes: number; readonly requestTimeoutMs: number; readonly maxInFlight: number }
/** A decoded remote refusal leaves the transport connected; it is distinct from losing its response. */
export class RemoteRequestError extends TransportError {}
/** @param request - explicit application configuration. @returns validated deployment policy or disabled state. */
export function resolveNetworkConfig(request: NetworkConfig): ResolvedNetworkConfig | null {
  if (!request.enabled) return null
  if (request.mode === 'configured-https') throw new TransportError('live-provider-unavailable')
  let baseUrl: URL
  try { baseUrl = new URL(request.baseUrl) } catch (error) { throw new TransportError('invalid-config', { cause: error }) }
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || baseUrl.pathname !== '/') throw new TransportError('invalid-config')
  if (baseUrl.protocol !== 'http:' || baseUrl.hostname !== '127.0.0.1') throw new TransportError('invalid-config')
  for (const value of [request.maxFrameBytes, request.maxReadChunkBytes, request.requestTimeoutMs, request.maxInFlight]) if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new TransportError('invalid-config')
  if (request.maxFrameBytes < 2) throw new TransportError('invalid-config')
  return { mode: request.mode, baseUrl, maxFrameBytes: request.maxFrameBytes, maxReadChunkBytes: request.maxReadChunkBytes, requestTimeoutMs: request.requestTimeoutMs, maxInFlight: request.maxInFlight }
}
/** HTTP response admitted by a platform carrier before shared wire parsing. */
export interface HttpByteResponse {
  readonly status: number
  readonly contentType: string | null
  readonly body: AsyncIterable<Uint8Array>
  /** @returns after callbacks or response readers cease; repeated calls join the same disposal. */
  close(): Promise<void>
}
/** Platform owns HTTP mechanics; consumers own decoding and task identity. */
export interface HttpBytePort {
  /** @param url - resolved fixed BFF endpoint. @param body - bounded request JSON. @param signal - transport lifetime. @returns platform byte response with awaited disposal. */
  open(url: URL, body: string, signal: AbortSignal): Promise<HttpByteResponse>
}
/** Shared bounded BFF wire consumer. Native and fetch carriers use this parser without impersonating each other. */
export class ByteNetworkPhone {
  private readonly config: ResolvedNetworkConfig | null
  private readonly lifetimes = new Set<AbortController>()
  private readonly responses = new Set<HttpByteResponse>()
  private stateValue: NetworkState
  private closed = false
  /** @param request - explicit owner configuration. @param bytePort - native or fetch HTTP carrier, never supplied by a guest. */
  constructor(request: NetworkConfig, private readonly bytePort: HttpBytePort) {
    this.config = resolveNetworkConfig(request)
    this.stateValue = { mode: this.config?.mode ?? 'disabled', connection: this.config === null ? 'disabled' : 'disconnected', error: null }
  }
  /** @returns detached status for trusted UI; generated rich HTML receives no configuration port. */
  get state(): NetworkState { return { ...this.stateValue } }
  private policy(): ResolvedNetworkConfig {
    if (this.closed) throw new TransportError('closed')
    if (this.config === null) throw new TransportError('disabled')
    return this.config
  }
  private lifetime(signal?: AbortSignal) {
    const config = this.policy(), controller = new AbortController()
    if (this.lifetimes.size >= config.maxInFlight) throw new TransportError('queue-full')
    this.lifetimes.add(controller)
    const onAbort = () => { controller.abort(new TransportError('cancelled')) }
    if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => controller.abort(new TransportError('timeout')), config.requestTimeoutMs)
    return { config, controller, close: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); this.lifetimes.delete(controller) } }
  }
  private failure(error: unknown, signal: AbortSignal): TransportError {
    const value = signal.aborted && signal.reason instanceof TransportError ? signal.reason
      : error instanceof TransportError ? error : new TransportError('transport-lost', { cause: error })
    if (!this.closed) this.stateValue = { ...this.stateValue, connection: error instanceof RemoteRequestError ? 'connected' : 'disconnected', error: value.code }
    return value
  }
  private async *body(response: HttpByteResponse, maxFrameBytes: number, maxReadChunkBytes: number, signal: AbortSignal): AsyncIterable<string> {
    this.responses.add(response)
    try {
      if (response.status !== 200 || response.contentType !== 'application/x-ndjson') throw new TransportError('http-rejected')
      const decoder = new NdjsonDecoder(maxFrameBytes)
      for await (const chunk of response.body) {
        if (signal.aborted) throw signal.reason
        if (chunk.byteLength > maxReadChunkBytes) throw new TransportError('read-chunk-too-large')
        for (const line of decoder.push(chunk)) { if (signal.aborted) throw signal.reason; yield line }
      }
      if (signal.aborted) throw signal.reason
      decoder.finish()
    } finally { try { await response.close() } finally { this.responses.delete(response) } }
  }
  private async response(path: string, body: unknown, config: ResolvedNetworkConfig, signal: AbortSignal): Promise<HttpByteResponse> {
    const encoded = JSON.stringify(body)
    if (new TextEncoder().encode(encoded).byteLength > config.maxFrameBytes) throw new TransportError('frame-too-large')
    this.stateValue = { ...this.stateValue, connection: 'connecting', error: null }
    return this.bytePort.open(new URL(path, config.baseUrl), encoded, signal)
  }
  /** @param command - owner-minted complete packet. @param signal - cancels the transport wait, not accepted desktop work. @returns bounded JSON; a domain decoder must accept it before product projection. */
  async request(command: MobileCommand, signal?: AbortSignal): Promise<JsonValue> {
    const life = this.lifetime(signal)
    try {
      const response = await this.response('/mobile/command', command, life.config, life.controller.signal)
      let value: JsonValue | undefined, seen = false
      for await (const line of this.body(response, life.config.maxFrameBytes, life.config.maxReadChunkBytes, life.controller.signal)) {
        if (seen) throw new TransportError('extra-response')
        let candidate: unknown
        try { candidate = JSON.parse(line) } catch (error) { throw new TransportError('invalid-json', { cause: error }) }
        const reply = parseWireReply(candidate, command.commandId)
        if (!reply.ok) throw new RemoteRequestError(reply.code)
        value = reply.value; seen = true
      }
      if (!seen || value === undefined) throw new TransportError('truncated-frame')
      this.stateValue = { ...this.stateValue, connection: 'connected', error: null }; return value
    } catch (error) { throw this.failure(error, life.controller.signal) } finally { life.close() }
  }
  /** @param command - session.sync command selected by trusted native UI. @param resume - last verified transport hint. @param signal - foreground stream lifetime. @returns raw owner-bound frames, never arbitrary RPC endpoints. */
  async *follow(command: MobileCommand, resume: WireResume, signal?: AbortSignal): AsyncIterable<WireItem> {
    const life = this.lifetime(signal)
    let ended = false
    try {
      const response = await this.response('/mobile/follow', { command, resume }, life.config, life.controller.signal)
      for await (const line of this.body(response, life.config.maxFrameBytes, life.config.maxReadChunkBytes, life.controller.signal)) {
        if (ended) throw new TransportError('extra-response')
        let frame: ReturnType<typeof parseRemoteStreamServerMessage>
        try { frame = parseRemoteStreamServerMessage(line) }
        catch (error) { throw new TransportError(error instanceof SyntaxError ? 'invalid-json' : 'invalid-frame', { cause: error }) }
        if (frame.streamId !== command.commandId) throw new TransportError('scope-denied')
        if (frame.type === 'error') throw new TransportError(frame.error.code)
        if (frame.type === 'end') { ended = true; continue }
        const item = parseWireItem(frame.value)
        if (item.desktopId !== command.desktopId || item.deviceId !== command.deviceId || item.sessionId !== command.payload.sessionId) throw new TransportError('scope-denied')
        this.stateValue = { ...this.stateValue, connection: 'connected', error: null }; yield item
      }
      if (!ended) throw new TransportError('transport-lost')
    } catch (error) { throw this.failure(error, life.controller.signal) }
    finally { life.close(); if (!this.closed) this.stateValue = { ...this.stateValue, connection: 'disconnected' } }
  }
  /** Abort owned waits and byte responses; consumers still own returning any paused async iterator. */
  async close(): Promise<void> {
    this.closed = true; this.stateValue = { ...this.stateValue, connection: 'closed' }
    for (const controller of this.lifetimes) controller.abort(new TransportError('closed'))
    const results = await Promise.allSettled([...this.responses].map(response => response.close()))
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  }
}

/** Fetch carrier owns browser/Node response readers; it is never used as a native SDK substitute. */
class FetchBytePort implements HttpBytePort {
  constructor(private readonly fetchPort: typeof fetch) {}
  async open(url: URL, encoded: string, signal: AbortSignal): Promise<HttpByteResponse> {
    const response = await this.fetchPort(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: encoded, signal, redirect: 'error', credentials: 'omit', cache: 'no-store' })
    if (response.body === null) throw new TransportError('http-rejected')
    const reader = response.body.getReader()
    let closing: Promise<void> | undefined
    const close = (): Promise<void> => {
      if (closing) return closing
      signal.removeEventListener('abort', aborted)
      closing = reader.cancel().finally(() => reader.releaseLock())
      return closing
    }
    const aborted = () => { void close().catch((error: unknown) => { void error }) } // The owner awaits and reports the same disposal promise.
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
    return { status: response.status, contentType: response.headers.get('content-type'),
      body: (async function* () { while (true) { if (signal.aborted) throw signal.reason; const next = await reader.read(); if (next.done) return; yield next.value } })(), close }
  }
}
/** Existing fetch application face retains explicit settings and the shared byte parser. */
export class NetworkPhone extends ByteNetworkPhone {
  /** @param request - disabled by default at the owning application. @param fetchPort - maintained fetch implementation. */
  constructor(request: NetworkConfig, fetchPort: typeof fetch) { super(request, new FetchBytePort(fetchPort)) }
}
