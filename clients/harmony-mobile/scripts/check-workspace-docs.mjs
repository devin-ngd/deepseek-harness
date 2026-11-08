/** Check the changed lab documents with the repository's Markdown parser and link checker. Run through node --import tsx. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseMarkdown, visitMarkdown } from '../../../scripts/markdown.ts'
import { findViolations, markdownLinkCache } from '../../../scripts/verify-md-links.ts'

const files = ['docs/standard-plugin-workspace-plan.md', 'docs/workspace-prototype.md', 'docs/workspace-measurement.md', 'docs/workspace-review.md',
  'desktop-plugin/README.md', 'desktop-plugin/README.zh.md']
const cache = markdownLinkCache(), violations = []
for (const path of files) {
  const source = await readFile(path, 'utf8')
  visitMarkdown(parseMarkdown(source), node => {
    if (node.type !== 'paragraph' || node.position === undefined) return
    if (node.position.start.line !== node.position.end.line) violations.push({ path, reason: 'hard-wrapped paragraph', line: node.position.start.line })
    return false
  })
  violations.push(...findViolations(resolve(path), cache))
}
const evidence = 'evidence/workspace-docs-' + Date.now() + '.json'
await writeFile(evidence, JSON.stringify({ files, violations, passed: violations.length === 0, fullDocSync: false }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ passed: violations.length === 0, files: files.length, evidence })); assert.deepEqual(violations, [])
