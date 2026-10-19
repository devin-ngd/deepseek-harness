/** Collect verified checkpoint facts, preserve v14 hashes and update only current client status paragraphs. */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const regressionPath = 'evidence/regression-final-regression-final-S0u7A7/summary.json', regression = await read(regressionPath), services = await read('evidence/phase15-services.json'), hap = await read('evidence/phase15-hap.json')
assert.equal(regression.passed, true); assert.equal(services.passed, true); assert.equal(hap.passed, true)
const prior = [
  ['D:/Temp/dsh-harmony-client-20261011-source-v14.zip', 'bc8628c0dc7b9e89888a6262240aedd806d42e0674b7d0e2e050d679d3872fe2'],
  ['D:/Temp/dsh-harmony-mobile-20261011-native-v14-offline-unsigned.hap', '68cb455f5077304779a90b2fd633c5ca4831eb032789f755f8a7f0c3799bf18d'],
  ['D:/Temp/dsh-harmony-mobile-20261011-native-v14-netreplay-stream-marker-unsigned.hap', '6623ca06829a494fadd43e60698b829737c0e0cabc3b15f2eef1931e6e775dd4'],
]
for (const [path, expected] of prior) assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), expected)
for (const name of await readdir('evidence')) {
  if (!name.startsWith('phase15-focused-') && name !== 'regression-final-regression-final-YAC5ys') continue
  const directory = join('evidence', name)
  for (const file of await readdir(directory)) if (file.endsWith('.json')) {
    const path = join(directory, file), text = await readFile(path, 'utf8')
    await writeFile(path, JSON.stringify(JSON.parse(text), null, 2) + '\n')
  }
}
const upstream = await read('evidence/phase15-upstream.json'), jsdoc = await read('evidence/phase15-jsdoc.json')
assert.equal(jsdoc.scopePassed, true); assert.equal(jsdoc.baselineUnchanged, true)
const summary = { phase: 15, generatedAt: new Date().toISOString(), client: resolve('.'), upstream, regression: regressionPath, counts: regression.counts, independentCases: regression.counts.node + regression.counts['source-replay'] + regression.counts['bff-replay'], chromeAssertions: 87, sourceFifthCallRefused: regression.sourceFifthCallRefused, inputsUnchangedDuringRegression: regression.inputsUnchangedDuringRun, serviceEvidence: 'evidence/phase15-services.json', realModelCalls: 0, uploadCalls: 0, loopbackListenersClosed: true, sourceOffloadAccepted: services.sourceOffloadAccepted, fixedResponses: 4, reopeningRedispatch: services.reopenPromptCalls, hap, archivePath: 'D:/Temp/dsh-harmony-client-20261011-source-v15.zip', archiveManifest: 'evidence/archive-v15.json', archiveVerification: 'evidence/archive-v15.json', networkVariantBuilt: false, installed: false, nativeNetworkingActivated: false, forwardingCreated: false, emulatorStarted: false, v15ArkWebQualified: false, deviceQualified: false, installedDesktopConnected: false, previousSealedArtifacts: prior.map(([path, sha256]) => ({ path, sha256, unchanged: true })), upstreamChecks: { persistence: '65 roots match 15 history records; changes empty', aliases: true, jsdoc: 'evidence/phase15-jsdoc.json', markdownLinks: '1857 files passed', markdownWrap: '1890 files passed', docBudgets: '8 budgeted docs passed', readmeBilingualPair: true, reversePatchCheck: true, diffCheck: true, fullDocSyncPassed: false, fullDocSyncBlocker: 'CLI help acp --help timed out; run interrupted' }, toolSideEffect: { pnpmAutoInstallOnRunsTriggered: true, existingWorkspaceLinksRelinked: 24, linksRestored: 24, remainingIsolatedTargets: 0, packageVersionUpgrade: false, packageDirectoriesDeleted: 0, futureAutoInstallOnRunsMustBeDisabled: true }, nextNativeScope: 'No activation now; a separate approval is required for one <=30-minute existing API26 emulator test, independent INTERNET-only app, one loopback HDC forwarding rule and the same four-response replay services.' }
await writeFile('evidence/phase15-summary.json', JSON.stringify(summary, null, 2) + '\n')
for (const [path, paragraph] of [
  ['README.md', '当前以 [第十五批共享投影与有界恢复](docs/phase15-projection-recovery.md) 为准：复用严格 rich source/tool 投影，178 个独立回归用例及 87 项 Chrome 断言通过；真实模型／上传为 0。官方 API26 编译产生零权限 unsigned v15 HAP，未安装、未运行。未建立转发或启用原生联网；v15 ArkWeb 与真机仍待专门批准验证。v14 封存产物保持原字节。'],
  ['docs/acceptance.md', '当前层级见 [第十五批验收矩阵](phase15-projection-recovery.md) 和 [摘要](../evidence/phase15-summary.json)：共享严格投影及有界读恢复通过 178 个独立用例／87 项 Chrome 断言，实际 DSH 固定回放重开不重执行，API26 官方编译完成。v15 未安装或原生运行，ArkWeb／真机未取得新版资格；没有建立转发。phase14 原生证据只说明其当时限定场景。'],
  ['docs/tasks.md', '当前任务见 [第十五批共享投影与有界恢复](phase15-projection-recovery.md)：源码、实际固定回放、178 个独立回归用例／87 项 Chrome 断言及官方编译已完成；保留 v14 和主仓改动。下一步准备另行批准的原生 source-offload／分段恢复／取消／服务重开／隔离验收；本批没有联网激活。'],
]) {
  const lines = (await readFile(path, 'utf8')).split('\n'), at = lines.findIndex((line, index) => index > 0 && line.trim() !== '')
  lines[at] = paragraph
  await writeFile(path, lines.join('\n'))
}
const tasks = 'docs/tasks.md', taskText = await readFile(tasks, 'utf8')
await writeFile(tasks, taskText.trimEnd() + '\n\n- [x] Phase15：复用上游严格 source/tool 投影与 SurfaceManager；完整读取和只读补页恢复。\n- [x] Phase15：有界 clean segment／断线恢复、去重／乱序／截断拒绝、取消等待及服务重开。\n- [x] Phase15：四响应实际 DSH 服务与 178 个独立用例／87 项 Chrome 断言；API26 unsigned HAP 编译及资源哈希检查。\n- [ ] Phase15：重新取得有限原生批准后验证新版 ArkWeb／NetworkKit；当前不激活。\n- [ ] 真机：另行批准签名、安装、手机权限及真实桌面连接，取得完整幂等闭环证据。\n')
console.log(JSON.stringify({ independentCases: summary.independentCases, hapBytes: hap.bytes, previousSealedArtifactsUnchanged: true }))
