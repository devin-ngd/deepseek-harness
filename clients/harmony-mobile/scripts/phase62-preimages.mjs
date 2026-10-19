/** Preserve public source preimages before the alpha.4 adaptation; never reads credentials or device data. */
import { readFile, readdir, mkdir, writeFile, copyFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
const project = resolve(import.meta.dirname, '..')
const destination = 'D:/Temp/dsh-harmony-alpha4-adaptation-20261016'
await mkdir(destination, { recursive: true })
const files = []
async function visit(directory) {
  for (const entry of await readdir(join(project, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await visit(path)
    else if (/\.(?:ts|mjs|md|yml|json)$/.test(entry.name)) files.push(path)
  }
}
for (const directory of ['src', 'integration', 'desktop-plugin', 'scripts', 'network-tests']) await visit(directory)
files.push('projection-source.json', 'source.json', 'README.md', 'docs/acceptance.md', 'docs/tasks.md')
const records = []
for (const path of files) {
  const source = join(project, path), target = join(destination, 'preimages', path), bytes = await readFile(source)
  await mkdir(resolve(target, '..'), { recursive: true })
  await copyFile(source, target, constants.COPYFILE_EXCL)
  records.push({ path: relative(project, source).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
}
await writeFile(join(destination, 'manifest.json'), JSON.stringify({ schema: 'harmony-alpha4-preimages/1', createdAt: new Date().toISOString(), sourceCommit: '9053da6635c9f3e179e20fe7a2e23015b6f581fd', files: records }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ destination, files: records.length }))
