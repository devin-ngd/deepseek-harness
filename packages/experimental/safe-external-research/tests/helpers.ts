import { fileURLToPath } from 'node:url'
import type { ResearchConfig, ResearchRequest, ResearchResult } from '../src/types.ts'

export const skillDirectory = fileURLToPath(new URL('./fixtures/skill/', import.meta.url))
export const config: ResearchConfig = {
  skillDirectory, provider: 'mock', model: 'mock', allowedSources: ['https://docs.example.org/project'],
  searchUrl: 'https://search.example.org/search', searchQueryKey: 'q', blockedTools: ['web_search', 'web_fetch'],
  maxReads: 8, maxSteps: 12, maxResponseBytes: 65536, timeoutMs: 30000, maxTokens: 4096,
}
export const request: ResearchRequest = {
  question: 'What is the public release?', sources: ['https://docs.example.org/project'], search: false, budget: { reads: 4, steps: 8 },
}
export const result: ResearchResult = {
  schema_version: 1, status: 'ok', summary: 'Release 1 is documented.',
  sources: [{ id: 's1', url: request.sources[0]!, locator: 'Retrieved document text' }],
  findings: [{ statement: 'Release 1.', kind: 'fact', source_ids: ['s1'] }], risk_flags: [], limitations: [],
}
