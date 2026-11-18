/** Native Index creation, replay dispatch and explicitly granted workspace review over the device carrier. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CommandId } from '@deepseek-ai/dsh-commands/types'
import { installLlmReplay } from '@deepseek-ai/dsh-llm-replay'
import { createAssistantMessage, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import { createWorkspaceCipherFixture } from './workspace-cipher-fixture.ts'
import type { WorkspaceWssTls } from './workspace-memory-relay.ts'
import type { WorkspaceStandaloneWssInputs } from './workspace-standalone-wss.ts'
import { WorkspaceLivePublisher } from './workspace-live.ts'
import { installWorkspaceResponseBodyFixture } from './workspace-response-body-fixture.ts'
import { id } from '../src/protocol.ts'
import { workspaceChunkSchema, workspaceResponseSchema, type WorkspaceHandle, type WorkspaceRequest } from '../src/workspace-protocol.ts'

/** @param ctx - copied installed services. @param world - private replay profile. @param clientRoot - lab root. @param shellIndex - sealed package entry. @param fixtureConfiguration - independent app token. @param mode - creation only, four native replay prompts, or both plus opening the created Session in the granted workspace. @param fixture - packaged relay and panel options. The blank-workspace check opens the new Session before any dispatch. @returns verified native, model request and persisted creation results. */
export async function runCreationCipherEmulator(ctx: Context, world: string, clientRoot: string, shellIndex: string, fixtureConfiguration: string, mode: 'create' | 'work' | 'workspace', fixture: { packagedDesktopRelay?: string; panelTargetPackage?: string; nativeWssTls?: WorkspaceWssTls; standaloneWss?: WorkspaceStandaloneWssInputs; reconnectReview?: boolean; pluginBootFault?: boolean; revocationReview?: boolean; creationAckLoss?: boolean; blankWorkspace?: boolean; pinnedSessionId?: string; pinnedInitializationFailure?: boolean; sourceWorkspaceAccess?: boolean; devflowSessionSettings?: boolean; workspaceSessionHandoff?: boolean; workspaceHandoffCommandTail?: true; workspaceHandoffPagedHistory?: true; workspaceResponseBodyReview?: true; startupTimeline?: { readonly hostChunkBytes: 524288 | 1048576 }; creationDispatchHostChunkBytes?: 1048576 } = {}) {
  const verifyWorkspace = mode === 'workspace' && !fixture.creationAckLoss
  const blankWorkspace = fixture.blankWorkspace === true
  const pinnedSessionId = fixture.pinnedSessionId
  const verifyDispatch = mode !== 'create' && !fixture.creationAckLoss && !blankWorkspace && pinnedSessionId === undefined
  assert.ok(!blankWorkspace || verifyWorkspace && fixture.reconnectReview === true && fixture.panelTargetPackage === 'dsh-devflow')
  assert.ok(!fixture.devflowSessionSettings || blankWorkspace)
  assert.ok(!fixture.workspaceSessionHandoff || blankWorkspace && fixture.devflowSessionSettings && fixture.standaloneWss !== undefined)
  assert.ok(!fixture.workspaceHandoffCommandTail || fixture.workspaceSessionHandoff)
  const pagedBriefing = fixture.workspaceHandoffPagedHistory === true
  assert.ok(!pagedBriefing || blankWorkspace && fixture.workspaceHandoffCommandTail)
  assert.ok(pinnedSessionId === undefined || verifyWorkspace && !blankWorkspace && !fixture.reconnectReview && !fixture.pluginBootFault && !fixture.revocationReview)
  assert.ok(!fixture.pinnedInitializationFailure || pinnedSessionId !== undefined)
  assert.ok(!fixture.startupTimeline || pinnedSessionId !== undefined && !fixture.pinnedInitializationFailure && fixture.standaloneWss !== undefined)
  assert.ok(fixture.creationDispatchHostChunkBytes === undefined || verifyWorkspace && verifyDispatch && fixture.reconnectReview === true && fixture.standaloneWss !== undefined)
  assert.ok(!fixture.sourceWorkspaceAccess || pinnedSessionId !== undefined)
  assert.ok(!fixture.workspaceResponseBodyReview || pinnedSessionId !== undefined && fixture.sourceWorkspaceAccess === true && !fixture.pinnedInitializationFailure)
  assert.ok(fixture.nativeWssTls === undefined || verifyWorkspace)
  assert.ok(fixture.standaloneWss === undefined || mode === 'workspace' && fixture.nativeWssTls === undefined)
  assert.ok(fixture.reconnectReview !== true || fixture.standaloneWss !== undefined)
  assert.ok(!fixture.creationAckLoss || fixture.reconnectReview === true && !fixture.pluginBootFault && !fixture.revocationReview)
  assert.ok(fixture.pluginBootFault !== true || fixture.standaloneWss !== undefined && fixture.panelTargetPackage === 'dsh-devflow' && fixture.reconnectReview !== true)
  assert.ok(!fixture.revocationReview || fixture.standaloneWss !== undefined && fixture.panelTargetPackage === 'dsh-devflow' && !fixture.reconnectReview && !fixture.pluginBootFault)
  const faultName = 'dsh-workspace-boot-fault-fixture'
  const faultClientPresent = () => ctx.clientModules.graph().entries.some(row => row.id === faultName)
  if (fixture.pluginBootFault) assert.ok(faultClientPresent())
  const { token } = z.object({ schema: z.literal('harmony-workspace-native-fixture/1'), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(JSON.parse(await readFile(fixtureConfiguration, 'utf8')))
  const file = join(world, 'creation-four-response-budget.json')
  await writeFile(file, JSON.stringify(Array.from({ length: 4 }, (_, index) => {
    const text = 'CREATED_WORKER_RESPONSE_' + (index + 1)
    const chunks: StreamChunk[] = verifyDispatch ? [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text },
      { type: 'block-end', index: 0, block: { type: 'text', text } }, { type: 'finish', reason: { kind: 'stop' } }] : [{ type: 'finish', reason: { kind: 'stop' } }]
    return { kind: 'chunks', chunks }
  })) + '\n')
  const calls: GenerateOptions<string>[] = []
  const stopCalls = ctx.on('llm-replay/request', options => { calls.push(options) })
  const replay = installLlmReplay(ctx, { file, overrideFile: file, offline: true, providers: [{ id: 'workspace-creation-replay', models: [
    { id: 'creation-main', contextWindow: 100000, defaultMaxTokens: 1000 },
    { id: 'worker-model', contextWindow: 100000, defaultMaxTokens: 1000, reasoningEfforts: ['low', 'high'] },
  ] }] })
  const server = createServer(), tasks = new Set<Promise<void>>(), errors: string[] = [], lifetime = new AbortController()
  let cipher: Awaited<ReturnType<typeof createWorkspaceCipherFixture>> | undefined
  let responseBodies: ReturnType<typeof installWorkspaceResponseBodyFixture> | undefined
  const stopDeviceLog = verifyWorkspace ? ctx.logger.exporter({
    levels: { default: -1, 'harmony-device': 2 },
    export({ name, args }) {
      if (name === 'harmony-device' && args[0] === 'Device %s failed: %s') {
        console.info('WORKSPACE_CREATION_DEVICE_FAILURE ' + JSON.stringify({ operation: args[1], detail: args[2] }))
      }
    },
  }) : undefined
  try {
    if (fixture.workspaceResponseBodyReview) responseBodies = installWorkspaceResponseBodyFixture(ctx)
    const before = ctx.agentDefaultModel.currentSelection()
    const baseline = pinnedSessionId === undefined ? await ctx.sessionController.create({ cwd: world }) : { sessionId: id<'SessionId'>(pinnedSessionId) }
    const handoffTitle = fixture.workspaceSessionHandoff ? 'Synthetic workspace handoff target' : undefined
    const handoffReceiptCount = fixture.workspaceHandoffCommandTail ? 24 : 0
    const handoffHistory = handoffReceiptCount > 0 ? '蓝桥样例的验证编号已更新' : 'Existing synthetic history for the Web handoff target.'
    const recentTurns = pagedBriefing ? 27 : 0
    const recentText = (turn: number) => `合成简报之后的第 ${turn - 1} 次跟进已完成。`
    const handoffReceiptText = (index: number) => 'Synthetic workspace grant receipt ' + index
    const fieldSizeMarkdown = (turn: number) => pagedBriefing && turn <= 3
      ? '\n\n' + Array.from({ length: turn === 1 ? 9 : 8 }, (_, index) => `[unused-${index}]: https://unused.invalid/` + 'x'.repeat(64256)).join('\n')
      : ''
    if (handoffTitle !== undefined) {
      const session = ctx.sessions.get(baseline.sessionId)
      assert.ok(session)
      session.append('turn/start', { turn: 1 })
      const prompt = handoffReceiptCount > 0 ? '请查看这份合成简报。' : handoffHistory
      session.append('user/message', createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }), { surfaceOp: 'append' })
      if (handoffReceiptCount > 0) {
        const markdown = '### 合成简报\n\n- 校验标准工作区的会话切换。\n\n'
          + '本期记录覆盖桌面插件与鸿蒙移动端的标准工作区校验，'
          + `**${handoffHistory}**，后续将在隔离环境核对窗口关闭后的原生会话返回。`
        const message = createAssistantMessage({ content: [{ type: 'text', text: markdown + fieldSizeMarkdown(1) }], source: { provider: 'fixed', model: 'fixed' } })
        session.append('assistant/message', { turn: 1, step: 1, stream: [], message }, { surfaceOp: 'append' })
      }
      session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      for (let turn = 2; turn <= recentTurns + 1; turn++) {
        session.append('turn/start', { turn })
        session.append('user/message', createUserMessage({ content: [{ type: 'text', text: `合成跟进 ${turn - 1}` }], source: { kind: 'user' } }), { surfaceOp: 'append' })
        const message = createAssistantMessage({ content: [{ type: 'text', text: recentText(turn) + fieldSizeMarkdown(turn) }], source: { provider: 'fixed', model: 'fixed' } })
        session.append('assistant/message', { turn, step: 1, stream: [], message }, { surfaceOp: 'append' })
        session.append('turn/end', { turn, reason: { kind: 'completed' } })
      }
      for (let index = 1; index <= handoffReceiptCount; index++) {
        const commandId = brandString<CommandId>('synthetic-handoff-grant-' + index)
        session.append('command/run', { commandId, name: 'harmony-device', source: { kind: 'user' } })
        session.append('command/done', { commandId, kind: 'success', text: handoffReceiptText(index) })
      }
      await ctx.sessionController.rename({ sessionId: baseline.sessionId, title: handoffTitle })
      await ctx.sessionPersistence.flush()
      await ctx.workspaceRegistry.pinSession(baseline.sessionId)
    }
    const sessionsBefore = (await ctx.sessionController.list({}, lifetime.signal)).items.map(row => row.sessionId)
    if (pinnedSessionId !== undefined) {
      assert.deepEqual(sessionsBefore, [baseline.sessionId])
      await ctx.workspaceRegistry.pinSession(baseline.sessionId)
      assert.deepEqual(ctx.workspaceRegistry.pinnedSessionIds, [baseline.sessionId])
    }
    const config = JSON.parse(await readFile(join(clientRoot, 'product.config.json'), 'utf8'))
    const fieldPinnedRead = pinnedSessionId !== undefined && fixture.startupTimeline === undefined && !fixture.pinnedInitializationFailure
    const maxChunkBytes = pagedBriefing ? z.literal(1048576).parse(config.core.workspace.maxChunkBytes)
      : fixture.startupTimeline?.hostChunkBytes ?? fixture.creationDispatchHostChunkBytes ?? 524288
    const earlierPages = new Map<WorkspaceHandle, { bytes: number; received: number; chunks: number[]; done: boolean }>()
    const observeWorkspaceResult = (request: WorkspaceRequest, result: unknown) => {
      if (request.operation === 'fetch' && new URL(request.url).pathname === '/api/session/page') {
        const { body, status } = workspaceResponseSchema.parse(result)
        assert.equal(status, 200)
        assert.ok(!earlierPages.has(body.id))
        earlierPages.set(body.id, { bytes: body.bytes, received: 0, chunks: [], done: false })
        console.info('WORKSPACE_EARLIER_PAGE ' + JSON.stringify({ status, bytes: body.bytes }))
      }
      if (request.operation !== 'read') return
      const page = earlierPages.get(request.id)
      if (page === undefined) return
      const chunk = workspaceChunkSchema.parse(result)
      assert.ok(!page.done)
      assert.equal(chunk.offset, page.received)
      const bytes = Buffer.from(chunk.body, 'base64url').byteLength
      page.chunks.push(bytes)
      page.received += bytes
      page.done = chunk.done
      console.info('WORKSPACE_EARLIER_CHUNK ' + JSON.stringify({ offset: chunk.offset, bytes, done: chunk.done }))
    }
    cipher = await createWorkspaceCipherFixture(ctx, config.relay, shellIndex, mode === 'workspace' ? { maxChunkBytes, roomTtlMs: 540000,
      ...(pagedBriefing ? { observeWorkspaceResult } : {}),
      ...(fieldPinnedRead ? { desktopRelayCaps: { maxPlaintextBytes: 1048576, maxFrameBytes: 2097152, maxQueuedBytes: 4194304 }, wireMaxRequestBytes: 1048576 } : {}),
      ...(fixture.nativeWssTls === undefined ? {} : { nativeWssTls: fixture.nativeWssTls }),
      ...(fixture.standaloneWss === undefined ? {} : { standaloneWss: fixture.standaloneWss }),
      ...(fixture.packagedDesktopRelay === undefined ? {} : { packagedDesktopRelay: fixture.packagedDesktopRelay }),
      ...(fixture.sourceWorkspaceAccess ? { sourceWorkspaceAccess: true } : {}),
      ...(fixture.revocationReview ? { revocationReview: true } : {}),
      ...(fixture.creationAckLoss ? { creationAckLoss: true } : {}),
      ...(fixture.startupTimeline ? { traceWorkspaceRequests: true } : {}),
      ...(fixture.reconnectReview === true && !pagedBriefing ? { reconnectReview: true } : {}) } : { grantWorkspace: false })
    const owner = cipher
    assert.ok(owner.creationOptions.presets.some(row => row.id === 'minimal' && !row.isDefault))
    server.on('request', (request, response) => {
      const work = (async () => {
        if (request.method !== 'POST' || !['/cipher', '/cipher-bootstrap'].includes(request.url ?? '') || request.headers['x-workspace-fixture'] !== token) { response.writeHead(403).end(); return }
        if (owner.wss !== undefined && request.url === '/cipher') { response.writeHead(403).end(); return }
        let raw = ''; for await (const bytes of request) { raw += bytes; if (Buffer.byteLength(raw) > 3 * 1024 * 1024) throw new Error('creation frame capacity') }
        const value = request.url === '/cipher-bootstrap' ? { ...await owner.bootstrap(), sessionId: baseline.sessionId } : owner.exchange(JSON.parse(raw))
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(value))
      })().catch(error => { errors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end() })
      tasks.add(work); void work.finally(() => tasks.delete(work))
    })
    await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
    const address = server.address(); assert.ok(address && typeof address !== 'string')
    if (owner.wss !== undefined) {
      const bypass = await fetch('http://127.0.0.1:' + address.port + '/cipher', { method: 'POST', body: '{}',
        headers: { 'x-workspace-fixture': token }, signal: AbortSignal.timeout(5000) })
      assert.equal(bypass.status, 403, 'An authorized fixture token cannot use the old HTTP frame carrier')
    }
    await writeFile(join(clientRoot, 'evidence/workspace-emulator-active.json'), JSON.stringify({ world, hostPort: address.port, devicePort: 18082, sessionId: baseline.sessionId,
      startedAt: new Date().toISOString(), app: 'local.dsh.mobile.workspacecheck', scenario: 'creation', creationWork: verifyDispatch, creationWorkspace: verifyWorkspace, encryptedCarrier: true,
      ...(owner.wss === undefined ? {} : { nativeWss: { hostPort: owner.wss.hostPort, devicePort: owner.wss.devicePort } }),
      panelTargetPackage: fixture.panelTargetPackage, reconnectReview: owner.reconnectReview !== undefined, pluginBootFault: fixture.pluginBootFault,
      revocationReview: fixture.revocationReview, creationAckLoss: fixture.creationAckLoss, ...(pinnedSessionId === undefined ? {} : { pinnedRead: true }),
      ...(handoffTitle === undefined ? {} : { handoffTitle, handoffHistory }),
      ...(handoffReceiptCount === 0 ? {} : { handoffLastReceipt: handoffReceiptText(handoffReceiptCount) }),
      ...(recentTurns === 0 ? {} : { handoffNativeTail: recentText(recentTurns + 1) }),
      ...(responseBodies === undefined ? {} : { workspaceResponseBodyReview: true }),
      creationPreset: 'minimal', options: owner.creationOptions, statusFormat: 'immutable-sequence' }, null, 2) + '\n')
    const live = new WorkspaceLivePublisher(world), deadline = Date.now() + 20 * 60 * 1000
    const review = owner.reconnectReview
    const revoke = owner.revocationReview
    const settingsSnapshot = z.object({ revision: z.number().int().nonnegative(), draft: z.json(),
      effective: z.object({ mode: z.enum(['direct', 'auto']) }).passthrough() })
    const readSettings = async (sessionId?: string) => settingsSnapshot.parse(await ctx.typertGateway.invoke({ namespace: 'devflowToolbox', method: 'settingsGet',
      args: { request: sessionId === undefined ? { scope: 'global' } : { scope: 'session', sessionId } },
      peer: ctx.connection.browserPeer, signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(10000)]) }))
    let originalSettings: Awaited<ReturnType<typeof readSettings>> | undefined
    let settingsUnchanged = false
    let scopeReview: { targetId: string; global: z.infer<typeof settingsSnapshot>; other: z.infer<typeof settingsSnapshot>;
      saved: boolean; readBack: boolean; restored: boolean } | undefined
    const requested = async (file: string) => {
      try { const info = await stat(join(world, file)); assert.ok(info.isFile() && info.size === 0); return true }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; return false }
    }
    let reconnected = false, regranted = false, faultDisabled = false, faultDisableElapsedMs: number | undefined
    let finish: object | undefined
    while (Date.now() < deadline) {
      await live.publish(calls.length, errors)
      if (review !== undefined && !reconnected && review.desktopClosed() && await requested('native-reconnect-request')) {
        await review.reconnect()
        await writeFile(join(world, 'native-reconnect-ready'), '', { flag: 'wx' })
        reconnected = true
      }
      if (review !== undefined && !regranted && await requested('native-regrant-request')) {
        await review.regrant()
        await writeFile(join(world, 'native-regrant-ready'), '', { flag: 'wx' })
        regranted = true
      }
      if (fixture.pluginBootFault && !faultDisabled && await requested('workspace-plugin-disable.request')) {
        assert.ok(faultClientPresent())
        const started = performance.now()
        const change = await ctx.pluginManager.setBundleEnabled(faultName, false)
        assert.equal(change.application, 'applied', JSON.stringify(change)); assert.equal(change.changed, true)
        assert.equal((await ctx.pluginManager.listBundles()).find(bundle => bundle.name === faultName)?.enabled, false)
        assert.equal(faultClientPresent(), false)
        faultDisabled = true
        faultDisableElapsedMs = Math.round(performance.now() - started)
        await writeFile(join(world, 'workspace-plugin-disable.done'), '', { flag: 'wx' })
      }
      if (revoke !== undefined && originalSettings === undefined && await requested('desktop-workspace-revoke.request')) {
        originalSettings = await readSettings()
        assert.equal(originalSettings.effective.mode, 'direct')
        await revoke.revoke()
        await writeFile(join(world, 'desktop-workspace-revoke.done'), '', { flag: 'wx' })
      }
      if (revoke !== undefined && originalSettings !== undefined && !settingsUnchanged && await requested('desktop-workspace-audit.request')) {
        assert.deepEqual(await readSettings(), originalSettings)
        settingsUnchanged = true
        await writeFile(join(world, 'desktop-workspace-audit.done'), '', { flag: 'wx' })
      }
      if (revoke !== undefined && settingsUnchanged && !revoke.observed().regranted && await requested('desktop-workspace-regrant.request')) {
        await revoke.regrant()
        await writeFile(join(world, 'desktop-workspace-regrant.done'), '', { flag: 'wx' })
      }
      if (fixture.devflowSessionSettings && scopeReview === undefined && await requested('devflow-session-target.request')) {
        const created = (await ctx.sessionController.list({}, lifetime.signal)).items.filter(row => !sessionsBefore.includes(row.sessionId))
        assert.equal(created.length, 1)
        const targetId = created[0]!.sessionId, title = 'DevFlow 同名验收会话'
        await ctx.sessionController.rename({ sessionId: baseline.sessionId, title })
        await ctx.sessionController.rename({ sessionId: targetId, title })
        const [global, other, target] = await Promise.all([readSettings(), readSettings(baseline.sessionId), readSettings(targetId)])
        assert.equal(target.revision, 0); assert.deepEqual(target.draft, {}); assert.equal(target.effective.mode, 'direct')
        scopeReview = { targetId, global, other, saved: false, readBack: false, restored: false }
        await writeFile(join(world, 'devflow-session-target.json'), JSON.stringify({ targetId, otherId: baseline.sessionId, title }), { flag: 'wx' })
        await writeFile(join(world, 'devflow-session-target.done'), '', { flag: 'wx' })
      }
      if (scopeReview !== undefined) {
        const verifyTarget = async (revision: number, draft: object, mode: 'auto' | 'direct') => {
          const [global, other, target] = await Promise.all([readSettings(), readSettings(baseline.sessionId), readSettings(scopeReview!.targetId)])
          assert.deepEqual(global, scopeReview!.global); assert.deepEqual(other, scopeReview!.other)
          assert.equal(target.revision, revision); assert.deepEqual(target.draft, draft); assert.equal(target.effective.mode, mode)
        }
        if (!scopeReview.saved && await requested('devflow-session-saved.request')) {
          await verifyTarget(1, { mode: 'auto' }, 'auto'); scopeReview.saved = true
          await writeFile(join(world, 'devflow-session-saved.done'), '', { flag: 'wx' })
        }
        if (scopeReview.saved && !scopeReview.readBack && await requested('devflow-session-readback.request')) {
          await verifyTarget(1, { mode: 'auto' }, 'auto'); scopeReview.readBack = true
          await writeFile(join(world, 'devflow-session-readback.done'), '', { flag: 'wx' })
        }
        if (scopeReview.readBack && !scopeReview.restored && await requested('devflow-session-restored.request')) {
          await verifyTarget(2, {}, 'direct'); scopeReview.restored = true
          await writeFile(join(world, 'devflow-session-restored.done'), '', { flag: 'wx' })
        }
      }
      try { finish = JSON.parse(await readFile(join(world, 'finish.json'), 'utf8')) as object; break }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
      await delay(500)
    }
    assert.ok(finish && 'passed' in finish && finish.passed === true, 'Native encrypted Index acceptance must explicitly pass')
    if (pinnedSessionId !== undefined) {
      const workspaceChecks = fixture.pinnedInitializationFailure
        ? { nativePinnedWorkspaceInitializationRefused: z.literal(true), nativePinnedHistoryRetainedAfterRefusal: z.literal(true) }
        : { nativePinnedWorkspaceOpened: z.literal(true), nativePinnedWorkspaceReturned: z.literal(true) }
      z.object({ checks: z.object({ nativePinnedHistoryOpened: z.literal(true), ...workspaceChecks }) }).parse(finish)
    }
    else if (verifyWorkspace && !pagedBriefing) {
      z.object({ checks: z.object({ nativeCreatedWorkspaceLoaded: z.literal(true), nativeCreatedDraftRestored: z.literal(true) }) }).parse(finish)
      if (fixture.panelTargetPackage !== undefined) z.object({ checks: z.object({ nativeCreatedPluginPanelOpened: z.literal(true), nativeCreatedPanelDraftRestored: z.literal(true) }) }).parse(finish)
    }
    if (fixture.pluginBootFault) {
      assert.ok(faultDisabled && !faultClientPresent())
      z.object({ checks: z.object({ nativeOptionalPluginFailureShown: z.literal(true), nativeDraftSurvivedPluginFailure: z.literal(true),
        desktopPluginDisableAcknowledged: z.literal(true) }) }).parse(finish)
    }
    if (revoke !== undefined) {
      assert.ok(settingsUnchanged && originalSettings && revoke.observed().regranted && revoke.observed().desktopCarrierRetained)
      assert.deepEqual(await readSettings(), originalSettings)
      z.object({ checks: z.object({ revokedDevflowWriteDisabled: z.literal(true), revokedDevflowReadDisabled: z.literal(true),
        nativeDraftSurvivedDesktopRevocation: z.literal(true), revokedWorkspaceReopenDenied: z.literal(true), sameConnectionDevflowRegranted: z.literal(true) }) }).parse(finish)
    }
    if (review !== undefined && !fixture.creationAckLoss) {
      z.object({ checks: z.object({ nativeReconnectedSameProcess: z.literal(true), nativeReconnectedGrantRequired: z.literal(true),
        nativeRegrantedWorkspaceReopened: z.literal(true) }) }).parse(finish)
      if (fixture.panelTargetPackage !== undefined) z.object({ checks: z.object({ nativeMissingPluginReturnedToDirectory: z.literal(true) }) }).parse(finish)
      assert.deepEqual(review.observed(), { reconnects: 1, denials: 1, regranted: true })
    }
    if (fixture.devflowSessionSettings && !pagedBriefing) {
      assert.ok(scopeReview?.saved && scopeReview.readBack && scopeReview.restored)
      z.object({ checks: z.object({ nativeDevflowTargetExplicit: z.literal(true), nativeDevflowSessionSaved: z.literal(true),
        nativeDevflowSessionReadBack: z.literal(true), nativeDevflowSessionInherited: z.literal(true) }) }).parse(finish)
    }
    if (handoffTitle !== undefined && handoffReceiptCount === 0) {
      z.object({ checks: z.object({ nativeWorkspaceReturnedToOtherSession: z.literal(true), nativeOriginalDraftAfterSessionSwitch: z.literal(true) }) }).parse(finish)
    }
    const handoffViewport = handoffReceiptCount === 0 ? undefined : z.object({ checks: z.object({
      nativeBriefingOpenedDirectly: z.literal(true), nativeBriefingReturnedSameSession: z.literal(true),
      nativeHandoffHistoryInitiallyVisible: z.boolean(), nativeHandoffTailInitiallyVisible: z.boolean(),
      nativeHandoffHistoryVisibleAfterRead: z.literal(true), nativeHandoffHistorySwipes: z.number().int().min(0).max(recentTurns === 0 ? 3 : 24),
      ...(recentTurns === 0 ? {} : { nativeHandoffHistoryPaged: z.literal(true) }),
    }) }).parse(finish).checks
    if (handoffViewport !== undefined && !handoffViewport.nativeHandoffHistoryInitiallyVisible) {
      assert.ok(handoffViewport.nativeHandoffTailInitiallyVisible && handoffViewport.nativeHandoffHistorySwipes > 0)
    }
    const connections = review === undefined ? 1 : 2
    if (owner.wss !== undefined) {
      z.object({ checks: z.object({ nativeWssAuthenticated: z.literal(true) }) }).parse(finish)
      assert.deepEqual(owner.wss.observed, { tlsProtocols: Array(connections * 2).fill('TLSv1.3'), controlRequests: connections, dataRequests: connections, rejected: 0, terminalFailures: 0 })
    }
    if (fixture.standaloneWss !== undefined) assert.deepEqual(owner.observed().standaloneWss, { tlsProtocols: Array(connections * 4).fill('TLSv1.3'), connections: connections * 4 })
    assert.deepEqual(errors, []); assert.equal(calls.length, verifyDispatch ? 4 : 0); ctx.llm.assertZeroRealCalls()
    if (verifyDispatch) { replay.assertConsumed(); ctx.llm.assertOfflineReplayConsumed() }
    if (pagedBriefing) {
      assert.deepEqual(owner.managedActions, [])
      assert.deepEqual((await ctx.sessionController.list({}, lifetime.signal)).items.map(row => row.sessionId), sessionsBefore)
      assert.ok(handoffViewport)
      assert.equal(earlierPages.size, 1)
      const [page] = earlierPages.values()
      assert.ok(page && page.bytes >= 1600000 && page.bytes < 1700000)
      assert.equal(page.received, page.bytes)
      assert.deepEqual(page.chunks, [maxChunkBytes, page.bytes - maxChunkBytes])
      assert.equal(page.done, true)
      return { nativeUi: true, pagedBriefing: true, realEncryptedCarrier: true, createdSessions: 0, modelTurns: 0, replayResponses: 0, realModels: 0,
        earlierPage: { bytes: page.bytes, chunks: page.chunks },
        handoffViewport: { receiptCount: handoffReceiptCount, recentTurns, ...handoffViewport }, finish, errors, cipher: owner.observed() }
    }
    if (pinnedSessionId !== undefined) {
      assert.deepEqual(owner.managedActions, [])
      assert.deepEqual((await ctx.sessionController.list({}, lifetime.signal)).items.map(row => row.sessionId), sessionsBefore)
      if (responseBodies !== undefined) z.object({ checks: z.object({ nativeWorkspaceResponseBodies: z.literal(true) }) }).parse(finish)
      return { nativeUi: true, pinnedRead: true, sessionId: pinnedSessionId, realEncryptedCarrier: true, modelCalls: 0, realModels: 0, sourceWorkspaceAccess: fixture.sourceWorkspaceAccess === true,
        replayResponses: 0, finish, errors, cipher: owner.observed(), ...(responseBodies === undefined ? {} : { responseBodies: responseBodies.observed() }) }
    }
    assert.equal(owner.managedActions.length, 1)
    const action = owner.managedActions[0]!
    assert.deepEqual(action, { action: 'create', projectId: null, agentPreset: 'minimal', model: { provider: 'workspace-creation-replay', model: 'worker-model', reasoningEffort: 'high' } })
    const created = (await ctx.sessionController.list({}, lifetime.signal)).items.filter(row => !sessionsBefore.includes(row.sessionId))
    assert.equal(created.length, 1)
    const createdId = created[0]!.sessionId, session = ctx.sessions.get(id<'SessionId'>(createdId)); assert.ok(session)
    if (fixture.creationAckLoss) {
      const proof = z.object({ recoveredCreationId: z.string(), checks: z.object({ nativeCreationUnconfirmed: z.literal(true),
        nativeReconnectedSameProcess: z.literal(true), nativeCreationRefreshed: z.literal(true), createdAndOpenedWithoutModel: z.literal(true) }) }).parse(finish)
      assert.equal(proof.recoveredCreationId, createdId)
      assert.deepEqual(review?.observed(), { reconnects: 1, denials: 0, regranted: false, lostCreationAck: createdId })
      assert.equal(created[0]!.blank, true)
    }
    assert.equal(ctx.sessionProjections.stateOf(session, 'agentPreset'), 'minimal')
    const selection = (await ctx.sessionController.readModelSelection({ sessionId: createdId })).selected
    assert.deepEqual(selection, action.model); assert.deepEqual(ctx.agentDefaultModel.currentSelection(), before)
    const events = session.snapshotEvents(), turns = events.filter(event => event.type === 'turn/start').length
    assert.equal(turns, verifyDispatch ? 4 : 0)
    if (blankWorkspace) {
      assert.equal(created[0]!.blank, true)
      assert.ok(!events.some(event => event.type === 'user/message' || event.type === 'request/header'))
    }
    const requests = calls.map(call => ({ sessionId: call.sessionId, provider: call.provider, model: call.model, reasoningEffort: call.reasoningEffort }))
    for (const request of requests) assert.deepEqual(request, { sessionId: createdId, ...selection })
    if (verifyDispatch) {
      assert.equal(events.filter(event => event.type === 'turn/end' && event.data.reason.kind === 'completed').length, 4)
      const headers = events.filter(event => event.type === 'request/header')
      assert.ok(headers.length > 0, 'Selected model configuration must be persisted')
      for (const header of headers) {
        const { provider, model, reasoningEffort } = header.data.header.config
        assert.deepEqual({ provider, model, reasoningEffort }, selection)
      }
    }
    await ctx.sessionPersistence.flush()
    const observed = { nativeUi: true, nativePage: 'Index', realEncryptedCarrier: true, cipher: owner.observed(), createdId, actions: owner.managedActions,
      preset: 'minimal', selection, defaultUnchanged: true, createdSessions: 1, modelTurns: turns, requests, replayResponses: calls.length, realModels: 0, errors, finish,
      ...(blankWorkspace ? { blankSessionWorkspace: true } : {}),
      ...(handoffViewport === undefined ? {} : { handoffViewport: { receiptCount: handoffReceiptCount, ...handoffViewport } }),
      ...(scopeReview === undefined ? {} : { devflowSessionSettings: { sessionId: scopeReview.targetId, restoredInheritance: scopeReview.restored,
        globalUnchanged: true, sameTitleSessionUnchanged: true } }),
      ...(review === undefined ? {} : { reconnectReview: review.observed() }),
      ...(revoke === undefined ? {} : { revocationReview: { ...revoke.observed(), settingsUnchanged } }),
      ...(fixture.pluginBootFault ? { faultPlugin: { name: faultName, disabled: faultDisabled, elapsedMs: faultDisableElapsedMs } } : {}) }
    await writeFile(join(world, 'observed.json'), JSON.stringify(observed, null, 2) + '\n')
    return observed
  } finally {
    responseBodies?.dispose()
    stopDeviceLog?.()
    lifetime.abort()
    server.closeAllConnections(); await new Promise<void>(accept => server.close(() => accept()))
    await Promise.all(tasks); await cipher?.close(); stopCalls(); replay.dispose()
  }
}
