/** Minimum initial-connection capacity for a declared two-endpoint control/data plan; not an nginx simulator. */
export function assertInitialProxyCapacity(proxy, required) {
  if (![proxy.burst, proxy.maxConnections, required.upgrades, required.connections].every(value => Number.isSafeInteger(value) && value >= 0) || required.upgrades === 0 || required.connections === 0) throw new Error('invalid-proxy-capacity')
  if (proxy.burst + 1 < required.upgrades) throw new Error('proxy-initial-burst-insufficient')
  if (proxy.maxConnections < required.connections) throw new Error('proxy-initial-connections-insufficient')
}
