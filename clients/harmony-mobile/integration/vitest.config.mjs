import { projectionAliases } from '../scripts/projection-source.mjs'
/** Source-plane integration tests only, inside the standard forked Vitest runner. */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { standardDecoratorPlugin, vitestExecArgv } from '../.build/upstream-vitest-shared.js'

const root = fileURLToPath(new URL('../../../', import.meta.url))
export default defineConfig({
  root,
  cacheDir: fileURLToPath(new URL('../.build/integration-vite/', import.meta.url)),
  resolve: { alias: await projectionAliases(fileURLToPath(new URL('../', import.meta.url)), root) },
  plugins: [tsconfigPaths({ projects: [root + 'tsconfig.base.json'] }), standardDecoratorPlugin()],
  test: {
    name: 'harmony-offline-integration', environment: 'node', pool: 'forks', execArgv: vitestExecArgv,
    include: ['clients/harmony-mobile/integration/*.spec.ts'], maxWorkers: 1, fileParallelism: false,
    testTimeout: 20000, hookTimeout: 20000, teardownTimeout: 15000,
  },
})
