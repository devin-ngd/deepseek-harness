/** Update only lab navigation/current status; detailed native evidence keeps its own reference. */
import { readFile, writeFile } from 'node:fs/promises'
const targets = [
  ['README.md', '当前以[第二轮原生回放结果](docs/phase16-native-run3-results.md)为准：官方 API26 模拟器实际完成固定任务、富交互、source-offload、取消和服务重开验证，缓存恢复及验收脚本退出失败保留。临时资源已在 19 分 47 秒内全部清理，真实模型／上传为零。缓存和断言修复通过 29 项相关离线测试及 32 项 Chrome／SDK 替身断言，尚未重新编译或原生验收；真机、真实桌面及配对仍未验证。'],
  ['docs/acceptance.md', '当前资格见[第二轮原生结果](phase16-native-run3-results.md)与[结构化摘要](../evidence/phase16-native-run3-summary.json)：API26 实际 ArkTS／ArkWeb／NetworkKit 固定回放部分通过，缓存恢复失败和 Vitest 退出码 1 保留。所有限时资源已经清理；修复只取得离线资格，真机和真实桌面连接未验证。'],
  ['docs/tasks.md', '当前任务见[第二轮原生结果与续接](phase16-native-run3-results.md)：限时原生回放及资源清理已完成，缓存恢复和断言时机已离线修复。授权窗口已经结束；继续独立实现故障 fixture 与交接，重新原生联网或真机安装需要对应批准。'],
]
for (const [path, paragraph] of targets) {
  const lines = (await readFile(path,'utf8')).split('\n'), at = lines.findIndex((line,index) => index > 0 && line.trim() !== '')
  lines[at] = paragraph
  const current = lines.filter(line => !line.startsWith('第二轮原生联网验证已有明确批准') && !line.startsWith('第二轮已完成 v15') && !(line.startsWith('已核') && line.includes('1800')))
  if (path === 'docs/tasks.md') {
    const prior = current.findIndex(line => line.startsWith('- [ ] Phase15'))
    if (prior >= 0) current[prior] = '- [x] Phase15：在专门批准的窗口执行新版原生回放；验收部分通过，详见第二轮结果。'
    const additions = ['- [x] Phase16：原生四响应任务／富动作／source-offload／取消／服务重开与固定任务去重；提前清理全部本任务资源。', '- [x] Phase16：只读许可快照保持稳定；未重开 DevEco，未写许可或安全设置。', '- [x] Phase16：断开后缓存读取、跨会话拒绝及关闭拒绝的离线修复；29 项相关用例及 32 项 Chrome／SDK 替身断言通过。', '- [ ] Phase16：修复后重新编译与限时原生缓存验收；需要新的明确批准。', '- [ ] Phase16：异常断线自动恢复、旧 generation 请求、未知／截断／冲突帧与未提交草稿的原生注入。']
    for (const addition of additions) {
      const prefix = addition.slice(0,addition.indexOf('；'))
      const existing = current.findIndex(line => line.startsWith(prefix))
      if (existing < 0) current.push(addition); else current[existing] = addition
    }
  }
  await writeFile(path,current.join('\n').trimEnd()+'\n')
}
console.log('PASS: current lab status links to partial native evidence; previous sealed artifacts unchanged')
