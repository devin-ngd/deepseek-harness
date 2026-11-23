/**
 * The verify-cordis-config metadata contract: `disabled` is the one entry
 * metadata field whose `!!js` expression the Loader interpolates; every other
 * metadata field must stay static, and a disabled expression must parse.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BACKEND_PACKAGES, SURFACE_PACKAGES } from '../packages/host/directory-picker-auto/src/index.ts'
import {
  bundleManifestPaths,
  bundlePluginDependencyErrors,
  exclusivePlaneRowIds,
  loadCordisConfigDocument,
  metadataExpressionErrors,
  packageTestFixtureDependencyErrors,
  packageTestPluginDependencyErrors,
} from './verify-cordis-config.ts'

describe('verify-cordis-config metadata expressions', () => {
  it('resolves only unchanged in-repository Git symlink placeholders', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'dsh-cordis-symlink-'))
    const repo = join(fixture, 'repo')
    mkdirSync(repo)
    try {
      execFileSync('git', ['init', '--quiet', repo])
      writeFileSync(join(repo, 'real.cordis.yml'), '- name: example\n')
      writeFileSync(join(fixture, 'outside.cordis.yml'), '- name: outside\n')
      const symlink = (name: string, target: string, working = target): void => {
        const hash = execFileSync('git', ['-C', repo, 'hash-object', '-w', '--stdin'], { input: target, encoding: 'utf8' }).trim()
        execFileSync('git', ['-C', repo, 'update-index', '--add', '--cacheinfo', `120000,${hash},${name}`])
        writeFileSync(join(repo, name), working)
      }
      symlink('valid.cordis.yml', 'real.cordis.yml')
      symlink('outside.cordis.yml', '../outside.cordis.yml')
      symlink('cycle.cordis.yml', 'cycle.cordis.yml')
      symlink('changed.cordis.yml', 'old.cordis.yml', 'real.cordis.yml')
      writeFileSync(join(repo, 'ordinary.cordis.yml'), 'real.cordis.yml')
      expect(loadCordisConfigDocument(repo, 'valid.cordis.yml')).toEqual([{ name: 'example' }])
      expect(loadCordisConfigDocument(repo, 'outside.cordis.yml')).toBe('../outside.cordis.yml')
      expect(loadCordisConfigDocument(repo, 'cycle.cordis.yml')).toBe('cycle.cordis.yml')
      expect(loadCordisConfigDocument(repo, 'changed.cordis.yml')).toBe('real.cordis.yml')
      expect(loadCordisConfigDocument(repo, 'ordinary.cordis.yml')).toBe('real.cordis.yml')
    } finally {
      rmSync(fixture, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
  })

  it('accepts a disabled !!js expression', () => {
    const problems = metadataExpressionErrors(
      { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: { __jsExpr: "process.platform === 'win32'" } },
      '[0]',
    )
    expect(problems).toEqual([])
  })

  it('rejects an expression in a static metadata field', () => {
    const problems = metadataExpressionErrors({ id: { __jsExpr: 'process.platform' }, name: 'pkg' }, '[0]')
    expect(problems).toContain('[0].id: !!js is not interpolated here')
  })

  it('rejects an expression nested below disabled (only the field itself interpolates)', () => {
    const problems = metadataExpressionErrors(
      { id: 'tool-bash', name: 'pkg', disabled: { when: { __jsExpr: 'process.platform' } } },
      '[0]',
    )
    expect(problems).toContain('[0].disabled.when: !!js is not interpolated here')
  })

  it('rejects a disabled expression that does not parse (the loader would fail the boot)', () => {
    const problems = metadataExpressionErrors(
      { id: 'tool-bash', name: 'pkg', disabled: { __jsExpr: 'process.platform ===' } },
      '[0]',
    )
    expect(problems.some(problem => problem.includes('[0].disabled: disabled expression does not parse'))).toBe(true)
  })
})

describe('workspace Bundle discovery and product dependency closures', () => {
  it('checks every package the directory-picker chooser can mount', () => {
    const manifestPath = 'packages/example/bundle/package.json'
    const file = 'packages/example/bundle/cordis.patch.yml'
    const chooser = '@deepseek-ai/dsh-host-directory-picker-auto'
    const mounted = [...Object.values(BACKEND_PACKAGES), ...Object.values(SURFACE_PACKAGES)]
    const dependencies = Object.fromEntries([chooser, ...mounted].map(name => [name, 'workspace:*']))
    const references = [{ file, name: chooser }]
    expect(bundlePluginDependencyErrors(manifestPath, { dependencies }, references)).toEqual([])
    for (const name of mounted) {
      const incomplete = Object.fromEntries(Object.entries(dependencies).filter(([key]) => key !== name))
      expect(bundlePluginDependencyErrors(manifestPath, { dependencies: incomplete }, references))
        .toContain(`${file}: ${name} must be declared in ${manifestPath} dependencies or optionalDependencies`)
    }
    const previous = BACKEND_PACKAGES.native
    try {
      BACKEND_PACKAGES.native = '@example/new-picker-backend'
      expect(bundlePluginDependencyErrors(manifestPath, { dependencies }, references))
        .toContain(`${file}: @example/new-picker-backend must be declared in ${manifestPath} dependencies or optionalDependencies`)
    } finally {
      BACKEND_PACKAGES.native = previous
    }
  })

  it('allows scoped executors on both planes while retaining other plugin rows', () => {
    expect([...exclusivePlaneRowIds([{ insert: [
      { id: 'native', name: '@deepseek-ai/dsh-tool-executor-native' },
      { id: 'ptc', name: '@deepseek-ai/dsh-tool-executor-ptc' },
      { id: 'tools', name: '@deepseek-ai/dsh-tools' },
      { id: 'group', name: 'cordis:group', group: true, config: [
        { id: 'tool-executor-ptc', name: '@deepseek-ai/dsh-tool-fs' },
      ] },
    ] }])]).toEqual(['tools', 'group', 'tool-executor-ptc'])
  })

  it('discovers a Bundle outside packages/bundle from its manifest declaration', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'dsh-bundle-discovery-'))
    try {
      const bundleDir = join(fixture, 'packages/subagent/example')
      const plainDir = join(fixture, 'packages/bundle/plain')
      mkdirSync(bundleDir, { recursive: true })
      mkdirSync(plainDir, { recursive: true })
      writeFileSync(join(bundleDir, 'package.json'), JSON.stringify({
        name: '@deepseek-ai/dsh-subagent-example',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }))
      writeFileSync(join(plainDir, 'package.json'), JSON.stringify({
        name: '@deepseek-ai/dsh-plain',
      }))

      expect(bundleManifestPaths(fixture)).toEqual([
        'packages/subagent/example/package.json',
      ])
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('allows a Bundle to mount itself but rejects an undeclared plugin package', () => {
    const manifestPath = 'packages/subagent/example/package.json'
    const file = 'packages/subagent/example/cordis.patch.yml'
    const manifest = {
      name: '@deepseek-ai/dsh-subagent-example',
      dependencies: {},
    }
    const self = { file, name: '@deepseek-ai/dsh-subagent-example' }
    expect(bundlePluginDependencyErrors(manifestPath, manifest, [self])).toEqual([])
    expect(bundlePluginDependencyErrors(manifestPath, {
      ...manifest, optionalDependencies: { '@deepseek-ai/dsh-platform-plugin': 'workspace:*' },
    }, [{ file, name: '@deepseek-ai/dsh-platform-plugin' }])).toEqual([])
    expect(bundlePluginDependencyErrors(manifestPath, manifest, [
      self,
      { file, name: '@deepseek-ai/dsh-missing-plugin' },
    ])).toEqual([
      `${file}: @deepseek-ai/dsh-missing-plugin must be declared in ${manifestPath} dependencies or optionalDependencies`,
    ])
  })
})

describe('package-owned Loader test dependency closures', () => {
  it('requires package test configs to declare each named plugin they load', () => {
    const manifestPath = 'packages/example/owner/package.json'
    const file = 'packages/example/owner/tests/fixtures/cordis.yml'
    const manifest = {
      name: '@deepseek-ai/dsh-owner',
      dependencies: {},
      devDependencies: {
        '@deepseek-ai/dsh-declared': 'workspace:^',
      },
    }
    expect(packageTestPluginDependencyErrors(manifestPath, manifest, [
      { file, name: '@deepseek-ai/dsh-owner' },
      { file, name: '@deepseek-ai/dsh-declared' },
      { file, name: '@deepseek-ai/dsh-missing' },
    ])).toEqual([
      `${file}: @deepseek-ai/dsh-missing must be declared in ${manifestPath} dependencies or devDependencies`,
    ])
  })

  it('requires executable package test fixtures to declare their bare imports', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'dsh-package-test-entrypoint-'))
    try {
      const packageDir = join(fixture, 'packages/example/owner')
      const driverDir = join(packageDir, 'tests/fixtures/loader')
      mkdirSync(driverDir, { recursive: true })
      writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
        name: '@deepseek-ai/dsh-owner',
        devDependencies: {
          '@deepseek-ai/dsh-declared': 'workspace:^',
        },
      }))
      writeFileSync(join(driverDir, 'driver.ts'), [
        "import '@deepseek-ai/dsh-owner'",
        "import '@deepseek-ai/dsh-declared'",
        "import '@deepseek-ai/dsh-missing'",
      ].join('\n'))
      writeFileSync(join(driverDir, 'cordis.yml'), '[]\n')
      writeFileSync(join(driverDir, 'fixture.mjs'), "import '@deepseek-ai/dsh-declared'\n")
      const unrelatedDir = join(packageDir, 'tests/fixtures/unrelated')
      mkdirSync(unrelatedDir, { recursive: true })
      writeFileSync(join(unrelatedDir, 'driver.ts'), "import '@deepseek-ai/dsh-unrelated'\n")

      expect(packageTestFixtureDependencyErrors(fixture)).toEqual([
        'packages/example/owner/tests/fixtures/loader/driver.ts: '
        + '@deepseek-ai/dsh-missing must be declared in '
        + 'packages/example/owner/package.json dependencies or devDependencies',
      ])
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('fails loud when package-owned Loader fixtures disappear from the scan', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'dsh-empty-package-test-entrypoint-'))
    try {
      expect(packageTestFixtureDependencyErrors(fixture)).toEqual([
        'package test fixture dependency scan found no package-owned Loader configs',
      ])
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })
})
