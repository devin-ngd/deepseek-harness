/** Independent workspace authorization with original signed device proofs and real Gateway services. */
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { setImmediate as nextTurn } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { expect, it, onTestFinished, vi } from 'vitest'
import { z } from 'zod'
import WebSocket from 'ws'
import DynamicCordisRunner from '@deepseek-ai/dsh-cordis-host-runner'
import SessionTitle from '@deepseek-ai/dsh-session-title'
import { CommandId } from '@deepseek-ai/dsh-commands/brand'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, SessionSeq } from '@deepseek-ai/dsh-session'
import { TYPERT as SESSION_TYPERT } from '../../../packages/api/session-controller/lib/typert.host.js'
import { TYPERT as CORDIS_RUNNER_TYPERT } from '../../../packages/extensions/cordis-host-runner/lib/typert.host.js'
import { TYPERT as RICH_TYPERT } from '../../../packages/experimental/rich-inline/lib/typert.host.js'
import { authoredBlockId } from '../../../packages/experimental/rich-inline/src/shared/authored.ts'
import { parseActionRequest } from '../../../packages/experimental/rich-inline/src/shared/validate.ts'
import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { loadProfileServices } from './profile-services.ts'
import { desktopKey, phoneKey, fixtureSource, fixtureKey, hostConfig } from './phase39-fixture.ts'
import { ImportedP256Agreement, nodeE2EPrimitives, p256CredentialId } from './p256-channel.ts'
import { DeviceBindingOwner } from '../desktop-plugin/src/device-binding.ts'
import { DeviceBindingClient } from '../src/device-binding-client.ts'
import { deviceProfileSessionPorts } from '../desktop-plugin/src/device-binding-profile.ts'
import { DeviceWorkspaceAccess, type DeviceWorkspaceLimits } from '../desktop-plugin/src/workspace-access.ts'
import { WorkspaceClient } from '../src/workspace-client.ts'
import { workspaceBodySchema, workspaceChunkSchema, workspaceResponseSchema, type WorkspaceHandle } from '../src/workspace-protocol.ts'
import { id } from '../src/protocol.ts'
import { DeviceBindingDesktopRelay } from '../desktop-plugin/src/device-binding-relay.ts'
import { DeviceBindingProfileProvider } from '../desktop-plugin/src/device-binding-profile.ts'
import { DeviceProductRpc } from '../src/device-product-rpc.ts'
import { E2EError } from '../src/e2e-error.ts'
import { NativeDeviceCore } from '../src/native-device-bridge.ts'
import { workspaceDiagnosticFailure } from '../src/workspace-diagnostic.ts'
import { jsonPayload } from '../src/wire.ts'
import { createStandaloneRelay } from '../standalone-relay/src/host.ts'
import { deviceRelayPairId, type DeviceBinding } from '../src/device-binding-protocol.ts'
import type { PairedRelayPolicy, PairedRelayPorts } from '../src/paired-relay.ts'
import { RELAY_CONTROL_PATH, RELAY_CONTROL_SUBPROTOCOL } from '../src/relay-control-protocol.ts'
import { RELAY_PATH, RELAY_SUBPROTOCOL } from './relay-protocol.ts'
import { nodeRelaySocket } from './relay-upgrade.ts'
import type { CleanupScheduler } from './connection-lifetime.ts'
import * as Desktop from '../desktop-plugin/src/index.ts'
import { deviceWorkspaceOrigin } from '../src/workspace-origin.ts'
import type { Context } from '@deepseek-ai/cordis'
import { launchWebScaffold } from '../../../apps/web/tests/scaffold.ts'
import { launchTestChromium, newEnglishPage, openSettings } from '../../../apps/web/tests/support.ts'
import { installWorkspaceDocument } from './workspace-document-fixture.ts'
import { installWorkspaceRichReplay } from './workspace-rich-replay.ts'

async function fixture(realTime = false, maxChunkBytes = 8192, devflow?: string, bufferedBodies = 2) {
  const parent = process.env.DSH_HARMONY_WORKSPACE_WORLD
  assert.ok(parent)
  const world = await mkdtemp(join(parent, 'access-'))
  let ctx: Context
  let shell: DeviceWorkspaceLimits['shell']
  if (devflow === undefined) {
    const configuration = (await readFile(new URL('./cordis.yml', import.meta.url), 'utf8')).replace('cordis:disabledCarrier', 'cordis:sharedCarrier')
    ctx = await loadProfileServices(world, configuration)
    onTestFinished(() => ctx.fiber.dispose())
  } else {
    const navigation = process.env.DSH_HARMONY_WORKSPACE_NAVIGATION
    assert.ok(navigation)
    const archiveCandidate = process.env.DSH_HARMONY_WORKSPACE_ARCHIVE_CANDIDATE
    const archiveManager = process.env.DSH_HARMONY_WORKSPACE_ARCHIVE_MANAGER_PANEL
    const compactSettings = process.env.DSH_HARMONY_WORKSPACE_COMPACT_SETTINGS
    const initialSelectionStage = process.env.DSH_HARMONY_WORKSPACE_INITIAL_SELECTION_STAGE
    const scaffold = await launchWebScaffold({ firstUse: true, extraOverlayPath: join(parent, 'workspace.overlay.yml'),
      profile: { hmr: false, packages: [{ dir: devflow, enabled: true }, { dir: navigation, enabled: true },
        ...(archiveCandidate === undefined ? [] : [{ dir: archiveCandidate }]),
        ...(archiveManager === undefined ? [] : [{ dir: archiveManager, enabled: true }]),
        ...(compactSettings === undefined ? [] : [{ dir: compactSettings }]),
        ...(initialSelectionStage === undefined ? [] : [{ dir: initialSelectionStage }])] } })
    onTestFinished(() => scaffold.close())
    let child: Context | undefined
    const scoped = scaffold.ctx.isolate('profileContext').plugin({ name: 'workspace-reconnect-profile',
      inject: ['connection', 'remoteAccess', 'typert', 'typertGateway', 'sessionController', 'sessionPersistence', 'sessions', 'workspaceRegistry', 'clientModules', 'llm'],
      apply: inner => { child = inner } })
    onTestFinished(() => scoped.dispose())
    await scoped
    assert.ok(child)
    ctx = child
    if (compactSettings !== undefined) {
      const loaded = ctx.clientModules.graph().entries.find(entry => entry.id === '@deepseek-ai/dsh-client-ui-settings-general')
      assert.ok(loaded)
      const client = ctx.clientModules.clientPath(loaded.id)
      assert.ok(client)
      assert.equal(await realpath(client), await realpath(join(compactSettings, 'lib/client.js')))
    }
    if (initialSelectionStage !== undefined) {
      const client = ctx.clientModules.clientPath('@deepseek-ai/dsh-client-ui-workspace')
      assert.ok(client)
      assert.equal(await realpath(client), await realpath(join(initialSelectionStage, 'lib/client.js')))
    }
    shell = { distIndex: resolve(import.meta.dirname, '../../../apps/web/dist/index.html'),
      limits: { maxFiles: 2000, maxFileBytes: 16 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 } }
  }
  ctx.provide('profileContext', { name: 'desktop', dir: world, patchPath: join(world, 'patch.yml'),
    cwd: world, home: world, installAnchor: world, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined })
  if (devflow === undefined) {
    await ctx.plugin(SessionTitle, { fallbackMaxWords: 8, fallbackMaxBytes: 256, maxTitleBytes: 1024 })
    ctx.effect(() => ctx.typert.register(validateTypertManifest('@deepseek-ai/dsh-api-session-controller', SESSION_TYPERT)))
  }
  let now = realTime ? Date.now() : 1000
  const timers = new Map<number, () => void>(); let nextTimer = 0
  const scheduler = { after: (_ms: number, callback: () => void) => { const key = ++nextTimer; timers.set(key, callback); return () => { timers.delete(key) } } }
  const memory = () => {
    let raw: string | null = null
    return { read: async () => raw, compareAndSet: async (previous: string | null, next: string) => { if (raw !== previous) throw new Error('fixture compare conflict'); raw = next } }
  }
  const authority = {}, native = {}, abort = new AbortController()
  const policy = { desktopId: 'workspace-desktop', deviceId: 'workspace-device', profileId: 'desktop' as const,
    identityAlias: 'workspace-phone', audience: 'relay.example', enrollmentTtlMs: 60000, connectionTtlMs: 60000,
    challengeTtlMs: 10000, maxChallenges: 128, maxCatalogRows: 128, maxPublicBytes: 65536 }
  const owner = new DeviceBindingOwner(authority, policy, memory(), desktopKey, deviceProfileSessionPorts(ctx), () => now, fixtureSource(), scheduler)
  onTestFinished(() => owner.close())
  const phone = new DeviceBindingClient(native, { ...policy, desktopCredentialId: p256CredentialId(desktopKey.publicSpki),
    maxProofs: 128, maxChallengeTtlMs: 60000 }, memory(), phoneKey, nodeE2EPrimitives, () => now)
  onTestFinished(() => phone.close())
  const offer = await owner.offer(authority, { publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) })
  const record = await owner.confirm(authority, JSON.parse(await phone.signOffer(native, JSON.stringify(offer), true)), async () => true)
  await phone.accept(native, JSON.stringify(record), true)
  const transport = { id: id<'harmony-device-channel'>('workspace-connection'), remoteCredentialId: p256CredentialId(phoneKey.publicSpki), signal: abort.signal }
  const remote = { ...transport, remoteCredentialId: p256CredentialId(desktopKey.publicSpki) }
  const challenge = await owner.challenge(transport)
  const ticket = await owner.authenticate(transport, await phone.connectionProof(native, remote, JSON.stringify(challenge)))
  const maxResponseBytes = shell === undefined ? 1024 * 1024 : 16 * 1024 * 1024
  const makeAccess = () => {
    const access = new DeviceWorkspaceAccess(ctx, authority, owner, { ttlMs: 30000,
      ...(shell === undefined ? {} : { shell }),
      channel: { maxRequestBytes: 1024 * 1024, maxResponseBytes },
      wire: { maxChunkBytes, maxBufferedBytes: bufferedBodies * maxResponseBytes, maxBodyBytes: maxResponseBytes, maxBodies: 8, maxStreams: shell === undefined ? 4 : 32, maxRequestBytes: 1024 * 1024 },
    }, () => now, scheduler)
    onTestFinished(() => access.close())
    return access
  }
  const access = makeAccess()
  const makeClient = async () => {
    const wire = await access.open(transport, ticket)
    const client = new WorkspaceClient({ request: (request, signal) => wire.request(request, signal),
      encode: bytes => Buffer.from(bytes).toString('base64url'), decode: value => Uint8Array.from(Buffer.from(value, 'base64url')),
    }, { origin: deviceWorkspaceOrigin(record.desktopCredentialId), maxRequestBytes: 1024 * 1024, maxResponseBytes, maxChunkBytes })
    onTestFinished(() => client.close())
    return { client, wire }
  }
  return { ctx, world, authority, owner, transport, ticket, record, access, makeAccess, makeClient, scheduler, maxResponseBytes, origin: deviceWorkspaceOrigin(record.desktopCredentialId), signal: abort.signal,
    expire: () => { now += 30000 }, now: () => now }
}

