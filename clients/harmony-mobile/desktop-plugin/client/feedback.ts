/** Display-only validation of public pairing results; parsing creates no identity or authorization. */
import { z } from 'zod'
import { deviceBindingSchema, deviceBindingOfferSchema } from '../../src/device-binding-protocol.ts'
import { deviceRouteOfferSchema, deviceRouteSchema } from '../../src/device-route-protocol.ts'

const MAX_PUBLIC_RESULT_BYTES = 32768
const identifier = z.string().min(1).max(256)
const publicSpki = z.string().regex(/^[A-Za-z0-9_-]{1,342}$/)
const publicIdentity = z.object({ publicSpki, credentialId: z.string().regex(/^p256-sha256-[a-f0-9]{64}$/) }).strict()
const status = z.object({ profileId: identifier, sessionId: identifier, state: z.enum(['not-started', 'offered', 'confirmed', 'transport-started']), publicResult: z.string().max(MAX_PUBLIC_RESULT_BYTES).optional(), steps: z.array(z.string()).max(6) }).strict()
const deviceState = z.object({ profileId: z.literal('desktop'), sessionId: identifier, state: z.enum(['not-bound', 'offered', 'bound', 'transport-started', 'transport-closed', 'transport-failed', 'stopped', 'revoked', 'route-offered', 'route-ready', 'route-required']), publicResult: z.union([deviceBindingOfferSchema, deviceBindingSchema, deviceRouteOfferSchema, deviceRouteSchema]).optional(), relayPair: z.object({ pairId: identifier, desktopPublicSpki: publicSpki, phonePublicSpki: publicSpki, epoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1), expiresAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1), revoked: z.boolean() }).strict().optional() }).strict()
const idKeys = new Set(['identityAlias', 'desktopId', 'profileId', 'deviceId', 'credentialId', 'desktopCredentialId', 'pairId', 'challengeId'])
const operations = new Set(['task.submit', 'task.receipt', 'session.cancel', 'session.sync', 'rich.mount', 'rich.snapshot', 'rich.saveDraft', 'rich.invoke', 'rich.status', 'rich.dispose'])
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function keys(value: Record<string, unknown>, expected: string[]): boolean { return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)) }
/** Reject any unreviewed display field; this is not a protocol or signature validator. */
function publicTree(value: unknown, sessionId: string, depth = 0, enrollment = false): boolean {
  if (depth > 8 || !object(value)) return false
  return Object.entries(value).every(([key, item]) => {
    if (idKeys.has(key)) return typeof item === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(item)
    if (['publicSpki', 'desktopPublicSpki', 'phonePublicSpki'].includes(key)) return typeof item === 'string' && /^[A-Za-z0-9_-]{1,342}$/.test(item)
    if (['nonce', 'signature'].includes(key)) return typeof item === 'string' && /^[A-Za-z0-9_-]{1,192}$/.test(item)
    if (key === 'previousDigest') return typeof item === 'string' && /^[a-f0-9]{64}$/.test(item)
    if (key === 'audience') return typeof item === 'string' && item.length <= 253 && /^[a-z0-9.-]+$/.test(item)
    if (key === 'schema') return ['harmony-first-use/1', 'harmony-product-public-trust/1', 'harmony-product-public-trust/2'].includes(typeof item === 'string' ? item : '')
    if (key === 'protocol') return item === (enrollment ? 'dsh-mobile-enrollment/1' : 'dsh-mobile-device-auth/1')
    if (['epoch', 'expiresAt', 'grantTtlMs', 'revokedEpoch'].includes(key)) return typeof item === 'number' && Number.isSafeInteger(item) && item >= 0
    if (['revoked', 'localRevoked'].includes(key)) return typeof item === 'boolean'
    if (key === 'sessions') return Array.isArray(item) && item.length === 1 && item[0] === sessionId
    if (key === 'operations') return Array.isArray(item) && item.length <= operations.size && item.every(operation => typeof operation === 'string' && operations.has(operation))
    if (key === 'history') return Array.isArray(item) && item.length <= 64 && item.every(entry => publicTree(entry, sessionId, depth + 1))
    if (key === 'receipt' && item === null) return true
    if (key === 'ticket') return depth === 0 && value.schema === 'harmony-first-use/1' && object(item) && keys(item, ['protocol', 'challengeId', 'desktopId', 'profileId', 'deviceId', 'credentialId', 'publicSpki', 'nonce', 'expiresAt']) && publicTree(item, sessionId, depth + 1, true)
    if (['paired', 'grant', 'record', 'phone', 'relayPair', 'receipt'].includes(key)) return publicTree(item, sessionId, depth + 1)
    if (key === 'next') return item === 'Import the public phone record and prepare the approved relay, then run /harmony-pair connect.'
    return false
  })
}

