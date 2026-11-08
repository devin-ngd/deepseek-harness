/** Copy only integrity-declared public installed runtime files into a fresh test directory; never change the installation or profile. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'

const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json'))
const asar = require(join(root, 'node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar'))
const archive = 'C:/Users/wpdev/AppData/Local/Programs/DeepSeek Harness/resources/app.asar'
const descriptorBytes = asar.extractFile(archive, 'dsh\\desktop-runtime.json'), descriptor = JSON.parse(descriptorBytes.toString('utf8'))
assert.equal(descriptor.release.version, '0.2.1-rc.2'); assert.equal(descriptor.release.hostProtocolVersion, 4)
const world = await mkdtemp(resolve('.build/workspace-installed-')), runtime = join(world, 'runtime'); await mkdir(runtime)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
let copied = 0
for (const row of descriptor.files) {
  assert.ok(!row.path.includes('\\') && !row.path.includes(':') && !row.path.startsWith('/') && !row.path.split('/').includes('..'))
  const bytes = asar.extractFile(archive, ('dsh/' + row.path).replaceAll('/', '\\'))
  assert.equal(bytes.byteLength, row.bytes); assert.equal(sha(bytes), row.sha256, row.path)
  const output = join(runtime, row.path); await mkdir(dirname(output), { recursive: true }); await writeFile(output, bytes, { flag: 'wx' })
  if (++copied % 2000 === 0) console.log(JSON.stringify({ copied, total: descriptor.files.length }))
}
await writeFile(join(runtime, 'desktop-runtime.json'), descriptorBytes, { flag: 'wx' })
const result = { at: new Date().toISOString(), world, runtime, release: descriptor.release, copied,
  descriptorSha256: sha(descriptorBytes), copiedFilesVerified: true, installationChanged: false, userProfileRead: false, credentialsRead: false }
await writeFile(join(world, 'copy.json'), JSON.stringify(result, null, 2) + '\n')
await writeFile('evidence/workspace-installed-runtime.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result))
