/** Gateway permissions for verified phone principals; Session operations remain subject to business admission. */
import type { PrincipalMap } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteAccessPolicy, RemoteAccessRole } from '@deepseek-ai/dsh-api-remote-access'
import type { AuthenticatedDeviceScope } from './admission.ts'
import type { DesktopId } from '../../src/protocol.ts'
import type { DeviceId } from '../../src/link-protocol.ts'
import { z } from 'zod'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** Public device identity fixed by the Host after proof verification; never an owner principal. */
    'harmony-device': { readonly kind: 'harmony-device'; readonly desktopId: DesktopId; readonly deviceId: DeviceId; readonly epoch: number }
  }
}
const catalog: RemoteAccessRole<'global'> = { name: 'harmony:catalog', resource: 'global', actions: ['harmonyDesktop/metadata'] }
const session: RemoteAccessRole<'session'> = { name: 'harmony:session', resource: 'session', actions: ['harmonyDesktop/request', 'harmonyDesktop/follow'] }
// The Gateway has validated the wrapper. These fields refine permission; the command owner still validates the complete packet.
const envelope = z.object({ desktopId: z.string(), deviceId: z.string(), grantEpoch: z.number(), operation: z.string(), expiresAt: z.number() })
/** @param current - exact principal-object lookup owned by verified Peer leases; fabricated copies return undefined. @param clock - grant and command expiry clock. @returns deny-by-default policy limited to metadata and named Sessions, without event or approval permissions. */
export function deviceRemotePolicy(current: (principal: PrincipalMap['harmony-device']) => AuthenticatedDeviceScope | undefined, clock: () => number): RemoteAccessPolicy<PrincipalMap['harmony-device']> {
  return { bindings: principal => {
    const grant = current(principal)
    if (grant === undefined || grant.revoked || grant.expiresAt <= clock()) return []
    return [{ role: catalog, resource: { kind: 'global' } }, ...grant.sessions.map(sessionId => ({ role: session, resource: { kind: 'session' as const, id: sessionId }, condition: ({ action, args }: { readonly action: string; readonly args?: Readonly<Record<string, unknown>> }) => {
      const live = current(principal)
      if (live === undefined || live.revoked || live.expiresAt <= clock() || !live.sessions.includes(sessionId)) return { kind: 'deny' as const, reason: 'device-inactive' }
      if (args === undefined) return { kind: 'deny' as const, reason: 'command-required' }
      const wrapper = z.object({ packet: z.string() }).safeParse(args.argument)
      if (!wrapper.success) return { kind: 'deny' as const, reason: 'command-invalid' }
      let decoded: unknown
      try { decoded = JSON.parse(wrapper.data.packet) }
      catch (error) { void error; return { kind: 'deny' as const, reason: 'command-invalid' } }
      const command = envelope.safeParse(decoded)
      if (!command.success || command.data.desktopId !== live.desktopId || command.data.deviceId !== live.deviceId || command.data.grantEpoch !== live.epoch
        || command.data.expiresAt <= clock() || !live.operations.some(operation => operation === command.data.operation)
        || action === 'harmonyDesktop/follow' && command.data.operation !== 'session.sync') return { kind: 'deny' as const, reason: 'command-denied' }
      return { kind: 'allow' as const }
    } }))]
  } }
}
