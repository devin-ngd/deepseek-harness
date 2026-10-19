/** Platform wire compatibility regression; no live relay, identity, device, model or user Session. */
import { expect, it } from 'vitest'
import { once } from 'node:events'
import WebSocket from 'ws'
import { createStandaloneRelay } from '../standalone-relay/src/host.ts'
import { audience, fixtureSource, hostConfig, pairId } from './phase39-fixture.ts'
import { RELAY_CONTROL_PATH, RELAY_CONTROL_SUBPROTOCOL } from '../src/relay-control-protocol.ts'
import { resolveRelayConfig } from '../standalone-relay/src/config.ts'
import { relayTokenDigest } from './relay-core.ts'
import { id } from '../src/protocol.ts'
import { MobileProduct } from '../src/mobile-product.ts'
import { ProductTrustOwner } from '../src/product-trust.ts'
import { FixtureClock, desktopKey, phoneKey } from './phase39-fixture.ts'
import { p256CredentialId } from './p256-public.ts'
import { readFile } from 'node:fs/promises'
const productConfig = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8'))
const publicRecord = { schema: 'harmony-product-public-trust/1', revoked: false, identityAlias: 'phase68-existing-phone', desktopPublicSpki: desktopKey.publicSpki, paired: { pairId, epoch: 1, audience, credentialId: p256CredentialId(phoneKey.publicSpki), desktopCredentialId: p256CredentialId(desktopKey.publicSpki), expiresAt: 10000, grant: { protocol: 'dsh-mobile-device-auth/1', desktopId: 'phase68-desktop', profileId: 'phase68-profile', deviceId: 'phase68-phone', credentialId: p256CredentialId(phoneKey.publicSpki), epoch: 1, expiresAt: 10000, revoked: false, sessions: ['phase68-session'], operations: ['session.sync', 'task.receipt'] } } }
async function drain() { for (let n = 0; n < 24; n++) await Promise.resolve() }

it('the existing Origin prohibition rejects NetworkKit before broker proof while the originless same-pair control upgrades', async () => {
  const relay = createStandaloneRelay(hostConfig, {}, () => 1000, () => {}, fixtureSource())
  if (relay === undefined) throw new Error('synthetic relay required')
  await relay.start()
  const sockets: WebSocket[] = []
  const open = (role: 'phone' | 'desktop', origin?: string) => { const socket = new WebSocket('ws://127.0.0.1:' + relay.port() + RELAY_CONTROL_PATH, RELAY_CONTROL_SUBPROTOCOL, { headers: { Host: audience, 'X-DSH-Relay-Pair': pairId, 'X-DSH-Relay-Role': role, ...(origin === undefined ? {} : { Origin: origin }) } }); socket.on('error', () => {}); sockets.push(socket); return socket }
  try {
    const native = open('phone', 'https://' + audience)
    const status = await new Promise<number | undefined>(resolve => native.once('unexpected-response', (_request, response) => { response.resume(); response.once('end', () => { native.terminate(); resolve(response.statusCode) }) }))
    expect(status).toBe(403)
    const originless = open('phone')
    await once(originless, 'open')
    expect(originless.readyState).toBe(WebSocket.OPEN)
  } finally { for (const socket of sockets) socket.terminate(); await relay.close() }
})

it.each(['foreign', 'http', 'port', 'null', 'browser-metadata', 'browser-site', 'duplicate-origin', 'desktop-role', 'cookie', 'wrong-pair', 'no-native-headers', 'query'])('NetworkKit compatibility still denies %s before broker proof', async (kind: string) => {
  const relay = createStandaloneRelay({ ...hostConfig, nativeOrigin: 'networkkit-v1' }, {}, () => 1000, () => {}, fixtureSource())
  if (relay === undefined) throw new Error('synthetic relay required')
  await relay.start()
  const origin = kind === 'foreign' ? 'https://foreign.example' : kind === 'http' ? 'http://' + audience : kind === 'port' ? 'https://' + audience + ':443' : kind === 'null' ? 'null' : 'https://' + audience
  const headers = { Host: audience, Origin: origin, ...(kind === 'no-native-headers' ? {} : { 'X-DSH-Relay-Pair': kind === 'wrong-pair' ? 'unknown-pair' : pairId, 'X-DSH-Relay-Role': kind === 'desktop-role' ? 'desktop' : 'phone' }), ...(kind === 'browser-metadata' ? { 'Sec-Fetch-Mode': 'websocket' } : {}), ...(kind === 'browser-site' ? { 'Sec-Fetch-Site': 'same-origin' } : {}), ...(kind === 'duplicate-origin' ? { Origin: [origin, origin] } : {}), ...(kind === 'cookie' ? { Cookie: 'fixture=1' } : {}) }
  const socket = new WebSocket('ws://127.0.0.1:' + relay.port() + RELAY_CONTROL_PATH + (kind === 'query' ? '?x=1' : ''), RELAY_CONTROL_SUBPROTOCOL, { headers })
  socket.on('error', () => {})
  try { const status = await new Promise<number | undefined>(resolve => socket.once('unexpected-response', (_request, response) => { response.resume(); response.once('end', () => resolve(response.statusCode)) })); expect(status).toBe(403) }
  finally { socket.terminate(); await relay.close() }
})

