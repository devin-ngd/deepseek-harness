/** Prepare a reviewable desktop patch in the deployment backup directory; never modify the installed profile or credentials. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { access, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), json = async path => JSON.parse(await readFile(path, 'utf8'))
const state = await json('evidence/normal-controls-deployment.json'), root = (await json('source.json')).dshRoot
assert.equal(state.approval.evidence, 'Sentinel_e2d971bb3abc8191b9b8f261d185e4fb')
assert.equal((await json('evidence/normal-controls-isolation.json')).passed, true)
const require = createRequire(join(root, 'package.json')), yaml = require(join(root, 'node_modules/.pnpm/yaml@2.9.0/node_modules/yaml'))
const parse = bytes => { const document = yaml.parseDocument(bytes.toString('utf8')); assert.equal(document.errors.length, 0, 'YAML refused without source-value projection'); return document.toJS() }
for (const file of state.backups) assert.equal(hash(await readFile(file.source)), file.sha256, 'Current profile changed; prepare from a fresh reviewed backup')
const originalBytes = await readFile(state.originalIdentity.credentialsFile)
assert.equal(hash(originalBytes), state.originalIdentity.originalFileSha256)
const credentials = parse(originalBytes), identity = credentials.records?.['harmony-desktop-identity/' + state.originalIdentity.alias]
assert.equal(identity?.kind, 'grant'); assert.equal(identity.payload.format, 'harmony-desktop-identity/2'); assert.equal(identity.payload.protection, 'windows-dpapi-current-user/1')
assert.equal('p256-sha256-' + hash(Buffer.from(identity.payload.publicSpki, 'base64url')), state.originalIdentity.desktopFingerprint)
const key = profile => 'harmony-device/device-' + hash(JSON.stringify(['field-replay-desktop', profile, 'field-phone']))
const old = credentials.records?.[key('harmony-mobile-replay')]
assert.equal(old?.payload.epoch, 10); assert.equal(old.payload.revoked, true)
assert.equal(credentials.records?.[key('desktop')], undefined, 'Existing current-profile record requires owner review')
try { await access(state.originalIdentity.credentialsFile + '.lock'); throw new Error('Original credential writer is active') } catch (error) { if (error.code !== 'ENOENT') throw error }
const profilePatch = join(state.profile, 'cordis.patch.yml'), originalPatch = await readFile(profilePatch)
assert.equal(originalPatch.toString('utf8').includes('harmony-mobile-normal-identity'), false)
const parsedPatch = parse(originalPatch), rich = parsedPatch.find(row => row.id === 'rich-inline')
assert.ok(rich && Array.isArray(rich.config.activePresets))
const pairing = await json('desktop-plugin/pairing.enabled.example.json')
Object.assign(pairing, { desktopId: 'field-replay-desktop', deviceId: 'field-phone', identityAlias: state.originalIdentity.alias })
const test = await json('desktop-plugin/test-session.enabled.example.json')
assert.equal(test.profileId, 'desktop'); assert.equal(test.responseLimit, 3); assert.equal(test.ttlMs, 1800000)
const block = [
  { id: 'harmony-mobile-pairing', name: '@deepseek-ai/dsh-experimental-harmony-mobile/pairing', disabled: true, config: { enabled: false } },
  { id: 'harmony-mobile-link-test', name: '@deepseek-ai/dsh-experimental-harmony-mobile/test-session', disabled: false, config: test },
  { insert: [{ id: 'harmony-mobile-normal-identity', name: 'cordis:group', group: true, isolate: { credentials: true, authorization: true }, config: [
    { id: 'harmony-original-credentials', name: '@deepseek-ai/dsh-credentials-local', config: { path: state.originalIdentity.credentialsFile, dshHome: dirname(state.originalIdentity.credentialsFile), watch: false } },
    { id: 'harmony-original-authorization', name: '@deepseek-ai/dsh-authorization' },
    { id: 'harmony-current-desktop-pairing', name: '@deepseek-ai/dsh-experimental-harmony-mobile/pairing', config: pairing },
  ] }] },
]
if (rich.config.activePresets.length > 0 && !rich.config.activePresets.includes(test.presetId)) block.push({ id: 'rich-inline', name: rich.name, config: { ...rich.config, activePresets: [...rich.config.activePresets, test.presetId] } })
const owned = yaml.stringify(block), proposed = originalPatch.toString('utf8').trimEnd() + '\n\n# >>> harmony-mobile-normal-controls\n' + owned + '# <<< harmony-mobile-normal-controls\n'
const path = join(state.run, 'proposed-cordis.patch.yml')
await writeFile(path, proposed, { flag: 'wx' })
assert.ok(Array.isArray(parse(Buffer.from(proposed))))
const report = { at: new Date().toISOString(), approval: state.approval.evidence, proposedPatch: path, originalPatchSha256: hash(originalPatch), proposedPatchSha256: hash(proposed), profile: state.profile, requiredBundle: '@deepseek-ai/dsh-experimental-harmony-mobile', installationVersion: '0.0.0-normal-controls.1', originalIdentityAlias: state.originalIdentity.alias, originalProviderPathSelected: true, isolatedServices: ['credentials', 'authorization'], rootServicesUnchanged: true, identityFingerprintMatchedWithoutUnprotecting: true, oldScope: { epoch: 10, revoked: true }, newScopeRecordAbsent: true, threeResponseBudget: test.responseLimit, ttlMs: test.ttlMs, richPresetListRetained: rich.config.activePresets.length === 0, installedProfileWritten: false, originalCredentialsWritten: false, grantStarted: false, realModels: 0, applyRequiresInstalledExactVersionAndOwnedUI: true }
await writeFile('evidence/normal-controls-profile-plan.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(report))
