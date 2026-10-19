/** Prepare and initialize only the already approved remote public-state directory, once, with a local TTY confirmation. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
const lifetime = JSON.parse(await readFile('D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/fixed-world/exchange/run-4crf2L/grant-lifetime.json', 'utf8'))
assert.ok(process.stdin.isTTY); assert.equal(lifetime.grantTtlMs, 1800000); assert.ok(lifetime.expiresAt > Date.now())
const directory = '/home/devin/harmony-relay/field-20261015-phase54-lEUAMM'
const command = 'cd ' + directory + ' && node public-tools/prepare-public-config.mjs --config public-tools/config.first-use.proposal.json --pair relay-pair.json --state ' + directory + '/public-state/replay-v1.jsonl --output config.enabled.json --limits public-tools/relay-endpoint-timers.json && exec node public-tools/initialize-public-trust.mjs --config config.enabled.json --pair relay-pair.json --limits public-tools/relay-endpoint-timers.json'
await writeFile('evidence/phase67-relay-initialize-attempt.json', JSON.stringify({ at: new Date().toISOString(), remoteDirectory: directory, expiresAt: lifetime.expiresAt, originalPublicToolsOnly: true, exclusiveCreation: true, unknownUntilObserved: true }, null, 2) + '\n', { flag: 'wx' })
const child = spawn('C:/Program Files/OpenSSH/ssh.exe', ['-tt', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'dhome', command], { windowsHide: true, stdio: 'inherit' })
const result = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => accept({ code, signal })) })
await writeFile('evidence/phase67-relay-initialize-result.json', JSON.stringify({ at: new Date().toISOString(), ...result, privateMaterialUploaded: false, serviceStarted: false, grantExtended: false }, null, 2) + '\n', { flag: 'wx' })
process.exitCode = result.code ?? 1
