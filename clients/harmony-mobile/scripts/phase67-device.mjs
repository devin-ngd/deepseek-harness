/** Operate only the already installed approved product via official HDC/UI commands; no installation, shell bridge, key export or device settings. */
import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname, resolve, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { signingMarkers as enrollmentMarkers } from './phase58-sign-lines.mjs'
import { scrollGesture } from './phase61-scroll-gesture.mjs'
const marker = JSON.parse(await readFile('.build/phase54-active.json', 'utf8')), hdc = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe', bundle = 'local.dsh.mobile.offlineproduct', command = process.argv[2], parameters = process.argv.slice(3)
assert.equal(marker.authorization, 'Sentinel_8dcca9e84ab88191aa8537f5e2c9e695'); assert.equal(process.env.COMPUTERNAME?.toUpperCase(), 'DEVIN-MATEBOOK')
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: marker.world, TMP: marker.world }, base = ['-p', '-s', '127.0.0.1:8710']
function run(args) { const result = spawnSync(hdc, args, { env, windowsHide: true, encoding: 'utf8', timeout: 20000, maxBuffer: 4194304 }); if (result.error || result.status !== 0 || /\[Fail\]|\[Error\]/i.test(result.stdout)) throw new Error('official HDC command failed: ' + (result.stderr || result.stdout || result.error?.message)); return result.stdout }
const targets = run([...base, 'list', 'targets']).trim().split(/\r?\n/).filter(Boolean), target = targets.find(value => createHash('sha256').update(value).digest('hex').startsWith('54cfb7ac'))
if (targets.length !== 1 || !target) throw new Error('exact previously approved phone connection required')
const device = (...args) => run([...base, '-t', target, ...args]), maskedReference = 'target-54cfb7ac'
function publicNodes(nodes) { return nodes.map(row => row.text?.startsWith('{') ? { ...row, text: '[public JSON omitted]', publicJsonBytes: Buffer.byteLength(row.text), publicJsonSha256: createHash('sha256').update(row.text).digest('hex') } : row) }
async function layout(label) {
  assert.match(label, /^[a-z0-9-]{1,64}$/)
  const remote = '/data/local/tmp/harmony-phase67-' + label + '.json', local = join(marker.world, 'phase67-layout-' + label + '.json')
  const output = device('shell', 'uitest', 'dumpLayout', '-b', bundle, '-m', 'false', '-p', remote); if (!output.trim().startsWith('DumpLayout saved to:' + remote)) throw new Error('owned app layout unavailable: ' + output)
  device('file', 'recv', remote, local); const data = JSON.parse(await readFile(local, 'utf8')), nodes = []; function visit(value) { if (Array.isArray(value)) { value.forEach(visit); return } if (!value || typeof value !== 'object') return; if (value.attributes) nodes.push(value.attributes); if (value.children) visit(value.children) } visit(data)
  if (!nodes.some(row => row.bundleName === bundle)) throw new Error('selected product window absent; no UI input permitted')
  const report = JSON.stringify({ maskedReference, observedAt: new Date().toISOString(), nodes: publicNodes(nodes) }, null, 2) + '\n'; await writeFile(local, report); await writeFile('evidence/phase67-layout-' + label + '.json', report); return nodes
}
function bounds(row) { const match = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(row.bounds); if (!match || row.visible !== 'true' || row.enabled === 'false') throw new Error('visible enabled control required'); const [left, top, right, bottom] = match.slice(1).map(Number); if (left < 0 || top < 0 || right <= left || bottom <= top) throw new Error('control not on screen'); return { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) } }
function select(nodes, selector) { const rows = nodes.filter(row => (selector.startsWith('id:') ? row.id === selector.slice(3) : selector.startsWith('text:') ? row.text === selector.slice(5) : selector.startsWith('hint:') ? row.hint === selector.slice(5) : selector === 'type:Checkbox' ? row.type === 'Checkbox' : false) && row.visible === 'true'); if (rows.length !== 1) throw new Error('unique selected control required: ' + selector); return rows[0] }
if (command === 'inspect') {
  const metadataText = device('shell', 'bm', 'dump', '-n', bundle), metadata = JSON.parse(metadataText.slice(metadataText.indexOf('{'))), record = { observedAt: new Date().toISOString(), maskedReference, model: device('shell', 'param', 'get', 'const.product.model').trim(), os: device('shell', 'param', 'get', 'const.ohos.fullname').trim(), api: device('shell', 'param', 'get', 'const.ohos.apiversion').trim(), bundle: metadata.applicationInfo?.bundleName ?? metadata.name ?? bundle, versionName: metadata.versionName, versionCode: metadata.versionCode, pid: device('shell', 'pidof', bundle).trim() }
  await writeFile('evidence/phase67-device-' + (parameters[0] === 'final' ? 'final' : 'inspect') + '.json', JSON.stringify(record, null, 2) + '\n'); console.log(JSON.stringify(record))
} else if (command === 'launch') { const output = device('shell', 'aa', 'start', '-b', bundle, '-m', 'entry', '-a', 'EntryAbility'), pid = device('shell', 'pidof', bundle).trim(); assert.match(pid, /^\d+$/); await writeFile('.build/phase67-device-process.json', JSON.stringify({ at: new Date().toISOString(), pid, bundle }) + '\n'); console.log(JSON.stringify({ output, pid })) }
else if (command === 'foreground') {
  const before = device('shell', 'pidof', bundle).trim(), owner = JSON.parse(await readFile('.build/phase66-device-process.json', 'utf8'))
  assert.equal(before, owner.pid, 'only the previously owned live application can be foregrounded')
  await writeFile('evidence/phase67-foreground-attempt.json', JSON.stringify({ at: new Date().toISOString(), bundle, pid: before, existingProcessOnly: true, installation: false, identityOperation: false }, null, 2) + '\n', { flag: 'wx' })
  const output = device('shell', 'aa', 'start', '-b', bundle, '-m', 'entry', '-a', 'EntryAbility'), after = device('shell', 'pidof', bundle).trim()
  assert.equal(after, before)
  await writeFile('evidence/phase67-foreground.json', JSON.stringify({ at: new Date().toISOString(), bundle, pid: after, output, dataCleared: false, identityCreated: false, grantCreated: false }, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ pid: after, output, unchangedProcess: true }))
}
else if (command === 'layout') { const nodes = publicNodes(await layout(parameters[0])); console.log(JSON.stringify(nodes.filter(row => row.text || row.id).map(row => ({ type: row.type, id: row.id, text: row.text, bounds: row.bounds, visible: row.visible, enabled: row.enabled })))) }
else if (command === 'tap') { const row = select(await layout('before-tap-' + Date.now()), parameters[0]), point = bounds(row); if (['product-identity-begin', 'product-identity-confirm'].includes(row.id)) throw new Error('existing identity only; creation denied'); if (row.text === '确认并签署这次挑战') { const reviewed = JSON.parse(await readFile('.build/phase67-enrollment-reviewed.json', 'utf8')); assert.equal(reviewed.pairId, marker.pairId); assert.ok(reviewed.expiresAt > Date.now()); await writeFile(join(marker.world, 'phone-sign-attempt-phase67.json'), JSON.stringify({ at: new Date().toISOString(), pairId: reviewed.pairId, publicOfferSha256: reviewed.publicOfferSha256, attempts: 1, unknownUntilPublicReply: true }) + '\n', { flag: 'wx' }) } console.log(device('shell', 'uitest', 'uiInput', 'click', String(point.x), String(point.y))) }
else if (command === 'input') {
  const value = await readFile(parameters[1], 'utf8'); if (value.length > 32768 || /privatePkcs8|protectedPkcs8|password|privateKey|accessToken|secretKey/i.test(value)) throw new Error('only selected public input or synthetic text permitted')
  const row = select(await layout('before-input-' + Date.now()), parameters[0]), point = bounds(row), sequence = Date.now(), local = join(marker.world, 'phase67-public-input-' + sequence), remote = '/data/local/tmp/harmony-phase67-public-input-' + sequence
  device('shell', 'uitest', 'uiInput', 'click', String(point.x), String(point.y)); device('shell', 'uitest', 'uiInput', 'keyEvent', '2072', '2017'); device('shell', 'uitest', 'uiInput', 'keyEvent', '2055')
  const cleared = select(await layout('cleared-input-' + sequence), parameters[0]); assert.equal(cleared.text, '', 'selected public input must be empty before replacement'); const inputPoint = bounds(cleared)
  await writeFile(local + '.txt', value.trim(), { flag: 'wx' }); await writeFile(local + '.sh', '#!/system/bin/sh\nexec uitest uiInput inputText ' + inputPoint.x + ' ' + inputPoint.y + ' "$(cat ' + remote + '.txt)"\n', { flag: 'wx' })
  device('file', 'send', local + '.txt', remote + '.txt'); device('file', 'send', local + '.sh', remote + '.sh'); console.log(device('shell', 'sh', remote + '.sh'))
} else if (command === 'scroll') {
  const nodes = await layout('before-scroll-' + Date.now()), scroll = select(nodes, 'id:product-page-scroll'), request = parameters[0]; bounds(scroll)
  if (!['up', 'down', 'small-up', 'small-down'].includes(request)) throw new Error('known viewport scroll required')
  const point = scrollGesture(scroll.bounds, request.endsWith('up') ? 'up' : 'down', request.startsWith('small-'), nodes.filter(row => row.visible === 'true' && ['TextInput', 'TextArea', 'Button', 'Checkbox'].includes(row.type)).map(row => row.bounds))
  console.log(device('shell', 'uitest', 'uiInput', 'swipe', String(point.x), String(point.startY), String(point.x), String(point.endY), '1000'))
} else if (command === 'back') { await layout('before-back-' + Date.now()); console.log(device('shell', 'uitest', 'uiInput', 'keyEvent', 'Back')) }
else if (command === 'screenshot') {
  const label = parameters[0]; assert.match(label, /^[a-z0-9-]{1,48}$/); await layout('before-capture-' + label)
  const remote = '/data/local/tmp/harmony-phase67-' + label + '.png', local = resolve('evidence/phase67-' + label + '.png')
  device('shell', 'snapshot_display', '-f', remote); console.log(device('file', 'recv', remote, local)); console.log(JSON.stringify({ local, ownedBundle: bundle }))
}
else if (command === 'connection-log') {
  const pid = device('shell', 'pidof', bundle).trim(); assert.equal(pid, JSON.parse(await readFile('.build/phase66-device-process.json', 'utf8')).pid)
  const raw = device('shell', 'hilog', '-P', pid, '-x'), lines = raw.split(/\r?\n/), count = expression => lines.filter(line => expression.test(line)).length
  const categories = Object.fromEntries(Object.entries({ websocket: /websocket/i, tls: /SSL|TLS|certificate/i, networkFailure: /connect.*fail|network.*error|websocket.*error/i, nativeError: /TypeError|ReferenceError|SyntaxError/, huksFailure: /huks.*(?:fail|error)/i, timeout: /timeout|timed out/i, jsError: / E .*?(?:Ark|JS|websocket|NETSTACK)/i }).map(([key, expression]) => [key, count(expression)]))
  const codes = [...new Set(lines.filter(line => /websocket|NETSTACK|SSL|TLS/i.test(line)).flatMap(line => [...line.matchAll(/(?:errorCode|errCode|error code|errno|code)\s*[:=]\s*(-?\d{1,10})/gi)].map(match => match[1])))].slice(0, 30)
  const report = { at: new Date().toISOString(), pid, categories, codes, rawLogRetained: false, rawMessagesProjected: false }; await writeFile('evidence/phase67-connection-log-' + Date.now() + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report))
}
else if (command === 'errors') {
  const pid = device('shell', 'pidof', bundle).trim(); if (!/^\d+$/.test(pid)) throw new Error('one owned process required'); const raw = device('shell', 'hilog', '-P', pid, '-L', 'E', '-x'); console.log(JSON.stringify({ pid, markers: enrollmentMarkers(raw), rawLogRetained: false }))
}
else if (command === 'time') { const value = device('shell', 'date', '-u', '+%Y-%m-%dT%H:%M:%SZ').trim(); console.log(JSON.stringify({ phoneUtc: value, hostUtc: new Date().toISOString(), skewMs: Date.parse(value) - Date.now() })) }
else if (command === 'stop-retained') {
  const before = device('shell', 'pidof', bundle).trim(), owner = JSON.parse(await readFile('.build/phase66-device-process.json', 'utf8')), exited = JSON.parse(await readFile('evidence/phase67-device-final.json', 'utf8'))
  assert.equal(before, owner.pid); assert.equal(exited.pid, before); assert.equal(exited.bundle, bundle)
  assert.ok(Date.parse(exited.observedAt) > Date.parse('2026-10-16T14:04:08Z'))
  const output = device('shell', 'aa', 'force-stop', bundle), after = device('shell', 'pidof', bundle).trim(); assert.equal(after, '')
  const report = { at: new Date().toISOString(), ownedPid: before, finalPid: after, output, onlyOwnedBundle: bundle, nativeExitRequested: true, reason: 'native ability exit retained the original owned process', dataCleared: false, identityDeleted: false, installationChanged: false }
  await writeFile('evidence/phase67-phone-cleanup.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report))
}
else if (command === 'stop-owned') { const before = device('shell', 'pidof', bundle).trim(); assert.equal(before, JSON.parse(await readFile('.build/phase67-device-process.json', 'utf8')).pid, 'only this attempt owned PID can be stopped'); const output = device('shell', 'aa', 'force-stop', bundle), after = device('shell', 'pidof', bundle).trim(); assert.equal(after, ''); await writeFile('evidence/phase67-phone-cleanup.json', JSON.stringify({ at: new Date().toISOString(), ownedPid: before, finalPid: after, output, onlyOwnedBundle: bundle, reason: 'owned window no longer visible; native UI input stopped', dataCleared: false, identityDeleted: false }, null, 2) + '\n'); console.log(JSON.stringify({ ownedPid: before, stopped: true, dataCleared: false, identityDeleted: false })) }
else if (command === 'enrollment-log') { const pid = device('shell', 'pidof', bundle).trim(); assert.match(pid, /^\d+$/); const raw = device('shell', 'hilog', '-P', pid, '-x'), report = { at: new Date().toISOString(), pid, markers: enrollmentMarkers(raw), rawLogRetained: false }; await writeFile('evidence/phase67-enrollment-markers-' + Date.now() + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report)) }
else if (command === 'verify-public-input') { const row = select(await layout('verify-public-input-' + Date.now()), parameters[0]), expected = await readFile(parameters[1], 'utf8'); assert.deepEqual(JSON.parse(row.text), JSON.parse(expected), 'selected native public input differs'); console.log(JSON.stringify({ exactInput: true, bytes: Buffer.byteLength(row.text), sha256: createHash('sha256').update(row.text).digest('hex') })) }
else if (command === 'review-enrollment') {
  const path = parameters[0]; assert.ok(path.startsWith(marker.world + '/fixed-world/exchange/')); const raw = await readFile(path, 'utf8'), offer = JSON.parse(raw), config = JSON.parse(await readFile(join(marker.home, 'field.json'), 'utf8')), identity = JSON.parse(await readFile(join(marker.home, 'phone-public.json'), 'utf8')), nodes = await layout('review-enrollment'), texts = nodes.filter(row => row.visible === 'true').map(row => row.text), fingerprint = value => 'p256-sha256-' + createHash('sha256').update(Buffer.from(value, 'base64url')).digest('hex')
  assert.equal(offer.pairId, marker.pairId); assert.equal(offer.identityAlias, marker.phoneAlias); assert.equal(offer.ticket.publicSpki, identity.publicSpki); assert.equal(offer.audience, config.audience); assert.deepEqual(offer.sessions, ['harmony-mobile-field-replay-session']); assert.equal(offer.grantTtlMs, marker.grantMaximumMs); assert.ok(offer.ticket.expiresAt > Date.now())
  assert.deepEqual(offer.operations, ['task.submit', 'task.receipt', 'session.cancel', 'session.sync', 'rich.mount', 'rich.snapshot', 'rich.saveDraft', 'rich.invoke', 'rich.status', 'rich.dispose'])
  for (const text of [offer.audience, fingerprint(offer.desktopPublicSpki), fingerprint(offer.ticket.publicSpki), offer.ticket.desktopId + ' / ' + offer.sessions.join(', '), offer.operations.join(', ')]) assert.ok(texts.includes(text), 'native preview field not visible or mismatched')
  const report = { at: new Date().toISOString(), pairId: offer.pairId, publicOfferSha256: createHash('sha256').update(raw.trim()).digest('hex'), expiresAt: offer.ticket.expiresAt, grantTtlMs: offer.grantTtlMs, bothFingerprintsMatched: true, nativeScopeMatched: true, grantCreated: false }; await writeFile('.build/phase67-enrollment-reviewed.json', JSON.stringify(report, null, 2) + '\n'); await writeFile('evidence/phase67-enrollment-reviewed.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))
}
else if (command === 'review-pairing') {
  const path = resolve(parameters[0]), delta = relative(resolve(marker.world, 'fixed-world/exchange'), path)
  assert.match(delta, /^run-[a-zA-Z0-9_-]+[\\/]phone-pair[.]json$/)
  const record = JSON.parse(await readFile(path, 'utf8')), lifetime = JSON.parse(await readFile(join(dirname(path), 'grant-lifetime.json'), 'utf8')), offer = JSON.parse(await readFile(join(dirname(path), 'desktop-offer.json'), 'utf8'))
  const nodes = await layout('review-local-pairing'), input = select(nodes, 'hint:公开配对配置'), texts = nodes.filter(row => row.visible === 'true').map(row => row.text)
  assert.deepEqual(JSON.parse(input.text), record)
  assert.equal(record.identityAlias, marker.phoneAlias); assert.equal(record.paired.pairId, marker.pairId); assert.equal(record.paired.audience, offer.audience)
  assert.equal(record.paired.grant.expiresAt, lifetime.expiresAt); assert.ok(lifetime.expiresAt > Date.now()); assert.ok(lifetime.expiresAt <= Date.now() + 1800000)
  assert.deepEqual(record.paired.grant.sessions, offer.sessions); assert.deepEqual(record.paired.grant.operations, offer.operations)
  const fingerprint = value => 'p256-sha256-' + createHash('sha256').update(Buffer.from(value, 'base64url')).digest('hex')
  const desktopFingerprint = fingerprint(record.desktopPublicSpki), phoneFingerprint = offer.ticket.credentialId
  assert.equal(desktopFingerprint, 'p256-sha256-ee92b90cd922b7049b680933191c74a050ad450493098ad3c43e9180bc2746dc')
  assert.equal(phoneFingerprint, 'p256-sha256-6dbd072d7da53e682d4852d1e11cc8d4b48cc5a414283cd221b2b0c012fe9b99')
  for (const text of [desktopFingerprint, phoneFingerprint, offer.ticket.desktopId + ' / ' + offer.sessions.join(', '), offer.audience]) assert.ok(texts.includes(text), 'local pairing preview missing: ' + text)
  assert.equal(nodes.filter(row => row.type === 'Checkbox' && row.visible === 'true').length, 2)
  const report = { at: new Date().toISOString(), path, expiresAt: lifetime.expiresAt, desktopFingerprint, phoneFingerprint, audience: offer.audience, exactDesktopPublicRecord: true, sameSessionAndOperations: true }
  await writeFile('.build/phase67-pair-reviewed.json', JSON.stringify(report, null, 2) + '\n')
  await writeFile('evidence/phase67-pair-reviewed.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
}
else if (command === 'confirm-pair-checks') {
  const reviewed = JSON.parse(await readFile('.build/phase67-pair-reviewed.json', 'utf8')); assert.ok(reviewed.expiresAt > Date.now())
  for (const index of [0, 1]) {
    const nodes = await layout('before-pair-checkbox-' + index), input = select(nodes, 'hint:公开配对配置')
    assert.deepEqual(JSON.parse(input.text), JSON.parse(await readFile(reviewed.path, 'utf8')))
    const rows = nodes.filter(row => row.type === 'Checkbox' && row.visible === 'true').sort((a, b) => bounds(a).y - bounds(b).y)
    assert.equal(rows.length, 2); assert.ok(['true', 'false'].includes(rows[index].checked))
    if (rows[index].checked === 'false') { const point = bounds(rows[index]); device('shell', 'uitest', 'uiInput', 'click', String(point.x), String(point.y)) }
  }
  const nodes = await layout('confirmed-pair-checkboxes'), rows = nodes.filter(row => row.type === 'Checkbox' && row.visible === 'true')
  assert.equal(rows.length, 2); assert.ok(rows.every(row => row.checked === 'true')); assert.notEqual(select(nodes, 'id:product-confirm-pair').enabled, 'false')
  console.log(JSON.stringify({ originalFingerprintsAndNetworkHostConfirmed: true, newGrantCreated: false }))
}
else if (command === 'read-public') {
  const kind = parameters[0]; assert.ok(['identity', 'reply'].includes(kind)); const nodes = await layout('public-' + kind), candidates = []
  for (const row of nodes.filter(row => row.type === 'Text' && row.text?.startsWith('{'))) { let value; try { value = JSON.parse(row.text) } catch (error) { continue } if (kind === 'identity' && value.identityAlias === marker.phoneAlias && typeof value.publicSpki === 'string' && value.credentialId === 'p256-sha256-' + createHash('sha256').update(Buffer.from(value.publicSpki, 'base64url')).digest('hex')) candidates.push(value); if (kind === 'reply' && value.schema === 'harmony-first-use-reply/1' && value.offer?.pairId === marker.pairId) candidates.push(value) }
  assert.equal(candidates.length, 1, 'one native public result required')
  let path = join(marker.home, 'phone-public.json')
  if (kind === 'reply') {
    const offerPath = resolve(parameters[1]), delta = relative(resolve(marker.world, 'fixed-world/exchange'), offerPath)
    assert.match(delta, /^run-[a-zA-Z0-9_-]+[\\/]desktop-offer[.]json$/)
    const offer = JSON.parse(await readFile(offerPath, 'utf8'))
    assert.deepEqual(candidates[0].offer, offer, 'native reply must match this fresh offer')
    assert.ok(offer.ticket.expiresAt > Date.now(), 'fresh offer already expired')
    path = join(dirname(offerPath), 'phone-reply.json')
  }
  let existingRecordMatched = false
  try { await writeFile(path, JSON.stringify(candidates[0], null, 2) + '\n', { flag: 'wx' }) } catch (error) { if (kind !== 'identity' || error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), candidates[0], 'existing public identity differs; preserve both and stop'); existingRecordMatched = true }
  console.log(JSON.stringify({ kind, path, fingerprint: candidates[0].credentialId, existingRecordMatched, privateBytes: false }))
}
else throw new Error('closed product command required')
