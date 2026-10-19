/** Prepare a separate permission-free unsigned API26 compile target. It imports native owners without constructing keys, a provider or a connection. */
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises'
import { resolve, join, sep } from 'node:path'
const source = resolve('harmony'), target = resolve('.build/native-pairing-flow-project')
if (!target.startsWith(resolve('.build') + sep)) throw new Error('Compile directory escaped')
await mkdir(target)
for (const directory of ['AppScope', 'entry/src', 'hvigor']) await cp(join(source, directory), join(target, directory), { recursive: true, dereference: false, force: false, errorOnExist: true })
for (const file of ['platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5']) { await mkdir(resolve(target, file, '..'), { recursive: true }); await writeFile(join(target, file), await readFile(join(source, file))) }
const appPath = join(target, 'AppScope/app.json5'), app = JSON.parse(await readFile(appPath, 'utf8')); app.app.bundleName = 'local.dsh.mobile.pairingflowcheck'; await writeFile(appPath, JSON.stringify(app, null, 2) + '\n')
const entry = join(target, 'entry/src/main/ets/entryability/EntryAbility.ets'); await writeFile(entry, "import '../native/NativeRelaySocket'\nimport '../native/NativeExistingIdentitySigner'\nimport '../native/NativePairingPresenter'\n" + (await readFile(entry, 'utf8')).replace("'pages/Index'", "'pages/PairingPreview'"))
await writeFile(join(target, 'entry/src/main/resources/base/profile/main_pages.json'), JSON.stringify({ src: ['pages/Index', 'pages/PairingPreview'] }, null, 2) + '\n')
console.log('PASS: separate unsigned permission-free first-pairing owner compile target; no key invocation/signing/install')
