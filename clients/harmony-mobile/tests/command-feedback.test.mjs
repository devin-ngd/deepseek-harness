/** Offline browser-factory checks: no user Session, identity, credential, network, or model. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
const root = 'D:/workspace/agents/deepseek-harness'
const { Context } = await import(pathToFileURL(root + '/vendor/cordis/lib/index.js'))
const require = createRequire(root + '/package.json')
const reactRequire = createRequire(root + '/packages/client/ui-conversation/package.json')
let registration
runInNewContext(await readFile(process.env.DSH_HARMONY_FEEDBACK_FACTORY, 'utf8'), { window: { __ModuleLoader__: { load: value => { registration = value } } }, TextEncoder, TextDecoder, AbortController, URL, console })
assert.equal(registration.id, '@deepseek-ai/dsh-experimental-harmony-mobile')
const Feedback = registration.factory(name => { if (name === 'zod') return require(name); if (name === 'react' || name === 'react/jsx-runtime') return reactRequire(name); throw new Error('Unexpected browser runtime import: ' + name) })
const rawStatus = id => JSON.stringify({ profileId: 'desktop', sessionId: id, state: 'not-started', steps: [] })
async function fixture(ids = ['home-empty', 'existing-session']) {
  const ctx = new Context(), notices = [], scopes = new Map(), dictionaries = new Map()
  let removed = 0
  const conversation = { input: { for: actx => ({ notify: (level, text) => notices.push({ id: actx.id, level, text }) }) } }
  for (const id of ids) scopes.set(id, { id, get: name => name === 'conversation' ? conversation : undefined })
  ctx.reflect.provide('sessions', { scope: id => scopes.get(id) })
  ctx.reflect.provide('commandUi', {})
  ctx.reflect.provide('slots', { inject: () => () => {} })
  ctx.reflect.provide('remote', {})
  ctx.reflect.provide('remote.commands', {})
  ctx.reflect.provide('locale', { register: (name, value) => { dictionaries.set(name, value); return () => { dictionaries.delete(name); removed++ } }, bind: name => key => dictionaries.get(name).zh[key] })
  const plugin = ctx.plugin(Feedback); await plugin
  const emit = (id, result, name = 'harmony-pair') => ctx.emit('command/executed', id, name, result)
  return { ctx, notices, scopes, plugin, emit, removed: () => removed, close: () => ctx.fiber.dispose() }
}
test('blank homepage Session receives reviewed status without a prompt', async () => {
  const f = await fixture()
  try { f.emit('home-empty', { kind: 'success', text: rawStatus('home-empty') }); assert.equal(f.notices.length, 1); assert.equal(f.notices[0].level, 'info'); assert.deepEqual(JSON.parse(f.notices[0].text), { profileId: 'desktop', sessionId: 'home-empty', state: 'not-started' }) } finally { await f.close() }
})
test('existing Session keeps the result in its original scope', async () => {
  const f = await fixture()
  try { f.emit('existing-session', { kind: 'success', text: rawStatus('existing-session') }); assert.equal(f.notices[0].id, 'existing-session'); assert.equal(f.notices.some(note => note.id === 'home-empty'), false) } finally { await f.close() }
})
test('missing or ended Session has no fallback into another window', async () => {
  const f = await fixture()
  try { f.emit('missing', { kind: 'success', text: rawStatus('missing') }); f.scopes.delete('home-empty'); f.emit('home-empty', { kind: 'error', text: 'private-token-secret' }); assert.deepEqual(f.notices, []) } finally { await f.close() }
})
test('errors show safe localized feedback instead of raw exception text', async () => {
  const f = await fixture()
  try { f.emit('home-empty', { kind: 'error', text: 'token=private-token-secret' }); assert.equal(f.notices[0].level, 'error'); assert.match(f.notices[0].text, /Harmony/); assert.equal(f.notices[0].text.includes('private-token-secret'), false) } finally { await f.close() }
})
test('unknown fields, oversized output and cross-Session records never echo', async () => {
  const f = await fixture()
  try {
    for (const text of [JSON.stringify({ ...JSON.parse(rawStatus('home-empty')), privateKey: 'private-token-secret' }), rawStatus('other-private-session'), 'private-token-secret'.repeat(3000)]) f.emit('home-empty', { kind: 'success', text })
    assert.equal(f.notices.length, 3); for (const note of f.notices) { assert.equal(note.text.includes('private-token-secret'), false); assert.equal(note.text.includes('other-private-session'), false) }
  } finally { await f.close() }
})
test('repeated executions each surface a notice', async () => {
  const f = await fixture()
  try { for (let n = 0; n < 2; n++) f.emit('home-empty', { kind: 'success', text: rawStatus('home-empty') }); assert.equal(f.notices.length, 2) } finally { await f.close() }
})
test('unrelated commands stay untouched and unload removes feedback', async () => {
  const f = await fixture()
  try { f.emit('home-empty', { kind: 'success', text: rawStatus('home-empty') }, 'unrelated'); assert.deepEqual(f.notices, []); await f.plugin.dispose(); f.emit('home-empty', { kind: 'success', text: rawStatus('home-empty') }); assert.deepEqual(f.notices, []); assert.equal(f.removed(), 2) } finally { await f.close() }
})
test('bundle declares one passive client carrier and keeps privileged entries disabled', async () => {
  const stage = process.env.DSH_HARMONY_FEEDBACK_PACKAGE
  const manifest = JSON.parse(await readFile(stage + '/package.json', 'utf8'))
  const patches = require('js-yaml').load(await readFile(stage + '/cordis.patch.yml', 'utf8'))
  const rows = patches.flatMap(patch => patch.insert ?? [])
  const passive = rows.filter(row => row.id === 'harmony-mobile-feedback')
  assert.equal(passive.length, 1); assert.equal(passive[0].name, manifest.name); assert.equal(passive[0].disabled, false); assert.equal(passive[0].config.enabled, false)
  for (const id of ['harmony-mobile-private', 'harmony-mobile-pairing', 'harmony-mobile-link-test']) assert.equal(rows.find(row => row.id === id).disabled, true)
  assert.equal(manifest.dsh.client.platform, 'web'); assert.ok(manifest.exports['./client'])
})

const publicOffer = sessionId => ({ schema: 'harmony-first-use/1', identityAlias: 'fixture-phone', desktopPublicSpki: 'cHVibGlj', audience: 'relay.example', pairId: 'fixture-pair', ticket: { protocol: 'dsh-mobile-enrollment/1', challengeId: 'fixture-challenge', desktopId: 'fixture-desktop', profileId: 'desktop', deviceId: 'fixture-phone', credentialId: 'p256-sha256-' + 'a'.repeat(64), publicSpki: 'cHVibGlj', nonce: 'a'.repeat(43), expiresAt: 1000000 }, sessions: [sessionId], operations: ['task.submit', 'task.receipt', 'session.cancel', 'session.sync', 'rich.mount', 'rich.snapshot', 'rich.saveDraft', 'rich.invoke', 'rich.status', 'rich.dispose'], grantTtlMs: 1800000, signature: 'fixtureSignature' })
test('actual enrollment ticket fields display only in the original Session and exact ticket position', async () => {
  const f = await fixture()
  try {
    const offer = publicOffer('home-empty')
    f.emit('home-empty', { kind: 'success', text: JSON.stringify(offer) })
    assert.deepEqual(JSON.parse(f.notices[0].text), offer)
    for (const value of [ { ...offer, ticket: { ...offer.ticket, protocol: 'dsh-mobile-device-auth/1' } }, { ...offer, ticket: { ...offer.ticket, token: 'private-token-secret' } }, { ...offer, ticket: { ...offer.ticket, protocol: 'unknown' } }, { ...offer, sessions: ['existing-session'] }, { ...offer, extra: { ticket: offer.ticket } } ]) {
      f.emit('home-empty', { kind: 'success', text: JSON.stringify(value) })
      const note = f.notices.at(-1)
      assert.equal(note.text.includes('fixtureSignature'), false)
      assert.equal(note.text.includes('private-token-secret'), false)
    }
    f.emit('home-empty', { kind: 'success', text: 'Desktop pairing challenge cancelled; no grant was created.' })
    assert.deepEqual(JSON.parse(f.notices.at(-1).text), { sessionId: 'home-empty', state: 'challenge-cancelled' })
  } finally { await f.close() }
})

test('device command feedback stays in its issuing Session and rejects foreign profiles or extra secret fields', async () => {
  const f = await fixture()
  try {
    const state = { profileId: 'desktop', sessionId: 'home-empty', state: 'bound' }
    for (const terminal of ['transport-closed', 'transport-failed']) { const closed = { ...state, state: terminal }; f.emit('home-empty', { kind: 'success', text: JSON.stringify(closed) }, 'harmony-device'); assert.deepEqual(JSON.parse(f.notices.at(-1).text), closed) }
    f.emit('home-empty', { kind: 'success', text: JSON.stringify(state) }, 'harmony-device')
    assert.deepEqual(JSON.parse(f.notices.at(-1).text), state)
    for (const value of [{ ...state, sessionId: 'existing-session' }, { ...state, profileId: 'foreign' }, { ...state, token: 'private-token-secret' }]) { f.emit('home-empty', { kind: 'success', text: JSON.stringify(value) }, 'harmony-device'); assert.equal(f.notices.at(-1).text.includes('private-token-secret'), false); assert.equal(f.notices.at(-1).text.includes('existing-session'), false); assert.equal(f.notices.at(-1).text.includes('foreign'), false) }
  } finally { await f.close() }
})

test('dual-signed route feedback accepts only reviewed schema positions and its issuing Session', async () => {
  const f = await fixture()
  try {
    const binding = { schema: 'harmony-device-binding/1', bindingId: 'original-binding', desktopId: 'original-desktop', profileId: 'desktop', deviceId: 'original-phone', identityAlias: 'original-phone', desktopPublicSpki: 'cHVibGlj', phonePublicSpki: 'cHVibGljMg', desktopCredentialId: 'p256-sha256-' + 'a'.repeat(64), credentialId: 'p256-sha256-' + 'b'.repeat(64), audience: 'relay.example', scope: { kind: 'all-visible-sessions', profileId: 'desktop' }, operations: ['session.sync'], epoch: 1, createdAt: 1, revoked: false, signature: 'publicSignature' }
    const offer = { schema: 'harmony-device-route-offer/1', binding, routeId: 'independent-route', routeEpoch: 1, nonce: 'a'.repeat(43), issuedAt: 100, expiresAt: 200, signature: 'publicSignature' }
    const state = { profileId: 'desktop', sessionId: 'home-empty', state: 'route-offered', publicResult: offer }
    f.emit('home-empty', { kind: 'success', text: JSON.stringify(state) }, 'harmony-device'); assert.deepEqual(JSON.parse(f.notices.at(-1).text), state)
    const confirmed = { ...state, state: 'route-ready', publicResult: { schema: 'harmony-device-route/1', offer, signature: 'phonePublicSignature' } }
    f.emit('home-empty', { kind: 'success', text: JSON.stringify(confirmed) }, 'harmony-device'); assert.deepEqual(JSON.parse(f.notices.at(-1).text), confirmed)
    for (const value of [{ ...state, sessionId: 'existing-session' }, { ...state, publicResult: { ...offer, token: 'private-route-token' } }, { ...state, publicResult: { ...offer, binding: { ...binding, profileId: 'foreign' } } }, { ...state, publicResult: { ...offer, binding: { ...binding, privateKey: 'private-route-key' } } }]) {
      f.emit('home-empty', { kind: 'success', text: JSON.stringify(value) }, 'harmony-device')
      const text = f.notices.at(-1).text; assert.equal(text.includes('private-route-'), false); assert.equal(text.includes('independent-route'), false); assert.equal(text.includes('existing-session'), false)
    }
  } finally { await f.close() }
})
