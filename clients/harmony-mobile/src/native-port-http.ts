/** Finite private-port byte carrier; native policy selects the endpoint and the offline HAP never enables it. */
import type { HttpBytePort, HttpByteResponse } from './network-phone.ts'
import type { NativeIo } from './native-port.ts'
import type { Branded, JsonValue } from './upstream.ts'
import { object, string } from './domain.ts'
import { TransportError } from './wire.ts'

/** Native-issued lease, scoped to the owning MessagePort generation. */
export type NativeHttpHandle = Branded<'mobile-native-http'>
/** Trusted caller limits; URL admission never supplies native activation or an address. */
export interface NativePortHttpPolicy { readonly baseUrl: string; readonly maxChunkBytes: number }

/** Pull one bounded base64 chunk per reply; no unsolicited bytes, fetch shim, retry or guest bridge. */
export class NativePortHttpBytePort implements HttpBytePort {
  private readonly base: URL
  /** @param io - private app port owned by the native document. @param policy - exact caller endpoint and decoded chunk cap. */
  constructor(private readonly io: NativeIo, private readonly policy: NativePortHttpPolicy) {
    this.base = new URL(policy.baseUrl)
    if (this.base.protocol !== 'http:' || this.base.hostname !== '127.0.0.1' || this.base.pathname !== '/' || this.base.username || this.base.password || this.base.search || this.base.hash
      || !Number.isSafeInteger(policy.maxChunkBytes) || policy.maxChunkBytes < 1) throw new TransportError('invalid-config')
  }
  /** @param url - exact admitted command/follow URL, reduced to a selector before crossing the port. @param body - serialized shared-protocol request. @param signal - owner cancellation. @returns bounded bytes; close awaits native disposal. */
  async open(url: URL, body: string, signal: AbortSignal): Promise<HttpByteResponse> {
    if (url.origin !== this.base.origin || url.username || url.password || url.search || url.hash || !['/mobile/command', '/mobile/follow'].includes(url.pathname)) throw new TransportError('scope-denied')
    if (signal.aborted) throw new TransportError('cancelled')
    const opened = object(await this.io.request('http.begin', { endpoint: url.pathname === '/mobile/command' ? 'command' : 'follow', body }))
    if (Object.keys(opened).length !== 1) throw new TransportError('native-http-reply-invalid')
    const handle = string(opened.handle, 128) as NativeHttpHandle
    let closing: Promise<void> | undefined, closed = false
    const close = (): Promise<void> => {
      if (closing) return closing
      closed = true; signal.removeEventListener('abort', aborted)
      closing = this.io.request('http.close', { handle }).then(value => { if (value !== true) throw new TransportError('native-http-close-unconfirmed') })
      return closing
    }
    const aborted = (): void => { void close().catch((error: unknown) => { void error }) } // Awaited close below owns reporting; abort cannot leave an unhandled rejection.
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) { await close(); throw new TransportError('cancelled') }
    const policy = this.policy, io = this.io
    return {
      status: 200, contentType: 'application/x-ndjson', close,
      body: (async function* () {
        try {
          while (!closed) {
            let value: JsonValue
            try { value = await io.request('http.read', { handle }) }
            catch (error) {
              if (error instanceof TransportError && ['stream-timeout', 'native-http-lease-expired'].includes(error.code)) throw new TransportError('timeout', { cause: error })
              throw error
            }
            const row = object(value)
            if (signal.aborted) throw new TransportError('cancelled')
            if (row.kind === 'end' && Object.keys(row).length === 1) return
            if (row.kind !== 'chunk' || Object.keys(row).length !== 2 || typeof row.base64 !== 'string' || row.base64.length > Math.ceil(policy.maxChunkBytes / 3) * 4
              || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.base64)) throw new TransportError('native-http-reply-invalid')
            const decoded = atob(row.base64)
            if (decoded.length < 1 || decoded.length > policy.maxChunkBytes || btoa(decoded) !== row.base64) throw new TransportError('native-http-reply-invalid')
            yield Uint8Array.from(decoded, character => character.charCodeAt(0))
          }
          if (signal.aborted) throw new TransportError('cancelled')
        } finally { await close() }
      })(),
    }
  }
}
