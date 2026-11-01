/** Virtual-time broker, endpoint and data-room checks with fixed synthetic identities; no network or model. */
import { it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { RoomBroker } from '../standalone-relay/src/room-broker.ts'
import { resolveBrokerPolicy } from '../standalone-relay/src/broker-policy.ts'
import { RelayRooms, type RelaySocket } from './relay-core.ts'
import { RelayControlClient, type EndpointRoomLease } from '../src/relay-control-client.ts'
import { relayEndpointTimers } from '../standalone-relay/src/endpoint-timers.ts'
import { desktopKey, phoneKey, pairId, audience, FixtureClock, ports, fixtureSource, drain } from './phase39-fixture.ts'
import { nodeE2EPrimitives, p256CredentialId } from './p256-channel.ts'

const desktop = JSON.parse(await readFile(new URL('../desktop-plugin/device.enabled.example.json', import.meta.url), 'utf8'))
const phone = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8'))
const proposal = JSON.parse(await readFile(new URL('../standalone-relay/config.first-use.proposal.json', import.meta.url), 'utf8'))
const nginx = await readFile(new URL('../standalone-relay/relay.nginx.conf.proposal', import.meta.url), 'utf8')

function proxyReadMs(path: string): number {
  const block = nginx.split('location = ' + path + ' {')[1]?.split('}')[0]
  const seconds = block?.match(/proxy_read_timeout\s+([0-9]+)s;/)?.[1]
  if (seconds === undefined) throw new Error('explicit proxy read timeout required')
  return Number(seconds) * 1000
}

// Model only nginx's upstream-read inactivity deadline, independently of data-room traffic.
function controlProxy(clock: FixtureClock, port: ReturnType<typeof ports>, timeoutMs: number) {
  let cancel = () => {}, expired = false
  const stop = port.server.onEnd(() => cancel())
  const server: RelaySocket = {
    get bufferedAmount() { return port.server.bufferedAmount },
    onFrame: callback => port.server.onFrame(callback), onEnd: callback => port.server.onEnd(callback),
    ready: () => port.server.ready(), terminate: () => port.server.terminate(),
    send(bytes) { cancel(); cancel = clock.after(timeoutMs, () => { expired = true; port.server.terminate() }); port.server.send(bytes) },
  }
  return { server, expired: () => expired, close() { cancel(); stop() } }
}

async function connected(routeTtlMs = 900000, controlReadTimeoutMs = proxyReadMs('/harmony/relay/control/v1')) {
  const clock = new FixtureClock(), authority = {}, expiresAt = clock.now + routeTtlMs
  const pair = { pairId, desktopPublicSpki: desktopKey.publicSpki, phonePublicSpki: phoneKey.publicSpki, epoch: 1, expiresAt, revoked: false }
  const policy = resolveBrokerPolicy({ ...proposal.broker, pairs: [pair] })
  if (!policy.enabled) throw new Error('enabled synthetic broker required')
  const { maxRooms, maxRoomTtlMs, pairTimeoutMs, maxFrameBytes, maxBufferedBytes, maxFrames, idleTimeoutMs } = proposal
  const rooms = new RelayRooms(authority, { maxRooms, maxRoomTtlMs, pairTimeoutMs, maxFrameBytes, maxBufferedBytes, maxFrames, idleTimeoutMs }, () => clock.now)
  const broker = new RoomBroker(authority, rooms, policy, audience, () => clock.now, fixtureSource())
  const controllers: RelayControlClient[] = [], leases: EndpointRoomLease[] = [], data = [ports(), ports()]
  const proxies: ReturnType<typeof controlProxy>[] = []
  const close = () => { for (const controller of controllers) controller.close(); broker.close(); rooms.close(); for (const proxy of proxies) proxy.close() }
  try {
    for (const [index, role] of (['desktop', 'phone'] as const).entries()) {
      const socket = ports(), key = role === 'desktop' ? desktopKey : phoneKey, config = role === 'desktop' ? desktop : phone
      const controller = new RelayControlClient(socket.client, { pairId, epoch: 1, role, audience, credentialId: p256CredentialId(key.publicSpki), expiresAt }, key, nodeE2EPrimitives, () => clock.now, config.relay.maxProofs, config.relay.maxQueuedBytes, config.relay.maxChallengeTtlMs, config.relay.maxRoomTtlMs, clock, lease => {
        leases.push(lease)
        rooms.claim(lease.receipt.room, role, lease.receipt.token).attach(data[index]!.server)
        lease.signal.addEventListener('abort', () => data[index]!.client.terminate(), { once: true })
      }, new AbortController().signal)
      const proxy = controlProxy(clock, socket, controlReadTimeoutMs); proxies.push(proxy)
      controllers.push(controller); broker.attach(pairId, role, proxy.server)
    }
    await drain()
    expect(leases).toHaveLength(2)
    return { clock, rooms, broker, controllers, leases, data, proxies, close, async advance(ms: number) {
      // Regular product catalogue polling keeps idle expiry separate from room expiry.
      for (let left = ms; left > 0;) {
        const step = Math.min(5000, left); left -= step; clock.advance(step)
        if (!leases[0]!.signal.aborted) {
          for (const receive of data[0]!.server.frames) receive(new TextEncoder().encode('synthetic-catalog-poll'), true)
        }
        await drain()
        rooms.sweep()
      }
    } }
  } catch (error) { close(); throw error }
}

it('device desktop, phone and relay select the same ten-minute connection lifetime', () => {
  const limits = relayEndpointTimers(desktop, phone)
  expect(limits.desktop.maxRoomTtlMs).toBe(600000)
  expect(limits.phone.maxRoomTtlMs).toBe(600000)
  expect(desktop.connectionTtlMs).toBe(600000)
  expect(proposal.maxRoomTtlMs).toBe(600000)
  expect(proposal.broker.roomTtlMs).toBe(600000)
  expect(proposal.broker.challengeTtlMs).toBe(10000)
  expect(proposal.pairTimeoutMs).toBe(30000)
})

it('proxy control silence lasts beyond room issuance and data reads outlive idle reclamation', () => {
  expect(proxyReadMs('/harmony/relay/control/v1')).toBeGreaterThan(proposal.broker.roomTtlMs + proposal.broker.challengeTtlMs)
  expect(proxyReadMs('/harmony/relay/v1')).toBeGreaterThan(proposal.idleTimeoutMs)
})

it('the legacy sixty-second control proxy closes a busy data room and both endpoint leases', async () => {
  const f = await connected(900000, 60000)
  try {
    await f.advance(55000)
    expect(f.data[1]!.server.sent.length).toBeGreaterThan(0)
    expect(f.leases.every(lease => !lease.signal.aborted)).toBe(true)
    await f.advance(5000)
    expect(f.proxies.some(proxy => proxy.expired())).toBe(true)
    expect(f.leases.every(lease => lease.signal.aborted)).toBe(true)
    expect(f.rooms.active(f.leases[0]!.receipt.room)).toBe(false)
  } finally { f.close() }
  expect(f.clock.pending.size).toBe(0)
})

it('data idle reclamation still closes an otherwise valid room before the longer proxy deadline', async () => {
  const f = await connected()
  try {
    f.clock.advance(proposal.idleTimeoutMs); f.rooms.sweep()
    expect(f.rooms.active(f.leases[0]!.receipt.room)).toBe(false)
    expect(f.proxies.every(proxy => !proxy.expired())).toBe(true)
    expect(f.data.every(port => port.client.closed && port.server.closed)).toBe(true)
  } finally { f.close() }
  expect(f.clock.pending.size).toBe(0)
})

it('an admitted room survives thirty seconds and three minutes, then retires at its finite deadline', async () => {
  const f = await connected()
  try {
    const lease = f.leases[0]!
    expect(lease.receipt.expiresAt - f.clock.now).toBe(600000)
    await f.advance(30000); expect(lease.signal.aborted).toBe(false)
    await f.advance(150000); expect(lease.signal.aborted).toBe(false); expect(f.rooms.active(lease.receipt.room)).toBe(true)
    await f.advance(419999); expect(lease.signal.aborted).toBe(false)
    await f.advance(1); expect(lease.signal.aborted).toBe(true); expect(f.rooms.active(lease.receipt.room)).toBe(false)
    expect(f.data.every(port => port.client.closed && port.server.closed)).toBe(true)
  } finally { f.close() }
  expect(f.clock.pending.size).toBe(0)
})

it('a signed route ending earlier than ten minutes remains the room deadline', async () => {
  const f = await connected(45000)
  try {
    const lease = f.leases[0]!
    expect(lease.receipt.expiresAt - f.clock.now).toBe(45000)
    await f.advance(44999); expect(lease.signal.aborted).toBe(false)
    await f.advance(1); expect(lease.signal.aborted).toBe(true); expect(f.rooms.active(lease.receipt.room)).toBe(false)
  } finally { f.close() }
  expect(f.clock.pending.size).toBe(0)
})

it('cancel before expiry retires both data ports and leaves no late lease callbacks', async () => {
  const f = await connected()
  try {
    await f.advance(180000)
    expect(f.leases.every(lease => !lease.signal.aborted)).toBe(true)
    f.close(); const count = f.leases.length
    f.clock.advance(900000); await drain()
    expect(f.leases).toHaveLength(count)
    expect(f.leases.every(lease => lease.signal.aborted)).toBe(true)
    expect(f.data.every(port => port.client.closed && port.server.closed)).toBe(true)
    expect(f.clock.pending.size).toBe(0)
  } finally { f.close() }
})
