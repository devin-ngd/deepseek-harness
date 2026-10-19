/** Update only the closed alpha4 control reader and connection precondition; all canonical service/binding owners remain in their original runtime. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, cp, readdir, lstat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { projectionTsconfig } from './projection-source.mjs'
const project = resolve('.'), sourceRoot = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(sourceRoot, 'package.json')), ts = require('typescript'), esbuild = require(require.resolve('esbuild', { paths: [join(sourceRoot, 'node_modules/.pnpm')] })), hash = bytes => createHash('sha256').update(bytes).digest('hex')
const previous = resolve('.build/phase75.1-desktop-candidate'), target = resolve('.build/phase76-desktop-candidate'), rows = JSON.parse(await readFile(join(previous, 'files.sha256.json'), 'utf8'))
assert.equal(hash(await readFile(join(previous, 'files.sha256.json'))), '70631ae8c0eb85ad5c5e47a5fe93208d1bee72e9d7f9051efafc795fcabe34a0')
for (const row of rows) assert.equal(hash(await readFile(join(previous, row.file))), row.sha256)
const refresh = process.argv.includes('--refresh-owned')
if (refresh) { const own = JSON.parse(await readFile(join(target, 'files.sha256.json'), 'utf8')); for (const row of own) assert.equal(hash(await readFile(join(target, row.file))), row.sha256) }
else if (process.argv.includes('--resume-clean-copy')) { for (const row of rows) assert.equal(hash(await readFile(join(target, row.file))), row.sha256) }
else { await mkdir(target); await cp(previous, target, { recursive: true, force: false, filter: path => path !== join(previous, 'files.sha256.json') }) }
const lib = 'runtime/node_modules/@local/dsh-harmony-replay/lib/', path = join(target, lib, 'index.js'), old = await readFile(join(previous, lib, 'index.js'), 'utf8'), tree = ts.createSourceFile(path, old, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS), edits = [], counts = { controller: 0, endpoint: 0, encrypted: 0, config: 0, observer: 0 }, classes = {}
for (const [name, file] of [['RelayControlClient', 'src/relay-control-client.ts'], ['PairedRelayEndpoint', 'src/paired-relay.ts'], ['EncryptedRelayConnection', 'integration/e2e-socket.ts']]) { const result = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, useDefineForClassFields: true } }), parsed = ts.createSourceFile(file, result.outputText, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS), declaration = parsed.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === name); assert.ok(declaration); classes[name] = declaration.getText(parsed).replace(/^export\s+/, '') }
for (const file of ['src/e2e-channel.ts', 'src/e2e-error.ts', 'integration/connection-lifetime.ts', 'src/relay-control-protocol.ts', 'src/signing-bytes.ts']) assert.equal(hash(await readFile(file)), hash(await readFile(join('.build/phase69-review-candidate/source', file))))
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) { const replacements = { ...classes, fieldConfigSchema: 'Phase76FieldConfigSchema' }, keys = { RelayControlClient: 'controller', PairedRelayEndpoint: 'endpoint', EncryptedRelayConnection: 'encrypted', fieldConfigSchema: 'config' }; if (Object.hasOwn(replacements, node.name.text)) { edits.push({ start: node.initializer.getStart(tree), end: node.initializer.end, text: replacements[node.name.text] }); counts[keys[node.name.text]]++ } }
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'PairedRelayEndpoint') { assert.equal(node.arguments.length, 7); edits.push({ start: node.end - 1, end: node.end - 1, text: ', undefined, (stage) => console.info("DSH_CONTROL_STAGE=desktop-" + stage + " at=" + ports.clock())' }); counts.observer++ }
  ts.forEachChild(node, visit)
}
visit(tree); assert.deepEqual(counts, { controller: 1, endpoint: 1, encrypted: 1, config: 1, observer: 1 })
let text = old
for (const edit of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end)
const imports = 'import { verifyPublicTrustHistory, GrantDeadline } from "./history-verification.mjs";', replacement = 'import { verifyPublicTrustHistory, GrantDeadline, fieldConfigSchema as Phase76FieldConfigSchema, consumePhoneConnectReady } from "./history-verification.mjs";'
assert.equal(text.split(imports).length, 2); text = text.replace(imports, replacement)
const install = 'firstUse.install(authority);'; assert.equal(text.split(install).length, 2)
text = text.replace(install, 'if (config2.connectReady === void 0) throw new Error("native phone readiness is required before desktop connection");\n        await consumePhoneConnectReady(config2.connectReady, artifacts.phone, artifacts.publicDocument, Date.now);\n        ' + install)
const prompt = 'Relay public pins must be independently imported and activated by its local operator. Approve this profile opening outbound verified WSS to '
assert.equal(text.split(prompt).length, 2); text = text.replace(prompt, 'Relay public pins must be independently imported and activated. Finish native final-record comparison and local save first; leave phone Connect ready. The one-use readiness receipt is required before the finite desktop retry budget starts. Approve outbound verified WSS to ')
await writeFile(path, text)
const built = await esbuild.build({ stdin: { contents: "export { verifyPublicTrustHistory } from './integration/public-trust-verification.ts'; export { GrantDeadline } from './replay-profile/src/grant-deadline.ts'; export { fieldConfigSchema } from './replay-profile/src/field-config.ts'; export { reviewPhoneConnectReady, consumePhoneConnectReady, phoneConnectReadySchema } from './replay-profile/src/connect-readiness.ts';", resolveDir: project }, outfile: join(target, lib, 'history-verification.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node22', tsconfig: await projectionTsconfig(project, sourceRoot), metafile: true, alias: { zod: require.resolve('zod') } })
const native = JSON.parse(await readFile('evidence/phase76-core-build.json', 'utf8')).reports.find(row => row.entry === 'src/native-paired-bridge.ts'), inputs = []
for (const file of Object.keys(built.metafile.inputs).filter(file => file !== '<stdin>').sort()) inputs.push({ file, sha256: hash(await readFile(resolve(file))) })
const matched = ['src/relay-control-client.ts', 'src/paired-relay.ts', 'integration/e2e-socket.ts', 'src/relay-control-protocol.ts', 'src/signing-bytes.ts']
for (const file of matched) { const sha256 = hash(await readFile(file)); assert.equal(sha256, native.sourceHashes[file]); if (!inputs.some(row => row.file === file)) inputs.push({ file, sha256 }) }
const changes = [lib + 'index.js', lib + 'history-verification.mjs'].map(file => ({ file, before: rows.find(row => row.file === file).sha256, after: null }))
for (const row of changes) row.after = hash(await readFile(join(target, row.file)))
await writeFile(join(target, 'control-update.json'), JSON.stringify({ previousInventory: '70631ae8c0eb85ad5c5e47a5fe93208d1bee72e9d7f9051efafc795fcabe34a0', changes, inputs, nativeMatched: matched, originalBindingOwnersRetained: true, mandatoryOneUseReadinessBeforePlugin: true, assetsChanged: false }, null, 2) + '\n', { flag: refresh ? 'w' : 'wx' })
const inventory = []
async function scan(directory) { for (const row of await readdir(directory, { withFileTypes: true })) { const file = join(directory, row.name); if (file === join(target, 'files.sha256.json')) continue; assert.equal((await lstat(file)).isSymbolicLink(), false); if (row.isDirectory()) await scan(file); else { const bytes = await readFile(file); inventory.push({ file: file.slice(target.length + 1).replaceAll('\\', '/'), bytes: bytes.length, sha256: hash(bytes) }) } } }
await scan(target); inventory.sort((a, b) => a.file.localeCompare(b.file)); const manifest = Buffer.from(JSON.stringify(inventory, null, 2) + '\n'); await writeFile(join(target, 'files.sha256.json'), manifest, { flag: refresh ? 'w' : 'wx' })
const planPath = 'operations/phase76/plan.json', plan = JSON.parse(await readFile(planPath, 'utf8')); plan.local.desktopInventorySha256 = hash(manifest); await writeFile(planPath, JSON.stringify(plan, null, 2) + '\n')
await writeFile('evidence/phase76-desktop-closure.json', JSON.stringify({ at: new Date().toISOString(), target, files: inventory.length, manifestSha256: hash(manifest), changes, inputs, nativeMatched: matched, previousFilesVerified: rows.length, realGrantCreated: false, phoneIo: false, remoteIo: false }, null, 2) + '\n', { flag: refresh ? 'w' : 'wx' }); console.log(JSON.stringify({ target, files: inventory.length, manifestSha256: hash(manifest), changes }))
