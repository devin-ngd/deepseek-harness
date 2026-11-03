/** Run tracked-source policy entry points against an index larger than Node's default output buffer. */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))
const hook = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href

it.each([
  ['verify-public-repository-links.ts', `https://github.com/${['deepseek-ai', 'deepseek-harness-sdk'].join('/')}`],
  ['verify-concrete-terms.ts', 'prove' + 'nance'],
])('%s scans a large index and rejects a violation at its end', (script, violation) => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-tracked-source-scan-'))
  try {
    mkdirSync(join(directory, 'scripts'))
    mkdirSync(join(directory, 'docs'))
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}\n')
    for (const file of [script, 'historical-schema-region.ts']) copyFileSync(join(root, 'scripts', file), join(directory, 'scripts', file))
    execFileSync('git', ['init', '--quiet', directory])
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: directory, input: '', encoding: 'utf8' }).trim()
    const paths = ['AGENTS.md', 'packages/example/source.ts', 'docs/policy.md', 'vendor/example/source.ts', '.agents/notes/archived/keep.md']
    for (let index = 0; index < 10_000; index++) paths.push(`packages/large/${String(index).padStart(5, '0')}/${'x'.repeat(100)}.ts`)
    paths.push('docs/zz-violation.md')
    const entries = paths.map(file => `100644 ${blob}\t${file}\0`).join('')
    execFileSync('git', ['update-index', '-z', '--index-info'], { cwd: directory, input: entries })
    expect(Buffer.byteLength(paths.join('\0'))).toBeGreaterThan(1024 * 1024)
    const run = () => spawnSync(process.execPath, ['--import', hook, join(directory, 'scripts', script)], {
      cwd: root, encoding: 'utf8', maxBuffer: 1 << 26,
    })
    const accepted = run()
    expect(accepted.error).toBeUndefined()
    expect(accepted.status).toBe(0)
    writeFileSync(join(directory, 'docs', 'zz-violation.md'), violation + '\n')
    const rejected = run()
    expect(rejected.error).toBeUndefined()
    expect(rejected.status).toBe(1)
    expect(rejected.stderr).toContain('docs/zz-violation.md:1')
  } finally {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + '/') && !resolve(directory).startsWith(resolve(tmpdir()) + '\\')) throw new Error('Fixture escaped the temporary directory')
    if (!basename(directory).startsWith('dsh-tracked-source-scan-')) throw new Error('Unexpected fixture directory')
    rmSync(directory, { recursive: true, force: true })
  }
})
