/** Selected offline first-pairing and prior relay/crypto regression tests. The sealed phase36 evidence-producing test is excluded and its behavior is exercised by the new full flow. */
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from '../.build/upstream-vitest-shared.js'
import { projectionAliases } from '../scripts/projection-source.mjs'
const project = fileURLToPath(new URL('../', import.meta.url)), root = JSON.parse(await readFile(new URL('../source.json', import.meta.url), 'utf8')).dshRoot
const require = createRequire(join(root, 'package.json')), playwrightManifest = require.resolve('playwright/package.json', { paths: [join(root, 'node_modules/.pnpm')] }), playwright = JSON.parse(await readFile(playwrightManifest, 'utf8')), playwrightEsm = resolve(playwrightManifest, '..', playwright.exports['.'].import).replaceAll('\\', '/')
export default defineConfig({ root, cacheDir: project + '.build/product-vite', resolve: { alias: [...await projectionAliases(project, root), { find: /^playwright$/, replacement: playwrightEsm }, { find: /^ws$/, replacement: root.replaceAll('\\', '/') + '/node_modules/.pnpm/ws@8.21.3/node_modules/ws/wrapper.mjs' }] }, plugins: [standardDecoratorPlugin()], test: { name: 'harmony-offline-product', environment: 'node', pool: 'forks', execArgv: vitestExecArgv, include: ['clients/harmony-mobile/integration/product*.spec.ts', 'clients/harmony-mobile/integration/phase40*.spec.ts', 'clients/harmony-mobile/integration/phase39*.spec.ts', 'clients/harmony-mobile/integration/phase38*.spec.ts', 'clients/harmony-mobile/integration/phase37*.spec.ts', 'clients/harmony-mobile/integration/phase36*.spec.ts', 'clients/harmony-mobile/integration/phase35-crypto.spec.ts'], testNamePattern: /^(?!actual verifier connects phase34 independent device scope)/, maxWorkers: 1, fileParallelism: false, testTimeout: 20000, hookTimeout: 20000, teardownTimeout: 15000 } })
