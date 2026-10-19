/** Narrow in-process dispatcher for a future independently authenticated device carrier; no listener or raw Gateway handle is exposed. */
import type { Context } from '@deepseek-ai/cordis'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-api-gateway'
import { fields, LinkError } from '../../src/link-protocol.ts'
/** @param ctx - enabled same-profile Gateway. @param peer - host-authenticated object from the carrier, never the JSON body. @param candidate - only metadata/request wire fields. @param signal - caller wait lifetime. @returns result from the fixed harmonyDesktop namespace; extra endpoint/identity fields reject before Gateway. */
export async function invokeProfile(ctx: Context, peer: PeerScope, candidate: unknown, signal: AbortSignal): Promise<unknown> {
  const value = fields(candidate, ['method', 'argument'])
  if (value.method !== 'metadata' && value.method !== 'request') throw new LinkError('scope-denied')
  if (value.method === 'metadata' && value.argument !== null) throw new LinkError('invalid-packet')
  return ctx.typertGateway.invoke({ namespace: 'harmonyDesktop', method: value.method, args: value.method === 'metadata' ? {} : { argument: value.argument, sessionId: ctx.harmonyDesktop.sessionFor(peer, value.argument) }, peer, signal })
}
/** @param ctx - enabled same-profile Gateway. @param peer - authenticated carrier identity. @param candidate - only follow argument/resume fields. @param signal - subscriber lifetime. @returns existing Gateway stream; no caller-selected namespace, method or peer is admitted. */
export async function followProfile(ctx: Context, peer: PeerScope, candidate: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown>> {
  const value = fields(candidate, ['argument', 'resume'])
  return ctx.typertGateway.stream({ namespace: 'harmonyDesktop', method: 'follow', args: { argument: value.argument, resume: value.resume, sessionId: ctx.harmonyDesktop.sessionFor(peer, value.argument) }, peer, signal })
}
