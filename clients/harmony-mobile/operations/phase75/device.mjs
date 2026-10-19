/** Approved original-bundle UI reads, enrollment and final7 pairing/connection; never creates an identity, installs or deletes private files. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve, relative, dirname, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { PLAN, hash, reviewApprovalRecord, reviewPhoneIdentity } from './policy.mjs'
import { scrollGesture } from './scroll-gesture.mjs'
import { firstUseOfferSchema, firstUseReplySchema, firstUseOfferBytes, enrollmentProofBytes } from './shared.mjs'
import { verifyP256, p256CredentialId, canonicalPublicTrust, verifyPublicTrustHistory } from './shared.mjs'
/** @param command - closed owned-UI action. @param argument - selected allowed control or public file. @param directory - sealed operator. @param approved - current human decision record already checked by the enclosing CLI. @returns bounded public-only evidence; no force-stop, key creation or arbitrary host bridge exists. */
export async function nativeUI(command, argument, directory, approved) {
const root = PLAN.local.run, json = async path => JSON.parse(await readFile(path, 'utf8'));
assert.ok(['inspect','launch','foreground','layout','tap','input-alias','input-offer','compare-enrollment','read-reply','scroll','read-public','input-pair','compare-pair','confirm-pair','connect'].includes(command));
assert.ok(process.stdin.isTTY && process.stdout.isTTY); reviewApprovalRecord(approved, hash(await readFile(join(directory,'plan.json'))), hash(await readFile(join(directory,'files.sha256.json'))));
assert.equal((await json(join(root,'operation.json'))).sourceHumanMessageId, approved.sourceHumanMessageId);
assert.equal(process.env.COMPUTERNAME?.toUpperCase(), 'DEVIN-MATEBOOK')
const hdc = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe', base = ['-p', '-s', '127.0.0.1:8710']
function run(args) { const r = spawnSync(hdc, args, { encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 4194304 }); if (r.error || r.status !== 0 || /\[Fail\]|\[Error\]/i.test(r.stdout)) { const error = new Error('approved HDC operation unavailable'); error.code = r.error?.code ?? 'hdc-unavailable'; throw error }; return r.stdout }
const targets = run([...base, 'list', 'targets']).trim().split(/\r?\n/).filter(value => value && value !== '[Empty]')
assert.equal(targets.length, 1); assert.ok(hash(targets[0]).startsWith('54cfb7ac'))
const device = (...args) => run([...base, '-t', targets[0], ...args]), bundle = PLAN.native.bundle
const strings = new Map((await json(join(directory, 'native-strings.json'))).string.map(value => [value.name, value.value]))
async function evidence(name, value) { const path = join(root, name + '-' + Date.now() + '.json'); await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); return path }
async function layout() {
  const remote = '/data/local/tmp/harmony-phase75-layout-' + Date.now() + '.json', local = join(root, 'layout-' + Date.now() + '.json')
  const output = device('shell', 'uitest', 'dumpLayout', '-b', bundle, '-m', 'false', '-p', remote); assert.ok(output.trim().startsWith('DumpLayout saved to:' + remote))
  device('file', 'recv', remote, local); const tree = await json(local), nodes = []
  function visit(value) { if (Array.isArray(value)) { value.forEach(visit); return }; if (!value || typeof value !== 'object') return; if (value.attributes) nodes.push(value.attributes); if (value.children) visit(value.children) }
  visit(tree)
  const safe = nodes.map(node => ({ type: node.type, id: node.id, text: node.text?.startsWith('{') ? '[public JSON omitted]' : node.text, hint: node.hint, bounds: node.bounds, visible: node.visible, enabled: node.enabled, checked: node.checked }))
  const ownedPresent = nodes.some(node => node.bundleName === bundle), foreignPresent = nodes.some(node => node.bundleName && node.bundleName !== bundle)
  await writeFile(local, JSON.stringify({ observedAt: Date.now(), targetRef: PLAN.native.targetRef, nodes: ownedPresent && !foreignPresent ? safe : [], ownedPresent, foreignPresent }, null, 2) + '\n')
  assert.ok(ownedPresent, 'owned app window unavailable; no UI input allowed'); assert.equal(foreignPresent, false)
  return { nodes, safe, path: local }
}
function select(nodes, selector) { const rows = nodes.filter(node => node.visible === 'true' && (selector.startsWith('id:') ? node.id === selector.slice(3) : selector.startsWith('text:') ? node.text === selector.slice(5) : selector.startsWith('hint:') && node.hint === selector.slice(5))); assert.equal(rows.length, 1, 'one visible owned control required'); assert.notEqual(rows[0].enabled, 'false'); return rows[0] }
function point(node) { const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(node.bounds); assert.ok(match); const [left, top, right, bottom] = match.slice(1).map(Number); assert.ok(right > left && bottom > top); return [String(Math.floor((left + right) / 2)), String(Math.floor((top + bottom) / 2))] }
async function offerFile(path) {
  const selected = resolve(path), child = relative(resolve(PLAN.local.world, 'exchange'), selected); assert.match(child, /^run-[A-Za-z0-9_-]+[\\/]desktop-offer\.json$/)
  const attempt = await json(join(root, 'start-attempt.json')); assert.equal(attempt.previousExchangeDirs.includes(basename(dirname(selected))), false)
  const raw = await readFile(selected, 'utf8'), offer = firstUseOfferSchema.parse(JSON.parse(raw)); assert.equal(offer.pairId, PLAN.pairId); assert.equal(offer.audience, PLAN.relay.host); assert.equal(offer.identityAlias, PLAN.identity.phoneAlias)
  assert.equal(p256CredentialId(offer.desktopPublicSpki), PLAN.identity.desktopFingerprint); assert.equal(offer.ticket.credentialId, PLAN.identity.phoneFingerprint); assert.equal(offer.ticket.deviceId, PLAN.identity.deviceId); assert.equal(offer.ticket.desktopId, PLAN.identity.desktopId)
  assert.deepEqual(offer.sessions, [PLAN.session]); assert.deepEqual(offer.operations, PLAN.operations); assert.equal(offer.grantTtlMs, PLAN.limits.grantMs); assert.ok(offer.ticket.expiresAt > Date.now())
  assert.equal(verifyP256(offer.desktopPublicSpki, firstUseOfferBytes(offer), offer.signature), true)
  return { path: selected, raw, offer }
}
let result
if (['input-pair', 'compare-pair', 'confirm-pair', 'connect'].includes(command)) {
  const exchange = await json(join(root, 'exchange.json')), path = join(exchange.exchange, 'phone-pair.json'), raw = await readFile(path, 'utf8'), value = JSON.parse(raw), anchor = await json(join(root, 'phone-previous-v2.json'))
  assert.equal(value.record.paired.grant.epoch, PLAN.epochs.grant); assert.equal(value.revokedEpoch, PLAN.epochs.before); assert.equal(value.record.paired.pairId, PLAN.pairId); await verifyPublicTrustHistory(value, anchor)
  if (command === 'connect') { const reviewed = await json(join(root, 'pair-reviewed.json')); assert.equal(reviewed.sha256, hash(raw)); const view = await layout(); device('shell','uitest','uiInput','click',...point(select(view.nodes,'id:product-connect'))); result = { exactFinalGrantConnectRequested: true } }
  else {
    const view = await layout(), input = select(view.nodes, 'hint:' + strings.get('product_public_offer'))
    if (command === 'input-pair') {
      assert.equal(input.text ?? '', ''); const sequence=Date.now(), local=join(root,'public-pair-'+sequence), remote='/data/local/tmp/harmony-phase75-pair-'+sequence, xy=point(input)
      await writeFile(local+'.txt',raw,{flag:'wx'}); await writeFile(local+'.sh','#!/system/bin/sh\nexec uitest uiInput inputText '+xy.join(' ')+' "$(cat '+remote+'.txt)"\n',{flag:'wx'})
      device('file','send',local+'.txt',remote+'.txt'); device('file','send',local+'.sh',remote+'.sh'); device('shell','sh',remote+'.sh'); result={ finalPublicDocumentEntered:true, grantEpoch:PLAN.epochs.grant }
    } else {
      assert.equal(canonicalPublicTrust(JSON.parse(input.text)),canonicalPublicTrust(value))
      for (const fingerprint of [PLAN.identity.phoneFingerprint,PLAN.identity.desktopFingerprint]) assert.ok(view.nodes.some(node=>node.text===fingerprint&&node.visible==='true'))
      const buttons=view.nodes.filter(node=>node.id==='product-confirm-pair'&&node.visible==='true');assert.equal(buttons.length,1);const button=buttons[0],low=Number(point(input)[1]),high=Number(point(button)[1]),boxes=view.nodes.filter(node=>node.type==='Checkbox'&&node.visible==='true'&&Number(point(node)[1])>low&&Number(point(node)[1])<high); assert.equal(boxes.length,2)
      if(command==='compare-pair'){ for(const box of boxes){if(box.checked==='false')device('shell','uitest','uiInput','click',...point(box));else assert.equal(box.checked,'true')}; await writeFile(join(root,'pair-reviewed.json'),JSON.stringify({at:Date.now(),sha256:hash(raw),pairId:PLAN.pairId,grantEpoch:PLAN.epochs.grant})+'\n',{flag:'wx'}); result={ originalFingerprintsAndExactFinalDocumentCompared:true } }
      else { assert.notEqual(button.enabled,'false');const reviewed=await json(join(root,'pair-reviewed.json'));assert.equal(reviewed.sha256,hash(raw));for(const box of boxes)assert.equal(box.checked,'true');await writeFile(join(root,'native-pair-save-attempt.json'),JSON.stringify({at:Date.now(),sha256:hash(raw),onceOnly:true})+'\n',{flag:'wx'});device('shell','uitest','uiInput','click',...point(button));result={ finalGrantSaveRequested:true, intermediateActivated:false } }
    }
  }
} else if (command === 'inspect') {
  const raw = device('shell', 'bm', 'dump', '-n', bundle), metadata = JSON.parse(raw.slice(raw.indexOf('{')))
  result = { observedAt: Date.now(), targetRef: PLAN.native.targetRef, model: device('shell', 'param', 'get', 'const.product.model').trim(), api: device('shell', 'param', 'get', 'const.ohos.apiversion').trim(), bundle: metadata.applicationInfo?.bundleName ?? metadata.name, versionName: metadata.versionName, versionCode: metadata.versionCode, pid: device('shell', 'pidof', bundle).trim() }
  assert.equal(result.model, PLAN.native.model); assert.equal(result.api, PLAN.native.api); assert.equal(result.bundle, bundle)
} else if (command === 'launch') {
  const before = device('shell', 'pidof', bundle).trim(); assert.equal(before, '')
  await evidence('launch-attempt', { at: Date.now(), bundle, pidBefore: before, module: 'entry' })
  const output = device('shell', 'aa', 'start', '-b', bundle, '-m', 'entry', '-a', 'EntryAbility'), code = /Error Code:\s*(\d+)/.exec(output)?.[1] ?? null
  result = { launched: code === null && !/failed to start ability/i.test(output), code, pid: device('shell', 'pidof', bundle).trim(), originalBundleOnly: true }
  const path = await evidence('launch-result', result); console.log(JSON.stringify({ ...result, evidence: path })); if (!result.launched) process.exitCode = 1
  return result
} else if (command === 'foreground') {
  const before = device('shell', 'pidof', bundle).trim(); assert.match(before, /^\d+$/)
  await evidence('foreground-attempt', { at: Date.now(), bundle, pid: before, existingProcessOnly: true })
  const output = device('shell', 'aa', 'start', '-b', bundle, '-m', 'entry', '-a', 'EntryAbility'); assert.doesNotMatch(output, /Error Code:|failed to start ability/i)
  assert.equal(device('shell', 'pidof', bundle).trim(), before); result = { existingProcessForegrounded: true, pid: before, installed: false, grantCreated: false }
} else if (command === 'layout') { const view = await layout(); result = { observedAt: Date.now(), path: view.path, nodes: view.safe.filter(node => node.text || node.id || node.hint) } }
else if (command === 'tap') {
  const allowed = ['product_identity_existing', 'product_restore_saved', 'product_exit', 'product_enrollment_preview', 'product_enrollment_sign'].map(key => 'text:' + strings.get(key))
  assert.ok(allowed.includes(argument)); const view = await layout(), node = select(view.nodes, argument); assert.equal(node.type, 'Button')
  if (argument === 'text:' + strings.get('product_enrollment_sign')) { const review = await json(join(root, 'enrollment-reviewed.json')), selected = await offerFile(review.offerPath), input = select(view.nodes, 'hint:' + strings.get('product_enrollment_offer')); assert.deepEqual(JSON.parse(input.text), selected.offer); await writeFile(join(root, 'native-enrollment-sign-attempt.json'), JSON.stringify({ at: Date.now(), offerSha256: hash(selected.raw), onceOnly: true }) + '\n', { flag: 'wx' }) }
  await evidence('tap-attempt', { at: Date.now(), selector: argument, onlyOwnedBundle: bundle }); device('shell', 'uitest', 'uiInput', 'click', ...point(node)); result = { clicked: argument }
} else if (command === 'input-alias') {
  const view = await layout(), node = select(view.nodes, argument); assert.equal(node.type, 'TextInput'); assert.equal(node.text ?? '', '')
  device('shell', 'uitest', 'uiInput', 'inputText', ...point(node), PLAN.identity.phoneAlias); result = { originalAliasEntered: true, identityCreated: false }
} else if (command === 'input-offer') {
  const selected = await offerFile(argument), view = await layout(), node = select(view.nodes, 'hint:' + strings.get('product_enrollment_offer')); assert.equal(node.text ?? '', '')
  const sequence = Date.now(), local = join(root, 'public-offer-' + sequence), remote = '/data/local/tmp/harmony-phase75-offer-' + sequence, xy = point(node)
  await writeFile(local + '.txt', selected.raw, { flag: 'wx' }); await writeFile(local + '.sh', '#!/system/bin/sh\nexec uitest uiInput inputText ' + xy.join(' ') + ' "$(cat ' + remote + '.txt)"\n', { flag: 'wx' })
  device('file', 'send', local + '.txt', remote + '.txt'); device('file', 'send', local + '.sh', remote + '.sh'); device('shell', 'sh', remote + '.sh')
  await writeFile(join(root, 'enrollment-reviewed.json'), JSON.stringify({ at: Date.now(), offerPath: selected.path, offerSha256: hash(selected.raw), expiresAt: selected.offer.ticket.expiresAt, pairId: PLAN.pairId }) + '\n', { flag: 'wx' }); result = { publicOfferEntered: true, signatureVerified: true, expiresAt: selected.offer.ticket.expiresAt }
} else if (command === 'compare-enrollment') {
  const review = await json(join(root, 'enrollment-reviewed.json')), selected = await offerFile(review.offerPath), view = await layout(), input = select(view.nodes, 'hint:' + strings.get('product_enrollment_offer')); assert.deepEqual(JSON.parse(input.text), selected.offer)
  for (const fingerprint of [PLAN.identity.phoneFingerprint, PLAN.identity.desktopFingerprint]) assert.ok(view.nodes.some(node => node.text === fingerprint && node.visible === 'true'))
  const boxes = view.nodes.filter(node => node.type === 'Checkbox' && node.visible === 'true').sort((a, b) => Number(point(a)[1]) - Number(point(b)[1])); assert.ok(boxes.length >= 1); if (boxes[0].checked === 'false') device('shell', 'uitest', 'uiInput', 'click', ...point(boxes[0])); else assert.equal(boxes[0].checked, 'true')
  result = { comparedFreshOffer: true, originalFingerprintsMatched: true, pairId: PLAN.pairId }
} else if (command === 'read-reply') {
  const review = await json(join(root, 'enrollment-reviewed.json')), selected = await offerFile(review.offerPath), view = await layout(), replies = []
  for (const node of view.nodes.filter(node => node.type === 'Text' && node.text?.startsWith('{'))) { try { const value = JSON.parse(node.text); if (value.schema === 'harmony-first-use-reply/1') replies.push(firstUseReplySchema.parse(value)) } catch (error) { void error } }
  assert.equal(replies.length, 1); const reply = replies[0]; assert.deepEqual(reply.offer, selected.offer); assert.deepEqual(reply.proof.challenge, selected.offer.ticket)
  assert.equal(verifyP256(selected.offer.ticket.publicSpki, enrollmentProofBytes(reply.proof.challenge), reply.proof.signature), true)
  const path = join(dirname(selected.path), 'phone-reply.json'); await writeFile(path, JSON.stringify(reply, null, 2) + '\n', { flag: 'wx' }); result = { freshPhoneProofVerified: true, path, pairId: PLAN.pairId, privateBytesExported: false }
} else if (command === 'scroll') {
  assert.ok(['up', 'down', 'small-up', 'small-down'].includes(argument)); const view = await layout(), scroll = select(view.nodes, 'id:product-page-scroll')
  const gesture = scrollGesture(scroll.bounds, argument.endsWith('up') ? 'up' : 'down', argument.startsWith('small-'), view.nodes.filter(node => node.visible === 'true' && ['TextInput', 'TextArea', 'Button', 'Checkbox'].includes(node.type)).map(node => node.bounds))
  device('shell', 'uitest', 'uiInput', 'swipe', String(gesture.x), String(gesture.startY), String(gesture.x), String(gesture.endY), '1000'); result = { scrolled: argument }
} else if (command === 'read-public') {
  assert.ok(['identity', 'saved', 'final'].includes(argument)); const view = await layout(), candidates = []
  for (const node of view.nodes.filter(node => node.text?.startsWith('{'))) { let value; try { value = JSON.parse(node.text) } catch (error) { void error; continue }; if (argument === 'identity' && value.identityAlias === PLAN.identity.phoneAlias && value.publicSpki) candidates.push({ raw: node.text, value }); if (argument !== 'identity' && value.schema === 'harmony-product-public-trust/2') candidates.push({ raw: node.text, value }) }
  assert.equal(candidates.length, 1); const selected = candidates[0]
  if (argument === 'identity') reviewPhoneIdentity(selected.value)
  else if (argument === 'saved') { assert.equal(selected.value.revoked, false); assert.equal(selected.value.record.paired.grant.epoch, PLAN.epochs.phoneGrant); assert.equal(selected.value.revokedEpoch, PLAN.epochs.phoneRevokedFloor) } else { const exchange = await json(join(root, 'exchange.json')), final = await json(join(exchange.exchange, 'phone-pair.json')), anchor = await json(join(root, 'phone-previous-v2.json')); assert.equal(canonicalPublicTrust(selected.value), canonicalPublicTrust(final)); await verifyPublicTrustHistory(selected.value, anchor) }
  const path = join(root, 'native-' + argument + '-' + Date.now() + '.json'); await writeFile(path, selected.raw, { flag: 'wx' })
  result = { observedAt: Date.now(), kind: argument, path, sha256: hash(selected.raw), publicOnly: true, ...(argument === 'identity' ? { fingerprint: selected.value.credentialId } : { grantEpoch: selected.value.record.paired.grant.epoch, revokedEpoch: selected.value.revokedEpoch, history: selected.value.history.length }) }
} else throw new Error('closed native preflight command required')
const path = await evidence('device-' + command, result); console.log(JSON.stringify({ ...result, evidence: path }))

return result;
}
