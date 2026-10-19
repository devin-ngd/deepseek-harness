/** Compare candidate and sealed parser outputs on one expired public recording under an explicit offline clock; no device or signing occurs. */
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { NativeProductFacade as Previous } from '../.build/phase56-sealed-core-probe.mjs'
import { NativeProductFacade as Candidate } from '../.build/phase57-util-core-probe.mjs'
const marker = JSON.parse(await readFile('.build/phase54-active.json', 'utf8')), config = JSON.parse(await readFile('product.config.json', 'utf8')), raw = await readFile(marker.world + '/fixed-world/exchange/run-jLlCJ6/desktop-offer.json', 'utf8'), offer = JSON.parse(raw), clock = offer.ticket.expiresAt - 1
const construct = Type => new Type({}, JSON.stringify(config.core), { storage: {}, scheduler: {}, clock: () => clock }, () => {}), previous = construct(Previous), candidate = construct(Candidate), clone = () => JSON.parse(raw)
const unknown = clone(); unknown.unrecognized = true
const session = clone(); session.sessions = ['other-session']
const operations = clone(); operations.operations.reverse()
const expiry = clone(); expiry.ticket.expiresAt = clock
const ttl = clone(); ttl.grantTtlMs = 1800001
const profile = clone(); profile.ticket.profileId = 'other-profile'
const cases = [['valid', raw, true], ['invalid-json', '{', false], ['missing-fields', '{}', false], ['unknown-field', JSON.stringify(unknown), false], ['other-session', JSON.stringify(session), false], ['operations-order', JSON.stringify(operations), false], ['expired', JSON.stringify(expiry), false], ['grant-too-long', JSON.stringify(ttl), false], ['other-profile', JSON.stringify(profile), false]], records = [], info = console.info
function attempt(core, raw) { try { return { accepted: true, output: core.firstUseInput(raw, clock) } } catch (error) { return { accepted: false, category: error.name } } }
console.info = () => {}
try { for (const [name, input, accepted] of cases) { const left = attempt(previous, input), right = attempt(candidate, input); assert.deepEqual(right, left, name); assert.equal(right.accepted, accepted, name); records.push({ name, accepted, parity: true, ...(accepted ? { canonicalResultSha256: createHash('sha256').update(right.output).digest('hex') } : { category: right.category }) }) } } finally { console.info = info }
const report = { at: new Date().toISOString(), cases: records, passed: records.length, nativeExecution: false, offlineClock: 'one millisecond before recorded expiry; no native validity extension', modelCalls: 0, deviceOperations: 0, canonicalOutputAndRejectionsUnchanged: true }
await writeFile('evidence/phase57-util-parity.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ cases: report.passed, canonicalOutputAndRejectionsUnchanged: true, nativeExecution: false }))
