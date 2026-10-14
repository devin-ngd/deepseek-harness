import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
const root = process.argv[2]
if (!root) throw new Error('Pass the absolute trusted safe-external-research Skill directory')
const files = ['SKILL.md', 'references/dsh.md', 'references/result-contract.md', 'references/result.schema.json']
const hashes = Object.fromEntries(files.map(file => {
  const content = readFileSync(resolve(root, file), 'utf8').replaceAll('\r\n', '\n')
  const target = new URL('../tests/fixtures/skill/' + file, import.meta.url)
  mkdirSync(new URL('.', target), { recursive: true })
  writeFileSync(target, content)
  return [file, createHash('sha256').update(content).digest('hex')]
}))
const schema = JSON.parse(readFileSync(resolve(root, files[3]), 'utf8'))
const output = '/* eslint-disable @stylistic/quotes, @stylistic/comma-dangle -- Generated JSON preserves shared-source schema spelling. */\n/** Generated from the shared safe-external-research source; run scripts/sync-contract.mjs. @module research-contract */\n\n/** Exact trusted-source digests for result v1. */\nexport const skillHashes = ' + JSON.stringify(hashes, null, 2) + ' as const\n\n/** Shared result v1 JSON Schema, validated by Ajv 2020. */\nexport const resultSchema = ' + JSON.stringify(schema, null, 2) + ' as const\n'
writeFileSync(new URL('../src/contract.generated.ts', import.meta.url), output)
