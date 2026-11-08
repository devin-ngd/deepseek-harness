/** Fixed startup stages and reasons; never expose input or exception text. */
import { PublicTrustError } from './public-trust.ts'
import { RelayLockError } from './recoverable-lock.ts'

export type StartupStage = 'config' | 'public-trust' | 'device-routes' | 'initialization' | 'listener'

/** A startup stage without user-controlled text. */
export class RelayStartupFailure extends Error {
  constructor(readonly stage: StartupStage, cause: unknown) { super('relay startup failed', { cause }) }
}

/** @param error - caught failure. @returns a bounded, content-free diagnostic. */
export function startupDiagnostic(error: unknown): string {
  const stage = error instanceof RelayStartupFailure ? error.stage : 'initialization'
  let cause: unknown = error
  let trustReason: string | undefined
  for (let depth = 0; depth < 8 && cause instanceof Error; depth++) {
    if (cause instanceof RelayLockError) return `relay startup stage=${stage} reason=lock-${cause.code}`
    if (cause instanceof PublicTrustError) trustReason = `trust-${cause.code}`
    const code: unknown = Reflect.get(cause, 'code')
    if (typeof code === 'string') {
      const reason: Record<string, string> = { EEXIST: 'already-exists', ENOENT: 'missing', EACCES: 'access-denied', EPERM: 'access-denied', ENOSPC: 'no-space', EADDRINUSE: 'address-in-use', EMFILE: 'fd-limit', ENFILE: 'fd-limit' }
      if (Object.hasOwn(reason, code)) return `relay startup stage=${stage} reason=${reason[code]}`
    }
    cause = cause.cause
  }
  return `relay startup stage=${stage} reason=${trustReason ?? 'unclassified'}`
}
