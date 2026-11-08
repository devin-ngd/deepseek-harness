/** Stage a no-Host native/Web input comparison inside the already authorized isolated emulator application. */
import assert from 'node:assert/strict'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
const source = resolve('harmony'), target = resolve('.build/native-controls-keyboard-web-control')
const defaults = process.argv[2] === '--default-render-settings'
assert.ok(process.argv.length === 2 || defaults && process.argv.length === 3)
for (const directory of ['AppScope', 'entry/src', 'hvigor']) await cp(join(source, directory), join(target, directory), { recursive: true, dereference: false })
for (const file of ['platform.json', 'build-profile.json5', 'hvigorfile.ts', 'oh-package.json5', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'entry/oh-package.json5']) {
  await mkdir(resolve(target, file, '..'), { recursive: true }); await writeFile(join(target, file), await readFile(join(source, file)))
}
const app = JSON.parse(await readFile(join(target, 'AppScope/app.json5'), 'utf8')); app.app.bundleName = 'local.dsh.mobile.workspacecheck'
await writeFile(join(target, 'AppScope/app.json5'), JSON.stringify(app, null, 2) + '\n')
const ets = join(target, 'entry/src/main/ets'); await mkdir(join(ets, 'fixture'), { recursive: true })
let page = await readFile('integration/native/KeyboardControl.ets', 'utf8')
if (defaults) for (const line of ['    webview.WebviewController.setRenderProcessMode(webview.RenderProcessMode.MULTIPLE)\n', '    webview.WebviewController.setWebDestroyMode(webview.WebDestroyMode.FAST_MODE)\n']) {
  assert.equal(page.split(line).length, 2); page = page.replace(line, '')
}
await writeFile(join(ets, 'fixture/KeyboardControl.ets'), page)
const ability = join(ets, 'entryability/EntryAbility.ets'), original = await readFile(ability, 'utf8')
assert.equal(original.split("stage.loadContent('pages/Index'").length, 2)
await writeFile(ability, original.replace("stage.loadContent('pages/Index'", "stage.loadContent('fixture/KeyboardControl'"))
await writeFile(join(target, 'entry/src/main/resources/base/profile/main_pages.json'), JSON.stringify({ src: ['pages/Index', 'fixture/KeyboardControl'] }) + '\n')
const html = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; connect-src \'none\'"><style>body{font:18px sans-serif;padding:20px}input,textarea{display:block;box-sizing:border-box;width:100%;font:inherit;margin:20px 0;padding:14px}</style><h2>Plain ArkWeb input</h2><label>Web baseline<input aria-label="Web baseline" maxlength="128"></label><label>Web second field<textarea aria-label="Web second field" maxlength="128"></textarea></label><output id="state">No input</output><script>document.addEventListener("focusin",e=>console.info("FOCUS "+e.target.getAttribute("aria-label")));document.addEventListener("input",e=>document.getElementById("state").textContent=e.target.value)</script>\n'
await writeFile(join(target, 'entry/src/main/resources/rawfile/keyboard-control.html'), html)
const path = join(ets, 'generated/NativeAssetIndex.ets'), index = await readFile(path, 'utf8'); assert.ok(index.endsWith(']\n'))
await writeFile(path, index.slice(0, -2) + `  new NativeAssetEntry('keyboard-control.html', ${Buffer.byteLength(html)}, '${createHash('sha256').update(html).digest('hex')}'),\n]\n`)
const report = { target, bundleName: app.app.bundleName, backendStarted: false, realModels: 0, portMapping: false, localRawfileOnly: true, renderSettings: defaults ? 'default' : 'multiple-fast', productionEntryUnchanged: true }
await writeFile('evidence/workspace-keyboard-web-control-project.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
