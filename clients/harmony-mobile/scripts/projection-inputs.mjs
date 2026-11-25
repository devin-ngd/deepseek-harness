/** Materialize retained interpreters with compatible shared sources under the lab. */
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
    const retained = await readFile(resolve(spec.checkout, file))
    const expected = name === 'types.ts'
      ? retained.toString('utf8').replace(
        "import type { MessageId } from '@deepseek-ai/dsh-llm/brand'",
        "import type { MessageId } from '@deepseek-ai/dsh-llm/types'",
      )
      : retained
    const currentHash = hash(await readFile(resolve(root, file)))
    // RC4 adds RichClientConfig and its type-only imports to the retained declarations.
    if (name === 'types.ts' && hash(expected) === '3606778e7895461faaa80c396003803e6c86b3ac171c0600ab69a26ac8628678'
      && currentHash === '073567ba238b17e8d6cd935b43e6f3173d6363834cfab585b27e6ba01412426b') continue
    assert.equal(hash(expected), currentHash, 'Retained projection dependency differs: ' + file)
  }
  const inputs = await Promise.all([
    ...interpreters.map(name => ({ path: 'shared/' + name, source: resolve(spec.checkout, rich, 'shared', name) })),
    ...[...shared, 'theme.ts'].map(name => ({ path: 'shared/' + name, source: resolve(root, rich, 'shared', name) })),
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
