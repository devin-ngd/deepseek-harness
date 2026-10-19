/** Pin this observed fresh exchange and original public identities before native preview or signing. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const path = 'D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/fixed-world/exchange/run-4crf2L/desktop-offer.json'
const raw = await readFile(path, 'utf8'), offer = JSON.parse(raw)
const fingerprint = value => 'p256-sha256-' + createHash('sha256').update(Buffer.from(value, 'base64url')).digest('hex')
assert.equal(offer.pairId, 'harmony-phase54-00af17be-fa25-4680-85e2-8b4c20f3b210')
assert.equal(offer.identityAlias, 'harmony-phase54-phone'); assert.equal(offer.audience, 'dsh.devinho.me')
assert.equal(fingerprint(offer.desktopPublicSpki), 'p256-sha256-ee92b90cd922b7049b680933191c74a050ad450493098ad3c43e9180bc2746dc')
assert.equal(fingerprint(offer.ticket.publicSpki), 'p256-sha256-6dbd072d7da53e682d4852d1e11cc8d4b48cc5a414283cd221b2b0c012fe9b99')
assert.deepEqual(offer.sessions, ['harmony-mobile-field-replay-session'])
assert.deepEqual(offer.operations, ['task.submit', 'task.receipt', 'session.cancel', 'session.sync', 'rich.mount', 'rich.snapshot', 'rich.saveDraft', 'rich.invoke', 'rich.status', 'rich.dispose'])
assert.equal(offer.grantTtlMs, 1800000); assert.ok(offer.ticket.expiresAt > Date.now())
const report = { at: new Date().toISOString(), offerPath: path, exchange: path.slice(0, -'/desktop-offer.json'.length), publicOfferSha256: createHash('sha256').update(raw.trim()).digest('hex'), ticketExpiresAt: offer.ticket.expiresAt, grantMaximumMs: offer.grantTtlMs, originalIdentitiesMatched: true, singleSessionMatched: true, grantCreated: false, oldProofReplayed: false, terminalSession: 94048 }
await writeFile('.build/phase67-exchange.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
await writeFile('evidence/phase67-fresh-offer.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(report))
