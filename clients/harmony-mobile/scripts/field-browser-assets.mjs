/** Package the exact ETS-owned browser document and current endpoint timer projection; no key, profile or service activation. */
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

/** @param stage - explicit successor candidate directory. @param rendererBuildPath - verified source hash report for the selected renderer generation. @returns after writing unchanged renderer bytes, exact native HTML and public endpoint limits with source hashes. */
export async function packageFieldBrowserAssets(stage, rendererBuildPath = 'evidence/phase42-core-build.json') {
  await import('./product-native-substitute.mjs')
  const { NativeProductRichOwner, sdk, context } = await import('../tests/helpers/product-native-harness.mjs')
  const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
  const utils = resolve('.build/endpoint-timers-utils.mjs'); await esbuild.build({ entryPoints: [resolve('standalone-relay/src/endpoint-timers.ts')], outfile: utils, bundle: true, platform: 'node', format: 'esm', target: 'node22' })
  const { relayEndpointTimers } = await import(pathToFileURL(utils).href), desktopText = await readFile('replay-profile/field.enabled.example.json', 'utf8'), phoneText = await readFile('product.config.json', 'utf8'), desktop = JSON.parse(desktopText), phone = JSON.parse(phoneText)
  const asset = await readFile('harmony/entry/src/main/resources/rawfile/product-rich-document.js'), policy = JSON.stringify(phone.core), owner = new NativeProductRichOwner({ richRequest: async () => { throw new Error('asset builder cannot dispatch') }, richRefusal: () => { throw new Error('asset builder has no request') } }, policy)
  const rendererBuild = JSON.parse(await readFile(rendererBuildPath, 'utf8')).reports.find(row => row.platform === 'browser')
  if (createHash('sha256').update(asset).digest('hex') !== rendererBuild.sha256) throw new Error('renderer bytes differ from declared build')
  for (const [path, expected] of Object.entries(rendererBuild.sourceHashes)) if (createHash('sha256').update(await readFile(resolve(path))).digest('hex') !== expected) throw new Error('renderer source changed: ' + path)
  sdk.resources.set('product-rich-document.js', asset)
  let html; const previousCapability = globalThis.canIUse
  globalThis.canIUse = () => true
  try { owner.initialize(context()); owner.attached(); html = owner.controller.html; if (!html.startsWith('<!doctype html>') || !html.includes('id="rich-frame"')) throw new Error('native document unavailable') } finally { await owner.close(); if (previousCapability === undefined) delete globalThis.canIUse; else globalThis.canIUse = previousCapability }
  const hash = bytes => createHash('sha256').update(bytes).digest('hex'), files = [
    ['product-rich-document.html', Buffer.from(html)], ['product-rich-document.js', asset], ['phone.config.json', Buffer.from(phoneText)], ['field-desktop.config.json', Buffer.from(desktopText)],
    ['relay-endpoint-timers.json', Buffer.from(JSON.stringify(relayEndpointTimers(desktop, phone), null, 2) + '\n')],
  ], outputs = []
  for (const [path, bytes] of files) { await writeFile(join(stage, path), bytes); outputs.push({ path, bytes: bytes.length, sha256: hash(bytes) }) }
  const sources = []
  for (const path of ['harmony/entry/src/main/ets/product/NativeProductRichOwner.ets', 'harmony/entry/src/main/ets/generated/NativeAssetIndex.ets', 'harmony/entry/src/main/resources/rawfile/product-rich-document.js', 'src/product-rich-document.ts', 'src/rich-renderer.ts', 'product.config.json', 'replay-profile/field.enabled.example.json', 'standalone-relay/src/endpoint-timers.ts']) sources.push({ path, sha256: hash(await readFile(path)) })
  sources.push({ path: join(root, 'packages/experimental/rich-inline/src/client/guest-sdk.ts'), sha256: hash(await readFile(join(root, 'packages/experimental/rich-inline/src/client/guest-sdk.ts'))) })
  await writeFile(join(stage, 'browser-assets.json'), JSON.stringify({ schema: 'harmony-original-field-browser-assets/1', rendererBuildPath, htmlFromActualEtsOwner: true, kitExecution: 'explicit build-time SDK substitutes', htmlOrSdkRewritten: false, rendererSourceInputsVerified: Object.keys(rendererBuild.sourceHashes).length, outputs, sources }, null, 2) + '\n')
}
