/** Materialize unsigned metadata in the supplied native directory or ./harmony after installed SDK/tool versions are recorded. Installs nothing. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(process.argv[2] ?? 'harmony')
const platform = JSON.parse(await readFile(resolve(root, 'platform.json'), 'utf8'))
const fields = ['compileSdkVersion', 'targetSdkVersion', 'compatibleSdkVersion', 'hvigorVersion', 'ohosPluginVersion']
if (!platform.installedToolchainConfirmed || fields.some(key => typeof platform[key] !== 'string' || platform[key].length === 0)) {
  throw new Error('Native build disabled: record approved installed SDK/Hvigor versions in harmony/platform.json first. No tools or credentials were created.')
}
await mkdir(resolve(root, 'hvigor'), { recursive: true })
await writeFile(resolve(root, 'build-profile.json5'), JSON.stringify({
  app: { signingConfigs: [], products: [{ name: 'default', compileSdkVersion: platform.compileSdkVersion,
    targetSdkVersion: platform.targetSdkVersion, compatibleSdkVersion: platform.compatibleSdkVersion, runtimeOS: 'HarmonyOS' }],
  buildModeSet: [{ name: 'debug' }, { name: 'release' }] },
  modules: [{ name: 'entry', srcPath: './entry', targets: [{ name: 'default', applyToProducts: ['default'] }] }],
}, null, 2) + '\n')
await writeFile(resolve(root, 'oh-package.json5'), JSON.stringify({
  modelVersion: '5.0.0', name: 'dsh-mobile-lab', version: '0.0.0', dependencies: {},
  devDependencies: { '@ohos/hvigor': platform.hvigorVersion, '@ohos/hvigor-ohos-plugin': platform.ohosPluginVersion },
}, null, 2) + '\n')
console.log('Unsigned metadata prepared. No build, dependency installation, signing or device installation was performed.')
