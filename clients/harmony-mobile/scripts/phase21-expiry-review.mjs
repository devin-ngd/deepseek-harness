/** Offline correlation of preserved fifth-window logs; no native process, SDK or listener is invoked. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const archive = 'evidence/phase20-round5-native/round5-resume1/'
const driverPath = archive + 'native-driver-result.json'
const driverBytes = await readFile(driverPath)
const driver = JSON.parse(driverBytes.toString('utf8'))
const logs = driver.records.filter(row => row.args.includes('hilog'))
const unique = [...new Set(logs.flatMap(row => row.output.split(/\r?\n/)))]
const expiredViews = unique.filter(line => line.includes('DSH native view:') && line.includes('error=request-expired'))
const correlations = []
for (const row of logs) {
  let latest = -Infinity
  for (const line of row.output.split(/\r?\n/)) {
    const time = /^10-12 (\d\d:\d\d:\d\d\.\d{3})/.exec(line)
    if (time) latest = Math.max(latest, Date.parse('2026-10-12T' + time[1] + '+08:00'))
  }
  if (Number.isFinite(latest)) correlations.push({ hostCommandCompletedAt: row.at,
    nativeLatestLogAt: new Date(latest).toISOString(), nativeMinusHostCompletionMs: latest - Date.parse(row.at) })
}
const closest = correlations.sort((a, b) => b.nativeMinusHostCompletionMs - a.nativeMinusHostCompletionMs).slice(0, 6)
const hap = JSON.parse(await readFile('evidence/phase17-hap.json', 'utf8'))
if (createHash('sha256').update(await readFile(hap.path)).digest('hex') !== hap.sha256) throw Error('Preserved HAP differs')
const policyPath = 'evidence/phase17-compiled-input-overrides/entry/src/main/resources/rawfile/native-policy.json'
const policy = JSON.parse(await readFile(policyPath, 'utf8'))
const adapter = await readFile('integration/native-replay-lab.ts', 'utf8')
if (policy.host.ttlMs !== 60000 || !adapter.includes('maxCommandTtlMs:60000')) throw Error('Historical TTL facts differ')
if (expiredViews.length !== 6 || correlations.length !== 249) throw Error('Preserved native observations differ')
const paths = ['src/link-protocol.ts', 'src/phone-core.ts', 'src/native-app-host.ts',
  'integration/native-replay-lab.ts', 'integration/native-follow-faults.ts', 'integration/loopback-bff.ts',
  'integration/mobile-bff.ts', 'scripts/phase17-native-driver.mjs', 'native-network-tests/phase17.spec.ts',
  'tests/command-expiry.test.mjs', 'tests/follow-recovery.test.mjs', 'network-tests/phase17.spec.ts', policyPath]
const sources = {}
for (const path of paths) sources[path] = createHash('sha256').update(await readFile(path)).digest('hex')
await mkdir('evidence/phase21-expiry', { recursive: true })
await writeFile('evidence/phase21-expiry/native-expiry-excerpts.log', expiredViews.join('\n') + '\n', { flag: 'wx' })
const report = { schema: 'dsh-harmony-offline-expiry-review/1', generatedAt: new Date().toISOString(),
  offlineOnly: true, nativeActivated: false, forwardCreated: false, nativeApprovalRequested: false,
  realModels: 0, uploads: 0, ttlRaised: false, expiryIgnored: false, systemTimeChanged: false,
  protocolChanged: false, historicalNativeOutcomeChanged: false, historicalHapRecompiled: false,
  historicalHap: { path: hap.path, sha256: hap.sha256, bytes: hap.bytes },
  originalLog: { path: driverPath, sha256: createHash('sha256').update(driverBytes).digest('hex'), bytes: driverBytes.length },
  nativeEvidence: { expiredViews: expiredViews.length, excerpts: 'evidence/phase21-expiry/native-expiry-excerpts.log',
    hilogReadouts: logs.length, timestampCorrelations: correlations.length, closest,
    readoutsContainingExpiresAt: logs.filter(row => row.output.includes('expiresAt')).length,
    offsetConclusion: 'HDC records contain completion time, not command start; the smallest 31ms lag does not measure client-host skew.' },
  findings: [
    { kind: 'confirmed-code-risk', cause: 'client TTL equals the desktop future limit; a client clock ahead by 1ms can reject a newly minted request', actualNativeBranchConfirmed: false },
    { kind: 'confirmed-admission-defect', cause: 'two clock observations could disagree within one expiry decision', fixed: 'one desktop clock observation', nativeCausalityConfirmed: false },
    { kind: 'confirmed-fixture-attribution-defect', cause: 'consumed records reservation before command admission; it is not evidence that fault bytes were written', fixed: 'separate written accounting after the bounded carrier write', nativeCausalityConfirmed: false },
    { kind: 'source-audit', result: 'native PhoneCore and replay BFF use Date.now epoch milliseconds; every recovery segment creates a new command identity and deadline' },
    { kind: 'fixture-audit', result: 'fixed event.time is only a fault payload after command admission; driver polling timestamps do not become expiresAt' }
  ],
  unresolved: 'Original commands did not log expiresAt and desktop checkedAt. The exact elapsed/future-limit branch and actual skew cannot be reconstructed from these logs.',
  nextEvidenceReady: { desktopOnlyExpiryReport: true, containsPayloadOrCredentials: false,
    wireErrorCode: 'request-expired', writtenDoesNotProvePhoneAdmission: true,
    remainingNativeCases: ['socket reset automatic recovery', 'cursor-gap', 'cursor-conflict'],
    retryAuthorization: 'Fifth window is closed; no native execution is authorized by this offline review.' },
  sources }
await writeFile('evidence/phase21-expiry-review.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ offlineOnly: true, expiryViews: expiredViews.length, clockSkewConfirmed: false, exactNativeRootCauseConfirmed: false, hapUnchanged: true }))
