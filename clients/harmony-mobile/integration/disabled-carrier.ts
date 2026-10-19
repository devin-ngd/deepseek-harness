/** External HTTP carrier fixture: registration works, every transport/auth operation refuses, no socket or token is created. */
import type { Context } from '@deepseek-ai/cordis'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import type { HostConnectionHandle, ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'

/** Fixture plugin name. */
export const name = 'harmony-disabled-network-carrier'
/**
 * Supply a typed registration-only Connection; FileUploads remains the real implementation.
 * @param ctx - isolated replay context.
 * @returns after registering a Context-owned fixture; no network readiness is implied.
 */
export function apply(ctx: Context): void {
  const browserPeer = new Peer(ctx, { principal: { kind: 'owner' } }), routes = new Set<ConnectionFetchRoute>()
  const disabled = (): never => { throw new Error('HARMONY_FIXTURE_NETWORK_DISABLED') }
  const connection: HostConnectionHandle = {
    browserPeer, createPeer: options => new Peer(ctx, options), allowsRemoteAuthorities: false,
    rpc: { handle: () => async () => {}, intercept: () => async () => {} },
    fetch: { register: route => { routes.add(route); return async () => { routes.delete(route) } } },
    createSharedFetchHandler: disabled, requestRejection: () => 403, admit: () => ({ rejection: 403 }),
    admitConnection: () => ({ rejection: 403 }),
    authorizeIndex: () => false, authenticatedUrl: disabled,
  }
  ctx.provide('connection', connection)
}
