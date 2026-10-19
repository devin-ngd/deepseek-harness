/** Short current Node verification after the completed full regression; deliberately does not restart source/BFF replay. */
import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
const inventory = JSON.parse(await readFile('evidence/test-inventory.json', 'utf8'))
const args = ['--test', '--test-reporter=tap', ...inventory.files.filter(file => file.layer === 'node').map(file => file.path)]
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, windir: process.env.windir, ComSpec: process.env.ComSpec, TEMP: 'D:/Temp', TMP: 'D:/Temp', NO_COLOR: '1' }
const result = spawnSync(process.execPath, args, { env, windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 2097152 })
const output = (result.stdout + result.stderr).replace(/\r\n/g, '\n').trimEnd() + '\n'
await writeFile('evidence/phase6-finish-node.txt', output)
const passed = result.status === 0 && output.includes('# pass ' + inventory.counts.node) && output.includes('# fail 0')
await writeFile('evidence/phase6-finish-node.json', JSON.stringify({ passed, command: [process.execPath, ...args], tests: inventory.counts.node, exitCode: result.status, sourceBffReplayRestarted: false }, null, 2) + '\n')
if (!passed) { process.stderr.write(output.slice(-12000)); throw result.error ?? new Error('Short Node verification failed') }
console.log('PASS: all current Node cases ' + inventory.counts.node + '; completed full replay evidence retained, no restart')
