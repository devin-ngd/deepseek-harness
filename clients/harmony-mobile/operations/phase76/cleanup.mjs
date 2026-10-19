/** Both cleanup owners run once even when the other reports an unknown outcome. */
/** @param restoreLocal - original public configuration cleanup, never credential rollback. @param restoreRelay - original service/proxy cleanup, preserving journals. @returns independent verified or visibly unknown dispositions. */
export async function cleanupField(restoreLocal, restoreRelay) {
  let cleanup, relayCleanup
  try { cleanup = await restoreLocal() } catch (error) { cleanup = { originalPublicConfigRestored: false, code: error.code ?? 'cleanup-needs-review' } }
  try { relayCleanup = await restoreRelay() } catch (error) { relayCleanup = { restored: false, code: error.code ?? 'relay-cleanup-unknown' } }
  return { cleanup, relayCleanup }
}
