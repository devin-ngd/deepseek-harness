/** Cold-safe Session list and search projection. */

import { performance } from 'node:perf_hooks'
import { scheduler } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type { ImageAttachmentLimits } from '@deepseek-ai/dsh-attachment'
import type { Session, SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import type { ProjectionSnapshot } from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-projection-cache'
import { applySessionListMetadata, SessionQueryError, type SessionRecord, type SessionSearchCursor } from '@deepseek-ai/dsh-session-query'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import {
  SESSION_COLD_RECOMPUTE_EVENT_LIMIT,
  SESSION_SEARCH_RESULT_LIMIT,
  SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS,
} from './types.ts'
import type {
  SessionListMetadata, SessionProjectionHints, SessionSearchItem,
  SessionSearchValue, SessionSummary,
} from './types.ts'

const SEARCH_PROVIDER_CALL_LIMIT = 100
const SESSION_SEARCH_QUERY_MAX_CHARS = 500
const MESSAGE_TYPES = new Set(['user/message', 'assistant/message'])

const imageLimitsSchema = z.object({
  maxImageBytes: z.number().int().positive(),
  maxImagesPerMessage: z.number().int().positive(),
  maxMessageImageBytes: z.number().int().positive(),
  maxImagePixels: z.number().int().positive(),
  maxImageDimension: z.number().int().positive(),
  mediaTypes: z.array(z.string()),
}) as unknown as z.ZodType<ImageAttachmentLimits>

/**
 * Return the longest prefix containing at most `maximum` Unicode code points.
 * @param value - source text.
 * @param maximum - maximum number of Unicode code points.
 * @returns the source text or its longest allowed prefix.
 */
export function truncateUnicodeCodePoints(value: string, maximum: number): string {
  let count = 0
  let end = 0
  for (const codePoint of value) {
    if (count === maximum) return value.slice(0, end)
    count++
    end += codePoint.length
  }
  return value
}

/** Owns list projection registration, bounded cold summaries, and authorized search. */
export class ApiSessionList {
  /**
   * @param ctx - Host context carrying Session, query, persistence, and projection services.
   * @param workSliceMs - Resolved positive integral list-work budget in milliseconds.
   */
  constructor(private readonly ctx: Context, private readonly workSliceMs: number) {}

  /**
   * Acquire projection readers before exposing dependent operations.
   * @returns when all required registrations are ready.
   */
  async initialize(): Promise<void> {
    await this.ctx.sessionProjections.register<'imageLimits', null>({
      key: 'imageLimits',
      stateSchema: z.null(),
      init: () => null,
      apply: state => state,
      wire: {
        viewSchema: imageLimitsSchema,
        view: () => this.ctx.attachments.imageLimits,
        summary: false,
      },
      stateVersion: 1,
    })
  }

  /**
   * Build one current attached-Session summary.
   * Blankness and recency come from `sessionQuery.getListMetadata`; projection
   * hints carry every summary key computed through `snapshot`. The first call
   * for a Session computes these projections over its whole in-memory log, and
   * later calls advance them incrementally. The metadata read and the hint with
   * the same key come from one cell; the metadata read does not depend on any
   * other unit's view.
   * @param session - attached Session to summarize.
   * @returns current list metadata and available projections.
   */
  summaryFor(session: Session): SessionSummary {
    const metadata = this.ctx.sessionQuery.getListMetadata(session)
    const projections = this.projectionsFor(session.header, session)
    return {
      sessionId: session.id,
      updatedAt: updatedAt(session.header, metadata),
      agentAvailable: this.ctx.agents.get(session.id)?.session === session,
      formatStatus: 'current',
      running: this.ctx.agents.get(session.id)?.status === 'running',
      blank: metadata.blank,
      ...listFields(session.header),
      ...(projections === undefined ? {} : { projections }),
    }
  }

  /**
   * Read every visible attached and persisted Session without activating an Agent.
   * @param signal - optional cancellation for persistence reads and summary generation.
   * @returns visible Session summaries ordered by activity.
   */
  async list(signal?: AbortSignal): Promise<SessionSummary[]> {
    signal?.throwIfAborted()
    const records = await this.ctx.sessionQuery.listSessions(signal)
    signal?.throwIfAborted()
    const items: SessionSummary[] = []
    const cold: SessionRecord[] = []
    let yieldDeadline = performance.now() + this.workSliceMs
    for (const record of records) {
      signal?.throwIfAborted()
      const live = this.ctx.sessions.get(record.header.id)
      if (live !== undefined) {
        items.push(this.summaryFor(live))
      } else if (record.header.cwd !== undefined) {
        cold.push(record)
      }
      if (performance.now() >= yieldDeadline) {
        await scheduler.yield()
        signal?.throwIfAborted()
        yieldDeadline = performance.now() + this.workSliceMs
      }
    }
    for (const record of cold) {
      signal?.throwIfAborted()
      const summary = this.summarizeCold(record, signal)
      items.push(summary instanceof Promise ? await summary : summary)
      if (performance.now() >= yieldDeadline) {
        await scheduler.yield()
        signal?.throwIfAborted()
        yieldDeadline = performance.now() + this.workSliceMs
      }
    }
    signal?.throwIfAborted()
    items.sort((left, right) => right.updatedAt - left.updatedAt)
    return items
  }

  /**
   * Summarize one persisted, unattached Session. The cached-metadata path is
   * synchronous, so cheap rows never leave the work slice; only a cache miss
   * returns a Promise for the bounded recompute.
   * @param record - the listed cold record.
   * @param signal - optional cancellation for the recompute read.
   * @returns the summary, or a promise of it when a recompute runs.
   */
  private summarizeCold(
    record: SessionRecord,
    signal: AbortSignal | undefined,
  ): SessionSummary | Promise<SessionSummary> {
    const projections = this.projectionsFor(record.header, undefined)
    const metadata = projections?.values.sessionListMetadata
    if (metadata !== undefined) return coldSummary(record, metadata, projections)
    return this.summarizeColdUncached(record, projections, signal)
  }

  /** The asynchronous cold row: a cache miss after the bounded recompute settles. */
  private async summarizeColdUncached(
    record: SessionRecord,
    cached: SessionProjectionHints | undefined,
    signal: AbortSignal | undefined,
  ): Promise<SessionSummary> {
    const recomputed = await this.recomputeColdMetadata(record, signal)
    return coldSummary(record, recomputed?.metadata, cached ?? recomputed?.projections)
  }

  /**
   * Answer one cold Session's list metadata from its log when the persisted
   * cache cannot — a missing row, or a predecessor row the unit's `migrate`
   * hook could not decide. The read is bounded: a prefix of
   * `SESSION_COLD_RECOMPUTE_EVENT_LIMIT` events through a read-only handle,
   * never an Agent activation. A log that fits the bound folds completely
   * through the cache's cold read, refreshing the stored record so later
   * listings serve it without log I/O; a started turn or command visible in
   * an oversize prefix still answers non-blank, with prompt recency as of the
   * prefix. A subagent child (its row
   * never gates on blank), a log needing format migration, an indecisive
   * oversize prefix, and any read failure leave the blankness unknown.
   * @param record - the listed cold record (its header witnesses the lifecycle).
   * @param signal - optional cancellation for the persistence read.
   * @returns the decided metadata plus the refreshed hint block when the full
   *   fold ran, or `undefined` when blankness stays unknown.
   */
  private async recomputeColdMetadata(
    { header, formatStatus }: SessionRecord,
    signal: AbortSignal | undefined,
  ): Promise<{ metadata: SessionListMetadata; projections?: SessionProjectionHints } | undefined> {
    if (header.origin === 'subagent') return undefined
    // A log the backend marks for migration predates the current format;
    // folding it with current units could misread its events. A backend that
    // does not classify still fails closed: its read path refuses old-format
    // logs, and the catch below keeps the row visible.
    if (formatStatus === 'migration-required') return undefined
    const persistence = this.ctx.get('sessionPersistence')
    if (persistence === undefined) return undefined
    try {
      const options = signal === undefined ? undefined : { signal }
      await using handle = await persistence.open(header.id, 'read', options)
      const { events } = await handle.read(0, SESSION_COLD_RECOMPUTE_EVENT_LIMIT + 1, options)
      signal?.throwIfAborted()
      if (events.length > SESSION_COLD_RECOMPUTE_EVENT_LIMIT) {
        // An oversize log is never hidden on partial evidence; a started turn
        // or command inside the prefix still answers non-blank, with prompt
        // recency as of the prefix (a stale lower bound, never overstated).
        let metadata: SessionListMetadata = { blank: true, lastPromptAt: null }
        for (const event of events) metadata = applySessionListMetadata(metadata, event)
        return metadata.blank ? undefined : { metadata }
      }
      const cache = this.ctx.get('sessionProjectionCache')
      if (cache !== undefined) {
        try {
          const snapshot = cache.coldSnapshot(header, handle.inheritedEventCount, events)
          const metadata = snapshot.values.sessionListMetadata
          if (metadata !== undefined) {
            const projections = hintsOf('cached', snapshot)
            return { metadata, ...projections === undefined ? {} : { projections } }
          }
        } catch {
          // Cached rows are disposable derived data; fold the small log directly.
        }
      }
      let metadata: SessionListMetadata = { blank: true, lastPromptAt: null }
      for (const event of events) metadata = applySessionListMetadata(metadata, event)
      return { metadata }
    } catch (error: unknown) {
      signal?.throwIfAborted()
      this.ctx.logger.warn(
        `api-session.list: cold metadata recompute for "${header.id}" failed; serving the row as unknown: ${String(error)}`,
      )
      return undefined
    }
  }

  /**
   * Search current visible message content without activating any matching Session.
   * @param query - literal message-content query.
   * @param signal - cancellation for list and search reads.
   * @returns authorized bounded Session search results.
   */
  async search(query: string, signal: AbortSignal): Promise<SessionSearchValue> {
    const normalizedQuery = normalizeSearchQuery(query)
    signal.throwIfAborted()
    const provider = this.ctx.get('sessionQuery')
    if (provider === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'session search is unavailable: this deployment does not mount @deepseek-ai/dsh-session-query',
        {},
      )
    }
    try {
      const visible = await provider.listSessions(signal)
      signal.throwIfAborted()
      const visibleIds = new Set(visible
        .filter(record => record.header.cwd !== undefined)
        .map(record => record.header.id))
      if (visibleIds.size === 0) return { items: [], hasMore: false }
      const authorized: SessionSearchItem[] = []
      const acceptedIds = new Set<SessionId>()
      const seenCursors = new Set<SessionSearchCursor>()
      let cursor: SessionSearchCursor | undefined
      let providerCalls = 0
      let pageLimit = SESSION_SEARCH_RESULT_LIMIT
      while (authorized.length <= SESSION_SEARCH_RESULT_LIMIT) {
        signal.throwIfAborted()
        if (providerCalls >= SEARCH_PROVIDER_CALL_LIMIT) {
          throw new Error(`session search provider exceeded the ${SEARCH_PROVIDER_CALL_LIMIT}-call work budget`)
        }
        providerCalls++
        const requestedCursor = cursor
        const requestedLimit = pageLimit
        let page
        try {
          page = await provider.searchSessions({
            query: normalizedQuery,
            eventFilters: [
              { kind: 'type', values: ['user/message', 'assistant/message'] },
              { kind: 'surface', values: ['current'] },
            ],
            limit: requestedLimit,
            ...(requestedCursor === undefined ? {} : { cursor: requestedCursor }),
          }, { signal })
          signal.throwIfAborted()
        } catch (error: unknown) {
          signal.throwIfAborted()
          if (requestedCursor === undefined
            && error instanceof SessionQueryError
            && error.code === 'SESSION_QUERY_INVALID_LIMIT'
            && requestedLimit > 1) {
            pageLimit = Math.max(1, Math.floor(requestedLimit / 2))
            continue
          }
          if (requestedCursor !== undefined
            && error instanceof SessionQueryError
            && error.code === 'SESSION_QUERY_STALE_CURSOR') {
            authorized.length = 0
            acceptedIds.clear()
            seenCursors.clear()
            cursor = undefined
            continue
          }
          throw error
        }
        if (page.items.length > requestedLimit) {
          throw new Error(`session search provider returned ${String(page.items.length)} items; maximum is ${String(requestedLimit)}`)
        }
        for (const hit of page.items) {
          if (authorized.length > SESSION_SEARCH_RESULT_LIMIT) continue
          if (!visibleIds.has(hit.header.id)
            || hit.bestMatch.sessionId !== hit.header.id
            || hit.bestMatch.surface !== 'current'
            || !MESSAGE_TYPES.has(hit.bestMatch.type)
            || acceptedIds.has(hit.header.id)) continue
          acceptedIds.add(hit.header.id)
          authorized.push({
            sessionId: hit.header.id,
            snippet: truncateUnicodeCodePoints(hit.bestMatch.snippet, SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS),
          })
        }
        if (page.nextCursor !== undefined) {
          if (seenCursors.has(page.nextCursor)) {
            throw new Error('session search provider repeated a continuation cursor')
          }
          seenCursors.add(page.nextCursor)
        }
        if (authorized.length > SESSION_SEARCH_RESULT_LIMIT || page.nextCursor === undefined) break
        cursor = page.nextCursor
      }
      return {
        items: authorized.slice(0, SESSION_SEARCH_RESULT_LIMIT),
        hasMore: authorized.length > SESSION_SEARCH_RESULT_LIMIT,
      }
    } catch (error: unknown) {
      signal.throwIfAborted()
      if (error instanceof SessionQueryError && error.code === 'SESSION_QUERY_ABORTED') {
        throw new RemoteError('gateway/cancelled', 'session search was aborted', {})
      }
      throw new RemoteError('gateway/internal', `session search failed: ${String(error)}`, {})
    }
  }

  private projectionsFor(
    header: SessionHeader,
    session: Session | undefined,
  ): SessionProjectionHints | undefined {
    try {
      // The registry derives the summary key set from its registrations and
      // hands back one stable set until the key table changes; both faces below
      // serve only those keys, so a list row cannot carry a unit that declares
      // itself summary-excluded.
      const keys = this.ctx.sessionProjections.summaryKeys()
      if (session !== undefined) {
        // The live registry computes the block for this Session: its watermark
        // shares the sequence space of the Session's baselines and frames.
        return hintsOf('sequenced', this.ctx.sessionProjections.snapshot(session, keys))
      }
      // A cold row reads the persisted cache by header alone; the cache serves
      // seeded and unseeded lifecycles alike because a listing never seeds a
      // fold. The watermark is the stored record's own.
      const cache = this.ctx.get('sessionProjectionCache')
      return hintsOf('cached', cache?.cachedSnapshot(header, keys) ?? cache?.cachedPredecessorTitle(header))
    } catch (error) {
      this.ctx.logger.warn(
        `api-session.list: projection column for "${header.id}" failed; serving the row without it: ${String(error)}`,
      )
      return undefined
    }
  }
}

