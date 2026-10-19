/** Verify the lifetime-cleanup successor with isolated fixed replay, recovery and strict source programs; no real field activation. */
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const env = Object.fromEntries(['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'windir', 'ComSpec'].filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1' })
const checks = [['detached', 'scripts/phase66-detached-profile-test.mjs', '--candidate', '.build/field-interaction-alpha4-candidate'], ['restart', 'scripts/phase66-restart-test.mjs', '--candidate', '.build/field-interaction-alpha4-candidate'], ['strict', 'scripts/phase66-profile-typecheck.mjs']]
const results = await Promise.all(checks.map(async ([name, ...args]) => {
  const child = spawn(process.execPath, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString(); if (log.length > 4194304) child.kill() })
  const result = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => accept({ name, code, signal })) })
  await writeFile('.build/phase66-lifetime-' + name + '.log', log)
  return result
}))
const strict = JSON.parse(await readFile('evidence/phase66-profile-typecheck.json', 'utf8'))
await writeFile('evidence/phase66-lifetime-runtime-checks.json', JSON.stringify({ at: new Date().toISOString(), results, strict, realModels: 0, realGrantCreated: false }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(results))
assert.ok(results.every(result => result.code === 0 && result.signal === null))
