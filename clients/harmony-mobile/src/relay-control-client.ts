/** Trusted endpoint room client. It uses the existing identity signer and never exposes a generic signer to rich guests or derives trust from server JSON. */
import type { E2ERole, P256IdentitySigner } from './e2e-channel.ts'
import type { E2EPrimitives } from './e2e-channel.ts'
import type { RelaySocket } from '../integration/relay-core.ts'
import { relayChallenge, relayReceipt, relayProofBytes, type RelayPairId, type RelayChallenge, type RelayRoomReceipt } from './relay-control-protocol.ts'
import type { DeviceCredentialId } from '../integration/device-auth.ts'
import type { CleanupScheduler } from '../integration/connection-lifetime.ts'
/** Public routing approval copied from locally confirmed pairing, independent of desktop Session grant/epoch. */
export interface EndpointRelayTrust { readonly pairId: RelayPairId; readonly epoch: number; readonly role: E2ERole; readonly audience: string; readonly credentialId: DeviceCredentialId; readonly expiresAt: number }
/** Each received room owns an abort signal that closes its E2E/data connection before another generation starts. */
export interface EndpointRoomLease { readonly receipt: RelayRoomReceipt; readonly signal: AbortSignal }
/** Fixed control facts omit challenge/proof bytes, identities, endpoints and room capabilities. */
export type ControlDiagnostic = 'frame-received' | 'frame-decoded' | 'challenge-validated' | 'identity-validated' | 'sign-started' | 'sign-completed' | 'proof-queued' | 'room-validated' | 'challenge-deadline' | 'trust-deadline' | 'closed' | `failure-${'wire' | 'decode' | 'challenge' | 'identity' | 'sign' | 'send' | 'room'}:${'format' | 'refused'}`
/** Serial controller requires a new bounded nonce per connection generation; data resubscription retains original command/cursor ids outside this class. */
export class RelayControlClient {
  private readonly stops: (() => void)[] = []
  private readonly used = new Set<string>()
  private tail: Promise<void> = Promise.resolve()
  private challenge: RelayChallenge | undefined
  private lease: AbortController | undefined
  private closed = false
  private failed = false
  private phase: 'decode' | 'challenge' | 'identity' | 'sign' | 'send' | 'room' = 'decode'
  private stopLease: () => void = () => {}
  private stopChallenge: () => void = () => {}
  /** @param socket - explicitly approved control transport. @param trust - local paired identity/audience. @param signer - existing Node/native key port. @param primitives - existing codec/crypto backend. @param clock - local expiry clock. @param maxProofs - single-control-connection signing bound. @param maxQueuedBytes - total async frame cap. @param maxChallengeTtlMs - local signing freshness cap. @param maxRoomTtlMs - local room expiry cap. @param scheduler - owner-controlled expiry callbacks. @param room - native/host data connector callback. @param lifetime - local pairing policy lifetime including revocation. @param diagnostic - optional fixed phase facts; omission emits nothing, and observer failure emits only a fixed fallback. A queued proof is not a network-send or relay-verification acknowledgment. */
  constructor(private readonly socket: RelaySocket, private readonly trust: EndpointRelayTrust, private readonly signer: P256IdentitySigner, private readonly primitives: E2EPrimitives, private readonly clock: () => number, private readonly maxProofs: number, maxQueuedBytes: number, private readonly maxChallengeTtlMs: number, private readonly maxRoomTtlMs: number, scheduler: CleanupScheduler, private readonly room: (lease: EndpointRoomLease) => void, lifetime: AbortSignal, private readonly diagnostic?: (stage: ControlDiagnostic) => void) {
    if (![maxProofs, maxQueuedBytes, maxChallengeTtlMs, maxRoomTtlMs].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('invalid endpoint room policy')
    this.scheduler = scheduler
    try {
    let pending = 0
    this.stops.push(socket.onEnd(() => this.close())); this.stops.push(socket.onFrame((bytes, binary) => {
      if (this.closed) return; this.observe('frame-received'); if (binary || bytes.byteLength === 0 || pending + bytes.byteLength > maxQueuedBytes) { this.observe('failure-wire:refused'); this.close(); return }; const copy = Uint8Array.from(bytes); pending += copy.byteLength
      this.tail = this.tail.then(async () => { this.phase = 'decode'; const candidate: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(copy)); this.observe('frame-decoded'); await this.receive(candidate) }).catch(error => { this.observe(`failure-${this.phase}:${error instanceof SyntaxError ? 'format' : 'refused'}`); this.close() }).finally(() => { pending -= copy.byteLength; copy.fill(0) })
    }))
    this.stops.push(scheduler.after(Math.max(0, trust.expiresAt - clock()), () => { this.observe('trust-deadline'); this.close() }))
    const stop = () => this.close(); lifetime.addEventListener('abort', stop, { once: true }); this.stops.push(() => lifetime.removeEventListener('abort', stop)); if (lifetime.aborted || trust.expiresAt <= clock()) this.close()
    } catch (error) { void error; this.close(); throw new Error('endpoint control acquisition failed') }
  }
  private readonly scheduler: CleanupScheduler
  private observe(stage: ControlDiagnostic): void { if (this.diagnostic === undefined) return; try { this.diagnostic(stage) } catch (error) { void error; console.warn('DSH_CONTROL_DIAGNOSTIC_FAILURE') } }
  private current(): void { if (this.closed || this.trust.expiresAt <= this.clock()) throw new Error('endpoint room expired') }
  private async receive(candidate: unknown): Promise<void> {
    this.current()
    if (candidate !== null && typeof candidate === 'object' && 'kind' in candidate && candidate.kind === 'challenge') {
      this.phase = 'challenge'; const challenge = relayChallenge(candidate); if (challenge.pairId !== this.trust.pairId || challenge.role !== this.trust.role || challenge.epoch !== this.trust.epoch || challenge.audience !== this.trust.audience || challenge.credentialId !== this.trust.credentialId || challenge.expiresAt <= this.clock() || challenge.expiresAt > Math.min(this.clock() + this.maxChallengeTtlMs, this.trust.expiresAt) || this.used.has(challenge.challengeId) || this.used.size >= this.maxProofs) throw new Error('endpoint room denied')
      this.observe('challenge-validated'); this.phase = 'identity'; if (await this.primitives.credentialId(this.signer.publicSpki) !== this.trust.credentialId) throw new Error('endpoint room denied'); this.observe('identity-validated')
      this.current(); if (challenge.expiresAt <= this.clock()) throw new Error('endpoint room stale'); this.stopLease(); this.stopChallenge(); this.lease?.abort(); this.lease = undefined; this.challenge = challenge; this.used.add(challenge.challengeId); this.stopChallenge = this.scheduler.after(challenge.expiresAt - this.clock(), () => { this.observe('challenge-deadline'); this.close() })
      this.phase = 'sign'; this.observe('sign-started'); const signature = await this.signer.sign(relayProofBytes(challenge)); this.observe('sign-completed'); this.current(); if (challenge.expiresAt <= this.clock() || this.challenge !== challenge) throw new Error('endpoint room stale')
      this.phase = 'send'; this.socket.send(new TextEncoder().encode(JSON.stringify({ challenge, signature: this.primitives.encode(signature) }))); this.observe('proof-queued'); this.phase = 'room'; return
    }
    this.phase = 'room'; const receipt = relayReceipt(candidate), challenge = this.challenge
    if (challenge === undefined || challenge.expiresAt <= this.clock() || receipt.pairId !== this.trust.pairId || receipt.role !== this.trust.role || receipt.epoch !== this.trust.epoch || receipt.round !== challenge.round || receipt.expiresAt <= this.clock() || receipt.expiresAt > Math.min(this.trust.expiresAt, this.clock() + this.maxRoomTtlMs) || this.lease !== undefined) throw new Error('endpoint room denied')
    this.observe('room-validated'); this.stopChallenge(); this.challenge = undefined; this.lease = new AbortController(); const lease = this.lease; this.stopLease = this.scheduler.after(receipt.expiresAt - this.clock(), () => lease.abort()); this.room({ receipt, signal: lease.signal })
  }
  /** @returns after currently queued signer/parse work; no automatic reconnect or key creation is performed here. */
  async settled(): Promise<void> { await this.tail; if (this.failed) throw new Error('endpoint control cleanup failed') }
  /** @returns nothing; abort current data lease before releasing control listeners/socket and discarding proof state. */
  close(): void { if (this.closed) return; this.closed = true; this.observe('closed'); const lease = this.lease; this.lease = undefined; this.challenge = undefined; this.used.clear(); for (const stop of [() => lease?.abort(), this.stopLease, this.stopChallenge, ...this.stops, () => this.socket.terminate()]) { try { stop() } catch (error) { void error; this.failed = true } } }
}
