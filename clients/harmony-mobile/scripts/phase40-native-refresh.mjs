/** Refresh only the owned compile target after source repairs; no signing, network permission or install changes. */
import { cp } from 'node:fs/promises'
const files = ['native/NativeRelaySocket.ets', 'native/NativePairedConnectionOwner.ets', 'native/NativeTransientAgreement.ets', 'native/NativeLifecycle.ets', 'paired/PairedCore.js', 'paired/PairedCore.d.ts']
for (const file of files) await cp('harmony/entry/src/main/ets/' + file, '.build/native-paired-product-project/entry/src/main/ets/' + file)
console.log('PASS: repaired native/shared sources refreshed in isolated compile project')
