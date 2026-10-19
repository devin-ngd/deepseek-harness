/** Pure expiry admission checks; no system time, native resource or model request is changed. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { MOBILE_LINK_PROTOCOL, CommandExpiryError, parseCommand } from '../.build/link-protocol.js'
import { createLinkLab } from './helpers/link-lab.mjs'

const epoch = 1791797000000
const command = expiresAt => JSON.stringify({ protocol: MOBILE_LINK_PROTOCOL, desktopId: 'd', deviceId: 'p',
  grantEpoch: 1, commandId: 'expiry-test', expiresAt, operation: 'session.sync', payload: { sessionId: 's', afterSeq: -1 } })
const config = clock => ({ clock, maxPacketBytes: 4096, maxCommandTtlMs: 60000, maxCachedCommands: 4, maxMountedBlocks: 1 })
const rejected = (expiresAt, checkedAt, reason) => error => {
  assert.ok(error instanceof CommandExpiryError)
  assert.equal(error.code, 'request-expired')
  assert.deepEqual(error.timing, { expiresAt, checkedAt, reason, maxCommandTtlMs: 60000 })
  return true
}

test('positive remaining milliseconds including the exact configured future limit admit', () => {
  for (const remaining of [1, 59999, 60000]) assert.equal(parseCommand(command(epoch + remaining), config(() => epoch)).expiresAt, epoch + remaining)
})

test('deadline equality and one millisecond late refuse with the unchanged wire code', () => {
  for (const expiresAt of [epoch, epoch - 1]) assert.throws(() => parseCommand(command(expiresAt), config(() => epoch)), rejected(expiresAt, epoch, 'elapsed'))
})

test('one millisecond beyond the future limit refuses without raising TTL', () => {
  assert.throws(() => parseCommand(command(epoch + 60001), config(() => epoch)), rejected(epoch + 60001, epoch, 'future-limit'))
})

test('admission samples the clock once even if a subsequent observation would jump backwards', () => {
  let reads = 0
  assert.equal(parseCommand(command(epoch + 60000), config(() => ++reads === 1 ? epoch : epoch - 1)).expiresAt, epoch + 60000)
  assert.equal(reads, 1)
})

test('a client clock ahead at the TTL ceiling reproduces future-limit; negative skew can expire a request', () => {
  assert.throws(() => parseCommand(command(epoch + 1 + 60000), config(() => epoch)), rejected(epoch + 60001, epoch, 'future-limit'))
  assert.equal(parseCommand(command(epoch - 1 + 60000), config(() => epoch)).expiresAt, epoch + 59999)
  assert.throws(() => parseCommand(command(epoch - 60001 + 60000), config(() => epoch)), rejected(epoch - 1, epoch, 'elapsed'))
})

test('seconds and microseconds never silently replace epoch milliseconds', () => {
  assert.throws(() => parseCommand(command(Math.floor(epoch / 1000) + 60), config(() => epoch)), rejected(Math.floor(epoch / 1000) + 60, epoch, 'elapsed'))
  assert.throws(() => parseCommand(command((epoch + 60000) * 1000), config(() => epoch)), rejected((epoch + 60000) * 1000, epoch, 'future-limit'))
})

test('recorded API26 native reads reject the future-limit excess while retaining the sixty-second cap', () => {
  const recorded = [
    { generatedAt: 1791801415446, sentAt: 1791801415451, receivedAt: 1791801415040, checkedAt: 1791801415042, expiresAt: 1791801475446, excessMs: 404 },
    { generatedAt: 1791801417107, sentAt: 1791801417112, receivedAt: 1791801416730, checkedAt: 1791801416732, expiresAt: 1791801477107, excessMs: 375 },
    { generatedAt: 1791801422490, sentAt: 1791801422542, receivedAt: 1791801422129, checkedAt: 1791801422132, expiresAt: 1791801482490, excessMs: 358 },
  ]
  for (const row of recorded) {
    assert.equal(row.expiresAt - row.generatedAt, 60000)
    assert.ok(row.sentAt >= row.generatedAt)
    assert.ok(row.receivedAt < row.sentAt)
    assert.equal(row.expiresAt - row.checkedAt, 60000 + row.excessMs)
    assert.throws(() => parseCommand(command(row.expiresAt), config(() => row.checkedAt)), rejected(row.expiresAt, row.checkedAt, 'future-limit'))
  }
})

test('an old mutation command remains rejected after a fresh read is admitted', async () => {
  const lab = createLinkLab()
  try {
    const old = lab.phone.command('session.cancel', { sessionId: lab.sid })
    lab.elapse(501)
    await assert.rejects(lab.adapter.handle(JSON.stringify(old)), error => error.code === 'request-expired' && error.timing.reason === 'elapsed')
    await lab.phone.request('session.sync', { sessionId: lab.sid, afterSeq: -1 })
    await assert.rejects(lab.adapter.handle(JSON.stringify(old)), error => error.code === 'request-expired')
    assert.equal(lab.host.cancelCalls, 0)
    assert.equal(lab.host.promptCalls, 0)
  } finally { await lab.close() }
})
