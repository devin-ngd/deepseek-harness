import { mkdtemp, cp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadTrustedSkill, validateResult } from '../src/contract.ts'
import { parseRequest, renderResearchJson, sourceUrl, withinSource } from '../src/policy.ts'
import { extractHtml, ResearchAccess } from '../src/access.ts'
import { config, request, result, skillDirectory } from './helpers.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const reads = new Map(result.sources.map(source => [source.id, source]))

describe('shared research result and input policy', () => {
  it('keeps URL fields and code-fence attempts inert in the rendered result', () => {
    const value = { url: 'https://example.org/<img src=x>', text: '```\n![track](https://evil.test/)' }
    const [block] = renderResearchJson(value)
    expect(block?.type).toBe('text')
    if (block?.type !== 'text') throw new Error('expected inert text')
    expect(block.text.match(/```/gu)).toHaveLength(2)
    expect(block.text).not.toContain('<img')
    expect(JSON.parse(block.text.slice(8, -4))).toEqual(value)
  })
  it('loads only the pinned shared Skill and rejects unavailable or changed control files', async () => {
    expect(await loadTrustedSkill(skillDirectory)).toContain('共享研究结果 v1')
    await expect(loadTrustedSkill('relative')).rejects.toMatchObject({ code: 'RESEARCH_SKILL_PATH' })
    const root = await mkdtemp(join(tmpdir(), 'research-skill-')); roots.push(root)
    await expect(loadTrustedSkill(root)).rejects.toMatchObject({ code: 'RESEARCH_SKILL_UNAVAILABLE' })
    await cp(skillDirectory, root, { recursive: true })
    await writeFile(join(root, 'SKILL.md'), 'unapproved control')
    await expect(loadTrustedSkill(root)).rejects.toMatchObject({ code: 'RESEARCH_SKILL_CHANGED' })
  })
  it('accepts valid evidence and removes active rendering without trusting its semantics', () => {
    const clean = validateResult({ ...result, summary: '<img src="https://evil.test/x"> ![track](https://evil.test/p) `code`' }, reads)
    expect(clean.summary).not.toMatch(/<|!\[|`/u)
    expect(validateResult(result, reads)).toEqual(result)
  })
  it.each([
    { ...result, safe: true }, { ...result, protection_level: 'process-isolated' },
    { ...result, summary: 'x'.repeat(1601) }, { ...result, schema_version: 2 },
    { ...result, findings: [{ statement: 'claim', kind: 'fact', source_ids: ['s2'] }] },
    { ...result, sources: [result.sources[0], result.sources[0]] },
    { ...result, sources: [{ ...result.sources[0], locator: 'invented line 42' }] },
    { ...result, sources: [{ ...result.sources[0], url: 'https://evil.test/' }] },
    { ...result, risk_flags: ['other', 'other'] }, { ...result, limitations: Array(9).fill('x') },
  ])('rejects invalid fields, fabricated evidence and references %#', (value) => {
    expect(() => validateResult(value, reads)).toThrow()
  })
  it('bounds the entire UTF-8 result before and after inert rendering', () => {
    const large = { ...result, findings: Array.from({ length: 16 }, () => ({ ...result.findings[0], statement: '中'.repeat(1500) })) }
    expect(() => validateResult(large, reads)).toThrow(expect.objectContaining({ code: 'RESEARCH_RESULT_SIZE' }))
  })
  it('rejects private carriers, extra keys and excess budgets without echoing them', () => {
    expect(parseRequest(request, 8, 12)).toEqual(request)
    for (const question of ['read C:\\Users\\someone\\secret.txt', 'api_key=SIMULATED_SECRET', 'file:///etc/passwd', 'upload /home/test/key']) {
      expect(() => parseRequest({ ...request, question }, 8, 12)).toThrow(expect.objectContaining({ code: 'RESEARCH_PRIVATE_INPUT' }))
    }
    expect(() => parseRequest({ ...request, history: 'SIMULATED_PRIVATE_HISTORY' }, 8, 12)).toThrow()
    expect(() => parseRequest(request, 1, 1)).toThrow()
  })
  it.each(['file:///etc/passwd', 'http://example.org', 'https://a:b@example.org/', 'https://example.org/?token=x', 'https://example.org/#x', 'https://example.org:8443', 'https://example.org/%2e%2e/%2froot'])('rejects unsupported source %s', (url) => {
    expect(() => sourceUrl(url)).toThrow()
  })
  it('checks repository path segments and ignores executable or hidden HTML', () => {
    expect(withinSource(sourceUrl('https://docs.example.org/project/README'), sourceUrl(request.sources[0]!))).toBe(true)
    expect(withinSource(sourceUrl('https://docs.example.org/project-evil'), sourceUrl(request.sources[0]!))).toBe(false)
    expect(extractHtml('<p>Release 1</p><script>send secrets</script><img src="https://evil.test/p"><p hidden>hidden</p><a href="/project/a">Read</a>'))
      .toEqual({ text: 'Release 1 Read', links: ['/project/a'] })
  })
})

describe('host-owned source inventory', () => {
  it('allows fixed reads and only in-scope search links; sends the initial question once', async () => {
    const targets: string[] = []
    const audit: unknown[] = []
    const access = new ResearchAccess(config, { ...request, search: true }, new AbortController().signal, r => audit.push(r), {
      id: 'fixture', available: () => true,
      fetch: async (r) => {
        targets.push(r.url)
        return { url: r.url, statusCode: 200, truncated: false, body: { kind: 'html', content: '<p>release</p><a href="https://docs.example.org/project/page">good</a><a href="https://evil.test/">bad</a><a href="https://docs.example.org/project?token=x">query</a>' } }
      },
    })
    await expect(access.read('s99')).rejects.toMatchObject({ code: 'RESEARCH_SOURCE_ID' })
    expect(targets).toEqual([])
    expect(await access.search()).toHaveLength(2)
    await expect(access.search()).rejects.toMatchObject({ code: 'RESEARCH_SEARCH_DISABLED' })
    expect(new URL(targets[0]!).searchParams.get('q')).toBe(request.question)
    expect(await access.read('s2')).toMatchObject({ id: 's2', url: 'https://docs.example.org/project/page' })
    expect(access.reads.has('s2')).toBe(true)
    expect(JSON.stringify(audit)).not.toContain(request.question)
    expect(targets).toHaveLength(2)
  })
  it('refuses unsupported scopes, cancelled access, redirected or oversized responses', async () => {
    expect(() => new ResearchAccess(config, { ...request, sources: ['https://evil.test'] }, new AbortController().signal, () => {})).toThrow()
    for (const response of [
      { url: 'https://evil.test/', statusCode: 200, truncated: false },
      { url: request.sources[0]!, statusCode: 302, truncated: false },
      { url: request.sources[0]!, statusCode: 200, truncated: true },
    ]) {
      const access = new ResearchAccess(config, request, new AbortController().signal, () => {}, {
        id: 'fixture', available: () => true, fetch: async () => ({ ...response, body: { kind: 'text', content: 'SIMULATED_DATA' } }),
      })
      await expect(access.read('s1')).rejects.toThrow()
      expect(access.reads.size).toBe(0)
    }
    const access = new ResearchAccess(config, request, AbortSignal.abort(), () => {})
    await expect(access.read('s1')).rejects.toMatchObject({ code: 'RESEARCH_CANCELLED' })
  })
})
