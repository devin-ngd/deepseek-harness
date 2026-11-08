/** Bounded pull transport for standard resources and duplex streams over an admitted device connection. */
import { randomUUID } from 'node:crypto'
import { workspaceRequestSchema, type WorkspaceRequest, type WorkspaceHandle } from '../../src/workspace-protocol.ts'
import { id } from '../../src/protocol.ts'
import { jsonPayload } from '../../src/wire.ts'
import type { JsonValue } from '../../src/upstream.ts'
import { WorkspaceChannel, WorkspaceError } from './workspace-channel.ts'
import { workspacePageDiagnostic, type WorkspacePageDiagnostic } from './workspace-page-diagnostic.ts'

/** Deployment budgets for resources retained between encrypted requests. */
export interface WorkspaceWireLimits {
  readonly maxChunkBytes: number
  readonly maxBufferedBytes: number
  readonly maxBodyBytes: number
  readonly maxBodies: number
  readonly maxStreams: number
  readonly maxRequestBytes: number
}
interface Body { readonly bytes: Uint8Array; readonly pageSequence: number | undefined; offset: number }
/** A prepared page piece identified by the parent request's relay-local sequence. */
export interface WorkspacePageChunkTrace { readonly pageSequence: number; readonly offset: number; readonly bytes: number; readonly done: boolean }
/** Local diagnostics supplied only for known page fetches and reads. */
export type WorkspaceWireTrace =
  | { readonly kind: 'page'; readonly sequence: number; observe(diagnostic: WorkspacePageDiagnostic): void }
  | { readonly kind: 'chunk'; observe(diagnostic: WorkspacePageChunkTrace): void }
interface BodyWait { readonly signal: AbortSignal; readonly resolve: (release: () => void) => void; readonly abort: () => void }
interface Stream {
  readonly controller: AbortController
  readonly iterator: AsyncIterator<unknown>
  readonly writer: WritableStreamDefaultWriter<unknown>
  reading: boolean
  writing: boolean
  ended: boolean
  aborting?: Promise<void>
}

/** Standard authorized source required by the wire carrier; identity and policy remain with that source. */
export type WorkspaceWireSource = Pick<WorkspaceChannel, 'signal' | 'assertCurrent' | 'bootstrap' | 'fetch' | 'open' | 'failure'> & {
  manifest?: WorkspaceChannel['manifest']
  close(): void | Promise<void>
}

/** One wire owner is attached to one already authorized workspace, never shared across device connections. */
export class WorkspaceWireHost {
  private readonly lifetime = new AbortController()
  private readonly bodies = new Map<WorkspaceHandle, Body>()
  private readonly streams = new Map<WorkspaceHandle, Stream>()
  private buffered = 0
  private producing = 0
  private readonly bodyWaits: BodyWait[] = []
  private readonly draining = new Set<Promise<void>>()
  private cleanupFailed = false
  private cleanupFailure: unknown
  private closing: Promise<void> | undefined
  /** Whether this generation has retired; a new bootstrap requires a freshly admitted instance. */
  get closed(): boolean { return this.lifetime.signal.aborted }

  /** @param channel - original authorized standard workspace. @param limits - resolved finite transfer capacities. */
  constructor(private readonly channel: WorkspaceWireSource, private readonly limits: WorkspaceWireLimits) {
    if (!Object.values(limits).every(value => Number.isSafeInteger(value) && value > 0)
      || limits.maxChunkBytes > 1048576 || limits.maxChunkBytes > limits.maxBufferedBytes
      || limits.maxBodyBytes > limits.maxBufferedBytes) throw new WorkspaceError('workspace-denied')
    channel.signal.addEventListener('abort', () => {
      // close() retains any cleanup rejection for the carrier's awaited teardown.
      if (!this.lifetime.signal.aborted) void this.close().catch(error => { void error })
    }, { once: true })
    channel.assertCurrent()
  }

