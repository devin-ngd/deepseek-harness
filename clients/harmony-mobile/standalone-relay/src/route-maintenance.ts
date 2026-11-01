/** Closed public routing maintenance, operated while the existing service is stopped. No private store or network access. */
import { readFile, lstat } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { resolveRelayConfig } from './config.ts'
import { PublicTrustStore, type PublicTrustWrites } from './public-trust.ts'
import { DeviceRouteJournal } from './device-route-journal.ts'
import { deviceRouteSchema, type DeviceRoute } from '../../src/device-route-protocol.ts'
import { deviceBindingSchema, type DeviceBinding } from '../../src/device-binding-protocol.ts'

type Action = 'initialize' | 'register' | 'revoke-route' | 'verify' | 'revoke-device'
export class RouteMaintenanceError extends Error { constructor(readonly operationFailed: boolean, readonly closeFailed: boolean) { super('public route maintenance not verified') } }
/** Execute one explicit public-state operation and independently reopen before reporting verified. */
export async function maintainDeviceRoutes(approved: boolean, action: Action, configuration: unknown, document?: unknown, io?: PublicTrustWrites) {
  if (!['initialize', 'register', 'revoke-route', 'verify', 'revoke-device'].includes(action)) throw new RouteMaintenanceError(true, false)
  const config = resolveRelayConfig(configuration)
  if (!config.enabled || !config.broker.enabled || config.broker.maxPairs !== 1 || config.publicTrust === undefined || config.deviceRoutes === undefined || !approved && action !== 'verify') throw new RouteMaintenanceError(true, false)
  const route: DeviceRoute | undefined = action !== 'initialize' && action !== 'revoke-device' ? deviceRouteSchema.parse(document) : undefined
  const binding: DeviceBinding | undefined = action === 'revoke-device' ? deviceBindingSchema.parse(document) : undefined
  if (action === 'initialize' && document !== undefined) throw new RouteMaintenanceError(true, false)
  const open = async () => {
    const legacy = await PublicTrustStore.reopen(config.publicTrust!, config.broker as Exclude<typeof config.broker, { enabled: false }>, config.publicHost, io)
    try { return { legacy, routes: await DeviceRouteJournal.reopen(config.deviceRoutes!, legacy.fingerprint(), legacy.pairs(), config.broker.enabled ? config.broker.maxPairs : 0, Date.now, io) } }
    catch (error) { const cleanup = await Promise.allSettled([legacy.close()]); throw new RouteMaintenanceError(true, cleanup.some(item => item.status === 'rejected')) }
  }
  if (action === 'initialize') {
    const legacy = await PublicTrustStore.reopen(config.publicTrust, config.broker, config.publicHost, io)
    let failed = false
    try { await DeviceRouteJournal.initialize(config.deviceRoutes, legacy.fingerprint(), io) } catch (error) { void error; failed = true }
    const cleanup = await Promise.allSettled([legacy.close()]); if (failed || cleanup.some(item => item.status === 'rejected')) throw new RouteMaintenanceError(failed, cleanup.some(item => item.status === 'rejected'))
  } else {
    const selected = await open(); let failed = false
    try {
      if (action === 'register') await selected.routes.register(route!)
      else if (action === 'revoke-device') await selected.routes.revokeDevice(binding!)
      else { selected.routes.verifySelection(route!); if (action === 'revoke-route') await selected.routes.revokeRoute(route!.offer.routeId) }
    } catch (error) { void error; failed = true }
    const cleanup = await Promise.allSettled([selected.routes.close(), selected.legacy.close()]); if (failed || cleanup.some(item => item.status === 'rejected')) throw new RouteMaintenanceError(failed, cleanup.some(item => item.status === 'rejected'))
  }
  const reopened = await open(); let result
  try {
    if (action === 'initialize') { if (reopened.routes.pairs().length !== 0) throw new Error('new route history not empty'); result = { state: 'initialized-empty', verified: true as const } }
    else if (action === 'revoke-device') result = { ...reopened.routes.deviceStatus(binding!), verified: true as const }
    else { reopened.routes.verifySelection(route!); const status = reopened.routes.status(route!.offer.routeId); if (action === 'revoke-route' && !status.revoked) throw new Error('route revocation not durable'); result = { ...status, verified: true as const, active: !status.revoked && status.expiresAt > Date.now() } }
  } finally { const cleanup = await Promise.allSettled([reopened.routes.close(), reopened.legacy.close()]); if (cleanup.some(item => item.status === 'rejected')) throw new RouteMaintenanceError(false, true) }
  return result
}

/** CLI accepts only explicit public JSON paths and a closed action set. */
export async function routeMaintenanceCli(args: readonly string[]): Promise<void> {
  const action = args[0] as Action
  if (!['initialize', 'register', 'revoke-route', 'verify', 'revoke-device'].includes(action) || args.length % 2 !== 1) throw new RouteMaintenanceError(true, false)
  const options = new Map<string, string>()
  for (let index = 1; index < args.length; index += 2) { const key = args[index]!, value = args[index + 1]!; if (!['--config', '--public'].includes(key) || options.has(key)) throw new RouteMaintenanceError(true, false); options.set(key, value) }
  if (!options.has('--config') || (action === 'initialize' ? options.has('--public') : !options.has('--public'))) throw new RouteMaintenanceError(true, false)
  const read = async (path: string) => { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw new RouteMaintenanceError(true, false); return JSON.parse(await readFile(path, 'utf8')) as unknown }
  const config = await read(options.get('--config')!), document = options.has('--public') ? await read(options.get('--public')!) : undefined
  let approved = action === 'verify'
  if (!approved) {
    const parsed = resolveRelayConfig(config); if (!parsed.enabled || parsed.deviceRoutes === undefined) throw new RouteMaintenanceError(true, false)
    const publicRoute = action === 'initialize' || action === 'revoke-device' ? undefined : deviceRouteSchema.parse(document), tombstone = action === 'revoke-device' ? deviceBindingSchema.parse(document) : undefined
    process.stdout.write(JSON.stringify({ action, host: parsed.publicHost, statePath: parsed.deviceRoutes.path, ...(publicRoute === undefined ? {} : { routeId: publicRoute.offer.routeId, bindingId: publicRoute.offer.binding.bindingId, expiresAt: publicRoute.offer.expiresAt }), ...(tombstone === undefined ? {} : { bindingId: tombstone.bindingId, epoch: tombstone.epoch, revoked: tombstone.revoked }) }) + '\n')
    if (!process.stdin.isTTY) throw new RouteMaintenanceError(true, false)
    const terminal = createInterface({ input: process.stdin, output: process.stdout })
    try { approved = await terminal.question('Stop the relay, compare the selected public scope, then type ' + action.toUpperCase() + ' DEVICE ROUTES: ') === action.toUpperCase() + ' DEVICE ROUTES' } finally { terminal.close() }
  }
  process.stdout.write(JSON.stringify(await maintainDeviceRoutes(approved, action, config, document)) + '\n')
}
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) void routeMaintenanceCli(process.argv.slice(2)).catch(error => { process.stderr.write(JSON.stringify({ result: 'refused', verified: false, preserveStateAndLocks: true, operationFailed: error instanceof RouteMaintenanceError ? error.operationFailed : null, closeFailed: error instanceof RouteMaintenanceError ? error.closeFailed : null }) + '\n'); process.exitCode = 1 })
