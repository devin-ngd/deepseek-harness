/** Node public-only verification of every shared history input; no identity signer or credentials are acquired. */
import { createHash } from 'node:crypto'
import { publicTrustVerificationInputs, PublicTrustHistoryError, publicTrustRecord, type PublicTrustDocument } from '../src/public-trust-protocol.ts'
import { verifyP256 } from './p256-public.ts'
/** @param document - strict full document. @param previous - exact saved anchor for replacement; absent for checking existing history. @returns after all predecessor digests and desktop signatures pass. */
export async function verifyPublicTrustHistory(document: PublicTrustDocument, previous?: PublicTrustDocument): Promise<void> {
  const key = publicTrustRecord(document).desktopPublicSpki
  for (const input of publicTrustVerificationInputs(document, previous)) {
    if (createHash('sha256').update(input.previousCanonical).digest('hex') !== input.previousDigest) throw new PublicTrustHistoryError('digest')
    if (!verifyP256(key, Uint8Array.from(input.bytes), input.signature)) throw new PublicTrustHistoryError('signature')
  }
}
