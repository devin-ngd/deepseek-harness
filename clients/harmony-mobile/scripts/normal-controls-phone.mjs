/** Bounded preparation on the approved original phone. No identity creation, grant, connection or task action is exposed. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const state = await json('evidence/normal-controls-deployment.json'), installed = await json('evidence/normal-controls-installation.json')
assert.equal(state.approval.evidence, 'Sentinel_e2d971bb3abc8191b9b8f261d185e4fb'); assert.equal(installed.success, true)
assert.equal(hash(await readFile(installed.artifact.path)), installed.artifact.sha256)
const command = process.argv[2]
assert.ok(['inspect', 'launch', 'layout', 'capture', 'input-alias', 'existing-identity', 'read-identity'].includes(command))
const hdc = state.phone.hdc, base = ['-p', '-s', state.phone.server], bundle = 'local.dsh.mobile.offlineproduct'
function run(args) {
  const result = spawnSync(hdc, args, { windowsHide: true, encoding: 'utf8', timeout: 20000, maxBuffer: 4194304 })
  assert.equal(result.error, undefined, 'HDC unavailable; observe without repeating side effects')
  assert.equal(result.status, 0, 'HDC failed; observe without repeating side effects')
  assert.doesNotMatch(result.stdout, /\[Fail\]|\[Error\]/i)
  return result.stdout
}
const targets = run([...base, 'list', 'targets']).trim().split(/\r?\n/).filter(row => row && row !== '[Empty]')
assert.equal(targets.length, 1); assert.equal('target-' + hash(targets[0]).slice(0, 8), state.phone.targetRef)
const device = (...args) => run([...base, '-t', targets[0], ...args])
assert.equal(device('shell', 'param', 'get', 'const.product.model').trim(), 'CMM-AL10')
assert.equal(device('shell', 'param', 'get', 'const.ohos.apiversion').trim(), '26')
async function record(kind, value) {
  const path = join(state.run, 'phone-' + kind + '-' + Date.now() + '.json')
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); return path
}
async function layout() {
  const sequence = Date.now(), remote = '/data/local/tmp/harmony-normal-controls-' + sequence + '.json', path = join(state.run, 'phone-layout-' + sequence + '.json')
  assert.ok(device('shell', 'uitest', 'dumpLayout', '-b', bundle, '-m', 'false', '-p', remote).trim().startsWith('DumpLayout saved to:' + remote))
  device('file', 'recv', remote, path)
  const tree = await json(path), nodes = []
  function visit(value) { if (Array.isArray(value)) { value.forEach(visit); return }; if (!value || typeof value !== 'object') return; if (value.attributes) nodes.push(value.attributes); if (value.children) visit(value.children) }
  visit(tree)
  const owned = nodes.some(node => node.bundleName === bundle), foreign = nodes.some(node => node.bundleName && node.bundleName !== bundle)
  const safe = nodes.map(node => ({ type: node.type, id: node.id, text: node.text?.startsWith('{') ? '[public JSON omitted]' : node.text, hint: node.hint, bounds: node.bounds, visible: node.visible, enabled: node.enabled, checked: node.checked }))
  await writeFile(path, JSON.stringify({ at: new Date().toISOString(), targetRef: state.phone.targetRef, owned, foreign, nodes: owned && !foreign ? safe : [] }, null, 2) + '\n')
  assert.equal(owned, true, 'Owned app window required'); assert.equal(foreign, false, 'Foreign overlay present; no input permitted')
  return { nodes, safe, path }
}
const labels = new Map((await json('harmony/entry/src/main/resources/base/element/string.json')).string.map(row => [row.name, row.value]))
const label = key => { const value = labels.get(key); assert.equal(typeof value, 'string', 'Missing native public label'); return value }
function selected(nodes, predicate) { const found = nodes.filter(node => node.visible === 'true' && node.enabled !== 'false' && predicate(node)); assert.equal(found.length, 1, 'One visible owned control required'); return found[0] }
function point(node) { const parts = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(node.bounds); assert.ok(parts); const [left, top, right, bottom] = parts.slice(1).map(Number); assert.ok(right > left && bottom > top); return [String(Math.floor((left + right) / 2)), String(Math.floor((top + bottom) / 2))] }
let result
if (command === 'inspect') {
  const raw = device('shell', 'bm', 'dump', '-n', bundle), metadata = JSON.parse(raw.slice(raw.indexOf('{')))
  assert.equal(metadata.applicationInfo?.bundleName ?? metadata.name, bundle)
  result = { model: 'CMM-AL10', api: 26, bundle, versionCode: metadata.versionCode, versionName: metadata.versionName, running: /^\d+$/.test(device('shell', 'pidof', bundle).trim()), installedSha256: installed.artifact.sha256 }
} else if (command === 'launch') {
  await record('launch-attempt', { at: new Date().toISOString(), bundle, grantStarted: false })
  const output = device('shell', 'aa', 'start', '-b', bundle, '-m', 'entry', '-a', 'EntryAbility')
  assert.doesNotMatch(output, /Error Code:|failed to start ability/i)
  assert.match(device('shell', 'pidof', bundle).trim(), /^\d+$/)
  result = { launched: true, newIdentity: false, newGrant: false, forcedStop: false }
} else {
  const view = await layout()
  if (command === 'layout') result = { path: view.path, nodes: view.safe }
  else if (command === 'capture') {
    const sequence = Date.now(), remote = '/data/local/tmp/harmony-normal-controls-' + sequence + '.jpeg', path = join(state.run, 'phone-' + sequence + '.jpeg')
    device('shell', 'snapshot_display', '-f', remote); device('file', 'recv', remote, path)
    const bytes = await readFile(path); assert.ok(bytes.length > 1000)
    result = { path, bytes: bytes.length, sha256: hash(bytes), ownedLayoutEvidence: view.path }
  } else if (command === 'input-alias') {
    const node = selected(view.nodes, node => node.type === 'TextInput' && node.hint === label('product_identity_name'))
    assert.ok(node.text === '' || node.text === state.originalIdentity.phoneAlias)
    if (node.text === '') device('shell', 'uitest', 'uiInput', 'inputText', ...point(node), state.originalIdentity.phoneAlias)
    result = { originalAliasEntered: true, identityCreated: false }
  } else if (command === 'existing-identity') {
    const alias = selected(view.nodes, node => node.type === 'TextInput' && node.hint === label('product_identity_name'))
    assert.equal(alias.text, state.originalIdentity.phoneAlias)
    const button = selected(view.nodes, node => node.type === 'Button' && node.text === label('product_identity_existing'))
    device('shell', 'uitest', 'uiInput', 'click', ...point(button)); result = { existingPublicIdentityRequested: true, identityCreated: false }
  } else {
    const found = []
    for (const node of view.nodes.filter(node => node.text?.startsWith('{'))) { let value; try { value = JSON.parse(node.text) } catch (error) { if (error instanceof SyntaxError) continue; throw error }; if (value.identityAlias === state.originalIdentity.phoneAlias && value.publicSpki) found.push(value) }
    assert.equal(found.length, 1); const identity = found[0]
    assert.equal(identity.credentialId, state.originalIdentity.phoneFingerprint)
    assert.deepEqual(Object.keys(identity).sort(), ['credentialId', 'identityAlias', 'publicSpki'])
    const path = join(state.run, 'phone-public-identity.json')
    await writeFile(path, JSON.stringify(identity, null, 2) + '\n', { flag: 'wx' })
    result = { path, fingerprint: identity.credentialId, originalHuksIdentityRetained: true, privateBytesRead: false }
  }
}
const evidence = await record(command, { at: new Date().toISOString(), ...result })
console.log(JSON.stringify({ ...result, evidence }))
