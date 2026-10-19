/** Validate only the new operation documentation, command coverage, source syntax and preserved earlier paragraphs. */
import assert from 'node:assert/strict'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), files = []
for (const directory of ['operations/phase74', 'scripts', 'integration', 'tests']) for (const name of await readdir(directory)) if (directory === 'operations/phase74' || name.startsWith('phase74-')) files.push(join(directory, name))
let syntax = 0
for (const file of files) {
  const text = await readFile(file, 'utf8'); assert.match(text, /[^\n]\n$/); assert.equal(text.includes('\ufffd'), false)
  if (file.endsWith('.mjs')) { const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); syntax++ }
}
const book = await readFile('operations/phase74/runbook.md', 'utf8'); assert.match(book, /kind: reference/); assert.match(book, /## Summary/)
for (const command of ['verify', 'init-run', 'launch-existing', 'record-phone-read', 'sign', 'install', 'launch', 'desktop-inspect', 'relay-probe', 'relay-prepare', 'prepare-field', 'start-field', 'collect', 'relay-stage', 'relay-initialize', 'relay-activate', 'restore-field', 'relay-restore', 'verify-sign']) assert.ok(book.includes(command), command)
for (const [file, lines] of [['docs/tasks.md', 4], ['docs/acceptance.md', 2]]) {
  const current = await readFile(file, 'utf8'), before = Buffer.from(current.split('\n').slice(lines).join('\n'))
  assert.equal(hash(before), hash(await readFile('.build/phase73.1-review-candidate/source-overlay/' + file)))
}
const report = { passed: true, files: files.length, syntaxChecks: syntax, commandsDocumented: 19, priorTaskAndAcceptanceBytesPreserved: true }
await writeFile('evidence/phase74-focused-docs.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))
