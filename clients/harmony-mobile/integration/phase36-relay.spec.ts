/** Memory transports and public synthetic crypto scalars only; no ws dial, server, listener, key generation, profile or model is used. */
import { expect, it, vi } from 'vitest'
import { createECDH, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { RelayRooms, relayTokenDigest, type RelaySocket } from './relay-core.ts'
import { apply, Config } from '../relay-plugin/src/index.ts'
import { validateWssPlan } from './wss-client.ts'
import { EncryptedRelayConnection } from './e2e-socket.ts'
import { ImportedP256Agreement, P256SecureChannel, nodeE2EPrimitives } from './p256-channel.ts'
import { mountExpiryCleanup, bindConnectionLifetime, type CleanupScheduler } from './connection-lifetime.ts'
import type { JsonValue } from '../src/upstream.ts'
import { id } from '../src/protocol.ts'
import { Context } from '@deepseek-ai/cordis'
const roomId = id<'harmony-relay-room'>('phase36-fixture-room'), desktopToken = '1'.repeat(64), phoneToken = '2'.repeat(64)
const limits = { maxRooms: 2, maxRoomTtlMs: 1000, pairTimeoutMs: 100, maxFrameBytes: 8192, maxBufferedBytes: 16384, maxFrames: 32, idleTimeoutMs: 200 }
class MemorySocket implements RelaySocket {
  bufferedAmount = 0
  terminated = false
  frames: Uint8Array[] = []
  readyCount = 0
  frame = new Set<(bytes: Uint8Array, binary: boolean) => void>()
  end = new Set<() => void>()
  onFrame(callback: (bytes: Uint8Array, binary: boolean) => void) { this.frame.add(callback); return () => { this.frame.delete(callback) } }
  onEnd(callback: () => void) { this.end.add(callback); return () => { this.end.delete(callback) } }
  ready() { this.readyCount++ }
  send(bytes: Uint8Array) { this.frames.push(Uint8Array.from(bytes)) }
  terminate() { if (this.terminated) return; this.terminated = true; for (const callback of this.end) callback() }
  receive(bytes: Uint8Array, binary = true) { for (const callback of this.frame) callback(bytes, binary) }
}
function fixture() {
  let now = 1000; const authority = {}, rooms = new RelayRooms(authority, limits, () => now)
  const plan = { room: roomId, desktopDigest: relayTokenDigest(desktopToken), phoneDigest: relayTokenDigest(phoneToken), expiresAt: 1500 }
  rooms.provision(authority, plan)
  return { authority, rooms, plan, advance: (value: number) => { now += value }, attach: () => { const desktop = new MemorySocket(), phone = new MemorySocket(); rooms.claim(roomId, 'desktop', desktopToken).attach(desktop); rooms.claim(roomId, 'phone', phoneToken).attach(phone); return { desktop, phone } } }
}
it('disabled relay registration reads no service and creates no timer or socket', () => {
  const ctx = new Proxy(new Context(), { get() { throw new Error('disabled Context read') } })
  const timer = vi.spyOn(globalThis, 'setInterval'); try { apply(ctx, Config({ enabled: false })); expect(timer).not.toHaveBeenCalled() } finally { timer.mockRestore() }
})
it('enabled composition registers only the upgrade route with an in-memory WebServer and fake timers', async () => {
  vi.useFakeTimers(); const ctx = new Context(), register = vi.fn((_route: { readonly path: string }) => () => {})
  try { ctx.provide('webServer', { protocol: 'http:', host: '127.0.0.1', registerUpgrade: register }); apply(ctx, Config({ enabled: true, proxyLoopback: true })); expect(register).toHaveBeenCalledOnce(); expect(register.mock.calls[0]?.[0]).toMatchObject({ path: '/harmony/relay/v1' }) }
  finally { await ctx.fiber.dispose(); vi.useRealTimers() }
})
it('routing needs two distinct one-use capabilities and announces readiness only after both attach', () => {
  const f = fixture(), desktop = new MemorySocket()
  expect(() => f.rooms.claim(roomId, 'phone', desktopToken)).toThrow('denied')
  expect(() => f.rooms.claim(roomId, 'phone', 'x')).toThrow('denied')
  f.rooms.claim(roomId, 'desktop', desktopToken).attach(desktop); expect(desktop.readyCount).toBe(0)
  expect(() => f.rooms.claim(roomId, 'desktop', desktopToken)).toThrow('denied')
  const phone = new MemorySocket(); f.rooms.claim(roomId, 'phone', phoneToken).attach(phone)
  expect([desktop.readyCount, phone.readyCount]).toEqual([1, 1]); phone.receive(Uint8Array.of(8, 9)); expect(desktop.frames).toEqual([Uint8Array.of(8, 9)]); f.rooms.close()
})
it('old attachment abort cannot revoke a successor room with the same identifier', () => {
  const f = fixture(), old = f.rooms.claim(roomId, 'desktop', desktopToken)
  f.rooms.revoke(f.authority, roomId); f.rooms.provision(f.authority, f.plan); old.abort()
  const p = f.attach(); expect(p.phone.readyCount).toBe(1); f.rooms.close()
})
it.each(['expiry', 'pair', 'idle', 'buffer', 'text', 'size', 'frames', 'disconnect'] as const)('room closes both peers on %s and cannot reuse a ticket', (reason: string) => {
  const f = fixture(), p = f.attach()
  if (reason === 'expiry') { f.advance(500); f.rooms.sweep() }
  if (reason === 'pair') { f.rooms.revoke(f.authority, roomId); f.rooms.provision(f.authority, f.plan); f.rooms.claim(roomId, 'desktop', desktopToken).attach(p.desktop); f.advance(100); f.rooms.sweep() }
  if (reason === 'idle') { f.advance(200); f.rooms.sweep() }
  if (reason === 'buffer') { p.desktop.bufferedAmount = limits.maxBufferedBytes; p.phone.receive(Uint8Array.of(3)) }
  if (reason === 'text') p.phone.receive(Uint8Array.of(3), false)
  if (reason === 'size') p.phone.receive(new Uint8Array(8193))
  if (reason === 'frames') for (let i = 0; i < 33; i++) p.phone.receive(Uint8Array.of(3))
  if (reason === 'disconnect') p.phone.terminate()
  expect(p.desktop.terminated).toBe(true); expect(p.phone.terminated).toBe(true); expect(() => f.rooms.claim(roomId, 'phone', phoneToken)).toThrow('denied'); f.rooms.close()
})
it('WSS policy rejects plaintext, audience change, credentials/query/redirect-like URLs and placeholders before any dial', () => {
  const plan = { url: 'wss://dsh.devinho.me/harmony/relay/v1', expectedHost: 'dsh.devinho.me', room: roomId, role: 'phone' as const, token: phoneToken, handshakeTimeoutMs: 1000, maxFrameBytes: 8192, maxBufferedBytes: 16384 }
  expect(validateWssPlan(plan).hostname).toBe('dsh.devinho.me')
  for (const url of ['ws://dsh.devinho.me/harmony/relay/v1', 'wss://other.invalid/harmony/relay/v1', plan.url + '?token=bad', plan.url + '#fragment', 'wss://user@dsh.devinho.me/harmony/relay/v1', 'wss://dsh.devinho.me:444/harmony/relay/v1', 'wss://dsh.devinho.me/api']) expect(() => validateWssPlan({ ...plan, url })).toThrow()
  expect(() => validateWssPlan({ ...plan, expectedHost: 'future.invalid', url: 'wss://future.invalid/harmony/relay/v1' })).toThrow()
})
class FakeScheduler implements CleanupScheduler { callback: (() => void) | undefined; after(_delay: number, callback: () => void) { this.callback = callback; return () => { this.callback = undefined } } tick() { const callback = this.callback; this.callback = undefined; callback?.() } }
it('expiry watchdog serializes sweeps, closes on failure and cancels on disposal', async () => {
  const scheduler = new FakeScheduler(), failClosed = vi.fn(async () => {}), sweep = vi.fn(async () => { throw new Error('sensitive failure') }), stop = mountExpiryCleanup(scheduler, 20, sweep, failClosed)
  scheduler.tick(); await expect(stop()).rejects.toThrow('expiry sweep failed'); expect(failClosed).toHaveBeenCalledOnce(); expect(scheduler.callback).toBeUndefined()
  const controller = new AbortController(), cleanup = vi.fn(), release = bindConnectionLifetime(controller.signal, cleanup); controller.abort(); controller.abort(); release(); expect(cleanup).toHaveBeenCalledOnce()
})
function key(scalar: number) {
  const bytes = Buffer.alloc(32); bytes[31] = scalar; const ec = createECDH('prime256v1'); ec.setPrivateKey(bytes); const point = ec.getPublicKey()
  const privateKey = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url'), d: bytes.toString('base64url') } })
  return { publicSpki: createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64url'), pkcs8: privateKey.export({ format: 'der', type: 'pkcs8' }), sign: async (bytes: Uint8Array) => sign('sha256', bytes, { key: privateKey, dsaEncoding: 'der' }) }
}
it('two memory relay endpoints finish pinned E2E and exchange rich data while relay sees only ciphertext', async () => {
  const f = fixture(), p = f.attach(), phoneId = key(1), desktopId = key(2), received: JsonValue[] = []
  class Endpoint extends MemorySocket { constructor(readonly uplink: MemorySocket) { super() } override send(bytes: Uint8Array) { this.uplink.receive(bytes) } }
  const a = new Endpoint(p.desktop), b = new Endpoint(p.phone)
  p.desktop.send = bytes => { p.desktop.frames.push(Uint8Array.from(bytes)); queueMicrotask(() => a.receive(bytes)) }; p.phone.send = bytes => { p.phone.frames.push(Uint8Array.from(bytes)); queueMicrotask(() => b.receive(bytes)) }
  const cryptoLimits = { maxFrameBytes: 8192, maxPlaintextBytes: 4096, maxFrames: 32 }
  let connected = 0
  const desktop = new EncryptedRelayConnection(a, new P256SecureChannel('desktop', roomId, new ImportedP256Agreement(key(3).pkcs8), Buffer.alloc(32, 3), phoneId.publicSpki, cryptoLimits, nodeE2EPrimitives), desktopId, 16384, async value => { received.push(value) }, () => { connected++ }, new FakeScheduler(), 100, new AbortController().signal)
  const phone = new EncryptedRelayConnection(b, new P256SecureChannel('phone', roomId, new ImportedP256Agreement(key(4).pkcs8), Buffer.alloc(32, 4), desktopId.publicSpki, cryptoLimits, nodeE2EPrimitives), phoneId, 16384, async value => { received.push(value) }, () => { connected++ }, new FakeScheduler(), 100, new AbortController().signal)
  const ready = new TextEncoder().encode('{"relay":"ready","v":1}'); a.receive(ready, false); b.receive(ready, false)
  for (let i = 0; i < 12; i++) { await desktop.settled(); await phone.settled() }
  expect(connected).toBe(2)
  await phone.send({ kind: 'rich', html: '<form>合成状态</form>', commandId: 'same-command' }); await desktop.settled(); expect(received).toEqual([{ kind: 'rich', html: '<form>合成状态</form>', commandId: 'same-command' }])
  const captured = [...p.desktop.frames, ...p.phone.frames].map(frame => new TextDecoder().decode(frame)).join('\n'); expect(captured).not.toContain('<form>'); expect(captured).not.toContain('合成状态'); expect(captured).not.toContain('same-command')
  desktop.close(); phone.close(); f.rooms.close()
})
it('pre-auth deadline and cleanup failure still deny and attempt socket termination', async () => {
  const socket = new MemorySocket(), agreement = new ImportedP256Agreement(key(3).pkcs8), release = vi.spyOn(agreement, 'close').mockImplementation(() => { throw new Error('fake SDK release failure') }), scheduler = new FakeScheduler()
  const crypto = new P256SecureChannel('desktop', roomId, agreement, Buffer.alloc(32, 7), key(1).publicSpki, { maxFrameBytes: 8192, maxPlaintextBytes: 4096, maxFrames: 32 }, nodeE2EPrimitives)
  const encrypted = new EncryptedRelayConnection(socket, crypto, key(2), 16384, async () => {}, () => {}, scheduler, 100, new AbortController().signal)
  scheduler.tick(); expect(socket.terminated).toBe(true); await expect(encrypted.settled()).rejects.toThrow('encrypted connection cleanup failed'); release.mockRestore(); agreement.close()
})
