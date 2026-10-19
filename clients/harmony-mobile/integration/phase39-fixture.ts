/** Fixed public synthetic identities and memory ports. No ambient key store, model, user Session or external server is accessed. */
import { createECDH, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { RelayRooms, type RelaySocket } from './relay-core.ts'
import { nodeE2EPrimitives, p256CredentialId } from './p256-channel.ts'
import { RoomBroker, type PublicPairRevocations } from '../standalone-relay/src/room-broker.ts'
import { resolveBrokerPolicy, type BrokerPolicy } from '../standalone-relay/src/broker-policy.ts'
import { RelayControlClient, type EndpointRoomLease } from '../src/relay-control-client.ts'
import { id } from '../src/protocol.ts'
import type { E2ERole } from '../src/e2e-channel.ts'
import type { CleanupScheduler } from './connection-lifetime.ts'
/** @param scalar - documented fixture-only scalar. @returns fixed Node test signing/agreement material. */
export function fixtureKey(scalar: number) { const bytes = Buffer.alloc(32); bytes[31] = scalar; const ec = createECDH('prime256v1'); ec.setPrivateKey(bytes); const point = ec.getPublicKey(), privateKey = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url'), d: bytes.toString('base64url') } }); return { publicSpki: createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64url'), pkcs8: privateKey.export({ format: 'der', type: 'pkcs8' }), sign: async (message: Uint8Array) => sign('sha256', message, { key: privateKey, dsaEncoding: 'der' }) } }
/** Public test identity pins, never a deployment registration. */
export const desktopKey = fixtureKey(2), phoneKey = fixtureKey(6), pairId = id<'harmony-relay-pair'>('phase39-synthetic-pair'), audience = 'dsh.devinho.me'
/** @returns deterministic fresh per-fixture ids/nonces/capabilities. */
export function fixtureSource() { let n = 0; return { id: () => 'phase39-fixture-id-' + ++n, nonce: () => { const bytes = Buffer.alloc(32); bytes.writeUInt32BE(++n, 28); return bytes.toString('base64url') }, token: () => (++n).toString(16).padStart(64, '0') } }
/** Validated synthetic policy used by memory and real loopback tests. */
export const rawBroker = { enabled: true, pairs: [{ pairId, desktopPublicSpki: desktopKey.publicSpki, phonePublicSpki: phoneKey.publicSpki, epoch: 1, expiresAt: 10000, revoked: false }], maxPairs: 2, challengeTtlMs: 100, roomTtlMs: 500, maxChallengesPerConnection: 12, maxRoomIssuesPerWindow: 8, issueWindowMs: 1000, maxOwnerRoomIssues: 32, maxControlPayloadBytes: 4096, maxControlQueuedBytes: 8192 }
/** Host budgets keep sockets local and room lifetime below the pairing deadline. */
export const hostConfig = { enabled: true, host: '127.0.0.1', port: 0, publicHost: audience, sweepIntervalMs: 1000, maxControlFrames: 8, maxConnections: 16, shutdownTimeoutMs: 3000, requestTimeoutMs: 1000, headersTimeoutMs: 500, connectionCheckIntervalMs: 100, maxHeaderBytes: 4096, maxRooms: 2, maxRoomTtlMs: 1000, pairTimeoutMs: 200, maxFrameBytes: 16384, maxBufferedBytes: 32768, maxFrames: 64, idleTimeoutMs: 1000, broker: rawBroker }
/** Explicit fake time includes native endpoint expiry callbacks. */
export class FixtureClock implements CleanupScheduler {
  now = 1000
  readonly pending = new Set<{ at: number; run(): void }>()
  /** @param delayMs - fake delay. @param callback - callback. @returns cancellation. */
  after(delayMs: number, callback: () => void): () => void { const entry = { at: this.now + delayMs, run: callback }; this.pending.add(entry); return () => this.pending.delete(entry) }
  /** @param ms - fake elapsed time. @returns nothing. */
  advance(ms: number): void { this.now += ms; for (const entry of [...this.pending]) if (entry.at <= this.now && this.pending.delete(entry)) entry.run() }
}
/** Memory socket pair preserves async WS delivery and terminal listener removal. */
export class FixturePort implements RelaySocket {
  readonly frames = new Set<(bytes: Uint8Array, binary: boolean) => void>()
  readonly ends = new Set<() => void>()
  readonly sent: Uint8Array[] = []
  remote: FixturePort | undefined
  closed = false
  bufferedAmount = 0
  /** @param callback - frame listener. @returns disposer. */
  onFrame(callback: (bytes: Uint8Array, binary: boolean) => void): () => void { this.frames.add(callback); return () => { this.frames.delete(callback) } }
  /** @param callback - terminal listener. @returns disposer. */
  onEnd(callback: () => void): () => void { this.ends.add(callback); return () => { this.ends.delete(callback) } }
  /** No data readiness is needed by the control fixture. */
  ready(): void {}
  /** @param bytes - control frame. @returns nothing. */
  send(bytes: Uint8Array): void { if (this.closed) throw new Error('fixture closed'); const copy = Uint8Array.from(bytes); this.sent.push(copy); queueMicrotask(() => { if (!this.closed && !this.remote?.closed) for (const callback of this.remote?.frames ?? []) callback(copy, false) }) }
  /** Close both halves before terminal callbacks. */
  terminate(): void { if (this.closed) return; this.closed = true; for (const callback of [...this.ends]) callback(); this.remote?.terminate() }
}
/** @returns interconnected memory control ports. */
export function ports() { const server = new FixturePort(), client = new FixturePort(); server.remote = client; client.remote = server; return { server, client } }
/** @param policy - synthetic configuration. @param revocations - public-only fake persistence. @returns owned broker fixture. */
export function brokerFixture(policy: unknown = rawBroker, revocations?: PublicPairRevocations) { const clock = new FixtureClock(), authority = {}, parsed = resolveBrokerPolicy(policy); if (!parsed.enabled) throw new Error('fixture disabled'); const { maxRooms, maxRoomTtlMs, pairTimeoutMs, maxFrameBytes, maxBufferedBytes, maxFrames, idleTimeoutMs } = hostConfig, rooms = new RelayRooms(authority, { maxRooms, maxRoomTtlMs, pairTimeoutMs, maxFrameBytes, maxBufferedBytes, maxFrames, idleTimeoutMs }, () => clock.now), broker = new RoomBroker(authority, rooms, parsed, audience, () => clock.now, fixtureSource(), revocations); return { clock, authority, rooms, broker, policy: parsed, close: () => { broker.close(); rooms.close() } } }
/** @param role - paired role. @param clock - expiry owner. @returns locally approved public routing fields. */
export function endpointTrust(role: E2ERole, clock: FixtureClock) { return { pairId, epoch: 1, role, audience, credentialId: p256CredentialId((role === 'desktop' ? desktopKey : phoneKey).publicSpki), expiresAt: clock.now + 9000 } }
/** @param fixture - broker fixture. @param role - paired role. @returns controller and observed synthetic leases. */
export function attachEndpoint(fixture: ReturnType<typeof brokerFixture>, role: E2ERole) { const socket = ports(), leases: EndpointRoomLease[] = [], lifetime = new AbortController(), controller = new RelayControlClient(socket.client, endpointTrust(role, fixture.clock), role === 'desktop' ? desktopKey : phoneKey, nodeE2EPrimitives, () => fixture.clock.now, 16, 8192, 100, 500, fixture.clock, lease => leases.push(lease), lifetime.signal); fixture.broker.attach(pairId, role, socket.server); return { ...socket, leases, controller, lifetime } }
/** @returns after queued socket/signature callbacks; no real timer delay. */
export async function drain(): Promise<void> { for (let n = 0; n < 12; n++) await new Promise<void>(resolve => setImmediate(resolve)) }
/** @param candidate - untrusted policy. @returns enabled policy for tests. */
export function enabledPolicy(candidate: unknown): BrokerPolicy { const result = resolveBrokerPolicy(candidate); if (!result.enabled) throw new Error('fixture disabled'); return result }
