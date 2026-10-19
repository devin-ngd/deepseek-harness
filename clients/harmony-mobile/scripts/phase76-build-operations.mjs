/** Build local and separate relay-only operators with exact public fixtures; never opens phone, SSH, credentials or a grant owner. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { projectionTsconfig } from './projection-source.mjs'
const root = resolve('.'), source = join(root, 'operations/phase76'), stage = join(root, '.build/phase76-operations-work'), json = async file => JSON.parse(await readFile(file, 'utf8')), hash = data => createHash('sha256').update(data).digest('hex')
await mkdir(stage, { recursive: true })
for (const file of await readdir(source)) if (file !== 'continuation-plan.json') await copyFile(join(source, file), join(stage, file))
const sourceRoot = (await json('source.json')).dshRoot, require = createRequire(join(sourceRoot, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(sourceRoot, 'node_modules/.pnpm')] }))
const options = { bundle: true, format: 'esm', platform: 'node', target: 'node22', tsconfig: await projectionTsconfig(root, sourceRoot), alias: { zod: require.resolve('zod') } }
const shared = await esbuild.build({ ...options, metafile: true, stdin: { contents: "export { parsePublicTrustDocument, canonicalPublicTrust, publicTrustRenewalBytes, successorHistory, assertPublicTrustSuccessor, publicTrustVerificationInputs } from './src/public-trust-protocol.ts'; export { verifyPublicTrustHistory } from './integration/public-trust-verification.ts'; export { p256CredentialId, verifyP256 } from './integration/p256-public.ts'; export { reviewPhoneConnectReady } from './replay-profile/src/connect-readiness.ts'; export { pairedGrantSchema, enrollmentProofBytes } from './src/pairing-protocol.ts'; export { firstUseOfferSchema, firstUseReplySchema, firstUseOfferBytes } from './src/first-use-protocol.ts';", resolveDir: root }, outfile: join(stage, 'shared.mjs') })
const inputs = []; for (const file of Object.keys(shared.metafile.inputs).filter(file => file !== '<stdin>').sort()) inputs.push({ file, sha256: hash(await readFile(resolve(root, file))) })
await writeFile(join(stage, 'shared-source.sha256.json'), JSON.stringify(inputs, null, 2) + '\n')
await esbuild.build({ ...options, stdin: { contents: "export { p256CredentialId } from './integration/p256-public.ts';", resolveDir: root }, outfile: join(stage, 'shared-public.mjs') })
const plan = await json(join(source, 'plan.json')), remote = { schema: 'harmony-phase76-relay-public-plan/1', pairId: plan.pairId, epochs: { relayPair: plan.epochs.relayPair }, limits: { grantMs: plan.limits.grantMs }, relay: plan.relay }
await writeFile(join(stage, 'relay-plan.json'), JSON.stringify(remote, null, 2) + '\n')
await esbuild.build({ ...options, entryPoints: [join(stage, 'relay.mjs')], outfile: join(stage, 'relay-runner.mjs'), minifySyntax: true, minifyWhitespace: true, minifyIdentifiers: false, legalComments: 'none' })
const runner = await readFile(join(stage, 'relay-runner.mjs'), 'utf8')
for (const forbidden of [plan.session, plan.identity.desktopId, plan.identity.deviceId, plan.identity.profileId, plan.identity.desktopFingerprint, plan.identity.phoneFingerprint, plan.local.home, plan.local.world, plan.local.retainedPublicPath]) assert.equal(runner.includes(forbidden), false, 'desktop metadata in relay runner')
const frozen = join(root, '.build/phase69-review-candidate'), manifest = await json(join(frozen, 'files.sha256.json')), relay = manifest.filter(row => row.file.startsWith('relay/')); assert.equal(relay.length, 40)
for (const row of relay) assert.equal(hash(await readFile(join(frozen, row.file))), row.sha256)
await writeFile(join(stage, 'relay-files.json'), JSON.stringify(relay, null, 2) + '\n')
for (const [from, to] of [['relay/public-tools/config.first-use.proposal.json', 'config.template.json'], ['relay/public-tools/relay-endpoint-timers.json', 'limits.json'], ['relay/relay.nginx.conf.proposal', 'nginx.during.conf']]) await copyFile(join(frozen, from), join(stage, to))
await copyFile('scripts/phase59-hap-payload.ps1', join(stage, 'hap-payload.ps1'))
await copyFile('.build/native-control-diagnostics-project/entry/src/main/resources/base/element/string.json', join(stage, 'native-strings.json'))
await copyFile(plan.local.retainedPublicPath, join(stage, 'historical-v2.fixture.json'))
await copyFile('D:/Temp/dsh-harmony-phase75-operation/native-final-1792226230168.json', join(stage, 'phone-anchor.fixture.json'))
await copyFile('D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/fixed-world/exchange/run-vQfb8Y/relay-pair.json', join(stage, 'historical-relay.fixture.json'))
await writeFile(join(stage, 'location.json'), JSON.stringify({ clientRoot: root, sourceRoot }, null, 2) + '\n')
const nginx = await readFile(join(stage, 'nginx.during.conf'), 'utf8'); assert.equal(hash(nginx), plan.relay.candidateNginxSha256)
const original = nginx.replaceAll('burst=3', 'burst=2'); assert.equal(hash(original), plan.relay.originalNginxSha256); await writeFile(join(stage, 'nginx.before.fixture.conf'), original)
const files = []
for (const file of (await readdir(stage)).filter(file => file !== 'files.sha256.json').sort()) { const data = await readFile(join(stage, file)); files.push({ file, bytes: data.length, sha256: hash(data) }) }
await writeFile(join(stage, 'files.sha256.json'), JSON.stringify(files, null, 2) + '\n')
const inventory = { at: new Date().toISOString(), stage, files: files.length, planSha256: hash(await readFile(join(stage, 'plan.json'))), manifestSha256: hash(await readFile(join(stage, 'files.sha256.json'))), remotePayload: { files: ['relay-runner.mjs', 'relay-files.json', 'config.template.json', 'limits.json', 'nginx.during.conf'], runnerSha256: hash(runner), relayOnlyMetadata: true, forbiddenDesktopValuesChecked: 9, pairFields: ['pairId', 'desktopPublicSpki', 'phonePublicSpki', 'epoch', 'expiresAt', 'revoked'], destination: plan.relay.run + '/relay-pair.json', candidateConfig: plan.relay.config }, signed: false, installed: false, phoneIo: false, remoteIo: false, realGrantCreated: false }
await writeFile('evidence/phase76-operations-build.json', JSON.stringify(inventory, null, 2) + '\n'); console.log(JSON.stringify(inventory))