it('the generated document reports fixed load stages through the native port', async () => {
  const browser = await launchTestChromium()
  onTestFinished(() => browser.close())
  for (const stage of ['renderer-boot', 'navigation', 'native-reply', 'script-error', 'promise-rejection']) {
    const page = await newEnglishPage(browser)
    try {
      const bridge = await installWorkspaceDocument(page, { request: async () => assert.fail('load failures do not invoke the Host') }, 'fixture-session', [])
      await page.route('https://fixture.invalid/', route => route.fulfill({ contentType: 'text/html',
        body: stage === 'renderer-boot' ? '<div id="root"><section data-dsh-boot></section></div>' : '<div id="root"></div>' }))
      await page.goto('https://fixture.invalid/')
      await page.waitForFunction(() => navigator.onLine)
      await page.evaluate(value => {
        if (value === 'navigation') window.dispatchEvent(new CustomEvent('harmony:workspace:navigation-failed', { detail: 'private-session' }))
        if (value === 'native-reply') {
          const fixtureWindow = window as Window & { __workspaceFixturePort?: MessagePort }
          fixtureWindow.__workspaceFixturePort?.postMessage('private-native-payload')
        }
        if (value === 'script-error') window.dispatchEvent(new ErrorEvent('error', { message: 'private-script-error' }))
        if (value === 'promise-rejection') window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: 'private-rejection' }))
      }, stage)
      await expect.poll(() => bridge.signals).toEqual([{ kind: 'workspace.failed', stage }])
    } finally { await page.close() }
  }
})

it('a signed device ticket needs an independent desktop-local grant before standard workspace APIs work', async () => {
  const f = await fixture()
  await expect(f.access.open(f.transport, f.ticket)).rejects.toMatchObject({ code: 'workspace-grant-required' })
  await expect(f.access.allow({})).rejects.toMatchObject({ code: 'workspace-denied' })
  expect(await f.access.allow(f.authority)).toBe(f.now() + 30000)
  const { client } = await f.makeClient()
  expect(await client.bootstrap(f.signal)).toContainEqual({ kind: 'global', name: '__DSH_REMOTE_ACCESS__', value: expect.objectContaining({ owner: false }) })
  const created = await f.ctx.sessionController.create({ cwd: f.world })
  expect((await f.owner.catalog(f.transport, f.ticket)).map(row => row.sessionId)).toContain(created.sessionId)
  expect(f.ctx.typert.local.list().map(row => row.namespace + '/' + row.method)).toContain('session/rename')
  const response = await client.fetch(new Request(f.origin + '/api/session/rename', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'workspace-rename', method: 'session/rename',
      payload: { args: { request: { sessionId: created.sessionId, title: 'Workspace task' } } } }),
  }))
  const reply: unknown = await response.json()
  expect(reply, JSON.stringify(reply)).toMatchObject({ result: { ok: true } })
  const fabricated = { kind: 'harmony-workspace' as const, desktopId: id<'mobile-desktop'>(f.record.desktopId), deviceId: id<'mobile-device'>(f.record.deviceId), epoch: f.record.epoch }
  expect(f.ctx.remoteAccess.decide({ principal: fabricated, action: 'session/rename', resources: [{ kind: 'session', id: created.sessionId }] })).toMatchObject({ kind: 'deny' })
  await expect(f.access.open({ ...f.transport }, f.ticket)).rejects.toThrow()
  await expect(f.access.open(f.transport, { ...f.ticket, epoch: f.ticket.epoch + 1 })).rejects.toMatchObject({ code: 'workspace-denied' })
  await writeFile(join(process.env.DSH_HARMONY_WORKSPACE_WORLD!, 'observed.json'), JSON.stringify({
    signedDeviceAloneDenied: true, localGrantRequired: true, owner: false, dynamicSession: true, fabricatedPrincipalDenied: true,
  }) + '\n')
})

it('omits the Host-local Inspector socket from the device boot table while keeping ordinary rows', async () => {
  const f = await fixture()
  expect(await f.access.allow(f.authority)).toBe(f.now() + 30000)
  f.ctx.on('webserver/index-inject', (table: IndexInjection[]) => {
    table.push({ kind: 'global', name: '__DSH_INSPECTOR__', value: { endpoint: 'ws://127.0.0.1:60000/inspector', protocol: 'workspace-test-credential' } })
    table.push({ kind: 'global', name: '__DSH_LOCALE__', value: 'zh-CN' })
  })
  const { client } = await f.makeClient()
  const boot = await client.bootstrap(f.signal)
  expect(boot).toContainEqual({ kind: 'global', name: '__DSH_LOCALE__', value: 'zh-CN' })
  expect(boot).toContainEqual({ kind: 'global', name: '__DSH_REMOTE_ACCESS__', value: expect.objectContaining({ owner: false }) })
  expect(boot).not.toContainEqual(expect.objectContaining({ kind: 'global', name: '__DSH_INSPECTOR__' }))
})

it('batches waiting catalogue scans without reusing a snapshot that started before the requests arrived', async () => {
  const f = await fixture(false, 8192, undefined, 3)
  await f.access.allow(f.authority)
  const { wire } = await f.makeClient()
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const original = f.ctx.sessionController.list.bind(f.ctx.sessionController)
  const scans = vi.spyOn(f.ctx.sessionController, 'list').mockImplementationOnce(async (...args) => {
    const old = await original(...args)
    entered.resolve(); await release.promise
    return old
  })
  onTestFinished(() => scans.mockRestore())
  const rpc = async (sessionId?: string) => {
    const method = sessionId === undefined ? 'workspace-probe/missing' : 'session/rename'
    const request = sessionId === undefined ? { method: 'GET', headers: [] } : { method: 'POST', headers: [['content-type', 'application/json']],
      body: Buffer.from(JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method,
        payload: { args: { request: { sessionId, title: 'Created after scope scan' } } } })).toString('base64url') }
    const reply = z.object({ body: workspaceBodySchema }).parse(await wire.request({ operation: 'fetch', url: f.origin + '/api/' + method, ...request }, f.signal))
    try {
      const chunk = workspaceChunkSchema.parse(await wire.request({ operation: 'read', id: reply.body.id, offset: 0 }, f.signal))
      expect(Buffer.from(chunk.body, 'base64url').byteLength).toBe(reply.body.bytes)
      return JSON.parse(Buffer.from(chunk.body, 'base64url').toString('utf8'))
    } finally { await wire.request({ operation: 'release', id: reply.body.id }, f.signal) }
  }
  const requests = [rpc()]
  let scansWhileHeld = 0
  try {
    await Promise.race([entered.promise, requests[0]!.then(() => assert.fail('Initial API did not wait for scope admission'))])
    const a = await f.ctx.sessionController.create({ cwd: f.world }), b = await f.ctx.sessionController.create({ cwd: f.world })
    requests.push(rpc(a.sessionId), rpc(b.sessionId))
    await nextTurn()
    scansWhileHeld = scans.mock.calls.length
  } finally { release.resolve() }
  const [first, ...later] = await Promise.all(requests)
  expect(first).toMatchObject({ error: { reason: 'unregistered' } })
  expect(later).toHaveLength(2)
  for (const response of later) expect(response).toMatchObject({ result: { ok: true } })
  expect(scansWhileHeld).toBe(1)
  expect(scans.mock.calls.length).toBeLessThan(6)
  await writeFile(join(process.env.DSH_HARMONY_WORKSPACE_WORLD!, 'scope-batching.json'), JSON.stringify({
    burstRequests: requests.length, individualRefreshesWithoutBatching: 6, scansWhileFirstSnapshotHeld: scansWhileHeld,
    actualScans: scans.mock.calls.length, laterRequestsSawNewlyCreatedSessions: true,
  }) + '\n')
})

