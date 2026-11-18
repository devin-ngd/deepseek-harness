/** Configuration shared by the native candidate generator and both LAN endpoints. */
export const DEVICE_LAN_PATH = '/harmony/lan/v1'
export const DEVICE_LAN_PROTOCOL = 'dsh-harmony-lan-v1'

/** @param port - candidate TCP and discovery port. @returns whether it is a usable port number. */
export function isDeviceLanPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535
}

function ipv4Parts(address: string): string[] | undefined {
  const parts = address.split('.')
  return parts.length === 4 && parts.every(part => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255) ? parts : undefined
}

function ipv4Number(address: string): number | undefined {
  return ipv4Parts(address)?.reduce((value, part) => value * 256 + Number(part), 0)
}

/** @param address - candidate literal IPv4. @param network - interface address or route destination. @param prefixLength - CIDR prefix length. @returns whether the candidate belongs to the same IPv4 prefix. */
export function isIpv4InSubnet(address: string, network: string, prefixLength: number): boolean {
  const candidate = ipv4Number(address), local = ipv4Number(network)
  if (candidate === undefined || local === undefined || !Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) return false
  const block = 2 ** (32 - prefixLength)
  return Math.floor(candidate / block) === Math.floor(local / block)
}

/** @param address - Wi-Fi interface address. @param prefixLength - IPv4 link prefix. @returns the subnet broadcast, if the link supports broadcasting. */
export function ipv4SubnetBroadcast(address: string, prefixLength: number): string | undefined {
  const local = ipv4Number(address)
  if (local === undefined || !Number.isInteger(prefixLength) || prefixLength < 1 || prefixLength > 30) return undefined
  const block = 2 ** (32 - prefixLength), broadcast = Math.floor(local / block) * block + block - 1
  return [24, 16, 8, 0].map(shift => (broadcast >>> shift) & 255).join('.')
}

/** One route from the phone's VPN network, including explicit exclusions. */
export interface DeviceMeshRoute { address: string; prefixLength: number; excluded: boolean }

/** @param target - configured desktop Tailnet address. @param localAddresses - IPv4 addresses of a single VPN. @param routes - that VPN's routes. @returns whether the VPN exposes a usable Mesh route for the desktop. */
export function hasDeviceMeshRoute(target: string, localAddresses: readonly string[], routes: readonly DeviceMeshRoute[]): boolean {
  if (!isDeviceTailnetAddress(target)) return false
  const matching = routes.filter(route => isIpv4InSubnet(target, route.address, route.prefixLength))
  const best = Math.max(...matching.map(route => route.prefixLength))
  return matching.some(route => !route.excluded && route.prefixLength === best)
    && !matching.some(route => route.excluded && route.prefixLength === best)
    && (localAddresses.some(isDeviceTailnetAddress)
      || matching.some(route => !route.excluded && route.prefixLength >= 10 && isDeviceTailnetAddress(route.address)))
}

/** @param address - literal IPv4 address. @returns whether the address is in the Tailscale IPv4 range. */
export function isDeviceTailnetAddress(address: string): boolean {
  const parts = ipv4Parts(address)
  return parts !== undefined && parts[0] === '100' && Number(parts[1]) >= 64 && Number(parts[1]) <= 127
}

/** @param address - literal host address. @param port - configured TCP port. @returns whether the endpoint is a private IPv4 address or isolated loopback. */
export function isDeviceLanEndpoint(address: string, port: number): boolean {
  const parts = ipv4Parts(address)
  if (parts === undefined) return false
  const first = Number(parts[0]), second = Number(parts[1])
  return isDeviceLanPort(port)
    && (address === '127.0.0.1' || first === 10 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168)
}
