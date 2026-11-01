/** Linux service preflight: one non-secret probe inside the selected writable directory; no pair, identity or listener. */
import { readFile, lstat, open, unlink } from 'node:fs/promises'
import { resolve, isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (process.platform !== 'linux' || args.length !== 4 || args[0] !== '--directory' || args[2] !== '--uid' || !isAbsolute(args[1]!) || resolve(args[1]!) !== args[1] || !/^[0-9]+$/.test(args[3]!) || process.getuid!() !== Number(args[3])) throw new Error('selected Linux service context required')
  const directory = args[1]!, selected = await lstat(directory)
  if (!selected.isDirectory() || selected.isSymbolicLink() || selected.uid !== process.getuid!() || (selected.mode & 0o777) !== 0o700) throw new Error('selected private public-state directory required')
  const mounts = (await readFile('/proc/self/mountinfo', 'utf8')).trim().split('\n').map(line => line.split(' ')).map(row => ({ path: row[4]!.replaceAll('\\040', ' '), options: row[5]!.split(',') }))
  const mount = (path: string) => mounts.filter(row => path === row.path || path.startsWith(row.path.replace(/\/$/, '') + '/')).sort((a, b) => b.path.length - a.path.length)[0]
  const stateMount = mount(directory), parentMount = mount(resolve(directory, '..', '..'))
  if (stateMount === undefined || parentMount === undefined || !stateMount.options.includes('rw') || !parentMount.options.includes('ro')) throw new Error('single writable directory and readonly home are required')
  const path = join(directory, 'write-scope-check-' + randomUUID() + '.json'), file = await open(path, 'wx', 0o600)
  try { await file.writeFile('{"check":"public-maintenance-write-scope"}\n'); await file.sync() } finally { await file.close() }
  await unlink(path)
  const dir = await open(directory, 'r'); try { await dir.sync() } finally { await dir.close() }
  process.stdout.write(JSON.stringify({ writeScopeCheck: true, uid: process.getuid!(), directory, homeReadonly: true, selectedDirectoryWritable: true, probeRemoved: true, pairCreated: false, listenerStarted: false }) + '\n')
}
void main().catch(error => { void error; process.stderr.write('public write-scope check refused; preserve any failed probe for review\n'); process.exitCode = 1 })
