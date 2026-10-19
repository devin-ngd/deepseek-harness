/** Actual selected dsh field entry. Every identity/grant/provider decision is local and interactive; replay-only composition cannot select user Sessions/models. */
import { WindowsCurrentUserProtection } from '../../desktop-plugin/src/windows-protection.ts'
import type { Context } from '@deepseek-ai/cordis'
import { readFile, writeFile, mkdir, mkdtemp, lstat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { FieldWorldOwner } from './field-world.ts'
import { GrantDeadline } from './grant-deadline.ts'
import { consumePhoneConnectReady } from './connect-readiness.ts'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import Authorization from '@deepseek-ai/dsh-authorization'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import { sourceComposition } from '../../integration/source-composition.ts'
import { installFourResponses, fixedReplayPosition } from '../../integration/replay-host.ts'
import { DesktopIdentitySigner } from '../../desktop-plugin/src/identity.ts'
import { DesktopFirstUse } from '../../desktop-plugin/src/first-use.ts'
import { resolveFieldConfig } from './field-config.ts'
import { fieldSession, fieldProfile } from '../../src/first-use-protocol.ts'
import { id } from '../../src/protocol.ts'
import * as DesktopPlugin from '../../desktop-plugin/src/index.ts'
/** @param path - one locally selected public JSON file. @param maxBytes - owned capacity. @returns validated JSON text with no symlink or oversized input. */
async function publicJson(path: string, maxBytes: number): Promise<unknown> { const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maxBytes) throw new Error('public input file denied'); const bytes = await readFile(path); if (bytes.length > maxBytes) throw new Error('public input capacity'); return JSON.parse(bytes.toString('utf8')) }
/** @param host - supported dsh selected profile. @param signal - dsh lifecycle. @returns after local decisions and shutdown; disabled field mode performs no key, service or network activation. */
export async function fieldJourney(host: Context, signal: AbortSignal): Promise<void> {
  const home = host.profileContext.home, config = resolveFieldConfig(await publicJson(join(home, 'field.json'), 32768)); if (!config.enabled) return
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('field use requires local interactive confirmation')
  const terminal = createInterface({ input: process.stdin, output: process.stdout }), authority = {}, confirm = async (message: string, phrase: string) => { const answer = await terminal.question(message + '\nType ' + phrase + ' to allow; any other response denies: ', { signal }); if (answer !== phrase) throw new Error('local decision declined') }
  let ctx: Awaited<ReturnType<typeof sourceComposition>> | undefined, signer: DesktopIdentitySigner | undefined, firstUse: DesktopFirstUse | undefined
  let revokeGrant: (() => Promise<void>) | undefined, cleanupPath: string | undefined, grantDeadline: GrantDeadline | undefined
  try {
    const fixture = await readFile(new URL('../assets/offline-four.v4.jsonl', import.meta.url), 'utf8'), sourceConfig = await readFile(new URL('../assets/cordis.yml', import.meta.url), 'utf8')
    await confirm('Select ' + config.world.mode + ' for the exact fixed-replay world ' + config.world.path + '. Reopen activates the original canonical Agent only under the replay guard; authorization still needs local confirmation.', config.world.mode === 'create' ? 'CREATE FIXED WORLD' : 'REOPEN FIXED WORLD')
    await FieldWorldOwner.use({ ...config.world, desktopId: config.policy.desktopId, identityAlias: config.identityAlias, assetsSha256: createHash('sha256').update(fixture + '\0' + sourceConfig).digest('hex') }, async owner => { try { const world = owner.root
    await mkdir(join(world, 'exchange'), { recursive: true }); const exchange = await mkdtemp(join(world, 'exchange/run-')); cleanupPath = join(exchange, 'desktop-cleanup.json')
    ctx = await sourceComposition(world, { fixture, config: sourceConfig }); await ctx.plugin(Gateway); await ctx.plugin(CredentialsLocal, { path: join(home, '.field-credentials.yaml'), watch: false }); await ctx.plugin(Authorization)
    ctx.deepseekLlmApiExtensions.prepare = async () => { throw new Error('UPLOAD_DISABLED') }; const consumed = config.world.mode === 'reopen' ? await fixedReplayPosition(ctx, id<'SessionId'>(fieldSession)) : 0, replay = await installFourResponses(ctx, world, undefined, fixture, consumed); await owner.prepareSession(ctx)
    const protection = new WindowsCurrentUserProtection({timeoutMs:config.identityProtectionTimeoutMs}); const action = await terminal.question('Existing desktop identity: type OPEN; absent identity: type CREATE. Anything else denies: ', { signal }); if (action === 'CREATE') { await confirm('Create one persistent desktop P256 signing identity in this isolated profile credentials file. Private bytes never enter public files. Private bytes are protected by Windows current-user DPAPI; this does not enforce Windows ACLs or protect against same-user compromise.', 'CREATE ' + config.identityAlias); await DesktopIdentitySigner.initialize(ctx, authority, authority, config.identityAlias, true, protection) } else if (action !== 'OPEN') throw new Error('local identity decision declined')
    signer = await DesktopIdentitySigner.open(ctx, authority, authority, config.identityAlias, protection); firstUse = new DesktopFirstUse(ctx, authority, config.policy, signer)
    const phonePath = join(home, 'phone-public.json'); await confirm('Put only the phone UI public identity JSON at ' + phonePath + '. Import this selected public key?', 'IMPORT PHONE')
    const phoneIdentity = await publicJson(phonePath, config.publicTrustMaxBytes), offer = config.renewal === undefined ? await firstUse.issue(authority, phoneIdentity) : await firstUse.issueRenewal(authority, phoneIdentity, JSON.stringify(await publicJson(config.renewal.previousPublicPath, config.publicTrustMaxBytes))), offerPath = join(exchange, 'desktop-offer.json'); await writeFile(offerPath, JSON.stringify(offer, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); process.stdout.write('Public desktop offer: ' + offerPath + '\n')
    const replyPath = join(exchange, 'phone-reply.json'); await confirm('Paste the offer into the native phone UI, compare both fingerprints/scope, approve its single enrollment signature, and put only that public response at ' + replyPath, 'READ PHONE PROOF')
    const artifacts = await firstUse.confirm(authority, await publicJson(replyPath, 32768), { notify: () => {}, prompt: async question => { process.stdout.write(question.message + '\n'); const answer = await terminal.question('Compare fingerprints on both devices and approve only this fixed replay Session/operations/expiry. Type ALLOW FIXED REPLAY; anything else denies: ', { signal: question.signal }); return answer === 'ALLOW FIXED REPLAY' ? 'allow' : 'deny' } })
    const admitted = firstUse; revokeGrant = () => admitted.revoke(authority)
    const expiresAt = artifacts.phone.paired.grant.expiresAt, startsAt = expiresAt - config.grantTtlMs, observedAt = Date.now()
    if (expiresAt <= observedAt || expiresAt > observedAt + 1800000) throw new Error('committed grant lifetime denied')
    grantDeadline = new GrantDeadline(expiresAt, signal, Date.now, { after: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } }); signal = grantDeadline.signal
    await writeFile(join(exchange, 'grant-lifetime.json'), JSON.stringify({ startsAt, expiresAt, commitObservedAt: observedAt, grantTtlMs: config.grantTtlMs, renewal: config.renewal !== undefined, session: fieldSession, realModels: 0 }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    process.stdout.write('Grant lifetime: ' + new Date(startsAt).toISOString() + ' -> ' + new Date(expiresAt).toISOString() + '\n')
    for (const [name, value] of [['phone-pair.json', artifacts.publicDocument], ['relay-pair.json', artifacts.relayPair]] as const) await writeFile(join(exchange, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    process.stdout.write('Public phone/relay records: ' + exchange + '\n'); await confirm('Relay public pins must be independently imported and activated by its local operator. Finish native final-record verification and local save first, leaving phone Connect ready. This starts the finite desktop connection budget; connect the ready phone immediately. Approve outbound verified WSS to ' + config.audience + '?', 'CONNECT FIXED REPLAY')
    if (config.connectReady === undefined) throw new Error('native phone readiness is required before desktop connection')
    await consumePhoneConnectReady(config.connectReady, artifacts.phone, artifacts.publicDocument, Date.now)
    firstUse.install(authority); const plugin = ctx.plugin(DesktopPlugin, { enabled: true, relayEnabled: true, desktopId: config.desktopId, profileId: fieldProfile, journalMode: 'reopen', maxAdmissionRecords: config.world.maxAdmissionRecords }); await plugin
    await terminal.question('Fixed replay ready: phone UI saves phone-pair.json with host approval, then Connect. Complete one task/rich action, then submit and cancel the fourth response. Enter closes this field profile without canceling accepted work. ', { signal })
    ctx.llm.assertZeroRealCalls(); const counts = ctx.llm.getOfflineReplayCounts(); await ctx.sessionPersistence.flush(); await writeFile(join(world, 'field-result.json'), JSON.stringify({ replay: counts.replay, realModels: 0, uploads: 0, profile: fieldProfile, session: fieldSession, nativeDeviceAccepted: false, outcomesRequireSessionEvidence: true }, null, 2) + '\n'); await plugin.dispose(); replay.handle.dispose()
  } finally {
    grantDeadline?.close()
    const revocation = await Promise.allSettled([revokeGrant?.()])
    const results = await Promise.allSettled([firstUse?.close(), ctx?.fiber.dispose()]); signer?.close()
    if (cleanupPath !== undefined) await writeFile(cleanupPath, JSON.stringify({ at: new Date().toISOString(), confirmedGrant: revokeGrant !== undefined, revocationSucceeded: revocation.every(result => result.status === 'fulfilled'), resourcesClosed: results.every(result => result.status === 'fulfilled'), realModels: 0 }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    // oxlint-disable-next-line no-unsafe-finally -- Unknown revocation or closure must fail the run after its independent cleanup receipt is saved.
    if ([...revocation, ...results].some(result => result.status === 'rejected')) throw new Error('field cleanup failed')
  } })
  } finally { terminal.close() }
}
