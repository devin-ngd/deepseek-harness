/** Trusted shared Skill loading and bounded result v1 validation. @module dsh-experimental-safe-external-research/contract */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { resultSchema, skillHashes } from './contract.generated.ts'
import { inertText, ResearchError } from './policy.ts'
import type { ResearchResult } from './types.ts'

const validate = new Ajv2020({ strict: false, allErrors: false }).compile<ResearchResult>(resultSchema)

/**
 * Read only the four pinned trusted files, rejecting changes before starting a worker.
 * @param directory - operator-supplied absolute Skill directory.
 * @returns verified worker instructions and the shared result schema.
 */
export async function loadTrustedSkill(directory: string): Promise<string> {
  if (!isAbsolute(directory)) throw new ResearchError('RESEARCH_SKILL_PATH')
  const contents: string[] = []
  for (const [file, expected] of Object.entries(skillHashes)) {
    let bytes: Buffer
    try { bytes = await readFile(join(directory, file)) } catch (_error: unknown) {
      throw new ResearchError('RESEARCH_SKILL_UNAVAILABLE')
    }
    const canonical = bytes.toString('utf8').replaceAll('\r\n', '\n')
    if (createHash('sha256').update(canonical).digest('hex') !== expected) throw new ResearchError('RESEARCH_SKILL_CHANGED')
    contents.push(canonical)
  }
  return contents.join('\n\n')
}

/**
 * Validate the complete JSON before sanitizing; citations must match a successful host read exactly.
 * @param value - worker-submitted result JSON.
 * @param reads - host-owned source id, URL and locator inventory.
 * @returns detached inert result; unknown fields, sources and oversized values fail.
 */
export function validateResult(value: unknown, reads: ReadonlyMap<string, { url: string; locator: string }>): ResearchResult {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 65_536) throw new ResearchError('RESEARCH_RESULT_SIZE')
  if (!validate(value)) throw new ResearchError('RESEARCH_RESULT_SCHEMA')
  const ids = new Set<string>()
  for (const source of value.sources) {
    const read = reads.get(source.id)
    if (ids.has(source.id) || read === undefined || read.url !== source.url || read.locator !== source.locator) {
      throw new ResearchError('RESEARCH_RESULT_SOURCE')
    }
    ids.add(source.id)
  }
  if (value.findings.some(finding => finding.source_ids.some(id => !ids.has(id)))) throw new ResearchError('RESEARCH_RESULT_REFERENCE')
  const clean: ResearchResult = {
    ...value,
    summary: inertText(value.summary),
    sources: value.sources.map(source => ({ ...source })),
    findings: value.findings.map(finding => ({ ...finding, statement: inertText(finding.statement), source_ids: [...finding.source_ids] })),
    risk_flags: [...value.risk_flags],
    limitations: value.limitations.map(inertText),
  }
  if (Buffer.byteLength(JSON.stringify(clean), 'utf8') > 65_536) throw new ResearchError('RESEARCH_RESULT_SIZE')
  return clean
}
