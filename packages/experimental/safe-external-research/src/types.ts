/** Public research data and host-owned protection evidence. @module dsh-experimental-safe-external-research/types */

/** One bounded result conforming to the shared result v1 schema. */
export interface ResearchResult {
  schema_version: 1
  status: 'ok' | 'partial' | 'blocked'
  summary: string
  sources: { id: string; url: string; locator: string }[]
  findings: { statement: string; kind: 'fact' | 'inference'; source_ids: string[] }[]
  risk_flags: ('instruction_override' | 'private_data_request' | 'unauthorized_egress' | 'code_execution_request'
    | 'permission_change' | 'source_mismatch' | 'active_content' | 'other')[]
  limitations: string[]
}

/** Minimal public task accepted from the caller; no conversation or file input. */
export interface ResearchRequest {
  question: string
  sources: string[]
  search: boolean
  budget: { reads: number; steps: number }
}

/** Content-free record of one controlled access or refusal. */
export interface ResearchAudit {
  operation: 'read' | 'search' | 'tool' | 'result' | 'lifecycle'
  target: string
  code: string
  protection: 'research-tool-policy'
}

/** Complete deployment policy; model callers cannot change it. */
export interface ResearchConfig {
  /** Absolute trusted shared Skill directory; every pinned file must match. */
  skillDirectory: string
  /** Explicit model provider for the independent worker. */
  provider: string
  /** Explicit model id within the configured provider. */
  model: string
  /** HTTPS origins and path prefixes that requests may narrow. */
  allowedSources: string[]
  /** Anonymous HTML search endpoint; empty disables search. */
  searchUrl: string
  /** Query parameter carrying only the initial public question. */
  searchQueryKey: string
  /** Host tool names refused while this research entry is mounted. */
  blockedTools: string[]
  /** Maximum reads and search requests per operation. */
  maxReads: number
  /** Maximum model steps per operation. */
  maxSteps: number
  /** Maximum UTF-8 bytes accepted for each response and extracted text. */
  maxResponseBytes: number
  /** Operation and individual HTTP deadline in milliseconds. */
  timeoutMs: number
  /** Maximum model output tokens for each worker step. */
  maxTokens: number
}
