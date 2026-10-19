/** Owned project/template preparation only. Never writes installed profiles, signing/secret config or server files. */
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
for (const [file, previous, next] of [['integration/phase34-device-auth.spec.ts', '../evidence/phase34-auth-gateway.json', '../evidence/phase36-auth-gateway.json'], ['integration/phase35-crypto.spec.ts', '../evidence/phase35-crypto-scope.json', '../evidence/phase36-crypto-scope.json']]) {
  const text = await readFile(file, 'utf8'); if (!text.includes(previous)) throw new Error('Expected old evidence path missing'); await writeFile(file, text.replace(previous, next))
}
const strings = 'harmony/entry/src/main/resources/base/element/string.json'
const before = '.build/phase36-before/' + strings
await mkdir(resolve(before, '..'), { recursive: true }); await cp(strings, before, { force: false, errorOnExist: true })
const values = { pairing_preview_title: '配对指纹确认预览', pairing_preview_notice: '仅合成预览；不配对、不生成密钥或授予权限。', pairing_desktop_fingerprint: '电脑身份指纹（请完整比对）', pairing_phone_fingerprint: '手机身份指纹（请完整比对）', pairing_scope: '电脑：%s\n配置：%s\n设备：%s\n会话：%s\n操作：%s\n授权时长（毫秒）：%s', pairing_deadline: '本次确认到期时间戳：%s', pairing_compared: '我已在两台设备上完整比对双方身份指纹', pairing_deny: '拒绝', pairing_confirm: '确认本次合成预览', pairing_preview_finished: '本次预览已关闭，未授予任何真实权限。' }
const resource = JSON.parse(await readFile(strings, 'utf8')); resource.string.push(...Object.entries(values).map(([name, value]) => ({ name, value }))); await writeFile(strings, JSON.stringify(resource, null, 2) + '\n')
const source = resolve('harmony'), target = resolve('.build/native-pairing-project')
if (!target.startsWith(resolve('.build') + '\\')) throw new Error('Compile directory escaped')
await mkdir(target)
for (const directory of ['AppScope', 'entry/src', 'hvigor']) await cp(join(source, directory), join(target, directory), { recursive: true, dereference: false, force: false, errorOnExist: true })
for (const file of ['platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5']) { await mkdir(resolve(target, file, '..'), { recursive: true }); await writeFile(join(target, file), await readFile(join(source, file))) }
const appPath = join(target, 'AppScope/app.json5'), app = JSON.parse(await readFile(appPath, 'utf8')); app.app.bundleName = 'local.dsh.mobile.pairingcheck'; await writeFile(appPath, JSON.stringify(app, null, 2) + '\n')
const entry = join(target, 'entry/src/main/ets/entryability/EntryAbility.ets'); await writeFile(entry, "import '../native/NativeRelaySocket'\n" + (await readFile(entry, 'utf8')).replace("'pages/Index'", "'pages/PairingPreview'"))
await writeFile(join(target, 'entry/src/main/resources/base/profile/main_pages.json'), JSON.stringify({ src: ['pages/Index', 'pages/PairingPreview'] }, null, 2) + '\n')
console.log('PASS: separate permission-free unsigned pairing/native WSS compile project; no invocation/signing/install')
