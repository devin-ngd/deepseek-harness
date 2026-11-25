/** Desktop LAN listener for the paired device carrier. */
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { readDesktopEndpoints, type DesktopEndpointInterfaces } from './desktop-lan-endpoints.ts'
import type { IncomingMessage } from 'node:http'
import WebSocket, { WebSocketServer } from 'ws'
import { DEVICE_LAN_PATH, DEVICE_LAN_PROTOCOL, isDeviceLanEndpoint, isDeviceLanPort, isDeviceTailnetAddress } from '../src/device-lan-address.ts'
import { isDeviceLanPeer, openDesktopLanDiscovery } from './desktop-lan-discovery.ts'
import { lanDiscoveryScope } from '../src/device-lan-discovery.ts'
import type { DeviceLanPorts } from '../src/device-lan.ts'
import type { P256IdentitySigner } from '../src/e2e-channel.ts'
import type { EndpointRelayTrust } from '../src/relay-control-client.ts'
import { boundDesktopControl, type DesktopWssPolicy } from './desktop-wss.ts'
import { freshNodeAgreement, nodeE2EPrimitives, p256CredentialId, p256Public } from './p256-channel.ts'
import type { RelaySocket } from './relay-core.ts'
import type { DeviceEndpoints } from '../src/device-endpoint-exchange.ts'
import type { ReverseLanOffer } from '../src/device-reverse-control.ts'
import { dialDesktopReverse } from './desktop-reverse.ts'

export { readDesktopEndpoints, type DesktopEndpointInterfaces } from './desktop-lan-endpoints.ts'
import { nodeRelaySocket } from './relay-upgrade.ts'

/** Without a fixed address, TCP and discovery follow the desktop's current private IPv4 interfaces. */
export interface DesktopLanAddress {
  readonly address?: string | undefined
  readonly port: number
  readonly tailnet?: { readonly localAddress: string; readonly peerAddress: string } | undefined
  readonly rendezvous?: DesktopEndpointInterfaces | undefined
}
/** The actual bound port is available to isolated tests using the kernel-selected loopback port. */
export interface DesktopLanPorts extends DeviceLanPorts {
  readonly port: number
  readonly endpoints?: () => DeviceEndpoints
  readonly reverse?: (offer: ReverseLanOffer, signal: AbortSignal) => Promise<boolean>
}

