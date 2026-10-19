/** Reuse already-installed dependencies in the local isolated clone; no install or source modification. */
import { execFileSync } from 'node:child_process'
import { lstat, symlink, realpath } from 'node:fs/promises'
import { join } from 'node:path'
const root = 'D:/workspace/agents/deepseek-harness', checkout = 'D:/Temp/dsh-harmony-alpha4-source-20261016'
const files = execFileSync('git', ['ls-files', '-z', '**/package.json'], { cwd: checkout, encoding: 'utf8', windowsHide: true }).split('\0').filter(path => /^(packages|vendor|apps|native)\//.test(path))
let reused = 0
for (const path of files) {
  const directory = path.slice(0, -'package.json'.length), source = join(root, directory, 'node_modules'), target = join(checkout, directory, 'node_modules')
  try { await lstat(source) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
  try { await lstat(target); if (await realpath(target) !== await realpath(source)) throw new Error('Existing dependency target differs') }
  catch (error) { if (error.code !== 'ENOENT') throw error; await symlink(source, target, 'junction') }
  reused++
}
console.log(JSON.stringify({ installed: false, reusedPackageDependencyDirectories: reused }))
