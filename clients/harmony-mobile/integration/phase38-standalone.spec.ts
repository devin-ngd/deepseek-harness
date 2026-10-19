/** Synthetic loopback HTTP/WS integration only. No server deployment, live keys, Session, DSH dispatch, certificate or model is selected. */
import { expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { get } from 'node:http'
import { createStandaloneRelay } from '../standalone-relay/src/host.ts'
import { resolveRelayConfig } from '../standalone-relay/src/config.ts'
import { relayTokenDigest, RelayRooms } from './relay-core.ts'
import { RELAY_PATH, RELAY_SUBPROTOCOL } from './relay-protocol.ts'
import { RelayUpgrade } from './relay-upgrade.ts'
import { id } from '../src/protocol.ts'
const config = { enabled: true, host: '127.0.0.1', port: 0, publicHost: 'dsh.devinho.me', sweepIntervalMs: 1000, maxControlFrames: 4, maxConnections: 8, shutdownTimeoutMs: 3000, requestTimeoutMs: 1000, headersTimeoutMs: 500, connectionCheckIntervalMs: 100, maxHeaderBytes: 4096, maxRooms: 2, maxRoomTtlMs: 1000, pairTimeoutMs: 100, maxFrameBytes: 8192, maxBufferedBytes: 16384, maxFrames: 32, idleTimeoutMs: 200 }
const room = id<'harmony-relay-room'>('phase38-fixture-room'), desktop = '1'.repeat(64), phone = '2'.repeat(64)
async function fixture() { const authority = {}; let now = 1000; const owner = createStandaloneRelay(config, authority, () => now, () => {}); if (owner === undefined) throw new Error('fixture absent'); await owner.start(); return { owner, authority, port: owner.port(), advance: (ms: number) => { now += ms; owner.sweep() }, provision: () => owner.provision(authority, { room, desktopDigest: relayTokenDigest(desktop), phoneDigest: relayTokenDigest(phone), expiresAt: 1500 }) } }
function client(port: number, role: string, token: string, extra: { path?: string; headers?: Record<string, string>; protocol?: string } = {}) {
  const ws = new WebSocket('ws://127.0.0.1:' + port + (extra.path ?? RELAY_PATH), extra.protocol ?? RELAY_SUBPROTOCOL, { headers: { Host: config.publicHost, Authorization: 'Bearer ' + token, 'X-DSH-Relay-Room': room, 'X-DSH-Relay-Role': role, ...extra.headers }, perMessageDeflate: false, handshakeTimeout: 2000 })
  const closed = new Promise<void>(resolve => ws.once('close', () => resolve())), opened = new Promise<boolean>((resolve, reject) => { ws.once('open', () => resolve(true)); ws.once('error', error => { if ('code' in error && ['EACCES', 'EPERM', 'ECONNREFUSED'].includes(String(error.code))) reject(new Error('local test transport unavailable')); else resolve(false) }) }), messages: { bytes: Buffer; binary: boolean }[] = []
  ws.on('error', () => {}); ws.on('message', (bytes: Buffer, binary: boolean) => messages.push({ bytes: Buffer.from(bytes), binary })); return { ws, opened, closed, messages }
}
async function messageCount(peer: ReturnType<typeof client>, count: number) { for (let i = 0; i < 60 && peer.messages.length < count; i++) await new Promise<void>(resolve => setImmediate(resolve)); expect(peer.messages).toHaveLength(count) }
it('independent host defaults to disabled and validates every listener/resource field before allocating a timer', () => {
  const timers = vi.spyOn(globalThis, 'setInterval')
  try { expect(createStandaloneRelay()).toBeUndefined(); expect(timers).not.toHaveBeenCalled(); for (const value of [{}, { enabled: false, token: 'not-accepted' }, { ...config, host: '0.0.0.0' }, { ...config, port: 65536 }, { ...config, maxConnections: 0 }, { ...config, maxBufferedBytes: 1 }, { ...config, maxFrameBytes: 0x80000000, maxBufferedBytes: 0x80000000 }, { ...config, sweepIntervalMs: 0x80000000 }, { ...config, shutdownTimeoutMs: 0x80000000 }, { ...config, room }, { ...config, privateKey: 'not-accepted' }]) expect(() => resolveRelayConfig(value)).toThrow('invalid relay configuration') }
  finally { timers.mockRestore() }
})
it('empty room core and actual loopback upgrade both deny syntactically valid capabilities without a WS acceptance', async () => {
  const rooms = new RelayRooms({}, { maxRooms: config.maxRooms, maxRoomTtlMs: config.maxRoomTtlMs, pairTimeoutMs: config.pairTimeoutMs, maxFrameBytes: config.maxFrameBytes, maxBufferedBytes: config.maxBufferedBytes, maxFrames: config.maxFrames, idleTimeoutMs: config.idleTimeoutMs }, () => 1000)
  for (const role of ['desktop', 'phone']) expect(() => rooms.claim(room, role, desktop)).toThrow('denied'); rooms.close()
  const f = await fixture()
  try { for (const role of ['desktop', 'phone']) { const peer = client(f.port, role, role === 'phone' ? phone : desktop); expect(await peer.opened).toBe(false); await peer.closed; expect(peer.messages).toHaveLength(0) } }
  finally { await f.owner.close() }
})
it('shared adapter rejects a payload limit that ws would truncate to a negative signed integer', () => {
  const rooms = new RelayRooms({}, { maxRooms: config.maxRooms, maxRoomTtlMs: config.maxRoomTtlMs, pairTimeoutMs: config.pairTimeoutMs, maxFrameBytes: config.maxFrameBytes, maxBufferedBytes: config.maxBufferedBytes, maxFrames: config.maxFrames, idleTimeoutMs: config.idleTimeoutMs }, () => 1000)
  try { expect(() => new RelayUpgrade(rooms, { publicHost: config.publicHost, maxFrameBytes: 0x80000000, maxControlFrames: 1, nativeOrigin: 'deny' }, () => {})).toThrow('invalid relay policy') }
  finally { rooms.close() }
})
it.each(['query', 'host', 'cookie', 'origin', 'protocol', 'role', 'token', 'noBearer'] as const)('shared upgrade rejects %s even for a locally provisioned room', async (kind: string) => {
  const f = await fixture(); f.provision()
  try { const extra = kind === 'query' ? { path: RELAY_PATH + '?token=fixture' } : kind === 'protocol' ? { protocol: 'other' } : { headers: kind === 'host' ? { Host: 'other.example' } : kind === 'cookie' ? { Cookie: 'fixture=1' } : kind === 'origin' ? { Origin: 'https://fixture.example' } : kind === 'noBearer' ? { Authorization: 'Basic fixture' } : {} }
    const peer = client(f.port, kind === 'role' ? 'operator' : 'desktop', kind === 'token' ? phone : desktop, extra); expect(await peer.opened).toBe(false); await peer.closed; expect(peer.messages).toHaveLength(0)
  } finally { await f.owner.close() }
})
it('one-use routing forwards opaque binary bytes without parsing or buffering history and closes both peers on disconnect', async () => {
  const f = await fixture(); f.provision()
  try {
    const a = client(f.port, 'desktop', desktop); expect(await a.opened).toBe(true); expect(a.messages).toHaveLength(0)
    const b = client(f.port, 'phone', phone); expect(await b.opened).toBe(true); await messageCount(a, 1); await messageCount(b, 1)
    expect(a.messages[0]).toEqual({ bytes: Buffer.from('{"relay":"ready","v":1}'), binary: false })
    const opaque = Buffer.from([0, 1, 255, 128, 0, 7]); a.ws.send(opaque); await messageCount(b, 2); expect(b.messages[1]).toEqual({ bytes: opaque, binary: true })
    const duplicate = client(f.port, 'desktop', desktop); expect(await duplicate.opened).toBe(false); await duplicate.closed
    a.ws.terminate(); await Promise.all([a.closed, b.closed]); const replay = client(f.port, 'phone', phone); expect(await replay.opened).toBe(false); await replay.closed
  } finally { await f.owner.close() }
})
it.each(['expiry', 'revoke', 'text', 'control'] as const)('independent host %s stops both endpoints and subsequent joins', async (kind: string) => {
  const f = await fixture(); f.provision()
  try { const a = client(f.port, 'desktop', desktop); expect(await a.opened).toBe(true); const b = client(f.port, 'phone', phone); expect(await b.opened).toBe(true); await messageCount(a, 1); await messageCount(b, 1)
    if (kind === 'expiry') f.advance(500); else if (kind === 'revoke') f.owner.revoke(f.authority, room); else if (kind === 'text') a.ws.send('synthetic plaintext'); else for (let i = 0; i < 5; i++) a.ws.ping()
    await Promise.all([a.closed, b.closed]); const late = client(f.port, 'desktop', desktop); expect(await late.opened).toBe(false); await late.closed
  } finally { await f.owner.close() }
})
it('HTTP exposes no provisioning/admin route and terminal close waits for connected and pending sockets', async () => {
  const f = await fixture()
  try { for (const path of ['/rooms', '/grant', '/health', RELAY_PATH]) { const status = await new Promise<number>((resolve, reject) => { get({ host: '127.0.0.1', port: f.port, path }, response => { response.resume(); resolve(response.statusCode ?? 0) }).once('error', reject) }); expect(status).toBe(404) }
    f.provision(); const a = client(f.port, 'desktop', desktop); expect(await a.opened).toBe(true)
    const first = f.owner.close(); expect(f.owner.close()).toBe(first); await first; await a.closed; expect(() => f.owner.port()).toThrow('unavailable'); await expect(f.owner.start()).rejects.toThrow('denied')
  } finally { await f.owner.close() }
})
it('close during listener startup cannot leave a late listener or create a room', async () => {
  const authority = {}, owner = createStandaloneRelay(config, authority, () => 1000, () => {}); if (owner === undefined) throw new Error('fixture absent')
  const starting = owner.start(), rejected = expect(starting).rejects.toThrow(), closing = owner.close(); await rejected; await closing; expect(() => owner.port()).toThrow(); expect(() => owner.provision(authority, { room, desktopDigest: relayTokenDigest(desktop), phoneDigest: relayTokenDigest(phone), expiresAt: 1500 })).toThrow('denied')
})
