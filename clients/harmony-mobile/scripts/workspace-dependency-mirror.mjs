/** Loopback npm metadata from existing runtime/workspace libraries; never forwards registry traffic or serves source SDK packages. */
import assert from 'node:assert/strict'
import { readFile, mkdir, copyFile, readdir, realpath } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, dirname, relative, isAbsolute } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/**
 * @param runtime - verified copied runtime directory.
 * @param world - private installation test directory.
 * @param options - `storeVersions`: exact `name@version` pins served from the workspace pnpm store for packages that the copied runtime also contains at another version.
 * @returns local endpoint, source inventories, requests and awaited shutdown.
 */
export async function createWorkspaceDependencyMirror(runtime, world, options = {}) {
  const requestedStoreVersions = new Map()
  for (const pin of options.storeVersions ?? []) {
    const at = pin.lastIndexOf('@'); assert.ok(at > 0, pin)
    const name = pin.slice(0, at); requestedStoreVersions.set(name, [...requestedStoreVersions.get(name) ?? [], pin.slice(at + 1)])
  }
  const descriptor = JSON.parse(await readFile(join(runtime, 'desktop-runtime.json'), 'utf8'))
  const sourceRoot = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
  const workspaceRequire = createRequire(join(sourceRoot, 'packages/experimental/rich-inline/package.json'))
  const hoistedRequire = createRequire(join(sourceRoot, 'node_modules/.pnpm/mirror-resolution.json'))
  const entries = [], pending = new Map(), requests = [], errors = [], tar = promisify(execFile)
  const pnpmStore = join(sourceRoot, 'node_modules/.pnpm')
  let storeDirectories
  async function collect(inventory, directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const local = prefix + entry.name, path = join(directory, entry.name)
      if (entry.isDirectory()) await collect(inventory, path, local + '/')
      else if (entry.isFile()) { const bytes = await readFile(path); inventory.push({ path: local, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }) }
    }
  }
  /** Every installed version of a workspace dependency, so pnpm can honor ranges that differ between dependents (for example escape-string-regexp 4 and 5). */
  async function storeVersions(name) {
    storeDirectories ??= await readdir(pnpmStore)
    const prefix = name.replace('/', '+') + '@', found = new Map()
    for (const directory of storeDirectories) {
      if (!directory.startsWith(prefix)) continue
      const version = directory.slice(prefix.length).split(/[_(]/)[0]
      if (found.has(version) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) continue
      const sourceDir = join(pnpmStore, directory, 'node_modules', name)
      let manifest
      try { manifest = JSON.parse(await readFile(join(sourceDir, 'package.json'), 'utf8')) }
      catch (error) { if (error.code === 'ENOENT') continue; throw error }
      if (manifest.name === name && manifest.version === version) found.set(version, await realpath(sourceDir))
    }
    return found
  }
  async function resolveWorkspaceDirectory(name) {
    let entry
    for (const require of [workspaceRequire, hoistedRequire]) {
      try { entry = require.resolve(name + '/package.json'); break }
      catch (error) { if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' && error.code !== 'MODULE_NOT_FOUND') throw error }
      try { entry = require.resolve(name); break }
      catch (error) { if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' && error.code !== 'MODULE_NOT_FOUND') throw error }
    }
    if (entry === undefined) return undefined
    let sourceDir = dirname(entry)
    for (;;) {
      try { if (JSON.parse(await readFile(join(sourceDir, 'package.json'), 'utf8')).name === name) return await realpath(sourceDir) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      const parent = dirname(sourceDir); if (parent === sourceDir) return undefined; sourceDir = parent
    }
  }
  async function stage(name, origin, sourceDir, inventory, prefix) {
    const manifestBytes = await readFile(origin === 'copied-runtime' ? join(runtime, prefix, 'package.json') : join(sourceDir, 'package.json'))
    const version = JSON.parse(manifestBytes).version, token = Buffer.from(name + '@' + version).toString('base64url')
    const directory = join(world, 'mirror', token), packageDir = join(directory, 'package')
    for (const file of inventory) {
      const local = origin === 'copied-runtime' ? file.path.slice(prefix.length) : file.path
      assert.ok(local && !local.split('/').includes('..'))
      const source = origin === 'copied-runtime' ? join(runtime, file.path) : join(sourceDir, local), bytes = await readFile(source)
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path)
      await mkdir(dirname(join(packageDir, local)), { recursive: true }); await copyFile(source, join(packageDir, local))
    }
    const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')); assert.equal(manifest.name, name)
    const archive = join(directory, 'package.tgz')
    await tar(join(process.env.SystemRoot, 'System32/tar.exe'), ['-czf', archive, '-C', directory, 'package'], { windowsHide: true, timeout: 30000 })
    const bytes = await readFile(archive)
    const entry = { name, version: manifest.version, origin, sourceDir, manifest, archive, inventory, bytes, token, sha256: createHash('sha256').update(bytes).digest('hex'), integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') }
    entries.push(entry); return entry
  }
  /** @returns every version served for `name`; a copied-runtime package serves the installed application's version plus only the store versions named in `options.storeVersions`. */
  async function prepare(name) {
    const prefix = 'node_modules/' + name + '/', inventory = descriptor.files.filter(file => file.path.startsWith(prefix))
    if (inventory.length > 0) {
      const staged = [await stage(name, 'copied-runtime', join(runtime, prefix), inventory, prefix)]
      for (const version of requestedStoreVersions.get(name) ?? []) {
        if (version === staged[0].version) continue
        const sourceDir = (await storeVersions(name)).get(version); assert.ok(sourceDir, 'Requested workspace store version is not installed: ' + name + '@' + version)
        const files = []; await collect(files, sourceDir)
        staged.push(await stage(name, 'workspace-dependency', sourceDir, files, ''))
      }
      return staged
    }
    if (name.startsWith('@deepseek-ai/') || name === 'pnpm') return []
    const directories = [...(await storeVersions(name)).values()]
    if (directories.length === 0) { const resolved = await resolveWorkspaceDirectory(name); if (resolved !== undefined) directories.push(resolved) }
    const staged = []
    for (const sourceDir of directories) {
      const local = relative(sourceRoot, sourceDir); assert.ok(local && !local.startsWith('..') && !isAbsolute(local))
      const files = []; await collect(files, sourceDir)
      staged.push(await stage(name, 'workspace-dependency', sourceDir, files, ''))
    }
    return staged
  }
  const compareVersions = (left, right) => {
    const [a, b] = [left, right].map(version => version.split('-')[0].split('.').map(Number))
    for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] - b[index]
    return Number(!left.includes('-')) - Number(!right.includes('-'))
  }
  let endpoint
  const server = createServer(async (request, response) => {
    try {
      assert.ok(requests.length < 1024, 'Local dependency mirror request budget exceeded')
      const path = decodeURIComponent(new URL(request.url, endpoint).pathname)
      const observation = { method: request.method, path, status: null }; requests.push(observation)
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return }
      const archive = path.startsWith('/tarballs/')
      let served = []
      if (archive) served = entries.filter(entry => path === '/tarballs/' + entry.token + '.tgz')
      else {
        const name = path.slice(1)
        if (/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/.test(name) && name !== 'not-a-package' && name !== 'pnpm') {
          if (!pending.has(name)) pending.set(name, prepare(name))
          served = await pending.get(name)
        }
      }
      if (served.length === 0) { observation.status = 404; response.writeHead(404); response.end(); return }
      const latest = [...served].sort((left, right) => compareVersions(left.version, right.version)).pop()
      const body = archive ? served[0].bytes : Buffer.from(JSON.stringify({ name: latest.name, 'dist-tags': { latest: latest.version }, versions: Object.fromEntries(served.map(entry => [entry.version,
        { ...entry.manifest, dist: { tarball: endpoint + '/tarballs/' + entry.token + '.tgz', integrity: entry.integrity } }])) }))
      observation.status = 200; response.writeHead(200, { 'content-type': archive ? 'application/octet-stream' : 'application/json', 'content-length': body.length })
      response.end(request.method === 'HEAD' ? undefined : body)
    } catch (error) { errors.push(String(error)); response.writeHead(500); response.end() }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address(); assert.ok(address && typeof address !== 'string'); endpoint = 'http://127.0.0.1:' + address.port
  const close = () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections() })
  try {
    assert.equal((await fetch(endpoint + '/not-a-package')).status, 404)
    return { endpoint, requests, errors, rejectedUnknownPackage: true, get packages() { return entries.map(({ bytes, manifest, ...entry }) => entry) }, close }
  } catch (error) { await close(); throw error }
}
