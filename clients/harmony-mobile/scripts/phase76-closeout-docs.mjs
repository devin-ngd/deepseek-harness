/** Update owning bilingual status and acceptance pointers from the final public closeout. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
const report = JSON.parse(await readFile('evidence/phase76-field-closeout.json', 'utf8')); assert.equal(report.status, 'INSTALLED_CLOSED_BEFORE_GRANT_AUTO_REVIEW_BLOCKED')
const file = 'README.zh.md', lines = (await readFile(file, 'utf8')).split('\n'), row = lines.findIndex(line => line.includes('docs/phase75-field-closeout.md')); assert.ok(row > 0)
lines[row] = '[phase76现场收尾](docs/phase76-field-closeout.md)确认原签名更新、原HUKS/完整历史7保留，并在grant9创建前完成清理。自动审批在一次证据重试后仍拒绝挑战签名，最终保持撤销8/活动0。[完整候选](docs/phase76-complete-candidate.md)及手机先就绪门禁的离线证据保留；真实认证、任务及ArkWeb验收仍待完成。'
await writeFile(file, lines.join('\n'))
for (const [path, line] of [['docs/acceptance.md', 'Phase76现场：2026-10-17 12:12:42.055 UTC原签名保留数据安装成功，安装后原HUKS及完整7匹配。HUKS挑战签名被自动审批拒绝，附确切转交批准证据的同一调用重试仍拒绝；未签名、未提交grant9、未开始认证/任务，回放/真实模型/上传均0。原owner收尾，本地配置和Session原哈希恢复/保留，中继/nginx原状态复核，手机12:23:36.109 UTC正常退出PID空，最终撤销8/活动0。见[现场收尾](phase76-field-closeout.md)。'], ['docs/tasks.md', '- [x] Phase76现场安装和预授权收尾：原签名安装成功、HUKS/完整7保留；具体挑战签名在一次证据重试后仍被自动审批拒绝，依赖步骤停止并核验全部清理。未创建grant9，不虚称撤销10。后续具体签名批准及真机认证/任务/ArkWeb仍阻塞，见[现场收尾](phase76-field-closeout.md)。']]) { const text = await readFile(path, 'utf8'); await writeFile(path, line + '\n\n' + text) }
console.log('Updated final field status; no live IO.')
