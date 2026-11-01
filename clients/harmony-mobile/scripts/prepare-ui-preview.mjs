/** Copy `harmony/` into an isolated unsigned compile directory: `check` keeps the native owner, `preview` swaps in the synthetic UI-preview owner with versionCode 2 so a separately signed copy can replace an installed rc2 build in place. Never signs, installs or connects. */
import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const client = resolve(import.meta.dirname, '..'), source = join(client, 'harmony'), mode = process.argv[2]
if (mode !== 'check' && mode !== 'preview') throw new Error('Select check (native owner) or preview (synthetic owner).')
const name = 'native-controls-ui' + mode, target = join(client, '.build', name)
for (const directory of ['AppScope', 'entry/src', 'hvigor']) await rm(join(target, directory), { recursive: true, force: true })
for (const directory of ['AppScope', 'entry/src', 'hvigor']) await cp(join(source, directory), join(target, directory), { recursive: true })
for (const file of ['platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5']) {
  await mkdir(join(target, file, '..'), { recursive: true })
  await copyFile(join(source, file), join(target, file))
}
const profile = JSON.parse(await readFile(join(target, 'build-profile.json5'), 'utf8'))
if (profile.app.signingConfigs.length !== 0) throw new Error('Unsigned source required')
const appPath = join(target, 'AppScope/app.json5'), app = JSON.parse(await readFile(appPath, 'utf8'))
app.app.bundleName = 'local.dsh.mobile.offlineproduct'
if (mode === 'preview') Object.assign(app.app, { versionName: '0.0.0-ui-preview', versionCode: 2 })
await writeFile(appPath, JSON.stringify(app, null, 2) + '\n')
if (mode === 'preview') await copyFile(join(client, 'scripts/ui-preview/PreviewProductOwner.ets'), join(target, 'entry/src/main/ets/product/NativeProductOwner.ets'))
console.log(JSON.stringify({ target, argument: '--project=.build/' + name, owner: mode === 'preview' ? 'synthetic' : 'native', signing: false, installation: false }))