async function loopbackRelay(record: DeviceBinding, policy: PairedRelayPolicy, clock: () => number, scheduler: CleanupScheduler) {
  const pairId = deviceRelayPairId(record), expiresAt = clock() + policy.maxRoomTtlMs
  const relay = createStandaloneRelay({ ...hostConfig, publicHost: record.audience, nativeOrigin: 'networkkit-v1',
    maxRoomTtlMs: policy.maxRoomTtlMs, idleTimeoutMs: policy.maxRoomTtlMs, pairTimeoutMs: policy.handshakeMs,
    maxFrameBytes: policy.e2e.maxFrameBytes, maxBufferedBytes: policy.maxQueuedBytes, maxFrames: policy.e2e.maxFrames,
    broker: { ...hostConfig.broker, challengeTtlMs: 10000, roomTtlMs: policy.maxRoomTtlMs,
      pairs: [{ pairId, desktopPublicSpki: record.desktopPublicSpki, phonePublicSpki: record.phonePublicSpki, epoch: record.epoch, expiresAt, revoked: false }] },
  }, {}, clock, undefined, fixtureSource())
  assert.ok(relay)
  const connections: Array<{ socket: WebSocket; closed: Promise<void> }> = []
  onTestFinished(async () => {
    for (const { socket } of connections) socket.terminate()
    await Promise.all([relay.close(), ...connections.map(connection => connection.closed)])
  })
  await relay.start()
  const upgrades = { control: 0, data: 0 }
  let agreement = 30, phoneData: WebSocket | undefined
  const ports = (role: 'desktop' | 'phone', primitives = nodeE2EPrimitives): PairedRelayPorts => {
    const connect = (kind: 'control' | 'data', path: string, protocol: string, headers: Record<string, string>) => {
      const socket = new WebSocket('ws://127.0.0.1:' + relay.port() + path, protocol, { perMessageDeflate: false, handshakeTimeout: policy.handshakeMs,
        headers: { Host: record.audience, 'X-DSH-Relay-Role': role, ...(role === 'phone' ? { Origin: 'https://' + record.audience } : {}), ...headers } })
      connections.push({ socket, closed: new Promise(resolve => socket.once('close', resolve)) })
      socket.once('open', () => { upgrades[kind]++ })
      return socket
    }
    return { clock, scheduler, primitives, signer: role === 'desktop' ? desktopKey : phoneKey,
      remotePublicSpki: role === 'desktop' ? record.phonePublicSpki : record.desktopPublicSpki,
      control: nodeRelaySocket(connect('control', RELAY_CONTROL_PATH, RELAY_CONTROL_SUBPROTOCOL, { 'X-DSH-Relay-Pair': pairId }), hostConfig.maxControlFrames, false),
      agreement: async () => { const scalar = ++agreement; return { key: new ImportedP256Agreement(fixtureKey(scalar).pkcs8), nonce: Buffer.alloc(32, scalar) } },
      data: async lease => {
        const { room, token } = lease.receipt
        const socket = connect('data', RELAY_PATH, RELAY_SUBPROTOCOL, { Authorization: 'Bearer ' + token, 'X-DSH-Relay-Room': room })
        if (role === 'phone') phoneData = socket
        return nodeRelaySocket(socket, hostConfig.maxControlFrames)
      },
    }
  }
  return {
    ports, upgrades,
    watchPhoneDataWrites: () => { assert.ok(phoneData); return vi.spyOn(phoneData, 'send') },
    dropPhoneData: () => { assert.ok(phoneData); phoneData.terminate() },
  }
}

async function richReconnectFixture(ctx: Context, world: string, origin: string, client: WorkspaceClient) {
  ctx.effect(() => ctx.typert.register(validateTypertManifest('@deepseek-ai/dsh-experimental-rich-inline', RICH_TYPERT)))
  const code = { key: 'workspace-reconnected-rich', html: '<label>Note<input name="note"></label>', css: '', js: '', fallbackText: 'Note form', stateSchemaVersion: 1 }
  const replay = await installWorkspaceRichReplay(ctx, world, code)
  onTestFinished(() => replay.dispose())
  const { sessionId } = await ctx.sessionController.create({ cwd: world })
  const selection = await ctx.sessionController.readModelSelection({ sessionId })
  expect(await ctx.sessionController.compareAndSelectModel({ sessionId, expectedSelectionRevision: selection.selectionRevision,
    selection: { provider: 'workspace-rich-replay', model: 'main' } })).toMatchObject({ applied: true })
  await ctx.sessionController.prompt({ sessionId, requestId: id<'session-request-id'>('workspace-reconnected-rich'), mode: 'queue',
    content: [{ type: 'text', text: 'Return the fixed offline Rich form.' }] }, AbortSignal.timeout(30000))
  const agent = ctx.agents.get(sessionId), session = ctx.sessions.get(sessionId)
  assert.ok(agent && session)
  await agent.whenIdle(); await ctx.sessionPersistence.flush()
  const published = session.snapshotEvents().find(event => event.type === 'assistant/message')
  assert.ok(published?.type === 'assistant/message')
  const messageId = published.data.message.id
  const owner = { sessionId, messageId, blockId: authoredBlockId(messageId, code.key) }
  const status = z.object({ actionId: z.string(), state: z.string(), ledgerSeq: z.number() })
  const snapshot = z.object({ dataRevision: z.number(), manifest: z.object({ stateSchemaVersion: z.number() }),
    draft: z.object({ draftRevision: z.number(), fields: z.record(z.string(), z.unknown()) }), actions: z.array(status) })
  const mount = z.object({ mountId: z.string(), snapshot })
  const receipt = z.object({ accepted: z.literal(true), code: z.literal('ACCEPTED'), state: z.literal('accepted'),
    actionId: z.string(), draftRevision: z.number() })
  const call = async (target: WorkspaceClient, operation: string, request: object) => {
    const method = 'richInline/' + operation
    const response = await target.fetch(new Request(origin + '/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args: { request } } }) }))
    expect(response.status).toBe(200)
    const reply = z.object({ type: z.literal('server-response'), result: z.object({ ok: z.boolean(), value: z.unknown().optional(), error: z.unknown().optional() }) }).parse(await response.json())
    assert.ok(reply.result.ok, JSON.stringify(reply.result.error))
    return reply.result.value
  }
  const original = mount.parse(await call(client, 'mount', owner))
  const originalMount = { sessionId, mountId: original.mountId }
  const prepareAction = async (actionId: string, note: string) => {
    const state = snapshot.parse(await call(client, 'snapshot', originalMount))
    return { actionId, actionName: 'submit', targetActionId: null, expectedDataRevision: state.dataRevision, values: { note }, fileGrants: [],
      draft: { baseRevision: state.draft.draftRevision, stateSchemaVersion: state.manifest.stateSchemaVersion, fields: { note }, dirty: ['note'] } }
  }
  const completed = await prepareAction('workspace-action-completed', 'completed note')
  receipt.parse(await call(client, 'invoke', { ...originalMount, ...completed }))
  await expect.poll(async () => status.parse(await call(client, 'status', { ...originalMount, actionId: completed.actionId })).state,
    { timeout: 30000 }).toBe('completed')
  await agent.whenIdle()
  const last = snapshot.parse(await call(client, 'snapshot', originalMount)), note = 'draft before reconnect'
  expect(await call(client, 'saveDraft', { ...originalMount, draft: { baseRevision: last.draft.draftRevision,
    stateSchemaVersion: last.manifest.stateSchemaVersion, fields: { note }, dirty: ['note'] } })).toMatchObject({ accepted: true })
  const pending = await prepareAction('workspace-action-unresolved', note)
  const query = parseActionRequest({ ...originalMount, actionId: pending.actionId })
  assert.ok(query)
  return {
    invoke: () => call(client, 'invoke', { ...originalMount, ...pending }),
    async statusBeforeDisconnect() {
      const lookup = async () => status.parse(await ctx.richInline.status(query))
      await expect.poll(async () => (await lookup()).state, { timeout: 5000 }).toBe('outcome_unknown')
      await agent.whenIdle(); await ctx.sessionPersistence.flush()
      replay.assertConsumed(); expect(replay.count()).toBe(4)
      return lookup()
    },
    deny: (target: WorkspaceClient) => expect(call(target, 'status', query))
      .rejects.toMatchObject({ code: 'workspace-grant-required' }),
    async recover(target: WorkspaceClient, previous: z.infer<typeof status>) {
      const restored = mount.parse(await call(target, 'mount', owner))
      expect(restored.mountId).not.toBe(originalMount.mountId)
      expect(restored.snapshot.draft.fields).toEqual({ note })
      expect(restored.snapshot.actions).toContainEqual(previous)
      const replacement = { sessionId, mountId: restored.mountId }
      const replacementQuery = { ...replacement, actionId: pending.actionId }
      expect(status.parse(await call(target, 'status', replacementQuery))).toEqual(previous)
      expect(replay.count()).toBe(4)
      expect(receipt.parse(await call(target, 'invoke', { ...replacement, ...pending }))).toEqual({
        accepted: true, code: 'ACCEPTED', state: 'accepted', actionId: pending.actionId, draftRevision: pending.draft.baseRevision + 1,
      })
      expect(status.parse(await call(target, 'status', replacementQuery))).toEqual(previous)
      expect(snapshot.parse(await call(target, 'snapshot', replacement))).toEqual(restored.snapshot)
      await call(target, 'dispose', originalMount)
      await call(target, 'dispose', replacement)
      await agent.whenIdle(); await ctx.sessionPersistence.flush()
      expect(session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.content.some(part =>
        part.type === 'text' && part.text.startsWith('Interactive input ') && part.text.includes('"actionId":"workspace-action-unresolved"')))).toHaveLength(1)
      replay.assertConsumed(); expect(replay.count()).toBe(4)
      return { acceptedReplyLostDuringEncryption: true, freshMount: true, exactDraftRestored: true, sameLedgerStatus: true,
        queryDidNotReplay: true, duplicateReturnedOriginalReceipt: true, dispatches: 1, replayResponses: 4, realModelCalls: 0 }
    },
  }
}

async function seedPagedBriefing(ctx: Context, world: string, fieldSize = false) {
  const { sessionId } = await ctx.sessionController.create({ cwd: world })
  const session = ctx.sessions.get(sessionId)
  assert.ok(session)
  const briefing = '这段合成简报正文用来核对跨页读取，只有最早一页应当包含这份正文。'
  const turns = 60
  const trailingReceipts = 24
  const prompt = (turn: number) => `合成任务 ${turn}`
  const appendReceipt = (key: string, text: string) => {
    const commandId = CommandId(key)
    session.append('command/run', { commandId, name: 'harmony-device', source: { kind: 'user' } })
    session.append('command/done', { commandId, kind: 'success', text })
  }
  for (let turn = 1; turn <= turns; turn++) {
    session.append('turn/start', { turn })
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: prompt(turn) }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    const body = turn === 1 ? briefing : `${prompt(turn)} 的后续记录`
    const storedOnly = fieldSize && turn >= 11 && turn <= 35 ? '\n\n[fixture-unused]: https://unused.invalid/' + 'x'.repeat(62080) : ''
    const message = createAssistantMessage({ content: [{ type: 'text', text: body + storedOnly }],
      source: { provider: 'fixed', model: 'fixed' } })
    session.append('assistant/message', { turn, step: 1, stream: [], message }, { surfaceOp: 'append' })
    session.append('turn/end', { turn, reason: { kind: 'completed' } })
    if (fieldSize && turn === 20) {
      for (let index = 1; index <= 112; index++) appendReceipt('synthetic-middle-receipt-' + index, 'Synthetic middle history receipt ' + index)
    }
  }
  for (let index = 1; index <= trailingReceipts; index++) {
    appendReceipt('synthetic-briefing-receipt-' + index, 'Synthetic briefing grant receipt ' + index)
  }
  await ctx.sessionPersistence.flush()
  return { session, sessionId, briefing, turns, trailingReceipts, prompt }
}

