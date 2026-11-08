/** TLS loopback fixture for the sealed desktop sender and independent relay host. */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:https'
import { registerHooks } from 'node:module'
import { connect } from 'node:net'
import { dirname, join } from 'node:path'
import type { Duplex } from 'node:stream'
import { TLSSocket } from 'node:tls'
import { pathToFileURL } from 'node:url'
import WebSocket from 'ws'
import type { CleanupScheduler } from './connection-lifetime.ts'
import { desktopKey, fixtureSource, hostConfig, phoneKey } from './phase39-fixture.ts'
import { freshNodeAgreement, nodeE2EPrimitives } from './p256-channel.ts'
import { RELAY_PATH, RELAY_SUBPROTOCOL } from './relay-protocol.ts'
import { denyRelayUpgrade, nodeRelaySocket, relayHeader } from './relay-upgrade.ts'
import { deviceRelayPairId, type DeviceBinding } from '../src/device-binding-protocol.ts'
import type { PairedRelayPolicy, PairedRelayPorts } from '../src/paired-relay.ts'
import { RELAY_CONTROL_PATH, RELAY_CONTROL_SUBPROTOCOL } from '../src/relay-control-protocol.ts'
import type { createStandaloneRelay } from '../standalone-relay/src/host.ts'

/** Pinned relay artifact and ephemeral CA used only by the local transport fixture. */
export interface WorkspaceStandaloneWssInputs {
  readonly relayEntry: string
  readonly key: Buffer
  readonly cert: Buffer
  readonly ca: Buffer
  readonly maxControlFrames: number
  readonly roomTtlMs?: number
  readonly nativeDevicePort?: number
  readonly desktopDataOneWayDelayMs?: number
}

interface DelayedDelivery { bytes: number; chunks: number; pending: number }

function delayPipe(source: Duplex, target: Duplex, ms: number, limit: number, scheduler: CleanupScheduler, delivery: DelayedDelivery): void {
  const timers = new Set<() => void>()
  let queued = 0
  const forward = (chunk: Buffer) => {
    if (queued + target.writableLength + chunk.length > limit) { source.destroy(); return }
    queued += chunk.length
    delivery.pending++
    const stop = scheduler.after(ms, () => {
      timers.delete(stop); queued -= chunk.length; delivery.pending--
      if (target.destroyed) return
      target.write(chunk)
      delivery.bytes += chunk.length; delivery.chunks++
    })
    timers.add(stop)
  }
  const clear = () => {
    source.off('data', forward)
    for (const stop of timers) stop()
    delivery.pending -= timers.size
    timers.clear()
  }
  source.once('close', clear); target.once('close', clear)
  source.on('data', forward)
}

