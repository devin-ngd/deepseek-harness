/** Browser-safe standard workspace transport, with no native identity or guest access. */
import { workspaceRequestSchema, workspaceNextSchema, workspaceResponseSchema, workspaceStreamSchema, workspaceShellManifestSchema,
  WORKSPACE_PLUGIN_EVENTS, WORKSPACE_PLUGIN_EVENTS_PATH, workspaceAllowsResponseBody, type WorkspaceRequest, type WorkspaceHandle } from './workspace-protocol.ts'
import { readWorkspaceBytes } from './workspace-bytes.ts'

/** The native device owner provides this port only to its trusted workspace. */
export interface WorkspaceRequestPort {
  request(value: WorkspaceRequest, signal: AbortSignal): Promise<unknown>
  encode(bytes: Uint8Array): string
  decode(value: string): Uint8Array
}
/** Explicit assembly budgets resolved by the native workspace owner. */
export interface WorkspaceClientLimits {
  readonly origin: string
  readonly maxRequestBytes: number
  readonly maxResponseBytes: number
  readonly maxChunkBytes: number
}

/** One connection generation; disposal aborts every owned request and stream without replaying mutations. */
export class WorkspaceClient {
  private readonly lifetime = new AbortController()
  private readonly work = new Set<Promise<void>>()
  private readonly origin: string
  private closing: Promise<void> | undefined

  /** @param port - admitted native encrypted request port. @param limits - finite same-origin transfer budgets. */
  constructor(private readonly port: WorkspaceRequestPort, private readonly limits: WorkspaceClientLimits) {
    const origin = new URL(limits.origin)
    if (origin.origin !== limits.origin || origin.protocol !== 'https:'
      || ![limits.maxRequestBytes, limits.maxResponseBytes, limits.maxChunkBytes].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('workspace configuration denied')
    this.origin = origin.origin
  }

  private async call(value: WorkspaceRequest, signal: AbortSignal): Promise<unknown> {
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    combined.throwIfAborted()
    const response = await this.port.request(value, combined)
    combined.throwIfAborted()
    return response
  }

  private async bytes(candidate: unknown, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
    return readWorkspaceBytes(candidate, {
      request: value => this.call(value, signal),
      release: value => this.lifetime.signal.aborted ? Promise.resolve(null) : this.call(value, this.lifetime.signal),
      decode: value => this.port.decode(value),
    }, { maxBytes: this.limits.maxResponseBytes, maxChunkBytes: this.limits.maxChunkBytes })
  }

  /** @param signal - workspace boot wait. @returns the original Host's public boot rows as parsed JSON. */
  async bootstrap(signal: AbortSignal): Promise<unknown> {
    const body = await this.call({ operation: 'bootstrap' }, signal)
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await this.bytes(body, signal)))
  }
  /** @param signal - native cache inventory wait. @returns validated shell revision and logical file metadata. */
  async manifest(signal: AbortSignal) {
    const body = await this.call({ operation: 'manifest' }, signal)
    return workspaceShellManifestSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await this.bytes(body, signal))))
  }

  /**
   * @param request - same-origin Web resource or standard API request.
   * @returns reconstructed binary response after exact length checks; a lost RPC response remains uncertain.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.origin !== this.origin || url.username || url.password) throw new Error('workspace origin denied')
    if (url.pathname === WORKSPACE_PLUGIN_EVENTS_PATH && request.method === 'GET') return this.pluginEvents(request.signal)
    const contentLength = request.headers.get('content-length')
    if (contentLength !== null && Number(contentLength) > this.limits.maxRequestBytes) throw new Error('workspace request too large')
    const raw = request.body === null ? undefined : await this.readRequest(request)
    const input = { operation: 'fetch', url: url.href, method: request.method, headers: [...request.headers],
      ...(raw === undefined ? {} : { body: this.port.encode(raw) }) }
    // Parse the native-to-wire input as well, keeping unsupported methods out of the carrier.
    const response = workspaceResponseSchema.parse(await this.call(workspaceRequestSchema.parse(input), request.signal))
    const bytes = await this.bytes(response.body, request.signal)
    return new Response(workspaceAllowsResponseBody(request.method, response.status) ? bytes : null,
      { status: response.status, headers: response.headers })
  }

  private pluginEvents(signal: AbortSignal): Response {
    const controller = new AbortController(), combined = AbortSignal.any([signal, controller.signal])
    const iterator = this.openStream(WORKSPACE_PLUGIN_EVENTS, null, combined)[Symbol.asyncIterator]()
    return new Response(new ReadableStream<Uint8Array>({
      async pull(output) {
        try { const item = await iterator.next(); if (item.done) output.close(); else output.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(item.value) + '\n\n')) }
        catch (error) { output.error(error) }
      }, async cancel() { controller.abort(); await iterator.return?.() },
    }, { highWaterMark: 0 }), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } })
  }

  private async readRequest(request: Request): Promise<Uint8Array<ArrayBuffer>> {
    const reader = request.body!.getReader(), chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const item = await reader.read()
        request.signal.throwIfAborted(); this.lifetime.signal.throwIfAborted()
        if (item.done) break
        length += item.value.byteLength
        if (length > this.limits.maxRequestBytes) throw new Error('workspace request too large')
        chunks.push(item.value)
      }
    } finally { await reader.cancel(); reader.releaseLock() }
    const result = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
    return result
  }

  /**
   * @param endpoint - standard Gateway endpoint selected by an installed plugin.
   * @param payload - original standard stream request.
   * @param signal - standard caller's cancellation lifetime.
   * @param uplink - optional standard duplex input; writes are sequential with Host backpressure.
   * @returns the unchanged standard stream frames and standard failure codes.
   */
  async *openStream(endpoint: string, payload: unknown, signal: AbortSignal, uplink?: AsyncIterable<unknown>): AsyncIterable<unknown> {
    const controller = new AbortController(), combined = AbortSignal.any([signal, controller.signal, this.lifetime.signal])
    const stream = workspaceStreamSchema.parse(await this.call({ operation: 'stream-open', endpoint, payload }, combined))
    let inputFailure: unknown
    const input = this.writeStream(stream.id, uplink, combined).catch(error => { inputFailure = error; controller.abort() })
    this.work.add(input)
    try {
      while (true) {
        const next = workspaceNextSchema.parse(await this.call({ operation: 'stream-next', id: stream.id }, combined))
        if (next.done) {
          if (next.failure !== undefined) throw Object.assign(new Error(next.failure.message), next.failure)
          return
        }
        yield JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await this.bytes(next.body, combined)))
      }
    } catch (error) { throw inputFailure ?? error }
    finally {
      controller.abort()
      if (!this.lifetime.signal.aborted) await this.call({ operation: 'stream-close', id: stream.id }, this.lifetime.signal)
      await input; this.work.delete(input)
    }
  }

  private async writeStream(key: WorkspaceHandle, input: AsyncIterable<unknown> | undefined, signal: AbortSignal): Promise<void> {
    if (input !== undefined) for await (const value of input) {
      signal.throwIfAborted()
      await this.call({ operation: 'stream-write', id: key, value }, signal)
    }
    if (!signal.aborted) await this.call({ operation: 'stream-end', id: key }, signal)
  }

  /** @returns after tracked uplink owners have drained; the native owner also closes the Host workspace lease. */
  close(): Promise<void> {
    return this.closing ??= (async () => { this.lifetime.abort(); await Promise.all(this.work); this.work.clear() })()
  }
}
