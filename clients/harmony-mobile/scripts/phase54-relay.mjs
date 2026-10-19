/** Exact approved relay commands and public uploads only; SSH credentials are handled by the existing OpenSSH configuration. */
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const marker = JSON.parse(await readFile('.build/phase54-active.json', 'utf8')), mode = process.argv[2], remote = '/home/devin/harmony-relay/field-20261015-phase54-lEUAMM', env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, USERPROFILE: process.env.USERPROFILE, TEMP: marker.world, TMP: marker.world }
for (const name of ['HOMEDRIVE', 'HOMEPATH', 'SystemDrive', 'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'COMSPEC', 'PATHEXT']) if (process.env[name] !== undefined) env[name] = process.env[name]
assert.equal(marker.authorization, 'Sentinel_8dcca9e84ab88191aa8537f5e2c9e695')
let executable = 'C:/Program Files/OpenSSH/ssh.exe', args, input
if (['prepare', 'unpack', 'activate', 'restore', 'status', 'verify'].includes(mode)) { args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'dhome', 'sh -s -- ' + mode]; input = await readFile('scripts/phase54-relay.sh') }
else if (mode === 'upload-tools') { executable = 'C:/Program Files/OpenSSH/scp.exe'; args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', marker.artifacts[1].path, 'dhome:' + remote + '/public-tools.zip'] }
else if (mode === 'upload-pair') { executable = 'C:/Program Files/OpenSSH/scp.exe'; const pair = process.argv[3]; assert.ok(pair?.startsWith(marker.world + '/fixed-world/exchange/') || pair?.startsWith(marker.world.replaceAll('/', '\\') + '\\fixed-world\\exchange\\')); const publicPair = JSON.parse(await readFile(pair, 'utf8')); assert.equal(publicPair.pairId, marker.pairId); assert.ok(publicPair.expiresAt > Date.now()); assert.ok(publicPair.expiresAt <= Date.now() + 1800000); assert.deepEqual(Object.keys(publicPair).sort(), ['desktopPublicSpki', 'epoch', 'expiresAt', 'pairId', 'phonePublicSpki', 'revoked']); args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', pair, 'dhome:' + remote + '/relay-pair.json'] }
else throw new Error('closed approved relay command required')
const child = spawn(executable, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); let output = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output += bytes.toString(); if (output.length > 1048576) child.kill() }); child.stdin.end(input)
const timer = setTimeout(() => child.kill(), 45000), exit = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => accept({ code, signal })) }).finally(() => clearTimeout(timer))
await writeFile('evidence/phase54-relay-' + mode + '-' + Date.now() + '.json', JSON.stringify({ mode, remote, at: new Date().toISOString(), exit, output, authorizedScope: marker.authorization, privateMaterialUploaded: false }, null, 2) + '\n'); console.log(output); if (exit.code !== 0 || exit.signal) throw new Error('relay command failed; preserve state and inspect scoped evidence')
