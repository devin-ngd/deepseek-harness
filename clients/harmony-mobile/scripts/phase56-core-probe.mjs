/** Observe sealed core parsing with SDK substitutes; only stage, generated-code counts and public digests leave memory. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
const marker = JSON.parse(await readFile('.build/phase54-active.json', 'utf8')), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
await esbuild.build({ entryPoints: [resolve('.build/native-enrollment-diagnostics-project/entry/src/main/ets/product/ProductCore.js')], outfile: resolve('.build/phase56-sealed-core-probe.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'es2022', alias: { '@kit.ArkTS': resolve('tests/helpers/product-native-sdk.mjs') } })
const { NativeProductFacade } = await import('../.build/phase56-sealed-core-probe.mjs'), configuration = JSON.parse(await readFile('product.config.json', 'utf8')), raw = await readFile(join(marker.world, 'fixed-world/exchange/run-pgizRK/desktop-offer.json'), 'utf8'), offer = JSON.parse(raw), stages = [], OriginalFunction = globalThis.Function
let current = 'construct', calls = [], generated = []
globalThis.Function = new Proxy(OriginalFunction, { construct(target, args) { calls.push({ stage: current, parameterCount: args.length - 1, bodyBytes: Buffer.byteLength(args.at(-1)), bodySha256: createHash('sha256').update(args.at(-1)).digest('hex') }); generated.push('function probe(' + args.slice(0, -1).join(',') + ') {\n' + args.at(-1) + '\n}\n'); return Reflect.construct(target, args) } })
try {
  const facade = new NativeProductFacade({}, JSON.stringify(configuration.core), { storage: {}, scheduler: {}, clock: Date.now }, () => {})
  current = 'valid-offer'; const parsed = JSON.parse(facade.firstUseInput(raw, offer.ticket.expiresAt - 1)); stages.push({ stage: current, result: 'parsed', canonicalBytes: parsed.desktopBytes.length, canonicalSha256: createHash('sha256').update(Buffer.from(parsed.desktopBytes)).digest('hex') })
  current = 'empty-object'; assert.throws(() => facade.firstUseInput('{}', offer.ticket.expiresAt - 1), error => { stages.push({ stage: current, result: error.name }); return error.name === 'ZodError' })
} finally { globalThis.Function = OriginalFunction }
await mkdir('.build/phase56-generated-validation', { recursive: true }); const compiler = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/ets/build-tools/ets-loader/bin/ark/build-win/bin/es2abc.exe', generatedSyntax = []
for (const [index, source] of generated.entries()) { const path = resolve('.build/phase56-generated-validation/' + index + '.js'); await writeFile(path, source); const result = spawnSync(compiler, ['--parse-only', '--extension=js', path], { windowsHide: true, encoding: 'utf8', timeout: 15000, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH } }); generatedSyntax.push({ stage: calls[index].stage, sourceSha256: calls[index].bodySha256, officialParseOnlyExitCode: result.status, syntaxError: /SyntaxError/.test(result.stdout + result.stderr) }) }
const report = { at: new Date().toISOString(), exactSealedGeneratedCore: true, sdkSubstitutes: true, nativeExecution: false, clock: 'one millisecond before recorded public challenge expiry; offline only', stages, dynamicCodeGeneration: calls, generatedSyntax, currentNativeRefusal: { stage: 'parse-offer', category: 'SyntaxError', alsoWithSyntacticallyValidEmptyObject: true }, nativeRootCauseProven: false }
await writeFile('evidence/phase56-core-probe.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))
