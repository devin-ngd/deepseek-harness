/** Canonical message windows sized for the phone before encrypted delivery. */
import type { SessionFollowFrame, SessionFollowRequest } from '../../src/upstream.ts'
import { LinkError } from '../../src/link-protocol.ts'

/** Deployment limits include room for the carrier envelope outside the snapshot. */
export interface SessionWindowPolicy { readonly maxMessages: number; readonly maxRecords: number; readonly maxBytes: number }

/** Even the smallest canonical window exceeds deployment limits; the carrier remains usable for other Sessions. */
export class SessionWindowTooLarge extends Error {
  readonly code = 'history-too-large'
  constructor() { super('history-too-large'); this.name = 'SessionWindowTooLarge' }
}

/**
 * Open a canonical message-aligned window, halving its message count when it exceeds the phone's limits.
 * @param follow - original Session service; every rejected window is closed before reopening.
 * @param policy - resolved deployment limits, independent of user Session content.
 * @param request - original Session selection and live-stream options.
 * @param signal - caller's read lifetime; accepted tasks remain independent.
 * @returns the admitted snapshot and its original live suffix. A single oversized message rejects without truncating events.
 */
export async function* sessionWindow(follow: (request: SessionFollowRequest, signal: AbortSignal) => AsyncIterable<SessionFollowFrame>, policy: SessionWindowPolicy, request: SessionFollowRequest, signal: AbortSignal): AsyncIterable<SessionFollowFrame> {
  let maxMessages = Math.min(request.maxMessages ?? policy.maxMessages, policy.maxMessages)
  while (true) {
    signal.throwIfAborted()
    const lifetime = new AbortController(), combined = AbortSignal.any([signal, lifetime.signal])
    const iterator = follow({ address: request.address, maxMessages, ...(request.assistantStream === undefined ? {} : { assistantStream: request.assistantStream }) }, combined)[Symbol.asyncIterator]()
    try {
      const first = await iterator.next()
      if (first.done || first.value.type !== 'snapshot') throw new LinkError('invalid-packet')
      if (first.value.records.length <= policy.maxRecords && new TextEncoder().encode(JSON.stringify(first.value)).byteLength <= policy.maxBytes) {
        yield first.value
        while (!combined.aborted) { const next = await iterator.next(); if (next.done) return; yield next.value }
        return
      }
      if (maxMessages === 1) throw new SessionWindowTooLarge()
    } finally { lifetime.abort(); await iterator.return?.() }
    maxMessages = Math.max(1, Math.floor(maxMessages / 2))
  }
}