  /** @param signal - carrier request lifetime. Recheck the grant before handing prepared bytes to the encrypted sender. */
  assertCurrent(signal: AbortSignal): void {
    if (this.lifetime.signal.aborted || signal.aborted) throw new WorkspaceError('workspace-closed')
    this.channel.assertCurrent()
  }
  private retain(bytes: Uint8Array, pageSequence: number | undefined): { id: WorkspaceHandle; bytes: number } {
    if (this.bodies.size >= this.limits.maxBodies || bytes.byteLength > this.limits.maxBodyBytes
      || bytes.byteLength > this.limits.maxBufferedBytes - this.buffered) throw new WorkspaceError('workspace-resource-limit')
    const key = id<'harmony-workspace-handle'>(randomUUID())
    this.bodies.set(key, { bytes, offset: 0, pageSequence }); this.buffered += bytes.byteLength
    return { id: key, bytes: bytes.byteLength }
  }
  private release(key: WorkspaceHandle): void {
    const body = this.bodies.get(key)
    if (body !== undefined) { this.bodies.delete(key); this.buffered -= body.bytes.byteLength; this.wakeBodies() }
  }
  private bodySlot(): boolean { return this.bodies.size + this.producing < this.limits.maxBodies && this.limits.maxBodyBytes <= this.limits.maxBufferedBytes - this.buffered - this.producing * this.limits.maxBodyBytes }
  private occupyBody(): () => void {
    this.producing++; let released = false
    return () => { if (released) return; released = true; this.producing--; this.wakeBodies() }
  }
  private wakeBodies(): void {
    while (!this.closed && this.bodySlot() && this.bodyWaits.length > 0) {
      const wait = this.bodyWaits.shift()!; wait.signal.removeEventListener('abort', wait.abort); wait.resolve(this.occupyBody())
    }
  }
  private acquireBody(signal: AbortSignal): Promise<() => void> {
    this.assertCurrent(signal)
    if (this.bodySlot()) return Promise.resolve(this.occupyBody())
    if (this.bodyWaits.length >= this.limits.maxBodies) throw new WorkspaceError('workspace-resource-limit')
    return new Promise((resolve, reject) => {
      const wait: BodyWait = { signal, resolve, abort: () => {
        const index = this.bodyWaits.indexOf(wait); if (index >= 0) this.bodyWaits.splice(index, 1)
        reject(new WorkspaceError('workspace-closed'))
      } }
      this.bodyWaits.push(wait); signal.addEventListener('abort', wait.abort, { once: true })
    })
  }
  private async produceBody(read: () => Promise<Uint8Array>, signal: AbortSignal, retained: (id: WorkspaceHandle) => void, pageSequence?: number) {
    const release = await this.acquireBody(signal)
    try { this.assertCurrent(signal); const bytes = await read(); this.assertCurrent(signal); const body = this.retain(bytes, pageSequence); retained(body.id); return body }
    finally { release() }
  }

  /**
   * @param candidate - strict workspace message from this device's trusted native layer.
   * @param signal - individual carrier request lifetime.
   * @param trace - local page or chunk diagnostics, omitted on the normal path.
   * @returns a bounded JSON result; callers do not retry a lost mutation response.
   */
  async request(candidate: unknown, signal: AbortSignal, trace?: WorkspaceWireTrace): Promise<JsonValue> {
    this.assertCurrent(signal)
    const value = workspaceRequestSchema.parse(jsonPayload(candidate))
    if (Buffer.byteLength(JSON.stringify(value)) > this.limits.maxRequestBytes) throw new WorkspaceError('workspace-resource-limit')
    const lifetime = AbortSignal.any([signal, this.lifetime.signal])
    let retained: WorkspaceHandle | undefined
    let opened: WorkspaceHandle | undefined
    try {
      const result = await this.dispatch(value, lifetime, key => { retained = key }, key => { opened = key }, trace)
      this.assertCurrent(lifetime)
      return jsonPayload(result)
    } catch (error) {
      if (retained !== undefined) this.release(retained)
      if (opened !== undefined) await this.closeStream(opened)
      throw error
    }
  }

