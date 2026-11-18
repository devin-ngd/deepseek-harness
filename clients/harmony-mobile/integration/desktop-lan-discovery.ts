/** Desktop responder for local IPv4 broadcasts. The reply source address is the dial candidate. */
import { createHash } from 'node:crypto'
import { createSocket } from 'node:dgram'
import { once } from 'node:events'
import { networkInterfaces } from 'node:os'
import { isDeviceLanEndpoint } from '../src/device-lan-address.ts'
import { DEVICE_LAN_DISCOVERY_BYTES, lanDiscoveryMessage, lanDiscoveryNonce } from '../src/device-lan-discovery.ts'

const ipv4 = (address: string) => address.split('.').reduce((value, octet) => (value << 8) | Number(octet), 0)

/** @param peer - socket source IPv4 address. @param local - exact destination interface for a TCP request, or any private interface for discovery. @returns whether the peer is on the selected local IPv4 subnet. */
export function isDeviceLanPeer(peer: string, local?: string): boolean {
  if (!isDeviceLanEndpoint(peer, 1) || peer.startsWith('127.')) return false
  let interfaces: ReturnType<typeof networkInterfaces>
  try { interfaces = networkInterfaces() } catch (error) { void error; return false }
  return Object.values(interfaces).some(addresses => addresses?.some(address =>
    address.family === 'IPv4' && !address.internal && isDeviceLanEndpoint(address.address, 1) && (local === undefined || address.address === local)
      && (ipv4(address.address) & ipv4(address.netmask)) === (ipv4(peer) & ipv4(address.netmask))))
}

/** @param address - wildcard in production or explicit loopback fixture. @param port - TCP listener's port. @param scope - saved pairing scope. @param accept - source subnet admission. @param failed - fatal UDP socket notification. @returns cleanup for the bound UDP listener. */
export async function openDesktopLanDiscovery(address: string, port: number, scope: string,
  accept: (peer: string) => boolean, failed: () => void): Promise<() => Promise<void>> {
  const socket = createSocket('udp4')
  let closing: Promise<void> | undefined
  const close = () => closing ??= new Promise<void>((resolve, reject) => {
    try { socket.close(() => resolve()) }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ERR_SOCKET_DGRAM_NOT_RUNNING') resolve()
      else reject(error)
    }
  })
  let responding = false
  socket.on('error', failed)
  socket.on('message', (packet, peer) => {
    if (closing !== undefined || responding || packet.byteLength !== DEVICE_LAN_DISCOVERY_BYTES || !accept(peer.address)) return
    const query = packet.toString('latin1'), nonce = lanDiscoveryNonce(query)
    if (nonce === undefined) return
    responding = true
    const digest = async (value: string) => createHash('sha256').update(value).digest('base64url')
    void (async () => {
      if (query !== await lanDiscoveryMessage(scope, nonce, 'q', digest)) return
      const reply = await lanDiscoveryMessage(scope, nonce, 'r', digest)
      if (closing === undefined) socket.send(reply, peer.port, peer.address, () => {})
    })().catch(error => { void error; if (closing === undefined) failed() }).finally(() => { responding = false })
  })
  try {
    const listening = once(socket, 'listening')
    socket.bind(port, address)
    await listening
    return close
  } catch (error) {
    void error
    await close()
    throw new Error('desktop LAN discovery bind failed')
  }
}
