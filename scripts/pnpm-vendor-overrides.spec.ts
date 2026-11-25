import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { load } from 'js-yaml'
import { expect, it, onTestFinished } from 'vitest'
import { removeFixtureSafely } from './test-fixture-cleanup.ts'

it('keeps vendored overrides compatible with strict pnpm status checks', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pnpm-override-'))
  onTestFinished(() => { removeFixtureSafely(root) })
  const repository = resolve(import.meta.dirname, '..')
  const config = load(readFileSync(join(repository, 'pnpm-workspace.yaml'), 'utf8'))
  if (typeof config !== 'object' || config === null || !('overrides' in config)
    || typeof config.overrides !== 'object' || config.overrides === null) throw new Error('Missing workspace overrides')
  const overrides = config.overrides
  expect(overrides).toMatchObject({ '@deepseek-ai/cosmokit': 'workspace:~', '@deepseek-ai/schemastery': 'workspace:~' })
  if (!('@deepseek-ai/schemastery' in overrides) || typeof overrides['@deepseek-ai/schemastery'] !== 'string') {
    throw new Error('Missing schemastery override')
  }
  const replacement = overrides['@deepseek-ai/schemastery']
  for (const directory of ['vendor/foo', 'packages/consumer', 'external/third']) mkdirSync(join(root, directory), { recursive: true })
  writeFileSync(join(root, 'pnpm-workspace.yaml'), `packages:\n  - vendor/*\n  - packages/*\noverrides:\n  fixture-foo: '${replacement}'\n`)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture-root', private: true, version: '1.0.0' }))
  writeFileSync(join(root, 'vendor/foo/package.json'), JSON.stringify({ name: 'fixture-foo', version: '1.2.3', main: 'index.cjs' }))
  writeFileSync(join(root, 'vendor/foo/index.cjs'), 'module.exports = { fixture: true }\n')
  writeFileSync(join(root, 'external/third/package.json'), JSON.stringify({
    name: 'fixture-third', version: '1.0.0', main: 'index.cjs', dependencies: { 'fixture-foo': '^2.0.0' },
  }))
  writeFileSync(join(root, 'external/third/index.cjs'), 'module.exports = require("fixture-foo")\n')
  const manifestPath = join(root, 'packages/consumer/package.json')
  const manifest = { name: 'fixture-consumer', version: '1.0.0', dependencies: {
    'fixture-foo': 'workspace:~', 'fixture-third': 'file:../../fixture-third-1.0.0.tgz',
  } }
  writeFileSync(manifestPath, JSON.stringify(manifest))
  const pnpm = join(repository, 'node_modules/pnpm/bin/pnpm.mjs')
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'pnpm_config_verify_deps_before_run')),
    pnpm_config_verify_deps_before_run: 'error',
  }
  const run = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [pnpm, ...args], {
    cwd, env, encoding: 'utf8', timeout: 60_000, windowsHide: true,
  })
  const succeeded = (result: ReturnType<typeof run>) => {
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status, result.stdout + result.stderr).toBe(0)
  }
  succeeded(run(join(root, 'external/third'), 'pack', '--pack-destination', root))
  succeeded(run(root, 'install', '--offline', '--ignore-scripts', '--store-dir', join(root, 'store')))
  succeeded(run(root, 'install', '--frozen-lockfile', '--lockfile-only', '--offline', '--ignore-scripts', '--store-dir', join(root, 'store')))
  const later = new Date(Date.now() + 5_000)
  utimesSync(manifestPath, later, later)
  const script = 'const fs=require("node:fs");const direct=require.resolve("fixture-foo");'
    + 'const transitive=require.resolve("fixture-foo",{paths:[require.resolve("fixture-third")]});'
    + 'if(fs.realpathSync(direct)!==fs.realpathSync(transitive))process.exit(2);console.log(fs.realpathSync(direct))'
  const status = run(join(root, 'packages/consumer'), 'exec', 'node', '-e', script)
  succeeded(status)
  expect(status.stdout.trim()).toBe(realpathSync(join(root, 'vendor/foo/index.cjs')))
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, dependencies: { ...manifest.dependencies, uninstalled: '1.0.0' } }))
  const invalidTime = new Date(Date.now() + 10_000)
  utimesSync(manifestPath, invalidTime, invalidTime)
  const invalid = run(join(root, 'packages/consumer'), 'exec', 'node', '-e', 'process.exit(0)')
  expect(invalid.error).toBeUndefined()
  expect(invalid.signal).toBeNull()
  expect(invalid.status).not.toBe(0)
  expect(invalid.stdout + invalid.stderr).toContain('does not satisfy project')
}, 120_000)
