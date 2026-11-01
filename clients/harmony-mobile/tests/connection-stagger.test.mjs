/** The source-only control fixture uses the supported tsx ESM launcher, outside the plain-JS unit program. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

test('real control source passes all stagger and expiry regressions', { timeout: 30000 }, async t => {
  const env = { ...process.env }
  // The child owns its own test runner, rather than a recursive registration in this runner.
  delete env.NODE_TEST_CONTEXT
  const { stdout, stderr } = await promisify(execFile)(process.execPath,
    ['--import', 'tsx/esm', '--test', '--test-reporter=tap', 'integration/connection-stagger.test.mjs'],
    { cwd: fileURLToPath(new URL('../', import.meta.url)), env, windowsHide: true, timeout: 20000, maxBuffer: 65536, signal: t.signal })
  assert.equal(stderr, '')
  for (const line of ['# tests 12', '# pass 12', '# fail 0', '# cancelled 0', '# skipped 0']) assert.ok(stdout.split(/\r?\n/).includes(line), line)
})
