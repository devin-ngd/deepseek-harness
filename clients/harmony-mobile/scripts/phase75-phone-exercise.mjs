/** Fixed synthetic phone acceptance through the owned native UI, with no guest injection or arbitrary input. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { connectionMarkers } from './phase68-connection-lines.mjs'
import { PLAN, hash, reviewApprovalRecord, reviewDesktop } from '../.build/phase75.1-complete-operation-plan/policy.mjs'
import { verifyPackage } from '../.build/phase75.1-complete-operation-plan/cli.mjs'
import { relayReady, desktopState } from '../.build/phase75.1-complete-operation-plan/local.mjs'
const root = PLAN.local.run, sealed = resolve('.build/phase75.1-complete-operation-plan')
const task = 'Show the fixed replay mobile forms.', cancelTask = 'Hold the fourth fixed response until cancellation.'
/** @param nodes - fresh owned layout attributes. @param command - closed native acceptance action. @param strings - pinned localized controls. @returns one visible enabled control or a refusal before input. */
export function selectedControl(nodes, command, strings) {
  const ids = { select: 'product-session-' + PLAN.session, 'input-task': 'product-composer', 'input-cancel': 'product-composer', 'send-task': 'product-send', 'send-cancel': 'product-send' }
  const names = { receipt: 'product_reconcile', cancel: 'cancel', 'restore-final': 'product_restore_saved' }
  assert.ok(command in ids || command in names, 'closed synthetic native action required')
  const selected = nodes.filter(node => node.visible === 'true' && (command in ids ? node.id === ids[command] : node.text === strings.get(names[command])))
  assert.equal(selected.length, 1, 'one visible owned control required'); assert.notEqual(selected[0].enabled, 'false')
  assert.equal(selected[0].type, command.startsWith('input-') ? 'TextInput' : 'Button')
  if (command.startsWith('input-')) assert.equal(selected[0].text ?? '', '', 'fixed task requires empty composer')
  return selected[0]
}
function point(node) { const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(node.bounds); assert.ok(match); const [left, top, right, bottom] = match.slice(1).map(Number); assert.ok(right > left && bottom > top); return [String(Math.floor((left + right) / 2)), String(Math.floor((top + bottom) / 2))] }
/** @param command - closed synthetic operation. @returns bounded acceptance evidence after live7, package, approval and owned-window checks. */
export async function exercise(command) {
  assert.ok(['layout', 'capture', 'connection-log', 'back', 'select', 'input-task', 'input-cancel', 'send-task', 'send-cancel', 'receipt', 'cancel', 'restore-final'].includes(command))
  assert.equal(process.platform, 'win32'); assert.ok(process.stdin.isTTY && process.stdout.isTTY)
  const approved = JSON.parse(await readFile('evidence/phase75.1-execution-approval.json', 'utf8')), verified = await verifyPackage()
  reviewApprovalRecord(approved, verified.planSha256, verified.manifestSha256)
  assert.equal(approved.sourceHumanMessageId, 'Sentinel_89e6422f7b5c8191a26ce3f3bee61489')
  assert.equal(JSON.parse(await readFile(join(root, 'operation.json'), 'utf8')).sourceHumanMessageId, approved.sourceHumanMessageId)
  const terminal = createInterface({ input: process.stdin, output: process.stdout })
  try { assert.equal(await terminal.question('Type EXERCISE PHASE75 ' + command + ': '), 'EXERCISE PHASE75 ' + command) } finally { terminal.close() }
  const location = JSON.parse(await readFile(join(sealed, 'location.json'), 'utf8'))
  const state = await desktopState(location)
  if (['layout', 'capture', 'back'].includes(command) && state.activeGrantCount === 0) { await readFile(join(root, 'start-attempt.json'), 'utf8'); reviewDesktop(state, PLAN.epochs.before, Date.now()) }
  else await relayReady(location)
  assert.equal(process.env.COMPUTERNAME?.toUpperCase(), 'DEVIN-MATEBOOK')
  const hdc = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe', base = ['-p', '-s', '127.0.0.1:8710']
  function run(args) { const r = spawnSync(hdc, args, { encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 4194304 }); if (r.error || r.status !== 0 || /\[Fail\]|\[Error\]/i.test(r.stdout)) throw new Error('owned HDC acceptance command unavailable'); return r.stdout }
  const targets = run([...base, 'list', 'targets']).trim().split(/\r?\n/).filter(value => value && value !== '[Empty]')
  assert.equal(targets.length, 1); assert.ok(hash(targets[0]).startsWith('54cfb7ac'))
  const device = (...args) => run([...base, '-t', targets[0], ...args]), sequence = Date.now()
  const remote = '/data/local/tmp/harmony-phase75-exercise-' + sequence, path = join(root, 'exercise-layout-' + sequence + '.json')
  assert.ok(device('shell', 'uitest', 'dumpLayout', '-b', PLAN.native.bundle, '-m', 'false', '-p', remote + '.json').trim().startsWith('DumpLayout saved to:' + remote + '.json'))
  device('file', 'recv', remote + '.json', path)
  const tree = JSON.parse(await readFile(path, 'utf8')), nodes = []
  function visit(value) { if (Array.isArray(value)) return value.forEach(visit); if (!value || typeof value !== 'object') return; if (value.attributes) nodes.push(value.attributes); if (value.children) visit(value.children) }
  visit(tree)
  const owned = nodes.some(node => node.bundleName === PLAN.native.bundle), foreign = nodes.some(node => node.bundleName && node.bundleName !== PLAN.native.bundle)
  const safe = nodes.map(node => ({ type: node.type, id: node.id, text: node.text?.startsWith('{') ? '[public JSON omitted]' : node.text, hint: node.hint, bounds: node.bounds, visible: node.visible, enabled: node.enabled, checked: node.checked }))
  await writeFile(path, JSON.stringify({ at: Date.now(), owned, foreign, nodes: owned && !foreign ? safe : [] }, null, 2) + '\n')
  assert.equal(owned, true); assert.equal(foreign, false, 'foreign UI blocks input and screenshots')
  const strings = new Map(JSON.parse(await readFile(join(sealed, 'native-strings.json'), 'utf8')).string.map(value => [value.name, value.value]))
  let result
  if (command === 'layout') result = { path, nodes: safe.filter(node => node.text || node.id || node.hint) }
  else if (command === 'connection-log') { const pid = device('shell', 'pidof', PLAN.native.bundle).trim(); assert.match(pid, /^\d+$/); const raw = device('shell', 'hilog', '-P', pid, '-x'); result = { pid, markers: connectionMarkers(raw), nativeErrorLines: raw.split(/\r?\n/).filter(line => /TypeError|ReferenceError|SyntaxError/.test(line)).length, rawLogRetained: false } }
  else if (command === 'capture') { const local = join(root, 'exercise-' + sequence + '.png'); device('shell', 'snapshot_display', '-f', remote + '.png'); device('file', 'recv', remote + '.png', local); result = { path: local, ownedBundleOnly: true } }
  else if (command === 'back') { device('shell', 'uitest', 'uiInput', 'keyEvent', 'Back'); result = { ownedBackRequested: true } }
  else {
    const node = selectedControl(nodes, command, strings), xy = point(node)
    if (command.startsWith('input-')) { const text = command === 'input-task' ? task : cancelTask; device('shell', 'uitest', 'uiInput', 'inputText', ...xy, text); result = { fixedSyntheticTextEntered: text } }
    else {
      if (command.startsWith('send-')) { const composer = nodes.filter(value => value.id === 'product-composer' && value.visible === 'true'); assert.equal(composer.length, 1); assert.equal(composer[0].text, command === 'send-task' ? task : cancelTask); await writeFile(join(root, 'exercise-' + command + '-attempt.json'), JSON.stringify({ at: Date.now(), exactSession: PLAN.session, fixedText: composer[0].text, outcome: 'unknown', onceOnly: true }) + '\n', { flag: 'wx' }) }
      if (command === 'cancel') await readFile(join(root, 'exercise-send-cancel-attempt.json'), 'utf8')
      device('shell', 'uitest', 'uiInput', 'click', ...xy); result = { clicked: command, session: PLAN.session }
    }
  }
  const receipt = join(root, 'exercise-' + command + '-receipt-' + sequence + '.json'); await writeFile(receipt, JSON.stringify({ at: Date.now(), command, result }, null, 2) + '\n', { flag: 'wx' })
  return { ...result, receipt }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) exercise(process.argv[2]).then(value => console.log(JSON.stringify(value))).catch(error => { console.error(JSON.stringify({ refusedOrUnknown: true, message: error.message, code: error.code ?? null, retryAutomatically: false })); process.exitCode = 1 })
