/** Unactivated composite owner wiring. Both transport loss and grant revocation close the same crypto/socket lifetime; accepted tasks remain desktop-owned. */
import type { Context } from '@deepseek-ai/cordis'
import type { DeviceAuthorizationOwner } from './device-auth.ts'
import type { AuthenticatedDeviceChannel } from './device-auth-carrier.ts'
import type { EncryptedRelayConnection } from './e2e-socket.ts'
import type { DeviceTransportBinding } from './device-auth.ts'
import { bindConnectionLifetime, mountExpiryCleanup, type CleanupScheduler } from './connection-lifetime.ts'
/** @param ctx - future explicitly enabled desktop composition. @param owner - authorization owner. @param channel - independently authenticated device carrier. @param encrypted - fresh pinned E2E transport. @param binding - exact crypto binding used by the authentication handshake. @param scheduler - explicitly owned scheduler; fake in this batch. @param intervalMs - maximum cleanup polling delay. @returns async disposer; no timer, key or network is created by this helper itself. */
export function mountDeviceRelayLifetime(ctx: Context, owner: DeviceAuthorizationOwner, channel: AuthenticatedDeviceChannel, encrypted: EncryptedRelayConnection, binding: DeviceTransportBinding, scheduler: CleanupScheduler, intervalMs: number): () => Promise<void> {
  return ctx.effect(() => {
    let disconnect = Promise.resolve(), failed = false
    const stopLease = bindConnectionLifetime(channel.lifetime, () => encrypted.close())
    const stopTransport = bindConnectionLifetime(binding.signal, () => { disconnect = channel.close().catch(error => { void error; failed = true; encrypted.close() }) })
    const stopExpiry = mountExpiryCleanup(scheduler, intervalMs, () => owner.sweep(), async () => { encrypted.close(); await owner.close() })
    return async () => {
      stopLease(); stopTransport(); encrypted.close()
      const results = await Promise.allSettled([stopExpiry(), disconnect, channel.close(), encrypted.settled()])
      if (failed || results.some(value => value.status === 'rejected')) throw new Error('device relay cleanup failed')
    }
  })
}
