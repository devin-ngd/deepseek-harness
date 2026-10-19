/** Replay safety is captured while its owning services are live; teardown never requires reading released Cordis services. */
import type { nativeReplayLab } from './native-replay-lab.ts'

/** @param lab - owned synthetic service composition. @returns live replay counts after successful awaited closure; assertions or closure failures reject. */
export async function finishNativeReplayLab(lab: Awaited<ReturnType<typeof nativeReplayLab>>) {
  try {
    lab.ctx.llm.assertZeroRealCalls()
    const counts = lab.ctx.llm.getOfflineReplayCounts()
    return structuredClone(counts)
  } finally { await lab.close() }
}
