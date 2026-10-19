/** Production plugin/service/Gateway tests in isolated synthetic profiles; fixed four-response replay and disabled network carrier. */
import { mkdir, readdir, writeFile, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import { deviceRemotePolicy } from '../desktop-plugin/src/device-policy.ts'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import { SessionId } from '@deepseek-ai/dsh-session'
import { sourceComposition } from './source-composition.ts'
import { installFourResponses } from './replay-host.ts'
import * as Plugin from '../desktop-plugin/src/index.ts'
import type { AuthenticatedDeviceScope, AuthenticatedDeviceProvider } from '../desktop-plugin/src/admission.ts'
import { invokeProfile, followProfile } from '../desktop-plugin/src/transport.ts'
import { id } from '../src/protocol.ts'
import { MOBILE_LINK_PROTOCOL } from '../src/link-protocol.ts'
import { PROFILE_RPC_CODEC } from '../src/profile-rpc-codec.ts'
import { isRichJson } from '../src/upstream.ts'
import type { SessionPromptRequest } from '../src/upstream.ts'
import { authoredBlockId } from '../../../packages/experimental/rich-inline/src/shared/authored.ts'

function object(value: unknown) {
  if (!isRichJson(value) || value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Synthetic response object missing')
  return value
}
function number(value: unknown): number { if (typeof value !== 'number') throw new Error('Synthetic numeric field missing'); return value }
function string(value: unknown): string { if (typeof value !== 'string') throw new Error('Synthetic string field missing'); return value }
async function composition(label: string) {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD
  if (parent === undefined) throw new Error('Isolated phase32 launcher required')
  const world = join(parent, label); await mkdir(world, { recursive: true })
  const ctx = await sourceComposition(world); await ctx.plugin(Gateway)
  return { ctx, world }
}
async function devices(ctx: Awaited<ReturnType<typeof sourceComposition>>) {
  const grants = new Map<PeerScope, AuthenticatedDeviceScope>(), callbacks = new Set<(deviceId: AuthenticatedDeviceScope['deviceId']) => Promise<void>>()
  const provider: AuthenticatedDeviceProvider = { current: peer => grants.get(peer), onRevoke: callback => { callbacks.add(callback); return () => { callbacks.delete(callback) } } }
  ctx.provide('harmonyAuthenticatedDevices', provider)
  const peer = ctx.connection.createPeer({ principal: { kind: 'harmony-device', desktopId, deviceId, epoch: 1 }, interactions: 'none' })
  ctx.remoteAccess.registerPolicy('harmony-device', deviceRemotePolicy(principal => { for (const [candidate, grant] of grants) if (candidate.principal === principal && !candidate.signal.aborted) return grant; return undefined }, Date.now))
  ctx.effect(() => () => peer.dispose())
  return { grants, peer, callbacks, revoke: async () => {
    const grant = grants.get(peer); if (grant === undefined) throw new Error('Synthetic device scope missing')
    grants.delete(peer); await Promise.all([...callbacks].map(callback => callback(grant.deviceId)))
  } }
}
const desktopId = id<'mobile-desktop'>('phase32-desktop'), deviceId = id<'mobile-device'>('phase32-device')
const operations = ['task.submit', 'task.receipt', 'session.sync', 'session.cancel', 'rich.mount', 'rich.snapshot', 'rich.saveDraft', 'rich.invoke', 'rich.status', 'rich.dispose'] as const
function scope(sessionId: ReturnType<typeof SessionId>): AuthenticatedDeviceScope { return { desktopId, deviceId, epoch: 1, sessions: [sessionId], operations, expiresAt: Date.now() + 60000, revoked: false } }
function sender(ctx: Awaited<ReturnType<typeof sourceComposition>>, peer: PeerScope, prefix: string) {
  let command = 0
  const argument = (operation: string, payload: unknown) => ({ version: PROFILE_RPC_CODEC, packet: JSON.stringify({ protocol: MOBILE_LINK_PROTOCOL, desktopId, deviceId, grantEpoch: 1, commandId: prefix + '-' + ++command, expiresAt: Date.now() + 30000, operation, payload }) })
  return { argument, request: (operation: string, payload: unknown) => invokeProfile(ctx, peer, { method: 'request', argument: argument(operation, payload) }, new AbortController().signal) }
}

it('default disabled package and missing auth provider publish no service/descriptors or admission journal', async () => {
  const { ctx, world } = await composition('phase32-disabled')
  try {
    const before = ctx.typert.local.list().length
    const plugin = ctx.plugin(Plugin, {}); await plugin
    expect(ctx.get('harmonyDesktop')).toBeUndefined(); expect(ctx.typert.local.list()).toHaveLength(before)
    expect(await readdir(join(world, 'state'))).not.toContain('harmony_mobile_admission.json')
    await plugin.dispose()
    await expect(ctx.plugin(Plugin, { enabled: true, desktopId, profileId: 'phase32-profile' })).rejects.toThrow('harmonyAuthenticatedDevices')
    expect(ctx.get('harmonyDesktop')).toBeUndefined(); expect(ctx.typert.local.list()).toHaveLength(before)
    expect(ctx.llm.getOfflineReplayCounts().realCalls).toBe(0)
    await writeFile(new URL('../evidence/phase62-phase32-disabled.json', import.meta.url), JSON.stringify({ disabledNoService: true, disabledNoDescriptors: true, disabledNoJournal: true, missingProviderRejected: true, modelCalls: 0, listenerOpened: false }, null, 2) + '\n')
  } finally { await ctx.fiber.dispose() }
})

it('production admission rejects operator/cookie claims, cloned peers, foreign scope, unknown codec and unsupported approval', async () => {
  const { ctx, world } = await composition('phase32-admission')
  try {
    const identity = await devices(ctx), sessionId = SessionId('phase32-admission-session')
    await ctx.sessionController.create({ sessionId, cwd: world })
    const grant = scope(sessionId); identity.grants.set(identity.peer, grant)
    identity.grants.set(ctx.connection.browserPeer, grant)
    const plugin = ctx.plugin(Plugin, { enabled: true, desktopId, profileId: 'phase32-profile', journalMode: 'create' }); await plugin
    const metadata = { method: 'metadata', argument: null }
    await expect(invokeProfile(ctx, ctx.connection.browserPeer, metadata, new AbortController().signal)).rejects.toMatchObject({ code: 'scope-denied' })
    await expect(invokeProfile(ctx, { ...identity.peer }, metadata, new AbortController().signal)).rejects.toMatchObject({ code: 'scope-denied' })
    await expect(invokeProfile(ctx, identity.peer, { ...metadata, namespace: 'credentials', cookie: 'synthetic-forged-claim' }, new AbortController().signal)).rejects.toMatchObject({ code: 'invalid-packet' })
    const phone = sender(ctx, identity.peer, 'admission')
    const prompt = vi.spyOn(ctx.sessionController, 'prompt')
    await expect(phone.request('task.submit', { sessionId: 'foreign-session', requestId: 'denied', text: 'Synthetic' })).rejects.toMatchObject({ code: 'scope-denied' })
    const argument = { ...phone.argument('task.submit', { sessionId, requestId: 'denied', text: 'Synthetic' }), version: 'future' }
    await expect(invokeProfile(ctx, identity.peer, { method: 'request', argument }, new AbortController().signal)).rejects.toMatchObject({ code: 'codec-version' })
    await expect(phone.request('approval.list', { sessionId })).rejects.toMatchObject({ code: 'scope-denied' })
    await expect(phone.request('approval.respond', { sessionId, decision: 'allowed-once' })).rejects.toMatchObject({ code: 'scope-denied' })
    identity.grants.set(identity.peer, { ...grant, epoch: 2 })
    await expect(phone.request('session.cancel', { sessionId })).rejects.toMatchObject({ code: 'scope-denied' })
    expect(prompt).not.toHaveBeenCalled(); expect(ctx.llm.getOfflineReplayCounts().realCalls).toBe(0)
    await plugin.dispose()
    expect(ctx.get('harmonyDesktop')).toBeUndefined(); expect(ctx.typert.local.get('harmonyDesktop/request')).toBeUndefined()
    await expect(invokeProfile(ctx, identity.peer, metadata, new AbortController().signal)).rejects.toMatchObject({ code: 'gateway/definition-unavailable' })
    await writeFile(new URL('../evidence/phase62-phase32-admission.json', import.meta.url), JSON.stringify({ operatorRejected: true, clonedPeerRejected: true, arbitraryNamespaceClaimsRejected: true, foreignSessionRejected: true, unknownCodecRejected: true, approvalUnavailable: true, epochMismatchRejected: true, promptCalls: 0, teardownWithdrawsDescriptors: true, srcFallbackAfterUnloadRefused: true, listenerOpened: false, realModels: 0 }, null, 2) + '\n')
  } finally { await ctx.fiber.dispose() }
})

it('production journal refuses missing recovery state, repeated creation and changed profile owner before endpoint registration', async () => {
  const { ctx, world } = await composition('phase32-journal-recovery')
  try {
    await devices(ctx)
    await expect(ctx.plugin(Plugin, { enabled: true, desktopId, profileId: 'phase32-profile' })).rejects.toMatchObject({ code: 'journal-recovery-invalid' })
    expect(ctx.get('harmonyDesktop')).toBeUndefined()
    const initialized = ctx.plugin(Plugin, { enabled: true, desktopId, profileId: 'phase32-profile', journalMode: 'create' }); await initialized; await initialized.dispose()
    await expect(ctx.plugin(Plugin, { enabled: true, desktopId, profileId: 'phase32-profile', journalMode: 'create' })).rejects.toMatchObject({ code: 'journal-already-exists' })
    await expect(ctx.plugin(Plugin, { enabled: true, desktopId, profileId: 'wrong-profile' })).rejects.toMatchObject({ code: 'journal-recovery-invalid' })
    expect(ctx.typert.local.get('harmonyDesktop/request')).toBeUndefined()
    const file = join(world, 'state/harmony_mobile_admission.json'), saved = JSON.parse(await readFile(file, 'utf8'))
    expect(saved.global).toEqual({ state: 'ready', desktopId, profileId: 'phase32-profile' })
    expect(ctx.llm.getOfflineReplayCounts().realCalls).toBe(0)
    await writeFile(new URL('../evidence/phase62-phase32-journal-recovery.json', import.meta.url), JSON.stringify({ missingRecoveryRejected: true, repeatedCreationRejected: true, ownerChangeRejected: true, originalMarkerPreserved: true, endpointsWithdrawn: true, models: 0, userData: false }, null, 2) + '\n')
  } finally { await ctx.fiber.dispose() }
})

it('installable production binding executes four fixed responses through in-process Gateway with durable lost receipt/reopen/rich/cancel', async () => {
  const { ctx, world } = await composition('phase32-production-flow')
  let plugin: ReturnType<typeof ctx.plugin> | undefined
  try {
    const identity = await devices(ctx), sessionId = SessionId('phase32-session'), foreignId = SessionId('phase32-foreign')
    await ctx.sessionController.create({ sessionId, cwd: world }); await ctx.sessionController.create({ sessionId: foreignId, cwd: world })
    identity.grants.set(identity.peer, scope(sessionId))
    const replay = await installFourResponses(ctx, world)
    const upload = vi.spyOn(ctx.deepseekLlmApiExtensions, 'prepare').mockImplementation(async () => { throw new Error('UPLOAD_DISABLED') })
    plugin = ctx.plugin(Plugin, { enabled: true, desktopId, profileId: 'phase32-profile', journalMode: 'create' }); await plugin
    const phone = sender(ctx, identity.peer, 'flow'), controller = new AbortController()
    const source = await followProfile(ctx, identity.peer, { argument: phone.argument('session.sync', { sessionId, afterSeq: -1 }), resume: { instance: null, relayCursor: -1 } }, controller.signal)
    const iterator = source[Symbol.asyncIterator]()
    const reset = object((await iterator.next()).value); expect(reset.mode).toBe('desktop-profile'); expect(reset.kind).toBe('reset')
    const originalPrompt = ctx.sessionController.prompt.bind(ctx.sessionController)
    let originalFailure: unknown, originalTaskCalls = 0, loseReply = true
    const prompt = vi.spyOn(ctx.sessionController, 'prompt').mockImplementation(async (request: SessionPromptRequest, signal: AbortSignal) => {
      if (request.requestId === 'phase32-task') originalTaskCalls++
      try { await originalPrompt(request, signal) } catch (error) { originalFailure = error; throw error }
      if (request.requestId === 'phase32-task' && loseReply) { loseReply = false; throw new Error('FIXED_LOST_PROMPT_REPLY') }
      return { accepted: true }
    })
    const task = { sessionId, requestId: 'phase32-task', text: 'Show the fixed replay mobile forms.' }
    await expect(phone.request('task.submit', task)).rejects.toMatchObject({ code: 'unknown-outcome' })
    if (originalFailure !== undefined) throw originalFailure
    await ctx.agents.get(sessionId)!.whenIdle()
    expect(await phone.request('task.submit', task)).toMatchObject({ accepted: true, state: 'accepted' })
    expect(prompt).toHaveBeenCalledTimes(1)
    const streamed = object((await iterator.next()).value); expect(streamed.kind).toBe('event')
    controller.abort(); await iterator.return?.()
    const event = ctx.sessions.get(sessionId)!.snapshotEvents().find(event => event.type === 'assistant/message')
    if (event?.type !== 'assistant/message') throw new Error('Fixed real assistant message missing')
    const mountRequest = { sessionId, messageId: event.data.message.id, blockId: authoredBlockId(event.data.message.id, 'phone-form'), guestProtocol: 'lumina-rich/1' }
    const mounted = object(await phone.request('rich.mount', mountRequest)), snapshot = object(mounted.snapshot), draft = object(snapshot.draft), manifest = object(snapshot.manifest)
    const snapshotRead = vi.spyOn(ctx.richInline, 'snapshot')
    await phone.request('rich.snapshot', { mountId: string(mounted.mountId) })
    const hostRequest = snapshotRead.mock.calls.at(-1)?.[0]
    expect(hostRequest?.sessionId).toBe(sessionId)
    if (hostRequest === undefined) throw new Error('Canonical mount request missing')
    await expect(async () => ctx.richInline.snapshot({ ...hostRequest, sessionId: foreignId })).rejects.toThrow('MOUNT_SESSION_MISMATCH')
    await expect(phone.request('rich.snapshot', { mountId: string(mounted.mountId), sessionId: foreignId })).rejects.toMatchObject({ code: 'scope-denied' })
    const action = { mountId: string(mounted.mountId), actionId: 'phase3-action', actionName: 'submit', targetActionId: null, expectedDataRevision: number(snapshot.dataRevision),
      values: { title: 'Final mobile input', count: '7' }, fileGrants: [], draft: { baseRevision: number(draft.draftRevision), stateSchemaVersion: number(manifest.stateSchemaVersion), fields: { title: 'Final mobile input', count: '7' }, dirty: ['title', 'count'] } }
    const receipt = await phone.request('rich.invoke', action)
    expect(await phone.request('rich.invoke', action)).toEqual(receipt)
    await vi.waitFor(async () => { expect(await phone.request('rich.status', { mountId: action.mountId, actionId: action.actionId })).toMatchObject({ state: 'completed', terminal: true }) })
    await ctx.agents.get(sessionId)!.whenIdle()
    await plugin.dispose(); plugin = undefined
    expect(ctx.typert.local.get('harmonyDesktop/request')).toBeUndefined()
    plugin = ctx.plugin(Plugin, { enabled: true, desktopId, profileId: 'phase32-profile' }); await plugin
    const reopened = object(await phone.request('rich.mount', mountRequest))
    expect(await phone.request('rich.invoke', { ...action, mountId: string(reopened.mountId) })).toEqual(receipt)
    expect(await phone.request('task.submit', task)).toMatchObject({ accepted: true }); expect(originalTaskCalls).toBe(1)
    await phone.request('task.submit', { sessionId, requestId: 'phase32-cancel', text: 'Hold fourth fixed response for cancellation.' })
    await vi.waitFor(async () => { await expect(access(replay.readyFile)).resolves.toBeUndefined() })
    expect(await phone.request('session.cancel', { sessionId })).toEqual({ accepted: true })
    await ctx.agents.get(sessionId)!.whenIdle()
    const counts = ctx.llm.getOfflineReplayCounts(); replay.handle.assertConsumed(); ctx.llm.assertOfflineReplayConsumed(); ctx.llm.assertZeroRealCalls()
    expect(upload).not.toHaveBeenCalled(); expect(ctx.sessions.get(foreignId)!.snapshotEvents().some(event => event.type === 'turn/start')).toBe(false)
    await identity.revoke(); await plugin.dispose(); plugin = undefined
    expect(identity.callbacks.size).toBe(0); expect(ctx.typert.local.get('harmonyDesktop/follow')).toBeUndefined()
    await ctx.sessionPersistence.flush()
    await writeFile(new URL('../evidence/phase62-phase32-production-flow.json', import.meta.url), JSON.stringify({ layer: 'actual production ports and admission, real Gateway/SessionController/RichInline with synthetic profile and fixed replay', counts,
      fourResponsesConsumed: true, realModels: 0, uploads: upload.mock.calls.length, listenerOpened: false, promptCallsForOriginalTask: 1, lostReceiptReconciled: true, richCompleted: true, reopenActionDuplicate: true, cancelAdmitted: true,
      originalSession: sessionId, foreignSessionExecuted: false, approvalResponseSupported: false, revokedCleanup: true, descriptorsWithdrawn: true, installedUserDesktopVerified: false, deviceQualified: false }, null, 2) + '\n')
  } finally { await plugin?.dispose(); await ctx.fiber.dispose() }
}, 30000)
