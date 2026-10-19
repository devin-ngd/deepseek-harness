/** Disposable normal profile using installed alpha.4 services and a finite local adapter; no user profile or live provider. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import Presets from '@deepseek-ai/dsh-agent-preset-registry'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import Authorization from '@deepseek-ai/dsh-authorization'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import * as TestEntry from '../desktop-plugin/src/test-session.ts'
import * as Product from '../desktop-plugin/src/product.ts'
import * as Pairing from '../desktop-plugin/src/pairing.ts'
import { loadProfileServices } from './profile-services.ts'
import { invokeProfile } from '../desktop-plugin/src/transport.ts'
import { deviceRemotePolicy } from '../desktop-plugin/src/device-policy.ts'
import { id } from '../src/protocol.ts'
import { deviceGrantOperations } from '../src/pairing-protocol.ts'
import { PROFILE_RPC_CODEC } from '../src/profile-rpc-codec.ts'
import { MOBILE_LINK_PROTOCOL } from '../src/link-protocol.ts'
import { z } from 'zod'

const world = process.env.DSH_HARMONY_INTEGRATION_WORLD, client = process.env.DSH_HARMONY_CLIENT_ROOT
if (world === undefined || client === undefined || process.env.DSH_HARMONY_SENTINEL_ONLY !== '1') throw new Error('Fresh isolated installed-API check required')
const ctx = await loadProfileServices(world, await readFile(join(client, 'integration/cordis.yml'), 'utf8'))
try {
  ctx.provide('profileContext', { name: 'normal-controls', dir: world, patchPath: join(world, 'patch.yml'), cwd: world, installAnchor: world, home: world, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined })
  await ctx.plugin(Presets, { default: 'standard' }); await ctx.agentPresets.register({ id: 'standard', plugins: [] }); await ctx.plugin(Gateway)
  await ctx.plugin(MemoryCredentials); await ctx.plugin(Authorization); await ctx.plugin(UserQuestions)
  const policy = { enabled: true, profileId: 'normal-controls', presetId: 'harmony-mobile-link-test', presetName: 'Synthetic link test', provider: 'harmony-link-test', model: 'fixed-three', responseLimit: 3, ttlMs: 60000, paceMs: 1, maxTokens: 4096, contextWindow: 100000 }
  const entry = ctx.plugin(TestEntry, policy); await entry
  const starterId = id<'SessionId'>('installed-start'), desktopId = id<'mobile-desktop'>('installed-test-desktop'), deviceId = id<'mobile-device'>('installed-test-phone')
  await ctx.sessionController.create({ sessionId: starterId, cwd: world })
  const created = await ctx.commands.execute(ctx.agents.get(starterId)!, '/harmony-test new', [], new AbortController().signal)
  assert.equal(created?.result.kind, 'success')
  const sessionId = id<'SessionId'>(JSON.parse(created!.result.text!).sessionId)
  const pairing = ctx.plugin(Pairing, JSON.parse(await readFile(join(client, 'desktop-plugin/pairing.enabled.example.json'), 'utf8'))); await pairing
  const pairingStatus = await ctx.commands.execute(ctx.agents.get(sessionId)!, '/harmony-pair status', [], new AbortController().signal)
  assert.equal(pairingStatus?.result.kind, 'success'); assert.equal(JSON.parse(pairingStatus!.result.text!).sessionId, sessionId)
  await pairing.dispose()
  const peer = ctx.connection.createPeer({ principal: { kind: 'harmony-device', desktopId, deviceId, epoch: 1 }, interactions: 'none' })
  const grant = { desktopId, profileId: id<'mobile-profile'>('normal-controls'), deviceId, epoch: 1, sessions: [sessionId], operations: deviceGrantOperations, expiresAt: Date.now() + 60000, revoked: false }
  ctx.provide('harmonyAuthenticatedDevices', { current: candidate => candidate === peer ? grant : undefined, onRevoke: () => () => {} })
  ctx.effect(() => () => peer.dispose()); ctx.effect(() => ctx.remoteAccess.registerPolicy('harmony-device', deviceRemotePolicy(principal => principal === peer.principal ? grant : undefined, Date.now)))
  await ctx.plugin(Product, { enabled: true, desktopId, profileId: 'normal-controls', sessionId, journalMode: 'create' })
  let command = 0
  const request = (operation: string, payload: unknown) => invokeProfile(ctx, peer, { method: 'request', argument: { version: PROFILE_RPC_CODEC, packet: JSON.stringify({ protocol: MOBILE_LINK_PROTOCOL, desktopId, deviceId, grantEpoch: 1, commandId: 'installed-' + ++command, expiresAt: Date.now() + 30000, operation, payload }) } }, new AbortController().signal)
  const task = { sessionId, requestId: 'installed-task', text: 'Show the synthetic link form.' }
  await request('task.submit', task); await ctx.agents.get(sessionId)!.whenIdle(); await request('task.submit', task)
  const saved = await ctx.sessionController.inspect(sessionId), message = saved.events.find(event => event.type === 'assistant/message')
  assert.equal(message?.type, 'assistant/message', JSON.stringify(saved.events))
  // The fixture author key is part of the existing rich-html publication protocol.
  const blockId = 'inline-' + message!.data.message.id + '-phone-form'
  const mounted = z.object({ mountId: z.string(), snapshot: z.object({ dataRevision: z.number(), draft: z.object({ draftRevision: z.number() }) }) }).parse(await request('rich.mount', { sessionId, messageId: message!.data.message.id, blockId, guestProtocol: 'lumina-rich/1' }))
  const values = { title: 'Installed API checked', count: '7' }, actionId = 'installed-action'
  const intent = { mountId: mounted.mountId, actionId, actionName: 'submit', targetActionId: null, expectedDataRevision: mounted.snapshot.dataRevision, values, fileGrants: [], draft: { baseRevision: mounted.snapshot.draft.draftRevision, stateSchemaVersion: 1, fields: values, dirty: ['title', 'count'] } }
  await request('rich.invoke', intent); await request('rich.invoke', intent)
  const deadline = Date.now() + 10000
  for (;;) { const status = z.object({ state: z.string(), values: z.unknown().optional() }).parse(await request('rich.status', { mountId: mounted.mountId, actionId })); if (status.state === 'completed') { assert.deepEqual(status.values, values); break } if (Date.now() >= deadline) throw new Error('Installed rich completion did not settle'); await new Promise(accept => setTimeout(accept, 10)) }
  await ctx.agents.get(sessionId)!.whenIdle()
  const commandResult = await ctx.commands.execute(ctx.agents.get(sessionId)!, '/harmony-test', [], new AbortController().signal)
  assert.equal(commandResult?.result.kind, 'success'); const result = JSON.parse(commandResult!.result.text!); assert.equal(result.responses, 3)
  assert.equal(ctx.llm.getOfflineReplayCounts().realCalls, 0)
  console.log(JSON.stringify({ installedApi: 'alpha.4/protocol4', pairingCommandRegistered: true, normalProduct: true, fixedResponses: result.responses, richCompleted: true, duplicateIdsRetained: true, zeroRealDispatches: true, network: false, userProfile: false }))
  await entry.dispose()
} finally { await ctx.fiber.dispose() }
