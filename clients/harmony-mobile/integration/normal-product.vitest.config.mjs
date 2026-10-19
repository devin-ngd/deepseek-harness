/** Only normal product entry cases; no field, native, network or historical evidence-producing tests. */
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from '../.build/normal-product-vitest-shared.js'
import { projectionAliases } from '../scripts/projection-source.mjs'

const project = fileURLToPath(new URL('../', import.meta.url))
const root = JSON.parse(await readFile(new URL('../source.json', import.meta.url), 'utf8')).dshRoot
export default defineConfig({
  root, cacheDir: project + '.build/normal-product-vite',
  resolve: { alias: await projectionAliases(project, root) },
  plugins: [standardDecoratorPlugin()],
  test: {
    name: 'normal-product-entry', environment: 'node', pool: 'forks', execArgv: vitestExecArgv,
    include: ['clients/harmony-mobile/integration/normal-product.spec.ts', 'clients/harmony-mobile/integration/normal-product-pairing.spec.ts', 'clients/harmony-mobile/integration/normal-product-controls.spec.ts'],
    maxWorkers: 1, fileParallelism: false, testTimeout: 20000, hookTimeout: 20000, teardownTimeout: 15000,
  },
})
