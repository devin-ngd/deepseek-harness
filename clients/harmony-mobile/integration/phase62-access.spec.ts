/** alpha.4 access decisions with real Peers and the maintained policy service; no credentials, sockets or models. */
import { Context } from '@deepseek-ai/cordis'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import Typert from '@deepseek-ai/dsh-typert-registry'
import { afterEach, expect, it } from 'vitest'
import { deviceRemotePolicy } from '../desktop-plugin/src/device-policy.ts'
import type { AuthenticatedDeviceScope } from '../desktop-plugin/src/admission.ts'
import { id } from '../src/protocol.ts'
const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
async function fixture() {
  const ctx = new Context(); contexts.push(ctx); await ctx.plugin(Typert); await ctx.plugin(RemoteAccess)
  let now = 1000, grant: AuthenticatedDeviceScope | undefined = { desktopId: id<'mobile-desktop'>('desktop'), deviceId: id<'mobile-device'>('phone'), epoch: 1, sessions: [id<'SessionId'>('allowed')], operations: ['session.sync', 'rich.status'], expiresAt: 2000, revoked: false }
  const principal = { kind: 'harmony-device' as const, desktopId: grant.desktopId, deviceId: grant.deviceId, epoch: 1 }, peer = new Peer(ctx, { principal, interactions: 'none' })
  const stop = ctx.remoteAccess.registerPolicy('harmony-device', deviceRemotePolicy(candidate => candidate === principal && !peer.signal.aborted ? grant : undefined, () => now))
  const args = (operation = 'session.sync') => ({ argument: { version: 'dsh-mobile-profile-rpc/1', packet: JSON.stringify({ desktopId: 'desktop', deviceId: 'phone', grantEpoch: 1, expiresAt: 1500, operation, payload: { sessionId: 'allowed' } }) }, sessionId: 'allowed' })
  const ask = (action: `${string}/${string}` | `event:${string}`, resource: 'global' | 'allowed' | 'foreign', call = args(), caller = principal) => ctx.remoteAccess.decide({ principal: caller, action, resources: resource === 'global' ? [{ kind: 'global' }] : [{ kind: 'session', id: id<'SessionId'>(resource) }], args: call })
  return { peer, principal, ask, args, stop, expire: () => { now = 2000 }, revoke: () => { if (grant !== undefined) grant = { ...grant, revoked: true } }, withdraw: () => { grant = undefined } }
}
it('device bindings allow only metadata and selected Session operations, without event or approval permissions', async () => {
  const f = await fixture()
  expect(f.peer.interactions).toBe('none'); expect(f.peer.principal.kind).toBe('harmony-device')
  expect(f.ask('harmonyDesktop/metadata', 'global')).toEqual({ kind: 'allow' })
  expect(f.ask('harmonyDesktop/request', 'allowed')).toEqual({ kind: 'allow' })
  expect(f.ask('harmonyDesktop/follow', 'allowed')).toEqual({ kind: 'allow' })
  for (const [action, resource, operation] of [['harmonyDesktop/request', 'global', 'session.sync'], ['harmonyDesktop/request', 'foreign', 'session.sync'], ['harmonyDesktop/request', 'allowed', 'task.submit'], ['harmonyDesktop/follow', 'allowed', 'rich.status'], ['session/prompt', 'allowed', 'session.sync'], ['event:interaction/request', 'allowed', 'session.sync']] as const) expect(f.ask(action, resource, f.args(operation)).kind).toBe('deny')
})
it('equal-looking fabricated identities, malformed commands and identity/epoch changes remain denied', async () => {
  const f = await fixture()
  expect(f.ask('harmonyDesktop/metadata', 'global', f.args(), { ...f.principal }).kind).toBe('deny')
  for (const change of [{ deviceId: 'other' }, { desktopId: 'other' }, { grantEpoch: 2 }, { expiresAt: 1000 }, { operation: 'approval.respond' }]) {
    const args = f.args(), command: Record<string, unknown> = JSON.parse(args.argument.packet)
    args.argument.packet = JSON.stringify({ ...command, ...change }); expect(f.ask('harmonyDesktop/request', 'allowed', args).kind).toBe('deny')
  }
  const args = f.args(); args.argument.packet = '{'; expect(f.ask('harmonyDesktop/request', 'allowed', args).kind).toBe('deny')
})
it.each(['expiry', 'revocation', 'withdrawal', 'peer-disposal', 'policy-disposal'] as const)('%s immediately withdraws device permission', async (cause: string) => {
  const f = await fixture(); expect(f.ask('harmonyDesktop/request', 'allowed').kind).toBe('allow')
  if (cause === 'expiry') f.expire()
  else if (cause === 'revocation') f.revoke()
  else if (cause === 'withdrawal') f.withdraw()
  else if (cause === 'peer-disposal') await f.peer.dispose()
  else f.stop()
  expect(f.ask('harmonyDesktop/request', 'allowed').kind).toBe('deny'); expect(f.ask('harmonyDesktop/metadata', 'global').kind).toBe('deny')
})
