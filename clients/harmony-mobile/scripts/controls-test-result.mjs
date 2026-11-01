/** Keep subprocess termination and reporter availability independent in offline test evidence. */
import { readFile } from 'node:fs/promises'

/** @param termination - settled child exit facts. @param report - expected Vitest JSON file. @returns counts only from a valid report, with a failure disposition when the reporter never ran. */
export async function controlsTestResult(termination, report) {
  let data
  try { data = JSON.parse(await readFile(report, 'utf8')) }
  catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    return { ...termination, passed: 0, failed: 0, reportState: error.code === 'ENOENT' ? 'missing' : 'invalid', success: false }
  }
  if (!Number.isSafeInteger(data.numPassedTests) || data.numPassedTests < 0 || !Number.isSafeInteger(data.numFailedTests) || data.numFailedTests < 0 || typeof data.success !== 'boolean') return { ...termination, passed: 0, failed: 0, reportState: 'invalid', success: false }
  return { ...termination, passed: data.numPassedTests, failed: data.numFailedTests, reportState: 'available', success: termination.code === 0 && termination.signal === null && !termination.timedOut && termination.spawnError === null && data.success && data.numPassedTests > 0 && data.numFailedTests === 0 }
}