async function checkEarlierBriefingPages(ctx: Context, world: string, origin: string, client: WorkspaceClient, maxResponseBytes: number) {
  const { session, sessionId, briefing, turns, trailingReceipts } = await seedPagedBriefing(ctx, world)
  const address = { kind: 'session', sessionId }
  const window = { maxMessages: 500, turnWindow: { minMessages: 50, minTurns: 2 } }
  const page = z.object({ records: z.array(z.object({ type: z.literal('event'),
    event: z.object({ seq: z.number().int().nonnegative() }).passthrough() })).min(1), hasMore: z.boolean() })
  const snapshot = page.extend({ type: z.literal('snapshot'), header: z.object({ id: z.literal(sessionId) }), cursor: z.number().int() })
  let opening
  for await (const frame of client.openStream('session/follow', { args: { request: { address, assistantStream: true, ...window } } },
    AbortSignal.timeout(10000))) {
    opening = snapshot.parse(frame)
    break
  }
  assert.ok(opening)
  expect(opening.hasMore).toBe(true)
  expect(JSON.stringify(opening.records)).toContain('Synthetic briefing grant receipt ' + trailingReceipts)
  expect(JSON.stringify(opening.records)).not.toContain(briefing)
  const throughSeq = opening.cursor
  const endpoint = 'session/page'
  const reply = z.object({ type: z.literal('server-response'), result: z.object({ ok: z.literal(true), value: page }) })
  const fetchEarlier = (request: object) => client.fetch(new Request(origin + '/api/' + endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: endpoint,
        payload: { args: { request } } }) }))
  const readEarlier = async (beforeSeq: number) => {
    const response = await fetchEarlier({ address, throughSeq, beforeSeq, ...window })
    expect(response.status).toBe(200)
    return reply.parse(await response.json()).result.value
  }
  const middle = await readEarlier(opening.records[0]!.event.seq)
  expect(middle.hasMore).toBe(true)
  expect(JSON.stringify(middle.records)).not.toContain(briefing)
  const oldest = await readEarlier(middle.records[0]!.event.seq)
  expect(oldest.hasMore).toBe(false)
  expect(JSON.stringify(oldest.records)).toContain(briefing)
  expect([...oldest.records, ...middle.records, ...opening.records].map(row => row.event.seq))
    .toEqual(session.snapshotEvents().map(event => event.seq))
  const invalid = await fetchEarlier({ address, throughSeq, beforeSeq: -1, ...window })
  expect(invalid.status).toBe(200)
  expect(await invalid.json()).toMatchObject({ result: { ok: false, error: { code: 'gateway/bad-request' } } })
  const oversized = await ctx.sessionController.create({ cwd: world })
  const oversizedSession = ctx.sessions.get(oversized.sessionId)
  assert.ok(oversizedSession)
  oversizedSession.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'x'.repeat(maxResponseBytes) }],
    source: { kind: 'user' } }), { surfaceOp: 'append' })
  await ctx.sessionPersistence.flush()
  await expect(fetchEarlier({ address: { kind: 'session', sessionId: oversized.sessionId }, throughSeq: oversizedSession.snapshotEvents().at(-1)!.seq,
    ...window })).rejects.toMatchObject({ code: 'unknown-outcome' })
  ctx.llm.assertZeroRealCalls()
  return { turns, trailingReceipts, earlierPages: 2, briefingOnlyInOldestPage: true, gaplessJournal: true, realModelCalls: 0,
    privateValues: [sessionId, briefing, oversized.sessionId] }
}

async function checkArchiveApi(ctx: Context, client: WorkspaceClient, origin: string, cwd: string) {
  const { sessionId } = await ctx.sessionController.create({ cwd })
  const childId = id<'SessionId'>('workspace-archive-child-' + randomUUID())
  const createdAt = Date.now()
  const child = await ctx.sessionPersistence.create({ version: SESSION_FORMAT_VERSION, id: childId, createdAt,
    isSeeded: false, cwd, parentSession: sessionId, origin: 'subagent', delegationDepth: 1 })
  try {
    await child.append([
      { type: 'turn/start', seq: SessionSeq(0), time: createdAt, data: { turn: 1 } },
      { type: 'turn/end', seq: SessionSeq(1), time: createdAt + 1, data: { turn: 1, reason: { kind: 'completed' } } },
    ])
  } finally { await child.close() }
  const call = async (operation: 'archiveSession' | 'unarchiveSession', target: typeof sessionId, owner = false) => {
    const method = 'workspace/' + operation
    const request = new Request(origin + '/api/' + method, { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args: { request: { sessionId: target } } } }),
    })
    const response = owner ? await ctx.connection.createSharedFetchHandler('/api').fetch(request, ctx.connection.browserPeer) : await client.fetch(request)
    return response.json()
  }
  expect((await ctx.sessionController.list({}, new AbortController().signal)).items).toContainEqual(expect.objectContaining({ sessionId: childId, origin: 'subagent' }))
  const denied = await call('archiveSession', childId)
  expect(denied).toMatchObject({ result: { ok: false, error: { code: 'remote-access/denied' } } })
  expect(ctx.workspaceRegistry.archivedSessionIds).not.toContain(childId)
  await ctx.workspaceRegistry.archiveSession(childId)
  try {
    expect(await call('unarchiveSession', childId)).toMatchObject({ result: { ok: false, error: { code: 'remote-access/denied' } } })
    expect(ctx.workspaceRegistry.archivedSessionIds).toContain(childId)
    const reply = z.object({ result: z.object({ ok: z.literal(true), value: z.object({ archivedSessionIds: z.array(z.string()) }) }) })
    const archived = reply.parse(await call('archiveSession', sessionId)).result.value.archivedSessionIds
    expect(archived).toContain(sessionId)
    expect(ctx.workspaceRegistry.archivedSessionIds).toContain(sessionId)
    const restored = reply.parse(await call('unarchiveSession', sessionId)).result.value.archivedSessionIds
    expect(restored).not.toContain(sessionId)
    expect(ctx.workspaceRegistry.archivedSessionIds).not.toContain(sessionId)
    const ownerArchive = reply.parse(await call('archiveSession', sessionId, true)).result.value.archivedSessionIds
    expect(ownerArchive).toEqual(expect.arrayContaining([childId, sessionId]))
    const ownerRestore = reply.parse(await call('unarchiveSession', sessionId, true)).result.value.archivedSessionIds
    expect(ownerRestore).toContain(childId)
    const candidate = process.env.DSH_HARMONY_WORKSPACE_ARCHIVE_CANDIDATE !== undefined
    if (candidate) {
      expect(archived).not.toContain(childId)
      expect(restored).not.toContain(childId)
    }
    return { visibleArchive: true, visibleRestore: true, hiddenArchiveDenied: true, hiddenRestoreDenied: true,
      hiddenIdInArchiveResponse: archived.includes(childId), hiddenIdInRestoreResponse: restored.includes(childId), ownerStillSeesAll: true, candidate }
  } finally {
    await ctx.workspaceRegistry.unarchiveSession(sessionId)
    await ctx.workspaceRegistry.unarchiveSession(childId)
  }
}

