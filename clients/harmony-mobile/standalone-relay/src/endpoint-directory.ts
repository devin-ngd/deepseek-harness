/** Volatile, paired endpoint metadata. This owner has no room or data transport capability. */
import { p256CredentialId, verifyP256 } from '../../integration/p256-public.ts'
import type { RelaySocket } from '../../integration/relay-core.ts'
import { DEVICE_ENDPOINT_LEASE_MS, endpointProof, endpointProofBytes, type EndpointProof } from '../../src/device-endpoint-exchange.ts'
import { reverseProof, reverseProofBytes, type ReverseProof } from '../../src/device-reverse-control.ts'
import { RELAY_CONTROL_PROTOCOL, relayProofBytes, type RelayChallenge, type RelayPairId } from '../../src/relay-control-protocol.ts'
import type { E2ERole } from '../../src/e2e-channel.ts'
import { id } from '../../src/protocol.ts'
import type { BrokerPolicy, RelayPairTrust } from './broker-policy.ts'
import type { RelayIssueSource } from './room-broker.ts'

interface Peer { socket: RelaySocket; challenge: RelayChallenge; revision: number; answered: boolean; reverse: boolean; stops: (() => void)[] }

/** One bounded address snapshot per live paired identity. */
export class EndpointDirectory {
  private readonly snapshots = new Map<RelayPairId, { proof: EndpointProof; revision: number; expiresAt: number }>()
  private readonly peers = new Set<Peer>()
  private readonly subscribers = new Map<RelayPairId, Peer>()
  private revision = 0

  /** @param trust - current live allowlist lookup. @param policy - existing control frame and challenge limits. @param audience - selected TLS host. @param clock - expiry clock. @param source - fresh challenge identifiers and nonces. */
  constructor(private readonly trust: (pair: RelayPairId) => RelayPairTrust | undefined, private readonly policy: BrokerPolicy,
    private readonly audience: string, private readonly clock: () => number, private readonly source: RelayIssueSource) {}

  /** @param pair - routing pair header. @param role - requested operation role. @param socket - bounded one-shot control port. @returns after sending a fresh signed-proof challenge. */
  attach(pair: RelayPairId, role: E2ERole, socket: RelaySocket, reverse = false): void {
    const trust = this.trust(pair)
    if (trust === undefined) throw new Error('endpoint exchange denied')
    const destination = reverse && role === 'phone' ? this.subscribers.get(pair) : undefined
    if (reverse && role === 'phone' && (destination === undefined || this.deadline(destination) <= this.clock())) throw new Error('reverse desktop unavailable')
    const challenge: RelayChallenge = { protocol: RELAY_CONTROL_PROTOCOL, kind: 'challenge', pairId: pair, role,
      round: destination?.challenge.round ?? id<'harmony-relay-round'>(this.source.id()), challengeId: id<'harmony-relay-proof'>(this.source.id()),
      epoch: trust.epoch, credentialId: p256CredentialId(role === 'desktop' ? trust.desktopPublicSpki : trust.phonePublicSpki),
      audience: this.audience, nonce: this.source.nonce(), expiresAt: Math.min(trust.expiresAt, this.clock() + this.policy.challengeTtlMs) }
    const peer: Peer = { socket, challenge, revision: ++this.revision, answered: false, reverse, stops: [] }
    this.peers.add(peer)
    try {
      peer.stops.push(socket.onEnd(() => this.remove(peer)))
      peer.stops.push(socket.onFrame((bytes, binary) => {
        try {
          if (binary || bytes.length === 0 || bytes.length > this.policy.maxControlPayloadBytes || peer.answered) throw new Error('endpoint proof denied')
          const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
          if (peer.reverse) this.answerReverse(peer, reverseProof(value))
          else this.answer(peer, endpointProof(value))
        } catch (error) { void error; this.remove(peer) }
      }))
      this.send(peer, challenge)
    } catch (error) { this.remove(peer); throw error }
  }