/**
 * Wrap one summary projection block as Session-list hints of the named sequence space.
 * The block is the summary key set's values, not every value the source holds.
 * @param kind - which sequence space the block's watermark belongs to.
 * @param block - the block, or `undefined` when no source served one.
 * @returns the hints, or `undefined` when the block is absent or carries no value.
 */
function hintsOf(
  kind: SessionProjectionHints['kind'],
  block: ProjectionSnapshot | undefined,
): SessionProjectionHints | undefined {
  if (block === undefined || Object.keys(block.values).length === 0) return undefined
  // Listing hints contain every summary wire value the source holds; cached
  // hints remain partial because missing cache rows are never folded here.
  return { kind, asOfSeq: block.asOfSeq, values: block.values }
}

function normalizeSearchQuery(query: string): string {
  const normalized = query.trim()
  if (normalized.length === 0) {
    throw new RemoteError('gateway/bad-request', 'session search query must not be empty', {})
  }
  if (normalized.length > SESSION_SEARCH_QUERY_MAX_CHARS) {
    throw new RemoteError(
      'gateway/bad-request',
      `session search query must contain at most ${SESSION_SEARCH_QUERY_MAX_CHARS} UTF-16 code units`,
      {},
    )
  }
  if (normalized.includes('\0')) {
    throw new RemoteError('gateway/bad-request', 'session search query must not contain NUL', {})
  }
  return normalized
}

function updatedAt(header: SessionHeader, metadata: SessionListMetadata | undefined): number {
  return Math.max(header.createdAt, metadata?.lastPromptAt ?? 0)
}

/** Assemble one cold Session-list row from whatever metadata the cache or recompute decided. */
function coldSummary(
  { header, formatStatus }: SessionRecord,
  metadata: SessionListMetadata | undefined,
  projections: SessionProjectionHints | undefined,
): SessionSummary {
  return {
    sessionId: header.id,
    updatedAt: updatedAt(header, metadata),
    agentAvailable: false,
    ...(formatStatus === undefined ? {} : { formatStatus }),
    running: false,
    // Blankness the cache cannot decide and the bounded recompute could not
    // answer remains unknown: the row stays visible rather than hiding a
    // possibly real conversation.
    blank: metadata?.blank ?? false,
    ...listFields(header),
    ...(projections === undefined ? {} : { projections }),
  }
}

function listFields(header: SessionHeader): {
  readonly parentSessionId?: SessionId
  readonly origin?: 'subagent'
  readonly cwd?: string
} {
  return {
    ...(header.parentSession === undefined ? {} : { parentSessionId: header.parentSession }),
    ...(header.origin === undefined ? {} : { origin: header.origin }),
    ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
  }
}
