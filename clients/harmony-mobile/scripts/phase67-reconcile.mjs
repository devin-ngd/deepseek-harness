/** Read only the interrupted fixed-world exchange, owned credential metadata and exact signed artifact; no proof, grant or device operation is replayed. */
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const marker = await json('.build/phase54-active.json'), runtime = await json('.build/phase66-active-v2.json'), root = (await json('source.json')).dshRoot
const require = createRequire(join(root, 'package.json')), yaml = require('js-yaml')
const credentials = yaml.load(await readFile(join(marker.home, '.field-credentials.yaml'), 'utf8')), identities = [], grants = []
function visit(value) {
  if (value === null || typeof value !== 'object') return
  assert.equal('privatePkcs8' in value, false)
  if (value.kind === 'grant') {
    const payload = value.payload
    if (payload?.format === 'harmony-desktop-identity/2') { assert.equal(payload.protection, 'windows-dpapi-current-user/1'); identities.push({ fingerprint: 'p256-sha256-' + hash(Buffer.from(payload.publicSpki, 'base64url')), protectedBytesPresent: typeof payload.protectedPkcs8 === 'string' }) }
    else grants.push({ protocol: payload?.protocol, deviceId: payload?.deviceId, epoch: payload?.epoch, expiresAt: payload?.expiresAt, revoked: payload?.revoked, sessions: payload?.sessions, operations: payload?.operations })
  }
  for (const child of Object.values(value)) visit(child)
}
visit(credentials)
assert.equal(identities.length, 1); assert.equal(identities[0].fingerprint, 'p256-sha256-ee92b90cd922b7049b680933191c74a050ad450493098ad3c43e9180bc2746dc')
const exchange = join(marker.world, 'fixed-world/exchange/run-iYePKR')
const candidates = ['.build/phase66-enrollment-reviewed.json', join(marker.world, 'phone-sign-attempt-phase66.json'), 'evidence/phase66-field-exit.json', join(exchange, 'phone-reply.json'), join(exchange, 'grant-lifetime.json'), join(exchange, 'desktop-cleanup.json')]
const records = []
for (const path of candidates) { try { const bytes = await readFile(path); const value = JSON.parse(bytes.toString('utf8')); records.push({ path, present: true, bytes: bytes.length, sha256: hash(bytes), summary: path.endsWith('phone-reply.json') ? { schema: value.schema, ticketExpiresAt: value.offer?.ticket?.expiresAt } : value }) } catch (error) { if (error.code !== 'ENOENT') throw error; records.push({ path, present: false }) } }
const oldProof = await readFile(join(marker.home, 'phone-reply.json')); assert.equal(hash(oldProof), '623b57fe517b2f7dd141ef32196448757a54143fb6cfa3841fe8d04672469e23')
const signed = await json('evidence/phase65-signed-build.json'); assert.equal(hash(await readFile(signed.artifact.path)), signed.artifact.sha256)
const report = { at: new Date().toISOString(), identities, grants, activeGrantCount: grants.filter(value => value.revoked === false && value.expiresAt > Date.now()).length, records, exchangeFiles: await readdir(exchange), oldProofPreserved: true, signedArtifactUnchanged: true, runtimeApp: runtime.app, originalSession: runtime.originalSingleSession, privateBytesProjected: false, mutations: 0 }
await writeFile('evidence/phase67-reconcile-' + report.at.replaceAll(':', '-').replaceAll('.', '-') + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
await writeFile('.build/phase67-reconcile-current.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
