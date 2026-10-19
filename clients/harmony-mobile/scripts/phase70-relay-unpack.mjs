/** One-time verified public deployment extraction; no service activation and no grant. */
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
await writeFile('evidence/phase70-relay-unpack-attempt.json', JSON.stringify({ at: new Date().toISOString(), mutation: '40 public files and non-pair probe configuration only', unknownUntilObserved: true }) + '\n', { flag: 'wx' })
const r = spawnSync('C:/Program Files/OpenSSH/ssh.exe', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'dhome', 'sh -s'], { input: await readFile('scripts/phase70-relay-unpack.sh'), windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 65536 }), result = { at: new Date().toISOString(), code: r.status, output: r.stdout, stderr: r.stderr, grantCreated: false, serviceChanged: false }
await writeFile('evidence/phase70-relay-unpacked.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(result)); if (r.status !== 0) process.exitCode = 1
