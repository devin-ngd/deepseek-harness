/** Qualify the browser factory in memory; package mode also uses the installed Host's disabled carrier. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { buildCommandFeedback } from './build-command-feedback.mjs'
import { installedRc2 } from './installed-rc2.mjs'
const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, version = JSON.parse(await readFile('desktop-plugin/package.json', 'utf8')).version
const packageMode = process.argv.length === 3 && process.argv[2] === '--package'
if (process.argv.length > 2 && !packageMode) throw new Error('Only --package is supported')
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), world = await mkdtemp(resolve('.build/command-feedback-' + version + '-'))
let qualification, artifact
if (packageMode) {
  const packaged = JSON.parse(await readFile('evidence/rc2-controls-artifacts-' + version + '.json', 'utf8'))
  assert.equal(hash(await readFile(packaged.artifact.path)), packaged.artifact.sha256)
  for (const file of packaged.files) assert.equal(hash(await readFile(join(packaged.stage, file.path.replace(/^package\//, '')))), file.sha256)
  qualification = { version, stage: packaged.stage }; artifact = packaged.artifact
} else qualification = await buildCommandFeedback(join(world, 'package'))
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_HARMONY_FEEDBACK_FACTORY: join(qualification.stage, 'lib/client.js'), DSH_HARMONY_FEEDBACK_PACKAGE: qualification.stage })
const run = async (name, args) => {
  const child = spawn(process.execPath, args, { cwd: client, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8') })
  const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })
  await writeFile(join(world, name + '.log'), log)
  return { code, log }
}
const tests = await run('tests', ['--test', '--test-reporter=tap', 'tests/command-feedback.test.mjs'])
const count = name => Number(tests.log.match(new RegExp('^# ' + name + ' (\\d+)', 'm'))?.[1] ?? 0)
let carrier
if (tests.code === 0 && packageMode) {
  const require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), installed = await installedRc2(root), output = join(world, 'carrier.mjs')
  await esbuild.build({ stdin: { contents: "import assert from 'node:assert/strict'; import { Context } from '@deepseek-ai/cordis'; import * as Carrier from " + JSON.stringify(join(qualification.stage, 'lib/index.js')) + "; const ctx = new Context(); try { await Carrier.apply(ctx, { enabled: false }); assert.equal(ctx.get('harmonyDesktop'), undefined); assert.equal(ctx.get('harmonyAuthenticatedDevices'), undefined); console.log('passive-carrier-no-authority'); } finally { await ctx.fiber.dispose(); }", resolveDir: client }, outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node24', plugins: [installed.plugin], banner: { js: "import { createRequire as carrierRequire } from 'node:module'; const require = carrierRequire(import.meta.url);" }, logLevel: 'warning' })
  carrier = await run('carrier', [output])
}
const passed = tests.code === 0 && (!packageMode || carrier?.code === 0)
const record = { at: new Date().toISOString(), version, packageMode, passed, tests: { code: tests.code, passed: count('pass'), failed: count('fail') }, carrierExitCode: carrier?.code, artifact, qualification, world, realModels: 0, userProfileOpened: false, identityAccess: false, network: false, installed: false }
const label = 'command-feedback-' + (packageMode ? 'package-' : 'tests-') + version + '-' + Date.now() + (passed ? '' : '-failed')
await writeFile('evidence/' + label + '.json', JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ passed, tests: record.tests, carrierExitCode: carrier?.code, typeDiagnostics: qualification.typeDiagnostics, evidence: 'evidence/' + label + '.json', world }))
if (!passed) console.error(tests.log.slice(-9000), carrier?.log.slice(-3000) ?? '')
process.exitCode = passed ? 0 : 1
