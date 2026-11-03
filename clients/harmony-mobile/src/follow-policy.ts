/** Foreground read supervision never retries task/action commands. */
import { TransportError } from './wire.ts'

/** Continuous mode follows the foreground lifetime with a consecutive failure budget; bounded mode also limits total read segments. */
export type FollowPolicy = { readonly mode: 'once' } | { readonly mode: 'bounded'; readonly maxSegments: number; readonly maxFailures: number; readonly retryDelayMs: number } | { readonly mode: 'continuous'; readonly maxFailures: number; readonly retryDelayMs: number }
/** @param policy - explicit app-owned read lifetime. Throws before IO for invalid budgets. */
export function validateFollowPolicy(policy: FollowPolicy): void {
  if (policy.mode === 'once') return
  const values = policy.mode === 'bounded' ? [policy.maxSegments, policy.maxFailures, policy.retryDelayMs] : [policy.maxFailures, policy.retryDelayMs]
  for (const value of values) if (!Number.isSafeInteger(value) || value < 1) throw new TransportError('invalid-config')
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
