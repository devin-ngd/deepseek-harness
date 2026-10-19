/** Synthetic SDK only: fixed P256 identities, memory app files and optional loopback WS. No actual HUKS/device/TLS. */
import * as pair from './phase40-native-sdk.mjs'
import * as files from './native-sdk-fake.mjs'
export const huks = pair.huks, network = pair.network, state = pair.state, webSocket = pair.webSocket, fileIo = files.fileIo, webview = files.webview, sdk = files.sdk, context = files.context
export const util = { ...files.util, ...pair.util, generateRandomUUID: files.util.generateRandomUUID }
/** Default export matches the native JavaScript @ohos.util module, while Kit substitutes retain their named export. */
export default util
export const deviceInfo = { sdkApiVersion: 26 }
export const cryptoFramework = { ...pair.cryptoFramework, createMd(name) { return { ...pair.cryptoFramework.createMd(name), ...files.cryptoFramework.createMd(name) } } }
export function resetProductSdk() { pair.reset(); files.resetSdk() }