  private async dispatch(value: WorkspaceRequest, signal: AbortSignal, retain: (id: WorkspaceHandle) => void, opened: (id: WorkspaceHandle) => void,
    trace?: WorkspaceWireTrace): Promise<unknown> {
    switch (value.operation) {
      case 'close': throw new WorkspaceError('workspace-denied')
      case 'bootstrap': {
        return this.produceBody(async () => new TextEncoder().encode(JSON.stringify(this.channel.bootstrap())), signal, retain)
      }
      case 'manifest': {
        if (this.channel.manifest === undefined) throw new WorkspaceError('workspace-denied')
        return this.produceBody(async () => new TextEncoder().encode(JSON.stringify(await this.channel.manifest!(signal))), signal, retain)
      }
      case 'fetch': {
        const bytes = value.body === undefined ? undefined : Uint8Array.from(Buffer.from(value.body, 'base64url'))
        let status = 200, headers: [string, string][] = []
        const body = await this.produceBody(async () => {
          const response = await this.channel.fetch(new Request(value.url, { method: value.method, headers: value.headers,
            ...(bytes === undefined ? {} : { body: bytes }), signal }))
          status = response.status; headers = [...response.headers]
          const output = new Uint8Array(await response.arrayBuffer())
          if (trace?.kind === 'page') {
            try { trace.observe(workspacePageDiagnostic(bytes, status, output)) }
            catch (error) { void error /* Diagnostic callbacks cannot change the response. */ }
          }
          return output
        }, signal, retain, trace?.kind === 'page' ? trace.sequence : undefined)
        return { status, headers, body }
      }
      case 'read': {
        const body = this.bodies.get(value.id)
        if (body === undefined || body.offset !== value.offset) throw new WorkspaceError('workspace-denied')
        const end = Math.min(body.bytes.byteLength, value.offset + this.limits.maxChunkBytes)
        const piece = Buffer.from(body.bytes.subarray(value.offset, end)).toString('base64url')
        body.offset = end
        const done = end === body.bytes.byteLength
        if (done) this.release(value.id)
        if (trace?.kind === 'chunk' && body.pageSequence !== undefined) {
          try { trace.observe({ pageSequence: body.pageSequence, offset: value.offset, bytes: end - value.offset, done }) }
          catch (error) { void error /* Diagnostic callbacks cannot change the response. */ }
        }
        return { offset: value.offset, body: piece, done }
      }
      case 'release': this.release(value.id); return null
      case 'stream-open': {
        if (this.streams.size >= this.limits.maxStreams) throw new WorkspaceError('workspace-resource-limit')
        const controller = new AbortController(), input = new TransformStream<unknown, unknown>()
        const iterator = this.channel.open(value.endpoint, value.payload, controller.signal, input.readable)[Symbol.asyncIterator]()
        const key = id<'harmony-workspace-handle'>(randomUUID())
        this.streams.set(key, { controller, iterator, writer: input.writable.getWriter(), reading: false, writing: false, ended: false })
        opened(key); return { id: key }
      }
      case 'stream-next': {
        const stream = this.stream(value.id)
        if (stream.reading) throw new WorkspaceError('workspace-denied')
        stream.reading = true
        const abort = () => this.abortStream(stream)
        signal.addEventListener('abort', abort, { once: true })
        try {
          const item = await stream.iterator.next()
          this.assertCurrent(signal)
          if (item.done) { await this.closeStream(value.id); return { done: true } }
          const body = await this.produceBody(async () => new TextEncoder().encode(JSON.stringify(item.value)), signal, retain)
          return { done: false, body }
        } catch (error) {
          await this.closeStream(value.id)
          this.assertCurrent(signal)
          return { done: true, failure: this.channel.failure(error) }
        }
        finally { stream.reading = false; signal.removeEventListener('abort', abort) }
      }
      case 'stream-write': case 'stream-end': {
        const stream = this.stream(value.id)
        if (stream.writing || stream.ended) throw new WorkspaceError('workspace-denied')
        stream.writing = true
        const abort = () => this.abortStream(stream)
        signal.addEventListener('abort', abort, { once: true })
        try {
          if (value.operation === 'stream-end') { stream.ended = true; await stream.writer.close() }
          else await stream.writer.write(value.value)
          return null
        } catch (error) { await this.closeStream(value.id); throw error }
        finally { stream.writing = false; signal.removeEventListener('abort', abort) }
      }
      case 'stream-close': await this.closeStream(value.id); return null
    }
  }

  private stream(key: WorkspaceHandle): Stream {
    const stream = this.streams.get(key)
    if (stream === undefined || stream.controller.signal.aborted) throw new WorkspaceError('workspace-closed')
    return stream
  }
  private abortStream(stream: Stream): void {
    stream.controller.abort()
    stream.aborting ??= stream.writer.abort()
    // The stream's awaited close retains the original cleanup failure.
    void stream.aborting.catch(error => { void error })
  }
  private closeStream(key: WorkspaceHandle): Promise<void> {
    const stream = this.streams.get(key)
    if (stream === undefined) return Promise.resolve()
    this.streams.delete(key); this.abortStream(stream)
    const done = (async () => {
      const results = await Promise.allSettled([stream.aborting, stream.iterator.return?.()])
      stream.writer.releaseLock()
      const failed = results.find(result => result.status === 'rejected')
      if (failed?.status === 'rejected') { this.cleanupFailed = true; this.cleanupFailure ??= failed.reason; throw new WorkspaceError('workspace-closed', { cause: failed.reason }) }
    })()
    this.draining.add(done)
    void done.then(() => this.draining.delete(done), () => this.draining.delete(done))
    return done
  }
  /** @returns after all stream owners drain; stopping the workspace preserves accepted desktop tasks. */
  close(): Promise<void> {
    return this.closing ??= (async () => {
      this.lifetime.abort(); const source = this.channel.close(); this.bodies.clear(); this.buffered = 0
      const results = await Promise.allSettled([source, ...this.draining, ...[...this.streams.keys()].map(key => this.closeStream(key))])
      const failed = results.find(result => result.status === 'rejected')
      if (this.cleanupFailed || failed?.status === 'rejected') throw new WorkspaceError('workspace-closed', { cause: this.cleanupFailure ?? (failed?.status === 'rejected' ? failed.reason : undefined) })
    })()
  }
}
