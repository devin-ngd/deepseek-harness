/** Update only the owning bilingual introduction and task/acceptance pointers. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
const path = 'README.zh.md', lines = (await readFile(path, 'utf8')).split('\n'), row = lines.findIndex(line => line.includes('docs/phase75-field-closeout.md')); assert.ok(row > 0)
lines[row] = '[第75阶段收尾](docs/phase75-field-closeout.md)确认原签名安装、手机完整历史7、公开pair上传及撤销8/活动0，未执行任务。[完整phase76候选](docs/phase76-complete-candidate.md)将已编译的unsigned HAP与更新桌面、未激活操作器配套；强制手机就绪后才启动桌面重试。固定诊断及离线grant9/撤销10测试保留原有限额，真机任务与ArkWeb验收仍待完成。'
await writeFile(path, lines.join('\n'))
for (const [file, line] of [['docs/acceptance.md', 'Phase76完整候选仅离线：原HAP复用，新增148文件桌面闭包及批准门控操作器；强制手机就绪先于有限桌面重试。47项操作器、闭包原控制器15项、控制/HTTP/FIFO共21项及82项memory/history通过；strict180模块，独立dsh四响应/23流帧/rich状态/取消通过。没有手机、SSH、签装、上传或新grant。详见[完整候选](phase76-complete-candidate.md)。'], ['docs/tasks.md', '- [x] Phase76完整离线候选：原手机/桌面完整7分别验签，8→9→10真实授权owner的内存测试，强制一次性手机就绪、桌面同源控制器闭包、固定诊断采集、完整复核/操作器封装。未进行现场操作；批准范围与真机阻塞见[完整候选](phase76-complete-candidate.md)。']]) {
  const old = await readFile(file, 'utf8'); if (!old.startsWith(line)) await writeFile(file, line + '\n\n' + old)
}
console.log('Updated owning docs only.')
