/** Extract only fixed enrollment markers; raw HILOG text, error messages and unknown fields are discarded. */
const stages = '(?:parse-offer|read-selected-phone-key|compare-selected-phone-key|hash-public-transcript|verify-desktop-signature|check-challenge-expiry|publish-preview|input-verified|preview-complete)'
const failures = '(?:crypto-input-invalid|crypto-public-key-invalid|crypto-verify-failed|crypto-hash-failed|key-public-export-failed|key-public-export-invalid|native-failure|native-error|TypeError|ReferenceError|SyntaxError|ZodError)'
const stagePattern = new RegExp('(?:^|\\s)DSH_ENROLLMENT_STAGE=(' + stages + ')$')
const refusalPattern = new RegExp('(?:^|\\s)DSH_ENROLLMENT_REFUSED stage=(' + stages + ') failure=(' + failures + ')$')
const transcriptPattern = /(?:^|\s)DSH_ENROLLMENT_TRANSCRIPT bytes=([1-9]\d{0,7}) sha256=([a-f0-9]{64})$/

/**
 * Return at most 64 fixed marker records from one bounded, app-scoped HILOG response.
 * @param {string} raw App-scoped HILOG response, held only in memory.
 * @returns {object[]} Allowed stage/category or public-transcript length/digest records.
 */
export function enrollmentMarkers(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 1048576) throw new Error('bounded enrollment log required')
  const records = []
  for (const line of raw.split(/\r?\n/)) {
    const stage = stagePattern.exec(line), refusal = refusalPattern.exec(line), transcript = transcriptPattern.exec(line)
    if (stage) records.push({ kind: 'stage', stage: stage[1] })
    else if (refusal) records.push({ kind: 'refusal', stage: refusal[1], category: refusal[2] })
    else if (transcript) records.push({ kind: 'public-transcript', bytes: Number(transcript[1]), sha256: transcript[2] })
  }
  return records.slice(-64)
}
