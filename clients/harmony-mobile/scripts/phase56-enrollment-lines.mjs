/** Fixed parser diagnostics only; rejects unknown labels, additional fields and raw HILOG content. */
const stages = '(?:parse-offer|native-parse-json|shared-offer-input|decode-shared-input|shared-input-entered|shared-parse-json|shared-validate-offer|shared-check-expiry|shared-desktop-bytes|shared-phone-bytes|shared-serialize-input|shared-input-complete|read-selected-phone-key|compare-selected-phone-key|hash-public-transcript|verify-desktop-signature|check-challenge-expiry|publish-preview|input-verified|preview-complete)'
const failures = '(?:crypto-input-invalid|crypto-public-key-invalid|crypto-verify-failed|crypto-hash-failed|key-public-export-failed|key-public-export-invalid|native-failure|native-error|TypeError|ReferenceError|SyntaxError|ZodError)'
const stagePattern = new RegExp('(?:^|\\s)DSH_ENROLLMENT_STAGE=(' + stages + ')$'), refusalPattern = new RegExp('(?:^|\\s)DSH_ENROLLMENT_REFUSED stage=(' + stages + ') failure=(' + failures + ')$')
const transcriptPattern = /(?:^|\s)DSH_ENROLLMENT_TRANSCRIPT bytes=([1-9]\d{0,7}) sha256=([a-f0-9]{64})$/
const returnPattern = /(?:^|\s)DSH_ENROLLMENT_RETURN type=(string|undefined|object|number|boolean|bigint|symbol|function) units=(0|[1-9]\d{0,7})$/
/** @param {string} raw One bounded response from this app PID. @returns {object[]} At most 64 fixed records, without keys, inputs or raw messages. */
export function enrollmentMarkers(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 1048576) throw new Error('bounded enrollment log required')
  const records = []
  for (const line of raw.split(/\r?\n/)) {
    const stage = stagePattern.exec(line), refusal = refusalPattern.exec(line), transcript = transcriptPattern.exec(line), returned = returnPattern.exec(line)
    if (stage) records.push({ kind: 'stage', stage: stage[1] })
    else if (refusal) records.push({ kind: 'refusal', stage: refusal[1], category: refusal[2] })
    else if (transcript) records.push({ kind: 'public-transcript', bytes: Number(transcript[1]), sha256: transcript[2] })
    else if (returned) records.push({ kind: 'shared-return', type: returned[1], units: Number(returned[2]) })
  }
  return records.slice(-64)
}
