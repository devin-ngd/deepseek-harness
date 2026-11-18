/** Native UDP discovery returns the source address of a reply for this saved pair and attempt. */
import { util } from '@kit.ArkTS'
import { cryptoFramework } from '@kit.CryptoArchitectureKit'
import { socket } from '@kit.NetworkKit'
import { DEVICE_LAN_DISCOVERY_BYTES, ipv4SubnetBroadcast, isDeviceLanEndpoint, isIpv4InSubnet, lanDiscoveryMessage, NativePrimitives, NativeSignal } from '../paired/PairedCore'
import { NativeWifiLink } from './NativeDirectNetwork'

/** @param port - configured discovery and TCP port. @param scope - saved pairing scope. @param primitives - native digest and encoding. @param signal - connection lifetime. @param waitMs - optional broadcast budget before using another route. @param wifi - Wi-Fi link for subnet-scoped discovery. @returns a private IPv4 address, or no candidate when a bounded probe finds none. */
export async function discoverNativeLanAddress(port: number, scope: string, primitives: NativePrimitives, signal: NativeSignal, waitMs?: number, wifi?: NativeWifiLink): Promise<string | undefined> {
  const nonce = primitives.encode(cryptoFramework.createRandom().generateRandomSync(16).data)
  const encoder = new util.TextEncoder()
  const digest = async (value: string): Promise<string> => primitives.encode(await primitives.hash(encoder.encodeInto(value)))
  const query = await lanDiscoveryMessage(scope, nonce, 'q', digest)
  const reply = await lanDiscoveryMessage(scope, nonce, 'r', digest)
  if (signal.aborted) throw new Error('native LAN discovery retired')
  const udp = socket.constructUDPSocketInstance()
  try {
    let stop = (): void => {}
    let timer: number | undefined
    try {
      await udp.bind({ address: wifi?.address ?? '0.0.0.0', family: 1, port: 0 })
      if (wifi !== undefined) await wifi.network.bindSocket(udp)
      await udp.setExtraOptions({ broadcast: true })
      if (signal.aborted) throw new Error('native LAN discovery retired')
      return await new Promise<string | undefined>((resolve, reject) => {
        const abort = (): void => reject(new Error('native LAN discovery retired'))
        stop = (): void => signal.removeEventListener('abort', abort)
        signal.addEventListener('abort', abort, { once: true })
        if (waitMs !== undefined) timer = setTimeout((): void => resolve(undefined), waitMs)
        udp.on('error', () => reject(new Error('native LAN discovery unavailable')))
        udp.on('message', (packet: socket.SocketMessageInfo): void => {
          const peer = packet.remoteInfo
          if (peer.port !== port || peer.family !== 'IPv4' || packet.message.byteLength !== DEVICE_LAN_DISCOVERY_BYTES
            || !isDeviceLanEndpoint(peer.address, port) || peer.address.startsWith('127.')
            || wifi !== undefined && !isIpv4InSubnet(peer.address, wifi.address, wifi.prefixLength)) return
          if (util.TextDecoder.create('utf-8').decodeToString(new Uint8Array(packet.message)) === reply) resolve(peer.address)
        })
        const broadcast = wifi === undefined ? '255.255.255.255' : ipv4SubnetBroadcast(wifi.address, wifi.prefixLength)
        if (broadcast === undefined) { resolve(undefined); return }
        void udp.send({ data: query, address: { address: broadcast, family: 1, port } })
          .catch((_error: Error) => reject(new Error('native LAN discovery send failed')))
      })
    } catch (error) {
      if (signal.aborted || waitMs === undefined) throw (error as Error)
      return undefined
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      stop()
    }
  } finally { await udp.close() }
}
