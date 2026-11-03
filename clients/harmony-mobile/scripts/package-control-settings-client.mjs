/** Prepare qualified Client files for a coordinated plugin update; never installs or activates them. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { installedRc2 } from './installed-rc2.mjs'

const reportPath = process.argv[2]
if (process.argv.length !== 3 || !/^evidence\/control-panel-[a-z0-9.-]+\.json$/.test(reportPath)) throw new Error('Select one local passing Client qualification report')
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const require = createRequire(join(root, 'package.json'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const tests = JSON.parse(await readFile(reportPath, 'utf8'))
assert.equal(tests.passed, true)
assert.equal(tests.tests.failed, 0)
assert.equal(tests.qualification.typeDiagnostics, 0)
const qualification = tests.qualification
for (const input of qualification.sourceInputs) assert.equal(hash(await readFile(input.path)), input.sha256, 'Changed Client input: ' + input.path)
for (const file of qualification.files) assert.equal(hash(await readFile(join(qualification.stage, file.path))), file.sha256, 'Changed qualified output: ' + file.path)
const manifest = JSON.parse(await readFile('desktop-plugin/package.json', 'utf8'))
const installed = await installedRc2(root)
const peers = []
for (const [name, range] of Object.entries(manifest.peerDependencies)) {
  const version = name === installed.rich.name ? installed.rich.version : installed.descriptor.sharedPackages.find(row => row.name === name)?.version
  assert.ok(version, 'Installed Host lacks peer: ' + name)
  assert.equal(require('semver').satisfies(version, range), true, 'Incompatible installed peer: ' + name)
  peers.push({ name, version, range })
}
const asar = require(join(root, 'node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar'))
const settings = installed.descriptor.sharedPackages.find(row => row.name === '@deepseek-ai/dsh-client-ui-settings-plugins')
assert.ok(settings, 'Installed Host lacks Plugins settings')
const settingsBytes = asar.extractFile(installed.archive, join('dsh', settings.path, 'lib/client.js'))
assert.ok(settingsBytes.includes(Buffer.from('settings.plugins.tab')), 'Installed Plugins page lacks the tab registration')
const webEntry = asar.listPackage(installed.archive).map(path => path.replaceAll('\\', '/').replace(/^\//, '')).find(path => /^dsh\/node_modules\/@deepseek-ai\/dsh-web-frontend\/dist\/assets\/index-[^/]+\.js$/.test(path))
assert.ok(webEntry, 'Installed Host lacks the Web frontend entry')
const webBytes = asar.extractFile(installed.archive, webEntry.replaceAll('/', '\\'))
assert.ok(webBytes.includes(Buffer.from('@deepseek-ai/dsh-client-ui-primitives')) && webBytes.includes(Buffer.from('closeTopModal')), 'Installed Web frontend lacks the modal close helper')
await mkdir('.build/artifacts', { recursive: true })
const output = await mkdtemp(resolve('.build/artifacts/phone-controls-settings-client-'))
await cp(join(qualification.stage, 'lib'), join(output, 'lib'), { recursive: true })
const record = { clientOnly: true, installableBundle: false, installed: false, sourceVersion: manifest.version, clientManifest: manifest.dsh.client, sourceInputs: qualification.sourceInputs, files: qualification.files.filter(file => file.path.startsWith('lib/')), qualification: reportPath, compatibility: { host: installed.descriptor.release, descriptorSha256: installed.descriptorSha256, pluginsTabPresent: true, pluginsClientSha256: hash(settingsBytes), modalCloseHelperPresent: true, webEntry, webSha256: hash(webBytes), peers } }
await writeFile(join(output, 'CLIENT-MANIFEST.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
await writeFile(join(output, 'README.txt'), 'Qualified Harmony phone controls Client files.\nEntry: Settings -> Built-in plugins -> Phone connection.\nThis directory is not an installable plugin bundle. Integrate its lib/ files and clientManifest into the coordinated successor plugin package, preserving the installed Host and existing device configuration.\nNo installation, activation, desktop restart, pairing or relay change was performed.\n', { flag: 'wx' })
console.log(JSON.stringify({ output, clientOnly: true, installableBundle: false, hostVersion: installed.descriptor.release.version, peers: peers.length, pluginsTabPresent: true }))
