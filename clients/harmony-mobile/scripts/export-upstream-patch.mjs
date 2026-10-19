/** Create a reviewable patch of the isolated rich projection extraction; never apply it to the dirty main tree. */
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
const spec = JSON.parse(await readFile('projection-source.json', 'utf8')), checkout = resolve(spec.checkout)
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim() !== spec.baseCommit) throw new Error('Isolated base moved')
const files = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: checkout, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
if (files.some(path => !/^packages\/experimental\/rich-inline\/src\/shared\/(?:message-projections|source-projection|tool-source-projection)\.ts$/.test(path))) throw new Error('Unexpected untracked upstream file')
let patch = execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd: checkout, encoding: 'utf8', maxBuffer: 4194304 })
for (const path of files) {
  const text = await readFile(join(checkout, path), 'utf8'), lines = text.trimEnd().split('\n')
  patch += `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n` + lines.map(line => '+' + line).join('\n') + '\n'
}
const output = 'evidence/phase15-upstream.patch'
await writeFile(output, patch)
const inputs = [...execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim().split('\n'), ...files].filter(Boolean), hashes = {}
for (const path of inputs) hashes[path] = createHash('sha256').update(await readFile(join(checkout, path))).digest('hex')
await writeFile('evidence/phase15-upstream.json', JSON.stringify({ checkout, baseCommit: spec.baseCommit, patch: output, patchSha256: createHash('sha256').update(patch).digest('hex'), files: hashes, mainTreeApplied: false, committed: false, pushed: false, persistenceDigestsChanged: false }, null, 2) + '\n')
console.log(JSON.stringify({ output, files: inputs.length, bytes: Buffer.byteLength(patch) }))