it('requires a new workspace grant after losing a close response and rejects a close interrupted during encryption', async () => {
  const devflow = process.env.DSH_HARMONY_WORKSPACE_ACCESS_DEVFLOW === '1' ? process.env.DSH_HARMONY_WORKSPACE_DEVFLOW : undefined
  const configuration = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8'))
  const maxChunkBytes: number = devflow === undefined ? 524288 : configuration.core.workspace.maxChunkBytes
  const large = 'x'.repeat(maxChunkBytes + 190712)
  const f = await fixture(true, maxChunkBytes, devflow)
  if (devflow === undefined) {
    await f.ctx.plugin(DynamicCordisRunner, { vmTimeoutMs: 5000, clientInspectTimeoutMs: 10000 })
    f.ctx.effect(() => f.ctx.typert.register(validateTypertManifest('@deepseek-ai/dsh-cordis-host-runner', CORDIS_RUNNER_TYPERT)))
  }
  const standardApis = [['dynamicCordisRunner/inventory', {}, []], ['dynamicCordisRunner/syncInspectManifest', { providers: [] }, null]] as const
  const checkStandardApis = async (client: WorkspaceClient) => {
    for (const [method, args, result] of standardApis) {
      const response = await client.fetch(new Request(f.origin + '/api/' + method, { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'workspace-loopback-' + method, method, payload: { args } }),
      }))
      expect(response.status, method).toBe(200)
      expect(await response.json(), method).toMatchObject({ type: 'server-response', result: { ok: true, value: result } })
    }
  }
  const toolboxRequest = (client: WorkspaceClient, operation: 'settingsGet' | 'settingsSave', request: object) => {
    const method = 'devflowToolbox/' + operation
    return client.fetch(new Request(f.origin + '/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args: { request } } }) }))
  }
  const toolboxReply = z.object({ type: z.literal('server-response'), result: z.object({ ok: z.literal(true),
    value: z.object({ revision: z.number().int().nonnegative(), draft: z.json(), effective: z.object({ mode: z.enum(['direct', 'auto']) }) }) }) })
  const settingsValue = async (response: Response) => {
    expect(response.status).toBe(200)
    return toolboxReply.parse(await response.json()).result.value
  }
  const global = { scope: 'global' }
  f.ctx.on('webserver/index-inject', (rows: IndexInjection[]) => { rows.push({ kind: 'global', name: '__DSH_WORKSPACE_LARGE_FIXTURE__', value: large }) })
  const budgets = { ...configuration.relay, maxRoomTtlMs: 60000,
    ...(devflow === undefined ? { e2e: { ...configuration.relay.e2e, maxFrameBytes: 2097152, maxPlaintextBytes: 1048576 } } : {}) }
  const relay = await loopbackRelay(f.record, budgets, f.now, f.scheduler)
  const provider = new DeviceBindingProfileProvider(f.ctx, f.now)
  onTestFinished(() => provider.close())
  const limits = Desktop.resolveOptions({ enabled: true, desktopId: f.record.desktopId, profileId: 'desktop' }, f.now).limits
  const expiresAt = f.now() + 60000
  let beforeReply: { ingress: boolean; entered: PromiseWithResolvers<void>; release: PromiseWithResolvers<void> } | undefined
  let beforeSeal: { entered: PromiseWithResolvers<void>; release: PromiseWithResolvers<void> } | undefined
  const desktopPrimitives = { ...nodeE2EPrimitives, async encrypt(...input: Parameters<typeof nodeE2EPrimitives.encrypt>) {
    const paused = beforeSeal
    if (paused !== undefined) { paused.entered.resolve(); await paused.release.promise }
    return nodeE2EPrimitives.encrypt(...input)
  } }
  const traceOutput = vi.spyOn(console, 'info'), tracePrefix = 'DSH_WORKSPACE_TRACE at=%s '
  onTestFinished(() => { traceOutput.mockRestore() })
  const traces = () => traceOutput.mock.calls.flatMap(([format, at, ...fields]) => {
    if (typeof format !== 'string' || !format.startsWith(tracePrefix)) return []
    expect(Number.isFinite(Date.parse(at))).toBe(true)
    return [[format.slice(tracePrefix.length), ...fields]]
  })
  const makeDesktop = (workspace: DeviceWorkspaceAccess, traceWorkspaceRequests?: boolean) => new DeviceBindingDesktopRelay(f.owner, provider, { paired: f.record, desktopId: f.record.desktopId,
    workspace, ...(traceWorkspaceRequests === undefined ? {} : { traceWorkspaceRequests }), isRouteCurrent: async () => {
      const paused = beforeReply
      if (paused !== undefined) {
        if (paused.ingress) paused.ingress = false
        else { paused.entered.resolve(); await paused.release.promise }
      }
      return true
    },
    trust: { pairId: deviceRelayPairId(f.record), epoch: f.record.epoch, role: 'desktop', audience: f.record.audience,
      credentialId: id<'harmony-device-credential'>(f.record.desktopCredentialId), expiresAt },
    policy: budgets, limits, openPorts: () => relay.ports('desktop', desktopPrimitives),
  })
  const desktop = makeDesktop(f.access, true)
  const stop = await desktop.mount(f.ctx)
  onTestFinished(stop)
  let rpc: DeviceProductRpc | undefined
  const core = new NativeDeviceCore(JSON.stringify(f.record), expiresAt, budgets, relay.ports('phone'), () => {}, raw => rpc?.receive(raw), undefined)
  onTestFinished(() => core.close())
  await core.initialize(); await core.ready()
  const oldBinding = core.binding
  rpc = new DeviceProductRpc(core, f.scheduler, 10000, 16, 'workspace-encrypted', 16)
  onTestFinished(() => rpc?.close())
  const original = rpc
  await expect(original.call({ method: 'workspace', argument: { operation: 'bootstrap' } })).rejects.toMatchObject({ code: 'workspace-grant-required' })
  await f.access.allow(f.authority)
  const chunks: number[] = []
  const client = new WorkspaceClient({ request: async (argument, signal) => {
    const result = await original.call({ method: 'workspace', argument }, signal)
    if (argument.operation === 'read') chunks.push(Buffer.byteLength(JSON.stringify(result)))
    return result
  },
    encode: bytes => Buffer.from(bytes).toString('base64url'), decode: value => Uint8Array.from(Buffer.from(value, 'base64url')),
  }, { origin: f.origin, maxRequestBytes: 1024 * 1024, maxResponseBytes: f.maxResponseBytes, maxChunkBytes })
  onTestFinished(() => client.close())
  const sealPause = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
  beforeSeal = sealPause
  const pendingBoot = client.bootstrap(f.signal).then(value => ({ ok: true, value }) as const, error => ({ ok: false, error }) as const)
  const bootstrapTraces = () => traces().filter(([, seq, operation]) => seq === 2 && operation === 'bootstrap')
  try {
    await Promise.race([sealPause.entered.promise, pendingBoot.then(() => assert.fail('workspace encryption was not held'))])
    expect(bootstrapTraces().map(([, , , stage]) => stage)).toEqual(['received', 'result-ready', 'sending'])
  } finally {
    beforeSeal = undefined
    sealPause.release.resolve()
  }
  const boot = await pendingBoot
  if (!boot.ok) throw boot.error
  expect(traces()).toContainEqual(['Workspace carrier encrypted stage=%s', 'peer-verified'])
  expect(bootstrapTraces().map(([, , , stage]) => stage)).toEqual(['received', 'result-ready', 'sending', 'socket-submitted'])
  expect(bootstrapTraces().every(([, , , , elapsed]) => Number.isSafeInteger(elapsed) && elapsed >= 0)).toBe(true)
  expect(boot.value).toContainEqual({ kind: 'global', name: '__DSH_REMOTE_ACCESS__', value: expect.objectContaining({ owner: false }) })
  expect(boot.value).toContainEqual({ kind: 'global', name: '__DSH_WORKSPACE_LARGE_FIXTURE__', value: large })
  expect(chunks).toHaveLength(2)
  expect(Math.max(...chunks)).toBeGreaterThan(maxChunkBytes)
  expect(Math.max(...chunks)).toBeLessThan(budgets.e2e.maxPlaintextBytes)
  const largeTransfer = { payloadBytes: large.length, chunkBytes: maxChunkBytes, reads: chunks.length, maxSerializedChunkBytes: Math.max(...chunks), plaintextBytes: budgets.e2e.maxPlaintextBytes }
  await checkStandardApis(client)
  await original.call({ method: 'workspace', argument: { operation: 'close' } })
  expect(await client.bootstrap(f.signal)).toBeTruthy()
  const stillOpen = workspaceBodySchema.parse(await original.call({ method: 'workspace', argument: { operation: 'bootstrap' } }))
  const admission = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
  const connectionLifetime = f.owner.connectionLifetime.bind(f.owner)
  const heldAdmission = vi.spyOn(f.owner, 'connectionLifetime').mockImplementationOnce(async (...args) => {
    const lifetime = await connectionLifetime(...args)
    admission.entered.resolve()
    await admission.release.promise
    return lifetime
  })
  const closeCancellation = new AbortController()
  const cancelledClose = original.call({ method: 'workspace', argument: { operation: 'close' } }, closeCancellation.signal)
    .then(value => ({ ok: true, value }) as const, error => ({ ok: false, error }) as const)
  let cancelledTraceId: unknown
  try {
    await Promise.race([admission.entered.promise, cancelledClose.then(() => assert.fail('workspace close admission was not held'))])
    const lastTrace = traces().at(-1)
    expect(lastTrace).toEqual(['Workspace RPC seq=%d operation=%s stage=%s elapsedMs=%d', expect.any(Number), 'close', 'received', expect.any(Number)])
    cancelledTraceId = lastTrace?.[1]
    closeCancellation.abort()
    expect(await cancelledClose).toMatchObject({ ok: false, error: { code: 'cancelled' } })
    // This response confirms the ordered carrier has processed the preceding stop.
    await expect(original.call({ method: 'metadata', argument: null })).resolves.toMatchObject({ desktopId: f.record.desktopId })
  } finally {
    heldAdmission.mockRestore()
    admission.release.resolve()
  }
  await expect.poll(() => traces().some(([format, seq]) => seq === cancelledTraceId && String(format).includes('outcome=')))
    .toBe(true)
  await expect(original.call({ method: 'workspace', argument: { operation: 'read', id: stillOpen.id, offset: 0 } }))
    .resolves.toMatchObject({ offset: 0 })
  await original.call({ method: 'workspace', argument: { operation: 'release', id: stillOpen.id } })
  const toolboxBefore = devflow === undefined ? undefined : await settingsValue(await toolboxRequest(client, 'settingsGet', global))
  const toolboxSeed = toolboxBefore === undefined ? undefined : await settingsValue(await toolboxRequest(client, 'settingsSave',
    { ...global, expectedRevision: toolboxBefore.revision, draft: { mode: 'direct' }, actionId: randomUUID() }))
  const revokedBody = workspaceBodySchema.parse(await original.call({ method: 'workspace', argument: { operation: 'bootstrap' } }))
  const paused = { ingress: true, entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
  beforeReply = paused
  const staleRead = original.call({ method: 'workspace', argument: { operation: 'read', id: revokedBody.id, offset: 0 } })
  // Both outcomes are observed while the reply is held, without a timing delay.
  const completed = staleRead.then(value => ({ ok: true, value }) as const, error => ({ ok: false, error }) as const)
  let revokedTraceId: unknown
  try {
    await Promise.race([paused.entered.promise, completed.then(() => assert.fail('workspace reply was not held'))])
    const lastTrace = traces().at(-1)
    expect(lastTrace).toEqual(['Workspace RPC seq=%d operation=%s stage=%s elapsedMs=%d', expect.any(Number), 'read', 'result-ready', expect.any(Number)])
    revokedTraceId = lastTrace?.[1]
    await f.access.revoke(f.authority)
  } finally {
    beforeReply = undefined
    paused.release.resolve()
  }
  expect(await completed, 'revocation while checking the route must suppress the prepared bytes')
    .toMatchObject({ ok: false, error: { code: 'unknown-outcome' } })
  expect(traces().filter(([, seq]) => seq === revokedTraceId).map(args => args.slice(2, 4).concat(args.slice(5))))
    .toEqual([['read', 'received'], ['read', 'result-ready'], ['read', 'result-ready', 'failed', 'workspace-closed']])
  if (toolboxSeed !== undefined) {
    const beforeRequests = traces().length
    await expect(toolboxRequest(client, 'settingsSave', { ...global, expectedRevision: toolboxSeed.revision, draft: { mode: 'auto' }, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'unknown-outcome' })
    await expect(toolboxRequest(client, 'settingsGet', global)).rejects.toMatchObject({ code: 'unknown-outcome' })
    expect(traces().slice(beforeRequests).filter(([format]) => String(format).includes('outcome=')).map(args => args.slice(2, 4).concat(args.slice(5))))
      .toEqual([['fetch', 'received', 'failed', 'workspace-closed'], ['fetch', 'received', 'failed', 'workspace-closed']])
  }
  await expect(client.bootstrap(f.signal)).rejects.toMatchObject({ code: 'workspace-grant-required' })
  await expect(original.call({ method: 'metadata', argument: null })).resolves.toMatchObject({ desktopId: f.record.desktopId })
  await f.access.allow(f.authority)
  expect(await client.bootstrap(f.signal)).toContainEqual({ kind: 'global', name: '__DSH_REMOTE_ACCESS__', value: expect.objectContaining({ owner: false }) })
  if (toolboxSeed !== undefined) expect(await settingsValue(await toolboxRequest(client, 'settingsGet', global))).toEqual(toolboxSeed)
  await expect(original.call({ method: 'creation-options' })).resolves.toMatchObject(devflow === undefined
    ? { presets: [], defaultModel: { provider: 'rich-inline-replay' } }
    : { presets: expect.any(Array), models: expect.any(Array) })
  let earlierBriefingPages
  if (devflow === undefined) {
    const traceStart = traces().length
    const { privateValues, ...history } = await checkEarlierBriefingPages(f.ctx, f.world, f.origin, client, f.maxResponseBytes)
    const pageTraces = traces().slice(traceStart)
    const pageResults = pageTraces.filter(([format]) => String(format).startsWith('Workspace page ')).map(args => args.slice(2))
    expect(pageResults).toEqual([
      ['advanced', 200, expect.any(Number), expect.any(Number), 'true'],
      ['advanced', 200, expect.any(Number), expect.any(Number), 'false'],
      ['bad-request', 200, expect.any(Number), 'unavailable', 'unavailable'],
    ])
    expect(pageTraces).toContainEqual([
      'Workspace RPC seq=%d operation=%s stage=%s elapsedMs=%d outcome=%s failure=%s',
      expect.any(Number), 'session-page', 'received', expect.any(Number), 'failed', 'workspace-resource-limit',
    ])
    for (const value of privateValues) expect(JSON.stringify(pageTraces)).not.toContain(value)
    earlierBriefingPages = { ...history, trace: { advanced: 2, gatewayBadRequest: true, responseLimit: true, contentFree: true } }
  }
  const rich = devflow === undefined ? await richReconnectFixture(f.ctx, f.world, f.origin, client) : undefined
  const held = await original.call({ method: 'workspace', argument: { operation: 'bootstrap' } })
  const body = workspaceBodySchema.parse(held)
  const actionSeal = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
  const actionTraceStart = traces().length
  if (rich !== undefined) beforeSeal = actionSeal
  const actionReply = rich?.invoke().then(value => ({ ok: true, value }) as const, error => ({ ok: false, error }) as const)
  let actionStatus: Awaited<ReturnType<NonNullable<typeof rich>['statusBeforeDisconnect']>> | undefined
  let actionTraceId: unknown
  const closing = { ingress: true, entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
  const closeWorkspace = () => original.call({ method: 'workspace', argument: { operation: 'close' } })
    .then(value => ({ ok: true, value }) as const, error => ({ ok: false, error }) as const)
  let closeReply: ReturnType<typeof closeWorkspace>
  try {
    if (rich !== undefined && actionReply !== undefined) {
      await Promise.race([actionSeal.entered.promise, actionReply.then(() => assert.fail('Rich invoke response was not held'))])
      const richTraces = traces().slice(actionTraceStart)
      expect(richTraces.map(([, , operation, stage]) => [operation, stage]))
        .toEqual([['fetch', 'received'], ['fetch', 'result-ready'], ['fetch', 'sending']])
      actionTraceId = richTraces[0]?.[1]
      actionStatus = await rich.statusBeforeDisconnect()
    }
    beforeReply = closing
    closeReply = closeWorkspace()
    await Promise.race([closing.entered.promise, closeReply.then(() => assert.fail('workspace close response was not held'))])
    relay.dropPhoneData()
    await expect.poll(() => ({ phoneBindingAborted: oldBinding.signal.aborted, desktop: desktop.terminalState }), { timeout: budgets.handshakeMs })
      .toEqual({ phoneBindingAborted: true, desktop: 'closed' })
  } finally {
    beforeReply = undefined
    closing.release.resolve()
    beforeSeal = undefined
    actionSeal.release.resolve()
  }
  expect(() => core.ticketJson()).toThrow('native device ticket unavailable')
  original.close()
  expect(await closeReply).toMatchObject({ ok: false, error: { code: 'closed' } })
  if (actionReply !== undefined) expect(await actionReply).toMatchObject({ ok: false, error: { code: 'closed' } })
  await core.close(); await stop()
  const enabledTraces = traces()
  if (actionTraceId !== undefined) {
    expect(enabledTraces.filter(([, seq]) => seq === actionTraceId).map(args => args.slice(2, 4).concat(args.slice(5))))
      .toEqual([['fetch', 'received'], ['fetch', 'result-ready'], ['fetch', 'sending'], ['fetch', 'sending', 'cancelled', 'encrypted-failure']])
  }
  expect(JSON.stringify(enabledTraces)).not.toContain(f.origin)
  expect(JSON.stringify(enabledTraces)).not.toContain('workspace-encrypted-rpc-')
  expect(JSON.stringify(enabledTraces)).not.toContain(f.record.deviceId)
  await f.access.close()
  const replacementAccess = f.makeAccess()
  expect(replacementAccess.status(f.authority)).toEqual({ enabled: false, expiresAt: null })
  const nextDesktop = makeDesktop(replacementAccess, devflow === undefined ? undefined : true)
  const nextStop = await nextDesktop.mount(f.ctx); onTestFinished(nextStop)
  const seal = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
  let holdSeal = false
  const phonePrimitives = { ...nodeE2EPrimitives, async encrypt(...input: Parameters<typeof nodeE2EPrimitives.encrypt>) {
    const bytes = await nodeE2EPrimitives.encrypt(...input)
    if (holdSeal) { seal.entered.resolve(); await seal.release.promise }
    return bytes
  } }
  let nextRpc: DeviceProductRpc | undefined
  const nextCore = new NativeDeviceCore(JSON.stringify(f.record), expiresAt, budgets, relay.ports('phone', phonePrimitives), () => {}, raw => nextRpc?.receive(raw), undefined)
  onTestFinished(() => nextCore.close()); await nextCore.initialize(); await nextCore.ready()
  const nextBinding = nextCore.binding
  expect(nextBinding.id).not.toBe(oldBinding.id)
  nextRpc = new DeviceProductRpc(nextCore, f.scheduler, 10000, 16, 'workspace-reconnected', 16)
  const reconnected = nextRpc; onTestFinished(() => reconnected.close())
  await expect(original.call({ method: 'workspace', argument: { operation: 'bootstrap' } })).rejects.toThrow()
  const nextClient = new WorkspaceClient({ request: (argument, signal) => reconnected.call({ method: 'workspace', argument }, signal),
    encode: bytes => Buffer.from(bytes).toString('base64url'), decode: value => Uint8Array.from(Buffer.from(value, 'base64url')),
  }, { origin: f.origin, maxRequestBytes: 1024 * 1024, maxResponseBytes: f.maxResponseBytes, maxChunkBytes })
  onTestFinished(() => nextClient.close())
  await expect(reconnected.call({ method: 'metadata', argument: null })).resolves.toMatchObject({ desktopId: f.record.desktopId })
  await expect(nextClient.bootstrap(f.signal)).rejects.toMatchObject({ code: 'workspace-grant-required' })
  await rich?.deny(nextClient)
  expect(await replacementAccess.allow(f.authority)).toBe(f.now() + 30000)
  expect(await nextClient.bootstrap(f.signal)).toContainEqual({ kind: 'global', name: '__DSH_REMOTE_ACCESS__', value: expect.objectContaining({ owner: false }) })
  await checkStandardApis(nextClient)
  await expect(reconnected.call({ method: 'workspace', argument: { operation: 'read', id: body.id, offset: 0 } })).rejects.toMatchObject({ code: 'unknown-outcome' })
  await expect(reconnected.call({ method: 'metadata', argument: null })).resolves.toMatchObject({ desktopId: f.record.desktopId })
  let richRecovered
  if (rich !== undefined) {
    assert.ok(actionStatus)
    richRecovered = await rich.recover(nextClient, actionStatus)
  }
  let reopenedPanel: { standardWorkspace: true; blankSessionOpened: true; directPlugin: string; settingsRead: true } | undefined
  let pagedBriefingUi: { earlierPages: number; anchorsPreserved: true; briefingVisible: true; createdByWeb: number; realModelCalls: number;
    firstEarlierPage: { bytes: number; chunks: number[]; hostChunksSubmitted: number } } | undefined
  let initialSelection: { desktopFallbackCreated: number; deviceStartupCreated: number; pinnedTranscriptOpened: true;
    trailingCommandReceipts: number; initialTranscriptInViewport: boolean; transcriptInViewportAfterScroll: true } | undefined
  let archiveApi: Awaited<ReturnType<typeof checkArchiveApi>> | undefined
  let archiveManagerPanel: { discoveredInList: true; packageDetail: true; settingsSection: true; compactTitleWidthPx: number; wideTitleWidthPx: number; restoreViewportPx: number; visibleArchiveRestored: true; legacyMetadataDenied: true; legacyFavoriteNotice: string } | undefined
  if (devflow !== undefined) {
    archiveApi = await checkArchiveApi(f.ctx, nextClient, f.origin, f.world)
    const session = await f.ctx.sessionController.create({ cwd: f.world })
    await expect(reconnected.call({ method: 'metadata', argument: null })).resolves.toMatchObject({
      sessions: expect.arrayContaining([expect.objectContaining({ sessionId: session.sessionId, blank: true })]),
    })
    const browser = await launchTestChromium()
    onTestFinished(() => browser.close())
    const openPage = async (plugin?: string, target = session.sessionId, desktopRestore = false, viewport?: { width: number; height: number }) => {
      const page = await newEnglishPage(browser), requests: string[] = [], failures: string[] = []
      const historyBodies = new Map<WorkspaceHandle, { bytes: number; chunks: number[]; done: boolean }>()
      if (viewport !== undefined) await page.setViewportSize(viewport)
      if (desktopRestore) await page.addInitScript(() => {
        Object.defineProperty(globalThis, '__DSH_WORKSPACE_INITIAL_SELECTION__', { get: () => undefined, set: () => {} })
      })
      await page.setViewportSize({ width: 390, height: 844 })
      page.on('pageerror', error => failures.push(error.message))
      page.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
      const port = await installWorkspaceDocument(page, { request: async (argument, signal) => {
        try {
          const result = jsonPayload(await reconnected.call({ method: 'workspace', argument }, signal))
          if (argument.operation === 'fetch' && new URL(argument.url).pathname === '/api/session/page') {
            const { body } = workspaceResponseSchema.parse(result)
            historyBodies.set(body.id, { bytes: body.bytes, chunks: [], done: false })
          }
          if (argument.operation === 'read') {
            const history = historyBodies.get(argument.id)
            if (history !== undefined) {
              const chunk = workspaceChunkSchema.parse(result)
              history.chunks.push(Buffer.from(chunk.body, 'base64url').byteLength)
              history.done = chunk.done
            }
          }
          return result
        }
        catch (error) {
          failures.push(argument.operation + ': ' + String(error))
          throw error
        }
      } },
        target, requests, undefined, plugin, maxChunkBytes)
      onTestFinished(() => port.close())
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url())
        if (url.origin !== f.origin) return route.abort()
        const data = req.postDataBuffer()
        try {
          const response = await nextClient.fetch(new Request(url, { method: req.method(), headers: req.headers(),
            ...(data === null ? {} : { body: Uint8Array.from(data) }) }))
          await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
        } catch (error) { failures.push(url.pathname + ': ' + String(error)); await route.abort() }
      })
      try {
        await page.goto(f.origin + '/')
        await expect.poll(() => port.signals.find(value => value.kind === 'workspace.ready' || value.kind === 'workspace.failed')?.kind,
          { timeout: 15000 }).toBe('workspace.ready')
      } catch (error) {
        await writeFile(join(f.world, 'reopened-page-failure.json'), JSON.stringify({ plugin, failures, requests, signals: port.signals, operations: port.operations }) + '\n')
        throw error
      }
      return { page, port, requests, failures, historyBodies }
    }
    const standard = await openPage()
    await standard.page.locator(`[data-conversation-session="${session.sessionId}"]`).waitFor()
    await standard.port.retire()
    await standard.page.close()
    await reconnected.call({ method: 'workspace', argument: { operation: 'close' } })
    const panel = await openPage('dsh-devflow')
    const editor = panel.page.locator('[data-plugin-panel] .devflow-v2-settings')
    await editor.getByRole('heading', { name: 'Multi-model toolbox', exact: true }).waitFor()
    await editor.getByLabel('Orchestration', { exact: true }).waitFor()
    expect(panel.requests).toContain('/api/devflowToolbox/settingsGet')
    await panel.port.retire()
    await panel.page.close()
    reopenedPanel = { standardWorkspace: true, blankSessionOpened: true, directPlugin: 'dsh-devflow', settingsRead: true }
    await reconnected.call({ method: 'workspace', argument: { operation: 'close' } })
    const briefing = await seedPagedBriefing(f.ctx, f.world, true)
    await f.ctx.workspaceRegistry.pinSession(briefing.sessionId)
    const briefingTraceStart = traces().length
    const briefingView = await openPage(undefined, briefing.sessionId)
    try {
      const conversation = briefingView.page.locator(`[data-conversation-session="${briefing.sessionId}"]`)
      const scroller = conversation.locator('[data-conversation-scroll]')
      await scroller.getByText('Synthetic briefing grant receipt ' + briefing.trailingReceipts, { exact: true }).waitFor()
      const body = scroller.getByText(briefing.briefing, { exact: true })
      const older = scroller.getByRole('button', { name: 'Load earlier', exact: true })
      const pageReads = () => briefingView.requests.filter(path => path === '/api/session/page').length
      const painted = () => scroller.evaluate(async () => {
        await document.fonts.ready
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      })
      const scrollToTop = async () => {
        const box = await scroller.boundingBox()
        assert.ok(box)
        await briefingView.page.mouse.move(box.x + box.width / 2, box.y + Math.min(140, box.height / 3))
        for (let wheel = 0; wheel < 12 && await scroller.evaluate(element => element.scrollTop) > 1; wheel++) {
          await briefingView.page.mouse.wheel(0, -2400)
          await painted()
        }
        expect(await scroller.evaluate(element => element.scrollTop)).toBeLessThanOrEqual(1)
      }
      const initialReads = pageReads()
      for (const [index, to] of [[1, 11], [2, 1]] as const) {
        expect(await body.count()).toBe(0)
        await scrollToTop()
        await older.waitFor()
        const anchor = await scroller.evaluate(element => {
          const row = element.querySelector<HTMLElement>('[data-chat-paging-anchor]:not(:empty):not([hidden]):not([hidden] *)')
          if (row?.dataset.chatAnchorKey === undefined) throw new Error('Briefing paging anchor is unavailable')
          return { key: row.dataset.chatAnchorKey, top: row.getBoundingClientRect().top - element.getBoundingClientRect().top }
        })
        await older.click()
        await scroller.getByText(briefing.prompt(to), { exact: true }).waitFor()
        await expect.poll(pageReads).toBe(initialReads + index)
        await painted()
        const position = () => scroller.evaluate((element, key) => {
          const row = [...element.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')].find(item => item.dataset.chatAnchorKey === key)
          if (row === undefined) throw new Error('Briefing paging anchor no longer exists')
          return row.getBoundingClientRect().top - element.getBoundingClientRect().top
        }, anchor.key)
        await expect.poll(async () => Math.abs(await position() - anchor.top)).toBeLessThanOrEqual(3)
      }
      expect(await older.count()).toBe(0)
      await scrollToTop()
      await body.waitFor()
      await expect.poll(() => body.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        const scrollport = element.closest('[data-conversation-scroll]')?.getBoundingClientRect()
        return scrollport !== undefined && bounds.bottom > scrollport.top && bounds.top < scrollport.bottom
      })).toBe(true)
      expect(briefingView.requests).not.toContain('/api/session/create')
      f.ctx.llm.assertZeroRealCalls()
      const pages = [...briefingView.historyBodies.values()]
      expect(pages).toHaveLength(2)
      const first = pages[0]!
      expect(first.bytes).toBeGreaterThanOrEqual(1600000)
      expect(first.bytes).toBeLessThan(1700000)
      expect(first.chunks).toEqual([maxChunkBytes, first.bytes - maxChunkBytes])
      expect(first.done).toBe(true)
      expect(pages[1]?.done).toBe(true)
      const pageTraces = traces().slice(briefingTraceStart)
      const pageSequence = pageTraces.find(([format]) => String(format).startsWith('Workspace page seq='))?.[1]
      expect(pageSequence).toEqual(expect.any(Number))
      const chunks = pageTraces.filter(([format, sequence]) => String(format).startsWith('Workspace page-chunk ') && sequence === pageSequence)
      expect(chunks.map(args => args.slice(3))).toEqual([
        [0, maxChunkBytes, 'false', 'result-ready'], [0, maxChunkBytes, 'false', 'socket-submitted'],
        [maxChunkBytes, first.bytes - maxChunkBytes, 'true', 'result-ready'],
        [maxChunkBytes, first.bytes - maxChunkBytes, 'true', 'socket-submitted'],
      ])
      pagedBriefingUi = { earlierPages: 2, anchorsPreserved: true, briefingVisible: true, createdByWeb: 0, realModelCalls: 0,
        firstEarlierPage: { bytes: first.bytes, chunks: first.chunks, hostChunksSubmitted: chunks.filter(args => args[6] === 'socket-submitted').length } }
    } finally {
      await briefingView.port.retire()
      await briefingView.page.close()
    }
    if (process.env.DSH_HARMONY_WORKSPACE_INITIAL_SELECTION_STAGE !== undefined) {
      await reconnected.call({ method: 'workspace', argument: { operation: 'close' } })
      const projectPath = join(f.world, 'pinned-history')
      await mkdir(projectPath)
      const project = await f.ctx.workspaceRegistry.create(projectPath, 'Pinned history')
      const pinned = await f.ctx.sessionController.create({ workspaceId: project.id })
      const transcript = 'Existing synthetic pinned history'
      const stored = f.ctx.sessions.get(pinned.sessionId)
      assert.ok(stored)
      stored.append('turn/start', { turn: 1 })
      stored.append('user/message', createUserMessage({ content: [{ type: 'text', text: transcript }], source: { kind: 'user' } }), { surfaceOp: 'append' })
      stored.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      await f.ctx.sessionPersistence.flush()
      await f.ctx.workspaceRegistry.pinSession(pinned.sessionId)
      await expect(reconnected.call({ method: 'metadata', argument: null })).resolves.toMatchObject({
        sessions: expect.arrayContaining([expect.objectContaining({ sessionId: pinned.sessionId, pinned: true, blank: false })]),
      })
      const count = async () => (await f.ctx.sessionController.list({}, f.signal)).items.length
      const before = await count()
      const desktop = await openPage(undefined, pinned.sessionId, true)
      try {
        await expect.poll(() => desktop.requests.filter(path => path === '/api/session/create').length).toBe(1)
        await expect.poll(count).toBe(before + 1)
      } finally {
        await desktop.port.retire()
        await desktop.page.close()
      }
      await reconnected.call({ method: 'workspace', argument: { operation: 'close' } })
      const trailingCommandReceipts = 24
      for (let index = 1; index <= trailingCommandReceipts; index++) {
        const commandId = CommandId('synthetic-grant-receipt-' + index)
        stored.append('command/run', { commandId, name: 'harmony-device', source: { kind: 'user' } })
        stored.append('command/done', { commandId, kind: 'success', text: 'Synthetic workspace grant receipt ' + index })
      }
      await f.ctx.sessionPersistence.flush()
      const pinnedPage = await openPage(undefined, pinned.sessionId, false, { width: 390, height: 760 })
      try {
        expect(pinnedPage.requests).not.toContain('/api/session/create')
        expect(await count()).toBe(before + 1)
        const conversation = pinnedPage.page.locator(`[data-conversation-session="${pinned.sessionId}"]`)
        await conversation.waitFor()
        const lastReceipt = conversation.getByText('Synthetic workspace grant receipt ' + trailingCommandReceipts, { exact: true })
        await lastReceipt.waitFor({ timeout: 10000 })
        const message = conversation.getByText(transcript, { exact: true })
        const scroller = conversation.locator('[data-conversation-scroll]')
        const inViewport = async () => {
          if (await message.count() === 0) return false
          return message.evaluate(element => {
            const messageRect = element.getBoundingClientRect()
            const scrollRect = element.closest('[data-conversation-scroll]')?.getBoundingClientRect()
            return scrollRect !== undefined && messageRect.top < Math.min(scrollRect.bottom, innerHeight)
              && messageRect.bottom > Math.max(scrollRect.top, 0)
          })
        }
        const initialTranscriptInViewport = await inViewport()
        await scroller.evaluate(element => { element.scrollTop = 0 })
        await message.waitFor({ timeout: 10000 })
        await expect.poll(inViewport).toBe(true)
        expect(pinnedPage.requests).not.toContain('/api/session/create')
        expect(await count()).toBe(before + 1)
        initialSelection = { desktopFallbackCreated: 1, deviceStartupCreated: 0, pinnedTranscriptOpened: true,
          trailingCommandReceipts, initialTranscriptInViewport, transcriptInViewportAfterScroll: true }
      } catch (error) {
        const body = await pinnedPage.page.locator('body').innerText({ timeout: 3000 })
        await writeFile(join(f.world, 'initial-selection-failure.json'), JSON.stringify({
          requests: pinnedPage.requests, failures: pinnedPage.failures, signals: pinnedPage.port.signals, sessionCount: await count(), expectedCount: before + 1, body,
        }) + '\n', { flag: 'wx' })
        throw error
      } finally {
        await pinnedPage.port.retire()
        await pinnedPage.page.close()
      }
    }
    if (process.env.DSH_HARMONY_WORKSPACE_ARCHIVE_MANAGER_PANEL !== undefined) {
      const { sessionId } = await f.ctx.sessionController.create({ cwd: f.world })
      await f.ctx.workspaceRegistry.archiveSession(sessionId)
      await reconnected.call({ method: 'workspace', argument: { operation: 'close' } })
      try {
        const archive = await openPage('')
        try {
          const detail = archive.page.locator('[data-plugin-panel]')
          const more = detail.getByRole('button', { name: 'More', exact: true })
          if (await more.isVisible()) await more.click()
          const installed = detail.locator('[data-plugin-package="@michengai/dsh-archive-manager"]')
          await installed.getByRole('button').first().click({ timeout: 10000 })
          await detail.getByRole('heading', { name: 'Archive Manager', exact: true }).waitFor({ timeout: 10000 })
          await archive.page.getByRole('button', { name: 'Open sidebar', exact: true }).click({ timeout: 10000 })
          await openSettings(archive.page, 'en')
          const settings = archive.page.getByRole('dialog', { name: 'Settings', exact: true })
          await settings.getByRole('button', { name: 'Archived sessions', exact: true }).click({ timeout: 10000 })
          const view = settings.locator('.dsham_settings')
          await view.getByRole('heading', { name: 'Archived sessions', exact: true }).waitFor({ timeout: 10000 })
          const row = view.locator('.dsham_settingsRow')
          const title = row.getByRole('button', { name: 'Open session: New Session', exact: true })
          await title.waitFor({ state: 'attached', timeout: 10000 })
          const width = () => title.evaluate(element => element.getBoundingClientRect().width)
          const compactTitleWidthPx = await width()
          await archive.page.setViewportSize({ width: 900, height: 844 })
          await title.waitFor({ timeout: 10000 })
          const wideTitleWidthPx = await width()
          const restoreViewportPx = process.env.DSH_HARMONY_WORKSPACE_COMPACT_SETTINGS === undefined ? 900 : 390
          if (restoreViewportPx === 390) {
            expect(compactTitleWidthPx).toBeGreaterThan(0)
            await archive.page.setViewportSize({ width: restoreViewportPx, height: 844 })
            await title.waitFor({ timeout: 10000 })
            await archive.page.screenshot({ path: join(f.world, 'archive-manager-compact.png') })
          }
          const denied = view.getByRole('alert').filter({ hasText: /workspaceRegistry\/favoriteSessions.*access denied/ })
          await denied.waitFor({ timeout: 10000 })
          const legacyFavoriteNotice = await denied.innerText()
          const method = 'workspaceRegistry/archivedSessionMetadata'
          const path = '/api/' + method
          await expect.poll(() => archive.requests.includes(path), { timeout: 10000 }).toBe(true)
          const response = await nextClient.fetch(new Request(f.origin + path, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args: {} } }) }))
          expect(response.status).toBe(200)
          expect(await response.json()).toMatchObject({ result: { ok: false, error: { code: 'remote-access/denied' } } })
          await row.getByRole('checkbox').check({ timeout: 5000 })
          await view.getByRole('button', { name: 'Restore selected', exact: true }).click({ timeout: 5000 })
          await expect.poll(() => archive.requests.includes('/api/workspace/unarchiveSession'), { timeout: 5000 }).toBe(true)
          await expect.poll(() => f.ctx.workspaceRegistry.archivedSessionIds.includes(sessionId), { timeout: 5000 }).toBe(false)
          await view.getByText('No archived sessions.', { exact: true }).waitFor({ timeout: 5000 })
          archiveManagerPanel = { discoveredInList: true, packageDetail: true, settingsSection: true, compactTitleWidthPx, wideTitleWidthPx, restoreViewportPx,
            visibleArchiveRestored: true, legacyMetadataDenied: true, legacyFavoriteNotice }
        } catch (error) {
          await writeFile(join(f.world, 'archive-manager-panel-failure.json'), JSON.stringify({ requests: archive.requests,
            text: await archive.page.locator('body').innerText({ timeout: 3000 }) }) + '\n')
          throw error
        } finally {
          await archive.port.retire()
          await archive.page.close()
        }
      } finally { await f.ctx.workspaceRegistry.unarchiveSession(sessionId) }
    }
  }
  expect(relay.upgrades).toEqual({ control: 4, data: 4 })
  const sent = relay.watchPhoneDataWrites()
  onTestFinished(() => { sent.mockRestore() })
  holdSeal = true
  const interrupted = reconnected.call({ method: 'workspace', argument: { operation: 'close' } })
    .then(value => ({ ok: true, value }) as const, error => ({ ok: false, error }) as const)
  try {
    await Promise.race([seal.entered.promise, interrupted.then(() => assert.fail('workspace close encryption was not held'))])
    relay.dropPhoneData()
    await expect.poll(() => ({ phoneBindingAborted: nextBinding.signal.aborted, desktop: nextDesktop.terminalState }), { timeout: budgets.handshakeMs })
      .toEqual({ phoneBindingAborted: true, desktop: 'closed' })
  } finally {
    holdSeal = false
    seal.release.resolve()
  }
  const outcome = await interrupted
  if (outcome.ok) assert.fail('workspace close must fail when encryption loses its binding')
  expect(outcome.error).toBeInstanceOf(E2EError)
  expect(outcome.error).toMatchObject({ code: 'closed' })
  expect(workspaceDiagnosticFailure(outcome.error)).toBe('encrypted-failure')
  expect(sent).not.toHaveBeenCalled()
  if (devflow === undefined) expect(traces()).toEqual(enabledTraces)
  await writeFile(join(process.env.DSH_HARMONY_WORKSPACE_WORLD!, 'encrypted.json'), JSON.stringify({
    e2e: true, nativeDeviceCore: true, realP256: true, separateGrant: true, pairingRetained: true,
    sockets: 'loopback-websocket', upgrades: relay.upgrades, networkKitPhoneOrigin: true, externalNetwork: false, tls: false,
    arkWeb: false, recoveredFromDataSocketLoss: true, reconnectedWithFreshProof: true, oldHandlesDenied: true,
    cancelledBeforeHostDispatchPreservedHandle: true, closeResponseLostAfterHostDispatch: true, pendingCloseRejectedOnRpcDisposal: true,
    closeEncryptionInterruptedBeforeSend: true, closeEncryptionDiagnostic: 'encrypted-failure',
    desktopWorkspaceOwnerRebuilt: true, workspaceDeniedBeforeFreshLocalGrant: true, nativeMetadataAvailableBeforeFreshLocalGrant: true,
    preparedReplyDeniedAfterGrantRevocation: true,
    ...(toolboxSeed === undefined ? {} : { revokedDevflowRpc: { readsDenied: true, writesDenied: true, settingsUnchanged: true, reusedConnection: true } }),
    hostWorkspaceTrace: { successfulStages: ['received', 'result-ready', 'sending', 'socket-submitted'],
      pausedDuringEncryption: true, revokedAfterResultReady: true, connectionStagesObserved: true, contentFree: true,
      ...(devflow === undefined ? { absentWhenDisabled: true } : {}) },
    standardApisBeforeAndAfterReconnect: standardApis.map(([method]) => method), largeTransfer,
    ...(archiveApi === undefined ? {} : { archiveApi }),
    ...(archiveManagerPanel === undefined ? {} : { archiveManagerPanel }),
    ...(reopenedPanel === undefined ? {} : { reopenedPanel }),
    ...(initialSelection === undefined ? {} : { initialSelection }),
    ...(richRecovered === undefined ? {} : { richRecovered: { ...richRecovered, deniedBeforeFreshGrant: true } }),
    ...(earlierBriefingPages === undefined ? {} : { earlierBriefingPages }),
    ...(pagedBriefingUi === undefined ? {} : { pagedBriefingUi }),
  }) + '\n')
})

it('workspace revocation and expiry stop old generations while the narrow device registration remains usable', async () => {
  const f = await fixture()
  await f.access.allow(f.authority)
  const first = await f.makeClient()
  await f.access.revoke(f.authority)
  await expect(first.client.bootstrap(f.signal)).rejects.toMatchObject({ code: 'workspace-closed' })
  expect(f.access.status(f.authority)).toEqual({ enabled: false, expiresAt: null })
  await expect(f.owner.catalog(f.transport, f.ticket)).resolves.toEqual([])
  await f.access.allow(f.authority)
  const second = await f.makeClient()
  f.expire()
  await expect(second.client.bootstrap(f.signal)).rejects.toMatchObject({ code: 'workspace-closed' })
  await expect(f.access.open(f.transport, f.ticket)).rejects.toMatchObject({ code: 'workspace-grant-required' })
  await expect(f.owner.catalog(f.transport, f.ticket)).resolves.toEqual([])
})
