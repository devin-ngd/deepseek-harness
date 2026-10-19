/** Resolve the isolated source patch and already-installed digest library; no installs or mutations outside the lab. */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join, dirname } from 'node:path'
import assert from 'node:assert/strict'

/** @param root - read-only DSH source directory. @returns installed Gateway-owned WebSocket implementation and declarations; missing dependencies fail resolution. */
export function installedWebSocket(root) {
  const require = createRequire(join(root, 'packages/api/gateway/package.json'))
  return { types: join(dirname(require.resolve('@types/ws/package.json')), 'index.d.ts'), runtime: join(dirname(require.resolve('ws/package.json')), 'wrapper.mjs') }
}

/** @param project - client source directory. @param root - read-only DSH dependency locator. @returns explicit source-plane aliases for strict checks and browser bundles. */
export async function projectionPaths(project, root) {
  const spec = JSON.parse(await readFile(join(project, 'projection-source.json'), 'utf8'))
  assert.equal(spec.schema, 'mobile-projection-source/1'); assert.equal(spec.digestPackage, '@noble/hashes'); assert.equal(spec.digestVersion, '2.4.0')
  const entry = resolve(spec.checkout, spec.entry)
  await readFile(entry)
  const require = createRequire(join(root, 'package.json')), ts = require('typescript')
  const raw = ts.readConfigFile(join(root, 'tsconfig.base.json'), ts.sys.readFile)
  if (raw.error) throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, '\n'))
  const isolated = ts.readConfigFile(join(spec.checkout, 'tsconfig.base.json'), ts.sys.readFile)
  if (isolated.error) throw new Error(ts.flattenDiagnosticMessageText(isolated.error.messageText, '\n'))
  const sourcePaths = Object.fromEntries(Object.entries(isolated.config.compilerOptions.paths).map(([name, values]) => [name, values.map(value => resolve(spec.checkout, value))]))
  const primaryPaths = Object.fromEntries(Object.entries(raw.config.compilerOptions.paths).map(([name, values]) => [name, values.map(value => resolve(root, value))]))
  const paths = { ...sourcePaths, ...primaryPaths }
  const originalRich = resolve(root, 'packages/experimental/rich-inline')
  for (const [name, values] of Object.entries(paths)) {
    if (name.startsWith('@deepseek-ai/dsh-experimental-rich-inline')) paths[name] = values.map(value => value.replace(originalRich, resolve(spec.checkout, 'packages/experimental/rich-inline')))
  }
  assert.equal(typeof spec.registryEntry, 'string')
  paths['@deepseek-ai/dsh-typert-registry'] = [resolve(spec.checkout, spec.registryEntry)]
  const digest = createRequire(join(root, 'packages/experimental/webworker-runtime/package.json'))
  const sha = digest.resolve('@noble/hashes/sha2.js'), utils = digest.resolve('@noble/hashes/utils.js')
  const installed = JSON.parse(await readFile(resolve(sha, '../package.json'), 'utf8'))
  assert.equal(installed.version, spec.digestVersion)
  paths.ws = [installedWebSocket(root).types]
  const playwrightManifest = require.resolve('playwright/package.json', { paths: [join(root, 'node_modules/.pnpm')] })
  const playwright = JSON.parse(await readFile(playwrightManifest, 'utf8'))
  paths.playwright = [resolve(playwrightManifest, '..', playwright.exports['.'].types)]
  return { ...paths, zod: [join(dirname(require.resolve('zod')), 'index')], '@local/rich-source-host': [resolve(spec.checkout, 'packages/experimental/rich-inline/src/host/source.ts')], '@local/rich-tool-source-host': [resolve(spec.checkout, 'packages/experimental/rich-inline/src/host/tool-source.ts')], '@deepseek-ai/dsh-experimental-rich-inline/message-projections': [entry], '@noble/hashes/sha2.js': [sha.slice(0, -3)], '@noble/hashes/utils.js': [utils.slice(0, -3)] }
}
/** @param project - client directory. @param root - upstream dependency directory. @returns generated resolution facade; build tools record every consumed source hash. */
export async function projectionTsconfig(project, root) {
  const path = join(project, '.build/projection.tsconfig.json')
  const spec = JSON.parse(await readFile(join(project, 'projection-source.json'), 'utf8'))
  await mkdir(join(project, '.build'), { recursive: true })
  await writeFile(path, JSON.stringify({ extends: join(root, 'tsconfig.base.json'), compilerOptions: { paths: await projectionPaths(project, root) }, include: [resolve(root).replaceAll('\\', '/') + '/**/*', resolve(spec.checkout, 'packages/experimental/rich-inline/src').replaceAll('\\', '/') + '/**/*'] }, null, 2) + '\n')
  return path
}
/** @param project - client directory. @param root - DSH source root. @returns exact Vite aliases, including imports originating in the isolated checkout. */
export async function projectionAliases(project, root) {
  const paths = await projectionPaths(project, root)
  const require = createRequire(join(root, 'package.json')), manifest = require.resolve('playwright/package.json', { paths: [join(root, 'node_modules/.pnpm')] })
  const playwright = JSON.parse(await readFile(manifest, 'utf8'))
  return [...Object.entries(paths).filter(([name]) => !name.includes('*') && name !== 'ws' && name !== 'playwright').map(([name, values]) => ({ find: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), replacement: values[0].replaceAll('\\', '/') })), { find: /^ws$/, replacement: installedWebSocket(root).runtime.replaceAll('\\', '/') }, { find: /^playwright$/, replacement: resolve(manifest, '..', playwright.exports['.'].import).replaceAll('\\', '/') }]
}
