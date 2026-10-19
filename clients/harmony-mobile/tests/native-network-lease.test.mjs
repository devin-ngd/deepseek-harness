/** Lease admission refuses before invoking any official device command; activation/cleanup still require emulator evidence. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const execute = promisify(execFile)
const script = fileURLToPath(new URL('../scripts/native-network-lease.mjs', import.meta.url))
const env = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: 'D:/Temp', TMP: 'D:/Temp' }

test('native forward owner refuses missing approval or a directory outside the exact task namespace', async () => {
  for (const [world, extra] of [['D:/Temp/dsh-harmony-phase13-unactivated', {}], ['D:/Temp/unrelated', { DSH_HARMONY_NATIVE_ACCEPTANCE: 'approved-phase13' }]]) {
    await assert.rejects(execute(process.execPath, [script, world], { env: { ...env, ...extra }, windowsHide: true }), error => error.code === 1 && error.stderr.includes('Approved task-owned phase13 world required'))
  }
})

test('native forward owner refuses a marker that does not establish task-owned emulator startup', async () => {
  const world = await mkdtemp('D:/Temp/dsh-harmony-phase13-lease-guard-')
  const marker = world + '/emulator-owner.json'
  try {
    await writeFile(marker, JSON.stringify({ instance: 'DSHOfflineAPI26', target: '127.0.0.1:16311', emulatorStartedByTask: false }) + '\n')
    await assert.rejects(execute(process.execPath, [script, world], { env: { ...env, DSH_HARMONY_NATIVE_ACCEPTANCE: 'approved-phase13' }, windowsHide: true }), error => error.code === 1 && error.stderr.includes('Task-owned running emulator required'))
  } finally { await unlink(marker); await rmdir(world) }
})

test('second native forward owner refuses any existing lease before a device command can reset the clock', async () => {
  const world = await mkdtemp('D:/Temp/dsh-harmony-phase16-native-no-reset-'), lease = world + '/forward-lease.json'
  try {
    await writeFile(lease, '{"startedAt":"2026-10-12T03:09:52.909Z"}\n')
    await assert.rejects(execute(process.execPath, [script, world], { env: { ...env, DSH_HARMONY_NATIVE_ACCEPTANCE: 'approved-phase16' }, windowsHide: true }), error => error.code === 1 && error.stderr.includes('Existing forwarding lease must not reset its original window'))
  } finally { await unlink(lease); await rmdir(world) }
})
