/** Sealed package combination on copied installed services; every mutation is scoped to this synthetic profile. */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/dsh-client-modules'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-api-gateway'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { installLlmReplay } from '@deepseek-ai/dsh-llm-replay'
import { id } from '../src/protocol.ts'
import { installWorkspaceDevflowReplay } from './workspace-devflow-replay.ts'
import { installWorkspaceRichReplay } from './workspace-rich-replay.ts'
import { authoredBlockId } from '../../../packages/experimental/rich-inline/src/shared/authored.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { runWorkspaceEmulator } from './workspace-emulator-fixture.ts'
import { runCreationCipherEmulator } from './session-creation-cipher-fixture.ts'
import { createWorkspaceCipherFixture } from './workspace-cipher-fixture.ts'
import { deviceBindingSchema } from '../src/device-binding-protocol.ts'
import { NativeDeviceCore } from '../src/native-device-bridge.ts'
import { DeviceProductRpc } from '../src/device-product-rpc.ts'
import { WorkspaceClient } from '../src/workspace-client.ts'
import { deviceSessionDirectory } from '../src/device-session-directory.ts'
import { deviceWorkspaceOrigin } from '../src/workspace-origin.ts'
import { WORKSPACE_ROUTE_HEADER, workspaceBodySchema, workspaceChunkSchema } from '../src/workspace-protocol.ts'

const packagesSchema = z.array(z.object({ id: z.string(), name: z.string(), stage: z.string(), archive: z.string(), sha256: z.string() }))
const snapshotSchema = z.object({ dataRevision: z.number(), manifest: z.object({ stateSchemaVersion: z.number() }),
  draft: z.object({ draftRevision: z.number(), fields: z.record(z.string(), z.unknown()) }),
  actions: z.array(z.object({ actionId: z.string(), state: z.string(), terminal: z.boolean() })) })
const mountSchema = z.object({ mountId: z.string(), snapshot: snapshotSchema })
const installedForm = { key: 'installed-form', html: '<form><input name="note" value="initial"></form>', css: '', js: '', fallbackText: 'Installed offline form', stateSchemaVersion: 1 }
const standaloneRelayDigest = '584ba9942a89a67b386c1b1018584ea700e47760d7f77e12aec460691a05256f'
type Invoke = (namespace: string, method: string, request: object) => Promise<unknown>

async function devflowSettingsScopes(invoke: Invoke, owner: Invoke, first: SessionId, second: SessionId, allowSecond: () => void) {
  const state = z.object({ revision: z.number(), draft: z.object({ mode: z.enum(['direct', 'auto']).optional() }),
    documents: z.array(z.object({ scope: z.string(), scopeId: z.string() })), effective: z.object({ mode: z.string() }) })
  const targets = z.object({ targets: z.array(z.object({ sessionId: z.string(), projectId: z.string() })) })
  const read = (remote: Invoke, request: object) => remote('devflowToolbox', 'settingsGet', request)
  const write = (remote: Invoke, request: object) => remote('devflowToolbox', 'settingsSave', request)
  const global = { scope: 'global' }
  const baseline = state.parse(await read(owner, global))
  const visible = targets.parse(await read(invoke, global)).targets
  assert.deepEqual(visible.map(row => row.sessionId), [first])
  const ownerTargets = targets.parse(await read(owner, global)).targets
  assert.deepEqual(new Set(ownerTargets.map(row => row.sessionId)), new Set([first, second]))
  const firstProject = ownerTargets.find(row => row.sessionId === first)!.projectId
  const secondProject = ownerTargets.find(row => row.sessionId === second)!.projectId
  assert.notEqual(firstProject, secondProject)
  assert.deepEqual(visible, [{ sessionId: first, projectId: firstProject }])
  const denied = (error: unknown) => error instanceof Error && 'code' in error && ['devflow/denied', 'remote-access/denied'].some(code => code === error.code)
  const preserved: Array<{ request: { scope: string; sessionId: SessionId }; saved: z.infer<typeof state> }> = []
  const deferred: Array<{ request: { scope: string; sessionId: SessionId }; update: object }> = []
  for (const scope of ['project', 'session']) {
    const allowed = { scope, sessionId: first }, blocked = { scope, sessionId: second }
    const allowedBefore = state.parse(await read(invoke, allowed))
    const saved = state.parse(await write(invoke, { ...allowed, expectedRevision: allowedBefore.revision, draft: { mode: 'auto' }, actionId: randomUUID() }))
    assert.equal(saved.revision, allowedBefore.revision + 1)
    assert.equal(saved.effective.mode, 'auto')
    assert.equal(saved.documents.find(row => row.scope === scope)?.scopeId, scope === 'project' ? firstProject : first)
    assert.deepEqual(state.parse(await read(owner, allowed)), saved)
    const blockedBefore = state.parse(await read(owner, blocked))
    const update = { ...blocked, expectedRevision: blockedBefore.revision, draft: { mode: 'auto' }, actionId: randomUUID() }
    await assert.rejects(read(invoke, blocked), denied)
    await assert.rejects(write(invoke, update), denied)
    assert.deepEqual(state.parse(await read(owner, blocked)), blockedBefore)
    preserved.push({ request: allowed, saved })
    deferred.push({ request: blocked, update })
  }
  allowSecond()
  assert.deepEqual(targets.parse(await read(invoke, global)).targets, ownerTargets)
  for (const { request, update } of deferred) {
    const before = state.parse(await read(invoke, request))
    const saved = state.parse(await write(invoke, update))
    assert.equal(saved.revision, before.revision + 1)
    assert.equal(saved.effective.mode, 'auto')
    assert.equal(saved.documents.find(row => row.scope === request.scope)?.scopeId, request.scope === 'project' ? secondProject : second)
    assert.deepEqual(state.parse(await read(owner, request)), saved)
  }
  for (const { request, saved } of preserved) assert.deepEqual(state.parse(await read(owner, request)), saved)
  assert.deepEqual(state.parse(await read(owner, global)), baseline)
  return { initialTargets: 1, expandedTargets: 2, deniedReads: 2, deniedWrites: 2, scopedWritesVerified: 4, globalSettingsUnchanged: true }
}