  private answer(peer: Peer, proof: EndpointProof): void {
    const challenge = peer.challenge, trust = this.trust(challenge.pairId)
    if (trust === undefined || trust.epoch !== challenge.epoch || challenge.expiresAt <= this.clock()
      || !Buffer.from(relayProofBytes(challenge)).equals(relayProofBytes(proof.challenge))
      || !verifyP256(challenge.role === 'desktop' ? trust.desktopPublicSpki : trust.phonePublicSpki,
        endpointProofBytes(challenge, proof.candidates), proof.signature)) throw new Error('endpoint proof denied')
    peer.answered = true
    const prior = this.snapshots.get(challenge.pairId)
    if (challenge.role === 'desktop') {
      if (prior !== undefined && prior.revision >= peer.revision) throw new Error('endpoint publication superseded')
      this.snapshots.set(challenge.pairId, { proof, revision: peer.revision, expiresAt: Math.min(trust.expiresAt, challenge.expiresAt + DEVICE_ENDPOINT_LEASE_MS) })
      this.send(peer, { kind: 'published' })
    } else {
      const current = prior !== undefined && prior.expiresAt > this.clock() && prior.proof.challenge.epoch === trust.epoch
      this.send(peer, { kind: 'endpoints', proof: current ? prior.proof : null })
    }
  }

  private answerReverse(peer: Peer, proof: ReverseProof): void {
    const challenge = peer.challenge, pair = challenge.pairId, trust = this.trust(pair)
    if (trust === undefined || trust.epoch !== challenge.epoch || challenge.expiresAt <= this.clock()
      || !Buffer.from(relayProofBytes(challenge)).equals(relayProofBytes(proof.challenge))
      || !verifyP256(challenge.role === 'desktop' ? trust.desktopPublicSpki : trust.phonePublicSpki,
        reverseProofBytes(challenge, proof.offer), proof.signature)) throw new Error('reverse proof denied')
    peer.answered = true
    const subscriber = this.subscribers.get(pair)
    if (challenge.role === 'desktop') {
      if (subscriber !== undefined && subscriber.revision >= peer.revision) throw new Error('reverse subscription superseded')
      if (subscriber !== undefined) this.remove(subscriber)
      this.subscribers.set(pair, peer)
      this.send(peer, { kind: 'subscribed' })
      return
    }
    if (subscriber === undefined || subscriber.challenge.epoch !== trust.epoch || subscriber.challenge.round !== challenge.round
      || this.deadline(subscriber) <= this.clock()) throw new Error('reverse desktop unavailable')
    this.subscribers.delete(pair)
    this.send(subscriber, { kind: 'reverse-offer', proof })
    this.send(peer, { kind: 'delivered' })
  }

  private deadline(peer: Peer): number {
    const lease = peer.reverse && peer.answered && peer.challenge.role === 'desktop' ? DEVICE_ENDPOINT_LEASE_MS : 0
    return Math.min(peer.challenge.expiresAt + lease, this.trust(peer.challenge.pairId)?.expiresAt ?? 0)
  }

  private send(peer: Peer, value: RelayChallenge | { kind: 'published' | 'delivered' | 'subscribed' } | { kind: 'endpoints'; proof: EndpointProof | null } | { kind: 'reverse-offer'; proof: ReverseProof }): void {
    const bytes = new TextEncoder().encode(JSON.stringify(value))
    if (bytes.length > this.policy.maxControlPayloadBytes || peer.socket.bufferedAmount + bytes.length > this.policy.maxControlQueuedBytes) throw new Error('endpoint response too large')
    peer.socket.send(bytes)
  }

  private remove(peer: Peer): void {
    if (!this.peers.delete(peer)) return
    if (this.subscribers.get(peer.challenge.pairId) === peer) this.subscribers.delete(peer.challenge.pairId)
    for (const stop of peer.stops) stop()
    peer.socket.terminate()
  }

  /** Drop expired snapshots and control ports. */
  sweep(): void {
    const now = this.clock()
    for (const [pair, value] of this.snapshots) if (value.expiresAt <= now || this.trust(pair) === undefined) this.snapshots.delete(pair)
    for (const peer of this.peers) if (this.deadline(peer) <= now) this.remove(peer)
  }

  /** @param pair - revoked routing pair. @returns after clearing its address snapshot and attached ports. */
  revoke(pair: RelayPairId): void {
    this.snapshots.delete(pair)
    for (const peer of this.peers) if (peer.challenge.pairId === pair) this.remove(peer)
  }

  /** Clear all in-memory endpoint state and terminate owned control ports. */
  close(): void {
    this.snapshots.clear()
    for (const peer of this.peers) this.remove(peer)
  }
}
