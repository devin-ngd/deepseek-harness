/** Read the copied installed dsh version using its installation-owned Node carrier in a fresh home; no app/profile is launched. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
const runtime = JSON.parse(await readFile('evidence/workspace-installed-runtime.json', 'utf8'))
const home = join(runtime.world, 'version-home'); await mkdir(home, { recursive: true })
const exe = 'C:/Users/wpdev/AppData/Local/Programs/DeepSeek Harness/DeepSeek Harness.exe'
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
Object.assign(env, { ELECTRON_RUN_AS_NODE: '1', DSH_HOME: home, DSH_AGENTS_HOME: join(runtime.world, 'version-agents'),
  DSH_TELEMETRY_DISABLED: '1', DSH_SNAPSHOT: 'replay', DSH_SNAPSHOT_REPLAY_ONLY: '1', TEMP: runtime.world, TMP: runtime.world })
const args = ['--expose-internals', join(runtime.runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--version']
const child = spawn(exe, args, { cwd: runtime.world, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let stdout = '', stderr = ''
child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
const report = { at: new Date().toISOString(), code, passed: code === 0 && stdout.includes(runtime.release.version), stdout, stderr, exe, args,
  copiedRuntime: runtime.runtime, descriptorSha256: runtime.descriptorSha256, home, appWindowStarted: false, userProfileRead: false, realModelCalls: 0 }
const evidence = 'evidence/workspace-installed-cli-' + Date.now() + '.json'
await writeFile(evidence, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ evidence, ...report }))
if (!report.passed) process.exitCode = 1
