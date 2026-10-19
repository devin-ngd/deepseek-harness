/** Copy only app source/build descriptors into one unsigned INTERNET-only compile target. No signing/install or emulator mapping. */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const source = resolve('harmony'), target = resolve('.build/native-offline-product-project'); await mkdir(target, { recursive: true })
for (const directory of ['AppScope', 'entry/src', 'hvigor']) await cp(join(source, directory), join(target, directory), { recursive: true, dereference: false })
for (const file of ['platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5']) { await mkdir(resolve(target, file, '..'), { recursive: true }); await writeFile(join(target, file), await readFile(join(source, file))) }
const path = join(target, 'AppScope/app.json5'), app = JSON.parse(await readFile(path, 'utf8')); app.app.bundleName = 'local.dsh.mobile.offlineproduct'; await writeFile(path, JSON.stringify(app, null, 2) + '\n'); console.log('PASS: one isolated default-disabled unsigned product compile target')
