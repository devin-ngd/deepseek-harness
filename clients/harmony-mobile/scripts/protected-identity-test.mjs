/** Focused synthetic/Windows DPAPI test runner; preserves earlier evidence and never reads installed profiles. */
import { spawn } from 'node:child_process'
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
await mkdir('.build', { recursive: true })
const world = await mkdtemp(join(project, '.build/protected-identity-world-')), report = join(world, 'report.json')
const child = spawn(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'native', '--config', join(project, 'integration/protected-identity.vitest.config.mjs'), '--reporter=default', '--reporter=json', '--outputFile=' + report], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, ComSpec: process.env.ComSpec, TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', DSH_HARMONY_INTEGRATION_WORLD: world } })
let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString('utf8') })
const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept) })
const safe = log.replace(/[A-Za-z0-9+/_-]{100,}={0,2}/g, '[opaque-data-redacted]')
await writeFile(join(world, 'sanitized-test.log'), safe.trimEnd() + '\n'); await writeFile('evidence/phase52-identity-tests.json', JSON.stringify({ world, report, exitCode: code, actualWindowsResult: code === 0 ? JSON.parse(await readFile(join(world, 'windows-protection-result.json'), 'utf8')) : null, realIdentitiesGenerated: false, realCredentialsRead: false, installedChanged: false }, null, 2) + '\n')
process.stdout.write(safe.slice(-14000)); process.exitCode = code
