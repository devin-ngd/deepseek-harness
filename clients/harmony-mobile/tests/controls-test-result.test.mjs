import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { controlsTestResult } from '../scripts/controls-test-result.mjs'

const exited = { code: 0, signal: null, timedOut: false, spawnError: null }
async function report(value) {
  const directory = await mkdtemp(new URL('../.build/controls-result-', import.meta.url)), path = join(directory, 'report.json')
  if (value !== undefined) await writeFile(path, value)
  return path
}
test('startup failure without a reporter stays a failed result with its original exit', async () => {
  assert.deepEqual(await controlsTestResult({ ...exited, code: 1 }, await report()), { ...exited, code: 1, passed: 0, failed: 0, reportState: 'missing', success: false })
})
test('malformed, incomplete and empty reports never qualify a candidate', async () => {
  for (const text of ['{', '{}', JSON.stringify({ success: true, numPassedTests: 0, numFailedTests: 0 })]) assert.equal((await controlsTestResult(exited, await report(text))).success, false)
})
test('timeout, signal, spawn failure and nonzero exit independently reject even a passing report', async () => {
  const path = await report(JSON.stringify({ success: true, numPassedTests: 5, numFailedTests: 0 }))
  assert.equal((await controlsTestResult(exited, path)).success, true)
  for (const changed of [{ timedOut: true }, { signal: 'SIGTERM' }, { spawnError: 'ENOENT' }, { code: 1 }]) assert.equal((await controlsTestResult({ ...exited, ...changed }, path)).success, false)
})
