/** Native UITest acceptance for the task-owned emulator app and fixed replay Host; never targets the paired app. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, link, unlink, readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createHash } from 'node:crypto'

const bundle = 'local.dsh.mobile.workspacecheck', target = '127.0.0.1:5555', server = '127.0.0.1:8710'
const pointerControl = process.argv.length === 3 && process.argv[2] === '--keyboard-pointer'
const keyboardReview = pointerControl || process.argv.length === 3 && process.argv[2] === '--keyboard'
assert.ok(process.argv.length === 2 || keyboardReview)
const driverSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')
const active = JSON.parse(await readFile('evidence/workspace-emulator-active.json', 'utf8'))
assert.equal(active.app, bundle); assert.ok(Date.now() - Date.parse(active.startedAt) < 5 * 60 * 1000, 'A newly prepared Host is required')
let projectPointer = keyboardReview ? 'evidence/workspace-keyboard-native-review-project.json' : active.scenario === 'creation' ? 'evidence/creation-native-review-project.json' : 'evidence/workspace-native-review-project.json'
try { projectPointer = JSON.parse(await readFile(join(active.world, 'native-project.json'), 'utf8')).path }
catch (error) { if (error.code !== 'ENOENT') throw error }
assert.ok(['evidence/workspace-keyboard-native-review-project.json', 'evidence/workspace-focus-native-review-project.json', 'evidence/creation-native-review-project.json', 'evidence/workspace-native-review-project.json', 'evidence/workspace-cipher-native-review-project.json', 'evidence/workspace-cipher-diagnostic-boot-native-review-project.json', 'evidence/creation-cipher-native-review-project.json', 'evidence/workspace-cipher-keyboard-native-review-project.json'].includes(projectPointer) || /^evidence\/workspace-cipher-diagnostic-rc2-\d+-native-review-project\.json$/.test(projectPointer) || /^evidence\/creation-cipher-rc2-\d+-native-review-project\.json$/.test(projectPointer))
const project = JSON.parse(await readFile(projectPointer, 'utf8')); assert.equal(project.bundleName, bundle)
assert.equal(project.nativeWss === true, active.nativeWss !== undefined)
const keyboardAttach = project.keyboardAttachDiagnostics === true
const keyboardPlainFirst = project.keyboardPlainFirst === true
const keyboardRefocusReview = project.keyboardRefocusReview === true
const devflowConflictReview = active.devflowConflictReview === true
const brickReview = active.brickReview === true
const archiveManagerReview = active.archiveManagerReview === true
const nativeReleaseReview = process.env.DSH_HARMONY_WORKSPACE_NATIVE_RELEASE_REVIEW === '1'
assert.equal(keyboardAttach, active.keyboardAttachDiagnostics === true)
assert.equal(keyboardPlainFirst, active.keyboardPlainFirst === true)
if (keyboardPlainFirst) assert.ok(keyboardAttach)
if (keyboardAttach) assert.ok(active.scenario === 'devflow' && project.keyboardDiagnostics === true && !keyboardReview)
if (keyboardRefocusReview) assert.ok(active.scenario === 'devflow' && keyboardReview && !pointerControl && active.nativeWss !== undefined)
if (devflowConflictReview) assert.ok(keyboardRefocusReview && !keyboardAttach)
if (brickReview) assert.ok(project.brickDiagnostics === true && active.scenario === 'devflow' && active.nativeWss !== undefined && !keyboardReview)
if (archiveManagerReview) assert.ok(project.archiveManagerDiagnostics === true && active.scenario === 'devflow' && active.nativeWss !== undefined && !keyboardReview)
if (nativeReleaseReview) assert.ok(typeof project.sourceFixture === 'string' && project.exactProductCore === true && active.nativeWss !== undefined && !keyboardReview)
assert.equal(project.creationAckLoss === true, active.creationAckLoss === true)
if (active.creationAckLoss === true) assert.ok(nativeReleaseReview && active.scenario === 'creation' && active.reconnectReview === true && !active.creationWork && !active.creationWorkspace)
const blankCreationWorkspace = process.env.DSH_HARMONY_WORKSPACE_NATIVE_BLANK_CREATION === '1'
const devflowSessionSettings = process.env.DSH_HARMONY_WORKSPACE_DEVFLOW_SESSION_TARGET !== undefined
const pagedBriefingReview = project.workspaceHandoffPagedHistory === true
assert.ok(!devflowSessionSettings || blankCreationWorkspace)
const pinnedRead = active.pinnedRead === true
const responseBodyReview = project.workspaceResponseBodyReview === true
assert.equal(responseBodyReview, active.workspaceResponseBodyReview === true)
assert.equal(pinnedRead, process.env.DSH_HARMONY_WORKSPACE_PINNED_READ !== undefined)
if (pinnedRead) assert.ok(nativeReleaseReview && active.scenario === 'creation' && /^session-[a-f0-9-]{36}$/.test(active.sessionId))
const pinnedInitializationFailure = project.pinnedInitializationFailure === true
assert.ok(!pinnedInitializationFailure || pinnedRead)
const pinnedLifecycle = process.env.DSH_HARMONY_WORKSPACE_PINNED_LIFECYCLE === '1'
const pinnedStartupTimeline = project.startupTimelineDiagnostic !== undefined
const pinnedNativeSelectionAudit = project.pinnedNativeSelectionAudit === true
assert.ok(!pinnedStartupTimeline || pinnedLifecycle)
assert.ok(!pinnedNativeSelectionAudit || pinnedLifecycle)
if (pinnedLifecycle) {
  assert.ok(pinnedRead && !pinnedInitializationFailure)
  const snapshot = JSON.parse(await readFile(process.env.DSH_HARMONY_WORKSPACE_PINNED_READ, 'utf8'))
  assert.equal(snapshot.synthetic, true)
}
if (responseBodyReview) assert.ok(pinnedRead && !pinnedLifecycle && !pinnedInitializationFailure)
assert.equal(blankCreationWorkspace, active.scenario === 'creation' && active.creationWorkspace === true && active.creationWork === false && !pinnedRead)
if (blankCreationWorkspace) assert.ok(nativeReleaseReview && (pagedBriefingReview || active.reconnectReview === true))
assert.equal(project.workspaceSessionHandoff === true, typeof active.handoffTitle === 'string')
if (active.handoffTitle !== undefined) assert.ok(blankCreationWorkspace && devflowSessionSettings && typeof active.handoffHistory === 'string')
assert.equal(project.workspaceHandoffCommandTail === true, typeof active.handoffLastReceipt === 'string')
assert.equal(pagedBriefingReview, typeof active.handoffNativeTail === 'string')
if (pagedBriefingReview) assert.ok(blankCreationWorkspace && active.reconnectReview === false && typeof active.handoffLastReceipt === 'string')
const foregroundBriefingReview = project.foregroundBriefingReview === true
if (foregroundBriefingReview) assert.ok(blankCreationWorkspace && typeof active.handoffLastReceipt === 'string')
if (keyboardReview) assert.equal(project.keyboardDiagnostics, true)
if (active.rpcDiagnostics === true) assert.equal(project.rpcDiagnostics, true)
const platform = JSON.parse(await readFile(join(project.target, 'platform.json'), 'utf8'))
const executable = join(platform.installedIdeDirectory, 'sdk/default/openharmony/toolchains/hdc.exe')
const run = resolve(active.world, 'native-acceptance'); await mkdir(run, { recursive: true })
const commands = [], checks = {}, artifacts = []; let sequence = 0, current = []
const keyboardSamples = [], lifecycleSamples = [], memorySamples = []
let pinnedColdStart
let pinnedUi
let pinnedNativeSelections
const keyboardAttachSamples = []
const devflowKeyboardFocusAttempts = []
let pointerSequence = 0
const startedAt = new Date().toISOString()
assert.equal(active.devicePort, 18082)
assert.ok(Number.isSafeInteger(active.hostPort) && active.hostPort > 0 && active.hostPort <= 65535)
const forward = ['tcp:18082', 'tcp:' + active.hostPort]
let wssForward
if (active.nativeWss !== undefined) {
  assert.equal(active.nativeWss.devicePort, 18083)
  assert.ok(Number.isSafeInteger(active.nativeWss.hostPort) && active.nativeWss.hostPort > 0 && active.nativeWss.hostPort <= 65535 && active.nativeWss.hostPort !== active.hostPort)
  wssForward = ['tcp:18083', 'tcp:' + active.nativeWss.hostPort]
}
let ownedForward = false, ownedWssForward = false, managedApp = false, finish, hostProcessId, diagnosticAppPid, recoveredCreationId
const channelLines = new Set()
async function publishFinish(value) {
  const temporary = join(active.world, 'finish-' + process.pid + '.next.json')
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
  await link(temporary, join(active.world, 'finish.json')); await unlink(temporary)
}
function hdc(args) {
  const result = spawnSync(executable, ['-p', '-s', server, '-t', target, ...args], { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, HDC_SERVER_PORT: '8710' } })
  commands.push({ at: new Date().toISOString(), args, code: result.status, signal: result.signal, error: result.error?.message })
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0)
  const output = result.stdout + result.stderr
  if (!pinnedRead || args[0] !== 'shell' || args[1] !== 'cat') assert.doesNotMatch(output, /\[Fail\]|\[Error\]/i)
  if (args[0] === 'shell' && args[1] === 'aa' && args[2] === 'start') {
    const code = /\bError Code:\s*(\d+)/i.exec(output)?.[1]
    assert.ok(code === undefined && /\bsuccess(?:ful(?:ly)?)?\b/i.test(result.stdout), `Emulator test app launch was not confirmed (${code ?? 'no acknowledgement'})`)
  }
  return result.stdout
}
async function captureChannelLog() {
  const pid = diagnosticAppPid ?? hdc(['shell', 'pidof', bundle]).trim()
  if (!/^\d+$/.test(pid)) return
  if (active.rpcDiagnostics === true) diagnosticAppPid = pid
  const raw = hdc(['shell', 'hilog', '-x', '-P', pid])
  const lines = raw.split(/\r?\n/).filter(line => pinnedRead
    ? /(?:DSH_WORKSPACE_LOAD stage=[a-z-]+|DSH_WORKSPACE_RPC operation=[a-z-]+ failure=[a-z-]+|WORKSPACE_CIPHER_E2E peer-verified|WORKSPACE_CIPHER_NATIVE_AUTHENTICATED|DSH_CONNECTION_STAGE=phone-(?:control|data)-http-upgraded at=\d+)$/.test(line)
      || pinnedStartupTimeline && /DSH_WORKSPACE_TIMELINE view=\d+ stage=[a-z-]+ at=\d+$/.test(line)
      || pinnedNativeSelectionAudit && /WORKSPACE_CIPHER_PINNED_NATIVE_SELECTION count=\d+$/.test(line)
    : /WORKSPACE_CIPHER_|WORKSPACE_FIXTURE_|DSH_WORKSPACE_(?:CONSOLE|RPC|LOAD)|DSH_E2E_STAGE|Parameter error|TypeError|TransportError/.test(line)
    || wssForward !== undefined && /DSH_CONNECTION_(?:STAGE|FAILURE|CLEANUP)/.test(line))
    .filter(line => !line.includes('WORKSPACE_CIPHER_VIEW') || /"error":"[^"]+/.test(line))
  for (const line of lines) if (channelLines.size < 512) channelLines.add(line.slice(0, 4096))
  const path = join(run, 'native-channel.log')
  await writeFile(path, [...channelLines].join('\n') + '\n'); if (!artifacts.includes(path)) artifacts.push(path)
}
async function confirmNativeWss() {
  if (wssForward === undefined) return
  await captureChannelLog()
  for (const marker of ['DSH_CONNECTION_STAGE=phone-control-http-upgraded', 'DSH_CONNECTION_STAGE=phone-data-http-upgraded',
    'WORKSPACE_CIPHER_E2E peer-verified', 'WORKSPACE_CIPHER_NATIVE_AUTHENTICATED']) {
    assert.ok([...channelLines].some(line => line.includes(marker)), marker)
  }
  checks.nativeWssAuthenticated = true
}
function collect(tree, output = []) { if (tree?.attributes) output.push(tree.attributes); for (const child of tree.children ?? []) collect(child, output); return output }
function bounds(node, field = 'bounds') { const match = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(node[field]); assert.ok(match); return match.slice(1).map(Number) }
function displayed(node) { if (node.visible !== 'true') return false; const [left, top, right, bottom] = bounds(node); return left >= 0 && top >= 0 && right > left && bottom > top }
function visible(node) { return node.enabled !== 'false' && displayed(node) }
async function layout() {
  const name = 'view-' + ++sequence, remote = '/data/local/tmp/dsh-workspace-' + process.pid + '-' + sequence + '.json', path = join(run, name + '.json')
  let document
  try {
    const dump = hdc(['shell', 'uitest', 'dumpLayout', '-b', bundle, '-m', 'false', '-p', remote])
    assert.ok(dump.includes(remote), 'UITest did not confirm the requested layout path')
    document = hdc(['shell', 'cat', remote])
  } finally {
    hdc(['shell', 'rm', '-f', remote])
  }
  assert.ok(document.trim(), 'UITest returned an empty layout for the emulator test app')
  current = collect(JSON.parse(document))
  assert.ok(current.every(row => !row.bundleName || row.bundleName === bundle))
  if (!current.some(row => row.bundleName === bundle)) {
    assert.ok(current.every(row => !row.type && !row.text), 'Only an empty startup layout may lack the owned application')
  }
  const saved = pinnedRead ? JSON.stringify(current.map(row => ({ id: row.id, type: row.type, enabled: row.enabled,
    visible: row.visible, bounds: row.bounds, textLength: row.text?.length ?? 0 }))) : document
  await writeFile(path, saved, { flag: 'wx' })
  artifacts.push(path); return current
}
async function wait(test, label, timeout = 60000, allowFailed = false) {
  const deadline = Date.now() + timeout
  do {
    await assertHostLive(); await layout(); if (await test(current)) return current
    if (diagnosticAppPid !== undefined && !current.some(row => row.bundleName === bundle)) {
      assert.equal(hdc(['shell', 'pidof', bundle]).trim(), diagnosticAppPid, 'The isolated diagnostic application exited')
    }
    assert.ok(allowFailed || !state('failed'), 'Workspace failed while waiting for ' + label)
    await delay(200)
  } while (Date.now() < deadline)
  throw new Error('Native state not confirmed: ' + label)
}
async function assertHostLive() {
  assert.ok(Number.isSafeInteger(hostProcessId)); process.kill(hostProcessId, 0)
  let bytes
  try { bytes = await readFile(join(active.world, 'probe.json'), 'utf8') }
  catch (error) { if (error.code !== 'ENOENT') throw error; return }
  const outcome = JSON.parse(bytes)
  assert.notEqual(outcome.passed, false, 'Installed Host fixture failed: ' + outcome.error)
}
function emulatorUnlocked() {
  const locks = hdc(['shell', 'hidumper', '-s', 'ScreenlockService', '-a', '-all'])
  return ['deviceLocked', 'screenLocked'].every(lock => new RegExp('^\\s*\\*\\s+' + lock + '\\s+false\\b', 'm').test(locks))
}
function unique(test) { const rows = current.filter(row => visible(row) && test(row)); assert.equal(rows.length, 1, 'Exactly one visible owned control is required'); return rows[0] }
// A click inside a few dozen pixels of the composer edge lands on the composer padding and focuses it instead of opening the Rich block.
const minimumRichOpenerHeight = 120
function uncoveredBounds(node) {
  const [left, initialTop, right, initialBottom] = bounds(node)
  if (!richEntry(node)) return [left, initialTop, right, initialBottom]
  const top = Math.max(initialTop, ...current.filter(row => visible(row) && row.type === 'tab').map(row => bounds(row)[3]))
  const composer = current.find(row => visible(row) && row.type === 'textField' && row.hint === '发消息或创建任务, / 调用指令, @ 文件或对话')
  return [left, top, right, composer === undefined ? initialBottom : Math.min(initialBottom, bounds(composer)[1])]
}
function tapAt([left, top, right, bottom]) {
  hdc(['shell', 'uitest', 'uiInput', 'click', String(Math.floor((left + right) / 2)), String(Math.floor((top + bottom) / 2))])
}
async function click(initial) {
  let node = initial
  if (richEntry(node)) {
    for (let attempt = 0; attempt < 6 && uncoveredBounds(node)[3] - uncoveredBounds(node)[1] < minimumRichOpenerHeight; attempt++) { await scrollNewer(); node = unique(richEntry) }
  }
  const rectangle = uncoveredBounds(node), [, top, , bottom] = rectangle
  if (richEntry(node)) assert.ok(bottom > top, 'The rich opener must have an uncovered clickable area')
  tapAt(rectangle); await layout()
}
const byId = id => unique(row => row.id === id)
const button = text => unique(row => row.type === 'button' && row.text === text)
const field = () => unique(row => row.type === 'textField' && row.hint === 'Note')
const state = value => current.some(row => row.id === 'workspace-fixture-state' && row.text.endsWith('/ ' + value))
const statuses = () => current.filter(row => row.type === 'status' && row.text).flatMap(row => { try { return [JSON.parse(row.text)] } catch { return [] } })
const hasAction = (id, value) => statuses().some(row => Array.isArray(row) && row.some(action => action.actionId === id && action.state === value))
const richEntry = row => row.type === 'button' && /Agent.*(?:交互内容|interactive content)/i.test(row.text)
const reloadEntry = row => row.type === 'button' && ['重新加载交互内容', 'Reload interactive content'].includes(row.text)
const reachableReload = row => reloadEntry(row) && bounds(row)[1] >= Math.max(0, ...current.filter(item => visible(item) && item.type === 'tab').map(item => bounds(item)[3]))
function observation(id) { return JSON.parse(unique(row => row.id === id).text) }
async function observeKeyboard(hint, value, phase = 'after-input') {
  if (!keyboardReview) return
  await wait(rows => rows.some(row => row.id === 'workspace-fixture-keyboard' && JSON.parse(row.text).height > 0) && rows.some(row => row.type === 'textField' && row.hint === hint && visible(row)), 'native keyboard and focused field')
  const keyboard = observation('workspace-fixture-keyboard'), input = unique(row => row.type === 'textField' && row.hint === hint)
  assert.equal(input.text, value)
  const web = bounds(unique(row => row.type === 'Web')), fieldBounds = bounds(input)
  assert.ok(fieldBounds[1] >= web[1] && fieldBounds[3] <= web[3], 'The focused field must fit the resized native Web')
  assert.ok(keyboard.areaHeight > 0 && keyboard.top > 0)
  assert.ok(web[3] <= keyboard.window.top + keyboard.top, 'The native Web must end above the system keyboard')
  if (hint === 'Note') {
    const action = bounds(button('Send action'))
    assert.ok(action[1] >= web[1] && action[3] <= web[3], 'The Rich submit button must remain above the keyboard')
  }
  if (hint === '发消息或创建任务, / 调用指令, @ 文件或对话') {
    const actions = current.filter(row => row.type === 'button' && row.text === '发送消息' && displayed(row))
    assert.equal(actions.length, 1)
    const action = bounds(actions[0])
    assert.ok(action[1] >= web[1] && action[3] <= web[3], 'The standard composer send button must remain above the keyboard')
  }
  keyboardSamples.push({ hint, value, phase, keyboard, web, fieldBounds }); checks.nativeKeyboardResize = true
}
async function writeInput(value) {
  await click(field())
  hdc(['shell', 'uitest', 'uiInput', 'keyEvent', '2072', '2017'])
  hdc(['shell', 'uitest', 'uiInput', 'text', value])
  await wait(rows => rows.some(row => row.type === 'textField' && row.hint === 'Note' && row.text === value && visible(row)), 'updated Rich note')
  assert.equal(field().text, value, 'Native key combination and text input must replace the field')
  await observeKeyboard('Note', value)
}
async function responses(expected) {
  const deadline = Date.now() + 60000
  do {
    await assertHostLive()
    const snapshots = (await readdir(active.world)).filter(name => /^live-\d{6}\.json$/.test(name)).sort()
    if (active.statusFormat === 'immutable-sequence' && snapshots.length === 0) { await delay(200); continue }
    const path = snapshots.at(-1) ?? 'live.json'
    const live = JSON.parse(await readFile(join(active.world, path), 'utf8'))
    if (live.responses === expected) return
    assert.ok(live.responses < expected); await delay(200)
  } while (Date.now() < deadline)
  throw new Error('Replay count not confirmed: ' + expected)
}
async function scrollNewer() {
  const [left, top, right, bottom] = bounds(unique(row => row.type === 'Web')), x = String(Math.floor(left + (right - left) * .72))
  hdc(['shell', 'uitest', 'uiInput', 'swipe', x, String(Math.floor(top + (bottom - top) * .65)), x, String(Math.floor(top + (bottom - top) * .4)), '600']); await layout()
}
async function scrollOlder([left, top, right, bottom] = bounds(unique(row => row.type === 'Web'))) {
  const x = Math.floor((left + right) / 2)
  hdc(['shell', 'uitest', 'uiInput', 'swipe', String(x), String(Math.floor(top + (bottom - top) * .2)), String(x), String(Math.floor(top + (bottom - top) * .8)), '2400']); await layout()
}
const textTarget = (text, type) => row => row.type === type && (row.text === text || type === 'textField' && (row.hint === text || row.hint.startsWith(text + ' ')))
  const clickText = async (text, type) => { await wait(rows => rows.some(row => visible(row) && textTarget(text, type)(row)), text); await click(unique(textTarget(text, type))) }
  const seek = async (text, type, direction, activate = true) => {
    const webView = row => row.type === 'Web' && visible(row)
    const requireWeb = async () => {
      if (current.some(webView)) return
      await wait(rows => {
        assert.ok(emulatorUnlocked(), 'Emulator locked while finding ' + text)
        return rows.some(webView)
      }, 'owned Web view while finding ' + text, 12000)
    }
    await requireWeb()
    const reachable = row => {
      if (!textTarget(text, type)(row)) return false
      const rectangle = bounds(row, row.origBounds ? 'origBounds' : 'bounds'), web = bounds(unique(item => item.type === 'Web'))
      return rectangle[1] >= Math.max(web[1], ...current.filter(item => visible(item) && item.type === 'tab').map(item => bounds(item)[3])) && rectangle[3] <= web[3]
    }
    for (let attempt = 0; !current.some(row => visible(row) && reachable(row)) && attempt < 24; attempt++) {
      const [left, top, right, bottom] = bounds(unique(row => row.type === 'Web')), x = String(Math.floor(left + (right - left) * .72))
      hdc(['shell', 'uitest', 'uiInput', 'swipe', x, String(Math.floor(top + (bottom - top) * (direction === 'older' ? .4 : .65))), x, String(Math.floor(top + (bottom - top) * (direction === 'older' ? .65 : .4))), '600']); await layout()
      await requireWeb()
    }
    const found = unique(reachable)
    if (activate) await click(found)
  }
async function closeFixtureWorkspace() {
  await click(byId('workspace-fixture-back'))
  await wait(rows => state('closed') && !rows.some(row => row.type === 'Web'), 'closed workspace removed')
}
function inputMethodLogs(pid) {
  return hdc(['shell', 'hilog', '-x', '-P', pid]).split(/\r?\n/)
    .filter(line => /WORKSPACE_KEYBOARD_GEOMETRY|AttachExec|requestKB|RequestKeyboard|ShowSoftKeyboard|ShowKeyboard|errcode\s*[=:]\s*80/i.test(line))
}
async function diagnoseKeyboardAttach() {
  const pid = hdc(['shell', 'pidof', bundle]).trim()
  assert.match(pid, /^\d+$/)
  const sample = async (kind, matches) => {
    const input = unique(matches)
    assert.deepEqual(bounds(input), bounds(input, 'origBounds'), 'The test click requires the full input bounds')
    const before = new Set(inputMethodLogs(pid))
    const clickedAt = new Date().toISOString()
    tapAt(bounds(input))
    await delay(4000)
    await wait(rows => rows.some(row => matches(row) && row.focused === 'true' && visible(row)), 'focused ' + kind, 15000)
    const keyboard = observation('workspace-fixture-keyboard')
    assert.ok(Number.isSafeInteger(keyboard.height) && keyboard.height >= 0)
    assert.equal(hdc(['shell', 'pidof', bundle]).trim(), pid)
    const inputMethodLines = inputMethodLogs(pid).filter(line => !before.has(line)).slice(-24)
    const snapshot = { kind, pid, clickedAt, observedAt: new Date().toISOString(), focused: true, keyboard, fieldBounds: bounds(input), inputMethodLines }
    keyboardAttachSamples.push(snapshot)
    const artifact = join(run, 'keyboard-attach-' + kind + '.json')
    await writeFile(artifact, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' }); artifacts.push(artifact)
    if (keyboard.height > 0) {
      hdc(['shell', 'uitest', 'uiInput', 'keyEvent', 'Back'])
      await wait(rows => state('ready') && rows.some(row => row.type === 'Web') && rows.some(row => row.id === 'workspace-fixture-keyboard'
        && JSON.parse(row.text).height === 0), 'keyboard dismissed in the same workspace', 15000)
    }
  }
  const sampleDevflow = async () => {
    await seek('名称 1', 'textField', 'newer', false)
    await sample('devflow', row => row.type === 'textField' && row.hint === '名称 1')
  }
  if (!keyboardPlainFirst) await sampleDevflow()
  const plain = row => row.type === 'textField' && row.text === 'Keyboard attachment control'
  await click(byId('workspace-fixture-plain-input'))
  await wait(rows => rows.some(row => plain(row) && visible(row)), 'ordinary input in the same ArkWeb surface')
  await sample('plain-web', plain)
  await click(byId('workspace-fixture-plain-input'))
  await wait(rows => !rows.some(plain) && rows.some(row => row.type === 'Web'), 'ordinary input removed')
  if (keyboardPlainFirst) await sampleDevflow()
  await sample('native', row => row.id === 'workspace-fixture-native-input')
  checks.keyboardAttachCompared = true
  await closeFixtureWorkspace()
}
async function focusDevflowName(target) {
  const matches = row => row.type === 'textField' && row.hint === '名称 1'
  const pid = hdc(['shell', 'pidof', bundle]).trim()
  assert.match(pid, /^\d+$/)
  const before = new Set(inputMethodLogs(pid))
  tapAt(bounds(target))
  await delay(4000)
  await wait(rows => rows.some(row => matches(row) && row.focused === 'true' && visible(row)), 'focused DevFlow name', 12000)
  const height = observation('workspace-fixture-keyboard').height
  assert.ok(Number.isSafeInteger(height) && height >= 0)
  const failures = inputMethodLogs(pid).filter(line => !before.has(line) && line.includes('inputmethod attach failed, errcode=80'))
  const attempt = { pid, height, failures, refocused: false }
  devflowKeyboardFocusAttempts.push(attempt)
  if (height === 0 && failures.length > 0) {
    await seek('高级配置', 'disclosureTriangle', 'older')
    await wait(rows => !rows.some(row => matches(row) && visible(row)), 'closed advanced settings')
    await seek('高级配置', 'disclosureTriangle', 'older')
    await seek('名称 1', 'textField', 'newer', false)
    const field = unique(matches)
    assert.equal(field.text, target.text)
    attempt.refocused = true
    tapAt(bounds(field))
    await delay(4000)
  }
  return attempt
}
async function synchronizeDesktop(operation, timeoutMs = 15000) {
  await writeFile(join(active.world, operation + '.request'), '', { flag: 'wx' })
  const deadline = Date.now() + timeoutMs
  do {
    await assertHostLive()
    if ((await readdir(active.world)).includes(operation + '.done')) return
    await delay(250)
  } while (Date.now() < deadline)
  assert.fail('Desktop did not acknowledge ' + operation)
}
async function devflow() {
  const select = async (label, option) => { await seek(label, 'comboBoxSelect', 'newer'); await clickText(option, 'Option') }
  const verifyConflict = async () => {
    const conflict = row => visible(row) && row.type === 'alert' && row.text === '[DEVFLOW_SETTINGS_CONFLICT] 设置已修改；保留草稿并重新读取'
    for (let attempt = 0; !current.some(conflict) && attempt < 12; attempt++) await scrollOlder()
    await wait(rows => rows.some(conflict), 'DevFlow settings revision conflict')
    checks.devflowConflictShown = true
    await synchronizeDesktop('devflow-conflict-observed')
    await seek('高级配置', 'disclosureTriangle', 'newer'); await seek('名称 1', 'textField', 'newer', false)
    assert.equal(unique(row => row.type === 'textField' && row.hint === '名称 1').text, 'Native delegate')
    checks.devflowDraftRetainedAfterConflict = true
    await seek('高级配置', 'disclosureTriangle', 'older'); await seek('重新读取', 'button', 'newer')
    await wait(rows => rows.some(row => visible(row) && textTarget('保存', 'button')(row)), 'DevFlow reload completed')
    await seek('高级配置', 'disclosureTriangle', 'older'); await seek('名称 1', 'textField', 'newer', false)
    assert.equal(unique(row => row.type === 'textField' && row.hint === '名称 1').text, 'Native delegate')
    checks.devflowDraftRetainedAfterReload = true
    await seek('高级配置', 'disclosureTriangle', 'older'); await clickText('保存', 'button'); await seek('已保存', 'status', 'newer', false)
    checks.devflowSavedAfterConflict = true
  }
  const input = async (hint, value) => {
    await seek(hint, 'textField', 'newer', false)
    const target = unique(row => row.type === 'textField' && row.hint === hint), previousText = target.text
    let focusAttempt
    if (pointerControl) {
      const sequence = ++pointerSequence
      await writeFile(join(active.world, 'pointer-ready-' + sequence + '.json'), JSON.stringify({ hint, previousText, bounds: bounds(target), at: new Date().toISOString() }) + '\n', { flag: 'wx' })
      const deadline = Date.now() + 5 * 60 * 1000
      let acknowledged = false
      while (Date.now() < deadline) {
        await assertHostLive()
        try { const result = JSON.parse(await readFile(join(active.world, 'pointer-done-' + sequence + '.json'), 'utf8')); assert.equal(result.sequence, sequence); assert.equal(result.applied, true); acknowledged = true; break }
        catch (error) { if (error.code !== 'ENOENT') throw error }
        await delay(200)
      }
      assert.equal(acknowledged, true, 'The external pointer control was not acknowledged')
    }
    else if (keyboardRefocusReview && hint === '名称 1') focusAttempt = await focusDevflowName(target)
    else await click(target)
    await observeKeyboard(hint, previousText, 'before-input')
    if (focusAttempt !== undefined) focusAttempt.confirmedHeight = observation('workspace-fixture-keyboard').height
    if (keyboardReview && hint === '名称 1') {
      hdc(['shell', 'uitest', 'uiInput', 'keyEvent', '2072', '2017']); hdc(['shell', 'uitest', 'uiInput', 'text', '键盘好']); await layout()
      await observeKeyboard(hint, '键盘好', 'unicode-input')
      hdc(['shell', 'uitest', 'uiInput', 'keyEvent', '2055']); await layout()
      assert.equal(unique(row => row.type === 'textField' && row.hint === hint).text, '键盘')
      checks.devflowUnicodeAndBackspace = true
    }
    hdc(['shell', 'uitest', 'uiInput', 'keyEvent', '2072', '2017']); hdc(['shell', 'uitest', 'uiInput', 'text', value]); await layout()
    assert.equal(unique(row => row.type === 'textField' && row.hint === hint).text, value)
    await observeKeyboard(hint, value)
    if (keyboardReview && hint === '名称 1') {
      hdc(['shell', 'uitest', 'uiInput', 'keyEvent', 'Back'])
      await wait(rows => rows.some(row => row.id === 'workspace-fixture-keyboard' && JSON.parse(row.text).height === 0) && rows.some(row => row.type === 'textField' && row.hint === hint && row.text === value), 'DevFlow keyboard dismissed with its draft retained')
      checks.devflowBackPreservesSettingsDraft = true
    }
  }
  await wait(rows => state('ready') && rows.some(row => row.text === 'WORKSPACE_DIRECT_OK'), 'direct baseline')
  checks.directBaseline = true
  await confirmNativeWss()
  const settingsVisible = rows => ['配置范围', '编排', '预设'].every(label => rows.some(row => visible(row) && textTarget(label, 'comboBoxSelect')(row)))
  await click(byId('workspace-fixture-plugins')); await wait(rows => state('ready') && rows.some(row => /查看 子智能体/.test(row.text)), 'standard plugin directory')
  await seek('查看 DevFlow', 'button', 'newer'); await wait(settingsVisible, 'standard DevFlow settings')
  await select('编排', '启用')
  await seek('高级配置', 'disclosureTriangle', 'newer'); await seek('添加档案', 'button', 'newer')
  if (keyboardAttach) { await diagnoseKeyboardAttach(); return }
  await input('名称 1', 'Native delegate'); await select('模型', 'workspace-replay / worker')
  await seek('高级配置', 'disclosureTriangle', 'older')
  if (devflowConflictReview) await synchronizeDesktop('devflow-desktop-save')
  await clickText('保存', 'button')
  if (devflowConflictReview) await verifyConflict()
  else await seek('已保存', 'status', 'newer', false)
  await seek('编码', 'comboBoxSelect', 'older'); await clickText('模型档案 · Native delegate', 'Option')
  await select('思考强度', 'high'); await seek('保存', 'button', 'newer'); await seek('已保存', 'status', 'newer', false)
  checks.standardSettingsAndWorkerHighSaved = true; await responses(1)
  await click(byId('workspace-fixture-open')); await wait(rows => state('ready') && rows.some(row => row.hint === '发消息或创建任务, / 调用指令, @ 文件或对话'), 'same Session reopened')
  await wait(rows => rows.some(row => row.text === 'DevFlow 启用') && rows.some(row => row.text === '选择模型，当前 main'), 'DevFlow Session contribution ready')
  await input('发消息或创建任务, / 调用指令, @ 文件或对话', 'Synthetic offline DevFlow acceptance: delegate to the configured worker.')
  await clickText('发送消息', 'button'); await responses(4); await wait(rows => rows.some(row => row.text === 'WORKSPACE_PARENT_OK'), 'parent completion')
  await clickText('DevFlow 启用', 'button'); await wait(rows => rows.some(row => row.text === '编码 · 只读') && rows.some(row => row.type === 'staticText' && row.text === '已完成'), 'completed readonly delegation')
  await click(unique(row => row.type === 'disclosureTriangle' && row.text.startsWith('运行 · ')))
  await wait(rows => rows.some(row => row.type === 'paragraph' && row.text.startsWith('workspace-replay/worker · ')), 'worker route')
  checks.readonlyWorkerCompleted = true
  if (keyboardReview || wssForward !== undefined) {
    await closeFixtureWorkspace()
    await click(byId('workspace-fixture-plugins'))
    await wait(rows => state('ready') && rows.some(row => /查看 子智能体/.test(row.text)), 'plugin directory after delegation')
    await seek('查看 DevFlow', 'button', 'newer')
    await wait(settingsVisible, 'saved DevFlow settings reopened')
    await seek('高级配置', 'disclosureTriangle', 'newer')
    await seek('名称 1', 'textField', 'newer', false)
    assert.equal(unique(row => row.type === 'textField' && row.hint === '名称 1').text, 'Native delegate')
    checks.devflowSettingsRestoredAfterReopen = true
  }
  await closeFixtureWorkspace()
  checks.workspaceWebRemoved = true
}
async function brick() {
  await wait(rows => state('ready') && rows.some(row => row.text === 'WORKSPACE_DIRECT_OK'), 'standard conversation with Brick')
  await confirmNativeWss()
  const account = row => visible(row) && row.text === '账号菜单' && ['button', 'popUpButton'].includes(row.type)
  const settings = row => visible(row) && row.text === '设置' && ['button', 'menuItem'].includes(row.type)
  const switchLabel = 'Brick 主题开关'
  const dialog = row => visible(row) && row.type === 'dialog' && row.text === '设置'
  const waitForDialog = () => wait(rows => rows.some(dialog), 'standard settings dialog')
  const revealSwitch = async () => {
    await waitForDialog()
    const reachable = row => {
      if (!visible(row) || row.type !== 'switch' || row.text !== switchLabel) return false
      const [left, top, right, bottom] = bounds(row, row.origBounds ? 'origBounds' : 'bounds')
      const [dialogLeft, dialogTop, dialogRight, dialogBottom] = bounds(unique(dialog))
      return left >= dialogLeft && right <= dialogRight && top >= dialogTop && bottom <= dialogBottom
    }
    for (let attempt = 0; !current.some(reachable) && attempt < 10; attempt++) {
      const [left, top, right, bottom] = bounds(unique(dialog)), x = String(Math.floor(left + (right - left) * .72))
      hdc(['shell', 'uitest', 'uiInput', 'swipe', x, String(Math.floor(top + (bottom - top) * .75)),
        x, String(Math.floor(top + (bottom - top) * .45)), '600'])
      await waitForDialog()
    }
    return unique(reachable)
  }
  const openSettings = async (brickEnabled = true) => {
    await wait(rows => rows.some(account), 'standard account menu')
    await click(unique(account))
    await wait(rows => rows.some(settings), 'standard settings menu item')
    await click(unique(settings))
    if (brickEnabled) await revealSwitch()
    else await waitForDialog()
  }
  const diagnostic = rows => rows.find(row => row.id === 'workspace-fixture-diagnostic')?.text
  const sample = async () => {
    const previous = diagnostic(current)
    await click(byId('workspace-fixture-inspect'))
    const rows = await wait(rows => diagnostic(rows)?.includes('brickBaseToken') && diagnostic(rows) !== previous, 'current Brick theme CSS and local preference')
    let value = JSON.parse(diagnostic(rows))
    if (typeof value === 'string') value = JSON.parse(value)
    return { ...value, brickBaseToken: value.brickBaseToken.toUpperCase() }
  }
  await openSettings()
  const enabled = await sample(); assert.equal(enabled.brickEnabled, 'true'); assert.ok(['#FAF8F3', '#171310'].includes(enabled.brickBaseToken))
  assert.ok(enabled.brickStored === null || enabled.brickStored === '1'); checks.brickDefaultTheme = true
  await click(await revealSwitch())
  const disabled = await sample(); assert.equal(disabled.brickEnabled, 'false'); assert.equal(disabled.brickStored, '0')
  assert.ok(disabled.brickBaseToken); assert.notEqual(disabled.brickBaseToken, enabled.brickBaseToken); checks.brickSwitchChangesToken = true
  await closeFixtureWorkspace()
  await click(byId('workspace-fixture-open'))
  await wait(rows => state('ready') && rows.some(row => row.text === 'WORKSPACE_DIRECT_OK'), 'same conversation after Brick reopen')
  await openSettings()
  const reopened = await sample(); assert.equal(reopened.brickEnabled, 'false'); assert.equal(reopened.brickBaseToken, disabled.brickBaseToken)
  checks.brickPreferenceRestoredAfterReopen = true
  await click(await revealSwitch())
  const reenabled = await sample(); assert.equal(reenabled.brickEnabled, 'true'); assert.equal(reenabled.brickBaseToken, enabled.brickBaseToken)
  if (enabled.brickStored === null) await click(byId('workspace-fixture-brick-reset'))
  const restored = await sample(); assert.equal(restored.brickEnabled, 'true'); assert.equal(restored.brickBaseToken, enabled.brickBaseToken)
  assert.equal(restored.brickStored, enabled.brickStored); checks.brickRestored = true
  assert.ok(Number.isFinite(restored.documentStartedAt))
  const observeBundleChange = async (operation, expectedSwitch, before) => {
    await synchronizeDesktop(operation)
    const deadline = Date.now() + 30000
    do {
      const value = await sample()
      assert.equal(value.documentStartedAt, before.documentStartedAt, 'A bundle change must keep the same ArkWeb document')
      assert.equal(value.brickStored, before.brickStored)
      if (value.brickEnabled === expectedSwitch) return value
    } while (Date.now() < deadline)
    assert.fail('ArkWeb did not apply ' + operation)
  }
  const bundleDisabled = await observeBundleChange('brick-disable', undefined, restored)
  checks.brickSettingsRowRemovedLive = true
  await closeFixtureWorkspace()
  await click(byId('workspace-fixture-open'))
  await wait(rows => state('ready') && rows.some(row => row.text === 'WORKSPACE_DIRECT_OK'), 'same conversation with Brick disabled')
  await openSettings(false)
  const reopenedWithoutBundle = await sample()
  assert.notEqual(reopenedWithoutBundle.documentStartedAt, bundleDisabled.documentStartedAt)
  assert.equal(reopenedWithoutBundle.brickEnabled, undefined)
  assert.equal(reopenedWithoutBundle.brickStored, restored.brickStored)
  assert.equal(reopenedWithoutBundle.brickBaseToken, disabled.brickBaseToken)
  checks.brickThemeRemovedAfterReopen = true
  const bundleEnabled = await observeBundleChange('brick-enable', 'true', reopenedWithoutBundle)
  assert.equal(bundleEnabled.brickBaseToken, enabled.brickBaseToken)
  checks.brickSettingsRowRestoredLive = true
  const themeLayerRemovedOnDisable = bundleDisabled.brickBaseToken === disabled.brickBaseToken
  const proof = join(run, 'brick-settings.json')
  await writeFile(proof, JSON.stringify({ enabled, disabled, reopened, restored, bundleDisabled, reopenedWithoutBundle, bundleEnabled, themeLayerRemovedOnDisable }, null, 2) + '\n', { flag: 'wx' }); artifacts.push(proof)
  await closeFixtureWorkspace(); checks.workspaceWebRemoved = true
}
async function archiveManager() {
  await wait(rows => state('ready') && rows.some(row => row.text === 'WORKSPACE_DIRECT_OK'), 'standard conversation before opening archive settings')
  await confirmNativeWss()
  const account = row => row.text === '账号菜单' && ['button', 'popUpButton'].includes(row.type)
  if (!current.some(row => visible(row) && account(row))) await click(unique(row => row.type === 'button' && row.text === '打开侧边栏'))
  await wait(rows => rows.some(row => visible(row) && account(row)), 'standard account menu')
  await click(unique(account))
  const settings = row => row.text === '设置' && ['button', 'menuItem'].includes(row.type)
  await wait(rows => rows.some(row => visible(row) && settings(row)), 'standard settings menu item')
  await click(unique(settings))
  const dialog = row => row.type === 'dialog' && row.text === '设置'
  await wait(rows => rows.some(row => visible(row) && dialog(row)), 'standard settings dialog')
  const rectangle = () => bounds(unique(dialog))
  const within = (row, actionable = true) => {
    if (actionable ? !visible(row) : !displayed(row)) return false
    const [left, top, right, bottom] = bounds(row, row.origBounds ? 'origBounds' : 'bounds')
    const [x0, y0, x1, y1] = rectangle()
    return left >= x0 && top >= y0 && right <= x1 && bottom <= y1
  }
  const nav = row => row.type === 'button' && row.text === '归档会话' && within(row)
  for (let attempt = 0; !current.some(nav) && attempt < 3; attempt++) {
    const [left] = rectangle()
    const anchors = current.filter(row => row.type === 'button' && ['内置插件', 'Agent 预设'].includes(row.text) && within(row))
    assert.ok(anchors.length > 0, 'The settings navigation row must contain a reachable swipe start')
    const [x0, top, x1, bottom] = bounds(anchors.at(-1)), y = String(Math.floor((top + bottom) / 2))
    hdc(['shell', 'uitest', 'uiInput', 'swipe', String(Math.floor((x0 + x1) / 2)), y, String(left + 64), y, '600'])
    await layout()
  }
  await click(unique(nav))
  await wait(rows => rows.some(row => visible(row) && row.type === 'heading' && row.text === '归档会话'), 'original archive settings')
  checks.archiveManagerSettings = true
  const diagnostic = rows => rows.find(row => row.id === 'workspace-fixture-diagnostic')?.text
  await click(byId('workspace-fixture-inspect'))
  const sampled = diagnostic(await wait(rows => diagnostic(rows)?.includes('titleWidth'), 'ArkWeb archive title width'))
  let dimensions = JSON.parse(sampled)
  if (typeof dimensions === 'string') dimensions = JSON.parse(dimensions)
  assert.ok(dimensions.viewport <= 720 && dimensions.titleWidth > 0 && dimensions.navWidth > 188)
  assert.equal(dimensions.rows, 1); assert.equal(dimensions.pageOverflow, false)
  checks.compactArchiveTitle = true
  const proof = join(run, 'archive-manager-settings.json')
  await writeFile(proof, JSON.stringify(dimensions, null, 2) + '\n', { flag: 'wx' }); artifacts.push(proof)
  const seekInDialog = async (matches, newer, activate = true) => {
    const reachable = row => matches(row) && within(row, activate)
    for (let attempt = 0; !current.some(reachable) && attempt < 10; attempt++) {
      const [left, top, right, bottom] = rectangle(), x = String(Math.floor(left + (right - left) * .63))
      const first = String(Math.floor(top + (bottom - top) * .76)), second = String(Math.floor(top + (bottom - top) * .50))
      hdc(['shell', 'uitest', 'uiInput', 'swipe', x, newer ? first : second, x, newer ? second : first, '600'])
      await layout()
    }
    if (activate) await click(unique(reachable))
    else assert.ok(current.some(reachable), 'The archive settings notice must be reachable')
  }
  await seekInDialog(row => /workspaceRegistry\/favoriteSessions.*access denied/.test(row.text), true, false)
  checks.legacyFavoriteDenied = true
  await seekInDialog(row => /checkbox/i.test(row.type) && (row.text || row.hint || '').startsWith('选择会话'), false)
  await seekInDialog(row => row.type === 'button' && row.text === '恢复所选', false)
  await wait(rows => rows.some(row => row.text === '暂无已归档会话'), 'archive list after restoring the selected Session')
  checks.archiveRestoredInWeb = true
  await closeFixtureWorkspace(); checks.workspaceWebRemoved = true
}
async function memory(label) {
  const pid = hdc(['shell', 'pidof', bundle]).trim(); assert.match(pid, /^\d+$/)
  const output = hdc(['shell', 'hidumper', '--mem', pid]), path = join(run, 'memory-' + label + '.txt')
  await writeFile(path, output); artifacts.push(path); memorySamples.push({ label, pid: Number(pid), path })
}
async function repeatLifecycle() {
  await memory('closed-baseline')
  for (let cycle = 1; cycle <= 5; cycle++) {
    const openedAt = Date.now(); await click(byId('workspace-fixture-open'))
    await wait(rows => state('ready') && rows.some(row => row.type === 'textField' && row.hint === '发消息或创建任务, / 调用指令, @ 文件或对话'), 'usable reopened conversation')
    const open = observation('workspace-fixture-measurement'); assert.equal(open.phase, 'native-ready')
    const uiObservedOpenMs = Date.now() - openedAt; await memory('open-' + cycle)
    const closedAt = Date.now(); await click(byId('workspace-fixture-back')); await wait(rows => state('closed') && !rows.some(row => row.type === 'Web'), 'repeated Web removal')
    const close = observation('workspace-fixture-measurement'); assert.equal(close.phase, 'native-closed')
    lifecycleSamples.push({ cycle, nativeReadyMs: open.elapsedMs, nativeCloseMs: close.elapsedMs, uiObservedOpenMs, uiObservedCloseMs: Date.now() - closedAt })
    await memory('closed-' + cycle); await responses(4)
  }
  assert.equal(new Set(memorySamples.map(row => row.pid)).size, 1)
  checks.repeatedOpenCloseWithoutModel = true
}
async function openPinnedRead(launchRequestedAt) {
  const pinned = 'product-session-' + active.sessionId
  const historyText = row => row.text.length >= 40 &&
    (!pinnedLifecycle || row.text.includes('Synthetic workspace briefing response'))
  const failure = rows => rows.some(row => row.id === 'product-error' && displayed(row))
  const nativeHistory = rows => rows.some(row => row.id === 'product-chat-back' && displayed(row))
    && rows.some(row => row.type === 'Text' && historyText(row) && displayed(row))
  const timelinePrefix = 'product-workspace-back--timeline--'
  const timelineId = row => row.id?.startsWith(timelinePrefix)
  const standardWorkspace = rows => rows.some(row => (row.id === 'product-workspace-back' || timelineId(row)) && displayed(row))
  const observePinnedUi = rows => {
    const controls = ['product-chat-back', 'product-chat-workspace', 'product-workspace-back', 'product-workspace-retry', 'product-error', 'product-page-scroll']
    return {
      controls: Object.fromEntries(rows.filter(row => controls.includes(row.id) && displayed(row)).map(row => [row.id, visible(row)])),
      visibleWebViews: rows.filter(row => row.type === 'Web' && displayed(row)).length,
      nativeTextLengths: rows.filter(row => row.type === 'Text' && displayed(row)).map(row => row.text.length).slice(0, 40),
      nativeHistory: nativeHistory(rows),
      standardWorkspace: standardWorkspace(rows),
    }
  }
  await wait(rows => rows.some(row => row.id === pinned && visible(row)), 'pinned native session')
  const pinnedListMs = Math.round(performance.now() - launchRequestedAt)
  await confirmNativeWss()
  const selectedAt = performance.now()
  await click(byId(pinned))
  await wait(rows => nativeHistory(rows) || failure(rows), 'pinned native history', 120000)
  assert.ok(!failure(current), 'Pinned native history returned an error')
  checks.nativePinnedHistoryOpened = true
  pinnedUi = { native: observePinnedUi(current) }
  if (pinnedNativeSelectionAudit) await captureChannelLog()
  if (pinnedInitializationFailure) {
    await click(byId('product-chat-workspace'))
    await wait(rows => nativeHistory(rows) && failure(rows) &&
      rows.some(row => row.text.startsWith('工作区暂时无法使用。') && displayed(row)), 'native workspace initialization refusal')
    assert.ok(!current.some(row => row.id === 'product-workspace-back' && displayed(row)))
    await captureChannelLog()
    assert.equal([...channelLines].filter(line => line.endsWith('DSH_WORKSPACE_LOAD stage=native-init')).length, 1)
    assert.ok(![...channelLines].some(line => line.includes('DSH_WORKSPACE_RPC operation=prepare')))
    checks.nativePinnedWorkspaceInitializationRefused = true
    await click(byId('product-error-dismiss'))
    await wait(rows => nativeHistory(rows) && !failure(rows), 'native history after dismissing the workspace error')
    checks.nativePinnedHistoryRetainedAfterRefusal = true
    return
  }
  const preview = row => row.type === 'dialog' && row.text === '预览版说明' && visible(row)
  const unavailable = row => row.id === 'product-workspace-retry' && displayed(row)
  const webHistory = rows => standardWorkspace(rows)
    && rows.some(row => row.type === 'paragraph' && historyText(row) && displayed(row))
  const captureTimeline = project.startupTimelineDiagnostic?.capture === 'uitest-back-id'
  const captureResources = project.startupTimelineDiagnostic?.captureResources === true
  const measureMemory = pinnedLifecycle && !pinnedStartupTimeline
  const cycles = pinnedStartupTimeline ? 2 : pinnedLifecycle ? 6 : 1
  if (pinnedLifecycle) {
    pinnedColdStart = { pinnedListMs, nativeHistoryMs: Math.round(performance.now() - selectedAt) }
    if (measureMemory) await memory('pinned-native-baseline')
  }
  for (let cycle = 1; cycle <= cycles; cycle++) {
    const openedAt = performance.now()
    await click(byId('product-chat-workspace'))
    await wait(rows => rows.some(row => preview(row) || unavailable(row)) || webHistory(rows), 'pinned standard Web history', 120000)
    const previewShown = current.some(preview)
    if (previewShown) {
      await click(button('继续'))
      await wait(rows => rows.some(unavailable) || webHistory(rows), 'pinned standard Web history after preview', 120000)
    }
    assert.ok(!current.some(unavailable), 'Pinned standard Web returned an error')
    checks.nativePinnedWorkspaceOpened = true
    if (responseBodyReview) {
      const verified = row => displayed(row) && row.text === 'Workspace response bodies verified'
      const failed = row => displayed(row) && row.text.startsWith('Workspace response probe failed')
      await wait(rows => rows.some(row => verified(row) || failed(row)), 'ArkWeb response body probe', 45000)
      const failure = current.find(failed)
      assert.equal(failure, undefined, failure?.text)
      assert.ok(current.some(verified))
      checks.nativeWorkspaceResponseBodies = true
    }
    pinnedUi.web = observePinnedUi(current)
    const openMs = Math.round(performance.now() - openedAt)
    let nativeTimeline
    if (captureTimeline) {
      await wait(rows => rows.some(row => timelineId(row) && visible(row)), 'native startup timing readback')
      const [view, ...pairs] = unique(timelineId).id.slice(timelinePrefix.length).split('|')
      const assetTiming = captureResources ? pairs.pop() : undefined
      const marks = pairs.map(pair => {
        const match = /^([a-z-]+)=(\d+)$/.exec(pair)
        assert.ok(match, 'Native startup timing field must be content-free')
        return [match[1], Number(match[2])]
      })
      assert.deepEqual(marks.map(([stage]) => stage), ['owner-open', 'prepare-start', 'prepared', 'load-url', 'document-response', 'port-bind', 'web-ready'])
      assert.ok(marks.every(([, at], i) => Number.isSafeInteger(at) && (i === 0 || at >= marks[i - 1][1])))
      assert.match(view, /^\d+$/)
      nativeTimeline = { view: Number(view), at: Object.fromEntries(marks) }
      if (captureResources) {
        assert.match(assetTiming, /^assets=\d+(?:,\d+){9}$/)
        assert.equal(nativeTimeline.at['owner-open'], 0)
        const fields = ['count', 'hits', 'inFlight', 'overflow', 'coveredMs', 'queueMs', 'carrierMs', 'cacheCheckMs', 'responseMs', 'afterLastResponseMs']
        const values = assetTiming.slice('assets='.length).split(',').map(Number)
        const resources = Object.fromEntries(fields.map((name, i) => [name, values[i]]))
        const windowMs = nativeTimeline.at['port-bind'] - nativeTimeline.at['document-response']
        assert.ok(resources.count > 0 && resources.hits <= resources.count && resources.inFlight <= resources.count)
        assert.equal(resources.overflow, 0)
        assert.ok(values.slice(4).every(ms => ms <= windowMs))
        nativeTimeline.resources = resources
      }
    }
    if (measureMemory) await memory('pinned-open-' + cycle)
    const closedAt = performance.now()
    await click(captureTimeline ? unique(timelineId) : byId('product-workspace-back'))
    await wait(rows => {
      pinnedUi.returned = observePinnedUi(rows)
      return pinnedUi.returned.nativeHistory && !pinnedUi.returned.standardWorkspace
    }, 'native history after closing standard Web')
    assert.ok(!failure(current), 'Returning to pinned history returned an error')
    const closeMs = Math.round(performance.now() - closedAt)
    if (pinnedNativeSelectionAudit) await captureChannelLog()
    if (pinnedLifecycle) {
      lifecycleSamples.push({ cycle, previewShown, openMs, closeMs, ...(nativeTimeline === undefined ? {} : { nativeTimeline }) })
      if (measureMemory) await memory('pinned-closed-' + cycle)
    }
  }
  checks.nativePinnedWorkspaceReturned = true
  if (captureTimeline) {
    assert.notEqual(lifecycleSamples[0].nativeTimeline.view, lifecycleSamples[1].nativeTimeline.view)
    checks.pinnedStartupTimelineRecorded = true
  }
  if (measureMemory) {
    await delay(10000)
    await memory('pinned-idle-after-close')
    assert.equal(new Set(memorySamples.map(row => row.pid)).size, 1)
    checks.pinnedSameProcessReopenedFiveTimes = true
  }
}

async function reviewDirectBriefing(approve) {
  const targetId = 'product-session-' + active.sessionId
  const nativeMarker = active.handoffNativeTail ?? active.handoffHistory
  const nativeBriefing = rows => rows.some(row => row.id === 'product-chat-back' && visible(row))
    && rows.some(row => row.type === 'Text' && row.text === active.handoffTitle && displayed(row))
    && rows.some(row => (row.type === 'Text' || row.type === 'Span') && row.text?.includes(nativeMarker) && displayed(row))
    && !rows.some(row => row.type === 'Web' && displayed(row))
  await wait(rows => rows.some(row => row.id === targetId && visible(row)), 'pinned native briefing in the directory')
  await click(byId(targetId))
  await wait(nativeBriefing, 'native briefing before the first Web open')
  const preview = row => row.type === 'dialog' && row.text === '预览版说明' && visible(row)
  const sidebar = row => visible(row) && textTarget('打开侧边栏', 'button')(row)
  const collapseSidebar = row => visible(row) && textTarget('收起侧边栏', 'button')(row)
  const conversationViewport = rows => {
    const webs = rows.filter(row => row.type === 'Web' && displayed(row))
    if (webs.length !== 1) return undefined
    const [webLeft, webTop, webRight, webBottom] = bounds(webs[0])
    const areas = new Map()
    for (const row of rows) {
      if (row.type !== 'genericContainer' || row.scrollable !== 'true' || row.id || row.text || row.description || !displayed(row)) continue
      const [left, top, right, bottom] = bounds(row)
      if (webLeft <= left && right <= webRight && webTop <= top && bottom <= webBottom && right - left >= 180 && bottom - top >= 240) {
        areas.set(row.bounds, [left, top, right, bottom])
      }
    }
    return areas.size === 1 ? areas.values().next().value : undefined
  }
  const inConversationViewport = (rows, text) => {
    const viewport = conversationViewport(rows)
    if (viewport === undefined) return false
    const [left, top, right, bottom] = viewport
    return rows.some(row => {
      if (row.type === 'Text' || !row.text?.includes(text) || !displayed(row)) return false
      const [rowLeft, rowTop, rowRight, rowBottom] = bounds(row)
      return rowLeft < right && rowRight > left && rowTop < bottom && rowBottom > top
    })
  }
  const bodyVisible = rows => inConversationViewport(rows, active.handoffHistory)
  const tailVisible = rows => inConversationViewport(rows, active.handoffLastReceipt)
  const olderControls = rows => {
    const viewport = conversationViewport(rows)
    if (viewport === undefined) return []
    const [left, top, right, bottom] = viewport
    return rows.filter(row => {
      if (!textTarget('加载更早', 'button')(row) || !visible(row)) return false
      const [rowLeft, rowTop, rowRight, rowBottom] = bounds(row)
      return left <= rowLeft && rowRight <= right && top <= rowTop && rowBottom <= bottom
    })
  }
  const visitBriefing = async () => {
    const nativeBefore = `view-${sequence}.json`
    await click(byId('product-chat-workspace'))
    await wait(rows => rows.some(row => preview(row) || sidebar(row) || collapseSidebar(row)), 'direct briefing workspace or preview notice', 120000)
    if (current.some(preview)) await click(button('继续'))
    await wait(rows => rows.some(row => sidebar(row) || collapseSidebar(row)), 'direct briefing workspace sidebar state', 120000)
    if (current.some(collapseSidebar)) await click(unique(collapseSidebar))
    await wait(rows => rows.some(sidebar), 'collapsed briefing sidebar')
    await wait(rows => bodyVisible(rows) || tailVisible(rows), 'direct briefing body or trailing command receipt')
    const initialWeb = `view-${sequence}.json`, bodyInitiallyVisible = bodyVisible(current), tailInitiallyVisible = tailVisible(current)
    let swipes = 0
    const moveOlder = async () => {
      if (conversationViewport(current) === undefined) await wait(rows => conversationViewport(rows) !== undefined, 'owned scrollable conversation')
      const viewport = conversationViewport(current)
      assert.ok(viewport, 'The owned scrollable conversation is required to move history')
      await scrollOlder(viewport)
      swipes++
    }
    let olderControl
    if (pagedBriefingReview) {
      while (olderControls(current).length === 0 && swipes < 24) {
        assert.ok(!bodyVisible(current), 'The older briefing is outside the first history page')
        await moveOlder()
      }
      const controls = olderControls(current)
      assert.equal(controls.length, 1, 'The conversation offers one earlier-history button')
      assert.ok(!bodyVisible(current), 'The older briefing is still absent before loading the next page')
      olderControl = `view-${sequence}.json`
      await click(controls[0])
      await wait(rows => bodyVisible(rows) || (conversationViewport(rows) !== undefined && olderControls(rows).length === 0
        && !rows.some(row => textTarget('加载中…', 'button')(row) && displayed(row))), 'earlier history applied')
    }
    const swipeLimit = pagedBriefingReview ? 24 : 3
    while (!bodyVisible(current) && swipes < swipeLimit) await moveOlder()
    await wait(bodyVisible, 'direct briefing body after scrolling')
    const bodyWeb = `view-${sequence}.json`
    await click(byId('product-workspace-back'))
    await wait(nativeBriefing, 'same native briefing after closing Web')
    assert.equal(byId('product-composer').text, '')
    assert.ok(!current.some(row => row.id === 'product-error' && visible(row)))
    return { views: { nativeBefore, initialWeb, ...(olderControl === undefined ? {} : { olderControl }), bodyWeb, native: `view-${sequence}.json` }, bodyInitiallyVisible, tailInitiallyVisible, swipes }
  }
  const before = await visitBriefing()
  checks.nativeHandoffHistoryInitiallyVisible = before.bodyInitiallyVisible
  checks.nativeHandoffTailInitiallyVisible = before.tailInitiallyVisible
  checks.nativeHandoffHistorySwipes = before.swipes
  checks.nativeHandoffHistoryVisibleAfterRead = true
  if (pagedBriefingReview) checks.nativeHandoffHistoryPaged = true
  checks.nativeBriefingOpenedDirectly = true
  checks.nativeBriefingReturnedSameSession = true
  const path = join(run, 'handoff-body-views.json')
  await writeFile(path, JSON.stringify(before.views) + '\n', { flag: 'wx' })
  artifacts.push(path)
  if (foregroundBriefingReview) {
    const pid = hdc(['shell', 'pidof', bundle]).trim()
    assert.match(pid, /^\d+$/)
    hdc(['shell', 'uitest', 'uiInput', 'keyEvent', 'Home'])
    await approve('native-reconnect')
    await captureChannelLog()
    assert.ok([...channelLines].some(line => line.endsWith('WORKSPACE_CIPHER_FOREGROUND_CLOSED')))
    hdc(['shell', 'aa', 'start', '-b', bundle, '-a', 'EntryAbility'])
    await wait(nativeBriefing, 'briefing restored by foreground without selecting again', 60000)
    await confirmNativeWss()
    assert.equal(hdc(['shell', 'pidof', bundle]).trim(), pid)
    assert.equal([...channelLines].filter(line => line.includes('WORKSPACE_CIPHER_NATIVE_AUTHENTICATED')).length, 2)
    assert.ok([...channelLines].some(line => line.endsWith('WORKSPACE_CIPHER_FOREGROUND_REBUILT')))
    checks.nativeReconnectedSameProcess = true
    checks.nativeBriefingResumedAfterForeground = true
    await click(byId('product-chat-workspace'))
    await wait(rows => rows.some(row => row.id === 'product-error' && visible(row))
      && rows.some(row => row.text.startsWith('电脑尚未授权或授权已失效。') && visible(row)), 'workspace grant required after foreground')
    assert.ok(nativeBriefing(current))
    checks.nativeReconnectedGrantRequired = true
    await approve('native-regrant')
    await click(byId('product-error-dismiss'))
    await wait(rows => nativeBriefing(rows) && !rows.some(row => row.id === 'product-error' && visible(row)), 'native briefing after a fresh grant')
    const after = await visitBriefing()
    checks.nativeRegrantedWorkspaceReopened = true
    checks.nativeBriefingReturnedAfterForeground = true
    const restoredPath = join(run, 'foreground-briefing-views.json')
    await writeFile(restoredPath, JSON.stringify(after.views) + '\n', { flag: 'wx' })
    artifacts.push(restoredPath)
  }
  await click(byId('product-chat-back'))
  await wait(rows => rows.some(row => row.id === 'product-new-session' && visible(row)), 'native directory after briefing')
}

async function creation() {
  const approve = async marker => {
    await writeFile(join(active.world, marker + '-request'), '', { flag: 'wx' })
    const deadline = Date.now() + 30000
    do {
      await assertHostLive()
      try { assert.equal(await readFile(join(active.world, marker + '-ready'), 'utf8'), ''); return }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      await delay(200)
    } while (Date.now() < deadline)
    assert.fail('Isolated Host did not acknowledge ' + marker)
  }
  await wait(rows => rows.some(row => row.id === 'product-new-session' && visible(row)), 'native session directory')
  await confirmNativeWss()
  if (active.handoffLastReceipt !== undefined) await reviewDirectBriefing(approve)
  if (pagedBriefingReview) return
  await click(byId('product-new-session'))
  await wait(rows => rows.some(row => row.id === 'product-create-model' && visible(row)), 'native creation choices')
  const preset = active.options.presets.find(row => row.id === (active.creationPreset ?? 'devin')), model = active.options.models.find(row => row.model === 'worker-model')
  assert.ok(preset && model)
  const select = async (id, text) => { await click(byId(id)); await wait(rows => rows.some(row => row.type === 'Option' && row.text === text && visible(row)), text); await click(unique(row => row.type === 'Option' && row.text === text)) }
  await select('product-create-preset', preset.name); await select('product-create-model', model.label)
  await wait(rows => rows.some(row => row.id === 'product-create-effort' && visible(row)), 'native model efforts')
  await select('product-create-effort', 'high'); checks.nativePresetModelAndEffortSelected = true
  const pidBeforeLoss = active.creationAckLoss === true ? hdc(['shell', 'pidof', bundle]).trim() : undefined
  await click(byId('product-new-unassigned'))
  if (active.creationAckLoss === true) {
    assert.match(pidBeforeLoss, /^\d+$/)
    const uncertain = row => row.text.startsWith('创建结果未确认。') && visible(row)
    const ready = (rows, id) => rows.some(row => row.id === id && row.enabled !== 'false' && visible(row))
    await wait(rows => rows.some(uncertain) && ready(rows, 'product-home-connect'), 'native creation uncertain after carrier loss')
    assert.ok(!current.some(row => row.id === 'product-chat-back' && visible(row)))
    checks.nativeCreationUnconfirmed = true
    await approve('native-reconnect')
    await click(byId('product-home-connect'))
    await wait(rows => ready(rows, 'product-creation-refresh') && ready(rows, 'product-new-session'), 'native creation recovery on the new connection')
    await confirmNativeWss()
    assert.equal(hdc(['shell', 'pidof', bundle]).trim(), pidBeforeLoss)
    assert.equal([...channelLines].filter(line => line.includes('WORKSPACE_CIPHER_NATIVE_AUTHENTICATED')).length, 2)
    checks.nativeReconnectedSameProcess = true
    await click(byId('product-creation-refresh'))
    const created = row => /^product-session-session-[a-f0-9-]+$/.test(row.id) && row.id !== 'product-session-' + active.sessionId && visible(row)
    await wait(rows => ready(rows, 'product-creation-refresh') && rows.some(created), 'new blank Session from the refreshed directory')
    assert.ok(current.some(uncertain))
    checks.nativeCreationRefreshed = true
    const row = unique(created)
    recoveredCreationId = row.id.slice('product-session-'.length)
    await click(row)
    await wait(rows => rows.some(row => row.id === 'product-chat-back' && visible(row)) && rows.some(row => row.id === 'product-composer' && visible(row)), 'recovered native chat')
    assert.ok(!current.some(row => row.id === 'product-error' && visible(row)))
    checks.createdAndOpenedWithoutModel = true
    return
  }
  await wait(rows => rows.some(row => row.id === 'product-chat-back' && visible(row)) && !rows.some(row => row.id === 'product-create-model' && visible(row)), 'created native chat')
  await responses(0); checks.createdAndOpenedWithoutModel = true
  assert.equal(current.some(row => row.id === 'product-error' && visible(row)), false, 'The new native Session must load without an error')
  checks.nativeSessionLoadedWithoutError = true
  if (active.encryptedCarrier === true && active.creationWork !== true && active.creationWorkspace !== true) {
    const draft = 'GRANT_REQUIRED_DRAFT'
    await click(byId('product-composer'))
    hdc(['shell', 'uitest', 'uiInput', 'text', draft]); await layout()
    assert.equal(byId('product-composer').text, draft)
    await click(byId('product-chat-workspace'))
    await wait(rows => rows.some(row => row.id === 'product-error' && visible(row))
      && rows.some(row => row.text.startsWith('电脑尚未授权或授权已失效。') && visible(row)), 'workspace grant required in native chat')
    assert.equal(byId('product-composer').text, draft)
    assert.ok(!current.some(row => row.id === 'product-workspace-back' && visible(row)))
    await captureChannelLog()
    assert.equal([...channelLines].filter(line => line.endsWith('DSH_WORKSPACE_RPC operation=prepare failure=workspace-grant-required')).length, 1)
    await click(byId('product-error-dismiss'))
    await wait(rows => !rows.some(row => row.id === 'product-error' && visible(row)), 'dismissed workspace grant notice')
    checks.nativeWorkspaceGrantRequired = true
  }
  if (active.creationWork === true) {
    for (let number = 1; number <= 4; number++) {
      await wait(rows => rows.some(row => row.id === 'product-composer' && visible(row)), 'native composer')
      await click(byId('product-composer'))
      hdc(['shell', 'uitest', 'uiInput', 'text', 'CREATED_WORKER_PROMPT_' + number]); await layout()
      assert.equal(byId('product-composer').text, 'CREATED_WORKER_PROMPT_' + number)
      await wait(rows => rows.some(row => row.id === 'product-send' && visible(row)), 'native send enabled')
      await click(byId('product-send')); await responses(number)
      await wait(rows => rows.some(row => row.text.includes('CREATED_WORKER_RESPONSE_' + number)) && rows.some(row => row.id === 'product-send' && row.enabled === 'false') && !rows.some(row => row.id === 'product-cancel' && visible(row)), 'completed native reply ' + number)
    }
    checks.selectedModelExecutedFourNativePrompts = true
  }
  if (active.creationWorkspace === true) {
    const draft = 'CREATED_WORKSPACE_DRAFT', reply = 'CREATED_WORKER_RESPONSE_4'
    await click(byId('product-composer'))
    hdc(['shell', 'uitest', 'uiInput', 'text', draft]); await layout()
    assert.equal(byId('product-composer').text, draft)
    const preview = row => row.type === 'dialog' && row.text === '预览版说明' && visible(row)
    const failure = row => row.id === 'product-workspace-retry' && visible(row)
    const webConversation = blankCreationWorkspace
      ? row => row.type === 'button' && row.text === '发送消息' && row.enabled === 'false' && displayed(row)
      : row => row.type === 'paragraph' && row.text === reply && visible(row)
    const nativeDraft = rows => rows.some(row => row.id === 'product-composer' && row.text === draft && visible(row))
      && (blankCreationWorkspace || rows.some(row => row.type === 'Text' && row.text.includes(reply) && visible(row)))
    if (active.pluginBootFault === true) {
      await click(byId('product-chat-workspace'))
      await wait(rows => rows.some(failure) || rows.some(webConversation), 'native workspace plugin failure', 120000)
      assert.ok(current.some(failure) && !current.some(webConversation))
      await captureChannelLog()
      assert.ok([...channelLines].some(line => line.includes('DSH_WORKSPACE_CONSOLE') && line.includes('WORKSPACE_PLUGIN_BOOT_FAULT')))
      checks.nativeOptionalPluginFailureShown = true
      await click(byId('product-workspace-return'))
      await wait(rows => nativeDraft(rows) && !rows.some(row => row.type === 'Web' && displayed(row)), 'native transcript and draft after plugin boot failure')
      assert.ok(!current.some(row => row.id === 'product-error' && visible(row)))
      checks.nativeDraftSurvivedPluginFailure = true
      // The Host acknowledges only after profile reconciliation and Client Modules have settled.
      await synchronizeDesktop('workspace-plugin-disable', 45000)
      checks.desktopPluginDisableAcknowledged = true
    }
    const openCreatedWorkspace = async () => {
      await click(byId('product-chat-workspace'))
      await wait(rows => rows.some(row => preview(row) || failure(row) || webConversation(row)), 'created Session in standard workspace', 120000)
      if (current.some(preview)) {
        await click(button('继续'))
        await wait(rows => rows.some(row => failure(row) || webConversation(row)), 'created Session after preview notice', 120000)
      }
      assert.ok(current.some(webConversation) && !current.some(failure), 'The standard workspace must display the new Session')
      assert.ok(!current.some(row => row.id === 'product-composer' && visible(row)), 'The workspace must own the visible transcript')
    }
    const visitWorkspace = async () => {
      await openCreatedWorkspace()
      await click(byId('product-workspace-back'))
      await wait(nativeDraft, 'original native Session and draft')
      assert.ok(!current.some(row => row.id === 'product-error' && visible(row)), 'Returning must keep the original native Session usable')
    }
    await visitWorkspace()
    checks.nativeCreatedWorkspaceLoaded = true
    checks.nativeCreatedDraftRestored = true
    if (active.handoffTitle !== undefined && active.handoffLastReceipt === undefined) {
      await openCreatedWorkspace()
      const target = row => row.type === 'staticText' && row.text === active.handoffTitle && visible(row)
      const sidebar = row => visible(row) && textTarget('打开侧边栏', 'button')(row)
      for (let attempt = 0; attempt < 3 && !current.some(target); attempt++) {
        await wait(rows => rows.some(row => target(row) || sidebar(row) || preview(row)), 'sidebar or preview notice')
        if (current.some(target)) break
        if (current.some(preview)) {
          await click(button('继续'))
          continue
        }
        await click(unique(sidebar))
        await wait(rows => rows.some(row => target(row) || preview(row)), 'other pinned Session or preview notice')
      }
      await click(unique(target))
      const history = rows => rows.some(row => row.type !== 'Text' && row.text === active.handoffHistory && displayed(row))
      await wait(history, 'other Session in the Web transcript')
      await click(byId('product-workspace-back'))
      await wait(rows => rows.some(row => row.id === 'product-chat-back' && visible(row))
        && rows.some(row => row.type === 'Text' && row.text === active.handoffTitle && displayed(row))
        && rows.some(row => row.type === 'Text' && row.text === active.handoffHistory && displayed(row))
        && !rows.some(row => row.type === 'Web' && displayed(row)), 'other Session in native chat')
      assert.equal(byId('product-composer').text, '')
      assert.ok(!current.some(row => row.id === 'product-error' && visible(row)))
      checks.nativeWorkspaceReturnedToOtherSession = true
      await click(byId('product-chat-back'))
      const original = row => /^product-session-session-[a-f0-9-]+$/.test(row.id) && row.id !== 'product-session-' + active.sessionId && visible(row)
      await wait(rows => rows.some(original), 'original Session in the native directory')
      await click(unique(original))
      await wait(nativeDraft, 'original native draft after switching Sessions')
      checks.nativeOriginalDraftAfterSessionSwitch = true
    }
    if (active.reconnectReview === true && !foregroundBriefingReview) {
      const pid = hdc(['shell', 'pidof', bundle]).trim()
      assert.match(pid, /^\d+$/)
      await click(byId('product-chat-back'))
      await click(byId('product-nav-device'))
      await wait(rows => rows.some(row => row.id === 'product-route-stop' && visible(row)), 'native connection stop control')
      await click(byId('product-route-stop'))
      await wait(rows => rows.some(row => row.id === 'product-connect' && visible(row))
        && !rows.some(row => row.id === 'product-workspace-plugins' && displayed(row)), 'native connection closed')
      await approve('native-reconnect')
      await click(byId('product-connect'))
      await wait(rows => rows.some(row => row.id === 'product-workspace-plugins' && visible(row)), 'native connection restored')
      assert.equal(hdc(['shell', 'pidof', bundle]).trim(), pid)
      await confirmNativeWss()
      assert.equal([...channelLines].filter(line => line.includes('WORKSPACE_CIPHER_NATIVE_AUTHENTICATED')).length, 2)
      await click(byId('product-device-back'))
      const createdSession = row => /^product-session-session-[a-f0-9-]+$/.test(row.id) && row.id !== 'product-session-' + active.sessionId && visible(row)
      await wait(rows => rows.some(createdSession), 'created Session in the reconnected native directory')
      await click(unique(createdSession))
      await wait(nativeDraft, 'original native Session on the new connection')
      checks.nativeReconnectedSameProcess = true
      await click(byId('product-chat-workspace'))
      await wait(rows => rows.some(row => row.id === 'product-error' && visible(row))
        && rows.some(row => row.text.startsWith('电脑尚未授权或授权已失效。') && visible(row)), 'workspace grant required after reconnect')
      assert.ok(nativeDraft(current) && !current.some(row => row.id === 'product-workspace-back' && displayed(row)))
      checks.nativeReconnectedGrantRequired = true
      await approve('native-regrant')
      await click(byId('product-error-dismiss'))
      await wait(rows => !rows.some(row => row.id === 'product-error' && visible(row)), 'dismissed authorization notice')
      await visitWorkspace()
      checks.nativeRegrantedWorkspaceReopened = true
    }
    if (active.panelTargetPackage !== undefined) {
      assert.equal(active.panelTargetPackage, 'dsh-devflow')
      const visitPanel = async (packageName, surface, label, exercise) => {
        await click(byId('product-chat-back'))
        await wait(rows => rows.some(row => row.id === 'product-nav-device' && visible(row)), 'native settings entry')
        await click(byId('product-nav-device'))
        await wait(rows => rows.some(row => row.id === 'product-workspace-plugin-target' && visible(row)), 'native package field')
        await click(byId('product-workspace-plugin-target'))
        hdc(['shell', 'uitest', 'uiInput', 'keyEvent', '2072', '2017'])
        hdc(['shell', 'uitest', 'uiInput', 'text', packageName]); await layout()
        assert.equal(byId('product-workspace-plugin-target').text, packageName)
        await click(byId('product-workspace-plugins'))
        await wait(rows => rows.some(row => preview(row) || failure(row) || surface(row)), label, 120000)
        if (current.some(preview)) {
          await click(button('继续'))
          await wait(rows => rows.some(row => failure(row) || surface(row)), label + ' after preview notice', 120000)
        }
        assert.ok(current.some(surface) && !current.some(failure), label)
        if (exercise !== undefined) await exercise()
        await click(byId('product-workspace-back'))
        await wait(rows => nativeDraft(rows) && !rows.some(row => row.id === 'product-workspace-back' && displayed(row)), 'original native Session after targeted panel')
        assert.ok(!current.some(row => row.id === 'product-error' && visible(row)), 'The native Session must stay usable after closing the panel')
      }
      if (active.reconnectReview === true) {
        await visitPanel('dsh-workspace-fixture-absent', row => row.text === '实验性插件' && visible(row), 'standard plugin directory for missing package')
        checks.nativeMissingPluginReturnedToDirectory = true
      }
      const devflowPanel = row => row.text === '多模型工具箱' && visible(row)
      if (devflowSessionSettings) {
        await synchronizeDesktop('devflow-session-target')
        const { targetId, otherId, title } = JSON.parse(await readFile(join(active.world, 'devflow-session-target.json'), 'utf8'))
        assert.match(targetId, /^session-[a-f0-9-]{36}$/); assert.equal(otherId, active.sessionId); assert.notEqual(targetId, otherId)
        const option = text => row => row.type === 'Option' && row.text === text && visible(row)
        const select = async (label, value) => {
          await seek(label, 'comboBoxSelect', 'newer')
          await wait(rows => rows.some(option(value)), value)
          await click(unique(option(value)))
        }
        const chooseTarget = async () => {
          await select('配置范围', '会话')
          await wait(rows => rows.some(row => visible(row) && textTarget('目标会话', 'comboBoxSelect')(row)), 'explicit session target control')
          assert.ok(!current.some(row => visible(row) && textTarget('保存', 'button')(row)))
          await seek('目标会话', 'comboBoxSelect', 'newer')
          const target = option(title + ' · ' + targetId), other = option(title + ' · ' + otherId)
          await wait(rows => [option('请选择会话'), target, other].every(match => rows.some(match)), 'two distinguished same-title session targets')
          await click(unique(target))
          await wait(rows => rows.some(row => visible(row) && textTarget('编排', 'comboBoxSelect')(row)), 'selected session settings')
          checks.nativeDevflowTargetExplicit = true
        }
        const save = async () => { await seek('保存', 'button', 'newer'); await seek('已保存', 'status', 'newer', false) }
        const settings = row => visible(row) && textTarget('配置范围', 'comboBoxSelect')(row)
        await visitPanel(active.panelTargetPackage, settings, 'DevFlow session override', async () => {
          await chooseTarget(); await select('编排', '启用'); await save()
          await synchronizeDesktop('devflow-session-saved'); checks.nativeDevflowSessionSaved = true
        })
        await visitPanel(active.panelTargetPackage, settings, 'DevFlow session override reopened', async () => {
          await chooseTarget(); await synchronizeDesktop('devflow-session-readback'); checks.nativeDevflowSessionReadBack = true
          await seek('恢复本范围继承', 'button', 'newer'); await save()
          await synchronizeDesktop('devflow-session-restored'); checks.nativeDevflowSessionInherited = true
        })
      } else if (active.revocationReview === true) {
        const pid = hdc(['shell', 'pidof', bundle]).trim()
        assert.match(pid, /^\d+$/)
        await visitPanel(active.panelTargetPackage, devflowPanel, 'DevFlow panel before desktop revocation', async () => {
          await seek('编排', 'comboBoxSelect', 'newer')
          await clickText('启用', 'Option')
          await seek('保存', 'button', 'newer', false)
          await synchronizeDesktop('desktop-workspace-revoke', 45000)
          const disabled = label => row => textTarget(label, 'button')(row) && row.enabled === 'false' && displayed(row)
          await wait(rows => rows.some(disabled('保存')), 'save disabled in the revoked DevFlow panel')
          assert.ok(!current.some(row => row.text === '已保存' && displayed(row)))
          for (let attempt = 0; !current.some(disabled('重新读取')) && attempt < 8; attempt++) await scrollNewer()
          await wait(rows => rows.some(disabled('重新读取')), 'reload disabled in the revoked DevFlow panel')
          await synchronizeDesktop('desktop-workspace-audit', 45000)
          checks.revokedDevflowWriteDisabled = true
          checks.revokedDevflowReadDisabled = true
        })
        checks.nativeDraftSurvivedDesktopRevocation = true
        await click(byId('product-chat-workspace'))
        await wait(rows => rows.some(row => row.id === 'product-error' && visible(row))
          && rows.some(row => row.text.startsWith('电脑尚未授权或授权已失效。') && visible(row)), 'workspace requires new authorization after desktop revocation')
        assert.ok(nativeDraft(current) && !current.some(row => row.id === 'product-workspace-back' && displayed(row)))
        checks.revokedWorkspaceReopenDenied = true
        await synchronizeDesktop('desktop-workspace-regrant', 45000)
        await click(byId('product-error-dismiss'))
        await wait(rows => !rows.some(row => row.id === 'product-error' && visible(row)), 'dismissed revocation notice')
        await visitPanel(active.panelTargetPackage, devflowPanel, 'DevFlow on the reauthorized device connection',
          () => seek('编排', 'comboBoxSelect', 'newer', false))
        await confirmNativeWss()
        assert.equal(hdc(['shell', 'pidof', bundle]).trim(), pid)
        assert.equal([...channelLines].filter(line => line.includes('WORKSPACE_CIPHER_NATIVE_AUTHENTICATED')).length, 1)
        checks.sameConnectionDevflowRegranted = true
      } else {
        await visitPanel(active.panelTargetPackage, devflowPanel, 'native DevFlow panel target')
      }
      checks.nativeCreatedPluginPanelOpened = true
      checks.nativeCreatedPanelDraftRestored = true
    }
  }
  await click(byId('product-chat-back')); await wait(rows => rows.some(row => row.id === 'product-new-session' && visible(row)), 'native list restored')
}
async function officialPlugin() {
  await click(byId('workspace-fixture-plugins'))
  await wait(rows => state('ready') && rows.some(row => row.text === '实验性插件'), 'standard plugin directory')
  if (current.some(row => visible(row) && row.type === 'button' && row.text === '更多')) await clickText('更多', 'button')
  await wait(rows => state('ready') && rows.some(row => /思考过程机器翻译/.test(row.text)), 'unchanged official plugin directory')
  await seek('查看 思考过程机器翻译', 'button', 'newer')
  await wait(rows => rows.some(textTarget('目标语言', 'textField')), 'official language field')
  await seek('目标语言', 'textField', 'newer', false)
  await click(unique(textTarget('目标语言', 'textField')))
  hdc(['shell', 'uitest', 'uiInput', 'keyEvent', '2072', '2017']); hdc(['shell', 'uitest', 'uiInput', 'text', 'ja']); await layout()
  assert.equal(unique(textTarget('目标语言', 'textField')).text, 'ja')
  await seek('保存', 'button', 'newer')
  await wait(rows => rows.some(row => row.type === 'button' && row.text === '保存' && row.enabled === 'false') && rows.some(row => textTarget('目标语言', 'textField')(row) && row.text === 'ja') && !rows.some(row => row.type === 'status' && /没有接受|只读/.test(row.text)), 'official preferences accepted')
  checks.officialStandardSettingsSaved = true
  await click(byId('workspace-fixture-open'))
  await wait(rows => state('ready') && rows.some(row => visible(row) && richEntry(row)), 'official contribution conversation')
  await click(unique(row => row.type === 'button' && /^已完成，用时/.test(row.text)))
  if (current.some(row => visible(row) && row.type === 'button' && row.text === '已完成分析')) await clickText('已完成分析', 'button')
  const reasoning = row => ['button', 'disclosureTriangle'].includes(row.type) && /^思考(?:\s|$)/.test(row.text)
  await wait(rows => rows.some(row => visible(row) && reasoning(row)), 'standard reasoning disclosure')
  await click(unique(reasoning))
  await wait(rows => rows.some(row => row.text === 'STANDARD_PLUGIN_TRANSLATED_JA'), 'official translated reasoning')
  await clickText('查看原文', 'button')
  await wait(rows => rows.some(row => row.text === 'STANDARD_PLUGIN_REASONING'), 'official original reasoning')
  await clickText('查看译文', 'button')
  await wait(rows => rows.some(row => row.text === 'STANDARD_PLUGIN_TRANSLATED_JA'), 'official translated toggle')
  checks.officialConversationSlotAndOriginalToggle = true
  await closeFixtureWorkspace()
  await click(byId('workspace-fixture-plugins'))
  await wait(rows => state('ready') && rows.some(row => row.text === '实验性插件'), 'standard plugin directory reopened')
  if (current.some(row => visible(row) && row.type === 'button' && row.text === '更多')) await clickText('更多', 'button')
  await wait(rows => state('ready') && rows.some(row => /思考过程机器翻译/.test(row.text)), 'official directory reopened')
  await seek('查看 思考过程机器翻译', 'button', 'newer')
  await wait(rows => rows.some(row => textTarget('目标语言', 'textField')(row) && row.text === 'ja'), 'official saved language restored')
  checks.officialSettingsRestored = true
  await click(byId('workspace-fixture-open'))
  await wait(rows => state('ready') && rows.some(row => visible(row) && richEntry(row)), 'rich acceptance after official plugin')
}
async function diagnoseWorkspaceRpc() {
  const first = 'DSH_WORKSPACE_RPC operation=rich-appearance failure=unknown-outcome'
  const second = 'DSH_WORKSPACE_RPC operation=rich-appearance failure=timeout'
  const count = message => [...channelLines].filter(line => line.endsWith(message)).length
  const bootFailed = () => { assert.ok(!state('ready'), 'A failed boot must not publish ready'); return state('failed') }
  const reopen = async () => {
    await wait(rows => rows.some(row => row.id === 'workspace-fixture-open' && visible(row)), 'diagnostic reopen control', 20000, true)
    await click(byId('workspace-fixture-open'))
    await wait(() => state('loading'), 'new diagnostic workspace', 20000, true)
  }
  await wait(bootFailed, 'standard workspace after Host rejection', 120000)
  await captureChannelLog()
  assert.equal(count(first), 1); assert.equal(count(second), 0)
  checks.hostRejectionIdentified = true
  await reopen()
  await wait(bootFailed, 'standard workspace after RPC deadline', 120000)
  await captureChannelLog()
  assert.equal(count(first), 1); assert.equal(count(second), 1)
  checks.timeoutIdentified = true
  await reopen()
  await wait(rows => state('ready') && rows.some(row => visible(row) && richEntry(row)), 'healthy renderer after both diagnostic failures', 120000)
  checks.healthyRendererReady = true
}
try {
  assert.equal(hdc(['shell', 'param', 'get', 'const.product.model']).trim(), 'emulator')
  const host = JSON.parse(await readFile(join(active.world, 'process.json'), 'utf8'))
  hostProcessId = host.pid; assert.ok(Number.isSafeInteger(hostProcessId) && hostProcessId > 0); process.kill(hostProcessId, 0)
  const health = await fetch('http://127.0.0.1:' + active.hostPort + '/', { signal: AbortSignal.timeout(5000) })
  assert.equal(health.status, 403, 'The current isolated fixture must reject an unauthenticated request')
  const forwards = hdc(['fport', 'ls']), rule = forward.join(' ')
  if (forwards.includes('tcp:18082')) assert.ok(forwards.includes(rule), 'Preserve a conflicting emulator forward')
  else { ownedForward = true; hdc(['rport', ...forward]) }
  if (wssForward !== undefined) {
    assert.ok(!forwards.includes('tcp:18083'), 'Preserve a conflicting emulator WSS forward')
    ownedWssForward = true; hdc(['rport', ...wssForward])
    assert.ok(hdc(['fport', 'ls']).includes(wssForward.join(' ')), 'Exact emulator WSS reverse forward required')
  }
  assert.ok(hdc(['fport', 'ls']).includes(rule), 'Exact emulator reverse forward required')
  await writeFile(join(run, 'preflight.json'), JSON.stringify({ hostPid: host.pid, hostLive: true, unauthenticatedStatus: health.status, forward, ownedForward, wssForward, ownedWssForward, physicalPhoneAccessed: false }) + '\n')
  managedApp = true
  hdc(['shell', 'aa', 'force-stop', bundle])
  if (archiveManagerReview || nativeReleaseReview) {
    let canStart = emulatorUnlocked()
    if ((blankCreationWorkspace || pinnedRead) && !canStart) {
      console.info('Waiting for the isolated emulator to be unlocked')
      const deadline = Date.now() + 90000
      while (!canStart && Date.now() < deadline) {
        await assertHostLive()
        await delay(1000)
        canStart = emulatorUnlocked()
      }
    }
    assert.ok(canStart, 'A locked emulator requires user interaction')
    hdc(['shell', 'power-shell', 'wakeup'])
    assert.match(hdc(['shell', 'hidumper', '-s', 'PowerManagerService', '-a', '-s']), /^Current State: AWAKE\b/m)
  }
  const launchRequestedAt = performance.now()
  hdc(['shell', 'aa', 'start', '-b', bundle, '-a', 'EntryAbility'])
  if (active.scenario !== 'creation') {
    await wait(rows => rows.some(row => ['workspace-fixture-state', 'product-header'].includes(row.id)), 'workspace test entry')
    assert.ok(current.some(row => row.id === 'workspace-fixture-state'), 'Install the staged workspace fixture HAP before running this driver')
    checks.fixtureEntry = true
    await captureChannelLog()
  }
  if (active.rpcDiagnostics === true) await diagnoseWorkspaceRpc()
  else if (pinnedRead) await openPinnedRead(launchRequestedAt)
  else if (active.scenario === 'creation') await creation()
  else if (brickReview) await brick()
  else if (archiveManagerReview) await archiveManager()
  else if (active.scenario === 'devflow') await devflow()
  else {
  const startupWait = active.admissionReview === 'disk-latency' || active.admissionReview === 'disk-field' ? 120000 : undefined
  const hasControl = (rows, id) => rows.some(row => row.id === id && visible(row))
  if (wssForward !== undefined && active.admissionReview === 'disk-latency') {
    let nextCapture = 0
    await wait(async () => {
      if (Date.now() >= nextCapture) {
        await captureChannelLog()
        nextCapture = Date.now() + 3000
      }
      return state('loading') || state('ready')
    }, 'authenticated slow-link workspace startup', startupWait)
    await confirmNativeWss()
  }
  await wait(rows => state('ready') && rows.some(row => visible(row) && richEntry(row)), 'initial standard workspace', startupWait)
  checks.automaticWorkspaceReady = true
  await confirmNativeWss()
  if (active.official) await officialPlugin()
  await click(unique(richEntry)); await wait(rows => rows.some(row => visible(row) && row.hint === 'Note'), 'isolated form')
  assert.ok(current.some(row => row.text === 'undefined:undefined')); checks.guestHasNoWorkspaceObjects = true
  await wait(rows => rows.some(row => row.text === '{"parent":"denied","storage":"denied","network":"denied"}'), 'guest isolation probes')
  checks.guestParentStorageAndNetworkDenied = true
  if (keyboardReview) {
    await writeInput('键盘好')
    hdc(['shell', 'uitest', 'uiInput', 'keyEvent', '2055']); await layout(); assert.equal(field().text, '键盘')
    checks.nativeUnicodeAndBackspace = true
    hdc(['shell', 'uitest', 'uiInput', 'keyEvent', 'Back'])
    await wait(rows => rows.some(row => row.id === 'workspace-fixture-keyboard' && JSON.parse(row.text).height === 0) && rows.some(row => row.type === 'textField' && row.hint === 'Note'), 'keyboard dismissed while Rich stays open')
    assert.equal(field().text, '键盘'); checks.backDismissesKeyboardWithoutClosingRich = true
  }
  await writeInput('native-completed'); await click(button('Send action'))
  await wait(() => hasAction('workspace-action-completed', 'completed'), 'completed action'); await responses(3)
  checks.acceptedThenCompleted = true
  await writeInput('native-unresolved'); await click(button('Send action'))
  await wait(() => hasAction('workspace-action-unresolved', 'outcome_unknown'), 'unresolved action'); await responses(4)
  await click(button('Query status')); await wait(() => statuses().some(row => row.actionId === 'workspace-action-unresolved' && row.state === 'outcome_unknown'), 'status query')
  await responses(4); checks.unresolvedQueryDoesNotReplay = true
  await writeInput('native-final-draft'); await click(byId('workspace-fixture-back'))
  await wait(rows => state('ready') && hasControl(rows, 'workspace-fixture-back') && !rows.some(row => row.hint === 'Note'), 'rich Web removed'); checks.richBack = true
  for (let attempt = 0; !current.some(row => visible(row) && reachableReload(row)) && attempt < 24; attempt++) await scrollOlder()
  await click(unique(reachableReload)); await wait(rows => rows.some(row => visible(row) && richEntry(row)), 'rich reservation restored')
  await click(unique(richEntry)); await wait(rows => rows.some(row => visible(row) && row.hint === 'Note'), 'form reopened')
  assert.equal(field().text, 'native-final-draft'); assert.ok(hasAction('workspace-action-unresolved', 'outcome_unknown')); checks.exactDraftAndUnresolvedRestored = true
  await click(byId('workspace-fixture-back'))
  await wait(rows => hasControl(rows, 'workspace-fixture-back') && !rows.some(row => row.hint === 'Note'), 'second rich back')
  await click(byId('workspace-fixture-back'))
  await wait(rows => state('closed') && hasControl(rows, 'workspace-fixture-open') && !rows.some(row => row.type === 'Web'), 'whole workspace removed')
  checks.workspaceWebRemoved = true
  await click(byId('workspace-fixture-open')); await wait(() => state('ready'), 'workspace reopened', startupWait); checks.workspaceReopened = true
  hdc(['shell', 'uitest', 'uiInput', 'keyEvent', 'Home']); hdc(['shell', 'aa', 'start', '-b', bundle, '-a', 'EntryAbility'])
  await wait(rows => hasControl(rows, 'workspace-fixture-open') && !rows.some(row => row.type === 'Web'), 'background Web removal')
  await click(byId('workspace-fixture-open'))
  await wait(rows => state('ready') && hasControl(rows, 'workspace-fixture-back'), 'foreground reopen', startupWait); checks.backgroundAndForeground = true
  await click(byId('workspace-fixture-back')); await wait(rows => state('closed') && !rows.some(row => row.type === 'Web'), 'final close')
  if (keyboardReview) await repeatLifecycle()
  }
  await responses(active.rpcDiagnostics === true || keyboardAttach || brickReview || archiveManagerReview ? 1 : active.scenario === 'creation' && active.creationWork !== true ? 0 : 4)
  await captureChannelLog()
  if (pinnedNativeSelectionAudit) {
    pinnedNativeSelections = [...channelLines].flatMap(line => {
      const match = /WORKSPACE_CIPHER_PINNED_NATIVE_SELECTION count=(\d+)$/.exec(line)
      return match ? [Number(match[1])] : []
    })
    assert.deepEqual(pinnedNativeSelections, [1], 'Opening and closing the same pinned Session retains its first native selection')
  }
  finish = { passed: true, driverSha256, pointerControl, nativeArkWeb: active.scenario !== 'creation' || active.creationWorkspace === true, scope: responseBodyReview ? 'native-workspace-response-bodies' : pagedBriefingReview ? 'native-paged-briefing' : active.creationAckLoss === true ? 'native-creation-ack-loss-recovery' : archiveManagerReview ? 'archive-manager-standard-settings-and-restore' : brickReview ? 'published-Brick-settings-and-theme' : keyboardAttach ? 'native-keyboard-attachment-comparison' : active.rpcDiagnostics === true ? 'native-workspace-rpc-diagnostics' : active.scenario === 'creation' ? 'native-Index-preset-model-effort-creation' : active.scenario === 'devflow' ? 'standard-DevFlow-settings-and-readonly-delegation' : 'rich-input-actions-draft-and-Web-lifecycle', checks, artifacts, models: 0,
    ...(recoveredCreationId === undefined ? {} : { recoveredCreationId }),
    ...(pinnedLifecycle ? { pinnedLifecycle: { coldStart: pinnedColdStart, cycles: lifecycleSamples, memory: memorySamples } } : {}),
    ...(keyboardAttach ? { keyboardAttachSamples, fullKeyboardAcceptance: false } : {}),
    ...(keyboardRefocusReview ? { devflowKeyboardFocusAttempts } : {}),
    ...(keyboardReview ? { keyboardSamples, diagnostics: { lifecycleSamples, memorySamples, thresholdFree: true, memoryScope: 'application PID only; renderer processes excluded', clockScope: 'native ready/close callbacks and separate UITest-observed endpoints; no model or public-network latency' } } : {}) }
} catch (error) {
  let captureError, nativeDiagnostic
  try { await captureChannelLog() } catch (captureFailure) { captureError = String(captureFailure) }
  if (managedApp && active.scenario !== 'creation') {
    try {
      await layout()
      const inspect = current.filter(row => row.id === 'workspace-fixture-inspect' && visible(row))
      if (inspect.length === 1) {
        await click(inspect[0]); await layout()
        nativeDiagnostic = current.find(row => row.id === 'workspace-fixture-diagnostic')?.text
      }
    } catch (captureFailure) { captureError = String(captureFailure) }
  }
  try { await captureChannelLog() } catch (captureFailure) { captureError = String(captureFailure) }
  if (keyboardReview) {
    const remote = '/data/local/tmp/dsh-workspace-failure-' + process.pid + '.jpeg', path = join(run, 'failure.jpeg')
    try { await layout(); if (current.some(row => row.bundleName === bundle)) { hdc(['shell', 'snapshot_display', '-f', remote]); hdc(['file', 'recv', remote, path]); artifacts.push(path) } }
    catch (captureFailure) { captureError = String(captureFailure) }
  }
  finish = { passed: false, driverSha256, pointerControl, captureError, nativeDiagnostic, checks, keyboardSamples, artifacts, error: String(error), stack: error instanceof Error ? error.stack : undefined,
    ...(keyboardAttach ? { keyboardAttachSamples, fullKeyboardAcceptance: false } : {}), ...(keyboardRefocusReview ? { devflowKeyboardFocusAttempts } : {}) }
} finally {
  const cleanup = [], failures = []
  for (const [name, args] of [...(managedApp ? [['stop-test-application', ['shell', 'aa', 'force-stop', bundle]]] : []),
    ...(ownedForward ? [['remove-owned-forward', ['fport', 'rm', ...forward]]] : []),
    ...(ownedWssForward ? [['remove-owned-wss-forward', ['fport', 'rm', ...wssForward]]] : [])]) {
    try { hdc(args); cleanup.push({ name, passed: true }) }
    catch (error) { failures.push(error); cleanup.push({ name, passed: false, error: String(error) }) }
  }
  try {
    const forwards = hdc(['fport', 'ls'])
    if (ownedForward) assert.ok(!forwards.includes(forward.join(' ')), 'Owned forward remains active')
    if (ownedWssForward) assert.ok(!forwards.includes(wssForward.join(' ')), 'Owned WSS forward remains active')
  }
  catch (error) { failures.push(error) }
  await writeFile(join(run, 'cleanup.json'), JSON.stringify({ cleanup, ownedForward, ownedWssForward, passed: failures.length === 0 }) + '\n')
  finish = { ...finish, passed: finish?.passed === true && failures.length === 0, cleanupPassed: failures.length === 0,
    ...(pinnedUi === undefined ? {} : { pinnedUi }),
    ...(pinnedNativeSelections === undefined ? {} : { pinnedNativeSelections }),
    ...(failures.length ? { cleanupErrors: failures.map(error => String(error)) } : {}) }
  await writeFile(join(run, 'result.json'), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), ...finish, commands }, null, 2) + '\n')
  await publishFinish(finish)
  console.log(JSON.stringify({ passed: finish.passed, run, checks, error: finish.error, cleanupPassed: finish.cleanupPassed }))
  if (!finish.passed) process.exitCode = 1
}
