/** Built readers and the public subpath must share interpreter registration and disposal. */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const catalogBundle = fileURLToPath(new URL('../lib/index.js', import.meta.url))
const execFileAsync = promisify(execFile)
const probe = String.raw`
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const load = relative => import(pathToFileURL(resolve(relative)).href);
const { sessionFormatCatalog } = await load('packages/session/session-format-catalog/lib/index.js');
const { registerCurrentSessionMessageProjection } =
  await load('packages/session/session-format-catalog/lib/types/message-projections.js');
const { SESSION_FORMAT_VERSION } = await load('packages/core/session/lib/index.js');
const type = 'rich-inline/source-offload';
const restore = () => {
  const reader = sessionFormatCatalog.createRestore({ type: 'session', id: 'built-registry',
    version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false, delegationDepth: 0 },
    { recovery: 'strict', validation: 'current' });
  reader.decodeRow({ type, seq: 0, time: 1, data: { targets: [] } });
  return reader.finish();
};
assert.throws(restore, /requires a message projection/);
const dispose = registerCurrentSessionMessageProjection({ type, project: () => new Map() });
try {
  assert.doesNotThrow(restore);
} finally {
  dispose();
}
assert.throws(restore, /requires a message projection/);
console.log('shared registration and disposal');
`

describe.skipIf(!existsSync(catalogBundle))('built Session catalog interpreters', () => {
  it('shares the published registry with the bundled current-format reader', async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, ['--input-type=module', '-e', probe], {
      cwd: repoRoot,
      timeout: 60_000,
    })
    expect(stderr).toBe('')
    expect(stdout.trim()).toBe('shared registration and disposal')
  })
})
