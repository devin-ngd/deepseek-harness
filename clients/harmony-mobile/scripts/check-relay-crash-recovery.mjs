/** Build and exercise relay crash recovery against synthetic state on Linux. */
import { createRequire } from 'node:module'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

if (process.platform !== 'linux') throw new Error('Linux is required for relay recovery tests')
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(project, '../..')
const require = createRequire(join(root, 'package.json'))
const esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const stage = await mkdtemp(join(tmpdir(), 'harmony-relay-recovery-'))
try {
  const options = { bundle: true, platform: 'node', format: 'esm', target: 'node22' }
  await esbuild.build({ ...options, entryPoints: [join(project, 'standalone-relay/src/main.ts')], outfile: join(stage, 'server.mjs'), external: ['ws'] })
  await esbuild.build({ ...options, entryPoints: [join(project, 'standalone-relay/src/recoverable-lock.ts')], outfile: join(stage, 'recoverable-lock.mjs') })
  await esbuild.build({ ...options, stdin: { contents: "export { PublicTrustStore, publicTrustWrites } from './standalone-relay/src/public-trust.ts'; export { DeviceRouteJournal } from './standalone-relay/src/device-route-journal.ts'; export { startupDiagnostic, RelayStartupFailure } from './standalone-relay/src/startup-diagnostic.ts'", resolveDir: project, loader: 'ts' }, outfile: join(stage, 'integration.mjs') })
  const ws = join(root, 'node_modules/.pnpm/ws@8.21.3/node_modules/ws')
  await cp(ws, join(stage, 'node_modules/ws'), { recursive: true })
  for (const name of ['test-recoverable-lock.mjs', 'test-journals.mjs']) {
    await writeFile(join(stage, name), await readFile(join(project, 'standalone-relay/tests', name)))
    const result = spawnSync(process.execPath, [join(stage, name)], { encoding: 'utf8', timeout: 30000 })
    process.stdout.write(result.stdout); process.stderr.write(result.stderr)
    if (result.error || result.status !== 0) throw result.error ?? new Error(`${name} failed`)
  }
} finally { await rm(stage, { recursive: true, force: true }) }
