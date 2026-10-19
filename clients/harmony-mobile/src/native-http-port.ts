/** Native HTTP byte provider. The owner supplies SDK calls; no browser fetch, URL, cookie or credential shim is created. */
import type { HttpBytePort, HttpByteResponse } from './network-phone.ts'
import { TransportError } from './wire.ts'

/** Callback fields match the compiled ArkTS byte sink. */
export interface NativeHttpByteSink {
  /** @param bytes - header/status-admitted native bytes. */
  chunk(bytes: Uint8Array): void
  /** Report clean EOF after SDK destruction. */
  end(): void
  /** @param code - sanitized native failure after SDK destruction. */
  failed(code: string): void
}
/** One SDK request owns callbacks and an awaited destruction result. */
export interface NativeHttpCall {
  /** @param body - owner-encoded command or follow envelope. @param sink - finite byte consumer. @returns after request destruction. */
  open(body: string, sink: NativeHttpByteSink): Promise<void>
  /** @returns after callbacks cease and SDK request is destroyed. */
  close(): Promise<void>
}
/** Only a trusted owner can construct fixed-endpoint SDK requests. */
export interface NativeHttpByteConfig {
  readonly maxQueuedBytes: number
  readonly maxChunks: number
  readonly create: (url: string) => NativeHttpCall
}
/** Callback-to-iterator carrier preserves byte limits and owns every request disposal; it does not retry. */
export class NativeHttpBytePort implements HttpBytePort {
  /** @param config - app-owned bounded queue and exact-endpoint native factory. */
  constructor(private readonly config: NativeHttpByteConfig) {
    for (const value of [config.maxQueuedBytes, config.maxChunks]) if (!Number.isSafeInteger(value) || value < 1) throw new TransportError('invalid-config')
  }
  /** @param url - already admitted loopback BFF endpoint. @param body - bounded encoded request. @param signal - transport lifetime. @returns native status-admitted bytes; domain parsing remains shared. */
  async open(url: URL, body: string, signal: AbortSignal): Promise<HttpByteResponse> {
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash || !['/mobile/command', '/mobile/follow'].includes(url.pathname)) throw new TransportError('scope-denied')
    if (signal.aborted) throw new TransportError('cancelled')
    const call = this.config.create(url.href), queue: Uint8Array[] = []
    let bytes = 0, done = false, failure: Error | undefined, wake: (() => void) | undefined
    let closing: Promise<void> | undefined
    const close = (): Promise<void> => {
      if (closing) return closing
      done = true; queue.length = 0; bytes = 0; wake?.()
      closing = call.close()
      return closing
    }
    const fail = (code: string): void => { failure ??= new TransportError(code); done = true; wake?.() }
    const sink: NativeHttpByteSink = {
      chunk: value => {
        if (done) return
        if (value.byteLength < 1 || bytes + value.byteLength > this.config.maxQueuedBytes || queue.length >= this.config.maxChunks) {
          fail('native-byte-queue-full'); void close().catch(() => fail('native-byte-cleanup-failed')); return
        }
        queue.push(value.slice()); bytes += value.byteLength; wake?.()
      },
      end: () => { done = true; wake?.() },
      failed: fail,
    }
    const task = call.open(body, sink).catch((error: unknown) => { fail(error instanceof TransportError ? error.code : 'native-byte-failed') })
    const aborted = () => { fail('cancelled'); void close().catch(() => fail('native-byte-cleanup-failed')) }
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
    const finish = async (): Promise<void> => {
      signal.removeEventListener('abort', aborted)
      await close(); await task
    }
    return {
      status: 200, contentType: 'application/x-ndjson',
      body: (async function* () {
        try {
          while (true) {
            if (failure) throw failure
            if (signal.aborted) throw new TransportError('cancelled')
            const next = queue.shift()
            if (next) { bytes -= next.byteLength; yield next; continue }
            if (done) return
            await new Promise<void>(accept => { wake = accept })
          }
        } finally { await finish() }
      })(),
      close: finish,
    }
  }
}
