/** Native JS import compatibility: SDK text codecs and local connection cancellation only. No ambient global mutation, network, key or guest binding. */
import util from '@ohos.util'
/** Protocol UTF-8 encoder preserves an empty byte array where the native API returns undefined. */
export class TextEncoder {
  /** @param {string} [text] Text to encode, empty by default. @returns {Uint8Array} Protocol UTF-8 bytes. */
  encode(text = '') { return text.length === 0 ? new Uint8Array() : new util.TextEncoder('utf-8').encodeInto(text) }
}
export class TextDecoder { constructor(encoding = 'utf-8', options = {}) { this.decoder = util.TextDecoder.create(encoding, options) } decode(bytes) { return this.decoder.decodeToString(bytes) } }
class Signal {
  aborted = false
  listeners = new Map()
  addEventListener(type, callback, options) { if (type === 'abort') this.listeners.set(callback, options?.once === true) }
  removeEventListener(type, callback) { if (type === 'abort') this.listeners.delete(callback) }
  throwIfAborted() { if (this.aborted) throw new Error('native lifetime closed') }
  abort() { if (this.aborted) return; this.aborted = true; let failed = false; for (const [callback, once] of [...this.listeners]) { if (once) this.listeners.delete(callback); try { callback() } catch (error) { void error; failed = true } }; if (failed) throw new Error('native lifetime cleanup failed') }
}
export class AbortController { signal = new Signal(); abort() { this.signal.abort() } }
/** Only shared JSON presentation/journal values use this clone; unsupported platform objects are refused. */
export function structuredClone(value) { if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value; if (Array.isArray(value)) return value.map(structuredClone); if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, structuredClone(entry)])); throw new Error('native JSON clone denied') }
