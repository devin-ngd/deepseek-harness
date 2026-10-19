/** Foreground read recovery has a finite budget and never retries task/action commands. */
import { TransportError } from './wire.ts'

/** Once is used by finite offline fixtures; bounded mode supervises only session.sync reads. */
export type FollowPolicy = { readonly mode: 'once' } | { readonly mode: 'bounded'; readonly maxSegments: number; readonly maxFailures: number; readonly retryDelayMs: number }
/** @param policy - explicit app-owned read lifetime. Throws before IO for invalid budgets. */
export function validateFollowPolicy(policy: FollowPolicy): void {
  if (policy.mode === 'once') return
  for (const value of [policy.maxSegments, policy.maxFailures, policy.retryDelayMs]) if (!Number.isSafeInteger(value) || value < 1) throw new TransportError('invalid-config')
}
/** @param delayMs - explicit recovery pause. @param signal - foreground lifetime. @returns after the pause, or rejects promptly on cancellation. */
export async function followPause(delayMs: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); signal.removeEventListener('abort', aborted); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve() }, delayMs)
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
  })
}
