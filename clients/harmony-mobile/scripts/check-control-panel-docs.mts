/** Apply the repository Markdown checks to the lab's control-panel references only. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { findViolations, markdownLinkCache } from '../../../scripts/verify-md-links.ts'
import { parseMarkdown, visitMarkdown } from '../../../scripts/markdown.ts'

const args = process.argv.slice(2)
const evidence = args.length === 0 ? 'evidence/control-panel-docs-rc216-' + Date.now() + '.json' : args.length === 2 && args[0] === '--report' ? args[1] : ''
if (evidence === undefined || !/^evidence\/[a-z0-9-]+\.json$/.test(evidence)) throw new Error('Select one local evidence report')
const files = ['README.md', 'README.zh.md', 'desktop-plugin/README.md', 'desktop-plugin/README.zh.md', 'docs/control-panel-rc2.16.md', 'docs/desktop-hostfix-candidate-20261028.md', 'docs/INDEX.md', 'docs/acceptance.md', 'docs/tasks.md', '../../packages/api/session-controller/README.md', '../../packages/api/session-controller/README.zh.md', '../../apps/desktop/packaging/README.md', '../../apps/desktop/packaging/README.zh.md']
const cache = markdownLinkCache(), links = files.flatMap(file => findViolations(resolve(file), cache)), wrapped: string[] = []
for (const file of ['docs/control-panel-rc2.16.md', 'docs/desktop-hostfix-candidate-20261028.md']) {
  const source = await readFile(file, 'utf8')
  const masked = source.replace(/^---\n[\s\S]*?\n---\n/, value => value.replace(/[^\n]/g, ''))
  visitMarkdown(parseMarkdown(masked), node => {
    if (node.type === 'paragraph' && node.position !== undefined && node.position.start.line !== node.position.end.line) wrapped.push(file + ':' + node.position.start.line)
  })
}
const report = { at: new Date().toISOString(), files, links, wrapped, passed: links.length === 0 && wrapped.length === 0, entireRepository: false }
await writeFile(evidence, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
assert.equal(report.passed, true, JSON.stringify({ links, wrapped }))
console.log(JSON.stringify({ passed: true, files: files.length, evidence }))
