/** One approved directory/rollback preparation; refuses existing paths and never repeats an uncertain mutation. */
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
const at = new Date().toISOString(); await writeFile('evidence/phase70-relay-prepare-attempt.json', JSON.stringify({ at, authorization: 'Sentinel_ba30e73d8ea081919058993e42fafead', serviceActivation: false, unknownUntilObserved: true }) + '\n', { flag: 'wx' })
const result = spawnSync('C:/Program Files/OpenSSH/ssh.exe', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'dhome', 'sh -s'], { input: await readFile('scripts/phase70-relay-prepare.sh'), windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 65536 }), report = { at, finished: new Date().toISOString(), code: result.status, error: result.error?.code, output: result.stdout, stderr: result.stderr, grantCreated: false }
await writeFile('evidence/phase70-relay-prepared.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report)); if (result.status !== 0) process.exitCode = 1
