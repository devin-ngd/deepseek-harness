/** Unpack an already sealed local candidate for the offline fixture; dependency junctions are not part of the package. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, readdir, mkdir, realpath, symlink } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'

/** @param name - one of the locally sealed self-owned plugins. @param world - test-owned output. @param root - trusted workspace dependency root. @returns extracted ordinary package and archive identity. */
export async function unpackWorkspaceReview(name, world, root) {
  assert.ok(['harmony-mobile', 'rich-inline', 'devflow'].includes(name))
  const pointer = JSON.parse(await readFile('evidence/workspace-review-bundle.json', 'utf8'))
  const manifest = JSON.parse(await readFile(join(pointer.destination, 'manifest.json'), 'utf8'))
  const entry = manifest.artifacts.find(item => item.file.startsWith(name + '-') && item.file.endsWith('.tgz')); assert.ok(entry)
  const path = join(pointer.destination, entry.file), archive = await readFile(path)
  assert.equal(createHash('sha256').update(archive).digest('hex'), entry.sha256)
  const tar = join(process.env.SystemRoot, 'System32/tar.exe'), run = promisify(execFile)
  const listed = (await run(tar, ['-tzf', path], { windowsHide: true })).stdout.split(/\r?\n/).filter(Boolean)
  assert.ok(listed.every(file => file === 'package/' || file.startsWith('package/') && !file.split('/').includes('..')))
  const output = join(world, 'archive-' + name); await mkdir(output)
  await run(tar, ['-xzf', path, '-C', output], { windowsHide: true })
  const stage = join(output, 'package')
  for (const file of entry.inventory) assert.equal(createHash('sha256').update(await readFile(join(stage, file.path))).digest('hex'), file.sha256, file.path)
  const source = name === 'harmony-mobile' ? join(root, 'node_modules') : name === 'rich-inline' ? join(root, 'packages/experimental/rich-inline/node_modules') : resolve('.build/workspace-devflow-checkout/dsh-devflow/node_modules')
  for (const folder of await readdir(source)) {
    if (folder.startsWith('.')) continue
    const entries = folder.startsWith('@') ? (await readdir(join(source, folder))).map(child => folder + '/' + child) : [folder]
    for (const item of entries) { const link = join(stage, 'node_modules', item); await mkdir(dirname(link), { recursive: true }); await symlink(await realpath(join(source, item)), link, 'junction') }
  }
  return { stage, archive: path, sha256: entry.sha256, verifiedInventory: entry.inventory.length, dependencyLinks: 'test-only local dependencies' }
}
