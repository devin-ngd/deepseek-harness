/** Build shared native owners and the existing scoped renderer from source; no device, model, key or network is activated. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { projectionTsconfig } from './projection-source.mjs'
const reportOption = process.argv.slice(2).filter(value => value.startsWith('--report='))
if (reportOption.length > 1) throw new Error('Select one report filename')
const reportName = reportOption.length === 0 ? process.argv.includes('--first-use-wiring') ? 'phase42-core-build.json' : 'product-core-build.json' : reportOption[0].slice('--report='.length)
if (!/^[a-z0-9-]+\.json$/.test(reportName)) throw new Error('Invalid local report filename')
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] })), tsconfig = await projectionTsconfig(resolve('.'), root)
const entries = [['src/native-product-facade.ts', 'harmony/entry/src/main/ets/product/ProductCore.js', 'neutral'], ['src/native-paired-bridge.ts', 'harmony/entry/src/main/ets/paired/PairedCore.js', 'neutral'], ['src/product-rich-document.ts', 'harmony/entry/src/main/resources/rawfile/product-rich-document.js', 'browser'], ['src/workspace-document.ts', 'harmony/entry/src/main/resources/rawfile/workspace-document.js', 'browser'], ['src/workspace-rich-document.ts', 'harmony/entry/src/main/resources/rawfile/workspace-rich-document.js', 'browser']], reports = []
for (const [entry, output, platform] of entries) {
  await mkdir(resolve(output, '..'), { recursive: true })
  const built = await esbuild.build({
    entryPoints: [resolve(entry)], outfile: resolve(output), bundle: true, platform,
    format: output.endsWith('workspace-document.js') ? 'iife' : 'esm', target: 'es2022',
    external: platform === 'neutral' ? ['@ohos.util', '@ohos.url'] : [],
    inject: platform === 'neutral' ? [resolve('src/native-protocol-shims.mjs')] : [],
    tsconfig, metafile: true,
  })
  const imports = Object.values(built.metafile.outputs).flatMap(value => value.imports)
  if (imports.some(value => !['@ohos.util', '@ohos.url'].includes(value.path))) throw new Error('unexpected product runtime import')
  const sourceHashes = {}
  for (const path of Object.keys(built.metafile.inputs)) sourceHashes[path] = createHash('sha256').update(await readFile(resolve(path))).digest('hex')
  let bytes = await readFile(output)
  if (entry === 'src/workspace-document.ts' || entry === 'src/workspace-rich-document.ts') {
    bytes = Buffer.from(bytes.toString('utf8').replace(/^[ \t]+$/gm, ''))
    await writeFile(output, bytes)
  }
  reports.push({ entry, output, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sourceHashes, platform, externalImports: imports.map(value => value.path) })
}
const config = JSON.parse(await readFile('product.config.json', 'utf8')); if (config.enabled !== false || config.core.enabled !== false || config.deviceApiVerified !== 0 || config.approvedHost !== '' || config.identityAlias !== '') throw new Error('source product remains default-disabled')
await writeFile('harmony/entry/src/main/ets/product/ProductConfiguration.ets', "/** Generated from default-disabled product.config.json; no actual device API or real trust is inferred. */\nimport { NativeProductConfiguration } from './NativeProductOwner'\nexport const productConfiguration: NativeProductConfiguration = " + JSON.stringify({ ...config, corePolicyJson: JSON.stringify(config.core), core: undefined }, null, 2) + '\n')
const assets = reports.filter(value => value.platform === 'browser'), path = 'harmony/entry/src/main/ets/generated/NativeAssetIndex.ets', text = await readFile(path, 'utf8')
const rows = assets.map(asset => { const name = asset.output.split('/').at(-1); return { name, line: `  new NativeAssetEntry('${name}', ${asset.bytes}, '${asset.sha256}'),` } })
const clean = text.split(/\r?\n/).filter(line => !rows.some(row => line.includes("'" + row.name + "'"))).join('\n'); await writeFile(path, clean.replace(/\n\]\s*$/, '\n' + rows.map(row => row.line).join('\n') + '\n]\n'))
await writeFile('evidence/' + reportName, JSON.stringify({ reports, generatedNativeConfig: 'harmony/entry/src/main/ets/product/ProductConfiguration.ets', defaultDisabled: true, nativeOrWebExecuted: false }, null, 2) + '\n'); console.log('PASS: shared product/paired native modules and scoped rich document built from source')