/** @param endpoint - local bind interface and port. @param limits - existing device socket budgets. @param trust - original desktop pairing identity. @param signer - original desktop signer. @param remotePublicSpki - saved phone pin. @returns after binding one listener, with a single pending peer and awaited cleanup. */
export async function openDesktopLanPorts(endpoint: DesktopLanAddress, limits: DesktopWssPolicy, trust: EndpointRelayTrust,
  signer: P256IdentitySigner, remotePublicSpki: string): Promise<DesktopLanPorts> {
  const ephemeral = endpoint.address === '127.0.0.1' && endpoint.port === 0
  const automatic = endpoint.address === undefined
  const tailnet = endpoint.tailnet
  const rendezvous = endpoint.rendezvous
  if ((!ephemeral && (!isDeviceLanPort(endpoint.port) || endpoint.address !== undefined && !isDeviceLanEndpoint(endpoint.address, endpoint.port))) || trust.role !== 'desktop' || trust.expiresAt <= Date.now()
    || p256CredentialId(signer.publicSpki) !== trust.credentialId) throw new Error('desktop LAN policy denied')
  if (tailnet !== undefined && (!automatic || !isDeviceTailnetAddress(tailnet.localAddress)
    || !isDeviceTailnetAddress(tailnet.peerAddress) || tailnet.localAddress === tailnet.peerAddress)) throw new Error('desktop tailnet policy denied')
  if (rendezvous !== undefined && (!automatic || tailnet !== undefined || rendezvous.wlanInterface === rendezvous.tailnetInterface
    || !isDeviceTailnetAddress(rendezvous.tailnetPeerAddress))) throw new Error('desktop endpoint publication policy denied')
  const endpoints = rendezvous === undefined ? undefined : () => readDesktopEndpoints(rendezvous, endpoint.port)
  const accepts = (remote: string, local: string): boolean => {
    if (endpoints === undefined || rendezvous === undefined) return isDeviceLanPeer(remote, local)
      || tailnet !== undefined && local === tailnet.localAddress && remote === tailnet.peerAddress
    const current = endpoints()
    return local === current.wlan && remote !== '127.0.0.1' && isDeviceLanEndpoint(remote, endpoint.port)
      || local === current.tailnet && remote === rendezvous.tailnetPeerAddress
  }
  p256Public(remotePublicSpki)
  const peer = Promise.withResolvers<RelaySocket>()
  void peer.promise.catch(() => {})
  let socket: RelaySocket | undefined
  let reverseClosed: Promise<void> | undefined
  let closing: Promise<void> | undefined
  let stopDiscovery: (() => Promise<void>) | undefined
  const server = new WebSocketServer({
    host: endpoint.address ?? '0.0.0.0', port: endpoint.port, maxPayload: limits.maxFrameBytes, perMessageDeflate: false,
    verifyClient: ({ req }: { req: IncomingMessage }) => socket === undefined && closing === undefined && req.url === DEVICE_LAN_PATH
      && req.headers['sec-websocket-protocol'] === DEVICE_LAN_PROTOCOL && req.headers['sec-fetch-mode'] === undefined
      && (!automatic || req.socket.remoteAddress !== undefined && req.socket.localAddress !== undefined
        && accepts(req.socket.remoteAddress, req.socket.localAddress)),
  })
  server.on('connection', incoming => {
    if (closing !== undefined || socket !== undefined) { incoming.terminate(); return }
    socket = boundDesktopControl(nodeRelaySocket(incoming, limits.maxControlFrames), () => incoming.readyState === WebSocket.OPEN, limits)
    peer.resolve(socket)
  })
  const failed = () => { peer.reject(new Error('desktop LAN listener unavailable')); socket?.terminate() }
  server.on('error', failed)
  const close = () => {
    if (closing !== undefined) return closing
    peer.reject(new Error('desktop LAN listener closed'))
    socket?.terminate()
    const closeServer = new Promise<void>((resolve, reject) => {
      server.close(error => error === undefined ? resolve() : reject(new Error('desktop LAN cleanup failed')))
    })
    closing = (async () => {
      const results = await Promise.allSettled([closeServer, stopDiscovery?.(), reverseClosed])
      if (results.some(result => result.status === 'rejected')) throw new Error('desktop LAN cleanup failed')
    })()
    return closing
  }
  try { await once(server, 'listening') } catch (error) {
    void error
    await close()
    throw new Error('desktop LAN bind failed')
  }
  const address = server.address()
  if (address === null || typeof address === 'string') { await close(); throw new Error('desktop LAN address unavailable') }
  if (automatic) {
    const scope = lanDiscoveryScope(trust.pairId, signer.publicSpki)
    const discoverable = endpoints === undefined ? isDeviceLanPeer : (peer: string) => {
      const local = endpoints().wlan
      return local !== null && isDeviceLanPeer(peer, local)
    }
    try { stopDiscovery = await openDesktopLanDiscovery('0.0.0.0', address.port, scope, discoverable, failed) }
    catch (error) { await close(); throw error }
  }
  const reverse = async (offer: ReverseLanOffer, signal: AbortSignal): Promise<boolean> => {
    const local = endpoints?.().wlan
    if (local === undefined || local === null || socket !== undefined || closing !== undefined || signal.aborted || offer.port !== address.port) return false
    const opened = await dialDesktopReverse(offer, local, limits, signal)
    if (opened === undefined) return false
    if (socket !== undefined || closing !== undefined || signal.aborted) {
      opened.port.terminate()
      await opened.closed
      return false
    }
    socket = opened.port
    reverseClosed = opened.closed
    peer.resolve(socket)
    return true
  }
  return {
    port: address.port, ...(endpoints === undefined ? {} : { endpoints, reverse }),
    lan: { open: async signal => { signal.throwIfAborted(); return peer.promise }, close },
    signer, primitives: nodeE2EPrimitives, remotePublicSpki, clock: Date.now,
    scheduler: { after: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } },
    agreement: async () => ({ key: freshNodeAgreement(), nonce: randomBytes(32) }),
  }
}