async function waitFor(test: () => Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + 45000
  do { if (await test()) return; await delay(50) } while (Date.now() < deadline)
  throw new Error('Installed scenario state not reached: ' + label)
}
async function prompt(ctx: Context, sessionId: SessionId, name: string): Promise<void> {
  await ctx.sessionController.prompt({ sessionId, requestId: id<'session-request-id'>(name), mode: 'queue', content: [{ type: 'text', text: 'Synthetic installed acceptance: ' + name }] }, AbortSignal.timeout(45000))
  await ctx.agents.get(sessionId)!.whenIdle(); await ctx.sessionPersistence.flush()
}
async function devflow(ctx: Context, sessionId: SessionId, replay: Awaited<ReturnType<typeof installWorkspaceDevflowReplay>>, invoke: Invoke) {
  await prompt(ctx, sessionId, 'installed-direct'); assert.equal(replay.count(), 1)
  assert.equal(replay.calls[0]!.tools?.some(tool => tool.name === 'devflow_delegate'), false)
  const view = z.object({ revision: z.number() }).parse(await invoke('devflowToolbox', 'settingsGet', { scope: 'global' }))
  await invoke('devflowToolbox', 'settingsSave', { scope: 'global', expectedRevision: view.revision, actionId: randomUUID(), draft: {
    mode: 'auto', selectedPresetId: 'installed-preset', profiles: [{ id: 'installed-worker', label: 'Installed delegate', provider: 'workspace-replay', model: 'worker', fallbackProfileIds: [] }],
    presets: [{ id: 'installed-preset', name: 'Installed route', revision: 1, template: 'custom', purposeBindings: { code: { kind: 'profile', profileId: 'installed-worker', effort: 'high' } } }],
  } })
  await prompt(ctx, sessionId, 'installed-auto'); replay.assertConsumed(); assert.equal(replay.count(), 4)
  const children = replay.calls.filter(call => call.sessionId !== sessionId)
  assert.equal(children.length, 1); assert.equal(children[0]!.model, 'worker'); assert.equal(children[0]!.reasoningEffort, 'high')
  assert.ok(replay.calls.filter(call => call.sessionId === sessionId).every(call => call.model === 'main'))
  const panel = z.object({ runs: z.array(z.object({ status: z.string(), childId: z.string().optional(), resolvedRoute: z.object({ provider: z.string(), model: z.string(), reasoningEffort: z.string().optional() }) })) }).parse(await invoke('devflowToolbox', 'panelGet', { sessionId }))
  const completed = panel.runs.find(run => run.status === 'completed'); assert.ok(completed?.childId)
  assert.deepEqual(completed.resolvedRoute, { provider: 'workspace-replay', model: 'worker', reasoningEffort: 'high' })
  const persisted = await ctx.sessionController.inspect(id<'SessionId'>(completed.childId))
  assert.ok(persisted.events.some(event => event.type === 'request/header' && event.data.header.config.model === 'worker' && event.data.header.config.reasoningEffort === 'high'))
  assert.equal((await ctx.sessionController.readModelSelection({ sessionId })).selected?.model, 'main')
  return { directHasNoDelegationTool: true, readonlyChildCompleted: true, childModel: 'worker', childEffort: 'high', parentModel: 'main', persistedRequestChecked: true }
}
async function rich(ctx: Context, sessionId: SessionId, replay: Awaited<ReturnType<typeof installWorkspaceRichReplay>>, invoke: Invoke, reopen?: () => Promise<void>) {
  await prompt(ctx, sessionId, 'installed-rich-form'); assert.equal(replay.count(), 1)
  const message = ctx.sessions.get(sessionId)!.snapshotEvents().find(event => event.type === 'assistant/message'); assert.ok(message?.type === 'assistant/message')
  const owner = { sessionId, messageId: message.data.message.id, blockId: authoredBlockId(message.data.message.id, installedForm.key) }
  const mount = mountSchema.parse(await invoke('richInline', 'mount', owner)), request = { sessionId, mountId: mount.mountId }
  const snapshot = async () => snapshotSchema.parse(await invoke('richInline', 'snapshot', request))
  const submit = async (actionId: string, note: string) => {
    const state = await snapshot()
    const receipt = z.object({ accepted: z.boolean(), state: z.string().nullable() }).parse(await invoke('richInline', 'invoke', { ...request, actionId, actionName: 'submit', targetActionId: null,
      expectedDataRevision: state.dataRevision, values: { note }, fileGrants: [], draft: { baseRevision: state.draft.draftRevision, stateSchemaVersion: state.manifest.stateSchemaVersion, fields: { note }, dirty: ['note'] } }))
    assert.equal(receipt.accepted, true); assert.equal(receipt.state, 'accepted')
  }
  await submit('workspace-action-completed', 'installed-completed')
  await waitFor(async () => (await snapshot()).actions.some(action => action.actionId === 'workspace-action-completed' && action.state === 'completed'), 'completed action')
  await waitFor(async () => replay.count() === 3, 'third replay response'); await ctx.agents.get(sessionId)!.whenIdle()
  await submit('workspace-action-unresolved', 'installed-unresolved')
  await waitFor(async () => (await snapshot()).actions.some(action => action.actionId === 'workspace-action-unresolved' && action.state === 'outcome_unknown'), 'unresolved action')
  const status = z.object({ state: z.string() }).parse(await invoke('richInline', 'status', { ...request, actionId: 'workspace-action-unresolved' }))
  assert.equal(status.state, 'outcome_unknown'); replay.assertConsumed(); assert.equal(replay.count(), 4)
  const state = await snapshot()
  const saved = z.object({ accepted: z.boolean() }).parse(await invoke('richInline', 'saveDraft', { ...request, draft: { baseRevision: state.draft.draftRevision, stateSchemaVersion: state.manifest.stateSchemaVersion, fields: { note: 'installed-final-draft' }, dirty: ['note'] } }))
  assert.equal(saved.accepted, true); await invoke('richInline', 'dispose', request)
  await reopen?.()
  const restored = mountSchema.parse(await invoke('richInline', 'mount', owner)); assert.equal(restored.snapshot.draft.fields.note, 'installed-final-draft')
  assert.notEqual(restored.mountId, mount.mountId)
  assert.ok(restored.snapshot.actions.some(action => action.actionId === 'workspace-action-unresolved' && action.state === 'outcome_unknown'))
  const restoredStatus = z.object({ state: z.string() }).parse(await invoke('richInline', 'status', {
    sessionId, mountId: restored.mountId, actionId: 'workspace-action-unresolved',
  }))
  assert.equal(restoredStatus.state, 'outcome_unknown')
  await invoke('richInline', 'dispose', { sessionId, mountId: restored.mountId }); assert.equal(replay.count(), 4)
  return { acceptedThenCompleted: true, unresolvedRestored: true, queryDoesNotReplay: true, exactDraftRestored: true }
}

async function standaloneWssInputs(clientRoot: string, tls: string, native: boolean) {
  const relayEntry = join(clientRoot, '.build/workspace-relay-room-diagnostics-qNGJjI/server.mjs')
  assert.equal(createHash('sha256').update(await readFile(relayEntry)).digest('hex'), standaloneRelayDigest)
  const { maxControlFrames } = z.object({ maxControlFrames: z.number().int().positive() })
    .parse(JSON.parse(await readFile(join(clientRoot, 'standalone-relay/config.enabled.example.json'), 'utf8')))
  return { relayEntry, key: await readFile(join(tls, 'key.pem')), cert: await readFile(join(tls, native ? 'leaf.pem' : 'cert.pem')),
    ca: await readFile(join(tls, 'ca.pem')), maxControlFrames, ...(native ? { nativeDevicePort: 18083 } : {}) }
}

