/** Desktop-local first use: existing signer, original authorization owner and paired provider; no Remote enrollment or automatic activation. */
import type { Context } from '@deepseek-ai/cordis'
import type { AuthorizationInteraction } from '@deepseek-ai/dsh-authorization'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { z } from 'zod'
import { DeviceAuthorizationOwner, type DeviceAuthLimits } from '../../integration/device-auth.ts'
import { P256EnrollmentVerifier } from '../../integration/p256-enrollment.ts'
import { p256CredentialId } from '../../integration/p256-public.ts'
import { openDesktopWssPorts, validateDesktopWssPolicy, type DesktopWssPolicy } from '../../integration/desktop-wss.ts'
import { firstUseOfferBytes, firstUseOfferSchema, firstUseReplySchema, type FirstUseOffer } from '../../src/first-use-protocol.ts'
import { productTrustSchema, type ProductTrustRecord } from '../../src/product-trust.ts'
import { parsePublicTrustDocument, publicTrustRecord, successorHistory, canonicalPublicTrust, publicTrustRenewalSchema, publicTrustRenewalBytes, type PublicTrustDocument } from '../../src/public-trust-protocol.ts'
import { verifyPublicTrustHistory } from '../../integration/public-trust-verification.ts'
import { deviceGrantOperations } from '../../src/pairing-protocol.ts'
import { validatePairedRelayPolicy, type PairedRelayPolicy, type PairedRelayPorts } from '../../src/paired-relay.ts'
import type { P256IdentitySigner } from '../../src/e2e-channel.ts'
import type { EndpointRelayTrust } from '../../src/relay-control-client.ts'
import { id, type DesktopId, type SessionId } from '../../src/protocol.ts'
import type { MobileProfileId } from '../../src/profile-capabilities.ts'
import type { Options } from './index.ts'
import type {} from '@deepseek-ai/dsh-app-boot'
import type { DeviceId } from '../../src/link-protocol.ts'
import { installDesktopPairingProvider } from './paired-provider.ts'
/** Local deployment configuration selects exactly one existing Session in the selected profile, and one phone. */
export interface DesktopFirstUsePolicy { readonly desktopId: DesktopId; readonly profileId: MobileProfileId; readonly sessionId: SessionId; readonly deviceId: DeviceId; readonly pairId: string; readonly audience: string; readonly grantTtlMs: number; readonly publicTrustMaxBytes: number; readonly enrollmentTtlMs: number; readonly maxIssues: number; readonly auth: DeviceAuthLimits; readonly relay: PairedRelayPolicy; readonly wss: DesktopWssPolicy; readonly sweepIntervalMs: number; readonly recovery: { readonly maxAttempts: number; readonly retryDelayMs: number } }
/** Concrete default is approved WSS. Synthetic tests supply the existing paired-port seam without changing production host/TLS checks. */
export type DesktopFirstUsePorts = (trust: EndpointRelayTrust, signer: P256IdentitySigner, phonePublicSpki: string) => PairedRelayPorts
const phoneIdentitySchema = z.object({ identityAlias: z.string().regex(/^[a-z][a-z0-9-]{0,126}$/), publicSpki: z.string().regex(/^[A-Za-z0-9_-]{1,342}$/), credentialId: z.string().regex(/^p256-sha256-[a-f0-9]{64}$/) }).strict()
/** Owns pending public proof and the exact existing grant owner; cold starts always need another local enrollment confirmation. */
export class DesktopFirstUse {
  readonly owner: DeviceAuthorizationOwner
  private readonly verifier: P256EnrollmentVerifier
  private offer: FirstUseOffer | undefined
  private approved: ProductTrustRecord | undefined
  private installed = false
  private closed = false
  private renewal: { previous: PublicTrustDocument; revokedEpoch: number } | undefined
  /** @param ctx - actual selected profile with credentials/authorization. @param authority - exact local UI capability. @param policy - explicit bounded deployment policy. @param signer - existing local identity. @param clock - local lifecycle clock. @param openPorts - existing transport seam; defaults to concrete verified WSS. */
  constructor(private readonly ctx: Context, private readonly authority: object, private readonly policy: DesktopFirstUsePolicy, private readonly signer: P256IdentitySigner, private readonly clock: () => number = Date.now, private readonly openPorts: DesktopFirstUsePorts = (trust, key, phone) => openDesktopWssPorts(policy.wss, trust, key, phone)) {
    if (![policy.grantTtlMs, policy.enrollmentTtlMs, policy.maxIssues, policy.sweepIntervalMs, policy.recovery.maxAttempts, policy.recovery.retryDelayMs].every(value => Number.isSafeInteger(value) && value > 0) || policy.grantTtlMs > 1800000 || policy.auth.maxGrantTtlMs > 1800000 || policy.auth.maxSessions !== 1 || policy.auth.maxDevices !== 1 || policy.grantTtlMs > policy.auth.maxGrantTtlMs || policy.audience !== policy.wss.host) throw new Error('first-use policy denied')
    this.selection()
    validateDesktopWssPolicy(policy.wss); validatePairedRelayPolicy(policy.relay); const desktopCredentialId = p256CredentialId(signer.publicSpki), profileId = policy.profileId
    this.verifier = new P256EnrollmentVerifier({ desktopId: policy.desktopId, profileId, localAuthority: authority, clock, challengeTtlMs: policy.enrollmentTtlMs, pinTtlMs: policy.grantTtlMs, maxIssues: policy.maxIssues, maxProofBytes: policy.auth.maxProofBytes, identities: { challenge: () => id<'harmony-enrollment-challenge'>(randomUUID()), nonce: () => randomBytes(32) } })
    this.owner = new DeviceAuthorizationOwner(ctx, { desktopId: policy.desktopId, profileId, desktopCredentialId, localAuthority: authority, clock, verifier: this.verifier, limits: policy.auth, identities: { challenge: () => id<'harmony-device-challenge'>(randomUUID()) }, copy: { label: 'Harmony phone', method: 'Local fingerprint comparison', allow: 'Allow this selected Session scope', deny: 'Deny', confirm: details => JSON.stringify(details) } })
  }
  private selection(): void { const profile = this.ctx.get('profileContext'); if (profile !== undefined && profile.name !== this.policy.profileId) throw new Error('first-use selected profile or Session denied') }
  private async selectedSession(): Promise<void> { this.selection(); await this.ctx.sessionController.inspect(this.policy.sessionId) }
  private local(authority: object): void { if (authority !== this.authority || this.closed) throw new Error('first-use local decision denied') }
  /** @param authority - exact desktop-local UI. @param publicIdentity - explicitly imported phone public identity only. @returns signed short-lived proof request; creates no grant, trust file or connection. */
  async issue(authority: object, publicIdentity: unknown): Promise<FirstUseOffer> {
    this.local(authority); await this.selectedSession(); if (this.approved !== undefined || this.offer !== undefined) throw new Error('first-use already pending'); const phone = phoneIdentitySchema.parse(publicIdentity); if (p256CredentialId(phone.publicSpki) !== phone.credentialId) throw new Error('phone public fingerprint denied')
    if (this.renewal === undefined && await this.owner.storedGrant(authority, this.policy.deviceId) !== undefined) throw new Error('existing grant history requires explicit renewal')
    if (this.renewal !== undefined) { const old = publicTrustRecord(this.renewal.previous); if (phone.identityAlias !== old.identityAlias || phone.credentialId !== old.paired.credentialId) throw new Error('renewal phone identity denied') }
    const unsigned = { schema: 'harmony-first-use/1' as const, identityAlias: phone.identityAlias, desktopPublicSpki: this.signer.publicSpki, audience: this.policy.audience, pairId: this.policy.pairId, ticket: this.verifier.issue(authority, this.policy.deviceId, phone.publicSpki), sessions: [this.policy.sessionId] as [SessionId], operations: [...deviceGrantOperations], grantTtlMs: this.policy.grantTtlMs }
    const signature = Buffer.from(await this.signer.sign(firstUseOfferBytes(unsigned))).toString('base64url'); this.local(authority); this.offer = firstUseOfferSchema.parse({ ...unsigned, signature }); return structuredClone(this.offer)
  }
  /** @param authority - explicit local successor owner. @param identity - original phone public identity. @param raw - complete previous public document selected locally, including a desktop-retained export after missed phone delivery. @returns a fresh challenge only after expired signed history and the durable desktop tombstone match; no grant or network is created. */
  async issueRenewal(authority: object, identity: unknown, raw: string): Promise<FirstUseOffer> {
    this.local(authority); if (this.offer !== undefined || this.approved !== undefined || this.renewal !== undefined) throw new Error('renewal already pending'); const previous = parsePublicTrustDocument(raw, this.policy.publicTrustMaxBytes), old = publicTrustRecord(previous), phone = phoneIdentitySchema.parse(identity); if (p256CredentialId(phone.publicSpki) !== phone.credentialId) throw new Error('phone public fingerprint denied'); const stored = await this.owner.storedGrant(authority, this.policy.deviceId)
    if (stored === undefined || !stored.revoked || stored.epoch <= old.paired.grant.epoch || old.revoked || Math.min(old.paired.expiresAt, old.paired.grant.expiresAt) > this.clock() || old.desktopPublicSpki !== this.signer.publicSpki || old.identityAlias !== phone.identityAlias || old.paired.credentialId !== phone.credentialId || old.paired.audience !== this.policy.audience || old.paired.pairId === this.policy.pairId || stored.deviceId !== this.policy.deviceId || stored.credentialId !== phone.credentialId || stored.desktopId !== old.paired.grant.desktopId || stored.profileId !== old.paired.grant.profileId || stored.deviceId !== old.paired.grant.deviceId || old.paired.desktopCredentialId !== p256CredentialId(this.signer.publicSpki) || stored.expiresAt !== old.paired.grant.expiresAt || JSON.stringify(stored.sessions) !== JSON.stringify(old.paired.grant.sessions) || JSON.stringify(stored.operations) !== JSON.stringify(old.paired.grant.operations)) throw new Error('renewal predecessor or revocation denied')
    if (stored.profileId !== this.policy.profileId || JSON.stringify(stored.sessions) !== JSON.stringify([this.policy.sessionId]) || JSON.stringify(stored.operations) !== JSON.stringify(deviceGrantOperations)) throw new Error('renewal fixed scope denied')
    await verifyPublicTrustHistory(previous)
    const expiry = this.clock() + this.policy.grantTtlMs, predicted = { schema: 'harmony-product-public-trust/2', revoked: false, record: { ...old, paired: { ...old.paired, pairId: this.policy.pairId, expiresAt: expiry, grant: { ...old.paired.grant, epoch: stored.epoch + 1, expiresAt: expiry } } }, history: successorHistory(previous), previousDigest: '0'.repeat(64), revokedEpoch: stored.epoch, signature: 'A'.repeat(192) }; parsePublicTrustDocument(JSON.stringify(predicted), this.policy.publicTrustMaxBytes); this.renewal = { previous, revokedEpoch: stored.epoch }; try { return await this.issue(authority, phone) } catch (error) { this.renewal = undefined; throw error }
  }
  /** @param authority - exact local owner. @param response - native signed response copied back, never a public RPC. @param interaction - existing explicit desktop authorization prompts. @returns phone public record and relay public pair only after original grant commit. */
  async confirm(authority: object, response: unknown, interaction: AuthorizationInteraction): Promise<{ phone: ProductTrustRecord; publicDocument: PublicTrustDocument; relayPair: { pairId: string; desktopPublicSpki: string; phonePublicSpki: string; epoch: number; expiresAt: number; revoked: false } }> {
    this.local(authority); await this.selectedSession(); const reply = firstUseReplySchema.parse(response), offer = this.offer; if (offer === undefined || this.approved !== undefined || JSON.stringify(reply.offer) !== JSON.stringify(offer) || JSON.stringify(reply.proof.challenge) !== JSON.stringify(offer.ticket)) throw new Error('first-use response denied')
    this.offer = undefined; let committed = false
    try {
    const flow = this.owner.offerPairing(authority, { deviceId: this.policy.deviceId, credentialId: offer.ticket.credentialId, proof: JSON.stringify(reply.proof), sessions: offer.sessions, operations: offer.operations, grantTtlMs: offer.grantTtlMs }), stop = this.ctx.authorization.registerFlow(flow)
    try { const outcome = await this.ctx.authorization.begin({ key: flow.key, interaction }); if (outcome.status !== 'authorized') throw new Error('first-use confirmation denied'); committed = true } finally { stop() }
    this.local(authority); const record = await this.ctx.credentials.readRecord(flow.key); if (record?.kind !== 'grant') throw new Error('first-use grant unavailable')
    const phone = productTrustSchema.parse({ schema: 'harmony-product-public-trust/1', revoked: false, identityAlias: offer.identityAlias, desktopPublicSpki: offer.desktopPublicSpki, paired: { pairId: offer.pairId, epoch: 1, audience: offer.audience, credentialId: offer.ticket.credentialId, desktopCredentialId: p256CredentialId(offer.desktopPublicSpki), expiresAt: this.clock() + offer.grantTtlMs, grant: record.payload } })
    phone.paired.expiresAt = Math.min(phone.paired.expiresAt, phone.paired.grant.expiresAt); this.approved = phone; this.phonePublicSpki = offer.ticket.publicSpki
    let document: PublicTrustDocument = phone
    if (this.renewal !== undefined) { if (phone.paired.grant.epoch !== this.renewal.revokedEpoch + 1) throw new Error('renewal grant epoch denied'); const unsigned = { schema: 'harmony-product-public-trust/2' as const, revoked: false, record: phone, history: successorHistory(this.renewal.previous), previousDigest: createHash('sha256').update(canonicalPublicTrust(this.renewal.previous)).digest('hex'), revokedEpoch: this.renewal.revokedEpoch }; document = publicTrustRenewalSchema.parse({ ...unsigned, signature: Buffer.from(await this.signer.sign(publicTrustRenewalBytes(unsigned))).toString('base64url') }) }
    return { phone: structuredClone(phone), publicDocument: structuredClone(document), relayPair: { pairId: offer.pairId, desktopPublicSpki: offer.desktopPublicSpki, phonePublicSpki: offer.ticket.publicSpki, epoch: phone.paired.epoch, expiresAt: phone.paired.expiresAt, revoked: false } }
    } catch (error) { if (committed) { try { await this.owner.revoke(authority, this.policy.deviceId) } catch (revocationError) { throw new AggregateError([error, revocationError], 'first-use postcommit failure; revocation outcome unknown') } }; throw error }
  }
  /** @param authority - separately approved local activation. @returns after installing both existing providers; network starts only when the existing desktop plugin is explicitly mounted. */
  install(authority: object): void {
    this.local(authority); this.selection(); const phone = this.approved; if (phone === undefined || this.installed || !this.owner.hasLocalGrant(this.policy.deviceId)) throw new Error('first-use activation denied')
    const trust: EndpointRelayTrust = { ...phone.paired, pairId: id<'harmony-relay-pair'>(phone.paired.pairId), role: 'desktop', credentialId: id<'harmony-device-credential'>(phone.paired.desktopCredentialId) }, scheduler = { after: (ms: number, callback: () => void) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } }
    const phoneSpki = this.phonePublicSpki; if (phoneSpki === undefined) throw new Error('first-use phone pin unavailable')
    installDesktopPairingProvider(this.ctx, true, { authority, owner: this.owner, plan: { trust, policy: this.policy.relay, sweepIntervalMs: this.policy.sweepIntervalMs, deviceId: this.policy.deviceId, recovery: { policy: this.policy.recovery, scheduler, clock: this.clock }, openPorts: () => this.openPorts(trust, this.signer, phoneSpki) } }, authority); this.installed = true
  }
  private phonePublicSpki: string | undefined
  /** @param authority - exact local confirmation owner. @param journalMode - explicit admission-domain initialization decision. @returns product entry configuration derived from the committed single-Session grant; cold starts, revocation and missing confirmation refuse. No plugin is mounted here. */
  productOptions(authority: object, journalMode: 'create' | 'reopen'): Options {
    this.local(authority); this.selection(); const grant = this.approved?.paired.grant
    if (grant === undefined || !this.owner.hasLocalGrant(this.policy.deviceId) || grant.profileId !== this.policy.profileId || JSON.stringify(grant.sessions) !== JSON.stringify([this.policy.sessionId])) throw new Error('first-use product selection denied')
    return { enabled: true, relayEnabled: true, desktopId: grant.desktopId, profileId: grant.profileId, sessionId: grant.sessions[0]!, journalMode }
  }
  /** @param authority - local revoke decision. @returns after original grant denial and durable tombstone; relay revocation remains separately owned. */
  revoke(authority: object): Promise<void> { this.local(authority); return this.owner.revoke(authority, this.policy.deviceId) }
  /** @returns after pending peers stop; does not delete credentials or revoke the separately persisted relay pair. */
  async close(): Promise<void> { this.closed = true; this.offer = undefined; await this.owner.close() }
}
