/** Held native public file adapter with one read and serialized CAS; unknown writes remain blocked. */
import type { DeviceBindingStorage } from '../desktop-plugin/src/device-binding.ts'
import type { ProductTrustStorage } from './product-trust.ts'
export class ProductRouteStorage implements DeviceBindingStorage {
  private loaded = false
  private raw: string | null = null
  private reading: Promise<string | null> | undefined
  private tail: Promise<void> = Promise.resolve()
  private failed = false
  private closed = false
  constructor(private readonly storage: ProductTrustStorage, private readonly maxBytes: number) {}
  read(): Promise<string | null> { if (this.closed || this.failed) return Promise.reject(new Error('native route storage blocked')); if (this.loaded) return Promise.resolve(this.raw); this.reading ??= this.storage.read(this.maxBytes).then(raw => { this.raw = raw; this.loaded = true; return raw }, error => { this.failed = true; throw error }); return this.reading }
  compareAndSet(previous: string | null, next: string): Promise<void> {
    const operation = this.tail.then(async () => { if (this.closed || this.failed || new TextEncoder().encode(next).length > this.maxBytes || await this.read() !== previous) throw new Error('native route CAS denied'); try { await this.storage.write(next); this.raw = next } catch (error) { this.failed = true; throw error } })
    this.tail = operation.then(() => {}, () => {}); return operation
  }
  /** Prior IO failure remains the read/write result; only actual resource release may fail close. */
  async close(): Promise<void> { this.closed = true; await Promise.allSettled([this.tail, this.reading]); await this.storage.close() }
}