async function checkInstalledRouteBoundary(ctx: Context, client: WorkspaceClient, workspaceOrigin: string) {
  const prefix = '/api/workspace-compatibility-fixture', legacy = prefix + '/settings', exact = '/api/workspace-compatibility-owner'
  let legacyCalls = 0, exactCalls = 0
  const stopLegacy = ctx.webServer.register({ kind: 'prefix', path: prefix, handler: (_request, response) => {
    legacyCalls++
    response.end('synthetic prefix route')
  } })
  try {
    const stopExact = ctx.connection.fetch.register({ path: exact, methods: ['GET'], requestBody: 'buffered', fetch: async () => {
      exactCalls++
      return new Response('synthetic owner route')
    } })
    try {
      const desktopOrigin = new URL(ctx.webServer.getOrigin())
      assert.equal(desktopOrigin.protocol, 'http:'); assert.equal(desktopOrigin.hostname, '127.0.0.1')
      const authenticated = new URL(ctx.connection.authenticatedUrl(desktopOrigin.href))
      assert.equal(authenticated.origin, desktopOrigin.origin)
      const owner = await fetch(authenticated, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
      const cookie = owner.headers.getSetCookie().map(row => row.split(';')[0]).join('; ')
      assert.ok(cookie)
      await owner.body?.cancel()
      for (const [path, expected] of [[legacy, 'synthetic prefix route'], [exact, 'synthetic owner route']] as const) {
        const response = await fetch(new URL(path, desktopOrigin), { headers: { cookie }, redirect: 'error', signal: AbortSignal.timeout(5000) })
        assert.equal(response.status, 200); assert.equal(await response.text(), expected)
      }
      for (const [path, status, reason] of [[legacy, 404, 'unregistered'], [exact, 403, 'owner-only']] as const) {
        const response = await client.fetch(new Request(workspaceOrigin + path))
        assert.equal(response.status, status); assert.equal(response.headers.get(WORKSPACE_ROUTE_HEADER), reason)
        z.object({ error: z.object({ code: z.literal('workspace-route-unavailable'), reason: z.literal(reason), message: z.string().min(1) }) }).parse(await response.json())
      }
      assert.equal(legacyCalls, 1); assert.equal(exactCalls, 1)
      return { ownerPrefixStatus: 200, ownerExactStatus: 200, devicePrefixStatus: 404, deviceExactStatus: 403,
        structuredDenials: true, handlersReachedByDevice: 0 }
    } finally { await stopExact() }
  } finally { stopLegacy() }
}

async function traceWorkspace(ctx: Context, world: string, mobileStage: string, clientRoot: string, closeCancellation: boolean) {
  const policy = JSON.parse(await readFile(join(clientRoot, 'product.config.json'), 'utf8')).relay
  const packagedDesktopRelay = join(world, 'package/device-relay-review.mjs')
  const archiveManagerMode = process.env.DSH_HARMONY_WORKSPACE_ARCHIVE_MANAGER
  const grantDeadline = process.env.DSH_HARMONY_WORKSPACE_PACKAGED_GRANT_DEADLINE === '1'
  const pageDiagnostic = z.enum(['on', 'off']).optional().parse(process.env.DSH_HARMONY_WORKSPACE_PAGE_DIAGNOSTIC)
  const useRichReplay = process.env.DSH_HARMONY_WORKSPACE_PACKAGED_RICH_REPLAY === '1'
  assert.ok(!useRichReplay || grantDeadline)
  const tls = process.env.DSH_HARMONY_WORKSPACE_STANDALONE_TLS
  if (tls !== undefined) assert.ok(closeCancellation)
  const standaloneWss = tls === undefined ? undefined : await standaloneWssInputs(clientRoot, tls, false)
  const richReplay = useRichReplay ? await installWorkspaceRichReplay(ctx, world, installedForm) : undefined
  const replay = useRichReplay ? undefined : await installWorkspaceDevflowReplay(ctx, world)
  const large = standaloneWss === undefined ? undefined : 'x'.repeat(715000)
  const stopLarge = large === undefined ? undefined : ctx.on('webserver/index-inject', (rows: IndexInjection[]) => {
    rows.push({ kind: 'global', name: '__DSH_WORKSPACE_STANDALONE_FIXTURE__', value: large })
  })
  try {
    const sessionId = (await ctx.sessionController.create({ cwd: world })).sessionId
    const selected = await ctx.sessionController.readModelSelection({ sessionId })
    assert.ok((await ctx.sessionController.compareAndSelectModel({ sessionId, expectedSelectionRevision: selected.selectionRevision,
      selection: { provider: useRichReplay ? 'workspace-rich-replay' : 'workspace-replay', model: 'main' } })).applied)
    const cipher = await createWorkspaceCipherFixture(ctx, policy, join(mobileStage, 'workspace-shell/index.html'), {
      packagedDesktopRelay, hostStdoutProbe: true, rpcDiagnostics: true, maxChunkBytes: 524288,
      packagedWorkspaceAccess: archiveManagerMode === 'sealed' || grantDeadline, grantWorkspace: !grantDeadline,
      ...(pageDiagnostic === 'off' ? { traceWorkspaceRequests: false } : {}),
      ...(standaloneWss === undefined ? {} : { standaloneWss }),
    })
    try {
      const ready = await cipher.bootstrap()
      const ports = cipher.hostPhonePorts?.(); assert.ok(ports)
      let rpc: DeviceProductRpc | undefined
      const phone = new NativeDeviceCore(ready.registration, ready.expiresAt, ready.relay, ports, () => {}, raw => rpc?.receive(raw), undefined)
      try {
        await phone.initialize(); await phone.ready()
        const connection = new DeviceProductRpc(phone, ports.scheduler, 10000, 16, 'installed-workspace-stdio', 16)
        rpc = connection
        const registration = deviceBindingSchema.parse(JSON.parse(ready.registration))
        const origin = deviceWorkspaceOrigin(registration.desktopCredentialId)
        const client = new WorkspaceClient({ request: (argument, signal) => connection.call({ method: 'workspace', argument }, signal),
          encode: bytes => Buffer.from(bytes).toString('base64url'), decode: value => Uint8Array.from(Buffer.from(value, 'base64url')) },
        { origin, maxRequestBytes: 1048576, maxResponseBytes: 16777216, maxChunkBytes: 524288 })
        try {
          if (grantDeadline) {
            await assert.rejects(client.bootstrap(AbortSignal.timeout(30000)), { code: 'workspace-grant-required' })
            const grant = cipher.grantCurrentWorkspace; assert.ok(grant)
            await grant()
          }
          if (large !== undefined) {
            const table = z.array(z.object({ name: z.string().optional(), value: z.unknown().optional() })).parse(await client.bootstrap(AbortSignal.timeout(30000)))
            assert.equal(table.find(row => row.name === '__DSH_WORKSPACE_STANDALONE_FIXTURE__')?.value, large)
          }
          const manifest = await client.manifest(AbortSignal.timeout(30000))
          const shell = await client.fetch(new Request(origin + '/'))
          assert.equal(shell.status, 200); assert.match(await shell.text(), /<html\b/i)
          const script = manifest.resources.find(resource => resource.mediaType.includes('javascript')); assert.ok(script)
          const asset = await client.fetch(new Request(new URL(script.path, origin))); assert.equal(asset.status, 200)
          assert.equal(createHash('sha256').update(Buffer.from(await asset.arrayBuffer())).digest('hex'), script.sha256)
          const routeBoundary = standaloneWss === undefined ? undefined : await checkInstalledRouteBoundary(ctx, client, origin)
          if (closeCancellation) {
            const body = workspaceBodySchema.parse(await connection.call({ method: 'workspace', argument: { operation: 'bootstrap' } }))
            const admission = cipher.holdNextWorkspaceAdmission?.(); assert.ok(admission)
            const cancellation = new AbortController()
            const cancelled = assert.rejects(connection.call({ method: 'workspace', argument: { operation: 'close' } }, cancellation.signal), { code: 'cancelled' })
            try {
              await Promise.race([admission.entered, cancelled.then(() => assert.fail('close completed before admission was held'))])
              cancellation.abort()
              await cancelled
              // A later request acknowledges that the ordered carrier delivered the preceding stop.
              assert.ok(await connection.call({ method: 'metadata', argument: null }))
            } finally { admission.resume() }
            const chunk = workspaceChunkSchema.parse(await connection.call({ method: 'workspace', argument: { operation: 'read', id: body.id, offset: 0 } }))
            assert.equal(chunk.offset, 0); assert.ok(chunk.body.length > 0)
            await connection.call({ method: 'workspace', argument: { operation: 'release', id: body.id } })
          }
          const appearance = () => client.fetch(new Request(origin + '/api/richInline/appearance', { method: 'POST' }))
          await assert.rejects(appearance(), { code: 'unknown-outcome' })
          await assert.rejects(appearance(), { code: 'timeout' })
          await waitFor(async () => cipher.observed().diagnosticFaults?.[1]?.cancelled === true, 'timeout cancelled on Host')
          const requestRemote = async (namespace: string, method: string, args: object) => {
            const name = namespace + '/' + method
            const response = await client.fetch(new Request(origin + '/api/' + name, { method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ type: 'client-request', rpcId: 'installed-trace-' + randomUUID(), method: name, payload: { args } }) }))
            assert.equal(response.status, 200)
            const value = namespace === 'richInline' && method === 'dispose' ? z.undefined().optional() : z.unknown()
            return z.object({ type: z.literal('server-response'), result: z.discriminatedUnion('ok', [z.object({ ok: z.literal(true), value }),
              z.object({ ok: z.literal(false), error: z.object({ code: z.string(), details: z.unknown().optional() }) })]) }).parse(await response.json()).result
          }
          const invoke: Invoke = async (namespace, method, request) => {
            const result = await requestRemote(namespace, method, { request })
            assert.ok(result.ok, JSON.stringify(result))
            return result.value
          }
          if (pageDiagnostic !== undefined) {
            const stored = ctx.sessions.get(sessionId)
            assert.ok(stored)
            const first = createUserMessage({ content: [{ type: 'text', text: 'Synthetic private briefing body' }], source: { kind: 'user' } })
            stored.append('user/message', first, { surfaceOp: 'append' })
            const next = createUserMessage({ content: [{ type: 'text', text: 'Synthetic tail' }], source: { kind: 'user' } })
            stored.append('user/message', next, { surfaceOp: 'append' })
            await ctx.sessionPersistence.flush()
            const tail = stored.snapshotEvents().findLast(event => event.type === 'user/message')
            assert.ok(tail)
            const request = { address: { kind: 'session', sessionId }, throughSeq: tail.seq, beforeSeq: tail.seq, maxMessages: 50 }
            const page = await invoke('session', 'page', request)
            assert.ok(JSON.stringify(page).includes('Synthetic private briefing body'))
            assert.ok(!JSON.stringify(page).includes('Synthetic tail'))
            const invalid = await requestRemote('session', 'page', { request: { ...request, beforeSeq: -1 } })
            assert.ok(!invalid.ok && invalid.error.code === 'gateway/bad-request')
            await connection.call({ method: 'workspace', argument: { operation: 'close' } })
            assert.equal((await client.fetch(new Request(origin + '/'))).status, 200)
            assert.deepEqual(await invoke('session', 'page', request), page)
            await connection.call({ method: 'workspace', argument: { operation: 'close' } })
            assert.equal(replay?.count(), 0)
            ctx.llm.assertZeroRealCalls()
            const observed = cipher.observed()
            assert.ok(observed.packagedDesktopRelay && observed.packagedWorkspaceAccess)
            return { pageDiagnostic, advanced: 2, gatewayBadRequest: true, workspaceReopened: true,
              packagedDesktopRelay: true, packagedWorkspaceAccess: true, modelCalls: 0 }
          }
          if (richReplay !== undefined) {
            const behavior = await rich(ctx, sessionId, richReplay, invoke, async () => {
              await connection.call({ method: 'workspace', argument: { operation: 'close' } })
              assert.equal((await client.fetch(new Request(origin + '/'))).status, 200)
            })
            await connection.call({ method: 'workspace', argument: { operation: 'close' } })
            await ctx.sessionPersistence.flush()
            const observed = cipher.observed()
            assert.ok(observed.packagedDesktopRelay && observed.packagedWorkspaceAccess)
            return { ...behavior, rich: true, workspaceReopened: true, workspaceDeniedBeforeGrant: true,
              grantCappedByConnection: true, packagedDesktopRelay: true, packagedWorkspaceAccess: true,
              modelCalls: richReplay.count(), carrier: 'in-process encrypted relay with Node P-256' }
          }
          assert.ok(replay)
          const settingsRevision = z.object({ revision: z.number() })
          const settings = settingsRevision.parse(await invoke('devflowToolbox', 'settingsGet', { scope: 'global' }))
          await invoke('devflowToolbox', 'settingsSave', { scope: 'global', expectedRevision: settings.revision, draft: { mode: 'direct' }, actionId: randomUUID() })
          const workflow = await devflow(ctx, sessionId, replay, invoke)
          const archiveScopeMode = process.env.DSH_HARMONY_WORKSPACE_ARCHIVE_SCOPE
          let archiveScope
          let archiveManager
          if (archiveScopeMode !== undefined) {
            assert.ok(archiveScopeMode === 'baseline' || archiveScopeMode === 'candidate')
            const child = replay.calls.find(call => call.sessionId !== sessionId)?.sessionId
            assert.ok(child)
            const directory = deviceSessionDirectory(await connection.call({ method: 'metadata', argument: null }), registration.desktopId)
            assert.deepEqual(directory.sessions.map(row => row.sessionId), [sessionId])
            const rejectChild = async (method: 'archiveSession' | 'unarchiveSession') => {
              const result = await requestRemote('workspace', method, { request: { sessionId: child } })
              assert.ok(!result.ok && result.error.code === 'remote-access/denied')
            }
            await rejectChild('archiveSession')
            await ctx.workspaceRegistry.archiveSession(child)
            try {
              await rejectChild('unarchiveSession')
              const result = z.object({ archivedSessionIds: z.array(z.string()) })
              const archived = result.parse(await invoke('workspace', 'archiveSession', { sessionId })).archivedSessionIds
              assert.deepEqual([...ctx.workspaceRegistry.archivedSessionIds], [child, sessionId])
              const restored = result.parse(await invoke('workspace', 'unarchiveSession', { sessionId })).archivedSessionIds
              assert.deepEqual([...ctx.workspaceRegistry.archivedSessionIds], [child])
              const hiddenIdExpected = archiveScopeMode === 'baseline'
              assert.deepEqual(archived, hiddenIdExpected ? [child, sessionId] : [sessionId])
              assert.deepEqual(restored, hiddenIdExpected ? [child] : [])
              const owner = async (method: string) => result.parse(await ctx.typertGateway.invoke({ namespace: 'workspace', method,
                args: { request: { sessionId } }, peer: ctx.connection.browserPeer, signal: AbortSignal.timeout(10000) })).archivedSessionIds
              assert.deepEqual(await owner('archiveSession'), [child, sessionId])
              assert.deepEqual(await owner('unarchiveSession'), [child])
              archiveScope = { mode: archiveScopeMode, visibleMutations: 2, hiddenMutationDenials: 2,
                hiddenIdInArchiveResponse: archived.includes(child), hiddenIdInRestoreResponse: restored.includes(child), ownerStillSeesAll: true }
              if (archiveManagerMode !== undefined) {
                const name = '@michengai/dsh-archive-manager', api = 'workspaceRegistry'
                assert.ok(ctx.clientModules.graph().entries.some(entry => entry.id === name))
                const metadata = await requestRemote(api, 'archivedSessionMetadata', {})
                const absent = 'archive-synthetic-absent-' + randomUUID()
                const batch = await requestRemote(api, 'deleteArchivedSessions', { target: { scope: 'sessions', sessionIds: [absent] } })
                const single = await requestRemote(api, 'deleteSession', { sessionId: absent })
                const legacyRestore = await requestRemote(api, 'unarchiveSession', { sessionId: child })
                for (const result of [metadata, batch, single, legacyRestore]) assert.ok(!result.ok && result.error.code === 'remote-access/denied')
                assert.deepEqual([...ctx.workspaceRegistry.archivedSessionIds], [child])
                const ownerMetadata = await ctx.typertGateway.invoke({ namespace: api, method: 'archivedSessionMetadata', args: {},
                  peer: ctx.connection.browserPeer, signal: AbortSignal.timeout(10000) })
                assert.ok(z.object({ items: z.array(z.object({ sessionId: z.string() })) }).parse(ownerMetadata).items.some(row => row.sessionId === child))
                const ownerBatch = await ctx.typertGateway.invoke({ namespace: api, method: 'deleteArchivedSessions',
                  args: { target: { scope: 'sessions', sessionIds: [absent] } }, peer: ctx.connection.browserPeer, signal: AbortSignal.timeout(10000) })
                assert.deepEqual(z.object({ requestedSessionIds: z.array(z.string()), deletedSessionIds: z.array(z.string()) }).parse(ownerBatch),
                  { requestedSessionIds: [], deletedSessionIds: [] })
                const update = await client.fetch(new Request(origin + '/api/michengai/dsh-archive-manager/update'))
                assert.equal(update.status, 404)
                assert.equal(update.headers.get(WORKSPACE_ROUTE_HEADER), 'unregistered')
                archiveManager = { clientInGraph: true, legacyDeviceDenials: 4, ownerMetadata: true, ownerBatchProbeDeleted: 0, updater: update.status }
              }
            } finally {
              await ctx.workspaceRegistry.unarchiveSession(sessionId)
              await ctx.workspaceRegistry.unarchiveSession(child)
            }
          }
          let savedProject: { sessionId: SessionId; revision: number } | undefined
          if (standaloneWss !== undefined) {
            const child = replay.calls.find(call => call.sessionId !== sessionId)?.sessionId
            assert.ok(child)
            const folder = join(world, 'scope-added-project'); await mkdir(folder)
            const addedProject = await ctx.workspaceRegistry.create(folder, 'New visible project')
            const addedSession = (await ctx.sessionController.create({ workspaceId: addedProject.id })).sessionId
            const directory = deviceSessionDirectory(await connection.call({ method: 'metadata', argument: null }), registration.desktopId)
            assert.ok(directory.projects?.some(row => row.projectId === addedProject.id))
            assert.deepEqual(new Set(directory.sessions.map(row => row.sessionId)), new Set([sessionId, addedSession]))
            const global = z.object({ revision: z.number(), targets: z.array(z.object({ sessionId: z.string() })) })
              .parse(await invoke('devflowToolbox', 'settingsGet', { scope: 'global' }))
            assert.deepEqual(new Set(global.targets.map(row => row.sessionId)), new Set([sessionId, addedSession]))
            const project = { scope: 'project', sessionId: addedSession }
            const projectState = z.object({ revision: z.number(), draft: z.object({ mode: z.enum(['auto', 'direct']).optional() }) })
            const previous = projectState.parse(await invoke('devflowToolbox', 'settingsGet', project))
            const ownerProject = (method: string, request: object) => ctx.typertGateway.invoke({ namespace: 'devflowToolbox', method,
              args: { request }, peer: ctx.connection.browserPeer, signal: AbortSignal.timeout(10000) })
            assert.deepEqual(projectState.parse(await ownerProject('settingsGet', project)), previous)
            const ownerSaved = projectState.parse(await ownerProject('settingsSave',
              { ...project, expectedRevision: previous.revision, draft: { mode: 'auto' }, actionId: randomUUID() }))
            assert.deepEqual(ownerSaved, { revision: previous.revision + 1, draft: { mode: 'auto' } })
            const stale = await requestRemote('devflowToolbox', 'settingsSave',
              { request: { ...project, expectedRevision: previous.revision, draft: { mode: 'direct' }, actionId: randomUUID() } })
            assert.ok(!stale.ok, 'The phone saved over a newer desktop revision')
            assert.equal(stale.error.code, 'devflow/application')
            assert.equal(z.object({ code: z.string() }).parse(stale.error.details).code, 'DEVFLOW_SETTINGS_CONFLICT')
            assert.deepEqual(projectState.parse(await ownerProject('settingsGet', project)), ownerSaved)
            const refreshed = projectState.parse(await invoke('devflowToolbox', 'settingsGet', project))
            assert.deepEqual(refreshed, ownerSaved)
            const saved = z.object({ revision: z.number(), effective: z.object({ mode: z.literal('direct') }) }).parse(await invoke('devflowToolbox', 'settingsSave',
              { ...project, expectedRevision: refreshed.revision, draft: { mode: 'direct' }, actionId: randomUUID() }))
            assert.equal(saved.revision, ownerSaved.revision + 1)
            for (const scope of ['project', 'session']) {
              const target = { scope, sessionId: child }
              for (const result of [await requestRemote('devflowToolbox', 'settingsGet', { request: target }), await requestRemote('devflowToolbox', 'settingsSave',
                { request: { ...target, expectedRevision: 0, draft: { mode: 'direct' }, actionId: randomUUID() } })]) {
                assert.ok(!result.ok && ['devflow/denied', 'remote-access/denied'].includes(result.error.code), JSON.stringify(result))
              }
            }
            const globalAfter = settingsRevision.parse(await invoke('devflowToolbox', 'settingsGet', { scope: 'global' }))
            assert.equal(globalAfter.revision, global.revision)
            savedProject = { sessionId: addedSession, revision: saved.revision }
          }
          await connection.call({ method: 'workspace', argument: { operation: 'close' } })
          assert.equal((await client.fetch(new Request(origin + '/'))).status, 200)
          const reopened = z.object({ effective: z.object({ mode: z.string() }) }).parse(await invoke('devflowToolbox', 'settingsGet', { scope: 'global' }))
          assert.equal(reopened.effective.mode, 'auto')
          if (savedProject !== undefined) {
            const project = z.object({ revision: z.number(), draft: z.object({ mode: z.literal('direct') }) }).parse(await invoke('devflowToolbox', 'settingsGet',
              { scope: 'project', sessionId: savedProject.sessionId }))
            assert.equal(project.revision, savedProject.revision)
          }
          await connection.call({ method: 'workspace', argument: { operation: 'close' } })
          ctx.llm.assertZeroRealCalls()
          const observed = cipher.observed(); assert.equal(observed.packagedDesktopRelay, true)
          if (archiveManagerMode === 'sealed') assert.equal(observed.packagedWorkspaceAccess, true)
          if (grantDeadline) assert.equal(observed.packagedWorkspaceAccess, true)
          if (standaloneWss !== undefined) assert.deepEqual(observed.standaloneWss, { tlsProtocols: Array(4).fill('TLSv1.3'), connections: 4 })
          return { shell: true, assetDigestVerified: true, timedOutRequestCancelled: true, reopenedDevflowMode: reopened.effective.mode,
            workflow, modelCalls: replay.count(), packagedDesktopRelay: observed.packagedDesktopRelay, diagnosticFaults: observed.diagnosticFaults,
            ...(grantDeadline ? { workspaceDeniedBeforeGrant: true, grantCappedByConnection: true, packagedWorkspaceAccess: true } : {}),
            ...(archiveScope === undefined ? {} : { archiveScope }),
            ...(archiveManager === undefined ? {} : { archiveManager, packagedWorkspaceAccess: observed.packagedWorkspaceAccess }),
            ...(closeCancellation ? { cancelledClosePreservedHandle: true } : {}),
            ...(large === undefined ? {} : { standaloneWss: observed.standaloneWss, relayDigest: standaloneRelayDigest, bootstrapFixtureBytes: large.length, routeBoundary }),
            ...(savedProject === undefined ? {} : { devflowWorkspaceScope: { addedProjectVisibleOnExistingGrant: true, addedProjectSettingsReopened: true,
              stalePhoneSaveRejected: true, desktopRevisionPreserved: true, phoneSaveAfterRefresh: true, hiddenChildReadWriteDenials: 4, globalRevisionPreserved: true } }),
            carrier: standaloneWss === undefined ? 'in-process encrypted relay with Node P-256' : 'independent sealed relay with TLS loopback' }
        } finally { await client.close() }
      } finally { rpc?.close(); await phone.close() }
    } finally { await cipher.close() }
  } finally { stopLarge?.(); (richReplay ?? replay)?.dispose() }
}

