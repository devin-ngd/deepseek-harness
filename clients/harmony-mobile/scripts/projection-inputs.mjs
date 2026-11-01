/** Materialize retained interpreters with byte-identical current shared sources under the lab. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, mkdtemp, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

const rich = 'packages/experimental/rich-inline/src'
const interpreters = ['message-projections.ts', 'source-projection.ts', 'tool-source-projection.ts']
const shared = ['types.ts', 'validate.ts', 'authored.ts', 'limits.ts', 'usage.ts']
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

/** @param project - lab directory. @param root - current read-only source root. @param spec - retained source locator. @returns verified generated input directory and original source hashes; changed interpreter dependencies refuse. */
export async function prepareProjectionInputs(project, root, spec) {
  assert.equal(spec.entry, rich + '/shared/message-projections.ts')
  for (const name of shared) {
    const file = rich + '/shared/' + name
    assert.equal(hash(await readFile(resolve(spec.checkout, file))), hash(await readFile(resolve(root, file))), 'Retained projection dependency differs from rc.2: ' + file)
  }
  const inputs = await Promise.all([
    ...interpreters.map(name => ({ path: 'shared/' + name, source: resolve(spec.checkout, rich, 'shared', name) })),
    ...shared.map(name => ({ path: 'shared/' + name, source: resolve(root, rich, 'shared', name) })),
    { path: 'client/guest-sdk.ts', source: resolve(root, rich, 'client/guest-sdk.ts') },
  ].map(async input => { const bytes = await readFile(input.source); return { ...input, bytes, sha256: hash(bytes) } }))
  const files = inputs.map(({ path, source, sha256 }) => ({ path, source, sha256 }))
  const manifest = JSON.stringify({ schema: 'mobile-projection-inputs/1', files }, null, 2) + '\n'
  const directory = join(project, '.build/projection-inputs-' + hash(manifest))
  const verify = async () => {
    for (const input of inputs) assert.equal(hash(await readFile(join(directory, input.path))), input.sha256, 'Generated projection input changed: ' + join(directory, input.path))
    assert.equal(await readFile(join(directory, 'manifest.json'), 'utf8'), manifest, 'Generated projection manifest changed')
  }
  try { await verify() }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    const buildRoot = resolve(project, '.build'); await mkdir(buildRoot, { recursive: true })
    const pending = await mkdtemp(join(buildRoot, 'projection-pending-'))
    try {
      for (const input of inputs) { const path = join(pending, input.path); await mkdir(dirname(path), { recursive: true }); await writeFile(path, input.bytes, { flag: 'wx' }) }
      await writeFile(join(pending, 'manifest.json'), manifest, { flag: 'wx' })
      try { await rename(pending, directory) }
      catch (error) { if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error }
      await verify()
    } finally {
      assert.ok(resolve(pending).startsWith(buildRoot + sep))
      await rm(pending, { recursive: true, force: true })
    }
  }
  return { directory, manifest: join(directory, 'manifest.json'), files }
}
