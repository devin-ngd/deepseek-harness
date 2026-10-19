/** Probe actual spliced desktop classes in a disposable detached copy; never edits the sealed candidate or enables field mode. */
import assert from 'node:assert/strict'
import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
const root = resolve('.'), candidate = resolve('.build/phase76-desktop-candidate'), world = await mkdtemp('D:/Temp/harmony-phase76-closed-control-'), copy = join(world, 'candidate')
await cp(candidate, copy, { recursive: true, dereference: false })
const lib = join(copy, 'runtime/node_modules/@local/dsh-harmony-replay/lib'), probe = join(lib, 'control-probe.mjs')
await writeFile(probe, await readFile(join(lib, 'index.js'), 'utf8') + '\nexport { RelayControlClient, PairedRelayEndpoint, EncryptedRelayConnection };\n', { flag: 'wx' })
const source = pathToFileURL(join(root, '.build/phase76-control.js')).href, closed = pathToFileURL(probe).href, wrapper = join(world, 'fixture.mjs')
await writeFile(wrapper, 'export * from ' + JSON.stringify(source) + ';\nexport { RelayControlClient, PairedRelayEndpoint, EncryptedRelayConnection } from ' + JSON.stringify(closed) + ';\n', { flag: 'wx' })
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', HARMONY_PHASE76_CONTROL_PACKAGE: pathToFileURL(wrapper).href })
const result = spawnSync(process.execPath, ['--test', 'tests/phase76-control.test.mjs'], { env, cwd: root, windowsHide: true, timeout: 30000, encoding: 'utf8' })
const log = result.stdout + result.stderr; await writeFile('evidence/phase76-closed-control.log', log)
assert.equal(result.status, 0, log)
console.log(JSON.stringify({ closedControlPassed: true, world, liveOperations: 0 }))
