/** Copy only owned app sources into an exclusive permission-free compile project; never install, sign, launch or alter the original app entry. */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const source = resolve('harmony'), target = resolve('.build/native-crypto-project'), parent = resolve('.build') + '\\'
if (!target.startsWith(parent)) throw new Error('Compile project escaped task build directory')
await mkdir(target)
for (const directory of ['AppScope', 'entry/src', 'hvigor']) await cp(join(source, directory), join(target, directory), { recursive: true, dereference: false, errorOnExist: true, force: false })
for (const file of ['platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5']) {
  await mkdir(resolve(target, file, '..'), { recursive: true }); await writeFile(join(target, file), await readFile(join(source, file)))
}
const appPath = join(target, 'AppScope/app.json5'), app = JSON.parse(await readFile(appPath, 'utf8')); app.app.bundleName = 'local.dsh.mobile.cryptocheck'; await writeFile(appPath, JSON.stringify(app, null, 2) + '\n')
const entry = join(target, 'entry/src/main/ets/entryability/EntryAbility.ets')
await writeFile(entry, "import '../native/NativeDeviceKeys'\nimport '../native/NativeCryptoPrimitives'\nimport '../native/NativeTransientAgreement'\n" + await readFile(entry, 'utf8'))
console.log(JSON.stringify({ project: target, network: false, signing: false, nativeKeyInvocation: false, originalEntryUnmodified: true }))
