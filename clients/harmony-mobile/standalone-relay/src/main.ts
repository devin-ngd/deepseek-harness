/** Explicit independent relay CLI. Imports are inert; optional public identity pins enable a routing broker, and default-disabled mode opens nothing. */
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { openRelayApplication } from './application.ts'
import { RelayStartupFailure, startupDiagnostic } from './startup-diagnostic.ts'
export { createStandaloneRelay, StandaloneRelay } from './host.ts'
export { openRelayApplication, RelayApplication } from './application.ts'
export { PublicTrustStore, PublicTrustError } from './public-trust.ts'
export { relayTokenDigest } from '../../integration/relay-core.ts'
async function main(): Promise<void> {
  if (process.argv.length !== 4 || process.argv[2] !== '--config') throw new Error('relay configuration argument required')
  let candidate: unknown
  try { candidate = JSON.parse(await readFile(process.argv[3]!, 'utf8')) } catch (error) { throw new RelayStartupFailure('config', error) }
  const owner = await openRelayApplication(candidate, Object.freeze({}), Date.now)
  if (owner === undefined) return
  const stop = () => { void owner.close().catch(error => { void error; process.exitCode = 1 }) }
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
  try { await owner.start() } catch (error) { process.off('SIGINT', stop); process.off('SIGTERM', stop); throw error }
}
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) void main().catch(error => { process.stderr.write(startupDiagnostic(error) + '\n'); process.exitCode = 1 })
