/** Typed JSON facade for ArkTS; all protocol/semantic/task/rich behavior remains in the shared product core. */
import { z } from 'zod'
import { MobileProduct } from './mobile-product.ts'
import type { ProductConnection } from './paired-product-transport.ts'
import type { ProductTrustRecord } from './product-trust.ts'
import type { ProductTrustStorage } from './product-trust.ts'
import type { CleanupScheduler } from '../integration/connection-lifetime.ts'
import { parsePublicTrustDocument, publicTrustRecord, canonicalPublicTrust, publicTrustVerificationInputs } from './public-trust-protocol.ts'
import { fields } from './link-protocol.ts'
import { string } from './domain.ts'
import { parseFirstUseOffer, firstUseOfferBytes } from './first-use-protocol.ts'
import { enrollmentProofBytes } from './pairing-protocol.ts'
import { trustScope, readTrustScopes, addTrustScope } from './trust-scopes.ts'
const positive = z.number().int().positive().max(0x7fffffff), recovery = z.object({ maxAttempts: positive, retryDelayMs: positive }).strict()
const policySchema = z.object({ enabled: z.boolean(), trustMaxBytes: positive, transport: z.object({ maxPending: positive, maxQueuedFrames: positive, maxPacketBytes: positive, timeoutMs: positive, recovery }).strict(), domain: z.object({ maxBytes: positive, maxEvents: positive, maxBlocks: positive, maxText: positive, maxRichBlocks: positive }).strict(), duplicateCap: positive, core: z.object({ ttlMs: positive, maxMounts: positive, maxIntents: positive, follow: z.discriminatedUnion('mode', [z.object({ mode: z.literal('once') }).strict(), z.object({ mode: z.literal('bounded'), maxSegments: positive, maxFailures: positive, retryDelayMs: positive }).strict()]) }).strict(), commandPrefix: z.string().min(1).max(96).regex(/^[A-Za-z0-9_.:-]+$/) }).strict()
/** @param raw - native-owned app settings. @returns strict validated product capacities; no IO or key is created. */
export function parseProductPolicy(raw: string): z.infer<typeof policySchema> { return policySchema.parse(JSON.parse(raw)) }
/** Native-owned byte/storage/network methods; rich HTML cannot supply them. */
export interface NativeProductPorts { readonly storage: ProductTrustStorage; readonly scheduler: CleanupScheduler; readonly clock: () => number; connect(recordJson: string, status: (state: string) => void, received: (packet: string) => void): Promise<ProductConnection>; verifyTrust(recordJson: string, previousJson?: string): Promise<void> }
/** Native page owns the exact capability; callbacks contain only the product view JSON. */
export class NativeProductFacade {
  private readonly product: MobileProduct
  private readonly trustMaxBytes: number
  /** @param raw - explicitly selected public document. @returns deterministic saved scope selector and labels; no IO or activation occurs. */
  scopeInput(raw: string): string { return JSON.stringify(trustScope(raw, this.trustMaxBytes)) }
  /** @param raw - original app-private catalogue, absent before first save. @returns validated descriptors only, with no active grant claim. */
  scopeCatalog(raw: string | null): string { return JSON.stringify(readTrustScopes(raw, this.trustMaxBytes)) }
  /** @param raw - original catalogue. @param document - explicitly confirmed public generation. @returns bounded catalogue preserving prior scopes. */
  scopeAdd(raw: string | null, document: string): string { return addTrustScope(raw, document, this.trustMaxBytes) }
  /** @param authority - trusted native page owner. @param policyJson - immutable local app configuration. @param ports - native-owned IO. @param publish - trusted UI sink. */
  constructor(authority: object, policyJson: string, ports: NativeProductPorts, publish: (viewJson: string) => void) { const policy = parseProductPolicy(policyJson); this.trustMaxBytes = policy.trustMaxBytes; this.product = new MobileProduct(authority, policy, { ...ports, connect: (record: ProductTrustRecord, status, received) => ports.connect(JSON.stringify(record), status, received), verifyTrust: (_record, document, previous) => ports.verifyTrust(canonicalPublicTrust(document), previous === undefined ? undefined : canonicalPublicTrust(previous)) }, view => publish(JSON.stringify({ pairing: view.pairing, connection: view.connection, error: view.error, projects: view.projects, sessions: view.sessions, selected: view.selected, task: view.transcript?.task ?? 'idle', readOnly: view.transcript?.readOnly ?? true, messages: view.transcript?.messages.map(message => ({ id: message.id, role: message.role, text: message.parts.flatMap(part => part.kind === 'text' || part.kind === 'reasoning' ? [part.text] : []).join('\n') })) ?? [], liveText: view.transcript?.liveText ?? '', richJson: view.rich === null ? '' : JSON.stringify(view.rich) }))) }
  /** @param raw - locally selected public offer. @returns formatted public fingerprint/scope fields only; no IO, signing, storage or authorization occurs. */
  preview(raw: string): string { if (new TextEncoder().encode(raw).length > this.trustMaxBytes) throw new Error('public offer capacity'); const document = parsePublicTrustDocument(raw, this.trustMaxBytes), record = publicTrustRecord(document); return JSON.stringify({ renewal: document.schema === 'harmony-product-public-trust/2', expiresAt: Math.min(record.paired.expiresAt, record.paired.grant.expiresAt), grantEpoch: record.paired.grant.epoch, pairId: record.paired.pairId, desktopFingerprint: record.paired.desktopCredentialId, phoneFingerprint: record.paired.credentialId, desktopId: record.paired.grant.desktopId, profileId: record.paired.grant.profileId, sessions: record.paired.grant.sessions, operations: record.paired.grant.operations, audience: record.paired.audience, identityAlias: record.identityAlias }) }
  /** @param raw - selected public generation. @returns canonical current carrier fields for native key verification only. */
  trustInput(raw: string): string { return JSON.stringify(publicTrustRecord(parsePublicTrustDocument(raw, this.trustMaxBytes))) }
  /** @param raw - strict selected public document. @param previous - complete saved anchor for replacement; absent for saved-document verification. @returns every shared signature/digest input as bounded native JSON; legacy input has no receipts. */
  renewalInput(raw: string, previous?: string): string { return JSON.stringify(publicTrustVerificationInputs(parsePublicTrustDocument(raw, this.trustMaxBytes), previous === undefined ? undefined : parsePublicTrustDocument(previous, this.trustMaxBytes))) }
  /** @param raw - locally pasted desktop-signed first-use offer. @param now - native clock. @returns canonical validation/signing input for native crypto only; no Web guest receives this method. */
  firstUseInput(raw: string, now: number): string { const report = (stage: string): void => { console.info('DSH_ENROLLMENT_STAGE=' + stage) }; report('shared-input-entered'); const offer = parseFirstUseOffer(raw, this.trustMaxBytes, now, report); report('shared-desktop-bytes'); const desktopBytes = Array.from(firstUseOfferBytes(offer)); report('shared-phone-bytes'); const phoneBytes = Array.from(enrollmentProofBytes(offer.ticket)); report('shared-serialize-input'); const result = JSON.stringify({ identityAlias: offer.identityAlias, desktopPublicSpki: offer.desktopPublicSpki, phonePublicSpki: offer.ticket.publicSpki, signature: offer.signature, desktopBytes, phoneBytes, ticket: offer.ticket, sessions: offer.sessions, operations: offer.operations, audience: offer.audience, expiresAt: offer.ticket.expiresAt, grantTtlMs: offer.grantTtlMs }); report('shared-input-complete'); return result }
  /** @returns current local pairing state for the native decision page. */
  pairingState(): string { return this.product.view.pairing }
  /** @returns after the local public record is admitted, without automatic connect. */
  boot(): Promise<void> { return this.product.boot() }
  /** @param authority - native comparison decision. @param raw - selected public record. @param compared - explicit fingerprint decision. @returns after public record acknowledgment. */
  pair(authority: object, raw: string, compared: boolean): Promise<void> { return this.product.pair(authority, raw, compared) }
  /** @param authority - explicit native comparison. @param raw - selected public record. @param compared - comparison decision. @returns after initial confirmation, exact saved resume or explicit signed expiry continuation; no implicit replacement occurs. */
  pairOrResume(authority: object, raw: string, compared: boolean): Promise<void> { return this.product.pairOrResume(authority, raw, compared) }
  /** @param authority - explicit native connect decision. @returns after the finite connection owner starts. */
  connect(authority: object): Promise<void> { return this.product.connect(authority) }
  /** @param authority - native row selection. @param session - admitted Session. @returns after previous selection teardown. */
  select(authority: object, session: string): Promise<void> { return this.product.select(authority, session) }
  /** @param authority - native composer intent. @param request - original id. @param text - user text. @returns canonical receipt JSON or visible uncertainty. */
  async submit(authority: object, request: string, text: string): Promise<string> { return JSON.stringify(await this.product.submit(authority, request, text)) }
  /** @param authority - native reconciliation decision. @param request - original intent id. @returns read-only receipt JSON. */
  async receipt(authority: object, request: string): Promise<string> { return JSON.stringify(await this.product.receipt(authority, request)) }
  /** @param authority - explicit native cancel. @returns after cancellation acknowledgment. */
  cancel(authority: object): Promise<void> { return this.product.cancel(authority) }
  /** @param packet - native-bound rich request. @returns scoped response JSON. */
  richRequest(packet: string): Promise<string> { return this.product.richRequest(packet) }
  /** @param raw - rejected renderer request. @returns content-free correlated refusal; invalid envelopes cannot obtain a reply or invoke any service. */
  richRefusal(raw: string): string { const packet = fields(JSON.parse(raw), ['kind', 'id', 'operation', 'payload']); if (packet.kind !== 'rich.request') throw new Error('invalid rich envelope'); return JSON.stringify({ kind: 'rich.reply', id: string(packet.id, 128), error: true }) }
  /** @param authority - native revoke decision. @returns after denial and public tombstone. */
  revoke(authority: object): Promise<void> { return this.product.revoke(authority) }
  /** @returns after owned IO/follow/rich work retires. */
  close(): Promise<void> { return this.product.close() }
}
