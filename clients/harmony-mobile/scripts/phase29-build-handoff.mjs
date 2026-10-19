/** Bundle maintained shared source and frozen fixtures for a portable offline handoff; installs and launches nothing. */
import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { projectionTsconfig } from './projection-source.mjs'
const project = resolve('.'), source = JSON.parse(await readFile('source.json', 'utf8')), output = resolve('handoff/phase29')
const require = createRequire(join(source.dshRoot, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(source.dshRoot, 'node_modules/.pnpm')] }))
await mkdir(join(output, 'fixtures'), { recursive: true })
const built = await esbuild.build({ entryPoints: [resolve('scripts/phase29-handoff-entry.mjs')], outfile: join(output, 'verify.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'es2022', tsconfig: await projectionTsconfig(project, source.dshRoot), absWorkingDir: source.dshRoot, metafile: true, legalComments: 'eof' })
const forbidden = /(?:native-network-tests|native-sdk-fake|native-replay-lab|loopback-bff|native-network-lease|phase28-window-run|packages\/sdk\/client|packages\/llm\/llm-provider|packages\/credentials\/|@kit\.|node:net|node:http|node:child_process)/
const inputs = []
for (const artifact of Object.values(built.metafile.outputs)) for (const dependency of artifact.imports) {
  if (dependency.external && !['node:assert/strict', 'node:fs/promises', 'node:crypto'].includes(dependency.path)) throw Error('External dependency in standalone handoff: ' + dependency.path)
}
for (const name of Object.keys(built.metafile.inputs)) {
  if (forbidden.test(name.replaceAll('\\', '/'))) throw Error('Runtime activation dependency in offline handoff: ' + name)
  const path = resolve(source.dshRoot, name), bytes = await readFile(path)
  inputs.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') })
}
const fixtures = [
  ['evidence/phase29-acceptance-ledger.json', 'acceptance-ledger.json'], ['evidence/phase27-source-reset.json', 'source-reset.json'],
  ['evidence/phase28-summary.json', 'native-summary.json'], ['evidence/phase28-native/round9-resume1/checkpoint-native-layout.json', 'native-layout.json'],
  ['evidence/phase28-native/round9-resume1/native-app-driver.log', 'native.log'],
]
for (const [file, name] of fixtures) await copyFile(file, join(output, 'fixtures', name))
await mkdir(join(output, 'reference'), { recursive: true })
for (const [file, name] of [['phase29-acceptance-matrix.md', 'acceptance.md'], ['phase29-desktop-integration.md', 'integration.md'], ['phase29-handoff.md', 'handoff.md']]) {
  const text = await readFile('docs/' + file, 'utf8')
  await writeFile(join(output, 'reference', name), '> 本文是生成副本，仓库相对引用保留为源码位置，不代表安装文件。\n\n' + text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, target) => label + '（源码引用：' + target + '）'))
}
await writeFile(join(output, 'source-inputs.json'), JSON.stringify({ artifactOnly: true, sourceFork: false, inputs, nativeApiCalled: false, profileLoaded: false }, null, 2) + '\n')
await writeFile(join(output, 'README.md'), '# 离线交接包\n\n仅需已有 Node 22.19+ 或 24+，不需要原仓库、node_modules、DevEco 或 HDC。解压后运行 `node verify.mjs`。程序只读包内 fixtures，验证文件 hash、当前共享 TS 的合成 reset 读取，以及 v28 已记录原生日志/控件树的原判据；不重新执行原生，也不等于最新版全产品通过。此批实际测试 Node 24.13.0，其他 engines 范围没有在本批实测。\n\n不会读取安装配置/真实会话/凭据，不监听端口，不发任务，不调用模型，不安装或签名。此包不是可连接真实桌面的产品，不包含 HAP 安装器。下一阶段计划和版本台账在 reference/ 生成文档中；源码引用保留为文字，不假设独立包带原仓库。所需安装/访问/配对/签名/网络批准仍各自独立。\n')
await mkdir(join(output, 'licenses'), { recursive: true })
await copyFile(join(source.dshRoot, 'LICENSE'), join(output, 'licenses/DSH.txt'))
const zod = require.resolve('zod/package.json'), noble = resolve(createRequire(join(source.dshRoot, 'packages/experimental/webworker-runtime/package.json')).resolve('@noble/hashes/sha2.js'), '../package.json')
for (const [packageFile, name] of [[zod, 'zod'], [noble, 'noble-hashes']]) {
  const folder = resolve(packageFile, '..'), metadata = JSON.parse(await readFile(packageFile, 'utf8'))
  if (metadata.license !== 'MIT') throw Error('Unreviewed bundled license: ' + name)
  const candidates = (await readdir(folder)).filter(value => /^license(?:\.md|\.txt)?$/i.test(value))
  if (candidates.length !== 1) throw Error('Bundled license file unavailable: ' + name)
  await writeFile(join(output, 'licenses/' + name + '.txt'), (await readFile(join(folder, candidates[0]), 'utf8')).trimEnd() + '\n')
}
await writeFile(join(output, 'THIRD-PARTY-NOTICES.md'), '# Bundled source notices\n\nThe verifier is generated from the DSH shared source and maintained dependencies, not a second implementation. Input hashes are in source-inputs.json. DSH, zod 4.4.3 and @noble/hashes 2.4.0 use MIT licenses; their full license texts are in licenses/. The bundle retains applicable legal comments.\n')
const files = []
const collect = async directory => { for (const row of await readdir(directory, { withFileTypes: true })) { const file = join(directory, row.name); if (row.isDirectory()) await collect(file); else if (row.name !== 'manifest.json') { const bytes = await readFile(file); files.push({ path: file.slice(output.length + 1).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }) } } }
await collect(output)
const seal = JSON.parse(await readFile('evidence/phase28-final-seal.json', 'utf8'))
await writeFile(join(output, 'manifest.json'), JSON.stringify({ schema: 'dsh-harmony-offline-handoff/1', sourceStage: 29, nativeEvidenceStage: 28, nativeHapSourceVersion: 27, nativeHapSha256: seal.hap.sha256, fullCurrentRegressionClaimed: false, files }, null, 2) + '\n')
console.log('Built standalone offline verifier; ' + inputs.length + ' shared source inputs; no desktop/native/network activation')
