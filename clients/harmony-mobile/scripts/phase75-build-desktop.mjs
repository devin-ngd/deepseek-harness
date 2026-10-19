/** Derive a closed alpha4 desktop from the frozen app, replacing only its public-history reader; no application is launched. */
import assert from 'node:assert/strict'
import { readFile, writeFile, cp, mkdir, readdir, lstat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { projectionTsconfig } from './projection-source.mjs'
const project = resolve('.'), sourceRoot = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(sourceRoot, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(sourceRoot, 'node_modules/.pnpm')] }))
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), frozen = resolve('.build/phase69-review-candidate'), target = resolve('.build/phase75.1-desktop-candidate'), base = JSON.parse(await readFile(join(frozen, 'files.sha256.json'), 'utf8'))
for (const row of base) assert.equal(hash(await readFile(join(frozen, row.file))), row.sha256)
await mkdir(target); await cp(join(frozen, 'desktop'), target, { recursive: true, errorOnExist: true, force: false })
const lib = 'runtime/node_modules/@local/dsh-harmony-replay/lib/', entry = join(target, lib, 'index.js'), before = await readFile(entry, 'utf8')
const needle = 'if (previous3.schema === "harmony-product-public-trust/2" && !await nodeE2EPrimitives.verify(previous3.record.desktopPublicSpki, publicTrustRenewalBytes(previous3), Buffer.from(previous3.signature, "base64url"))) throw new Error("renewal previous signature denied");'
assert.equal(before.split(needle).length, 2); assert.equal(before.includes('verifyPublicTrustHistory'), false)
let updated = before.replace(needle, 'await verifyPublicTrustHistory(previous3);')
for (const [from, to] of [['let revokeGrant, cleanupPath;', 'let revokeGrant, cleanupPath, grantDeadline;'], ['if (expiresAt <= observedAt || expiresAt > observedAt + 18e5) throw new Error("committed grant lifetime denied");', 'if (expiresAt <= observedAt || expiresAt > observedAt + 18e5) throw new Error("committed grant lifetime denied");\n        grantDeadline = new GrantDeadline(expiresAt, signal, Date.now, { after(ms, callback) { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); } }); signal = grantDeadline.signal;'], ['const revocation = await Promise.allSettled([revokeGrant?.()]);', 'grantDeadline?.close();\n        const revocation = await Promise.allSettled([revokeGrant?.()]);']]) { assert.equal(updated.split(from).length, 2, from); updated = updated.replace(from, to) }
await writeFile(entry, 'import { verifyPublicTrustHistory, GrantDeadline } from "./history-verification.mjs";\n' + updated)
const built = await esbuild.build({ stdin: { contents: "export { verifyPublicTrustHistory } from './integration/public-trust-verification.ts'; export { GrantDeadline } from './replay-profile/src/grant-deadline.ts';", resolveDir: project }, outfile: join(target, lib, 'history-verification.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'node22', tsconfig: await projectionTsconfig(project, sourceRoot), metafile: true, alias: { zod: require.resolve('zod') } })
const inputs = []
for (const file of Object.keys(built.metafile.inputs).filter(file => file !== '<stdin>').sort()) inputs.push({ file: resolve(project, file), sha256: hash(await readFile(resolve(project, file))) })
const nativeBuild = JSON.parse(await readFile('evidence/phase75-core-build.json', 'utf8')).reports.find(row => row.entry === 'src/native-product-facade.ts'), shared = 'src/public-trust-protocol.ts'
const nativeDigest = Object.entries(nativeBuild.sourceHashes).find(([file]) => file.replaceAll('\\', '/').endsWith('/' + shared) || file === shared)?.[1]
assert.equal(hash(await readFile(shared)), nativeDigest)
const update = { schema: 'harmony-desktop-history-layer/1', frozenInventorySha256: hash(await readFile(join(frozen, 'files.sha256.json'))), nativeSharedProtocolSha256: nativeDigest, sourceInputs: inputs, files: [{ file: lib + 'index.js', beforeSha256: hash(before), afterSha256: hash(await readFile(entry)) }, { file: lib + 'history-verification.mjs', beforeSha256: null, afterSha256: hash(await readFile(join(target, lib, 'history-verification.mjs'))) }], rule: 'Original alpha4 dsh entry, authorization owner, replay guard and assets remain byte-identical. The old outer-only reader is replaced by the source-derived complete-history verifier; old writer encoding is retained.' }
await writeFile(join(target, 'history-update.json'), JSON.stringify(update, null, 2) + '\n', { flag: 'wx' })
const rows = []
async function scan(directory) { for (const row of await readdir(directory, { withFileTypes: true })) { const path = join(directory, row.name); assert.equal((await lstat(path)).isSymbolicLink(), false); if (row.isDirectory()) await scan(path); else { const bytes = await readFile(path); rows.push({ file: path.slice(target.length + 1).replaceAll('\\', '/'), bytes: bytes.length, sha256: hash(bytes) }) } } }
await scan(target); rows.sort((a, b) => a.file.localeCompare(b.file)); const manifest = Buffer.from(JSON.stringify(rows, null, 2) + '\n'); await writeFile(join(target, 'files.sha256.json'), manifest, { flag: 'wx' })
const planPath = 'operations/phase75/plan.json', plan = JSON.parse(await readFile(planPath, 'utf8')); plan.local.desktop = target.replaceAll('\\', '/'); plan.local.desktopInventorySha256 = hash(manifest); await writeFile(planPath, JSON.stringify(plan, null, 2) + '\n')
const report = { at: new Date().toISOString(), target, files: rows.length, manifestSha256: hash(manifest), update, originalFilesVerified: base.length, signed: false, installed: false, phoneIo: false, remoteIo: false, realGrantCreated: false }
await writeFile('evidence/phase75.1-desktop-closure.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ target, files: rows.length, manifestSha256: report.manifestSha256, changedRuntimeFiles: update.files, nativeSharedProtocolMatched: true }))
