/** Real ArkWeb acceptance fixture with synthetic services; only the encrypted carrier is substituted by emulator loopback. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile, appendFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import type { RemoteAccessAction, RemoteAccessBinding } from '@deepseek-ai/dsh-api-remote-access'
import { WorkspaceChannel } from '../desktop-plugin/src/workspace-channel.ts'
import { WorkspaceWireHost } from '../desktop-plugin/src/workspace-wire.ts'
import { WorkspaceShell } from '../desktop-plugin/src/workspace-shell.ts'
import { WorkspaceClient } from '../src/workspace-client.ts'
import { prepareWorkspace } from '../src/workspace-prepare.ts'
import { workspaceRequestSchema } from '../src/workspace-protocol.ts'
import { installWorkspaceRichReplay } from './workspace-rich-replay.ts'
import { installWorkspaceDevflowReplay } from './workspace-devflow-replay.ts'
import { id } from '../src/protocol.ts'
import { authoredBlockId } from '../../../packages/experimental/rich-inline/src/shared/authored.ts'
import { WorkspaceLivePublisher } from './workspace-live.ts'
import { createWorkspaceCipherFixture } from './workspace-cipher-fixture.ts'
import type { WorkspaceWssTls } from './workspace-memory-relay.ts'
import type { WorkspaceStandaloneWssInputs } from './workspace-standalone-wss.ts'

const inputSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('poll'), id: z.string().min(1), generation: z.literal(1) }).strict(),
  z.object({ operation: z.literal('cancel'), id: z.string().min(1), generation: z.literal(1) }).strict(),
  z.object({ operation: z.literal('meta'), id: z.string().min(1), generation: z.literal(1) }).strict(),
  z.object({ operation: z.literal('prepare'), id: z.string().min(1), generation: z.literal(1) }).strict(),
  z.object({ operation: z.literal('request'), id: z.string().min(1), generation: z.literal(1), raw: z.string().max(2 * 1024 * 1024) }).strict(),
  z.object({ operation: z.literal('resource'), id: z.string().min(1), generation: z.literal(1), url: z.string().url(),
    maxBytes: z.literal(16 * 1024 * 1024), maxChunkBytes: z.number().int().positive().max(1048576) }).strict(),
])

/** Parameters select only host-owned files and synthetic profile services. */
export interface WorkspaceEmulatorFixture {
  readonly world: string
  readonly clientRoot: string
  readonly shellIndex: string
  readonly fixtureConfiguration: string
  readonly workflowRun: boolean
  readonly encrypted?: boolean
  readonly admissionReview?: 'padded' | 'disk' | 'disk-latency' | 'disk-field'
  readonly rpcDiagnostics?: boolean
  readonly hostChunkBytes?: number
  readonly official?: boolean
  readonly keyboardDiagnostics?: boolean
  readonly keyboardAttachDiagnostics?: boolean
  readonly keyboardPlainFirst?: boolean
  readonly devflowConflictReview?: boolean
  readonly brickReview?: boolean
  readonly archiveManagerReview?: boolean
  readonly richImeDraft?: '\u{1F642}'
  readonly devflowImeLabel?: '\u{1F642}'
  readonly panelTargetPackage?: string
  readonly packagedDesktopRelay?: string
  readonly nativeWssTls?: WorkspaceWssTls
  readonly standaloneWss?: WorkspaceStandaloneWssInputs
}
/** @param ctx - the isolated source or copied-installed profile. @param fixture - local shell and emulator fixture selection. @returns checked native and Host observations after all carrier resources close. */
export async function runWorkspaceEmulator(ctx: Context, fixture: WorkspaceEmulatorFixture) {
  const { world, clientRoot, shellIndex, fixtureConfiguration, workflowRun } = fixture
  if (fixture.keyboardPlainFirst) assert.ok(fixture.keyboardAttachDiagnostics)
  if (fixture.keyboardAttachDiagnostics) assert.ok(workflowRun && fixture.keyboardDiagnostics && fixture.standaloneWss !== undefined)
  if (fixture.devflowConflictReview) assert.ok(workflowRun && fixture.keyboardDiagnostics && !fixture.keyboardAttachDiagnostics && fixture.standaloneWss !== undefined)
  if (fixture.brickReview) assert.ok(workflowRun && fixture.standaloneWss !== undefined && !fixture.keyboardDiagnostics)
  if (fixture.archiveManagerReview) assert.ok(workflowRun && fixture.standaloneWss !== undefined && fixture.packagedDesktopRelay !== undefined)
  if (fixture.richImeDraft !== undefined) assert.ok(!workflowRun && fixture.official && fixture.standaloneWss !== undefined && !fixture.keyboardDiagnostics)
  if (fixture.devflowImeLabel !== undefined) assert.ok(workflowRun && !fixture.official && fixture.standaloneWss !== undefined && !fixture.keyboardDiagnostics)
  const systemIme = fixture.richImeDraft !== undefined || fixture.devflowImeLabel !== undefined
  if (fixture.nativeWssTls !== undefined || fixture.standaloneWss !== undefined) {
    assert.ok(fixture.encrypted === true && fixture.rpcDiagnostics !== true)
    assert.ok(fixture.admissionReview === undefined || fixture.standaloneWss !== undefined && fixture.admissionReview === 'disk-latency')
    assert.ok(fixture.nativeWssTls === undefined || fixture.standaloneWss === undefined)
  }
  const fieldAdmission = fixture.admissionReview === 'disk-field'
  const delayedAdmission = fieldAdmission || fixture.admissionReview === 'disk-latency'
  const diskAdmission = delayedAdmission || fixture.admissionReview === 'disk'
  const progress = async (phase: string) => { await writeFile(join(world, 'progress.json'), JSON.stringify({ phase, at: new Date().toISOString() }) + '\n') }
  const { token } = z.object({ schema: z.literal('harmony-workspace-native-fixture/1'), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(JSON.parse(await readFile(fixtureConfiguration, 'utf8')))
  const lifetime = new AbortController(), operations: object[] = [], errors: string[] = []
  await progress('profile-ready')
  let peer: ReturnType<typeof ctx.connection.createPeer> | undefined, wire: WorkspaceWireHost | undefined
  let stopPolicy: (() => void) | undefined, replay: Awaited<ReturnType<typeof installWorkspaceRichReplay>> | undefined
  let workflow: Awaited<ReturnType<typeof installWorkspaceDevflowReplay>> | undefined
  const pending = new Map<string, AbortController>()
  const replies = new Map<string, { state: 'pending' | 'ready' | 'error'; value?: string }>(), tasks = new Set<Promise<void>>()
  let replyBytes = 0
  let guestProbeRequests = 0
  let cipher: Awaited<ReturnType<typeof createWorkspaceCipherFixture>> | undefined
  const server = createServer()
  let deviceFailures = 0
  const stopDeviceLog = fixture.encrypted && fixture.panelTargetPackage !== undefined ? ctx.logger.exporter({
    levels: { default: -1, 'harmony-device': 2 },
    export({ name, args }) {
      if (name !== 'harmony-device' || args[0] !== 'Device %s failed: %s' || deviceFailures >= 16) return
      deviceFailures++
      console.info('WORKSPACE_PANEL_DEVICE_FAILURE ' + JSON.stringify({ operation: args[1], detail: args[2] }))
    },
  }) : undefined
  try {
    const processPath = join(world, 'process.json')
    try {
      const owner = z.object({ pid: z.number().int().positive() }).passthrough().parse(JSON.parse(await readFile(processPath, 'utf8')))
      assert.equal(owner.pid, process.pid, 'The fixture process must own its published lifetime')
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      await writeFile(processPath, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), world }) + '\n', { flag: 'wx' })
    }
    const code = { key: 'workspace-form', html: '<form id="draft"><label>Note<input name="note" value="initial"></label></form><button id="action">Send action</button><button id="status">Query status</button><output id="receipt"></output><output id="actions"></output><output id="scope"></output><output id="security"></output>', css: 'body{font-size:20px}form{padding:16px}input{max-width:90%;font-size:20px}button{font-size:20px;padding:16px;margin:8px}output{display:block;overflow-wrap:anywhere}',
      js: 'window.rich.bindForm(document.getElementById("draft"));document.getElementById("scope").textContent=typeof window.__DSH_TRANSPORT__+":"+typeof window.dshDesktop;window.rich.onState(s=>document.getElementById("actions").textContent=JSON.stringify(s.actions));let count=0;document.getElementById("action").onclick=()=>window.rich.submit(window.rich.getDraft(),{actionId:++count===1?"workspace-action-completed":"workspace-action-unresolved"}).then(r=>document.getElementById("receipt").textContent=JSON.stringify(r));document.getElementById("status").onclick=()=>window.rich.status("workspace-action-unresolved").then(r=>document.getElementById("receipt").textContent=JSON.stringify(r));void(async()=>{const facts={parent:"allowed",storage:"allowed",network:"allowed"};try{void window.parent.__DSH_TRANSPORT__}catch(error){facts.parent="denied"}try{localStorage.setItem("workspace-probe","synthetic")}catch(error){facts.storage="denied"}try{await fetch("http://127.0.0.1:18082/guest-network-probe")}catch(error){facts.network="denied"}document.getElementById("security").textContent=JSON.stringify(facts)})()', fallbackText: 'Note form', stateSchemaVersion: 1 }
    if (workflowRun) { workflow = await installWorkspaceDevflowReplay(ctx, world); replay = workflow }
    else replay = await installWorkspaceRichReplay(ctx, world, code, fixture.official ? 'STANDARD_PLUGIN_REASONING' : undefined)
    await progress('create-session')
    const sessionId = (await ctx.sessionController.create({ cwd: world })).sessionId
    await progress('read-selection')
    const before = await ctx.sessionController.readModelSelection({ sessionId })
    await progress('select-model')
    assert.equal((await ctx.sessionController.compareAndSelectModel({ sessionId, expectedSelectionRevision: before.selectionRevision,
      selection: { provider: workflowRun ? 'workspace-replay' : 'workspace-rich-replay', model: 'main' } })).applied, true)
    const selected = await ctx.sessionController.readModelSelection({ sessionId })
    const panelApplication = fixture.panelTargetPackage === undefined && !fixture.keyboardAttachDiagnostics ? undefined : ctx.get('devflowToolboxApplication') as {
      settingsGet(input: { scope: 'global' }): Promise<{ effective: { mode: string } }>
    }
    const initialPanelMode = panelApplication === undefined ? undefined : (await panelApplication.settingsGet({ scope: 'global' })).effective.mode
    if (fixture.panelTargetPackage !== undefined) {
      assert.ok(panelApplication); assert.notEqual(initialPanelMode, 'auto', 'the UI save must change the fresh profile')
      await writeFile(join(world, 'initial-plugin-settings.json'), JSON.stringify({ mode: initialPanelMode }) + '\n')
    }
    if (fixture.panelTargetPackage === undefined) {
      await progress('initial-prompt')
      await ctx.sessionController.prompt({ sessionId, requestId: id<'session-request-id'>('workspace-emulator-initial'), mode: 'queue', content: [{ type: 'text', text: workflowRun ? 'Return WORKSPACE_DIRECT_OK without delegating.' : 'Return the fixed offline rich form.' }] }, AbortSignal.any([lifetime.signal, AbortSignal.timeout(45000)]))
      await progress('initial-agent-idle')
      await ctx.agents.get(sessionId)!.whenIdle(); await ctx.sessionPersistence.flush(); assert.equal(replay.count(), 1)
    }
    const published = ctx.sessions.get(sessionId)!.snapshotEvents().find(event => event.type === 'assistant/message')
    const archived = fixture.archiveManagerReview ? (await ctx.sessionController.create({ cwd: world })).sessionId : undefined
    if (archived !== undefined) {
      assert.notEqual(archived, sessionId)
      await ctx.workspaceRegistry.archiveSession(archived)
      assert.deepEqual([...ctx.workspaceRegistry.archivedSessionIds], [archived])
    }
    await progress('open-workspace')
    if (fixture.encrypted) {
      const config = JSON.parse(await readFile(join(clientRoot, 'product.config.json'), 'utf8'))
      const roomTtlMs = systemIme || fixture.official || fixture.keyboardDiagnostics || fixture.admissionReview || fixture.panelTargetPackage !== undefined || fixture.nativeWssTls !== undefined ? 540000 : 300000
      cipher = await createWorkspaceCipherFixture(ctx, config.relay, shellIndex, { roomTtlMs,
        ...(fixture.packagedDesktopRelay === undefined ? {} : { packagedDesktopRelay: fixture.packagedDesktopRelay }),
        ...(fixture.archiveManagerReview ? { packagedWorkspaceAccess: true } : {}),
        ...(fixture.nativeWssTls === undefined ? {} : { nativeWssTls: fixture.nativeWssTls }),
        ...(fixture.standaloneWss === undefined ? {} : { standaloneWss: { ...fixture.standaloneWss,
          ...(fixture.devflowConflictReview || delayedAdmission || systemIme ? { roomTtlMs } : {}) } }),
        ...(fixture.admissionReview === undefined && fixture.hostChunkBytes === undefined ? {} : { maxChunkBytes: fixture.hostChunkBytes ?? 524288 }),
        ...(diskAdmission ? { persistedCatalogRows: 313 } : fixture.admissionReview === 'padded' ? { catalogRows: 313 } : {}),
        ...(delayedAdmission ? { dataOneWayDelayMs: 680 } : {}),
        ...(fieldAdmission ? { desktopRelayCaps: { maxPlaintextBytes: 1048576, maxFrameBytes: 2097152, maxQueuedBytes: 4194304 }, wireMaxRequestBytes: 1048576 } : {}),
        ...(fixture.rpcDiagnostics === true ? { rpcDiagnostics: true } : {}) })
    }
    peer = ctx.connection.createPeer({ principal: { kind: 'harmony-device', desktopId: id<'mobile-desktop'>('workspace-emulator-desktop'), deviceId: id<'mobile-device'>('workspace-emulator-phone'), epoch: 1 }, interactions: 'answer' })
    const principal = peer.principal, actions = ctx.typert.local.list().map<RemoteAccessAction>(row => `${row.namespace}/${row.method}`)
    actions.push('event:settings/document-updated', 'event:api-session/added', 'event:api-session/status')
    const bindings: RemoteAccessBinding[] = [{ role: { name: 'emulator-global', resource: 'global', actions }, resource: { kind: 'global' } },
      { role: { name: 'emulator-session', resource: 'session', actions }, resource: { kind: 'session', id: sessionId } }]
    if (cipher === undefined) stopPolicy = ctx.remoteAccess.registerPolicy('harmony-device', { bindings: candidate => candidate === principal && !lifetime.signal.aborted ? bindings : [] })
    const shell = await WorkspaceShell.open(shellIndex, { maxFiles: 2000, maxFileBytes: 16 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 })
    const wireRequests = new WeakMap<WorkspaceWireHost, Set<string>>()
    const newWire = () => {
      const candidate = new WorkspaceWireHost(new WorkspaceChannel(ctx, { peer: peer!, signal: lifetime.signal, assertCurrent() { lifetime.signal.throwIfAborted() } },
      { origin: 'https://workspace.dsh.invalid', maxRequestBytes: 1024 * 1024, maxResponseBytes: 16 * 1024 * 1024 }, shell),
      { maxChunkBytes: 65536, maxBufferedBytes: 32 * 1024 * 1024, maxBodyBytes: 16 * 1024 * 1024, maxBodies: 64, maxStreams: 32, maxRequestBytes: 2 * 1024 * 1024 })
      wireRequests.set(candidate, new Set()); return candidate
    }
    wire = newWire()
    server.on('request', (request, response) => {
      const controller = new AbortController(), signal = AbortSignal.any([controller.signal, lifetime.signal])
      void (async () => {
        if (request.url === '/guest-network-probe') guestProbeRequests++
        if (request.method !== 'POST' || !['/native', '/cipher', '/cipher-bootstrap'].includes(request.url ?? '') || request.headers['x-workspace-fixture'] !== token) { response.writeHead(403).end(); return }
        if (cipher?.wss !== undefined && request.url === '/cipher') { response.writeHead(403).end(); return }
        let raw = ''; for await (const bytes of request) { raw += bytes; if (Buffer.byteLength(raw) > 3 * 1024 * 1024) throw new Error('fixture input too large') }
        if (cipher !== undefined) {
          if (request.url === '/cipher-bootstrap') { response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...await cipher.bootstrap(), sessionId })); return }
          if (request.url === '/cipher') { response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(cipher.exchange(JSON.parse(raw)))); return }
          response.writeHead(403).end(); return
        }
        if (request.url !== '/native') { response.writeHead(403).end(); return }
        const input = inputSchema.parse(JSON.parse(raw))
        const send = (value: object) => { response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(value)) }
        const remove = () => { const previous = replies.get(input.id); if (previous?.value !== undefined) replyBytes -= Buffer.byteLength(previous.value); replies.delete(input.id); pending.delete(input.id) }
        if (input.operation === 'cancel') { pending.get(input.id)?.abort(); remove(); send({ state: 'ready', value: 'null' }); return }
        if (input.operation === 'poll') { const reply = replies.get(input.id); if (reply === undefined) { send({ state: 'error', value: 'fixture response unavailable' }); return }; send(reply); if (reply.state !== 'pending') remove(); return }
        if (pending.has(input.id) || pending.size >= 128) throw new Error('fixture capacity')
        await appendFile(join(world, 'received.jsonl'), JSON.stringify(input.operation === 'request' ? { operation: input.operation, id: input.id, candidate: JSON.parse(input.raw) } : { operation: input.operation, id: input.id }) + '\n')
        pending.set(input.id, controller)
        replies.set(input.id, { state: 'pending' })
        let wireOwner: WorkspaceWireHost | undefined
        const work = (async () => {
          let value: unknown
          if (input.operation === 'meta') value = { sessionId, origin: 'https://workspace.dsh.invalid', generation: 1 }
          else {
            if (input.operation === 'prepare' && wire!.closed) wire = newWire()
            const current = wire!
            wireOwner = current
            const owners = wireRequests.get(current)!; owners.add(input.id)
            if (input.operation === 'prepare') value = await prepareWorkspace({ request: candidate => current.request(candidate, signal), release: candidate => current.request(candidate, signal), decode: bytes => Uint8Array.from(Buffer.from(bytes, 'base64url')) }, { maxBytes: 16 * 1024 * 1024, maxChunkBytes: 65536 })
            else if (input.operation === 'request') {
              const candidate = workspaceRequestSchema.parse(JSON.parse(input.raw)); operations.push(candidate)
              if (candidate.operation === 'close') {
                for (const owned of owners) if (owned !== input.id) {
                  pending.get(owned)?.abort()
                  const previous = replies.get(owned); if (previous?.value !== undefined) replyBytes -= Buffer.byteLength(previous.value)
                  replies.delete(owned); pending.delete(owned)
                }
                await current.close(); value = null
              } else value = await current.request(candidate, signal)
              await appendFile(join(world, 'carrier.jsonl'), JSON.stringify({ input: candidate, result: value }) + '\n')
            }
            else {
              const client = new WorkspaceClient({ request: (candidate, abort) => current.request(candidate, abort), encode: bytes => Buffer.from(bytes).toString('base64url'), decode: bytes => Uint8Array.from(Buffer.from(bytes, 'base64url')) },
                { origin: 'https://workspace.dsh.invalid', maxRequestBytes: 1024 * 1024, maxResponseBytes: input.maxBytes, maxChunkBytes: input.maxChunkBytes })
              try { const result = await client.fetch(new Request(input.url, { signal })); value = { status: result.status, headers: [...result.headers], body: Buffer.from(await result.arrayBuffer()).toString('base64url') }; operations.push({ operation: 'resource', url: input.url, status: result.status }) }
              finally { await client.close() }
            }
          }
          signal.throwIfAborted()
          const serialized = JSON.stringify(value), bytes = Buffer.byteLength(serialized)
          if (bytes > 64 * 1024 * 1024 - replyBytes) throw new Error('fixture reply capacity')
          if (pending.get(input.id) === controller) { replies.set(input.id, { state: 'ready', value: serialized }); replyBytes += bytes }
        })().catch((error: unknown) => {
          if (!signal.aborted && pending.get(input.id) === controller) { const value = String(error); errors.push(value); replyBytes += Buffer.byteLength(value); replies.set(input.id, { state: 'error', value }) }
        })
        tasks.add(work); void work.finally(() => { tasks.delete(work); if (wireOwner !== undefined) wireRequests.get(wireOwner)?.delete(input.id) }); send({ state: 'pending' })
      })().catch((error: unknown) => { if (!signal.aborted) errors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end() })
    })
    await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
    const address = server.address(); assert.ok(address && typeof address !== 'string')
    const wss = cipher?.wss
    if (wss !== undefined) {
      const bypass = await fetch('http://127.0.0.1:' + address.port + '/cipher', { method: 'POST', body: '{}',
        headers: { 'x-workspace-fixture': token }, signal: AbortSignal.timeout(5000) })
      assert.equal(bypass.status, 403, 'An authorized fixture token cannot use the old HTTP frame carrier')
    }
    if (diskAdmission) {
      const endpoint = 'http://127.0.0.1:' + address.port
      const check = async (path: string, key: string) => (await fetch(endpoint + path, { method: 'POST', headers: { 'x-workspace-fixture': key }, body: '{}', signal: AbortSignal.timeout(5000) })).status
      const [plaintextBypassStatus, wrongFixtureTokenStatus] = await Promise.all([check('/native', token), check('/cipher', '0'.repeat(64))])
      assert.equal(plaintextBypassStatus, 403); assert.equal(wrongFixtureTokenStatus, 403)
      await writeFile(join(world, 'carrier-negative.json'), JSON.stringify({ plaintextBypassStatus, wrongFixtureTokenStatus }) + '\n', { flag: 'wx' })
    }
    await writeFile(join(clientRoot, 'evidence/workspace-emulator-active.json'), JSON.stringify({ world, hostPort: address.port, devicePort: 18082, sessionId, startedAt: new Date().toISOString(), app: 'local.dsh.mobile.workspacecheck', scenario: fixture.panelTargetPackage === undefined ? workflowRun ? 'devflow' : 'rich' : 'plugin-target', panelTargetPackage: fixture.panelTargetPackage, official: fixture.official === true, encryptedCarrier: cipher !== undefined, admissionReview: fixture.admissionReview, rpcDiagnostics: fixture.rpcDiagnostics,
      ...(wss === undefined ? {} : { nativeWss: { hostPort: wss.hostPort, devicePort: wss.devicePort } }), keyboardAttachDiagnostics: fixture.keyboardAttachDiagnostics,
      keyboardPlainFirst: fixture.keyboardPlainFirst, devflowConflictReview: fixture.devflowConflictReview, brickReview: fixture.brickReview,
      archiveManagerReview: fixture.archiveManagerReview, statusFormat: 'immutable-sequence' }, null, 2) + '\n')
    const deadline = Date.now() + 20 * 60 * 1000
    const live = new WorkspaceLivePublisher(world)
    const settingsVersion = z.object({ revision: z.number(), draft: z.object({ mode: z.enum(['direct', 'auto']).optional() }) })
    const ownerSettings = (method: string, request: object) => ctx.typertGateway.invoke({ namespace: 'devflowToolbox', method,
      args: { request }, peer: ctx.connection.browserPeer, signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(10000)]) })
    const global = { scope: 'global' }
    let desktopSaved: z.infer<typeof settingsVersion> | undefined, desktopRevisionPreserved = false
    const brickName = 'dsh-theme-brick'
    const hasBrickClient = () => ctx.clientModules.graph().entries.some(row => row.id === brickName)
    const brickChanges: Array<{ enabled: boolean, clientPresent: boolean }> = []
    if (fixture.brickReview) assert.ok(hasBrickClient(), 'The original Brick package must start with its client registered')
    let finish: object | undefined
    while (Date.now() < deadline) {
      await live.publish(replay.count(), errors)
      if (fixture.brickReview && brickChanges.length < 2) {
        const enabled = brickChanges.length === 1
        const marker = enabled ? 'brick-enable' : 'brick-disable'
        if ((await readdir(world)).includes(marker + '.request')) {
          assert.equal(hasBrickClient(), !enabled)
          const change = await ctx.pluginManager.setBundleEnabled(brickName, enabled)
          assert.equal(change.application, 'applied', JSON.stringify(change))
          assert.equal(change.changed, true)
          assert.equal((await ctx.pluginManager.listBundles()).find(bundle => bundle.name === brickName)?.enabled, enabled)
          const clientPresent = hasBrickClient()
          assert.equal(clientPresent, enabled)
          brickChanges.push({ enabled, clientPresent })
          await writeFile(join(world, marker + '.done'), '', { flag: 'wx' })
        }
      }
      if (fixture.devflowConflictReview && !desktopRevisionPreserved) {
        const files = await readdir(world)
        if (desktopSaved === undefined && files.includes('devflow-desktop-save.request')) {
          const before = settingsVersion.parse(await ownerSettings('settingsGet', global))
          desktopSaved = settingsVersion.parse(await ownerSettings('settingsSave',
            { ...global, expectedRevision: before.revision, draft: { mode: 'direct' }, actionId: randomUUID() }))
          assert.deepEqual(desktopSaved, { revision: before.revision + 1, draft: { mode: 'direct' } })
          await writeFile(join(world, 'devflow-desktop-save.done'), '', { flag: 'wx' })
        }
        if (desktopSaved !== undefined && files.includes('devflow-conflict-observed.request')) {
          assert.deepEqual(settingsVersion.parse(await ownerSettings('settingsGet', global)), desktopSaved)
          desktopRevisionPreserved = true
          await writeFile(join(world, 'devflow-conflict-observed.done'), '', { flag: 'wx' })
        }
      }
      try { finish = JSON.parse(await readFile(join(world, 'finish.json'), 'utf8')) as object; break }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
      await delay(500)
    }
    finish ??= { passed: false, timedOut: true }
    ctx.llm.assertZeroRealCalls(); await ctx.sessionPersistence.flush()
    const cipherObserved = cipher?.observed()
    let devflowConflict
    if (fixture.devflowConflictReview && 'passed' in finish && finish.passed === true) {
      assert.ok(desktopSaved && desktopRevisionPreserved)
      const latest = settingsVersion.parse(await ownerSettings('settingsGet', global))
      assert.deepEqual(latest, { revision: desktopSaved.revision + 2, draft: { mode: 'auto' } })
      devflowConflict = { desktopRevision: desktopSaved.revision, latestRevision: latest.revision, desktopRevisionPreserved }
    }
    const brickTheme = fixture.brickReview && 'passed' in finish && finish.passed === true
      ? z.object({ themeLayerRemovedOnDisable: z.boolean() }).parse(JSON.parse(await readFile(join(world, 'native-acceptance/brick-settings.json'), 'utf8')))
      : undefined
    const observed = { nativeArkWeb: fixture.panelTargetPackage === undefined || 'actualNativeIndex' in finish && finish.actualNativeIndex === true,
      carrier: cipherObserved === undefined ? 'test-only HTTP loopback' : cipherObserved.tls ? cipherObserved.carrier : 'native encrypted frames over HTTP loopback',
      realEncryptedCarrier: cipher !== undefined, cipher: cipherObserved, devflowConflict, ...(fixture.brickReview ? { brickChanges, brickTheme } : {}),
      replayResponses: replay.count(), models: 0, errors, operations, guestProbeRequests, finish }
    await writeFile(join(world, 'observed.json'), JSON.stringify(observed, null, 2) + '\n')
    assert.deepEqual(errors, [])
    assert.equal('passed' in finish && finish.passed, true, 'native acceptance must explicitly pass')
    if (wss !== undefined) {
      z.object({ checks: z.object({ nativeWssAuthenticated: z.literal(true) }) }).parse(finish)
      assert.deepEqual(wss.observed, { tlsProtocols: ['TLSv1.3', 'TLSv1.3'], controlRequests: 1, dataRequests: 1, rejected: 0, terminalFailures: 0 })
    }
    if (fixture.standaloneWss !== undefined) assert.deepEqual(cipherObserved?.standaloneWss, { tlsProtocols: Array(4).fill('TLSv1.3'), connections: 4 })
    if (fixture.standaloneWss !== undefined && delayedAdmission) {
      const delivery = cipherObserved?.standaloneDataDelay
      assert.ok(delivery && delivery.oneWayMs === 680 && delivery.connections === 1 && delivery.roomTtlMs === 540000)
      assert.ok(delivery.fromDesktop.chunks > 0 && delivery.toDesktop.chunks > 0)
      assert.equal(cipherObserved?.persistedCatalogRows, 313)
    }
    if (fixture.brickReview) {
      z.object({ checks: z.object({ brickDefaultTheme: z.literal(true), brickSwitchChangesToken: z.literal(true),
        brickPreferenceRestoredAfterReopen: z.literal(true), brickRestored: z.literal(true),
        brickSettingsRowRemovedLive: z.literal(true), brickThemeRemovedAfterReopen: z.literal(true),
        brickSettingsRowRestoredLive: z.literal(true) }) }).parse(finish)
      assert.deepEqual(brickChanges, [{ enabled: false, clientPresent: false }, { enabled: true, clientPresent: true }])
      assert.equal(replay.count(), 1)
      assert.deepEqual(await ctx.sessionController.readModelSelection({ sessionId }), selected)
      return observed
    }
    if (archived !== undefined) {
      z.object({ checks: z.object({ archiveManagerSettings: z.literal(true), compactArchiveTitle: z.literal(true),
        legacyFavoriteDenied: z.literal(true), archiveRestoredInWeb: z.literal(true), workspaceWebRemoved: z.literal(true) }) }).parse(finish)
      assert.deepEqual([...ctx.workspaceRegistry.archivedSessionIds], [])
      assert.equal(cipherObserved?.packagedWorkspaceAccess, true)
      assert.equal(replay.count(), 1)
      return { ...observed, archiveRestoreHostConfirmed: true }
    }
    if (fixture.keyboardAttachDiagnostics) {
      const proof = z.object({ fullKeyboardAcceptance: z.literal(false), checks: z.object({ keyboardAttachCompared: z.literal(true) }),
        keyboardAttachSamples: z.array(z.object({ kind: z.string(), pid: z.string().regex(/^\d+$/), focused: z.literal(true),
          keyboard: z.object({ height: z.number().int().nonnegative() }), inputMethodLines: z.array(z.string()) })) }).parse(finish)
      assert.deepEqual(proof.keyboardAttachSamples.map(row => row.kind), fixture.keyboardPlainFirst ? ['plain-web', 'devflow', 'native'] : ['devflow', 'plain-web', 'native'])
      assert.equal(new Set(proof.keyboardAttachSamples.map(row => row.pid)).size, 1)
      assert.equal(replay.count(), 1); assert.ok(panelApplication)
      assert.equal((await panelApplication.settingsGet({ scope: 'global' })).effective.mode, initialPanelMode)
      assert.deepEqual(await ctx.sessionController.readModelSelection({ sessionId }), selected)
      return observed
    }
    if (fixture.rpcDiagnostics === true) {
      assert.equal(replay.count(), 1)
      const faults = observed.cipher?.diagnosticFaults
      assert.deepEqual(faults?.map(row => [row.failure, row.cancelled]), [['host-rejected', false], ['timeout', true]])
      assert.ok(faults?.[1] && faults[1].elapsedMs >= 8000)
      return observed
    }
    if (fixture.panelTargetPackage !== undefined) {
      assert.equal(replay.count(), 0)
      assert.ok(panelApplication)
      assert.equal((await panelApplication.settingsGet({ scope: 'global' })).effective.mode, 'auto')
      assert.deepEqual(await ctx.sessionController.readModelSelection({ sessionId }), selected)
      const history = await ctx.sessionController.inspect(sessionId)
      assert.equal(history.events.filter(event => event.type === 'turn/start').length, 0)
      assert.equal(history.events.filter(event => event.type === 'user/message').length, 0)
      assert.equal((await ctx.sessionController.list({}, lifetime.signal)).items.length, 1)
      await writeFile(join(world, 'plugin-panel.json'), JSON.stringify({ packageName: fixture.panelTargetPackage, nativeIndex: true,
        initialGlobalMode: initialPanelMode, globalMode: 'auto', selectionUnchanged: true, turnStarts: 0, userMessages: 0, sessions: 1,
        replayBudget: 4, replayResponses: 0, realModels: 0 }) + '\n')
      return observed
    }
    replay.assertConsumed(); assert.equal(replay.count(), 4)
    if (fixture.official) {
      const service = ctx.get('cotTranslation') as { limits(signal: AbortSignal): Promise<{ preferences: { provider: string; targetLanguage: string } }> }
      const limits = await service.limits(lifetime.signal)
      assert.equal(limits.preferences.provider, 'google'); assert.equal(limits.preferences.targetLanguage, 'ja')
      await writeFile(join(world, 'official-settings.json'), JSON.stringify({ preferences: limits.preferences, standardPackage: true, noMobileAdaptation: true }) + '\n')
    }
    if (workflow !== undefined) {
      const application = ctx.get('devflowToolboxApplication') as {
        settingsGet(input: { scope: 'global' | 'session'; sessionId?: string }): Promise<{ effective: { mode: string; profiles: { label?: string; provider: string; model: string }[] } }>
        panelGet(input: { sessionId: string }): Promise<{ runs: { status: string; childId?: string; resolvedRoute: { provider: string; model: string; reasoningEffort?: string } }[] }>
      }
      const global = await application.settingsGet({ scope: 'global' })
      assert.equal(global.effective.mode, 'auto')
      const profileLabel = fixture.devflowImeLabel ?? 'Native delegate'
      assert.ok(global.effective.profiles.some(profile => profile.label === profileLabel && profile.provider === 'workspace-replay' && profile.model === 'worker'))
      if (fixture.devflowImeLabel !== undefined) {
        z.object({ checks: z.object({ devflowSystemImeEmojiEntered: z.literal(true), devflowSettingsRestoredAfterReopen: z.literal(true) }) }).parse(finish)
      }
      assert.equal((await application.settingsGet({ scope: 'session', sessionId })).effective.mode, 'auto')
      assert.deepEqual(await ctx.sessionController.readModelSelection({ sessionId }), selected)
      const child = workflow.calls.filter(call => call.sessionId !== sessionId)
      assert.equal(child.length, 1); assert.equal(child[0]!.model, 'worker'); assert.equal(child[0]!.reasoningEffort, 'high')
      const completed = (await application.panelGet({ sessionId })).runs.find(run => run.status === 'completed')
      assert.ok(completed?.childId)
      assert.equal(completed.resolvedRoute.provider, 'workspace-replay'); assert.equal(completed.resolvedRoute.model, 'worker'); assert.equal(completed.resolvedRoute.reasoningEffort, 'high')
      const persisted = await ctx.sessionController.inspect(id<'SessionId'>(completed.childId))
      assert.ok(persisted.events.some(event => event.type === 'request/header' && event.data.header.config.provider === 'workspace-replay' && event.data.header.config.model === 'worker' && event.data.header.config.reasoningEffort === 'high'))
      assert.equal(workflow.calls[0]!.tools?.some(tool => tool.name === 'devflow_delegate'), false)
      assert.ok(workflow.calls.filter(call => call.sessionId === sessionId).every(call => call.model === 'main'))
      await writeFile(join(world, 'workflow.json'), JSON.stringify({ standardPackage: true, globalMode: 'auto', sessionMode: 'auto', parentModel: 'main', childModel: 'worker', childEffort: 'high', readonlyCompleted: true, persistedRequestChecked: true, replayResponses: 4, realModels: 0,
        ...(fixture.devflowImeLabel === undefined ? {} : { profileLabel }) }, null, 2) + '\n')
    } else {
    assert.equal(guestProbeRequests, 0, 'generated guest must not reach the fixture HTTP listener')
    assert.ok(published?.type === 'assistant/message')
    const restored = await ctx.richInline.mount({ sessionId, messageId: published.data.message.id, blockId: authoredBlockId(published.data.message.id, code.key) })
    assert.equal(restored.snapshot.draft.fields.note, fixture.richImeDraft ?? 'native-final-draft')
    if (fixture.richImeDraft !== undefined) {
      z.object({ checks: z.object({ richSystemImeEmojiEntered: z.literal(true), exactDraftAndUnresolvedRestored: z.literal(true) }) }).parse(finish)
    }
    assert.ok(restored.snapshot.actions.some(action => action.actionId === 'workspace-action-completed' && action.state === 'completed'))
    assert.ok(restored.snapshot.actions.some(action => action.actionId === 'workspace-action-unresolved' && action.state === 'outcome_unknown'))
    await ctx.richInline.dispose({ sessionId, mountId: restored.mountId }); await ctx.sessionPersistence.flush()
    }
    return fixture.richImeDraft === undefined ? observed : { ...observed, richImeDraftReadBack: fixture.richImeDraft }
  } finally {
    stopDeviceLog?.()
    lifetime.abort(); for (const controller of pending.values()) controller.abort()
    server.closeAllConnections(); await new Promise<void>(accept => server.close(() => accept()))
    await cipher?.close()
    await wire?.close(); await Promise.all(tasks); replies.clear(); pending.clear(); stopPolicy?.(); peer?.dispose(); replay?.dispose()
  }
}
