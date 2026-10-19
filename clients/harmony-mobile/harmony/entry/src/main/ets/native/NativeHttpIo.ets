/** Native-owned finite HTTP leases; default policy is disabled and no guest receives these methods. */
import { util } from '@kit.ArkTS'
import { NativeHttpStream, NativeStreamPolicy, NativeByteSink } from './NativeByteStream'
import { NativeFailure } from './NativeFailure'

/** Endpoint and limits come only from verified HAP resources. */
export class NativeHttpIoPolicy {
  enabled: boolean; baseUrl: string; maxChunkBytes: number; maxTotalBytes: number; maxQueuedBytes: number; maxChunks: number; maxStreams: number; timeoutMs: number
  constructor(enabled: boolean, baseUrl: string, maxChunkBytes: number, maxTotalBytes: number, maxQueuedBytes: number, maxChunks: number, maxStreams: number, timeoutMs: number) {
    this.enabled = enabled; this.baseUrl = baseUrl; this.maxChunkBytes = maxChunkBytes; this.maxTotalBytes = maxTotalBytes; this.maxQueuedBytes = maxQueuedBytes; this.maxChunks = maxChunks; this.maxStreams = maxStreams; this.timeoutMs = timeoutMs
  }
}
/** Exactly one chunk or EOF; failures use the existing sanitized IO failure envelope. */
export class NativeHttpRead {
  kind: string; base64?: string
  constructor(kind: string, base64: string = '') { this.kind = kind; if (kind === 'chunk') this.base64 = base64 }
}
/** One SDK request retains a bounded queue until pull, close or absolute deadline. */
class NativeHttpLease implements NativeByteSink {
  private queue: Uint8Array[] = []
  private bytes: number = 0
  private ended: boolean = false
  private failure: string = ''
  private cleanupFailed: boolean = false
  private reading: boolean = false
  private wake: (() => void) | null = null
  private task: Promise<void>
  private closing: Promise<void> | null = null
  private timer: number
  private stream: NativeHttpStream
  private policy: NativeHttpIoPolicy
  constructor(stream: NativeHttpStream, body: string, policy: NativeHttpIoPolicy) {
    this.stream = stream; this.policy = policy
    this.timer = setTimeout(() => { this.failed('native-http-lease-expired'); void this.close().catch((error: Error) => { void error }) }, policy.timeoutMs) // Read/owner disposal reports cleanup failure; deadline callbacks cannot reject globally.
    this.task = stream.open(body, this).catch((error: Error) => { this.failed(error instanceof NativeFailure ? error.code : 'native-http-open-failed') })
  }
  chunk(bytes: Uint8Array): void {
    if (this.ended) return
    if (this.bytes + bytes.byteLength > this.policy.maxQueuedBytes || this.queue.length >= this.policy.maxChunks) {
      this.failed('native-http-queue-full'); void this.close().catch((error: Error) => { void error }); return // Read/owner disposal retains cleanup failures.
    }
    this.queue.push(bytes.slice()); this.bytes += bytes.byteLength; this.wake?.()
  }
  end(): void { this.ended = true; this.wake?.() }
  failed(code: string): void { if (code === 'stream-cleanup-failed') this.cleanupFailed = true; if (this.failure.length === 0) this.failure = code; this.ended = true; this.queue.length = 0; this.bytes = 0; this.wake?.() }
  async read(): Promise<NativeHttpRead> {
    if (this.reading) throw new NativeFailure('native-http-read-busy')
    this.reading = true
    try {
      while (this.queue.length === 0 && !this.ended) await new Promise<void>(accept => { this.wake = accept })
      if (this.cleanupFailed) throw new NativeFailure('stream-cleanup-failed')
      if (this.failure.length > 0) throw new NativeFailure(this.failure)
      const next = this.queue.shift()
      if (next === undefined) return new NativeHttpRead('end')
      this.bytes -= next.byteLength
      return new NativeHttpRead('chunk', new util.Base64Helper().encodeToStringSync(next))
    } finally { this.reading = false; this.wake = null }
  }
  close(): Promise<void> {
    if (this.closing !== null) return this.closing
    clearTimeout(this.timer); this.failed('native-http-closed')
    this.closing = this.dispose(); return this.closing
  }
  private async dispose(): Promise<void> { await this.stream.close(); await this.task; if (this.cleanupFailed) throw new NativeFailure('stream-cleanup-failed') }
}
/** Application generation owns all handles; closed/foreign handles never select another SDK request. */
export class NativeHttpIo {
  private leases: Map<string, NativeHttpLease> = new Map()
  private retired: boolean = false
  private policy: NativeHttpIoPolicy
  constructor(policy: NativeHttpIoPolicy) {
    this.policy = policy
    for (const bound of [policy.maxChunkBytes, policy.maxTotalBytes, policy.maxQueuedBytes, policy.maxChunks, policy.maxStreams, policy.timeoutMs]) if (!Number.isSafeInteger(bound) || bound < 1) throw new NativeFailure('native-http-config-invalid')
    if (policy.enabled) {
      const match = /^http:\/\/127\.0\.0\.1:([0-9]+)\/$/.exec(policy.baseUrl)
      if (match === null || Number(match[1]) < 1 || Number(match[1]) > 65535) throw new NativeFailure('native-http-scope-denied')
    } else if (policy.baseUrl !== '') throw new NativeFailure('native-http-config-invalid')
  }
  /** @param endpoint - finite command/follow selector, never a URL. @param body - bounded protocol JSON. @returns a native-issued generation lease. */
  begin(endpoint: string, body: string): string {
    if (this.retired) throw new NativeFailure('native-http-retired')
    if (!this.policy.enabled) throw new NativeFailure('stream-disabled')
    if (!['command', 'follow'].includes(endpoint)) throw new NativeFailure('native-http-endpoint-denied')
    if (new util.TextEncoder().encodeInto(body).byteLength > this.policy.maxChunkBytes) throw new NativeFailure('native-http-body-too-large')
    if (this.leases.size >= this.policy.maxStreams) throw new NativeFailure('native-http-busy')
    const handle = util.generateRandomUUID(false), url = this.policy.baseUrl + 'mobile/' + endpoint
    const stream = new NativeHttpStream(new NativeStreamPolicy(true, url, this.policy.maxChunkBytes, this.policy.maxTotalBytes, this.policy.timeoutMs))
    this.leases.set(handle, new NativeHttpLease(stream, body, this.policy)); return handle
  }
  /** @param handle - native-issued lease. @returns one bounded chunk or EOF; only one read may wait per lease. */
  async read(handle: string): Promise<NativeHttpRead> {
    const lease = this.leases.get(handle)
    if (lease === undefined || this.retired) throw new NativeFailure('native-http-handle-denied')
    return lease.read()
  }
  /** @param handle - this generation's lease. @returns true after SDK disposal; unknown or already released handles reject. */
  async closeHandle(handle: string): Promise<boolean> {
    const lease = this.leases.get(handle)
    if (lease === undefined) throw new NativeFailure('native-http-handle-denied')
    await lease.close(); this.leases.delete(handle); return true
  }
  /** Revoke new work, wake pending reads and await every SDK disposal before retiring the port generation. */
  async close(): Promise<void> {
    this.retired = true
    const results = await Promise.allSettled(Array.from(this.leases.values()).map(lease => lease.close())); this.leases.clear()
    if (results.some(result => result.status === 'rejected')) throw new NativeFailure('native-http-cleanup-failed')
  }
}
