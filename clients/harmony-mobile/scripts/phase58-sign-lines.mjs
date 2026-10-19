/** Retain fixed HUKS operation stages and approved SDK codes without copying raw logs. */
import { enrollmentMarkers } from './phase56-enrollment-lines.mjs'
const stages = '(?:init|update|finish|abort|verify-public-signature|signature-verified)'
const codes = '(?:201|401|801|12000001|12000002|12000003|12000004|12000005|12000006|12000010|12000011|12000012|12000014|12000018|12000020|12000021|12000023|12000024|12000026|unavailable)'
const stagePattern = new RegExp('(?:^|\\s)DSH_HUKS_SIGN_STAGE=(' + stages + ')$')
const refusalPattern = new RegExp('(?:^|\\s)DSH_HUKS_SIGN_REFUSED stage=(' + stages + ') code=(' + codes + ')$')
const resultPattern = /(?:^|\s)DSH_HUKS_SIGN_RESULT bytes=(0|[1-9]\d{0,5})$/
/** @param {string} raw At most one MiB of this app PID's output. @returns {object[]} At most 64 public diagnostic records. */
export function signingMarkers(raw) {
  const records = enrollmentMarkers(raw)
  for (const line of raw.split(/\r?\n/)) {
    const stage = stagePattern.exec(line), refusal = refusalPattern.exec(line), result = resultPattern.exec(line)
    if (stage) records.push({ kind: 'sign-stage', stage: stage[1] })
    else if (refusal) records.push({ kind: 'sign-refusal', stage: refusal[1], code: refusal[2] })
    else if (result) records.push({ kind: 'sign-length', bytes: Number(result[1]) })
  }
  return records.slice(-64)
}
