/** First-use rejection evidence with fixed synthetic identities only; no real identity initialization or dial. */
import { FixedIdentityProtection, fixedProtectedIdentity } from './fixed-identity-protection.ts'
import { it, expect, vi } from 'vitest'
import { mkdir, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import Authorization from '@deepseek-ai/dsh-authorization'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import { verify, createPublicKey } from 'node:crypto'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import { sourceComposition } from './source-composition.ts'
import { DesktopIdentitySigner } from '../desktop-plugin/src/identity.ts'
import { DesktopFirstUse } from '../desktop-plugin/src/first-use.ts'
import { resolveFieldConfig } from '../replay-profile/src/field-config.ts'
import { fieldSession, firstUseOfferSchema } from '../src/first-use-protocol.ts'
import { desktopKey, phoneKey } from './phase39-fixture.ts'
import { p256CredentialId } from './p256-public.ts'
import { enrollmentProofBytes } from '../src/pairing-protocol.ts'
import { id } from '../src/protocol.ts'
import { NativeProductOwner, context, resetProductSdk, network, sdk } from '../tests/helpers/product-native-harness.mjs'
import { relayEndpointTimers } from '../standalone-relay/src/endpoint-timers.ts'
import { prepareFirstUseRelayConfig, firstUseRelayPreview } from '../standalone-relay/src/first-use.ts'
import { preparePublicConfig } from '../standalone-relay/src/prepare-public-config.ts'
const protection = new FixedIdentityProtection()
const endpointTimers = relayEndpointTimers(JSON.parse(await readFile(new URL('../replay-profile/field.enabled.example.json', import.meta.url), 'utf8')), JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8')))
it('local signer refuses missing identity, wrong authority, absent confirmation, duplicate creation and mismatched public record without generating any identity', async () => {
  const parent=process.env.DSH_HARMONY_INTEGRATION_WORLD!; const world=join(parent,'identity-refusals');await mkdir(world);const ctx=await sourceComposition(world),authority={};await ctx.plugin(MemoryCredentials)
  try { await expect(DesktopIdentitySigner.initialize(ctx,authority,{},'fixture',true,protection)).rejects.toThrow('denied');await expect(DesktopIdentitySigner.initialize(ctx,authority,authority,'fixture',false,protection)).rejects.toThrow('denied');await expect(DesktopIdentitySigner.open(ctx,authority,authority,'fixture',protection)).rejects.toThrow('absent');expect(await ctx.credentials.listRecords()).toHaveLength(0)
    const key=credentialKey('harmony-desktop-identity','fixture');await ctx.credentials.modifyRecord(key,async()=>fixedProtectedIdentity('fixture',desktopKey,protection));await expect(DesktopIdentitySigner.initialize(ctx,authority,authority,'fixture',true,protection)).rejects.toThrow('already exists');await expect(DesktopIdentitySigner.open(ctx,authority,{},'fixture',protection)).rejects.toThrow('denied');const signer=await DesktopIdentitySigner.open(ctx,authority,authority,'fixture',protection);signer.close();await expect(signer.sign(new Uint8Array([1]))).rejects.toThrow('denied');await ctx.credentials.modifyRecord(key,async()=>({...await fixedProtectedIdentity('fixture',desktopKey,protection),payload:{...((await fixedProtectedIdentity('fixture',desktopKey,protection)).payload),publicSpki:phoneKey.publicSpki}}));await expect(DesktopIdentitySigner.open(ctx,authority,authority,'fixture',protection)).rejects.toThrow('unavailable')
  } finally { await ctx.fiber.dispose() }
})
it('fixed field policy rejects foreign scope and long grants; native signing rejects tampered desktop proof, expired offer and unconfirmed input; desktop denial creates no grant or provider', async () => {
  expect(resolveFieldConfig({schema:'harmony-replay-field/1',enabled:false})).toEqual({schema:'harmony-replay-field/1',enabled:false});const template=JSON.parse(await readFile(new URL('../replay-profile/field.enabled.example.json',import.meta.url),'utf8'));expect(()=>resolveFieldConfig({...template,grantTtlMs:1800001})).toThrow();expect(()=>resolveFieldConfig({...template,sessions:['foreign']})).toThrow();const config=resolveFieldConfig(template);if(!config.enabled)throw new Error('test policy absent')
  const world=join(process.env.DSH_HARMONY_INTEGRATION_WORLD!,'grant-refusals');await mkdir(world);const ctx=await sourceComposition(world);await ctx.plugin(MemoryCredentials);await ctx.plugin(Authorization);await ctx.sessionController.create({sessionId:id<'SessionId'>(fieldSession),cwd:world});const authority={},firstUse=new DesktopFirstUse(ctx,authority,config.policy,desktopKey),base=JSON.parse(await readFile(new URL('../product.config.json',import.meta.url),'utf8'));resetProductSdk();const app=new NativeProductOwner({...base,corePolicyJson:JSON.stringify(base.core)});await app.initialize(context(),()=>{})
  try { await expect(firstUse.issue({},{})).rejects.toThrow('denied');await expect(firstUse.issue(authority,{identityAlias:'fixture-phone',publicSpki:phoneKey.publicSpki,credentialId:p256CredentialId(desktopKey.publicSpki)})).rejects.toThrow('fingerprint');const identity=JSON.parse(await app.initializeIdentity('fixture-phone',true)),offer=await firstUse.issue(authority,identity);expect(()=>firstUseOfferSchema.parse({...offer,sessions:['foreign',fieldSession]})).toThrow();await expect(app.signEnrollment(JSON.stringify({...offer,audience:'other.example'}),true)).rejects.toThrow('native enrollment refused at verify-desktop-signature');await expect(app.signEnrollment(JSON.stringify({...offer,ticket:{...offer.ticket,expiresAt:Date.now()-1}}),true)).rejects.toThrow('native enrollment refused at shared-offer-input');await expect(app.signEnrollment(JSON.stringify(offer),false)).rejects.toThrow('comparison');const reply=JSON.parse(await app.signEnrollment(JSON.stringify(offer),true));expect(()=>firstUse.install(authority)).toThrow('denied');await expect(firstUse.confirm(authority,{...reply,offer:{...offer,pairId:'changed'}},{notify:()=>{},prompt:async()=> 'allow'})).rejects.toThrow('denied');await expect(firstUse.confirm(authority,reply,{notify:()=>{},prompt:async()=> 'deny'})).rejects.toThrow('denied');expect(await ctx.credentials.listRecords()).toHaveLength(0);expect(firstUse.owner.hasLocalGrant(config.policy.deviceId)).toBe(false);expect(ctx.get('harmonyAuthenticatedDevices')).toBeUndefined();expect(ctx.get('harmonyRelayLifecycle')).toBeUndefined();expect(network.requests).toHaveLength(0);expect(sdk.files.size).toBe(0)
  } finally { await Promise.allSettled([app.close(),firstUse.close()]);await ctx.fiber.dispose() }
})
it('actual isolated file credentials reopen a fixed fixture signer without identity generation; public proposal tools exclusively write only the selected new JSON', async () => {
  const world=join(process.env.DSH_HARMONY_INTEGRATION_WORLD!,'file-owner');await mkdir(world);const filename=join(world,'fixture-credentials.yaml'),authority={},key=credentialKey('harmony-desktop-identity','fixture'),ctx=await sourceComposition(world)
  try { await ctx.plugin(CredentialsLocal,{path:filename,watch:false});await ctx.credentials.modifyRecord(key,async()=>fixedProtectedIdentity('fixture',desktopKey,protection)) } finally { await ctx.fiber.dispose() }
  const reopenedWorld=join(world,'reopen');await mkdir(reopenedWorld);const reopened=await sourceComposition(reopenedWorld)
  try { await reopened.plugin(CredentialsLocal,{path:filename,watch:false});const signer=await DesktopIdentitySigner.open(reopened,authority,authority,'fixture',protection);try { const bytes=new TextEncoder().encode('fixed public test proof'),signature=await signer.sign(bytes);expect(verify('sha256',bytes,createPublicKey({key:Buffer.from(desktopKey.publicSpki,'base64url'),format:'der',type:'spki'}),signature)).toBe(true) } finally { signer.close() };expect(await reopened.credentials.listRecords()).toHaveLength(1) } finally { await reopened.fiber.dispose() }
  const proposal=new URL('../standalone-relay/config.first-use.proposal.json',import.meta.url),template=JSON.parse(await readFile(proposal,'utf8')),pair={pairId:'fixture-public-pair',desktopPublicSpki:desktopKey.publicSpki,phonePublicSpki:phoneKey.publicSpki,epoch:1,expiresAt:Date.now()+60000,revoked:false},path=join(world,'public-state.jsonl'),prepared=prepareFirstUseRelayConfig(template,pair,path,endpointTimers);expect(prepared).toMatchObject({publicTrust:{path},broker:{maxPairs:1,pairs:[pair]}});expect(()=>prepareFirstUseRelayConfig(template,{...pair,expiresAt:1},path,endpointTimers)).toThrow();expect(()=>prepareFirstUseRelayConfig(template,pair,'relative',endpointTimers)).toThrow();expect(await access(path).then(()=>true,()=>false)).toBe(false)
  const preview=firstUseRelayPreview(prepared,pair,endpointTimers);expect(preview).toMatchObject({desktopFingerprint:p256CredentialId(desktopKey.publicSpki),phoneFingerprint:p256CredentialId(phoneKey.publicSpki),trustPath:path});expect(JSON.stringify(preview)).not.toContain(desktopKey.publicSpki);expect(()=>firstUseRelayPreview({...prepared,privatePkcs8:'synthetic-invalid-extra'},pair,endpointTimers)).toThrow();expect(()=>firstUseRelayPreview(prepared,{...pair,privatePkcs8:'synthetic-invalid-extra'},endpointTimers)).toThrow()
  const { writeFile }=await import('node:fs/promises'),pairPath=join(world,'pair.json'),output=join(world,'prepared.json'),limitsPath=join(world,'limits.json');await writeFile(pairPath,JSON.stringify(pair));await writeFile(limitsPath,JSON.stringify(endpointTimers));const args=['--config',proposal.pathname.slice(1),'--pair',pairPath,'--state',path,'--output',output,'--limits',limitsPath];await preparePublicConfig(args);expect(JSON.parse(await readFile(output,'utf8'))).toEqual(prepared);await expect(preparePublicConfig(args)).rejects.toThrow();expect(await access(path).then(()=>true,()=>false)).toBe(false)
})

it('offer cancellation does not invent a grant; unknown authorization and real revocation failures remain blocked', async () => {
  const config = resolveFieldConfig(JSON.parse(await readFile(new URL('../replay-profile/field.enabled.example.json', import.meta.url), 'utf8')))
  if (!config.enabled) throw new Error('fixture policy missing')
  const world = join(process.env.DSH_HARMONY_INTEGRATION_WORLD!, 'stop-outcomes'); await mkdir(world)
  const ctx = await sourceComposition(world); await ctx.plugin(MemoryCredentials); await ctx.plugin(Authorization)
  await ctx.sessionController.create({ sessionId: id<'SessionId'>(fieldSession), cwd: world })
  const authority = {}, first = new DesktopFirstUse(ctx, authority, config.policy, desktopKey), phone = { identityAlias: 'fixture-phone', publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) }
  try {
    const offer = await first.issue(authority, phone), reply = { schema: 'harmony-first-use-reply/1', offer, proof: { challenge: offer.ticket, signature: Buffer.from(await phoneKey.sign(enrollmentProofBytes(offer.ticket))).toString('base64url') } }
    const begin = vi.spyOn(ctx.authorization, 'begin').mockRejectedValue(new Error('synthetic authorization outcome unknown'))
    await expect(first.confirm(authority, reply, { notify: () => {}, prompt: async () => 'allow' })).rejects.toThrow('unknown')
    begin.mockRestore()
    await expect(first.stop(authority)).rejects.toThrow('authorization outcome unknown')
    expect(await ctx.credentials.listRecords()).toHaveLength(0)
  } finally { await first.close(); await ctx.fiber.dispose() }
  const otherWorld = join(world, 'committed'); await mkdir(otherWorld)
  const other = await sourceComposition(otherWorld); await other.plugin(MemoryCredentials); await other.plugin(Authorization)
  await other.sessionController.create({ sessionId: id<'SessionId'>(fieldSession), cwd: otherWorld })
  const second = new DesktopFirstUse(other, authority, config.policy, desktopKey)
  try {
    const offer = await second.issue(authority, phone), reply = { schema: 'harmony-first-use-reply/1', offer, proof: { challenge: offer.ticket, signature: Buffer.from(await phoneKey.sign(enrollmentProofBytes(offer.ticket))).toString('base64url') } }
    await second.confirm(authority, reply, { notify: () => {}, prompt: async () => 'allow' })
    const revoke = vi.spyOn(second.owner, 'revoke').mockRejectedValue(new Error('synthetic durable revoke failure'))
    await expect(second.stop(authority)).rejects.toThrow('durable revoke failure')
    revoke.mockRestore()
    await expect(second.stop(authority)).resolves.toBe('grant-revoked')
    expect((await second.owner.storedGrant(authority, config.policy.deviceId))?.revoked).toBe(true)
  } finally { await second.close(); await other.fiber.dispose() }
})
