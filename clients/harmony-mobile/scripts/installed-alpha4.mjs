/** Read-only resolver for the installed alpha.4 Host's public modules; no application, profile or credential is opened. */
import { createRequire, builtinModules } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, posix, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

/** @param root - dependency locator for the existing archive and export-resolution tools. @returns immutable installed metadata and an esbuild resolver that refuses workspace DSH substitutions. */
export async function installedAlpha4(root) {
  const require = createRequire(join(root, 'package.json'))
  const asar = require(join(root, 'node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar'))
  const { resolve: resolveExports } = require(join(root, 'node_modules/.pnpm/resolve.exports@2.0.3/node_modules/resolve.exports'))
  const archive = 'C:/Users/wpdev/AppData/Local/Programs/DeepSeek Harness/resources/app.asar'
  const files = new Set(asar.listPackage(archive).map(path => path.replaceAll('\\', '/').replace(/^\//, '')))
  const extract = path => asar.extractFile(archive, path.replaceAll('/', '\\'))
  const retainedFiles = new Map(), publicRoot = resolve('.build/alpha4-public-runtime')
  const json = path => { const bytes = extract(path); retainedFiles.set(path, bytes); return JSON.parse(bytes.toString('utf8')) }, hash = bytes => createHash('sha256').update(bytes).digest('hex')
  const descriptor = json('dsh/desktop-runtime.json')
  if (descriptor.release.version !== '0.2.1-alpha.4' || descriptor.release.hostProtocolVersion !== 4) throw new Error('The selected installed Host must be alpha.4 / protocol4')
  const richRoot = 'C:/Users/wpdev/.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-experimental-rich-inline'
  const rich = JSON.parse(await readFile(join(richRoot, 'package.json'), 'utf8'))
  if (rich.version !== '0.2.1-alpha.4') throw new Error('Installed rich-inline must be alpha.4')
  const inputs = new Map(), builtins = new Set([...builtinModules, ...builtinModules.map(name => 'node:' + name)])
  const selected = new Map(descriptor.sharedPackages.map(row => [row.name, row]))
  let koffiReady
  const nativeKoffi = () => koffiReady ??= (async () => {
    const prefix = 'dsh/node_modules/koffi/', binary = 'dsh/node_modules/@koromix/koffi-win32-x64/'
    for (const path of files) if ((path.startsWith(prefix) || path.startsWith(binary)) && typeof asar.statFile(archive, path.replaceAll('/', '\\')).size === 'number') {
      const bytes = extract(path), output = join(publicRoot, path); await mkdir(dirname(output), { recursive: true }); await writeFile(output, bytes)
      inputs.set(path, { path, bytes: bytes.length, sha256: hash(bytes) })
    }
    return join(publicRoot, prefix, 'index.js')
  })()
  const fileAt = path => { for (const candidate of [path, path + '.js', path + '.mjs', path + '.cjs', path + '.json', path + '/index.js']) if (files.has(candidate) && typeof asar.statFile(archive, candidate.replaceAll('/', '\\')).size === 'number') return candidate; throw new Error('Installed public module missing: ' + path) }
  const packageEntry = (manifest, sub, kind) => {
    if (manifest.exports !== undefined) { const targets = resolveExports(manifest, sub === '' ? '.' : './' + sub, { require: kind === 'require-call', conditions: ['node'] }); if (targets?.length) return targets[0]; throw new Error('Installed export missing: ' + manifest.name + '/' + sub) }
    return sub === '' ? manifest.module ?? manifest.main ?? 'index.js' : sub
  }
  const plugin = { name: 'installed-alpha4-public-api', setup(build) {
    build.onResolve({ filter: /.*/ }, async args => {
      if (args.pluginData?.skipInstalled) return undefined
      if (builtins.has(args.path)) return { path: args.path, external: true }
      if (args.path === 'electron') throw new Error('A Node plugin cannot require the Electron bridge')
      if (args.namespace !== 'installed-asar' && !args.path.startsWith('@deepseek-ai/') && args.importer.replaceAll('\\', '/').startsWith('C:/Users/wpdev/.dsh/profiles/desktop/node_modules/')) return undefined
      if (args.path.startsWith('.') && args.namespace === 'installed-asar') {
        const path = fileAt(posix.normalize(posix.join(posix.dirname(args.importer), args.path)))
        if (path.endsWith('.node')) { const actual = join(archive + '.unpacked', path); if (!existsSync(actual)) throw new Error('Installed native addon missing'); return { path: actual, external: true } }
        return { path, namespace: 'installed-asar' }
      }
      if (args.path.startsWith('.') || args.path.startsWith('/') || /^[A-Za-z]:/.test(args.path)) return undefined
      const segments = args.path.split('/'), name = args.path.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0], sub = segments.slice(name.startsWith('@') ? 2 : 1).join('/')
      if (name === 'koffi') { const path = await nativeKoffi(); return { path: args.kind === 'require-call' ? path : pathToFileURL(path).href, external: true } }
      if (name === rich.name) return { path: join(richRoot, packageEntry(rich, sub, args.kind)) }
      let directory = selected.has(name) ? 'dsh/' + selected.get(name).path : undefined
      if (directory === undefined && args.namespace === 'installed-asar') {
        for (let cursor = posix.dirname(args.importer); cursor !== '.' && cursor !== '/'; cursor = posix.dirname(cursor)) { const candidate = posix.join(cursor, 'node_modules', name); if (files.has(candidate + '/package.json')) { directory = candidate; break } }
      }
      if (directory === undefined && files.has('dsh/node_modules/' + name + '/package.json')) directory = 'dsh/node_modules/' + name
      if (directory === undefined) {
        if (name.startsWith('@deepseek-ai/')) throw new Error('Installed runtime does not provide: ' + name)
        if (['bufferutil', 'utf-8-validate'].includes(name)) return { path: name, external: true }
        throw new Error('Installed third-party dependency missing: ' + args.path)
      }
      const manifest = json(directory + '/package.json')
      return { path: fileAt(posix.join(directory, packageEntry(manifest, sub, args.kind))), namespace: 'installed-asar' }
    })
    build.onLoad({ filter: /.*/, namespace: 'installed-asar' }, args => {
      const bytes = extract(args.path); inputs.set(args.path, { path: args.path, bytes: bytes.length, sha256: hash(bytes) })
      retainedFiles.set(args.path, bytes)
      const filename = join(publicRoot, args.path)
      const contents = args.path.endsWith('.json') ? bytes : bytes.toString('utf8').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href)).replaceAll('import.meta.dirname', JSON.stringify(dirname(filename)))
      return { contents, loader: args.path.endsWith('.json') ? 'json' : 'js' }
    })
    build.onEnd(async () => { for (const [path, bytes] of retainedFiles) { const output = join(publicRoot, path); await mkdir(dirname(output), { recursive: true }); await writeFile(output, bytes) } })
  } }
  return { plugin, descriptor, rich, inputs, archive, publicRoot, descriptorSha256: hash(extract('dsh/desktop-runtime.json')) }
}
