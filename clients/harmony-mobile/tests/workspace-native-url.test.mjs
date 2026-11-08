/** Native manifest validation must work without the browser's global URL constructor. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, mkdtemp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const world = await mkdtemp(resolve('.build/workspace-url-')), output = join(world, 'schema.mjs')
await esbuild.build({ stdin: { contents: "export { workspaceShellManifestSchema } from './src/workspace-protocol.ts'", resolveDir: resolve('.') },
  outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'es2022', inject: [resolve('src/native-protocol-shims.mjs')],
  plugins: [{ name: 'native-sdk-only', setup(build) { build.onResolve({ filter: /^@ohos\.(util|url)$/ }, () => ({ path: resolve('tests/helpers/product-native-sdk.mjs') })) } }] })
const { workspaceShellManifestSchema } = await import(pathToFileURL(output).href)

test('validates canonical shell paths without ambient URL and rejects paths outside the resource inventory', () => {
  const browserURL = globalThis.URL
  try {
    globalThis.URL = undefined
    const manifest = path => ({ revision: 'a'.repeat(64), resources: [{ path, sha256: 'b'.repeat(64), bytes: 1, mediaType: 'text/javascript' }] })
    assert.equal(workspaceShellManifestSchema.safeParse(manifest('/assets/client.js?v=1')).success, true)
    for (const path of ['//outside.example/a', '/api/session/rename', '/plugins/events', '/a/../b', '/x#fragment', '/%2e%2e/api/x']) assert.equal(workspaceShellManifestSchema.safeParse(manifest(path)).success, false, path)
  } finally { globalThis.URL = browserURL }
})
