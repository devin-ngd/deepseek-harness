/** Validate and materialize offline SDK replay input before a runner is constructed. */
import { deriveReplayScript, parseSessionLog } from '@deepseek-ai/dsh-llm-replay'

/** Explicit selected route and required replay budget. */
export interface OfflineSnapshotPlan {
  /** Unmodified physical Session JSONL buffers. */
  fixtures: readonly string[]
  /** Absolute target cwd; Windows drive and UNC paths are accepted. */
  cwd: string
  /** Exact configured replay route; no default provider is selected. */
  provider: string
  /** Exact configured replay model. */
  model: string
  /** Explicit expected number of recorded model calls. */
  expectedCalls: number
}

/** JSONL buffers that have passed current schema/lifecycle and budget validation. */
export interface PreparedOfflineSnapshot {
  /** Materialized JSONL, including correctly escaped Windows paths. */
  fixtures: string[]
  /** Verified finite replay call count. */
  expectedCalls: number
}

function materialize(value: unknown, cwd: string): unknown {
  if (typeof value === 'string') return value.replaceAll('{{cwd}}', cwd)
  if (Array.isArray(value)) return value.map(item => materialize(item, cwd))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (key === 'arguments' && typeof item === 'string') {
        try { return [key, JSON.stringify(materialize(JSON.parse(item), cwd))] }
        catch (_invalidRecordedArguments) { /* Malformed tool arguments are legitimate replay input. */ }
      }
      return [key, materialize(item, cwd)]
    }))
  }
  return value
}

/**
 * Parse all rows before replacing cwd, then validate complete current Session semantics.
 * No Session provider, SDK subprocess, model, or module is started.
 * @param plan - explicit local fixtures, route, budget and cwd.
 * @returns materialized buffers only after every input has passed validation.
 */
export function prepareOfflineSnapshot(plan: OfflineSnapshotPlan): PreparedOfflineSnapshot {
  if (!plan.provider.trim() || !plan.model.trim()) throw new Error('offline snapshot requires explicit provider and model')
  if (!Number.isSafeInteger(plan.expectedCalls) || plan.expectedCalls < 1) throw new Error('offline snapshot requires a positive call budget')
  if (!/^(?:[A-Za-z]:[\\/]|\\\\|\/)/u.test(plan.cwd) || plan.cwd.includes('\0')) throw new Error('offline snapshot cwd must be absolute')
  if (plan.fixtures.length === 0) throw new Error('offline snapshot fixtures are required')
  let calls = 0
  const routes: string[] = []
  const fixtures = plan.fixtures.map((input) => {
    parseSessionLog(input)
    const lines = input.split(/\r?\n/u).filter(line => line.trim())
    const serialized = lines.map(line => JSON.stringify(materialize(JSON.parse(line), plan.cwd))).join('\n') + '\n'
    const events = parseSessionLog(serialized)
    calls += deriveReplayScript(events).length
    for (const event of events) {
      if (event.type !== 'request/header') continue
      const route = event.data.header.config
      if (route.provider !== plan.provider || route.model !== plan.model) throw new Error('offline snapshot route differs from the selected replay route')
      routes.push(route.provider)
    }
    return serialized
  })
  if (routes.length === 0 || calls !== plan.expectedCalls) throw new Error('offline snapshot route or exact call budget is missing')
  return { fixtures, expectedCalls: calls }
}

/**
 * Keep runner construction behind fixture, route and response-budget validation.
 * @param plan - explicit offline inputs.
 * @param start - caller's construction callback; never called on validation failure.
 * @returns the caller's result after passing prepared input.
 */
export function startPreparedOfflineSnapshot<T>(plan: OfflineSnapshotPlan, start: (prepared: PreparedOfflineSnapshot) => T): T {
  return start(prepareOfflineSnapshot(plan))
}
