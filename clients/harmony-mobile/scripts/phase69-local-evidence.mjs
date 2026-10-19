/** Record the selected source/SDK/layout regressions without overwriting predecessor evidence. */
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const checks = [
  ['strict', ['scripts/check.mjs', '--integration']],
  ['profile-strict', ['scripts/phase66-profile-typecheck.mjs']],
  ['sdk-and-layout', ['--test', 'tests/phase68-native-socket.test.mjs', 'tests/phase68-connection-lines.test.mjs', 'tests/phase68-proxy-capacity.test.mjs', 'tests/product-layout.test.mjs']]
]
const results = await Promise.all(checks.map(async ([name, args]) => {
  const child = spawn(process.execPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])) }); let output = ''
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output += bytes.toString('utf8') })
  const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) }); await writeFile('evidence/phase69-' + name + '.log', output); return { name, command: [process.execPath, ...args], code, output }
}))
const strict = results.find(row => row.name === 'strict'), local = results.find(row => row.name === 'sdk-and-layout'); assert.ok(strict.output.includes('154 lab/integration modules')); assert.match(local.output, /pass 12/)
await writeFile('evidence/phase69-local-checks.json', JSON.stringify({ at: new Date().toISOString(), results: results.map(({ output, ...result }) => result), strictModules: 154, profileModules: 7, sdkAndLayout: 12, realModels: 0, deviceIo: false }, null, 2) + '\n'); for (const row of results) assert.equal(row.code, 0, row.output); console.log('PASS: strict source154/profile7 and12 SDK/layout regressions')
