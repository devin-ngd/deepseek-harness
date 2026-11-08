/** Same-package Rich client/Host, actual document-start bridge and canonical SDK over the serialized standard workspace. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, it, onTestFinished, onTestFailed } from 'vitest'
import type { RemoteAccessAction, RemoteAccessBinding } from '@deepseek-ai/dsh-api-remote-access'
import { launchWebScaffold } from '../../../apps/web/tests/scaffold.ts'
import { launchTestChromium, newEnglishPage } from '../../../apps/web/tests/support.ts'
import { WorkspaceChannel } from '../desktop-plugin/src/workspace-channel.ts'
import { WorkspaceWireHost } from '../desktop-plugin/src/workspace-wire.ts'
import { WorkspaceClient } from '../src/workspace-client.ts'
import { WorkspaceShell } from '../desktop-plugin/src/workspace-shell.ts'
import { workspaceRichPolicySchema } from '../src/workspace-rich-protocol.ts'
import { installWorkspaceDocument } from './workspace-document-fixture.ts'
import { workspaceRichFixture } from './workspace-rich-fixture.ts'
import { id } from '../src/protocol.ts'
import { authoredBlockId } from '../../../packages/experimental/rich-inline/src/shared/authored.ts'
import { installWorkspaceRichReplay } from './workspace-rich-replay.ts'
import { workspaceAdmissionFixture } from './workspace-admission-fixture.ts'
import { workspaceLinkFixture } from './workspace-link-fixture.ts'
import { workspaceRequestSchema, workspaceResponseSchema, type WorkspaceRequest } from '../src/workspace-protocol.ts'
import { readWorkspaceBytes } from '../src/workspace-bytes.ts'
import type {} from '../../../packages/experimental/rich-inline/src/host/index.ts'

it('saves drafts, distinguishes accepted actions from settlement and restores unresolved status through the standard rich package', async () => {
  const world = process.env.DSH_HARMONY_WORKSPACE_WORLD, richPackage = process.env.DSH_HARMONY_WORKSPACE_RICH
  const navigation = process.env.DSH_HARMONY_WORKSPACE_NAVIGATION
  const devflow = process.env.DSH_HARMONY_WORKSPACE_DEVFLOW
  const admissionBoot = process.env.DSH_HARMONY_WORKSPACE_ADMISSION === '1'
  const encryptedAdmission = process.env.DSH_HARMONY_WORKSPACE_ADMISSION_CIPHER === '1'
  assert.ok(world && richPackage && navigation)
  const root = resolve(import.meta.dirname, '../../..'), clientRoot = resolve(import.meta.dirname, '..')
  const scaffold = await launchWebScaffold({ firstUse: true, toolsMode: 'native', extraOverlayPath: join(world, 'workspace.overlay.yml'),
    profile: { hmr: false, packages: [{ dir: richPackage, enabled: true }, { dir: navigation, enabled: true }, ...(devflow === undefined ? [] : [{ dir: devflow, enabled: true }])] } })
  onTestFinished(() => scaffold.close())
  const ctx = scaffold.ctx
  assert.ok(ctx.get('richInline'), 'same-package rich Host must activate before browser verification')
  const browser = await launchTestChromium()
  onTestFinished(() => browser.close())
  const sessionId = (await ctx.sessionController.create({ cwd: world })).sessionId, session = ctx.sessions.get(sessionId)
  assert.ok(session)
  const code = { key: 'workspace-form', html: '<form id="draft"><label>Note<input name="note" value="initial"></label></form><button id="action">Send action</button><button id="status">Query status</button><output id="receipt"></output><output id="actions"></output><output id="scope"></output>', css: 'form{padding:16px}input{max-width:100%}',
    js: `window.rich.bindForm(document.getElementById('draft'))
      document.getElementById('scope').textContent = typeof window.__DSH_TRANSPORT__ + ':' + typeof window.dshDesktop
      window.rich.onState(state => document.getElementById('actions').textContent = JSON.stringify(state.actions))
      const receipt = document.getElementById('receipt')
      let count = 0
      document.getElementById('action').onclick = async () => {
        const actionId = ++count === 1 ? 'workspace-action-completed' : 'workspace-action-unresolved'
        try { receipt.textContent = JSON.stringify(await window.rich.submit(window.rich.getDraft(), { actionId })) }
        catch { receipt.textContent = 'Action receipt unavailable' }
      }
      document.getElementById('status').onclick = async () => {
        receipt.textContent = JSON.stringify(await window.rich.status('workspace-action-unresolved'))
      }`, fallbackText: 'Note form', stateSchemaVersion: 1 }
  const replay = await installWorkspaceRichReplay(ctx, world, code); onTestFinished(() => replay.dispose())
  const selection = await ctx.sessionController.readModelSelection({ sessionId })
  expect(await ctx.sessionController.compareAndSelectModel({ sessionId, expectedSelectionRevision: selection.selectionRevision, selection: { provider: 'workspace-rich-replay', model: 'main' } })).toMatchObject({ applied: true })
  await ctx.sessionController.prompt({ sessionId, requestId: id<'session-request-id'>('workspace-rich-initial'), mode: 'queue', content: [{ type: 'text', text: 'Return the fixed offline rich form.' }] }, new AbortController().signal)
  const agent = ctx.agents.get(sessionId); assert.ok(agent); await agent.whenIdle(); await ctx.sessionPersistence.flush()
  const unresolvedStopping = Promise.withResolvers<void>(), releaseUnresolved = Promise.withResolvers<void>()
  const completedClaimed = Promise.withResolvers<void>()
  let holdUnresolved = false
  const stopClaim = ctx.on('session/event', (current, event) => {
    if (current.id === sessionId && event.type === 'user/message' && event.data.source.kind === 'user'
      && event.data.content.some(part => part.type === 'text' && part.text.startsWith('Interactive input ')
        && part.text.includes('"actionId":"workspace-action-completed"'))) completedClaimed.resolve()
  })
  const stopBoundary = ctx.on('agent/turn-stopping', async ({ agent: stopping }) => {
    if (stopping !== agent || !holdUnresolved) return
    unresolvedStopping.resolve(); await releaseUnresolved.promise
  })
  onTestFinished(() => { releaseUnresolved.resolve(); stopBoundary(); stopClaim() })
  const published = session.snapshotEvents().find(event => event.type === 'assistant/message')
  assert.ok(published?.type === 'assistant/message'); const message = published.data.message
  expect(replay.count()).toBe(1)
  const signal = new AbortController()
  const basicWire = async () => {
    const peer = ctx.connection.createPeer({ principal: { kind: 'harmony-device', desktopId: id<'mobile-desktop'>('workspace-rich-desktop'), deviceId: id<'mobile-device'>('workspace-rich-phone'), epoch: 1 }, interactions: 'answer' })
    onTestFinished(() => peer.dispose())
    const actions = ctx.typert.local.list().map<RemoteAccessAction>(row => `${row.namespace}/${row.method}`)
    actions.push('event:settings/document-updated', 'event:api-session/added', 'event:api-session/status')
    const bindings: RemoteAccessBinding[] = [{ role: { name: 'rich-workspace-global', resource: 'global', actions }, resource: { kind: 'global' } },
      { role: { name: 'rich-workspace-session', resource: 'session', actions }, resource: { kind: 'session', id: sessionId } }]
    const stopPolicy = ctx.remoteAccess.registerPolicy('harmony-device', { bindings: principal => principal === peer.principal ? bindings : [] }); onTestFinished(stopPolicy)
    const shell = await WorkspaceShell.open(join(root, 'apps/web/dist/index.html'), { maxFiles: 2000, maxFileBytes: 16 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 })
    return () => {
      const channel = new WorkspaceChannel(ctx, { peer, signal: signal.signal, assertCurrent() {} }, { origin: 'https://workspace.dsh.invalid', maxRequestBytes: 1024 * 1024, maxResponseBytes: 16 * 1024 * 1024 }, shell)
      return new WorkspaceWireHost(channel, { maxChunkBytes: 65536, maxBufferedBytes: 32 * 1024 * 1024, maxBodyBytes: 16 * 1024 * 1024, maxBodies: 64, maxStreams: 32, maxRequestBytes: 2 * 1024 * 1024 })
    }
  }
  const admitted = admissionBoot ? await workspaceAdmissionFixture(ctx, join(root, 'apps/web/dist/index.html'), close => { onTestFinished(close) }, encryptedAdmission) : undefined
  const createWire = admitted === undefined ? await basicWire() : () => admitted.wire
  let wire = createWire()
  const origin = admitted?.origin ?? 'https://workspace.dsh.invalid'
  const delayed = admitted ? workspaceLinkFixture(wire, { rttMs: 1360, bytesPerSecond: 0, maxPending: 32 }) : undefined
  if (delayed) onTestFinished(() => delayed.close())
  const transport = { request: (value: unknown, signal: AbortSignal) => {
    if (delayed === undefined) return wire.request(value, signal)
    const request = workspaceRequestSchema.parse(value)
    return delayed.request(request, ['stream-next', 'stream-write', 'stream-end'].includes(request.operation) ? signal : AbortSignal.any([signal, AbortSignal.timeout(10000)]))
  } }
  let invokeRequests = 0, statusRequests = 0, lostReceipts = 0
  const documentTransport = { async request(input: WorkspaceRequest, abort: AbortSignal) {
    const path = input.operation === 'fetch' ? new URL(input.url).pathname : undefined
    if (path === '/api/richInline/status') statusRequests++
    if (path !== '/api/richInline/invoke') return transport.request(input, abort)
    const invokeNumber = ++invokeRequests
    const value = await transport.request(input, abort)
    if (invokeNumber !== 2) return value
    assert.ok(input.operation === 'fetch' && input.body !== undefined)
    expect(JSON.parse(Buffer.from(input.body, 'base64url').toString('utf8'))).toMatchObject({
      payload: { args: { request: { actionId: 'workspace-action-unresolved' } } },
    })
    const response = workspaceResponseSchema.parse(value)
    expect(response.status).toBe(200)
    const bytes = await readWorkspaceBytes(response.body, {
      request: request => transport.request(request, abort), release: request => transport.request(request, abort),
      decode: body => Uint8Array.from(Buffer.from(body, 'base64url')),
    }, { maxBytes: 1024 * 1024, maxChunkBytes: 65536 })
    expect(JSON.parse(new TextDecoder().decode(bytes))).toMatchObject({
      result: { ok: true, value: { accepted: true, actionId: 'workspace-action-unresolved', state: 'accepted' } },
    })
    lostReceipts++
    throw new Error('fixture lost action receipt after Host acceptance')
  } }
  const createClient = () => new WorkspaceClient({ request: (value, abort) => transport.request(value, abort), encode: value => Buffer.from(value).toString('base64url'), decode: value => Uint8Array.from(Buffer.from(value, 'base64url')) },
    { origin, maxRequestBytes: 1024 * 1024, maxResponseBytes: 16 * 1024 * 1024, maxChunkBytes: admitted ? 524288 : 65536 })
  let carrier = createClient()
  const configured = JSON.parse(await readFile(join(clientRoot, 'product.config.json'), 'utf8')) as { core: { workspace: { rich: object } } }
  const native = await workspaceRichFixture(browser, workspaceRichPolicySchema.parse(configured.core.workspace.rich))
  onTestFinished(() => native.close())
  const requests: string[] = [], failures: string[] = []
  const apiFailures: string[] = []
  const openDocument = async (resourceClient: WorkspaceClient) => {
    const page = await newEnglishPage(browser)
    if (admitted) page.on('console', message => { const text = message.text(); if (/workspace request failed|reading the Cordis inventory failed|syncing inspect providers failed/.test(text)) apiFailures.push(text) })
    // ArkWeb can report offline while the document carrier is reachable.
    await page.addInitScript(() => { Object.defineProperty(navigator, 'onLine', { value: false, configurable: true }) })
    page.on('pageerror', error => failures.push(error.message))
    const documentPort = await installWorkspaceDocument(page, documentTransport, sessionId, requests, native.port, undefined, admitted ? 524288 : 65536)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.origin !== origin) return route.abort()
      try {
        const response = await resourceClient.fetch(new Request(url, { method: request.method(), headers: request.headers() }))
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
      } catch (error) { failures.push(url.pathname + ': ' + String(error)); await route.abort() }
    })
    return { page, documentPort }
  }
  let { page, documentPort } = await openDocument(carrier)
  onTestFailed(async () => { await writeFile(join(world, 'failure.json'), JSON.stringify({ failures, native: native.failures, emitted: native.emitted, requests, signals: documentPort.signals,
    ...(admitted ? { catalogScans: admitted.scans(), link: delayed?.metrics(), apiFailures } : {}) }, null, 2)); if (!page.isClosed()) await page.screenshot({ path: join(world, 'failed.png') }) })
  try {
    if (admitted) {
      const start = performance.now(), response = await carrier.fetch(new Request(origin + '/'))
      const body = await response.arrayBuffer()
      await writeFile(join(world, 'root-probe.json'), JSON.stringify({ status: response.status, bytes: body.byteLength, elapsedMs: performance.now() - start, link: delayed?.metrics() }) + '\n')
      expect(response.status).toBe(200)
    }
    await page.goto(origin + '/', admitted ? { waitUntil: 'commit' } : {})
    await expect.poll(() => documentPort.signals.some(value => value.kind === 'workspace.ready'), { timeout: admitted ? 45000 : 15000 }).toBe(true)
    expect(await page.evaluate(() => navigator.onLine)).toBe(true)
    const button = page.locator('button[data-workspace-rich]')
    if (admitted) {
      await button.waitFor()
      expect(failures).toEqual([])
      expect(apiFailures).toEqual([])
      ctx.llm.assertZeroRealCalls()
      expect(replay.count()).toBe(1)
      await writeFile(join(world, 'observed.json'), JSON.stringify({ productionAdmission: true, syntheticVisibleRows: 313,
        persistedSyntheticSessions: 1, paddedDirectoryOnly: true, physicalPhone: false, catalogScans: admitted.scans(), link: delayed?.metrics(), bootReady: true, apiFailures,
        standardRichActivated: true, encryptedNativeRpc: admitted.encrypted, productionNetwork: false, huks: false, replayResponses: replay.count(), models: 0, arkWebExecuted: false }) + '\n')
      return
    }
    await button.waitFor(); expect(native.page()).toBeUndefined()
    await button.click()
    await expect.poll(() => native.page() !== undefined).toBe(true)
    const guest = native.page()!, frame = guest.frameLocator('#rich-frame')
    await frame.locator('input[name="note"]').waitFor()
    await expect.poll(() => frame.locator('#scope').textContent()).toBe('undefined:undefined')
    await frame.locator('input[name="note"]').fill('completed action values')
    await frame.locator('#action').click()
    await expect.poll(() => frame.locator('#receipt').textContent()).toContain('"state":"accepted"')
    await completedClaimed.promise
    await agent.whenIdle()
    await expect.poll(() => frame.locator('#actions').textContent(), { timeout: 15000 }).toContain('"state":"completed"')
    await expect.poll(() => replay.count(), { timeout: 15000 }).toBe(3)
    await frame.locator('input[name="note"]').fill('unresolved action values')
    holdUnresolved = true
    await frame.locator('#action').click()
    await expect.poll(() => frame.locator('#receipt').textContent()).toBe('Action receipt unavailable')
    expect(lostReceipts).toBe(1)
    await unresolvedStopping.promise
    expect(replay.count()).toBe(4)
    await expect.poll(() => frame.locator('#actions').textContent()).toContain('"state":"running"')
    expect(await frame.locator('#actions').textContent()).not.toContain('"state":"outcome_unknown"')
    const finalDraft = 'last key before back \u{1F642}'
    await frame.locator('input[name="note"]').fill(finalDraft)
    await native.back()
    expect(native.page()).toBeUndefined()

    documentPort.close()
    await page.close()
    await carrier.close()
    await wire.close()
    wire = createWire()
    carrier = createClient()
    const reopenedDocument = await openDocument(carrier)
    page = reopenedDocument.page
    documentPort = reopenedDocument.documentPort
    await page.goto(origin + '/')
    await expect.poll(() => documentPort.signals.some(value => value.kind === 'workspace.ready'), { timeout: 15000 }).toBe(true)
    await page.locator('button[data-workspace-rich]').click()
    await expect.poll(() => native.page() !== undefined).toBe(true)
    const reopened = native.page()!.frameLocator('#rich-frame')
    await reopened.locator('input[name="note"]').waitFor()
    await expect.poll(() => reopened.locator('input[name="note"]').inputValue()).toBe(finalDraft)
    await reopened.locator('#status').click()
    await expect.poll(() => reopened.locator('#receipt').textContent()).toContain('"state":"running"')
    expect(invokeRequests).toBe(2)
    holdUnresolved = false; releaseUnresolved.resolve()
    await agent.whenIdle()
    await expect.poll(() => reopened.locator('#actions').textContent(), { timeout: 15000 }).toContain('"state":"outcome_unknown"')
    await reopened.locator('#status').click()
    await expect.poll(() => reopened.locator('#receipt').textContent()).toContain('"state":"outcome_unknown"')
    expect({ invokeRequests, statusRequests, lostReceipts }).toEqual({ invokeRequests: 2, statusRequests: 2, lostReceipts: 1 })
    replay.assertConsumed(); expect(replay.count()).toBe(4)
    await native.back()
    expect(native.page()).toBeUndefined()
    const restored = await ctx.richInline.mount({ sessionId, messageId: message.id, blockId: authoredBlockId(message.id, code.key) })
    expect(restored.snapshot.draft.fields.note).toBe(finalDraft)
    expect(restored.snapshot.actions).toHaveLength(2)
    expect(restored.snapshot.actions).toContainEqual(expect.objectContaining({ actionId: 'workspace-action-completed', state: 'completed', terminal: true }))
    expect(restored.snapshot.actions).toContainEqual(expect.objectContaining({ actionId: 'workspace-action-unresolved', state: 'outcome_unknown', terminal: false }))
    await ctx.richInline.dispose({ sessionId, mountId: restored.mountId })
    expect(native.failures).toEqual([]); expect(native.network).toEqual([]); expect(failures).toEqual([])
    expect(requests.some(path => path.endsWith('/richInline/saveDraft'))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: join(world, 'rich-workspace-390.png') })
    await writeFile(join(world, 'observed.json'), JSON.stringify({ nativeOwnershipExecutedWithSdkSubstitute: true, appDocumentChromium: true, canonicalSdk: true,
      scopedHostDraft: true, draft: finalDraft, actionReceipt: 'accepted', settledAction: 'completed', restoredUnresolvedAction: 'outcome_unknown',
      lostReceipts, invokeRequests, statusRequests, replayResponses: replay.count(), models: 0, arkWebExecuted: false, ...documentPort.metrics() }) + '\n')
  } catch (error) {
    const history = await ctx.sessionController.inspect(sessionId)
    let ledger: object
    try { ledger = JSON.parse(await readFile(join(scaffold.workspaceCwd, '.dsh-storages/rich_inline.json'), 'utf8')) }
    catch (diagnosticError) { ledger = { unavailable: String(diagnosticError) } }
    const guest = native.page()
    await writeFile(join(world, 'rich-action-failure.json'), JSON.stringify({ replayCalls: replay.count(), nativeActive: native.page() !== undefined,
      nativeClosed: native.page()?.isClosed(), pageClosed: page.isClosed(), body: page.isClosed() ? '' : await page.locator('body').innerText(),
      ledger, guestBody: guest === undefined || guest.isClosed() ? null : await guest.frameLocator('#rich-frame').locator('body').innerText(),
      events: history.events.filter(event => event.type !== 'assistant/message').slice(-35) }, null, 2) + '\n')
    throw error
  } finally { holdUnresolved = false; releaseUnresolved.resolve(); documentPort.close(); await native.close(); await page.close(); await carrier.close(); await wire.close(); signal.abort() }
})

it('lets only the document carrier state drive the network status read by the unmodified Connection', async () => {
  const browser = await launchTestChromium(); onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser)
  // The first listener precedes the document script (it sees every platform event); the second one stands in for Connection's listeners, registered later.
  await page.addInitScript(() => {
    const rows: { phase: string; type: string; trusted: boolean }[] = []
    Object.assign(window, { __networkRows: rows })
    for (const type of ['online', 'offline']) window.addEventListener(type, event => { rows.push({ phase: 'platform', type, trusted: event.isTrusted }) }, { capture: true })
  })
  await installWorkspaceDocument(page, { request: () => Promise.reject(new Error('unused')) }, 'network-status-session', [])
  await page.addInitScript(() => {
    const rows = (window as typeof window & { __networkRows: { phase: string; type: string; trusted: boolean }[] }).__networkRows
    for (const type of ['online', 'offline']) window.addEventListener(type, event => { rows.push({ phase: 'connection', type, trusted: event.isTrusted }) })
  })
  await page.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>network status</title>' }))
  await page.goto('https://workspace.dsh.invalid/')
  const rows = () => page.evaluate(() => (window as typeof window & { __networkRows: { phase: string; type: string; trusted: boolean }[] }).__networkRows)
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true)
  await page.context().setOffline(true); await page.context().setOffline(false)
  await expect.poll(async () => (await rows()).some(row => row.phase === 'platform' && row.trusted)).toBe(true)
  expect(await page.evaluate(() => navigator.onLine)).toBe(true)
  expect((await rows()).filter(row => row.phase === 'connection')).toEqual([{ phase: 'connection', type: 'online', trusted: false }])
})

it('retires an isolated generated page when its unacknowledged message queue exceeds native policy', async () => {
  const browser = await launchTestChromium(); onTestFinished(() => browser.close())
  const configured = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8')) as { core: { workspace: { rich: object } } }
  const policy = workspaceRichPolicySchema.parse(configured.core.workspace.rich), native = await workspaceRichFixture(browser, policy)
  onTestFinished(() => native.close()); native.port.bind(async () => {})
  const lease = (JSON.parse(await native.port.request(JSON.stringify({ operation: 'acquire', request: { mountId: 'queue-mount', mountNonce: 'queue-nonce', html: '<p>Queue</p>', css: '',
    js: 'for(let i=0;i<' + (policy.maxQueuedPackets + 1) + ';i++)window.richGuest.send({type:"ready",index:i});' } }))) as { lease: string }).lease
  await native.port.request(JSON.stringify({ operation: 'open', lease }))
  await expect.poll(() => native.manager.view() === undefined).toBe(true)
  expect(native.emitted.filter(value => value.type === 'ready')).toHaveLength(policy.maxQueuedPackets)
  expect(native.emitted.at(-1)?.type).toBe('native.error'); expect(native.failures).toEqual([])
})
