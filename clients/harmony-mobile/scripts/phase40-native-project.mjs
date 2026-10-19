/** Separate permission-free unsigned compile target; native connection owners import shared JS but no keys/connections are constructed. */
import { cp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const source = resolve('harmony'), target = resolve('.build/native-paired-product-project'); await mkdir(target)
for (const directory of ['AppScope', 'entry/src', 'hvigor']) await cp(join(source, directory), join(target, directory), { recursive: true, dereference: false, force: false, errorOnExist: true })
for (const file of ['platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5']) { await mkdir(resolve(target, file, '..'), { recursive: true }); await writeFile(join(target, file), await readFile(join(source, file))) }
const appPath = join(target, 'AppScope/app.json5'), app = JSON.parse(await readFile(appPath, 'utf8')); app.app.bundleName = 'local.dsh.mobile.pairedproductcheck'; await writeFile(appPath, JSON.stringify(app, null, 2) + '\n')
const entry = join(target, 'entry/src/main/ets/entryability/EntryAbility.ets'); await writeFile(entry, "import '../native/NativePairedConnectionOwner'\n" + await readFile(entry, 'utf8')); console.log('PASS: isolated unsigned permission-free product connection compile project')