it('explicit NetworkKit phone control upgrades without granting a room or application access', async () => {
  const relay = createStandaloneRelay({ ...hostConfig, nativeOrigin: 'networkkit-v1' }, {}, () => 1000, () => {}, fixtureSource())
  if (relay === undefined) throw new Error('synthetic relay required')
  await relay.start()
  const socket = new WebSocket('ws://127.0.0.1:' + relay.port() + RELAY_CONTROL_PATH, RELAY_CONTROL_SUBPROTOCOL, { headers: { Host: audience, Origin: 'https://' + audience, 'X-DSH-Relay-Pair': pairId, 'X-DSH-Relay-Role': 'phone' } })
  socket.on('error', () => {})
  try { await once(socket, 'open'); expect(socket.readyState).toBe(WebSocket.OPEN) } finally { socket.terminate(); await relay.close() }
})

it.each([false, true])('NetworkKit data origin cannot replace the exact room capability (valid token: %s)', async (valid: boolean) => {
  const authority = {}, relay = createStandaloneRelay({ ...hostConfig, nativeOrigin: 'networkkit-v1' }, authority, () => 1000, () => {}, fixtureSource())
  if (relay === undefined) throw new Error('synthetic relay required')
  await relay.start()
  const room = id<'harmony-relay-room'>('phase68-fixed-room'), token = '1'.repeat(64)
  relay.provision(authority, { room, phoneDigest: relayTokenDigest(token), desktopDigest: relayTokenDigest('2'.repeat(64)), expiresAt: 1500 })
  const socket = new WebSocket('ws://127.0.0.1:' + relay.port() + '/harmony/relay/v1', 'dsh-relay-v1', { headers: { Host: audience, Origin: 'https://' + audience, 'X-DSH-Relay-Room': room, 'X-DSH-Relay-Role': 'phone', Authorization: 'Bearer ' + (valid ? token : '3'.repeat(64)) } })
  socket.on('error', () => {})
  try { if (valid) { await once(socket, 'open'); expect(socket.readyState).toBe(WebSocket.OPEN) } else { const status = await new Promise<number | undefined>(resolve => socket.once('unexpected-response', (_request, response) => { response.resume(); response.once('end', () => resolve(response.statusCode)) })); expect(status).toBe(403) } }
  finally { socket.terminate(); await relay.close() }
})

it('the compatibility mode is closed and absent configuration retains Origin denial', () => {
  expect(resolveRelayConfig(hostConfig)).toMatchObject({ nativeOrigin: 'deny' })
  for (const value of ['allow', true, null, undefined]) expect(() => resolveRelayConfig({ ...hostConfig, nativeOrigin: value })).toThrow('invalid relay configuration')
})

it('finite failed connection attempts expose a stopped state without a second activation or any task replay', async () => {
  const authority = {}, clock = new FixtureClock(); let opens = 0, writes = 0, closed = 0
  const product = new MobileProduct(authority, { ...productConfig.core, enabled: true, transport: { ...productConfig.core.transport, recovery: { maxAttempts: 2, retryDelayMs: 10 } } }, { clock: () => clock.now, scheduler: clock, storage: { read: async () => JSON.stringify(publicRecord), write: async () => { writes++ }, close: async () => { closed++ } }, verifyTrust: async () => {}, connect: async () => { opens++; throw new Error('synthetic denied upgrade') } }, () => {})
  try {
    await product.boot(); await product.connect(authority); await drain(); clock.advance(10); await drain()
    expect(product.view).toMatchObject({ pairing: 'paired', connection: 'blocked', error: 'connection-stopped', selected: '', transcript: null })
    await expect(product.connect(authority)).rejects.toThrow('denied'); expect(opens).toBe(2); expect(writes).toBe(0)
    const resources = JSON.parse(await readFile(new URL('../harmony/entry/src/main/resources/base/element/string.json', import.meta.url), 'utf8')), expected: unknown = JSON.parse(await readFile(new URL('../tests/fixtures/phase68-connection-stopped.expected.json', import.meta.url), 'utf8'))
    expect({ pairing: product.view.pairing, connection: product.view.connection, error: product.view.error, notice: resources.string.find((row: { name: string; value: string }) => row.name === 'product_connection_stopped').value, attempts: opens, publicWrites: writes, selectedSession: product.view.selected }).toEqual(expected)
  } finally { await product.close() }
  expect(clock.pending.size).toBe(0); expect(closed).toBe(1)
})

it('expiry preserves the original public record and cannot turn a new candidate into an implicit replacement', async () => {
  const authority = {}, original = JSON.stringify(publicRecord); let saved = original, writes = 0
  const storage = { read: async () => saved, write: async (raw: string) => { writes++; saved = raw }, close: async () => {} }
  const trust = new ProductTrustOwner(authority, storage, 32768, () => 10001)
  await expect(trust.load()).rejects.toThrow('blocked')
  const successor = { ...publicRecord, paired: { ...publicRecord.paired, expiresAt: 20000, grant: { ...publicRecord.paired.grant, epoch: 3, expiresAt: 20000 } } }
  await expect(trust.confirm(authority, JSON.stringify(successor), true)).rejects.toThrow('denied'); await trust.close()
  expect(saved).toBe(original); expect(writes).toBe(0)
})

it('a local revocation tombstone survives reopen and exact saved input cannot reactivate it', async () => {
  const authority = {}; let saved = JSON.stringify(publicRecord), writes = 0
  const storage = () => ({ read: async () => saved, write: async (raw: string) => { writes++; saved = raw }, close: async () => {} })
  const first = new ProductTrustOwner(authority, storage(), 32768, () => 1000); await first.load(); await first.revoke(authority); await first.close()
  const second = new ProductTrustOwner(authority, storage(), 32768, () => 1000); expect(await second.load()).toMatchObject({ revoked: true }); await expect(second.confirm(authority, JSON.stringify(publicRecord), true)).rejects.toThrow('denied'); await second.close()
  expect(JSON.parse(saved).revoked).toBe(true); expect(writes).toBe(1)
})
