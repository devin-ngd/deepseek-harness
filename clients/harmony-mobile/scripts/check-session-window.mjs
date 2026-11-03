/** Current-source read-window checks; no installed profile or user Session access. */
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { projectionTsconfig } from './projection-source.mjs'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json'))
const esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
await mkdir('.build', { recursive: true })
const world = await mkdtemp(resolve('.build/session-window-')), module = join(world, 'api.mjs')
await esbuild.build({ stdin: { contents: "export * from './desktop-plugin/src/session-window.ts';export {profileServicePorts} from './desktop-plugin/src/ports.ts';export {PairedProductTransport} from './src/paired-product-transport.ts';", resolveDir: project }, outfile: module, bundle: true, platform: 'node', format: 'esm', target: 'node22', tsconfig: await projectionTsconfig(project, root) })
const child = spawn(process.execPath, ['--test', 'tests/session-window.test.mjs'], { cwd: project, windowsHide: true, stdio: 'inherit', env: { ...process.env, DSH_SESSION_WINDOW_MODULE: module } })
const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })) })
process.exitCode = result.code === 0 && result.signal === null ? 0 : 1
