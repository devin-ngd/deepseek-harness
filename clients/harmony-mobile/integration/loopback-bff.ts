/** Explicit loopback-only test carrier for the real BFF; listening remains disabled unless configured by a test. */
import { createServer } from 'node:http'
import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway'
import { fields, text, natural } from '../src/link-protocol.ts'
import { jsonPayload, TransportError } from '../src/wire.ts'
import type { CommandId } from '../src/link-protocol.ts'
import { id } from '../src/protocol.ts'
import type { NativeFollowFaults } from './native-follow-faults.ts'
import { parseWireItem } from '../src/wire.ts'
import { setTimeout as delay } from 'node:timers/promises'
import type { CommandAudit } from './command-audit.ts'

/** Carrier defaults to disabled at the application call site; loopback activation has explicit bounded limits. */
export type LoopbackBffConfig = { readonly enabled: false } | { readonly enabled: true; readonly host: '127.0.0.1'; readonly port: number;
  readonly maxRequestBytes: number; readonly maxFrameBytes: number; readonly writeHighWaterMark: number;
  readonly drainTimeoutMs: number; readonly requestTimeoutMs: number; readonly followSegmentMs: number; readonly maxConnections: number; readonly maxActiveRequests: number }
/** Counters describe actual carrier ownership; they do not establish WAN performance. */
export interface CarrierMetrics { requests: number; follows: number; active: number; drainWaits: number; disconnected: number; gatewayErrors: number }
/** Writable methods needed by the carrier; domain code never receives a socket. */
export interface WritablePort {
  /** @param line - one bounded encoded frame. @returns false while the carrier must wait for drain. */
  write(line: string): boolean
  /** @param event - writable readiness or failure. @param listener - one-shot continuation. */
  once(event: 'drain' | 'error', listener: (() => void) | ((error: Error) => void)): void
  /** @param event - owned event registration. @param listener - previously installed continuation. */
  removeListener(event: 'drain' | 'error', listener: (() => void) | ((error: Error) => void)): void
}
/** @param response - bounded writable response. @param line - one encoded frame. @param signal - response lifetime. @param timeoutMs - maximum stalled drain. @param metrics - owned counters. @returns after writable backpressure clears. */
export async function writeLine(response: WritablePort, line: string, signal: AbortSignal, timeoutMs: number, metrics: CarrierMetrics): Promise<void> {
  if (signal.aborted) throw new TransportError('cancelled')
  if (response.write(line)) return
  metrics.drainWaits++
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); response.removeListener('drain', drain); response.removeListener('error', failed); signal.removeEventListener('abort', aborted) }
    const drain = () => { cleanup(); resolve() }
    const failed = (error: Error) => { cleanup(); reject(error) }
    const aborted = () => { cleanup(); reject(new TransportError('cancelled')) }
    const timer = setTimeout(() => { cleanup(); reject(new TransportError('backpressure-timeout')) }, timeoutMs)
    response.once('drain', drain); response.once('error', failed); signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
  })
}
async function body(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  let bytes = 0
  const storage = Buffer.alloc(maxBytes)
  for await (const chunk of request) {
    const part: unknown = chunk
    if (!Buffer.isBuffer(part)) throw new TransportError('invalid-frame')
    if (bytes + part.byteLength > maxBytes) throw new TransportError('frame-too-large')
    part.copy(storage, bytes); bytes += part.byteLength
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(storage.subarray(0, bytes))) }
  catch (error) { throw new TransportError('invalid-json', { cause: error }) }
}
/** @param ctx - guarded real Gateway composition. @param config - explicit test activation; a fixed port additionally requires the approved native acceptance owner. @returns disabled state or owned loopback listener and awaited teardown. */
export async function startLoopbackBff(ctx: Context, config: LoopbackBffConfig, faults?: NativeFollowFaults, audit?: CommandAudit) {
  if (!config.enabled) return { enabled: false as const }
  if (config.host !== '127.0.0.1' || !Number.isSafeInteger(config.port) || config.port < 0 || config.port > 65535 || config.port !== 0 && !['approved-phase13', 'approved-phase16', 'approved-phase17', 'approved-phase18', 'approved-phase20', 'approved-phase22', 'approved-phase24', 'approved-phase26'].includes(process.env.DSH_HARMONY_NATIVE_ACCEPTANCE ?? '') || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw new TransportError('scope-denied')
  for (const value of [config.maxRequestBytes, config.maxFrameBytes, config.writeHighWaterMark, config.drainTimeoutMs, config.requestTimeoutMs, config.followSegmentMs, config.maxConnections, config.maxActiveRequests]) if (!Number.isSafeInteger(value) || value < 1) throw new TransportError('invalid-config')
  if (config.followSegmentMs >= config.requestTimeoutMs) throw new TransportError('invalid-config')
  const metrics: CarrierMetrics = { requests: 0, follows: 0, active: 0, drainWaits: 0, disconnected: 0, gatewayErrors: 0 }
  const tasks = new Set<Promise<void>>(), lifetimes = new Set<AbortController>()
  let closed = false
  const server = createServer({ highWaterMark: config.writeHighWaterMark }, (request, response) => {
    const receivedAt = Date.now()
    if (closed || metrics.active >= config.maxActiveRequests) { response.writeHead(503); response.end(); return }
    const life = new AbortController(); lifetimes.add(life); metrics.active++
    const timer = setTimeout(() => life.abort(new TransportError('timeout')), config.requestTimeoutMs)
    life.signal.addEventListener('abort', () => { if (!request.complete) request.destroy(); response.destroy() }, { once: true })
    response.on('error', error => { life.abort(error) })
    response.on('close', () => { if (!response.writableEnded) { metrics.disconnected++; life.abort(new TransportError('transport-lost')) } })
    const emit = async (value: unknown) => {
      const line = JSON.stringify(value) + '\n'
      if (Buffer.byteLength(line) > config.maxFrameBytes) throw new TransportError('frame-too-large')
      await writeLine(response, line, life.signal, config.drainTimeoutMs, metrics)
    }
    let commandId: CommandId = id<'mobile-command'>('invalid-command'), stream = false
    const task = (async () => {
      try {
        if (closed || request.method !== 'POST' || request.headers.origin !== undefined || request.headers['content-type'] !== 'application/json'
          || request.url !== '/mobile/command' && request.url !== '/mobile/follow') { response.writeHead(403); response.end(); return }
        const decoded = await body(request, config.maxRequestBytes)
        response.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-dsh-mobile-stream': 'dsh-mobile-wire/1;status=200' })
        if (request.url === '/mobile/command') {
          const candidate = fields(decoded, ['protocol', 'desktopId', 'deviceId', 'grantEpoch', 'commandId', 'expiresAt', 'operation', 'payload'])
          commandId = id<'mobile-command'>(text(candidate.commandId)); metrics.requests++
          audit?.record({ stage: 'received', commandId, expiresAt: natural(candidate.expiresAt), at: receivedAt, outcome: 'received' })
          const value = await ctx.typertGateway.invoke({ namespace: 'harmonyMobile', method: 'request', args: { packet: JSON.stringify(decoded) }, peer: ctx.connection.browserPeer, signal: life.signal })
          await emit({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', commandId, ok: true, value: jsonPayload(value) })
        } else {
          stream = true; metrics.follows++
          const value = fields(decoded, ['command', 'resume']), command = fields(value.command, ['protocol', 'desktopId', 'deviceId', 'grantEpoch', 'commandId', 'expiresAt', 'operation', 'payload'])
          commandId = id<'mobile-command'>(text(command.commandId))
          const expiresAt = natural(command.expiresAt)
          audit?.record({ stage: 'received', commandId, expiresAt, at: receivedAt, outcome: 'received' })
          const segment = new AbortController(), ended = new TransportError('follow-segment-ended')
          const stop = () => segment.abort(life.signal.reason)
          life.signal.addEventListener('abort', stop, { once: true })
          const segmentTimer = setTimeout(() => segment.abort(ended), config.followSegmentMs)
          try {
            if (life.signal.aborted) stop()
            const fault = faults?.take()
            const faultIndex = faults?.report.consumed.length
            if (fault) audit?.record({ stage: 'fault-taken', commandId, expiresAt, at: Date.now(), outcome: 'taken', fault, ...(faultIndex === undefined ? {} : { faultIndex }) })
            const source = await ctx.typertGateway.wireStream.open('harmonyMobile/follow', { args: { packet: JSON.stringify(value.command), resume: fault ? { instance: null, relayCursor: -1 } : value.resume } },
              (async function* () {})(), ctx.connection.browserPeer, segment.signal)
            for await (const item of source) {
              if (fault && faults) {
                const injected = faults.bytes(fault, commandId, parseWireItem(item))
                if (Buffer.byteLength(injected.text) > config.maxFrameBytes) throw new TransportError('frame-too-large')
                await writeLine(response, injected.text, life.signal, config.drainTimeoutMs, metrics)
                faults.recordWrite(fault)
                audit?.record({ stage: 'fault-written', commandId, expiresAt, at: Date.now(), outcome: 'written', fault, ...(faultIndex === undefined ? {} : { faultIndex }) })
                if (injected.resetSocket) { await delay(10); response.destroy() } else response.end()
                segment.abort(new TransportError('fixture-fault-complete'))
                return
              }
              await emit({ type: 'item', streamId: commandId, value: jsonPayload(item) })
            }
          } catch (error) { if (life.signal.aborted || segment.signal.reason !== ended) throw error }
          finally { clearTimeout(segmentTimer); life.signal.removeEventListener('abort', stop) }
          await emit({ type: 'end', streamId: commandId })
        }
        response.end()
      } catch (error) {
        metrics.gatewayErrors++
        if (!life.signal.aborted && !response.destroyed) {
          const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'request-failed'
          try {
            if (!response.headersSent) response.writeHead(200, { 'content-type': 'application/x-ndjson', 'x-dsh-mobile-stream': 'dsh-mobile-wire/1;status=200' })
            await emit(stream ? { type: 'error', streamId: commandId, error: { code, message: code, details: {} } }
              : { protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', commandId, ok: false, code })
            response.end()
          } catch (writeError) { response.destroy(writeError instanceof Error ? writeError : new Error('Response cleanup failed')) }
        } else response.destroy()
      } finally { clearTimeout(timer); lifetimes.delete(life); metrics.active-- }
    })()
    tasks.add(task); void task.then(() => tasks.delete(task), () => tasks.delete(task))
  })
  server.maxConnections = config.maxConnections
  try { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, () => { server.removeListener('error', reject); resolve() }) }) }
  catch (error) { server.close(); throw error }
  const address = server.address()
  if (address === null || typeof address === 'string') throw new TransportError('invalid-address')
  return { enabled: true as const, url: 'http://127.0.0.1:' + address.port + '/', metrics,
    close: async () => {
      if (closed) return
      closed = true
      for (const lifetime of lifetimes) lifetime.abort(new TransportError('closed'))
      const finished = new Promise<void>((resolve, reject) => server.close(error => { if (error !== undefined) reject(error); else resolve() }))
      server.closeAllConnections(); await Promise.allSettled([...tasks]); await finished
    },
  }
}
