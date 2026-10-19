/** Independent relay startup with public-state reopen before listening. It never creates or repairs a trust file or starts DSH. */
import { resolveRelayConfig } from './config.ts'
import { StandaloneRelay, createStandaloneRelay, freshRelayIssueSource } from './host.ts'
import { PublicTrustStore, type PublicTrustWrites } from './public-trust.ts'
import type { RelayPairId } from '../../src/relay-control-protocol.ts'
import type { RelayIssueSource } from './room-broker.ts'
/** All transport resources close before the public writer; failed/unknown commits remain visible and retain their lock. */
export class RelayApplication {
  private closing: Promise<void> | undefined
  /** @param relay - configured transport owner. @param store - optional validated public writer. */
  constructor(private readonly relay: StandaloneRelay, private readonly store?: PublicTrustStore) {}
  /** @returns after loopback listener startup. */
  async start(): Promise<void> { try { await this.relay.start() } catch (error) { void error; await this.close(); throw new Error('relay application startup failed') } }
  /** @returns current local synthetic/service-check port. */
  port(): number { return this.relay.port() }
  /** @returns nothing; explicit lifecycle expiry. */
  sweep(): void { this.relay.sweep() }
  /** @param authority - exact local revocation operator. @param pair - public routing pair. @returns after live denial plus public journal/head synchronization. */
  revokePair(authority: object, pair: RelayPairId): Promise<void> { return this.relay.revokePair(authority, pair) }
  /** @returns after transport and writer attempts; shutdown is shared and errors never imply durable success. */
  close(): Promise<void> { if (this.closing !== undefined) return this.closing; this.closing = (async () => { const transport = await Promise.allSettled([this.relay.close()]), storage = await Promise.allSettled([this.store?.close()]); if ([...transport, ...storage].some(value => value.status === 'rejected')) throw new Error('relay application cleanup failed') })(); return this.closing }
}
/** @param candidate - explicit static config. @param authority - local owner capability. @param clock - absolute expiry clock. @param source - ephemeral material source, deterministic in tests. @param io - synthetic interruption/directory-sync port for tests only. @returns inert reopened application or disabled result; missing/corrupt state fails before any socket exists. */
export async function openRelayApplication(candidate: unknown = { enabled: false }, authority: object = {}, clock: () => number = Date.now, source?: RelayIssueSource, io?: PublicTrustWrites): Promise<RelayApplication | undefined> {
  const config = resolveRelayConfig(candidate); if (!config.enabled) return undefined
  if (config.publicTrust === undefined) { if (config.broker.enabled) throw new Error('enabled broker requires public trust reopen'); const owner = createStandaloneRelay(config, authority, clock, () => {}, source); return owner === undefined ? undefined : new RelayApplication(owner) }
  if (!config.broker.enabled) throw new Error('public broker missing'); const store = await PublicTrustStore.reopen(config.publicTrust, config.broker, config.publicHost, io)
  try { let application: RelayApplication | undefined; const owner = new StandaloneRelay({ ...config, broker: { ...config.broker, pairs: store.pairs() } }, authority, clock, () => { void application?.close().catch(error => { void error; /* CLI stop/start completion retains the content-free failure. */ }) }, source ?? freshRelayIssueSource(), store); application = new RelayApplication(owner, store); return application }
  catch (error) { void error; await store.close(); throw new Error('relay application initialization failed') }
}
