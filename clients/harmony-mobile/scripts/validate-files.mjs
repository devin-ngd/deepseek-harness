/** Validate owned text formatting and local documentation links, without touching the source dependency checkout. */
import { readFile, readdir, access } from 'node:fs/promises'
import { resolve, dirname, extname } from 'node:path'

const extensions = new Set(['.ts', '.mjs', '.js', '.ets', '.json', '.jsonl', '.json5', '.svg', '.html', '.md', '.yml', '.txt', '.ps1'])
const failures = []
let files = 0
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.build', 'node_modules', '.git', '.hvigor', 'oh_modules'].includes(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (path === resolve('harmony/entry/build')) continue
    if (entry.isDirectory()) { await visit(path); continue }
    if (!extensions.has(extname(path)) && entry.name !== '.gitignore') continue
    const content = await readFile(path, 'utf8')
    files++
    if (!content.endsWith('\n') || content.endsWith('\n\n') || content.includes('\r\n')) failures.push(path + ': requires exactly one final LF')
    if (extname(path) === '.md') for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const link = match[1]
      if (/^https?:|^#/.test(link)) continue
      try { await access(resolve(dirname(path), link.split('#')[0])) } catch (error) { failures.push(path + ': missing local link ' + link) }
    }
  }
}
await visit(resolve('.'))
if (failures.length > 0) { console.error(failures.join('\n')); process.exitCode = 1 }
else console.log(`PASS: ${files} owned text files, trailing LF and local Markdown links`)
