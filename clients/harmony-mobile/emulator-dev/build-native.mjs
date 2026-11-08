/** Rebuild the emulator's existing native candidate from the shared product entry. */
import { readFile, writeFile, mkdir, copyFile, cp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

const client = resolve(import.meta.dirname, '..')
const native = join(client, '.build/native-controls-emulator-local')
const directory = join(client, '.build/emulator-stability')
await mkdir(directory, { recursive: true })
const built = spawnSync(process.execPath, [join(client, 'scripts/build-product-core.mjs'), '--report=emulator-shared-core-build.json'], { cwd: client, stdio: 'inherit', windowsHide: true })
if (built.error !== undefined) throw built.error
assert.equal(built.status, 0, 'Shared product build failed')
const sharedEntry = join(client, 'harmony/entry/src/main')
const emulatorEntry = join(native, 'entry/src/main')
const source = join(sharedEntry, 'ets/product/ProductCore.js')
const output = join(emulatorEntry, 'ets/product/ProductCore.js')
const configPath = join(emulatorEntry, 'ets/product/ProductConfiguration.ets')
const current = await readFile(configPath, 'utf8'), declaration = current.indexOf('export const productConfiguration:')
assert.ok(declaration > 0)
const start = current.indexOf('{', declaration)
assert.ok(start > 0)
const config = JSON.parse(current.slice(start)), previousPolicy = JSON.parse(config.corePolicyJson)
const app = JSON.parse(await readFile(join(native, 'AppScope/app.json5'), 'utf8'))
assert.equal(app.app.bundleName, 'local.dsh.mobile.offlineproduct')
assert.equal(config.deviceBindingMode, true)
await readFile(join(emulatorEntry, 'resources/rawfile/emulator-ca.pem'))
await cp(join(sharedEntry, 'ets'), join(emulatorEntry, 'ets'), { recursive: true, filter: path => !path.endsWith('ProductConfiguration.ets') })
for (const file of ['resources/base/element/string.json', 'resources/rawfile/product-rich-document.js', 'resources/rawfile/workspace-document.js', 'resources/rawfile/workspace-rich-document.js']) await copyFile(join(sharedEntry, file), join(emulatorEntry, file))
const relaySource = await readFile(join(sharedEntry, 'ets/native/NativeRelaySocket.ets'), 'utf8')
assert.equal(relaySource.match(/skipServerCertVerification: false/g).length, 2)
const relayUrl = "'wss://' + this.policy.expectedHost + path"
assert.ok(relaySource.includes(relayUrl))
await writeFile(join(emulatorEntry, 'ets/native/NativeRelaySocket.ets'), "import { EmulatorLocalTrust } from './EmulatorLocalTrust'\n" + relaySource.replaceAll('skipServerCertVerification: false', 'skipServerCertVerification: false, caPath: EmulatorLocalTrust.caPath').replace(relayUrl, "'wss://localhost:18081' + path"))
const owner = join(emulatorEntry, 'ets/product/NativeDeviceProductOwner.ets')
const ownerSource = await readFile(owner, 'utf8')
const ownerStart = 'this.filesDir = context.filesDir; await this.start('
assert.equal(ownerSource.split(ownerStart).length, 2)
await writeFile(owner, "import { EmulatorLocalTrust } from '../native/EmulatorLocalTrust'\nimport { fileIo } from '@kit.CoreFileKit'\n" + ownerSource.replace(ownerStart, "this.filesDir = context.filesDir; EmulatorLocalTrust.caPath = context.filesDir + '/emulator-ca.pem'; const ca = await context.resourceManager.getRawFileContent('emulator-ca.pem'); const caFile = fileIo.openSync(context.filesDir + '/emulator-ca.pem', fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC | fileIo.OpenMode.WRITE_ONLY); try { fileIo.writeSync(caFile.fd, ca.buffer) } finally { fileIo.closeSync(caFile) }; await this.start("))
const shared = JSON.parse(await readFile(join(client, 'product.config.json'), 'utf8'))
const policy = { ...shared.core, enabled: previousPolicy.enabled, commandPrefix: previousPolicy.commandPrefix }
config.maxCryptoBytes = shared.maxCryptoBytes
config.maxTotalSendBytes = shared.maxTotalSendBytes
config.publicTrustMaxBytes = shared.publicTrustMaxBytes
config.relay = { ...shared.relay, maxProofs: config.relay.maxProofs, e2e: { ...shared.relay.e2e, maxFrames: config.relay.e2e.maxFrames } }
config.corePolicyJson = JSON.stringify(policy)
await writeFile(configPath, current.slice(0, start) + JSON.stringify(config, null, 2) + '\n')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
await writeFile(join(directory, 'shared-native-build.json'), JSON.stringify({ at: new Date().toISOString(), sharedBuildEvidence: 'evidence/emulator-shared-core-build.json', source, output, sha256: sha(await readFile(output)), follow: policy.core.follow, maxCryptoBytes: config.maxCryptoBytes, relay: config.relay, transport: policy.transport, domain: policy.domain, nativeProject: native }, null, 2) + '\n')
console.log('Shared product core built for the existing emulator candidate; pairing and app data unchanged')