/** @param record - synthetic pair. @param policy - accepted transport budgets. @param scheduler - test timer owner. @param input - sealed relay and local TLS credentials. @returns independently owned loopback relay ports and TLS evidence. */
export async function startWorkspaceStandaloneWss(record: DeviceBinding, policy: PairedRelayPolicy, scheduler: CleanupScheduler, input: WorkspaceStandaloneWssInputs) {
  const { createStandaloneRelay: createRelay } = await import(pathToFileURL(input.relayEntry).href) as { createStandaloneRelay: typeof createStandaloneRelay }
  const pairId = deviceRelayPairId(record), expiresAt = Date.now() + policy.maxRoomTtlMs
  const roomTtlMs = input.roomTtlMs ?? Math.min(300000, policy.maxRoomTtlMs)
  assert.ok(Number.isSafeInteger(roomTtlMs) && roomTtlMs > 0 && roomTtlMs <= policy.maxRoomTtlMs)
  const relay = createRelay({ ...hostConfig, publicHost: record.audience, nativeOrigin: 'networkkit-v1', roomDiagnostics: true, maxControlFrames: input.maxControlFrames,
    maxRoomTtlMs: policy.maxRoomTtlMs, idleTimeoutMs: policy.maxRoomTtlMs, pairTimeoutMs: policy.handshakeMs,
    maxFrameBytes: policy.e2e.maxFrameBytes, maxBufferedBytes: policy.maxQueuedBytes, maxFrames: policy.e2e.maxFrames,
    broker: { ...hostConfig.broker, challengeTtlMs: 10000, roomTtlMs,
      pairs: [{ pairId, desktopPublicSpki: record.desktopPublicSpki, phonePublicSpki: record.phonePublicSpki, epoch: record.epoch, expiresAt, revoked: false }] },
  }, {}, Date.now, undefined, fixtureSource())
  assert.ok(relay)
  const sockets = new Set<Duplex>(), tlsProtocols: string[] = []
  const oneWayMs = input.desktopDataOneWayDelayMs ?? 0
  assert.ok(Number.isSafeInteger(oneWayMs) && oneWayMs >= 0 && oneWayMs < policy.handshakeMs / 2)
  const delay = { oneWayMs, roomTtlMs, connections: 0, fromDesktop: { bytes: 0, chunks: 0, pending: 0 }, toDesktop: { bytes: 0, chunks: 0, pending: 0 } }
  const nativeObserved = { tlsProtocols: [] as string[], controlRequests: 0, dataRequests: 0, rejected: 0, terminalFailures: 0 }
  let closing = false
  const proxy = createServer({ key: input.key, cert: input.cert, minVersion: 'TLSv1.3', maxHeaderSize: hostConfig.maxHeaderBytes }, (_request, response) => response.writeHead(403).end())
  proxy.on('secureConnection', socket => tlsProtocols.push(socket.getProtocol() ?? 'unknown'))
  proxy.on('tlsClientError', () => { nativeObserved.terminalFailures++ })
  proxy.on('upgrade', (request, client, head) => {
    if (closing) { client.destroy(); return }
    let headers: string[], delayed = false
    try {
      const path = request.url, host = relayHeader(request, 'host'), role = relayHeader(request, 'x-dsh-relay-role')
      const native = input.nativeDevicePort !== undefined && host === `${record.audience}:${input.nativeDevicePort}`
        && role === 'phone' && relayHeader(request, 'origin') === 'https://' + record.audience
      assert.ok(request.method === 'GET' && (path === RELAY_PATH || path === RELAY_CONTROL_PATH) && (native || host === record.audience))
      delayed = oneWayMs > 0 && role === 'desktop' && path === RELAY_PATH
      if (native) {
        nativeObserved.tlsProtocols.push(client instanceof TLSSocket ? client.getProtocol() ?? 'unknown' : 'unknown')
        if (path === RELAY_CONTROL_PATH) nativeObserved.controlRequests++
        else nativeObserved.dataRequests++
      }
      headers = [`GET ${path} HTTP/1.1`]
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        const name = request.rawHeaders[index]!, value = request.rawHeaders[index + 1]!
        headers.push(`${name}: ${native && name.toLowerCase() === 'host' ? record.audience : value}`)
      }
    } catch (error) {
      void error /* All invalid test ingress receives the same denial. */
      nativeObserved.rejected++; denyRelayUpgrade(client); return
    }
    const upstream = connect(relay.port(), '127.0.0.1')
    client.on('error', () => upstream.destroy()); client.once('close', () => upstream.destroy())
    upstream.on('error', () => client.destroy()); upstream.once('close', () => client.destroy())
    sockets.add(upstream); upstream.once('close', () => sockets.delete(upstream))
    upstream.write(headers.join('\r\n') + '\r\n\r\n')
    if (head.length > 0) upstream.write(head)
    if (delayed) {
      delay.connections++
      delayPipe(client, upstream, oneWayMs, policy.maxQueuedBytes, scheduler, delay.fromDesktop)
      delayPipe(upstream, client, oneWayMs, policy.maxQueuedBytes, scheduler, delay.toDesktop)
    } else client.pipe(upstream).pipe(client)
  })
  proxy.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
  const close = async () => {
    closing = true
    const closedSockets = [...sockets].map(socket => new Promise<void>(resolve => { socket.once('close', () => resolve()); socket.destroy() }))
    await Promise.all([relay.close(), proxy.listening ? new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve())) : undefined, ...closedSockets])
    assert.equal(proxy.listening, false)
    assert.equal(sockets.size, 0)
    assert.equal(delay.fromDesktop.pending + delay.toDesktop.pending, 0)
  }
  try {
    await relay.start()
    await new Promise<void>((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve) })
    const address = proxy.address(); assert.ok(address !== null && typeof address !== 'string')
    const origin = 'wss://127.0.0.1:' + address.port
    const phoneSocket = (path: string, protocol: string, headers: Record<string, string>) => new WebSocket(origin + path, protocol, {
      ca: input.ca, rejectUnauthorized: true, followRedirects: false, perMessageDeflate: false, handshakeTimeout: policy.handshakeMs,
      maxPayload: policy.e2e.maxFrameBytes,
      headers: { Host: record.audience, Origin: 'https://' + record.audience, 'X-DSH-Relay-Role': 'phone', ...headers },
    })
    return {
      nativeWss: input.nativeDevicePort === undefined ? undefined : { hostPort: address.port, devicePort: input.nativeDevicePort, observed: nativeObserved },
      async desktopModule(path: string) {
        const url = pathToFileURL(path).href, shim = join(dirname(path), 'desktop-loopback-wss.mjs')
        await writeFile(shim, `import assert from 'node:assert/strict';
import WebSocket from 'ws';
export * from 'ws';
export default class extends WebSocket {
  constructor(url, protocol, options) {
    const target = new URL(url);
    assert.equal(target.origin, ${JSON.stringify('wss://' + record.audience)});
    assert.ok(${JSON.stringify([RELAY_PATH, RELAY_CONTROL_PATH])}.includes(target.pathname));
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.followRedirects, false);
    super(${JSON.stringify(origin)} + target.pathname, protocol, { ...options, ca: Buffer.from(${JSON.stringify(input.ca.toString('base64'))}, 'base64'), headers: { ...options.headers, Host: target.host } });
  }
}
`, { flag: 'wx' })
        const hook = registerHooks({ resolve(specifier, context, next) {
          return next(specifier === 'ws' && context.parentURL === url ? pathToFileURL(shim).href : specifier, context)
        } })
        try { return await import(url) }
        finally { hook.deregister() }
      },
      phonePorts(): PairedRelayPorts {
        return { clock: Date.now, scheduler, primitives: nodeE2EPrimitives, signer: phoneKey, remotePublicSpki: desktopKey.publicSpki,
          control: nodeRelaySocket(phoneSocket(RELAY_CONTROL_PATH, RELAY_CONTROL_SUBPROTOCOL, { 'X-DSH-Relay-Pair': pairId }), input.maxControlFrames, false),
          agreement: async () => ({ key: freshNodeAgreement(), nonce: randomBytes(32) }),
          data: async ({ receipt }) => nodeRelaySocket(phoneSocket(RELAY_PATH, RELAY_SUBPROTOCOL,
            { Authorization: 'Bearer ' + receipt.token, 'X-DSH-Relay-Room': receipt.room }), input.maxControlFrames),
        }
      },
      observed: () => ({ tlsProtocols: [...tlsProtocols], connections: tlsProtocols.length }),
      ...(oneWayMs > 0 ? { dataDelay: () => structuredClone(delay) } : {}),
      close,
    }
  } catch (error) { await close(); throw error }
}
