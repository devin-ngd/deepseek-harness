/** Single-Session product entry reusing normal DSH services and independently supplied device/relay providers. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import * as Desktop from './index.ts'
import { DesktopFirstUse, type DesktopFirstUsePolicy, type DesktopFirstUsePorts } from './first-use.ts'
import type { P256IdentitySigner } from '../../src/e2e-channel.ts'
export { DesktopIdentitySigner } from './identity.ts'
export type { DesktopFirstUsePolicy, DesktopFirstUsePorts } from './first-use.ts'
/** Opt-in Cordis entry; the generic desktop service remains available separately. */
export const name = '@deepseek-ai/dsh-experimental-harmony-mobile/product'
/** Same deployment limits as the desktop adapter; enabled product use additionally requires sessionId. */
export const Config = Desktop.Config
export type { Options } from './index.ts'
function selection(ctx: Context, options: Desktop.Options): Desktop.Spec {
  const spec = Desktop.resolveOptions(options, Date.now)
  if (!spec.enabled) return spec
  if (spec.sessionId === null) throw new Error('harmony product entry requires an explicit sessionId')
  if (ctx.get('profileContext')?.name !== spec.profileId) throw new Error('harmony product entry requires the selected launcher profile')
  return spec
}
/** @param ctx - existing dsh-launched normal profile. @param authority - exact local enrollment decision owner. @param options - same explicit local product selection used for activation. @param policy - existing pairing/transport limits and phone identity; selection comes only from options. @param signer - existing protected desktop identity. @param clock - trusted host clock. @param openPorts - existing paired IO implementation; tests may inject memory ports. @returns original first-use owner with product selection bound before any offer/signature; no grant or transport is created. */
export async function createPairing(ctx: Context, authority: object, options: Desktop.Options, policy: Omit<DesktopFirstUsePolicy, 'desktopId' | 'profileId' | 'sessionId'>, signer: P256IdentitySigner, clock: () => number = Date.now, openPorts?: DesktopFirstUsePorts): Promise<DesktopFirstUse> {
  const spec = selection(ctx, options)
  if (!spec.enabled || spec.desktopId === null || spec.profileId === null || spec.sessionId === null) throw new Error('product pairing requires enabled local selection')
  await ctx.sessionController.inspect(spec.sessionId)
  return new DesktopFirstUse(ctx, authority, { ...policy, desktopId: spec.desktopId, profileId: spec.profileId, sessionId: spec.sessionId }, signer, clock, openPorts)
}
/** @param ctx - existing normal profile with canonical SessionController/RichInline and an independently authenticated device provider. @param options - local owner configuration; enabled requires exactly one existing sessionId, disabled acquires nothing. @returns after mounting the original desktop service with single-Session filtering; model/approval behavior remains owned by the normal profile. */
export async function apply(ctx: Context, options: Desktop.Options = {}): Promise<void> {
  const spec = selection(ctx, options)
  if (!spec.enabled) return
  await Desktop.apply(ctx, options)
}
