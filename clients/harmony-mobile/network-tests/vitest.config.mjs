import { projectionAliases } from '../scripts/projection-source.mjs'
/** Phase-four tests are opt-in; phase-three replay tests do not start listeners. */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { standardDecoratorPlugin, vitestExecArgv } from '../.build/upstream-vitest-shared.js'

const root = fileURLToPath(new URL('../../../', import.meta.url))
export default defineConfig({ root, cacheDir: fileURLToPath(new URL('../.build/network-vite/', import.meta.url)),
  resolve: { alias: await projectionAliases(fileURLToPath(new URL('../', import.meta.url)), root) },
  plugins: [tsconfigPaths({ projects: [root + 'tsconfig.base.json'] }), standardDecoratorPlugin()],
  test: { name: 'harmony-loopback-bff', environment: 'node', pool: 'forks', execArgv: vitestExecArgv,
    include: ['clients/harmony-mobile/network-tests/*.spec.ts'], maxWorkers: 1, fileParallelism: false,
    testTimeout: 25000, hookTimeout: 20000, teardownTimeout: 15000 } })
