/** Only selected memory tests; official ws is imported but no socket constructor/dial/upgrade is invoked. */
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from '../.build/upstream-vitest-shared.js'
import { projectionAliases } from '../scripts/projection-source.mjs'
const project = fileURLToPath(new URL('../', import.meta.url)), root = JSON.parse(await readFile(new URL('../source.json', import.meta.url), 'utf8')).dshRoot
export default defineConfig({ root, cacheDir: project + '.build/phase36-vite', resolve: { alias: [...await projectionAliases(project, root), { find: /^ws$/, replacement: root.replaceAll('\\', '/') + '/node_modules/.pnpm/ws@8.21.3/node_modules/ws/wrapper.mjs' }] }, plugins: [standardDecoratorPlugin()], test: { name: 'harmony-phase36-memory', environment: 'node', pool: 'forks', execArgv: vitestExecArgv, include: ['clients/harmony-mobile/integration/phase36*.spec.ts', 'clients/harmony-mobile/integration/phase34-device-auth.spec.ts', 'clients/harmony-mobile/integration/phase35-crypto.spec.ts'], maxWorkers: 1, fileParallelism: false, testTimeout: 20000, hookTimeout: 20000, teardownTimeout: 15000 } })
