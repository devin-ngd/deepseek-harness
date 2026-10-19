/** Local public-only relay provisioning entry; no identity generation, HTTP enrollment or service activation. */
import { resolveRelayConfig } from './config.ts'
import { resolveBrokerPolicy } from './broker-policy.ts'
import { PublicTrustStore, type PublicTrustWrites } from './public-trust.ts'
import { p256CredentialId } from '../../integration/p256-public.ts'
import { assertRelayTimersCompatible, parseRelayEndpointTimers } from './endpoint-timers.ts'
/** @param configuration - selected enabled relay proposal containing explicit broker limits. @param pair - desktop-produced public pair only. @param trustPath - canonical absolute journal path selected by the operator. @param endpointTimers - public timer limits from the selected desktop and phone candidates. @returns a strict public proposal; no files, listener or trust state is created. */
export function prepareFirstUseRelayConfig(configuration: unknown, pair: unknown, trustPath: string, endpointTimers: unknown) {
  if (configuration === null || typeof configuration !== 'object' || Array.isArray(configuration) || !('broker' in configuration) || !('publicTrust' in configuration)) throw new Error('public relay proposal required')
  const broker = configuration.broker, trust = configuration.publicTrust
  if (broker === null || typeof broker !== 'object' || Array.isArray(broker) || trust === null || typeof trust !== 'object' || Array.isArray(trust)) throw new Error('public relay limits required')
  const config = resolveRelayConfig({ ...configuration, broker: { ...broker, pairs: [pair] }, publicTrust: { ...trust, path: trustPath } })
  if (!config.enabled || !config.broker.enabled || config.broker.maxPairs !== 1 || config.broker.pairs[0]!.revoked || config.broker.pairs[0]!.expiresAt <= Date.now() || config.publicTrust === undefined) throw new Error('one unexpired public relay pair required')
  assertRelayTimersCompatible(config, parseRelayEndpointTimers(endpointTimers))
  return config
}
function admittedFirstUseRelay(configuration: unknown, pair: unknown, endpointTimers: unknown) {
  const config = resolveRelayConfig(configuration)
  if (!config.enabled || !config.broker.enabled || config.publicTrust === undefined) throw new Error('relay public configuration required')
  const broker = resolveBrokerPolicy({ ...config.broker, pairs: [pair] }); if (!broker.enabled || broker.pairs.length !== 1 || broker.pairs[0]!.revoked || broker.pairs[0]!.expiresAt <= Date.now() || JSON.stringify(config.broker.pairs) !== JSON.stringify(broker.pairs)) throw new Error('relay public pair denied')
  assertRelayTimersCompatible(config, parseRelayEndpointTimers(endpointTimers))
  return { ...config, broker, publicTrust: config.publicTrust }
}
/** @param configuration - selected public configuration validated before display. @param pair - selected strict public pair. @param endpointTimers - public limits checked before display. @returns bounded fingerprint/path/expiry comparison fields only; unknown input fields never reach terminal output. */
export function firstUseRelayPreview(configuration: unknown, pair: unknown, endpointTimers: unknown) { const config = admittedFirstUseRelay(configuration, pair, endpointTimers), selected = config.broker.pairs[0]!; return { publicHost: config.publicHost, trustPath: config.publicTrust.path, pairId: selected.pairId, epoch: selected.epoch, expiresAt: selected.expiresAt, desktopFingerprint: p256CredentialId(selected.desktopPublicSpki), phoneFingerprint: p256CredentialId(selected.phonePublicSpki) } }
/** @param authority - exact local deployment owner. @param approved - same capability. @param confirmed - explicit public-state initialization decision. @param configuration - full local relay settings with one public trust path. @param pair - desktop-produced public pair. @param endpointTimers - public limits checked before any trust write. @param io - existing interrupted-write test seam. @returns the validated config after exclusive journal/head creation; existing/missing/unknown state never activates a listener. */
export async function initializeFirstUseRelay(authority: object, approved: object, confirmed: boolean, configuration: unknown, pair: unknown, endpointTimers: unknown, io?: PublicTrustWrites) { if (authority !== approved || !confirmed) throw new Error('relay public initialization denied'); const config = admittedFirstUseRelay(configuration, pair, endpointTimers); await PublicTrustStore.initialize(authority, approved, config.publicTrust, config.broker, config.publicHost, io); return config }
