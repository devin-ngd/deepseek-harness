/** Both initialization acknowledgement and activation require nonempty public journal/head. */
import { deny } from './policy.mjs'
/** @param read - bounded regular-file reader. @param journal - exact selected public journal. @returns after both files are nonempty; no receipt is written on failure. */
export async function verifyPublicState(read, journal) {
  if ((await read(journal, 65536)).length === 0) deny('public-journal-empty')
  if ((await read(journal + '.head', 8192)).length === 0) deny('public-head-empty')
}
/** @param io - owned reader and exclusive evidence writer. @param journal - exact journal. @param receipt - owned completion receipt. @param now - observation clock. @returns completion only after both nonempty reads; failure preserves unknown state. */
export async function acknowledgePublicState(io, journal, receipt, now) {
  await verifyPublicState(io.read, journal)
  const result = { completed: true, observedAt: now, serviceChanged: false }
  await io.record(receipt, result); return result
}
