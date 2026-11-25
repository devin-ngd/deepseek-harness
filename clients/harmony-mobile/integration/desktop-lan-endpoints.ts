/** Desktop interface selection for LAN publication, discovery, admission and reverse connections. */
import { networkInterfaces } from 'node:os'
import { isDeviceLanEndpoint, isDeviceTailnetAddress } from '../src/device-lan-address.ts'
import type { DeviceEndpoints } from '../src/device-endpoint-exchange.ts'

export interface DesktopEndpointInterfaces {
  /** Preferred local interface when it has one usable address. */
  readonly wlanInterface?: string | undefined
  readonly tailnetInterface: string
  readonly tailnetPeerAddress: string
}

// Match complete interface names so e.g. vEthernet, Wi-Fi Direct and tunnel adapters do not match.
const wired = /^(?:(?:Ethernet|以太网)(?:[ -]?\d+)?|eth\d+|en(?:\d+|[opsx][a-z0-9]+))$/i
const wireless = /^(?:(?:Wi-?Fi|WLAN|无线局域网|无线网络连接)(?:[ -]?\d+)?|wl[opsx][a-z0-9]+)$/i

/** @param names - optional LAN preference and paired Tailnet configuration. @param port - listener port. @param interfaces - current OS interface snapshot. @returns one LAN address and the independently selected Tailnet address. */
export function readDesktopEndpoints(names: DesktopEndpointInterfaces, port: number, interfaces = networkInterfaces()): DeviceEndpoints {
  function addressOn(name: string, accept: (address: string) => boolean): string | null {
    const rows = interfaces[name] ?? []
    const addresses = new Set(rows.filter(row => row.family === 'IPv4' && !row.internal && accept(row.address)).map(row => row.address))
    return addresses.size === 1 ? [...addresses][0]! : null
  }
  const lanAddress = (address: string) => address !== '127.0.0.1' && isDeviceLanEndpoint(address, port)
  const preferred = names.wlanInterface
  let wlan = preferred !== undefined && preferred !== names.tailnetInterface ? addressOn(preferred, lanAddress) : null
  if (wlan === null) {
    const available = Object.keys(interfaces).filter(name => name !== names.tailnetInterface).sort()
    const ordered = [...available.filter(name => wired.test(name)), ...available.filter(name => wireless.test(name))]
    for (const name of ordered) {
      wlan = addressOn(name, lanAddress)
      if (wlan !== null) break
    }
  }
  return { wlan, tailnet: addressOn(names.tailnetInterface, isDeviceTailnetAddress), port }
}
