/** Finish the approved five-check connection budget; all retries are read-only and thirty seconds apart. */
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
const previous = ['phase65-preflight-2026-10-16T11-24-39-551Z.json', 'phase65-preflight-2026-10-16T11-25-57-995Z.json']
const checks = []
for (const path of previous) { const value = JSON.parse(await readFile('evidence/' + path, 'utf8')); checks.push({ at: value.at, exactApprovedTarget: value.exactApprovedTarget, targetCount: value.targetCount }) }
for (let index = checks.length; index < 5 && !checks.at(-1)?.exactApprovedTarget; index++) {
  await delay(30000)
  const result = spawnSync(process.execPath, ['scripts/phase65-preflight.mjs'], { windowsHide: true, encoding: 'utf8', timeout: 60000, maxBuffer: 1048576 })
  const value = JSON.parse(await readFile('.build/phase65-preflight-current.json', 'utf8'))
  if (checks.some(row => row.at === value.at)) throw new Error('Fresh query did not complete; no further retries')
  checks.push({ at: value.at, exactApprovedTarget: value.exactApprovedTarget, targetCount: value.targetCount, probeExitCode: result.status })
  console.log(JSON.stringify(checks.at(-1)))
  if (value.targetCount > 0 && !value.exactApprovedTarget) break
}
const report = { at: new Date().toISOString(), checks, checksUsed: checks.length, maximumChecks: 5, intervalMs: 30000, recovered: checks.at(-1)?.exactApprovedTarget === true, noFurtherAutomaticRetry: checks.at(-1)?.exactApprovedTarget !== true, mutations: 0 }
await writeFile('evidence/phase65-phone-retry-budget.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(report))