/** Required installed providers must finish loading before the startup callback. */
export const inject = ['appReady', 'appExit', 'llm', 'sessionController', 'sessionPersistence', 'clientModules', 'typertGateway', 'remoteAccess', 'connection', 'typert', 'richInline', 'devflowToolboxApplication', 'agents', 'sessions', 'workspaceRegistry', 'agentDefaultModel', 'sessionProjections', 'webServer', 'pluginManager']
/** @param ctx - actual installed services with private profile storage and sealed candidate bundles. */
export function apply(ctx: Context): void {
  const world = process.env.DSH_HARMONY_WORKSPACE_INSTALLED_WORLD
  if (!world || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw new Error('isolated replay profile required')
  const scenario = z.enum(['composition', 'devflow', 'rich', 'workspace-trace', 'native-devflow', 'native-rich', 'native-plugin-target', 'native-cipher-plugin-target', 'native-cipher-rich', 'native-cipher-devflow', 'native-cipher-official', 'native-cipher-creation', 'native-cipher-creation-work', 'native-cipher-creation-workspace']).parse(process.env.DSH_HARMONY_WORKSPACE_INSTALLED_CASE)
  let operation = Promise.resolve()
  ctx.effect(() => ctx.appReady!.onReady(() => {
    operation = (async () => {
      const packages = packagesSchema.parse(JSON.parse(process.env.DSH_HARMONY_WORKSPACE_INSTALLED_PACKAGES ?? 'null'))
      if (scenario === 'workspace-trace') {
        const clientRoot = process.env.DSH_HARMONY_WORKSPACE_CLIENT_ROOT; assert.ok(clientRoot)
        const mobile = packages.find(item => item.id === 'harmony-mobile'); assert.ok(mobile)
        for (const entry of packages) assert.equal(resolve(ctx.clientModules.clientPath(entry.name)!), resolve(entry.stage, 'lib/client.js'), entry.name)
        const details = await traceWorkspace(ctx, world, mobile.stage, clientRoot, process.env.DSH_HARMONY_WORKSPACE_CLOSE_CANCELLATION === '1')
        await writeFile(join(world, 'probe.json'), JSON.stringify({ passed: true, scenario, installedServices: true, details, realModels: 0, dailyProfile: false }, null, 2) + '\n')
        return
      }
      if (scenario.startsWith('native-')) {
        const clientRoot = process.env.DSH_HARMONY_WORKSPACE_CLIENT_ROOT; assert.ok(clientRoot)
        const nativeProject = z.string().parse(process.env.DSH_HARMONY_WORKSPACE_NATIVE_PROJECT)
        const staged = z.object({ fixtureConfiguration: z.string(), keyboardDiagnostics: z.boolean().optional(), keyboardAttachDiagnostics: z.boolean().optional(),
          keyboardPlainFirst: z.boolean().optional(), rpcDiagnostics: z.boolean().optional(), pluginCipher: z.boolean().optional(),
          projectionRebuilt: z.boolean().optional(), exactProductCore: z.boolean().optional(), productHapSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
          workspaceMaxChunkBytes: z.number().int().positive().optional(), nativeWss: z.boolean().optional(),
          nativeWssTlsDirectory: z.string().regex(/^\.build\/workspace-native-wss-[a-z0-9-]+-cert$/).optional(), reconnectReview: z.boolean().optional(),
          creationAckLoss: z.boolean().optional(), pinnedInitializationFailure: z.boolean().optional(), workspaceSessionHandoff: z.boolean().optional(),
          workspaceHandoffCommandTail: z.literal(true).optional(), workspaceHandoffPagedHistory: z.literal(true).optional(),
          workspaceResponseBodyReview: z.literal(true).optional(),
          creationDispatchHostChunkBytes: z.literal(1048576).optional(),
          startupTimelineDiagnostic: z.object({ baseOwnerSha256: z.string().regex(/^[a-f0-9]{64}$/), stagedOwnerSha256: z.string().regex(/^[a-f0-9]{64}$/),
            hostChunkBytes: z.literal(1048576).optional() }).optional(),
          pluginActionHostChunkBytes: z.literal(1048576).optional(),
          pluginActionScenario: z.enum(['devflow', 'rich', 'archive']).optional(),
          richImeDraft: z.literal('\u{1F642}').optional(),
          devflowImeLabel: z.literal('\u{1F642}').optional(),
        }).parse(JSON.parse(await readFile(join(clientRoot, nativeProject), 'utf8')))
        const admission = z.enum(['padded', 'disk', 'disk-latency', 'disk-field']).optional().parse(process.env.DSH_HARMONY_WORKSPACE_NATIVE_ADMISSION)
        const rpcDiagnostics = process.env.DSH_HARMONY_WORKSPACE_NATIVE_RPC_DIAGNOSTICS === '1'
        if (rpcDiagnostics) assert.equal(staged.rpcDiagnostics, true, 'The diagnostic Host must match the diagnostic test HAP')
        if (admission !== undefined || staged.rpcDiagnostics === true) {
          assert.ok(staged.projectionRebuilt === true || staged.exactProductCore === true && staged.productHapSha256 !== undefined, 'Use current projections or a verified product build')
          assert.ok(staged.workspaceMaxChunkBytes !== undefined && staged.workspaceMaxChunkBytes >= 524288, 'Native receive capacity must cover the Host chunk size')
        }
        const panelCipher = scenario === 'native-cipher-plugin-target'
        if (panelCipher) {
          assert.equal(staged.pluginCipher, true)
          assert.ok(staged.workspaceMaxChunkBytes !== undefined && staged.workspaceMaxChunkBytes >= 524288)
        }
        const mobile = packages.find(item => item.id === 'harmony-mobile'); assert.ok(mobile)
        const packagedDesktopRelay = process.env.DSH_HARMONY_WORKSPACE_PACKAGED_DESKTOP === '1' ? join(world, 'package/device-relay-review.mjs') : undefined
        const nativeWss = process.env.DSH_HARMONY_WORKSPACE_NATIVE_WSS === '1'
        assert.equal(staged.nativeWss === true, nativeWss)
        if (nativeWss) assert.ok(['native-cipher-creation-workspace', 'native-cipher-rich', 'native-cipher-official', 'native-cipher-devflow'].includes(scenario) && packagedDesktopRelay !== undefined)
        const tlsDirectory = join(clientRoot, staged.nativeWssTlsDirectory ?? '.build/workspace-native-wss-full-cert')
        const nativeStandalone = process.env.DSH_HARMONY_WORKSPACE_NATIVE_STANDALONE_WSS === '1'
        if (nativeStandalone) assert.ok(nativeWss && (['native-cipher-creation-workspace', 'native-cipher-official', 'native-cipher-devflow'].includes(scenario)
          || scenario === 'native-cipher-rich' && admission === 'disk-latency'))
        if (staged.reconnectReview === true) assert.ok(nativeStandalone && scenario === 'native-cipher-creation-workspace')
        if (staged.creationAckLoss === true) assert.ok(staged.reconnectReview === true && staged.exactProductCore === true)
        const blankWorkspace = process.env.DSH_HARMONY_WORKSPACE_NATIVE_BLANK_CREATION === '1'
        if (blankWorkspace) assert.ok(staged.reconnectReview === true && staged.exactProductCore === true && !staged.creationAckLoss)
        const pinnedSessionId = z.string().regex(/^session-[a-f0-9-]{36}$/).optional().parse(process.env.DSH_HARMONY_WORKSPACE_PINNED_SESSION_ID)
        if (pinnedSessionId !== undefined) assert.ok(nativeStandalone && scenario === 'native-cipher-creation-workspace' && staged.exactProductCore === true && !staged.reconnectReview)
        const startupTimeline = staged.startupTimelineDiagnostic
        if (startupTimeline !== undefined) {
          assert.ok(pinnedSessionId !== undefined && !staged.pinnedInitializationFailure)
          assert.ok(staged.workspaceMaxChunkBytes !== undefined && staged.workspaceMaxChunkBytes >= (startupTimeline.hostChunkBytes ?? 524288))
        }
        const initialSelectionStage = process.env.DSH_HARMONY_WORKSPACE_INITIAL_SELECTION_STAGE
        const creationDispatchHostChunkBytes = staged.creationDispatchHostChunkBytes
        if (creationDispatchHostChunkBytes !== undefined) {
          assert.ok(nativeStandalone && scenario === 'native-cipher-creation-workspace' && initialSelectionStage !== undefined
            && staged.reconnectReview === true && staged.exactProductCore === true && !staged.creationAckLoss && !blankWorkspace && pinnedSessionId === undefined)
          assert.ok(staged.workspaceMaxChunkBytes !== undefined && staged.workspaceMaxChunkBytes >= creationDispatchHostChunkBytes)
        }
        const pluginActionHostChunkBytes = staged.pluginActionHostChunkBytes
        const archiveManagerReview = process.env.DSH_HARMONY_WORKSPACE_NATIVE_ARCHIVE_MANAGER === '1'
        if (pluginActionHostChunkBytes !== undefined) {
          assert.ok(nativeStandalone && initialSelectionStage !== undefined)
          assert.ok(staged.workspaceMaxChunkBytes !== undefined && staged.workspaceMaxChunkBytes >= pluginActionHostChunkBytes)
          assert.ok(staged.pluginActionScenario !== undefined)
          if (archiveManagerReview) {
            assert.equal(scenario, 'native-cipher-devflow')
            assert.equal(staged.pluginActionScenario, 'archive')
          } else {
            assert.equal(staged.pluginActionScenario, scenario === 'native-cipher-devflow' ? 'devflow' : scenario === 'native-cipher-official' ? 'rich' : undefined)
          }
        }
        if (staged.richImeDraft !== undefined) assert.ok(scenario === 'native-cipher-official' && staged.pluginActionScenario === 'rich' && pluginActionHostChunkBytes !== undefined)
        if (staged.devflowImeLabel !== undefined) assert.ok(scenario === 'native-cipher-devflow' && staged.pluginActionScenario === 'devflow' && pluginActionHostChunkBytes !== undefined && !archiveManagerReview)
        if (initialSelectionStage !== undefined) {
          assert.ok(blankWorkspace || pinnedSessionId !== undefined || creationDispatchHostChunkBytes !== undefined || process.env.DSH_HARMONY_WORKSPACE_NATIVE_ARCHIVE_MANAGER === '1'
            || process.env.DSH_HARMONY_WORKSPACE_NATIVE_RELEASE_REVIEW === '1'
            && (scenario === 'native-cipher-devflow' || scenario === 'native-cipher-official'))
          const client = ctx.clientModules.clientPath('@deepseek-ai/dsh-client-ui-workspace')
          assert.ok(client)
          assert.equal(resolve(client), resolve(initialSelectionStage, 'lib/client.js'))
        }
        const standaloneWss = nativeStandalone ? await standaloneWssInputs(clientRoot, tlsDirectory, true) : undefined
        const nativeWssTls = nativeWss && !nativeStandalone ? { key: await readFile(join(tlsDirectory, 'key.pem')), cert: await readFile(join(tlsDirectory, 'leaf.pem')) } : undefined
        const openPluginPanel = scenario === 'native-plugin-target' || panelCipher || scenario === 'native-cipher-creation-workspace' && packagedDesktopRelay !== undefined
        const panelTarget = openPluginPanel ? packages.find(item => item.id === 'devflow') : undefined
        if (openPluginPanel) assert.ok(panelTarget)
        for (const entry of packages) assert.equal(resolve(ctx.clientModules.clientPath(entry.name)!), resolve(entry.stage, 'lib/client.js'), entry.name)
        const compactSettings = process.env.DSH_HARMONY_WORKSPACE_NATIVE_ARCHIVE_SETTINGS
        if (compactSettings !== undefined) {
          const client = ctx.clientModules.clientPath('@deepseek-ai/dsh-client-ui-settings-general'); assert.ok(client)
          assert.equal(resolve(client), resolve(compactSettings, 'lib/client.js'))
          assert.equal(process.env.DSH_HARMONY_WORKSPACE_ARCHIVE_MANAGER, 'sealed')
        }
        if (scenario === 'native-cipher-official') {
          const expected = z.string().parse(process.env.DSH_HARMONY_WORKSPACE_OFFICIAL_CLIENT)
          assert.equal(resolve(ctx.clientModules.clientPath('@deepseek-ai/dsh-experimental-client-ui-cot-translation')!), resolve(expected))
        }
        const observed = scenario.startsWith('native-cipher-creation')
          ? await runCreationCipherEmulator(ctx, world, clientRoot, join(mobile.stage, 'workspace-shell/index.html'), staged.fixtureConfiguration,
            scenario === 'native-cipher-creation-workspace' ? 'workspace' : scenario === 'native-cipher-creation-work' ? 'work' : 'create',
            { ...(packagedDesktopRelay === undefined ? {} : { packagedDesktopRelay }), ...(panelTarget === undefined ? {} : { panelTargetPackage: panelTarget.name }),
              ...(nativeWssTls === undefined ? {} : { nativeWssTls }), ...(standaloneWss === undefined ? {} : { standaloneWss }),
              ...(packages.some(item => item.name === 'dsh-workspace-boot-fault-fixture') ? { pluginBootFault: true } : {}),
              ...(process.env.DSH_HARMONY_WORKSPACE_REVOKED_REVIEW === '1' ? { revocationReview: true } : {}),
              ...(staged.reconnectReview === true ? { reconnectReview: true } : {}),
              ...(blankWorkspace ? { blankWorkspace: true } : {}),
              ...(process.env.DSH_HARMONY_WORKSPACE_DEVFLOW_SESSION_TARGET === undefined ? {} : { devflowSessionSettings: true }),
              ...(staged.workspaceSessionHandoff === true ? { workspaceSessionHandoff: true } : {}),
              ...(staged.workspaceHandoffCommandTail === true ? { workspaceHandoffCommandTail: true } : {}),
              ...(staged.workspaceHandoffPagedHistory === true ? { workspaceHandoffPagedHistory: true } : {}),
              ...(staged.workspaceResponseBodyReview === true ? { workspaceResponseBodyReview: true } : {}),
              ...(pinnedSessionId === undefined ? {} : { pinnedSessionId }),
              ...(staged.pinnedInitializationFailure === true ? { pinnedInitializationFailure: true } : {}),
              ...(startupTimeline === undefined ? {} : { startupTimeline: { hostChunkBytes: startupTimeline.hostChunkBytes ?? 524288 } }),
              ...(creationDispatchHostChunkBytes === undefined ? {} : { creationDispatchHostChunkBytes }),
              ...(process.env.DSH_HARMONY_WORKSPACE_INITIAL_SELECTION_SOURCE === '1' ? { sourceWorkspaceAccess: true } : {}),
              ...(staged.creationAckLoss === true ? { creationAckLoss: true } : {}) })
          : await runWorkspaceEmulator(ctx, {
            world, clientRoot, shellIndex: join(mobile.stage, 'workspace-shell/index.html'), fixtureConfiguration: staged.fixtureConfiguration,
            workflowRun: scenario.endsWith('devflow'), encrypted: scenario.startsWith('native-cipher-'), official: scenario === 'native-cipher-official',
            keyboardDiagnostics: staged.keyboardDiagnostics === true, keyboardAttachDiagnostics: staged.keyboardAttachDiagnostics === true,
            keyboardPlainFirst: staged.keyboardPlainFirst === true, rpcDiagnostics,
            devflowConflictReview: process.env.DSH_HARMONY_WORKSPACE_DEVFLOW_CONFLICT === '1',
            brickReview: process.env.DSH_HARMONY_WORKSPACE_BRICK_REVIEW === '1',
            archiveManagerReview,
            ...(staged.richImeDraft === undefined ? {} : { richImeDraft: staged.richImeDraft }),
            ...(staged.devflowImeLabel === undefined ? {} : { devflowImeLabel: staged.devflowImeLabel }),
            ...(packagedDesktopRelay === undefined ? {} : { packagedDesktopRelay }),
            ...(staged.rpcDiagnostics === true || panelCipher || nativeWss ? { hostChunkBytes: pluginActionHostChunkBytes ?? 524288 } : {}),
            ...(nativeWssTls === undefined ? {} : { nativeWssTls }),
            ...(standaloneWss === undefined ? {} : { standaloneWss }),
            ...(admission === undefined ? {} : { admissionReview: admission }),
            ...(panelTarget === undefined ? {} : { panelTargetPackage: panelTarget.name }),
          })
        await writeFile(join(world, 'probe.json'), JSON.stringify({ passed: true, scenario, installedServices: true, packagesLoaded: packages.map(item => item.name), connectionPackageOverridden: false, native: observed, realModels: 0, dailyProfile: false }, null, 2) + '\n')
        return
      }
      const file = join(world, 'four-responses.json')
      await writeFile(file, JSON.stringify(Array.from({ length: 4 }, () => ({ kind: 'chunks', chunks: [{ type: 'finish', reason: { kind: 'stop' } }] }))) + '\n')
      let modelCalls = 0; const stopCalls = ctx.on('llm-replay/request', () => { modelCalls++ })
      const workflow = scenario === 'devflow' ? await installWorkspaceDevflowReplay(ctx, world) : undefined
      const richReplay = scenario === 'rich' ? await installWorkspaceRichReplay(ctx, world, installedForm) : undefined
      const replay = workflow ?? richReplay ?? installLlmReplay(ctx, { file, overrideFile: file, offline: true, providers: [{ id: 'installed-combination-replay', models: [{ id: 'main', contextWindow: 100000, defaultMaxTokens: 1000 }] }] })
      const controller = new AbortController()
      const peer = ctx.connection.createPeer({ principal: { kind: 'harmony-device', desktopId: id<'mobile-desktop'>('installed-combination'), deviceId: id<'mobile-device'>('installed-combination-phone'), epoch: 1 }, interactions: 'answer' })
      const createSession = async (name: string) => {
        if (scenario !== 'composition') return (await ctx.sessionController.create({ cwd: world })).sessionId
        const path = join(world, name); await mkdir(path)
        const project = await ctx.workspaceRegistry.create(path, name)
        return (await ctx.sessionController.create({ workspaceId: project.id })).sessionId
      }
      const sessionId = await createSession('scope-a'), deniedSession = await createSession('scope-b')
      let authorized = [sessionId]
      const actions = ctx.typert.local.list().map(row => `${row.namespace}/${row.method}` as const)
      const stop = ctx.remoteAccess.registerPolicy('harmony-device', { bindings: principal => principal === peer.principal && !controller.signal.aborted ? [
        { role: { name: 'installed-global', resource: 'global', actions }, resource: { kind: 'global' } },
        ...authorized.map(id => ({ role: { name: 'installed-session', resource: 'session' as const, actions }, resource: { kind: 'session' as const, id } })),
      ] : [] })
      try {
        assert.ok(ctx.get('devflowToolboxApplication')); assert.ok(ctx.get('richInline'))
        for (const entry of packages) assert.equal(resolve(ctx.clientModules.clientPath(entry.name)!), resolve(entry.stage, 'lib/client.js'), entry.name)
        let servedBundleBytes = 0
        for (const batch of ctx.clientModules.graph().batches) {
          const response = await ctx.clientModules.fetchBundle(new Request(new URL(batch.url, 'https://workspace.dsh.invalid')))
          assert.ok(response); assert.equal(response.status, 200); servedBundleBytes += (await response.arrayBuffer()).byteLength
        }
        assert.ok(servedBundleBytes > 0)
        const settings = z.object({ revision: z.number(), effective: z.object({ mode: z.string() }) })
        const invoke: Invoke = (namespace, method, request) => ctx.typertGateway.invoke({ namespace, method, args: { request }, peer, signal: controller.signal })
        const before = settings.parse(await invoke('devflowToolbox', 'settingsGet', { scope: 'global' }))
        const after = settings.parse(await invoke('devflowToolbox', 'settingsSave', { scope: 'global', expectedRevision: before.revision, draft: { mode: 'direct' }, actionId: randomUUID() }))
        assert.equal(after.effective.mode, 'direct'); assert.ok(after.revision > before.revision)
        await assert.rejects(invoke('devflowToolbox', 'panelGet', { sessionId: deniedSession }), error => error instanceof Error && 'code' in error && (error.code === 'devflow/denied' || error.code === 'remote-access/denied'))
        const selected = await ctx.sessionController.readModelSelection({ sessionId })
        assert.equal((await ctx.sessionController.compareAndSelectModel({ sessionId, expectedSelectionRevision: selected.selectionRevision, selection: { provider: scenario === 'devflow' ? 'workspace-replay' : scenario === 'rich' ? 'workspace-rich-replay' : 'installed-combination-replay', model: 'main' } })).applied, true)
        let details: object = {}
        if (scenario === 'composition') {
          const invokeOwner: Invoke = (namespace, method, request) => ctx.typertGateway.invoke({ namespace, method, args: { request }, peer: ctx.connection.browserPeer, signal: controller.signal })
          details = { devflowSettingsScopes: await devflowSettingsScopes(invoke, invokeOwner, sessionId, deniedSession, () => {
            authorized = [sessionId, deniedSession]
            ctx.remoteAccess.invalidate(peer.principal)
          }) }
        }
        if (workflow) details = await devflow(ctx, sessionId, workflow, invoke)
        if (richReplay) details = await rich(ctx, sessionId, richReplay, invoke)
        assert.equal(modelCalls, scenario === 'composition' ? 0 : 4)
        ctx.llm.assertZeroRealCalls(); await ctx.sessionPersistence.flush()
        await writeFile(join(world, 'probe.json'), JSON.stringify({ passed: true, scenario, installedServices: true, packagesLoaded: packages.map(item => item.name), connectionPackageOverridden: false, nonOwnerSettingsSaved: true, ungrantedExistingSessionDenied: true, graphBatches: ctx.clientModules.graph().batches.length, servedBundleBytes, modelCalls, replayBudget: 4, realModels: 0, dailyProfile: false, details }, null, 2) + '\n')
      } finally { controller.abort(); stop(); try { await peer.dispose() } finally { replay.dispose(); stopCalls() } }
    })().then(() => ctx.appExit!(0), async error => { await writeFile(join(world, 'probe.json'), JSON.stringify({ passed: false, error: String(error), stack: error instanceof Error ? error.stack : undefined }) + '\n'); ctx.appExit!(1) })
  }))
  ctx.effect(() => () => operation)
}
