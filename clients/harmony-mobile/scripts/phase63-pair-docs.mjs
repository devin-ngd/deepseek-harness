/** Align the manually written bilingual package paragraphs for the isolated source change. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const checkout = 'D:/Temp/dsh-harmony-alpha4-source-20261016'
const translations = [
  ['packages/typert/registry', 'Lookup and Host Context registration preserve', 'Lookup 与 Host Context 注册将带类型的 provider 存入共享注册表时保留其资源种类。解析仍要求调用方提供已验证的 wire 身份；类型擦除不会验证新的身份，也不会扩大 provider 的权限。'],
  ['packages/experimental/rich-inline', 'The `/message-projections` library exposes', '`/message-projections` 库向浏览器读取方提供 Host 使用的同一组不可变源投影解释器。调用方提供同步 UTF-8 SHA-256，并保留每项决定所需的原始审计记录；缺失或改变的源会失败，历史不完整时保持只读。该库不提供 Node、原生桥、草稿写入或任务派发能力。持久化 offload 字段和模型可见的替换文本保持不变。'],
]
for (const [directory, prefix, translated] of translations) {
  const enPath = join(checkout, directory, 'README.md'), zhPath = join(checkout, directory, 'README.zh.md')
  let en = await readFile(enPath, 'utf8'), zh = await readFile(zhPath, 'utf8')
  const english = en.split('\n').find(line => line.startsWith(prefix))
  if (english === undefined || zh.includes(translated)) throw new Error('Expected unpaired new paragraph')
  if (directory.endsWith('rich-inline')) en = en.replace('## Table of Contents\n\n' + english, english + '\n\n## Table of Contents')
  const line = en.split('\n').indexOf(english), lines = zh.split('\n'); lines.splice(line, 0, translated, '')
  zh = lines.join('\n')
  await writeFile(enPath, en); await writeFile(zhPath, zh)
}
console.log('PASS: new source paragraphs paired manually')
