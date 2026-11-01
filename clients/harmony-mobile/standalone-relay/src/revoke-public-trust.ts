/** Public-only local maintenance; no listener, identity signer or DSH credential access. */
import { lstat, readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { resolveRelayConfig } from './config.ts'
import { resolveBrokerPolicy, type RelayPairTrust } from './broker-policy.ts'
import { PublicTrustStore, type PublicTrustWrites } from './public-trust.ts'
import { assertRelayTimersCompatible, parseRelayEndpointTimers } from './endpoint-timers.ts'
import { p256CredentialId } from '../../integration/p256-public.ts'

export { PublicTrustStore } from './public-trust.ts'

/** Stable failure preserves independent operation and close outcomes without printing input values. */
export class PublicMaintenanceError extends Error {
  /** @param code - Selection, decision or persistence disposition. @param operationFailed - Public operation failed. @param closeFailed - Writer closure also failed. */
  constructor(readonly code: 'selection-denied' | 'decision-denied' | 'state-unverified', readonly operationFailed = false, readonly closeFailed = false) { super(code); this.name = 'PublicMaintenanceError' }
}

function samePair(a: RelayPairTrust, b: RelayPairTrust): boolean {
  return a.pairId === b.pairId && a.desktopPublicSpki === b.desktopPublicSpki && a.phonePublicSpki === b.phonePublicSpki && a.epoch === b.epoch && a.expiresAt === b.expiresAt && a.revoked === b.revoked
}

/** @param configuration - Strict original public config. @param pair - Exact six-field initial public pair. @param state - Explicit canonical journal path. @param timers - Selected endpoint bounds. @returns Validated one-pair selection, including its exact terminal tombstone. */
export function reviewPublicMaintenance(configuration: unknown, pair: unknown, state: string, timers: unknown) {
  const config = resolveRelayConfig(configuration)
  if (!config.enabled || !config.broker.enabled || config.broker.maxPairs !== 1 || config.broker.pairs.length !== 1 || config.publicTrust === undefined || !isAbsolute(state) || resolve(state) !== state || config.publicTrust.path !== state) throw new PublicMaintenanceError('selection-denied')
  assertRelayTimersCompatible(config, parseRelayEndpointTimers(timers))
  const candidate = resolveBrokerPolicy({ ...config.broker, pairs: [pair] })
  if (!candidate.enabled || candidate.pairs.length !== 1) throw new PublicMaintenanceError('selection-denied')
  const original = config.broker.pairs[0]!, selected = candidate.pairs[0]!
  if (!samePair(original, selected)) throw new PublicMaintenanceError('selection-denied')
  const terminal: RelayPairTrust = original.revoked ? original : { ...original, epoch: original.epoch + 1, revoked: true }
  return { policy: config.publicTrust, broker: config.broker, audience: config.publicHost, original, terminal,
    preview: { publicHost: config.publicHost, trustPath: state, pairId: original.pairId, initialEpoch: original.epoch, revokedEpoch: terminal.epoch, expiresAt: original.expiresAt, desktopFingerprint: p256CredentialId(original.desktopPublicSpki), phoneFingerprint: p256CredentialId(original.phonePublicSpki) } }
}

type Selection = ReturnType<typeof reviewPublicMaintenance>

async function selectedStore<T>(selection: Selection, work: (store: PublicTrustStore) => Promise<T>, io?: PublicTrustWrites): Promise<T> {
  // Missing state must not acquire a new refusal lock; existing locks are never removed here.
  for (const path of [selection.policy.path, selection.policy.path + '.head']) {
    const file = await lstat(path)
    if (!file.isFile() || file.isSymbolicLink()) throw new PublicMaintenanceError('selection-denied')
  }
  const store = await PublicTrustStore.reopen(selection.policy, selection.broker, selection.audience, io)
  const [operation] = await Promise.allSettled([work(store)])
  const [closed] = await Promise.allSettled([store.close()])
  if (operation!.status === 'rejected' || closed!.status === 'rejected') throw new PublicMaintenanceError('state-unverified', operation!.status === 'rejected', closed!.status === 'rejected')
  return operation!.value
}

function currentPair(store: PublicTrustStore, selection: Selection): RelayPairTrust {
  const pairs = store.pairs()
  if (pairs.length !== 1 || pairs[0]!.pairId !== selection.original.pairId) throw new PublicMaintenanceError('selection-denied')
  return pairs[0]!
}

/** @param configuration - Original public initial pins/config. @param pair - Exact original pair. @param state - Explicit journal path. @param timers - Endpoint bounds. @param io - Optional existing synthetic persistence-failure seam; omitted in production. @returns A durable revoked result only after strict journal/head reopen and clean close. */
export async function verifyPublicRevocation(configuration: unknown, pair: unknown, state: string, timers: unknown, io?: PublicTrustWrites) {
  const selection = reviewPublicMaintenance(configuration, pair, state, timers)
  await selectedStore(selection, async store => { if (!samePair(currentPair(store, selection), selection.terminal)) throw new PublicMaintenanceError('state-unverified', true) }, io)
  return { pairId: selection.terminal.pairId, epoch: selection.terminal.epoch, revoked: true, verified: true, privateIdentityOpened: false, listenerStarted: false }
}

/** @param confirmed - Explicit local operator decision after public preview. @param configuration - Original public config. @param pair - Exact original public pair. @param state - Explicit journal path. @param timers - Endpoint bounds. @param io - Optional existing synthetic persistence-failure seam; omitted in production. @returns Verified successor or exact already-revoked result; never deletes or repairs unknown state. */
export async function revokePublicTrust(confirmed: boolean, configuration: unknown, pair: unknown, state: string, timers: unknown, io?: PublicTrustWrites) {
  if (!confirmed) throw new PublicMaintenanceError('decision-denied')
  const selection = reviewPublicMaintenance(configuration, pair, state, timers)
  const alreadyRevoked = await selectedStore(selection, async store => {
    const current = currentPair(store, selection)
    if (samePair(current, selection.terminal)) return true
    if (!samePair(current, selection.original) || current.revoked) throw new PublicMaintenanceError('selection-denied')
    await store.commit(selection.terminal)
    return false
  }, io)
  const verified = await verifyPublicRevocation(configuration, pair, state, timers, io)
  return { ...verified, alreadyRevoked }
}

async function publicJson(path: string): Promise<unknown> {
  const file = await lstat(path)
  if (!path.endsWith('.json') || !file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || file.size <= 0 || file.size > 65536) throw new PublicMaintenanceError('selection-denied')
  const bytes = await readFile(path)
  if (bytes.length !== file.size) throw new PublicMaintenanceError('selection-denied')
  return JSON.parse(bytes.toString('utf8'))
}

/** @param argv - preview/revoke/verify and exact --config, --pair, --state, --limits paths. @returns After public preview or verified offline revocation; never starts/stops a service. */
export async function publicTrustMaintenance(argv: readonly string[]): Promise<void> {
  const command = argv[0]
  if (argv.length !== 9 || !['preview', 'revoke', 'verify'].includes(command ?? '') || argv[1] !== '--config' || argv[3] !== '--pair' || argv[5] !== '--state' || argv[7] !== '--limits') throw new PublicMaintenanceError('selection-denied')
  const configuration = await publicJson(argv[2]!), pair = await publicJson(argv[4]!), state = argv[6]!, timers = await publicJson(argv[8]!)
  const selected = reviewPublicMaintenance(configuration, pair, state, timers)
  if (command === 'preview') { process.stdout.write(JSON.stringify(selected.preview) + '\n'); return }
  if (command === 'verify') { process.stdout.write(JSON.stringify(await verifyPublicRevocation(configuration, pair, state, timers)) + '\n'); return }
  if (!process.stdin.isTTY) throw new PublicMaintenanceError('decision-denied')
  process.stdout.write(JSON.stringify(selected.preview) + '\n')
  const terminal = createInterface({ input: process.stdin, output: process.stdout })
  let approved = false
  try { approved = await terminal.question('Stop the relay and compare this exact public pair/path. Type REVOKE PUBLIC TRUST; any other response denies: ') === 'REVOKE PUBLIC TRUST' } finally { terminal.close() }
  process.stdout.write(JSON.stringify(await revokePublicTrust(approved, configuration, pair, state, timers)) + '\n')
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) void publicTrustMaintenance(process.argv.slice(2)).catch(error => {
  process.stderr.write(JSON.stringify({ result: 'refused', revocation: 'not-verified', preserveStateAndLocks: true, operationFailed: error instanceof PublicMaintenanceError ? error.operationFailed : null, closeFailed: error instanceof PublicMaintenanceError ? error.closeFailed : null }) + '\n')
  process.exitCode = 1
})
