/** Local public trust storage. Neither remote relay JSON nor this parser can create desktop authority or private keys. */
import { parsePublicTrustDocument, publicTrustRecord, canonicalPublicTrust, assertPublicTrustSuccessor, type PublicTrustDocument, type ProductTrustRecord } from './public-trust-protocol.ts'
export { productTrustSchema, type ProductTrustRecord } from './public-trust-protocol.ts'
/** Explicit native storage port; implementation owns bounded reads and atomic writes. */
export interface ProductTrustStorage { read(maxBytes: number): Promise<string | null>; write(raw: string): Promise<void>; close(): Promise<void> }
/** Known expiry preserves its document for explicit signed successor review; unreadable or unknown writes remain blocked. */
export class PublicTrustExpiredError extends Error { constructor() { super('public trust expired; automatic activation blocked'); this.name = 'PublicTrustExpiredError' } }
/** Denies unknown writes immediately and on the next load; no silent repair or memory fallback. */
export class ProductTrustOwner {
  private current: ProductTrustRecord | null = null
  private document: PublicTrustDocument | null = null
  private blocked = false
  private closed = false
  private version = 0
  private candidate: ProductTrustRecord | null = null
  private pendingDocument: PublicTrustDocument | null = null
  private tail = Promise.resolve()
  /** @param authority - trusted native decision capability. @param storage - app-private public-only IO. @param maxBytes - explicit file cap. @param clock - native expiry clock. */
  constructor(private readonly authority: object, private readonly storage: ProductTrustStorage, private readonly maxBytes: number, private readonly clock: () => number) { if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('invalid trust capacity') }
  private parse(raw: string): PublicTrustDocument { const value = parsePublicTrustDocument(raw, this.maxBytes), record = publicTrustRecord(value); if (record.paired.credentialId !== record.paired.grant.credentialId) throw new Error('public trust credential denied'); return value }
  private fresh(record: ProductTrustRecord): void { if (Math.min(record.paired.expiresAt, record.paired.grant.expiresAt) <= this.clock()) throw new PublicTrustExpiredError() }
  /** @returns the retained public generation for verification; no IO or authority change occurs. */
  savedDocument(): PublicTrustDocument | null { return this.document === null ? null : this.parse(canonicalPublicTrust(this.document)) }
  /** @returns a detached local record or absent state; malformed/expired IO is visible and cannot activate transport. */
  async load(): Promise<ProductTrustRecord | null> { if (this.blocked || this.closed) throw new Error('public trust blocked'); const version = ++this.version; try { const raw = await this.storage.read(this.maxBytes); if (version !== this.version || this.closed) throw new Error('public trust load retired'); this.document = raw === null ? null : this.parse(raw); this.current = this.document === null ? null : publicTrustRecord(this.document); if (this.current !== null && !this.current.revoked) this.fresh(this.current); return this.current } catch (error) { if (error instanceof PublicTrustExpiredError) throw error; this.blocked = true; throw new Error('public trust blocked') } }
  /** @param authority - native decision identity. @param raw - locally selected public offer. @param compared - explicit native fingerprint comparison decision. @returns confirmed record only after its atomic storage acknowledgment; this does not enroll on desktop. */
  async confirm(authority: object, raw: string, compared: boolean): Promise<ProductTrustRecord> {
    if (authority !== this.authority || !compared || this.blocked || this.closed || this.current !== null || this.candidate !== null) throw new Error('public trust confirmation denied'); const document = this.parse(raw), record = publicTrustRecord(document); this.fresh(record); if (record.revoked || document.schema !== 'harmony-product-public-trust/1') throw new Error('public trust initial confirmation denied'); return this.commit(document)
  }
  /** @param authority - explicit native successor decision. @param raw - signature and predecessor digest already verified by the owning native port. @param compared - renewed local fingerprint/scope decision. @returns after atomic signed generation storage; corrupt/unknown state and local revocation never permit replacement. */
  async confirmSuccessor(authority: object, raw: string, compared: boolean): Promise<ProductTrustRecord> { if (authority !== this.authority || !compared || this.blocked || this.closed || this.document === null || this.candidate !== null) throw new Error('public trust successor denied'); const next = this.parse(raw); if (next.schema !== 'harmony-product-public-trust/2') throw new Error('public trust successor signature required'); assertPublicTrustSuccessor(this.document, next, this.clock()); return this.commit(next) }
  private commit(document: PublicTrustDocument): Promise<ProductTrustRecord> { const record = publicTrustRecord(document); this.candidate = record; this.pendingDocument = document; const version = ++this.version; const result = this.tail.then(async () => { if (this.blocked || this.closed || version !== this.version) throw new Error('public trust confirmation retired'); try { await this.storage.write(canonicalPublicTrust(document)) } catch (error) { void error; this.blocked = true; throw new Error('public trust write unknown') }; if (version !== this.version || this.closed) throw new Error('public trust confirmation retired'); this.document = document; this.current = record; this.candidate = null; this.pendingDocument = null; return record }); this.tail = result.then(() => {}, () => {}); return result }
  /** @param authority - explicit native revoke decision. @returns after the public tombstone is stored; local denial is immediate and remains sticky after a failed write. */
  async revoke(authority: object): Promise<void> { const selected = this.candidate ?? this.current; if (authority !== this.authority || selected === null || this.closed || this.blocked) throw new Error('public trust revoke denied'); this.version++; this.current = { ...selected, revoked: true }; this.candidate = null; this.document = this.pendingDocument ?? this.document; this.document = this.document === null ? this.current : { ...this.document, revoked: true }; this.pendingDocument = null; const document = this.document; const result = this.tail.then(async () => { try { await this.storage.write(canonicalPublicTrust(document)) } catch (error) { void error; this.blocked = true; throw new Error('public trust revoke unknown') } }); this.tail = result.then(() => {}, () => {}); await result }
  /** @returns after any pending public write and the dedicated storage owner closes; failed writes keep its refusal lock. */
  async close(): Promise<void> { this.closed = true; this.version++; await this.tail; await this.storage.close() }
}
