/** Prepare an independent inactive operator package; no device, credentials, process profile, SSH or grant access. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { projectionTsconfig } from './projection-source.mjs'
const root = resolve('.'), source = join(root, 'operations/phase74'), stage = join(root, '.build/phase74-operations-work')
const hash = value => createHash('sha256').update(value).digest('hex'), json = async file => JSON.parse(await readFile(file, 'utf8'))
await mkdir(stage, { recursive: true })
for (const row of await readdir(source)) await copyFile(join(source, row), join(stage, row))
const sourceRoot = (await json('source.json')).dshRoot, require = createRequire(join(sourceRoot, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(sourceRoot, 'node_modules/.pnpm')] }))
const options = { bundle: true, format: 'esm', platform: 'node', target: 'es2022', tsconfig: await projectionTsconfig(root, sourceRoot), alias: { zod: require.resolve('zod') } }
const shared = await esbuild.build({ ...options, metafile: true, stdin: { contents: "export { parsePublicTrustDocument, canonicalPublicTrust, publicTrustRenewalBytes, successorHistory, assertPublicTrustSuccessor } from './src/public-trust-protocol.ts'; export { nodeE2EPrimitives } from './integration/p256-channel.ts'; export { p256CredentialId } from './integration/p256-public.ts'; export { pairedGrantSchema } from './src/pairing-protocol.ts';", resolveDir: root }, outfile: join(stage, 'shared.mjs') })
const sharedInputs = []; for (const file of Object.keys(shared.metafile.inputs).filter(file => file !== '<stdin>').sort()) sharedInputs.push({ file, sha256: hash(await readFile(resolve(root, file))) })
await writeFile(join(stage, 'shared-source.sha256.json'), JSON.stringify(sharedInputs, null, 2) + '\n')
await esbuild.build({ ...options, entryPoints: [join(stage, 'relay.mjs')], outfile: join(stage, 'relay-runner.mjs') })
const frozen = join(root, '.build/phase69-review-candidate'), manifest = await json(join(frozen, 'files.sha256.json')), plan = await json(join(source, 'plan.json'))
assert.equal(hash(await readFile(join(frozen, 'files.sha256.json'))), plan.local.frozenInventorySha256)
const relay = manifest.filter(row => row.file.startsWith('relay/')); assert.equal(relay.length, 40)
for (const row of relay) assert.equal(hash(await readFile(join(frozen, row.file))), row.sha256)
await writeFile(join(stage, 'relay-files.json'), JSON.stringify(relay, null, 2) + '\n')
for (const [from, to] of [['relay/public-tools/config.first-use.proposal.json', 'config.template.json'], ['relay/public-tools/relay-endpoint-timers.json', 'limits.json'], ['relay/relay.nginx.conf.proposal', 'nginx.during.conf']]) await copyFile(join(frozen, from), join(stage, to))
await copyFile('scripts/phase59-hap-payload.ps1', join(stage, 'hap-payload.ps1'))
const previousExchange = (await json('.build/phase71-exchange.json')).exchange
for (const [from, to] of [['phone-pair.json', 'historical-v2.fixture.json'], ['relay-pair.json', 'historical-relay.fixture.json']]) {
  const data = await readFile(join(previousExchange, from)); assert.ok(data.length < 32768); assert.equal(data.includes(Buffer.from('privatePkcs8')), false)
  await writeFile(join(stage, to), data)
}
await writeFile(join(stage, 'location.json'), JSON.stringify({ clientRoot: root, sourceRoot }, null, 2) + '\n')
const nginx = await readFile(join(stage, 'nginx.during.conf'), 'utf8'); assert.equal(hash(nginx), plan.relay.candidateNginxSha256)
const original = nginx.replaceAll('burst=3', 'burst=2'); assert.equal(hash(original), plan.relay.originalNginxSha256)
await writeFile(join(stage, 'nginx.before.fixture.conf'), original)
const files = []
for (const file of (await readdir(stage)).filter(file => file !== 'files.sha256.json').sort()) { const data = await readFile(join(stage, file)); files.push({ file, bytes: data.length, sha256: hash(data) }) }
await writeFile(join(stage, 'files.sha256.json'), JSON.stringify(files, null, 2) + '\n')
console.log(JSON.stringify({ stage, files: files.length, planSha256: hash(await readFile(join(stage, 'plan.json'))), privateCredentialsRead: false, historicalPublicFixturesOnly: true, phoneIo: false, remoteIo: false, grantCreated: false }))
