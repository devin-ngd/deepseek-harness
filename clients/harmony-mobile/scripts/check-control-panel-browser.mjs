/** Chrome DOM interactions over fixture-only Host commands; no installed app, real pairing or relay. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { buildCommandFeedback } from './build-command-feedback.mjs'
import { installedRc2 } from './installed-rc2.mjs'

const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json'))
const version = JSON.parse(await readFile('desktop-plugin/package.json', 'utf8')).version, world = await mkdtemp(resolve('.build/panel-browser-' + version + '-'))
const packageMode = process.argv.length === 3 && process.argv[2] === '--package'
if (process.argv.length > 2 && !packageMode) throw new Error('Only --package is supported')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
let qualification, artifact
if (packageMode) {
  const report = JSON.parse(await readFile('evidence/rc2-controls-artifacts-' + version + '.json', 'utf8'))
  assert.equal(hash(await readFile(report.artifact.path)), report.artifact.sha256)
  for (const file of report.files) assert.equal(hash(await readFile(join(report.stage, file.path.replace(/^package\//, '')))), file.sha256)
  qualification = { stage: report.stage }; artifact = report.artifact
} else qualification = await buildCommandFeedback(join(world, 'package'))
const esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), installed = await installedRc2(root)
const host = join(world, 'host.mjs'), browser = join(world, 'browser.js')
await esbuild.build({ entryPoints: [resolve('integration/control-panel-host.ts')], outfile: host, bundle: true, platform: 'node', format: 'esm', target: 'node22', tsconfigRaw: { compilerOptions: { experimentalDecorators: false } }, plugins: [installed.plugin], banner: { js: "import {createRequire as hostRequire} from 'node:module';const require=hostRequire(import.meta.url);" }, logLevel: 'warning' })
const reactRequire = createRequire(join(root, 'packages/client/ui-conversation/package.json'))
await esbuild.build({ entryPoints: [resolve('tests/helpers/control-panel-browser.mjs')], outfile: browser, bundle: true, platform: 'browser', format: 'iife', target: 'es2022', tsconfig: join(root, 'tsconfig.base.client.json'), alias: { react: reactRequire.resolve('react'), 'react-dom/client': reactRequire.resolve('react-dom/client'), 'react/jsx-runtime': reactRequire.resolve('react/jsx-runtime') }, loader: { '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' })
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_SENTINEL_ONLY: '1', DSH_HARMONY_CLIENT_ROOT: client })
const driver = join(world, 'driver.mjs')
await writeFile(driver, `import {runPanelBrowser} from ${JSON.stringify(pathToFileURL(resolve('scripts/control-panel-browser-driver.mjs')).href)};await runPanelBrowser(${JSON.stringify({ world, root, host, browser, stage: qualification.stage, version, packageMode, artifact })});\n`)
const child = spawn(process.execPath, [driver], { cwd: client, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes; process.stdout.write(bytes) })
const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })
await writeFile(join(world, 'driver.log'), log)
process.exitCode = code ?? 1
