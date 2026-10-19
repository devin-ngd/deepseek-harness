/** Fixed-replay regression launcher; persists fresh reports and never supplies model credentials or activates pairing. */
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
const project = resolve(import.meta.dirname, '..'), root = JSON.parse(await readFile(join(project, 'source.json'), 'utf8')).dshRoot
await mkdir(join(project, '.build'), { recursive: true })
const world = await mkdtemp(join(project, '.build/phase62-')), report = join(world, 'vitest.json')
const require = createRequire(join(root, 'package.json')), ts = require('typescript'), helper = await readFile(join(root, 'vitest.shared.ts'), 'utf8')
await writeFile(join(project, '.build/upstream-vitest-shared.js'), ts.transpileModule(helper, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, rewriteRelativeImportExtensions: true }, fileName: join(root, 'vitest.shared.ts') }).outputText)
const env = Object.fromEntries(['PATH', 'PATHEXT', 'SystemRoot', 'windir', 'ComSpec'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world })
const child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', join(project, 'integration/phase62.vitest.config.mjs'), '--reporter=default', '--reporter=json', '--outputFile=' + report], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
child.stdout.on('data', part => { log += part.toString(); process.stdout.write(part) }); child.stderr.on('data', part => { log += part.toString(); process.stderr.write(part) })
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
await writeFile(join(world, 'run.log'), log)
await writeFile(join(project, 'evidence/phase62-latest-test.json'), JSON.stringify({ schema: 'harmony-alpha4-test/1', at: new Date().toISOString(), world, report, code, helperSha256: createHash('sha256').update(helper).digest('hex'), layer: 'source-only', realModels: 0, pairingActivated: false, hapBuilt: false, deviceValidated: false }, null, 2) + '\n')
process.exitCode = code ?? 1
