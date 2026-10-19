/** Save the alpha.4 source-only milestone, fresh test reports and exact changed-source preimages. */
import { readFile, writeFile, copyFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const project = resolve(import.meta.dirname, '..'), evidence = join(project, 'evidence'), rollback = 'D:/Temp/dsh-harmony-alpha4-adaptation-20261016'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const latest = JSON.parse(await readFile(join(evidence, 'phase62-latest-test.json'), 'utf8')), tests = JSON.parse(await readFile(latest.report, 'utf8'))
if (latest.code !== 0 || !tests.success || tests.numPassedTests !== 41 || tests.numFailedTests !== 0 || tests.numPendingTests !== 0) throw new Error('Fresh 41-test report required')
await copyFile(latest.report, join(evidence, 'phase62-vitest.json'))
await copyFile(join(latest.world, 'run.log'), join(evidence, 'phase62-vitest.log'))
await copyFile(join(project, '.build/phase62-typecheck.log'), join(evidence, 'phase62-typecheck.log'))
await copyFile(join(project, '.build/phase62-root-build-check-host.log'), join(evidence, 'phase62-root-build-check.log'))
const notes = [
  ['README.md', 'Current alpha.4 source adaptation and incomplete build/device qualification: [phase62](docs/phase62-alpha4-adaptation.md).'],
  ['docs/acceptance.md', '当前 alpha.4 源码适配、41 项离线回归与未完成的构建/真机资格见 [phase62](phase62-alpha4-adaptation.md)；下列安装记录保留其原始阶段含义。'],
  ['docs/tasks.md', '当前下一步见 [phase62](phase62-alpha4-adaptation.md)：解决两项独立组合类型诊断，迁移投影扩展，重建候选；真实闭环仍待验。'],
  ['desktop-plugin/README.md', 'Current source adaptation targets DSH/rich-inline alpha.4 with restricted device principals and Session-scoped Gateway/Rich RPCs; see [phase62](../docs/phase62-alpha4-adaptation.md). The installed runtime and device qualification remain separate.'],
]
for (const [path, note] of notes) {
  const target = join(project, path), old = await readFile(target, 'utf8')
  if (!old.startsWith(note)) await writeFile(target, note + '\n\n' + old)
}
const changed = []
async function visit(directory = '') {
  for (const entry of await readdir(join(rollback, 'preimages', directory), { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) { await visit(path); continue }
    const before = await readFile(join(rollback, 'preimages', path)), current = await readFile(join(project, path))
    if (digest(before) !== digest(current)) changed.push({ path: path.replaceAll('\\', '/'), before: digest(before), after: digest(current), bytes: current.length })
  }
}
await visit()
const added = ['desktop-plugin/src/device-policy.ts', 'integration/phase62-access.spec.ts', 'integration/phase62-guest.spec.ts', 'integration/phase62.vitest.config.mjs', 'scripts/phase62-test.mjs', 'scripts/phase62-finalize.mjs', 'scripts/phase62-preimages.mjs', 'docs/phase62-alpha4-adaptation.md']
for (const path of added) { const bytes = await readFile(join(project, path)); changed.push({ path, before: null, after: digest(bytes), bytes: bytes.length }) }
for (const file of changed) {
  const text = await readFile(join(project, file.path), 'utf8')
  if (!text.endsWith('\n') || /(?:\r?\n){2}$/.test(text)) throw new Error('Exactly one trailing newline required: ' + file.path)
}
await writeFile(join(evidence, 'phase62-changes.json'), JSON.stringify({ schema: 'harmony-alpha4-changes/1', rollback, files: changed }, null, 2) + '\n')
const source = JSON.parse(await readFile(join(project, 'source.json'), 'utf8')), rootVersion = JSON.parse(await readFile(join(source.dshRoot, 'package.json'), 'utf8')).version
await writeFile(join(evidence, 'phase62-summary.json'), JSON.stringify({ schema: 'harmony-alpha4-milestone/1', at: new Date().toISOString(), auditedCommit: '9053da6635c9f3e179e20fe7a2e23015b6f581fd', finalCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source.dshRoot, encoding: 'utf8', windowsHide: true }).trim(), dshVersion: rootVersion, richVersion: JSON.parse(await readFile(join(source.dshRoot, 'packages/experimental/rich-inline/package.json'), 'utf8')).version, sourceLocatorUpdated: false, tests: { passed: tests.numPassedTests, failed: tests.numFailedTests, files: tests.numPassedTestSuites, report: 'phase62-vitest.json', sha256: digest(await readFile(join(evidence, 'phase62-vitest.json'))) }, rootBuildCheck: 'passed-host-and-client', mobileMonolithicTypecheck: { passed: false, diagnostics: ['packages/typert/registry/src/service.ts:315 TS2375', 'packages/typert/registry/src/service.ts:414 TS2379'] }, projection: JSON.parse(await readFile(join(project, 'projection-source.json'), 'utf8')), realModels: 0, userTasks: 0, newGrantCreated: false, relayActivated: false, installedDesktopRestarted: false, hapBuilt: false, hapSigned: false, hapInstalled: false, deviceValidated: false, rollback, changedFiles: changed.length }, null, 2) + '\n')
console.log(JSON.stringify({ testsPassed: tests.numPassedTests, sourceFiles: changed.length, evidence: join(evidence, 'phase62-summary.json'), remainingTypeDiagnostics: 2, candidateReady: false }))
