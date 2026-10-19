/** Typed view of the SDK-substitute harness only; no actual native operations are implied. */
import type { E2EPrimitives, P256IdentitySigner } from '../../src/e2e-channel.ts'
import type { NativePairingConfirmation } from '../../src/phone-pairing.ts'
import type { CleanupScheduler } from '../../integration/connection-lifetime.ts'
export interface NativePairingHarness {
  readonly signer: P256IdentitySigner
  readonly confirmation: NativePairingConfirmation
  readonly primitives: E2EPrimitives
  readonly decisions: readonly Record<string, string | number>[]
  decide(compared: boolean, allow: boolean): void
  close(): void
  generatedKeys(): number
  signatures(): number
}
export function nativePairingHarness(clock: () => number, scheduler: CleanupScheduler): Promise<NativePairingHarness>
