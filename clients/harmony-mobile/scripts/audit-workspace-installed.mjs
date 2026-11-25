/** Approved read-only public installed metadata audit; no user config, credential, account, Session or app process is opened. */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json'))
const asar = require(join(root, 'node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar'))
const archive = 'C:/Users/wpdev/AppData/Local/Programs/DeepSeek Harness/resources/app.asar'
const bytes = asar.extractFile(archive, 'dsh\\desktop-runtime.json'), runtime = JSON.parse(bytes.toString('utf8'))
const shell = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'))
const packages = []
for (const name of ['@deepseek-ai/dsh-rich-inline', 'dsh-devflow', '@deepseek-ai/dsh-experimental-harmony-mobile']) {
  const path = join('C:/Users/wpdev/.dsh/profiles/desktop/node_modules', name, 'package.json')
  try { const value = JSON.parse(await readFile(path, 'utf8')); packages.push({ name: value.name, version: value.version, engines: value.engines, path }) }
  catch (error) { if (error.code !== 'ENOENT') throw error; packages.push({ name, missingAtExpectedPublicPath: true }) }
}
const result = { at: new Date().toISOString(), authorization: '批准安装环境核对与隔离模拟器验收',
  archive, desktopVersion: shell.version, release: runtime.release, runtimeFields: Object.keys(runtime),
  runtimeSha256: createHash('sha256').update(bytes).digest('hex'), sharedPackages: runtime.sharedPackages, packages,
  appStarted: false, userProfileConfigRead: false, credentialRead: false, changedInstalledFiles: false }
const path = 'evidence/workspace-installed-audit-' + Date.now() + '.json'
await writeFile(path, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ path, desktopVersion: result.desktopVersion, release: result.release, runtimeFields: result.runtimeFields, sharedPackages: result.sharedPackages.length,
  files: runtime.files.length, totalBytes: runtime.files.reduce((sum, item) => sum + item.bytes, 0), firstFiles: runtime.files.slice(0, 3), cli: runtime.files.filter(row => row.path.endsWith('/dsh/lib/bin.js')).map(row => row.path), packages }))
