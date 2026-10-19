/** Read only the existing shared HDC list and the approved target's public model if present; never start or restart a daemon. */
import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const executable = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe', base = ['-p', '-s', '127.0.0.1:8710'], env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP }
const run = args => spawnSync(executable, args, { env, windowsHide: true, encoding: 'utf8', timeout: 15000, maxBuffer: 1048576 })
const result = run([...base, 'list', 'targets']), raw = (result.stdout ?? '').trim(), empty = raw === '' || /^\[Empty\]$/i.test(raw), lines = result.status === 0 && !empty ? raw.split(/\r?\n/).filter(Boolean) : [], approved = lines.filter(value => createHash('sha256').update(value).digest('hex').startsWith('54cfb7ac'))
const help = run([...base, '-h']), helpLines = ((help.stdout ?? '') + '\n' + (help.stderr ?? '')).split(/\r?\n/).filter(line => /list targets|checkserver/.test(line)), verboseSupported = helpLines.some(line => /list targets.*-v/.test(line))
let verbose = { queried: false }
if (verboseSupported) {
  const response = run([...base, 'list', 'targets', '-v']), value = (response.stdout ?? '').trim(), rows = value === '' || /^\[Empty\]$/i.test(value) ? [] : value.split(/\r?\n/).filter(Boolean)
  verbose = { queried: true, hostExitCode: response.status, empty: rows.length === 0, rows: rows.filter(line => lines.some(known => known.trim().split(/\s+/)[0] === line.trim().split(/\s+/)[0])).map(line => { const fields = line.trim().split(/\s+/), matched = createHash('sha256').update(fields[0]).digest('hex').startsWith('54cfb7ac'); return { approvedTarget: matched, transport: fields.find(field => /^(?:USB|TCP|UART)$/i.test(field)) ?? 'unclassified', state: fields.find(field => /^(?:Connected|Offline|Unauthorized|Ready|Alive|Connecting)$/i.test(field)) ?? 'unclassified' } }) }
}
let probe = { attempted: false, succeeded: false }
if (result.status === 0 && lines.length === 1 && approved.length === 1) {
  const response = run([...base, '-t', approved[0], 'shell', 'param', 'get', 'const.product.model']), model = (response.stdout ?? '').trim()
  probe = { attempted: true, succeeded: response.status === 0 && model === 'CMM-AL10', hostExitCode: response.status, expectedModelMatched: model === 'CMM-AL10', rawOutputRetained: false }
}
const diagnostics = (result.stderr ?? ''), hints = { permissionDenied: /permission denied|access denied|拒绝访问/i.test(diagnostics), serverUnavailable: /connect.*fail|server.*(?:not|fail)|refused/i.test(diagnostics), authorizationRefused: /unauthorized|not authorized/i.test(diagnostics) }
const report = { at: new Date().toISOString(), continuationEvidence: 'Sentinel_dfada73deacc8191a4f9040f3ed89774', hostCommandSucceeded: result.status === 0, hostExitCode: result.status, stdoutBytes: Buffer.byteLength(result.stdout ?? ''), stderrBytes: Buffer.byteLength(diagnostics), helpStdoutBytes: Buffer.byteLength(help.stdout ?? ''), helpStderrBytes: Buffer.byteLength(help.stderr ?? ''), diagnosticHints: hints, listState: result.status === 0 ? raw === '' ? 'empty-output' : empty ? 'empty-list' : 'entries-present' : 'command-failed', emptyMarker: empty && raw ? '[Empty]' : null, targetEntryCount: lines.length, approvedTargetPresent: approved.length === 1, exactApprovedTargetAvailable: lines.length === 1 && approved.length === 1 && probe.succeeded, verbose, relevantHelp: helpLines, readOnlyProbe: probe, rawIdentifiersRetained: false, settingsChanged: false, serverStartedOrRestarted: false, installationAttempted: false, huksOperation: false, grantCreated: false }
const serialized = JSON.stringify(report, null, 2) + '\n'
await writeFile('evidence/phase60-hdc-history-' + report.at.replaceAll(':', '-').replaceAll('.', '-') + '.json', serialized, { flag: 'wx' })
await writeFile('evidence/phase60-hdc-inspection.json', serialized); console.log(JSON.stringify(report))
