/** Preserve reviewed source candidates outside temporary checkouts; no package is applied, installed or published. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'

const git = promisify(execFile), hash = bytes => createHash('sha256').update(bytes).digest('hex')
const parent = resolve('handoff/standard-plugin-workspace')
await mkdir(parent, { recursive: true })
const destination = await mkdtemp(join(parent, 'source-candidates-'))
const candidates = []
for (const item of [
  { checkout: '.build/workspace-core-checkout', repository: 'devin-ngd/deepseek-harness', prefix: 'packages/experimental/rich-inline/', extra: [], name: 'rich-inline' },
  { checkout: '.build/workspace-devflow-checkout', repository: 'devin-ngd/dsh-plugins', prefix: 'dsh-devflow/', extra: ['plans/devflow-v1-20261015/design.md'], name: 'devflow' },
]) {
  const checkout = resolve(item.checkout), run = async args => (await git('git', args, { cwd: checkout, windowsHide: true, encoding: 'buffer' })).stdout
  const base = (await run(['rev-parse', 'HEAD'])).toString('utf8').trim()
  const changed = (await run(['diff', '--name-only', '-z', 'HEAD', '--', item.prefix, ...item.extra])).toString('utf8').split('\0').filter(Boolean)
  const added = (await run(['ls-files', '--others', '--exclude-standard', '-z', '--', item.prefix, ...item.extra])).toString('utf8').split('\0').filter(Boolean)
  const files = []
  for (const path of [...new Set([...changed, ...added])].sort()) {
    if (!(path.startsWith(item.prefix) || item.extra.includes(path)) || path.includes('..') || path.includes('\\')) throw new Error('Candidate path rejected')
    const source = await readFile(join(checkout, path))
    let previous = null
    if (!added.includes(path)) previous = await run(['show', 'HEAD:' + path])
    const target = join(destination, item.name, path)
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, source, { flag: 'wx' })
    files.push({ path, baseSha256: previous === null ? null : hash(previous), candidateSha256: hash(source) })
  }
  if (files.length === 0) throw new Error('Empty source candidate')
  candidates.push({ name: item.name, repository: item.repository, base, files })
}
const manifest = { schema: 'harmony-workspace-source-candidates/1', createdAt: new Date().toISOString(), candidates,
  installed: false, appliedToOriginalRepositories: false,
  instructions: 'Review each source against its recorded Git base and blob SHA-256. Review destination worktree differences and line-ending conversion before applying; preserve unrelated changes. Package/App modifications remain restricted to isolated checkouts until separately authorized.' }
await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
await writeFile('evidence/workspace-source-candidates.json', JSON.stringify({ destination, candidates: candidates.map(value => ({ name: value.name, repository: value.repository, base: value.base, files: value.files.length })), installed: false }, null, 2) + '\n')
console.log(JSON.stringify({ destination, candidates: candidates.map(value => ({ name: value.name, files: value.files.length })) }))
