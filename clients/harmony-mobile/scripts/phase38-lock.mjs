/** Isolated lock-only metadata resolution with installed npm. Explicit empty config and scrubbed environment; no dependency modules, installs or lifecycle scripts execute. */
import { spawn } from 'node:child_process'
import { writeFile, readFile } from 'node:fs/promises'
const directory = 'D:/Temp/dsh-harmony-light-relay-20261013-prep'
await writeFile(directory + '/package.json', JSON.stringify({ name: 'local-harmony-light-relay', version: '0.0.0-phase38.1', private: true, type: 'module', engines: { node: '^22.19.0 || >=24.0.0' }, dependencies: { ws: 'file:vendor/ws-8.21.3.tgz' } }, null, 2) + '\n', { flag: 'wx' })
await writeFile(directory + '/user.npmrc', 'registry=https://registry.npmjs.org/\nignore-scripts=true\naudit=false\nfund=false\n', { flag: 'wx' }); await writeFile(directory + '/global.npmrc', '\n', { flag: 'wx' })
const args = ['C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js', 'install', '--package-lock-only', '--ignore-scripts', '--omit=optional', '--no-audit', '--no-fund', '--offline', '--os=linux', '--cpu=x64', '--libc=glibc', '--userconfig=' + directory + '/user.npmrc', '--globalconfig=' + directory + '/global.npmrc', '--cache=' + directory + '/cache']
const child = spawn(process.execPath, args, { cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1' } })
let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString(); process.stdout.write(bytes) })
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) }); await writeFile(directory + '/lock-generation.log', log.trimEnd() + '\n'); if (code !== 0) throw new Error('isolated lock generation failed; no upstream code executed')
const lock = JSON.parse(await readFile(directory + '/package-lock.json', 'utf8')); console.log(JSON.stringify({ lockfileVersion: lock.lockfileVersion, packages: Object.keys(lock.packages), nodeModulesCreated: false, scriptsExecuted: false, network: false }))
