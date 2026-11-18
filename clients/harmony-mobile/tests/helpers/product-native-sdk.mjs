/** Synthetic SDK only: fixed P256 identities, memory app files and optional loopback WS. No actual HUKS/device/TLS. */
import * as pair from './phase40-native-sdk.mjs'
import * as files from './native-sdk-fake.mjs'
export const huks = pair.huks, network = pair.network, state = pair.state, webSocket = pair.webSocket, fileIo = files.fileIo, webview = files.webview, sdk = files.sdk, context = files.context
export const util = { ...files.util, ...pair.util, generateRandomUUID: files.util.generateRandomUUID }
/** Test resolvers share this default stub between native util and URL modules; Kit substitutes retain named exports. */
const TestURL = globalThis.URL
export default { ...util, URL: { parseURL: (input, base) => new TestURL(input, base) } }
export const deviceInfo = { sdkApiVersion: 26 }
export const socket = {
  constructUDPSocketInstance() { throw new Error('UDP discovery requires a dedicated test port') },
  constructTCPSocketServerInstance() { throw new Error('Reverse LAN requires a dedicated test listener') },
}
export const connection = {
  NetBearType: { BEARER_CELLULAR: 0, BEARER_WIFI: 1, BEARER_VPN: 4 },
  getAllNets: async () => [],
  getNetCapabilities: async () => ({ bearerTypes: [] }),
  getConnectionProperties: async () => ({ linkAddresses: [], routes: [] }),
}
export const cryptoFramework = { ...pair.cryptoFramework, createMd(name) { return { ...pair.cryptoFramework.createMd(name), ...files.cryptoFramework.createMd(name) } } }
export function resetProductSdk() { pair.reset(); files.resetSdk() }
