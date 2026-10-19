/** Operate only the already installed approved product via official HDC/UI commands; no installation, shell bridge, key export or device settings. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const marker = JSON.parse(await readFile('.build/phase54-active.json', 'utf8')), hdc = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe', bundle = 'local.dsh.mobile.offlineproduct', command = process.argv[2], parameters = process.argv.slice(3)
assert.equal(marker.authorization, 'Sentinel_8dcca9e84ab88191aa8537f5e2c9e695'); assert.equal(process.env.COMPUTERNAME?.toUpperCase(), 'DEVIN-MATEBOOK')
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: marker.world, TMP: marker.world }, base = ['-p', '-s', '127.0.0.1:8710']
function run(args) { const result = spawnSync(hdc, args, { env, windowsHide: true, encoding: 'utf8', timeout: 20000, maxBuffer: 4194304 }); if (result.error || result.status !== 0 || /\[Fail\]|\[Error\]/i.test(result.stdout)) throw new Error('official HDC command failed: ' + (result.stderr || result.stdout || result.error?.message)); return result.stdout }
const targets = run([...base, 'list', 'targets']).trim().split(/\r?\n/).filter(Boolean), target = targets.find(value => createHash('sha256').update(value).digest('hex').startsWith('54cfb7ac'))
if (targets.length !== 1 || !target) throw new Error('exact previously approved phone connection required')
const device = (...args) => run([...base, '-t', target, ...args]), maskedReference = 'target-54cfb7ac'
async function layout(label) {
  assert.match(label, /^[a-z0-9-]{1,64}$/)
  const remote = '/data/local/tmp/harmony-phase54-' + label + '.json', local = join(marker.world, 'layout-' + label + '.json')
  const output = device('shell', 'uitest', 'dumpLayout', '-b', bundle, '-m', 'false', '-p', remote); if (!output.trim().startsWith('DumpLayout saved to:' + remote)) throw new Error('owned app layout unavailable: ' + output)
  device('file', 'recv', remote, local); const data = JSON.parse(await readFile(local, 'utf8')), nodes = []; function visit(value) { if (Array.isArray(value)) { value.forEach(visit); return } if (!value || typeof value !== 'object') return; if (value.attributes) nodes.push(value.attributes); if (value.children) visit(value.children) } visit(data)
  if (!nodes.some(row => row.bundleName === bundle)) throw new Error('selected product window absent; no UI input permitted')
  await writeFile('evidence/phase54-layout-' + label + '.json', JSON.stringify({ maskedReference, observedAt: new Date().toISOString(), nodes }, null, 2) + '\n'); return nodes
}
function bounds(row) { const match = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(row.bounds); if (!match || row.visible !== 'true' || row.enabled === 'false') throw new Error('visible enabled control required'); const [left, top, right, bottom] = match.slice(1).map(Number); if (left < 0 || top < 0 || right <= left || bottom <= top) throw new Error('control not on screen'); return { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) } }
function select(nodes, selector) { const rows = nodes.filter(row => (selector.startsWith('id:') ? row.id === selector.slice(3) : selector.startsWith('text:') ? row.text === selector.slice(5) : selector.startsWith('hint:') ? row.hint === selector.slice(5) : false) && row.visible === 'true'); if (rows.length !== 1) throw new Error('unique selected control required: ' + selector); return rows[0] }
if (command === 'inspect') {
  const metadataText = device('shell', 'bm', 'dump', '-n', bundle), metadata = JSON.parse(metadataText.slice(metadataText.indexOf('{'))), record = { observedAt: new Date().toISOString(), maskedReference, model: device('shell', 'param', 'get', 'const.product.model').trim(), os: device('shell', 'param', 'get', 'const.ohos.fullname').trim(), api: device('shell', 'param', 'get', 'const.ohos.apiversion').trim(), bundle: metadata.applicationInfo?.bundleName ?? metadata.name ?? bundle, versionName: metadata.versionName, versionCode: metadata.versionCode, pid: device('shell', 'pidof', bundle).trim() }
  await writeFile('evidence/phase54-device-' + (parameters[0] === 'final' ? 'final' : 'inspect') + '.json', JSON.stringify(record, null, 2) + '\n'); console.log(JSON.stringify(record))
} else if (command === 'launch') { console.log(device('shell', 'aa', 'start', '-b', bundle, '-m', 'entry', '-a', 'EntryAbility')) }
else if (command === 'layout') { const nodes = await layout(parameters[0]); console.log(JSON.stringify(nodes.filter(row => row.text || row.id).map(row => ({ type: row.type, id: row.id, text: row.text, bounds: row.bounds, visible: row.visible, enabled: row.enabled })))) }
else if (command === 'tap') { const row = select(await layout('before-tap-' + Date.now()), parameters[0]), point = bounds(row); if (parameters[0] === 'id:product-identity-confirm') await writeFile(join(marker.world, 'phone-create-attempt.json'), JSON.stringify({ alias: marker.phoneAlias, attempts: 1, confirmationAt: new Date().toISOString(), doNotRepeat: true }) + '\n', { flag: 'wx' }); console.log(device('shell', 'uitest', 'uiInput', 'click', String(point.x), String(point.y))) }
else if (command === 'input') {
  const value = await readFile(parameters[1], 'utf8'); if (value.length > 32768 || /privatePkcs8|protectedPkcs8|password|privateKey|accessToken|secretKey/i.test(value)) throw new Error('only selected public input or synthetic text permitted')
  const row = select(await layout('before-input-' + Date.now()), parameters[0]), point = bounds(row), quoted = "'" + value.trim().replaceAll("'", "'\\''") + "'"
  console.log(device('shell', 'uitest', 'uiInput', 'inputText', String(point.x), String(point.y), quoted))
} else if (command === 'scroll') {
  const nodes = await layout('before-scroll-' + Date.now()), scroll = select(nodes, 'id:product-page-scroll'), view = bounds(scroll), upward = parameters[0] === 'up'; if (!upward && parameters[0] !== 'down') throw new Error('up/down only')
  console.log(device('shell', 'uitest', 'uiInput', 'swipe', '1200', String(view.y + (upward ? -450 : 450)), '1200', String(view.y + (upward ? 450 : -450)), '1000'))
} else if (command === 'back') { await layout('before-back-' + Date.now()); console.log(device('shell', 'uitest', 'uiInput', 'keyEvent', 'Back')) }
else if (command === 'errors') {
  const pid = device('shell', 'pidof', bundle).trim(); if (!/^\d+$/.test(pid)) throw new Error('one owned process required'); const raw = device('shell', 'hilog', '-P', pid, '-L', 'E', '-x'), lines = raw.split(/\r?\n/).filter(line => /huks|crypto|error|fail|exception/i.test(line)); await writeFile(join(marker.world, 'owned-errors-' + Date.now() + '.log'), raw); console.log(JSON.stringify({ pid, matchingLines: lines.filter(line => !/pkcs8|privatekey|password|token|secret|payload/i.test(line)).slice(-40) }))
}
else throw new Error('closed product command required')
