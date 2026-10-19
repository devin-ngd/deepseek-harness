/** Local desktop installation seam. JSON config cannot supply an identity signer or fabricate a device authorization owner. */
import type { Context } from '@deepseek-ai/cordis'
import { PairedDesktopRelay, type DesktopRelayPlan } from './relay-lifecycle.ts'
import type { DeviceAuthorizationOwner } from '../../integration/device-auth.ts'
/** Explicit existing local confirmation owner and exact native/Node transport plan. */
export interface DesktopPairingInstallation { readonly authority: object; readonly owner: DeviceAuthorizationOwner; readonly plan: DesktopRelayPlan }
/** @param ctx - current selected profile. @param enabled - explicit local activation decision, default false. @param installation - same-process local signer/grant owner. @param authority - exact local decision capability. @returns after registering owned provider effects, with no dial until the separately enabled plugin mounts. */
export function installDesktopPairingProvider(ctx: Context, enabled = false, installation?: DesktopPairingInstallation, authority?: object): void {
  if (!enabled) return
  if (installation === undefined || authority !== installation.authority || ctx.get('harmonyAuthenticatedDevices') !== undefined || ctx.get('harmonyRelayLifecycle') !== undefined) throw new Error('local desktop pairing installation denied')
  ctx.provide('harmonyAuthenticatedDevices', installation.owner)
  ctx.provide('harmonyRelayLifecycle', new PairedDesktopRelay(installation.owner, installation.plan))
}
