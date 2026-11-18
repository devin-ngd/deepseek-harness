/** Read the phone's IPv4 Wi-Fi link and the route to the configured Mesh peer. */
import { connection } from '@kit.NetworkKit'
import { DeviceMeshRoute, hasDeviceMeshRoute, isDeviceLanEndpoint, isDeviceTailnetAddress, isIpv4InSubnet } from '../paired/PairedCore'

export interface NativeWifiLink { network: connection.NetHandle; address: string; prefixLength: number }
export interface NativeDirectNetwork { wifi?: NativeWifiLink; mesh: boolean }

/** @param lanHint - configured desktop WLAN address, if available. @param tailnet - configured desktop Mesh address. @returns current phone links usable for those candidates. */
export async function readNativeDirectNetwork(lanHint: string | undefined, tailnet: string | undefined): Promise<NativeDirectNetwork> {
  let wifi: NativeWifiLink | undefined
  let mesh = false
  const networks = await connection.getAllNets()
  for (const network of networks) {
    const capabilities = await connection.getNetCapabilities(network)
    const isWifi = capabilities.bearerTypes.includes(connection.NetBearType.BEARER_WIFI)
    const isVpn = capabilities.bearerTypes.includes(connection.NetBearType.BEARER_VPN)
    if (!isWifi && !isVpn) continue
    const properties = await connection.getConnectionProperties(network)
    if (isWifi && !isVpn) {
      for (const link of properties.linkAddresses) {
        const address = link.address.address
        if (!isDeviceLanEndpoint(address, 1) || address.startsWith('127.') || link.prefixLength < 1 || link.prefixLength > 30) continue
        if (wifi === undefined || lanHint !== undefined && isIpv4InSubnet(lanHint, address, link.prefixLength)) {
          wifi = { network, address, prefixLength: link.prefixLength }
        }
      }
    }
    if (isVpn && !mesh) {
      const routes: DeviceMeshRoute[] = properties.routes.map((route: connection.RouteInfo): DeviceMeshRoute => ({
        address: route.destination.address.address, prefixLength: route.destination.prefixLength, excluded: route.isExcludedRoute === true,
      }))
      const addresses = properties.linkAddresses.map((link: connection.LinkAddress): string => link.address.address)
      mesh = tailnet === undefined
        ? addresses.some(isDeviceTailnetAddress) || routes.some((route: DeviceMeshRoute): boolean => !route.excluded && route.prefixLength >= 10 && isDeviceTailnetAddress(route.address))
        : hasDeviceMeshRoute(tailnet, addresses, routes)
    }
  }
  return { wifi, mesh }
}