function confirmed(value: unknown, sessionId: string): object | undefined {
  if (!object(value) || !keys(value, ['phone', 'relayPair', 'next']) || !publicTree(value, sessionId) || !object(value.phone) || !object(value.relayPair)) return undefined
  const phone = value.phone, record = phone.schema === 'harmony-product-public-trust/2' && object(phone.record) ? phone.record : phone
  if (!['harmony-product-public-trust/1', 'harmony-product-public-trust/2'].includes(typeof phone.schema === 'string' ? phone.schema : '') || !object(record.paired) || record.paired.pairId !== value.relayPair.pairId) return undefined
  return { phone, relayPair: value.relayPair }
}

/** @param text - successful command output. @param sessionId - original Session identity. @returns only desktop device fields accepted for that Session. */
export function publicDeviceFeedback(text: string | undefined, sessionId: string): z.infer<typeof deviceState> | undefined {
  if (text === undefined || new TextEncoder().encode(text).length > MAX_PUBLIC_RESULT_BYTES) return undefined
  let value: unknown
  try { value = JSON.parse(text) } catch (error) { if (error instanceof SyntaxError) return undefined; throw error }
  const result = deviceState.safeParse(value)
  return result.success && result.data.sessionId === sessionId ? result.data : undefined
}

/** @param text - original successful command output. @param sessionId - event's original Session. @returns reviewed public JSON; unknown fields, oversized output and other Sessions are omitted. */
export function publicFeedback(text: string | undefined, sessionId: string): string | undefined {
  if (text === undefined || new TextEncoder().encode(text).length > MAX_PUBLIC_RESULT_BYTES) return undefined
  if (text === 'Desktop pairing transport started for the selected Session; task completion and phone authentication are separate.') return JSON.stringify({ sessionId, state: 'transport-started' }, null, 2)
  if (text === 'Desktop pairing challenge cancelled; no grant was created.') return JSON.stringify({ sessionId, state: 'challenge-cancelled' }, null, 2)
  if (text === 'Desktop grant revoked; relay public revocation remains separately owned.') return JSON.stringify({ sessionId, state: 'revoked' }, null, 2)
  let value: unknown
  try { value = JSON.parse(text) } catch (error) { if (error instanceof SyntaxError) return undefined; throw error }
  const device = deviceState.safeParse(value)
  if (device.success) return device.data.sessionId === sessionId ? JSON.stringify(device.data, null, 2) : undefined
  const state = status.safeParse(value)
  if (state.success) {
    if (state.data.sessionId !== sessionId) return undefined
    let publicResult: object | undefined
    if (state.data.publicResult !== undefined) {
      try { publicResult = confirmed(JSON.parse(state.data.publicResult), sessionId) } catch (error) { if (!(error instanceof SyntaxError)) throw error }
      if (publicResult === undefined) return undefined
    }
    return JSON.stringify({ profileId: state.data.profileId, sessionId, state: state.data.state, ...(publicResult === undefined ? {} : { publicResult }) }, null, 2)
  }
  const identity = publicIdentity.safeParse(value)
  if (identity.success) return JSON.stringify(identity.data, null, 2)
  if (object(value) && value.schema === 'harmony-first-use/1' && keys(value, ['schema', 'identityAlias', 'desktopPublicSpki', 'audience', 'pairId', 'ticket', 'sessions', 'operations', 'grantTtlMs', 'signature']) && publicTree(value, sessionId)) return JSON.stringify(value, null, 2)
  const paired = confirmed(value, sessionId)
  return paired === undefined ? undefined : JSON.stringify(paired, null, 2)
}
