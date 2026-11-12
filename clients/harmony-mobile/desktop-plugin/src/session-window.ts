/** Canonical message windows sized for the phone before encrypted delivery. */
import type { SessionFollowFrame, SessionFollowRequest } from '../../src/upstream.ts'
import { LinkError } from '../../src/link-protocol.ts'
import { E2E_PROTOCOL, type E2ELimits } from '../../src/e2e-channel.ts'
import { WIRE_TEXT_MAX } from '../../src/wire-fields.ts'

/** Default snapshot byte budget before applying the configured transport limit. */
export const DEFAULT_SNAPSHOT_MAX_BYTES = 4 * 1024 * 1024

// isWireId admits at most 128 unescaped ASCII characters.
const longestWireId = 'x'.repeat(128)
const encryptedHeaderBytes = JSON.stringify({
  protocol: E2E_PROTOCOL, bindingId: longestWireId, role: 'desktop', sequence: 0xffffffff, kind: 'data', ciphertext: '',
}).length
const snapshotEnvelopeBytes = JSON.stringify({
  kind: 'frame', id: '\u0000'.repeat(WIRE_TEXT_MAX),
  value: {
    protocol: 'dsh-mobile-wire/1', mode: 'desktop-profile', kind: 'reset',
    desktopId: longestWireId, deviceId: longestWireId, sessionId: longestWireId, instance: longestWireId,
    relayCursor: Number.MAX_SAFE_INTEGER, payload: null,
  },
}).length - 'null'.length

/**
 * @param limits - validated desktop encryption policy.
 * @param maxSocketFrameBytes - maximum message sent by the desktop socket.
 * @returns snapshot bytes that fit inside the application envelope and the encrypted frame.
 */
export function deviceSnapshotMaxBytes(limits: E2ELimits, maxSocketFrameBytes: number): number {
  const ciphertextBytes = Math.min(limits.maxFrameBytes, maxSocketFrameBytes) - encryptedHeaderBytes
  // Desktop ciphertext is unpadded Base64URL over the plaintext and a 16-byte GCM tag.
  const framePlaintextBytes = Math.floor(ciphertextBytes * 3 / 4) - 16
  const snapshotBytes = Math.min(limits.maxPlaintextBytes, framePlaintextBytes) - snapshotEnvelopeBytes
  if (snapshotBytes < 1) throw new Error('device carrier cannot fit a session snapshot')
  return Math.min(DEFAULT_SNAPSHOT_MAX_BYTES, snapshotBytes)
}

/** Deployment limits include room for the carrier envelope outside the snapshot. */
export interface SessionWindowPolicy { readonly maxMessages: number; readonly maxRecords: number; readonly maxBytes: number }
/** Prefer short history pages while retaining the normal hard limit for a single message. */
export interface HistoryPagePolicy extends SessionWindowPolicy {
  readonly targetBytes: number
  readonly turnWindow?: { readonly minMessages: number; readonly minTurns: number } | undefined
}

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
