/** Focused private-client guide checks: paired sections, strict metadata, relative links, newline and word budget; not repository doc-sync. */
import assert from 'node:assert/strict'
import { readFile, writeFile, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
const root = 'docs/upgrade-guide/v0.2.1-alpha.4/explicit-public-trust-successor', files = [root + '.md', root + '.zh-CN.md', 'docs/phase69-successor-candidate.md'], reports = []
for (const file of files) { const text = await readFile(file, 'utf8'); assert.match(text, /[^\n]\n$/); assert.equal(text.includes('\ufffd'), false); const headings = [...text.matchAll(/^## (.+)$/gm)].map(match => match[1]); if (file.startsWith(root)) { assert.match(text, /kind: upgrade-guide/); assert.match(text, /description: .+/); assert.deepEqual(headings, ['Change', 'Migration']); if (!file.endsWith('.zh-CN.md')) assert.ok(text.split(/\s+/).length <= 500) }; let links = 0; for (const match of text.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]*)?\)/g)) { const path = match[1]; if (/^[a-z]+:/.test(path)) continue; await access(resolve(dirname(file), path)); links++ }; reports.push({ file, headings, relativeLinksChecked: links, sha256: createHash('sha256').update(text).digest('hex') }) }
await writeFile('evidence/phase69-focused-docs.json', JSON.stringify({ at: new Date().toISOString(), passed: true, privateClientScope: true, repositoryDocSyncRun: false, reports }, null, 2) + '\n'); console.log('PASS: client upgrade guide pair, metadata, links, newline and English word budget')
