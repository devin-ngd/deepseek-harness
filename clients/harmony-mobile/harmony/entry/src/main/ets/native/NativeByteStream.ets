/** Bounded native byte carriers. Live HTTP is compiled but never registered on the app's offline message port. */
import { http } from '@kit.NetworkKit'
import { util } from '@kit.ArkTS'
import { deviceInfo, BusinessError } from '@kit.BasicServicesKit'
import { NativeFailure } from './NativeFailure'
import { NativeDiagnostics } from './NativeDiagnostics'
import { isWireNatural, isWireId } from '../generated/WireFields'
import { NATIVE_ACCEPTANCE_TEST } from '../generated/NativeBuildMode'

interface CommandClockFields { commandId: string; expiresAt: number; operation: string }
interface FollowClockFields { command: CommandClockFields }
interface CommandSendTiming { commandId: string; expiresAt: number; sentAt: number; clockSource: string; unit: string }
interface NativeByteDelivery { commandId: string; receivedBytes: number; deliveredBytes: number; ended: boolean; code: string }

/** Sink owns parsing and generation admission; byte delivery never establishes task completion. */
export interface NativeByteSink { chunk(bytes: Uint8Array): void; end(): void; failed(code: string): void }
/** Explicit immutable HAP transport settings; no URL or enable flag is taken from Web content. */
export class NativeStreamPolicy {
  enabled: boolean
  url: string
  maxChunkBytes: number
  maxTotalBytes: number
  timeoutMs: number
  constructor(enabled: boolean, url: string, maxChunkBytes: number, maxTotalBytes: number, timeoutMs: number) {
    this.enabled = enabled; this.url = url; this.maxChunkBytes = maxChunkBytes; this.maxTotalBytes = maxTotalBytes; this.timeoutMs = timeoutMs
  }
}
/** Native SDK HTTP provider; default owner policy is disabled and permissions remain empty. No credentials enter the sink. */
export class NativeHttpStream {
  private diagnostics: NativeDiagnostics = new NativeDiagnostics()
  /** @returns sticky observation failure count, independently of product IO and disposal. */
  get diagnosticFailures(): number { return this.diagnostics.failures }
  private policy: NativeStreamPolicy
  private request: http.HttpRequest | null = null
  private completion: Promise<void> | null = null
  private stop: (() => void) | null = null
  private requestFailure(code: number): string {
    if (code === 201) return 'stream-permission-denied'
    if (code === 2300028) return 'timeout'
    if ([2300007, 2300018, 2300052, 2300055, 2300056].includes(code)) return 'transport-lost'
    return 'stream-request-failed'
  }
  constructor(policy: NativeStreamPolicy) {
    for (const bound of [policy.maxChunkBytes, policy.maxTotalBytes, policy.timeoutMs]) if (!Number.isSafeInteger(bound) || bound < 1) throw new NativeFailure('stream-config-invalid')
    if (policy.enabled) {
      const match = /^http:\/\/127\.0\.0\.1:([0-9]+)\/mobile\/(?:follow|command)$/.exec(policy.url)
      if (match === null || Number(match[1]) < 1 || Number(match[1]) > 65535) throw new NativeFailure('stream-scope-denied')
      if (deviceInfo.sdkApiVersion < 23) throw new NativeFailure('stream-api-unsupported')
    }
    this.policy = policy
  }
  /** @param body - native-selected fixed replay follow envelope. @param sink - native parser carrier. @returns after SDK request destruction; never retries. */
  async open(body: string, sink: NativeByteSink): Promise<void> {
    if (!this.policy.enabled) throw new NativeFailure('stream-disabled')
    if (this.request !== null || new util.TextEncoder().encodeInto(body).byteLength > this.policy.maxChunkBytes) throw new NativeFailure('stream-busy')
    const request = http.createHttp(); this.request = request
    let total = 0; let delivered = 0; let diagnosticCommandId = ''; let ended = false; let status = false; let headersAccepted = false; let settled = false
    const queued: Uint8Array[] = []
    this.completion = new Promise<void>((accept) => {
      const finish = (code: string): void => {
        if (settled) return
        settled = true; clearTimeout(timer)
        let cleanupFailed = false
        for (const event of ['dataReceive', 'dataEnd', 'headersReceive']) {
          try {
            if (event === 'dataReceive') request.off('dataReceive')
            else if (event === 'dataEnd') request.off('dataEnd')
            else request.off('headersReceive')
          } catch (error) { void error; cleanupFailed = true }
        }
        try { request.destroy() } catch (error) { void error; cleanupFailed = true }
        this.request = null; this.stop = null; queued.length = 0
        if (NATIVE_ACCEPTANCE_TEST && diagnosticCommandId.length > 0) {
          const delivery: NativeByteDelivery = { commandId: diagnosticCommandId, receivedBytes: total, deliveredBytes: delivered, ended, code: cleanupFailed ? 'stream-cleanup-failed' : code }
          this.diagnostics.observe(() => 'DSH native byte delivery: ' + JSON.stringify(delivery))
        }
        try { if (cleanupFailed) sink.failed('stream-cleanup-failed'); else if (code.length === 0) sink.end(); else sink.failed(code) }
        catch (error) { void error } // The sink owns its error display; callback failure cannot keep the native disposal wait alive.
        finally { accept() }
      }
      const timer = setTimeout(() => finish('stream-timeout'), this.policy.timeoutMs)
      this.stop = () => finish('stream-closed')
      const drain = (): void => {
        if (!headersAccepted || !status || settled) return
        try { for (const chunk of queued) { sink.chunk(chunk); delivered += chunk.byteLength }; queued.length = 0 }
        catch (error) { void error; finish('stream-consumer-failed'); return }
        if (ended) finish('')
      }
      try { request.on('headersReceive', (headers: Object) => {
        const values = headers as Record<string, string>
        const matches = Object.keys(values).filter(key => key.toLowerCase() === 'content-type')
        if (matches.length !== 1 || typeof values[matches[0]] !== 'string' || values[matches[0]].split(';')[0].trim().toLowerCase() !== 'application/x-ndjson') { finish('stream-content-type-invalid'); return }
        const lines = Object.keys(values).filter(key => key.toLowerCase() === 'status-line')
        if (lines.length > 1 || lines.length === 1 && (typeof values[lines[0]] !== 'string' || !/^HTTP\/(?:1\.[01]|2(?:\.0)?) 200(?: [\x20-\x7e]*)?$/.test(values[lines[0]]))) { finish('stream-http-rejected'); return }
        const markers = Object.keys(values).filter(key => key.toLowerCase() === 'x-dsh-mobile-stream')
        if (markers.length > 1 || markers.length === 1 && values[markers[0]] !== 'dsh-mobile-wire/1;status=200') { finish('stream-protocol-invalid'); return }
        // API26 omits Status-Line and completes requestInStream after EOF; the BFF emits this marker only with HTTP 200.
        if (lines.length === 1 || markers.length === 1) status = true
        this.diagnostics.observe(() => 'DSH native HTTP headers admitted: ' + (lines.length === 1 ? 'status-line' : markers.length === 1 ? 'mobile-protocol' : 'pending'))
        headersAccepted = true; drain()
      })
      request.on('dataReceive', (buffer: ArrayBuffer) => {
        if (settled) return
        if (buffer.byteLength < 1) { finish('stream-chunk-invalid'); return }
        total += buffer.byteLength
        if (buffer.byteLength > this.policy.maxChunkBytes || total > this.policy.maxTotalBytes) { finish('stream-too-large'); return }
        queued.push(new Uint8Array(buffer)); drain()
      })
      request.on('dataEnd', () => { ended = true; drain() })
      } catch (error) { void error; finish('stream-register-failed'); return }
      if (NATIVE_ACCEPTANCE_TEST) {
        try {
          const command: CommandClockFields = this.policy.url.endsWith('/follow') ? (JSON.parse(body) as FollowClockFields).command : JSON.parse(body) as CommandClockFields
          if (typeof command.commandId !== 'string' || !isWireId(command.commandId) || typeof command.expiresAt !== 'number' || !isWireNatural(command.expiresAt)) throw new NativeFailure('native-command-diagnostic-invalid')
          diagnosticCommandId = command.commandId
          const timing: CommandSendTiming = { commandId: command.commandId, expiresAt: command.expiresAt, sentAt: Date.now(), clockSource: 'ArkTS Date.now', unit: 'epoch-ms' }
          this.diagnostics.observe(() => 'DSH native command sent: ' + JSON.stringify(timing))
        } catch (error) { this.diagnostics.reject(error instanceof NativeFailure ? error.code : 'native-command-diagnostic-invalid') }
      }
      try {
        request.requestInStream(this.policy.url, { method: http.RequestMethod.POST, extraData: body, header: { 'Content-Type': 'application/json' }, usingCache: false, usingProxy: false, maxRedirects: 0, connectTimeout: this.policy.timeoutMs, readTimeout: this.policy.timeoutMs }).then(code => {
        if (code !== 200) finish('stream-http-rejected')
        else { status = true; drain() }
      }).catch((error: BusinessError) => { finish(this.requestFailure(error.code)) }) }
      catch (error) { finish(this.requestFailure((error as BusinessError).code)) }
    })
    await this.completion
  }
  /** Stop callbacks before waiting for native request disposal; accepted tasks are unaffected. */
  async close(): Promise<void> { this.stop?.(); await this.completion; this.completion = null }
}

/** UTF-8 fixture bytes use the same native split limits without creating any network request. */
export class NativeFixtureBytes {
  private maxBytes: number
  private maxChunk: number
  constructor(maxBytes: number, maxChunk: number) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxChunk) || maxChunk < 1) throw new NativeFailure('stream-config-invalid')
    this.maxBytes = maxBytes; this.maxChunk = maxChunk
  }
  /** @param text - bounded canonical frame supplied by app-owned core. @param chunkBytes - smaller split chosen for offline transport tests. @returns base64 byte chunks, preserving UTF-8 splits. */
  split(text: string, chunkBytes: number): string[] {
    if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > this.maxChunk) throw new NativeFailure('stream-chunk-invalid')
    const bytes = new util.TextEncoder().encodeInto(text)
    if (bytes.byteLength > this.maxBytes) throw new NativeFailure('stream-too-large')
    const chunks: string[] = [], helper = new util.Base64Helper()
    for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) chunks.push(helper.encodeToStringSync(bytes.slice(offset, offset + chunkBytes)))
    return chunks
  }
}
