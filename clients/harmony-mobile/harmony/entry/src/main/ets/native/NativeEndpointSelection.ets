/** Ordered direct attempts after reading the phone's current link state. */
import { NativeDeviceEndpoints } from '../paired/PairedCore'
import { DeviceConnectionFailure } from '../product/ProductCore'

/** Native connection operations for one attempt. A failed dial returns only after releasing its socket. */
export interface NativeEndpointSelection {
  wifi: boolean
  mesh: boolean
  discoveryPort: number
  onWifiSubnet: (address: string) => boolean
  discover: () => Promise<string | undefined>
  lookup: () => Promise<NativeDeviceEndpoints | null>
  reverse?: () => Promise<boolean>
  meshCanReach: (address: string) => Promise<boolean>
  dial: (address: string, port: number) => Promise<boolean>
}

/** @param options - link state and owned connection operations. @returns the direct path whose WebSocket upgrade completed. */
export async function selectNativePublishedEndpoint(options: NativeEndpointSelection): Promise<string> {
  if (!options.wifi && !options.mesh) throw new DeviceConnectionFailure('native-channel', 'mesh-required')
  const discovered = options.wifi ? await options.discover() : undefined
  if (discovered !== undefined && await options.dial(discovered, options.discoveryPort)) return 'lan'
  const addresses = await options.lookup()
  let meshAttempted = false
  if (options.mesh && options.wifi && addresses !== null && addresses.wlan !== null && !options.onWifiSubnet(addresses.wlan)
    && addresses.tailnet !== null && await options.meshCanReach(addresses.tailnet)) {
    meshAttempted = true
    if (await dialTailnet(options, addresses.tailnet, addresses.port)) return 'tailnet'
  }
  if (addresses !== null && options.wifi && addresses.wlan !== null
    && (addresses.wlan !== discovered || addresses.port !== options.discoveryPort)
    && await options.dial(addresses.wlan, addresses.port)) return 'lan'
  if (options.wifi && options.reverse !== undefined && await options.reverse()) return 'lan-reverse'
  if (!options.mesh) throw new DeviceConnectionFailure('native-channel', 'mesh-required')
  if (addresses === null || addresses.tailnet === null) throw new DeviceConnectionFailure('native-channel', 'endpoints-unavailable')
  if (!await options.meshCanReach(addresses.tailnet)) throw new DeviceConnectionFailure('native-channel', 'mesh-required')
  if (meshAttempted || !await dialTailnet(options, addresses.tailnet, addresses.port)) throw new DeviceConnectionFailure('native-channel', 'unavailable')
  return 'tailnet'
}

async function dialTailnet(options: NativeEndpointSelection, address: string, port: number): Promise<boolean> {
  if (await options.dial(address, port)) return true
  return await options.meshCanReach(address) && await options.dial(address, port)
}
