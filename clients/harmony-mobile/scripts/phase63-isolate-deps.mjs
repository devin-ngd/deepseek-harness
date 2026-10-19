/** Retain only the lab-created dependency links as named links so pnpm can create a real isolated dependency directory. */
import { execFileSync } from 'node:child_process'
import { lstat, realpath, rename, appendFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
const root = 'D:/workspace/agents/deepseek-harness', checkout = 'D:/Temp/dsh-harmony-alpha4-source-20261016'
const files = execFileSync('git', ['ls-files', '-z', '**/package.json'], { cwd: checkout, encoding: 'utf8', windowsHide: true }).split('\0').filter(path => /^(packages|vendor|apps|native)\//.test(path))
const directories = ['', ...files.map(path => path.slice(0, -'package.json'.length))]
let linksRetained = 0
for (const directory of directories) {
  const source = resolve(checkout, directory, 'node_modules'), target = resolve(checkout, directory, 'node_modules.shared-reference')
  if (!source.toLowerCase().startsWith(resolve(checkout).toLowerCase() + '\\') || !target.toLowerCase().startsWith(resolve(checkout).toLowerCase() + '\\')) throw new Error('Outside isolated checkout')
  let stat
  try { stat = await lstat(source) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
  if (!stat.isSymbolicLink()) continue
  if ((await realpath(source)).toLowerCase() !== (await realpath(join(root, directory, 'node_modules'))).toLowerCase()) throw new Error('Unrecognized dependency link')
  await rename(source, target); linksRetained++
}
await appendFile(join(checkout, '.git/info/exclude'), '\n**/node_modules.shared-reference/\n/node_modules.shared-reference/\n')
console.log(JSON.stringify({ linksRetained, primaryDirectoriesMoved: false, deleted: false }))
