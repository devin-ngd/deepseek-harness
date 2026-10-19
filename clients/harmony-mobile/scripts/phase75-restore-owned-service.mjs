/** Restore only the approved temporary relay maintenance using its byte-read correction; the original sealed operator remains unchanged. */
import assert from 'node:assert/strict'
import { readFile, writeFile, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { spawnSync } from 'node:child_process'
import { PLAN, hash, reviewApprovalRecord, reviewDesktop } from '../.build/phase75.1-complete-operation-plan/policy.mjs'
import { verifyPackage } from '../.build/phase75.1-complete-operation-plan/cli.mjs'
import { desktopState } from '../.build/phase75.1-complete-operation-plan/local.mjs'
assert.equal(process.platform, 'win32'); assert.ok(process.stdin.isTTY && process.stdout.isTTY)
const sealed = resolve('.build/phase75.1-complete-operation-plan'), approved = JSON.parse(await readFile('evidence/phase75.1-execution-approval.json', 'utf8')), verified = await verifyPackage()
reviewApprovalRecord(approved, verified.planSha256, verified.manifestSha256)
assert.equal(approved.sourceHumanMessageId, 'Sentinel_89e6422f7b5c8191a26ce3f3bee61489')
const state = await desktopState(JSON.parse(await readFile(join(sealed, 'location.json'), 'utf8')))
reviewDesktop(state, 8, Date.now())
try { await lstat(PLAN.local.world + '.field-owner.lock'); throw new Error('field still owned') } catch (error) { if (error.code !== 'ENOENT') throw error }
const old = await readFile(join(sealed, 'relay-runner.mjs')), runner = await readFile('.build/phase75.2-restore-only/relay-runner.mjs')
assert.equal(hash(runner), '17620a6a10ecff07c8e630a91f17fa44148c38c8005fd3d942344a440c4d9157')
const originalRemoteHash = hash(Buffer.concat([old, Buffer.from('\nif (process.argv[1] && import.meta.url === "file://" + process.argv[1]) await relayMain(process.argv[2])\n')]))
const terminal = createInterface({ input: process.stdin, output: process.stdout })
try { assert.equal(await terminal.question('Type RESTORE PHASE75 ORIGINAL SERVICE: '), 'RESTORE PHASE75 ORIGINAL SERVICE') } finally { terminal.close() }
const command = 'test "$(sha256sum ' + PLAN.relay.run + '/operator.mjs | cut -d " " -f1)" = ' + originalRemoteHash + ' && DSH_PHASE75_LIVE=' + approved.planSha256 + ' /usr/bin/node --input-type=module -'
const input = Buffer.concat([runner, Buffer.from('\ntry { console.log(JSON.stringify(await relayMain("restore"))); } catch(error) { console.log(JSON.stringify({restored:false,name:error.name,code:error.code??null})); process.exitCode=1; }\n')])
await writeFile(join(PLAN.local.run, 'corrected-restore-attempt.json'), JSON.stringify({ at: Date.now(), sourceHumanMessageId: approved.sourceHumanMessageId, scope: 'restore-original-relay-only', runnerSha256: hash(runner), originalRemoteHash, grantEpoch: 8, activeGrantCount: 0, result: 'unknown' }) + '\n', { flag: 'wx' })
const result = spawnSync('C:/Program Files/OpenSSH/ssh.exe', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', PLAN.relay.sshAlias, command], { input, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 1048576 })
const lines = result.stdout?.trim().split(/\r?\n/) ?? [], value = lines.length ? JSON.parse(lines.at(-1)) : null
const receipt = { at: Date.now(), exitCode: result.status, signal: result.signal, errorCode: result.error?.code ?? null, result: value, runnerSha256: hash(runner), originalOperatorRetained: true, scopeUnchanged: true }
await writeFile(join(PLAN.local.run, 'corrected-restore-result.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(receipt)); assert.equal(result.status, 0); assert.equal(value?.restored, true)
