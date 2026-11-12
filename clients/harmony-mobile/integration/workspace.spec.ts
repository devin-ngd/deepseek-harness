/** Standard plugin bundle in the real Web shell, reached through a non-owner device carrier. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import { launchWebScaffold } from '../../../apps/web/tests/scaffold.ts'
import { launchTestChromium, newEnglishPage } from '../../../apps/web/tests/support.ts'
import type { RemoteAccessAction, RemoteAccessBinding } from '@deepseek-ai/dsh-api-remote-access'
import type {} from '@deepseek-ai/dsh-experimental-client-ui-cot-translation'
import type {} from '@deepseek-ai/dsh-plugin-manager'
import { WorkspaceChannel } from '../desktop-plugin/src/workspace-channel.ts'
import { WorkspaceWireHost } from '../desktop-plugin/src/workspace-wire.ts'
import { WorkspaceClient } from '../src/workspace-client.ts'
import { WorkspaceShell } from '../desktop-plugin/src/workspace-shell.ts'
import { id } from '../src/protocol.ts'
import { WORKSPACE_ROUTE_HEADER, workspaceResponseSchema } from '../src/workspace-protocol.ts'
import { installWorkspaceDocument } from './workspace-document-fixture.ts'
import { installLlmReplay } from '@deepseek-ai/dsh-llm-replay'
import type {} from '../desktop-plugin/src/device-policy.ts'
import { installWorkspaceDevflowReplay } from './workspace-devflow-replay.ts'
import { workspaceLinkFixture } from './workspace-link-fixture.ts'
import { workspaceCacheFixture } from './workspace-cache-fixture.ts'

it('loads the unchanged optional translation bundle and invokes its own Remote with device access, then revokes it', async () => {
  const world = process.env.DSH_HARMONY_WORKSPACE_WORLD
  assert.ok(world)
  assert.equal(process.env.DSH_SNAPSHOT, 'replay')
  const root = resolve(import.meta.dirname, '../../..')
  const navigation = process.env.DSH_HARMONY_WORKSPACE_NAVIGATION
  const devflow = process.env.DSH_HARMONY_WORKSPACE_DEVFLOW
  const workflowRun = process.env.DSH_HARMONY_WORKSPACE_DEVFLOW_RUN === '1'
  const graphUpdates = process.env.DSH_HARMONY_WORKSPACE_GRAPH === '1'
  const pluginTarget = process.env.DSH_HARMONY_WORKSPACE_PANEL_LIST === '1' ? '' : process.env.DSH_HARMONY_WORKSPACE_PANEL
  assert.ok(navigation)
  const navigationId = '@deepseek-ai/dsh-experimental-harmony-mobile'
  const removalReceipt = join(world, 'package-removal.json')
  const packageManager = graphUpdates ? { command: process.execPath, args: [join(world, 'package-removal.mjs')], env: {} } : undefined
  if (packageManager !== undefined) await writeFile(packageManager.args[0]!, `
import assert from 'node:assert/strict'
import { readFile, realpath, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'

const name = ${JSON.stringify(navigationId)}
assert.deepEqual(process.argv.slice(2, 4), ['remove', name])
const profile = await realpath(process.cwd())
const local = relative(await realpath(${JSON.stringify(world)}), profile)
assert.ok(local && !local.startsWith('..') && !isAbsolute(local), profile)
const installed = join(profile, 'node_modules', name)
assert.equal(await realpath(installed), await realpath(${JSON.stringify(navigation)}))
const manifestPath = join(profile, 'package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
assert.ok(manifest.dependencies[name])
assert.ok(!manifest.dsh.profile.bundles.includes(name), 'The bundle must be deselected before package removal')
delete manifest.dependencies[name]
await unlink(installed)
await writeFile(manifestPath, JSON.stringify(manifest))
await writeFile(${JSON.stringify(removalReceipt)}, JSON.stringify({ name }), { flag: 'wx' })
`)
  const scaffold = await launchWebScaffold({
    firstUse: true,
    ...(workflowRun ? { toolsMode: 'native' as const } : {}),
    extraOverlayPath: join(world, 'workspace.overlay.yml'),
    profile: { hmr: graphUpdates, ...(packageManager === undefined ? {} : { packageManager }), packages: [{ dir: join(root, 'packages/experimental/cot-translation-bundle'), enabled: true }, { dir: navigation, enabled: true },
      ...(devflow === undefined ? [] : [{ dir: devflow, enabled: true }])] },
  })
  onTestFinished(() => scaffold.close())
  const ctx = scaffold.ctx
  const workflow = workflowRun ? await installWorkspaceDevflowReplay(ctx, world) : undefined
  if (workflow !== undefined) onTestFinished(() => workflow.dispose())
  if (devflow !== undefined && !workflowRun) {
    const file = join(world, 'responses.json')
    await writeFile(file, JSON.stringify(Array.from({ length: 4 }, () => ({ kind: 'chunks', chunks: [{ type: 'finish', reason: { kind: 'stop' } }] }))) + '\n')
    installLlmReplay(ctx, { file, overrideFile: file, offline: true, providers: [{ id: 'workspace-replay', models: [
      { id: 'main', contextWindow: 100000, defaultMaxTokens: 1000 },
      { id: 'worker', contextWindow: 100000, defaultMaxTokens: 1000, reasoningEfforts: ['low', 'high'] },
    ] }] })
  }
  const browser = await launchTestChromium()
  onTestFinished(() => browser.close())
  const controller = new AbortController()
  const peer = ctx.connection.createPeer({ principal: {
    kind: 'harmony-device', desktopId: id<'mobile-desktop'>('workspace-fixture'),
    deviceId: id<'mobile-device'>('workspace-phone'), epoch: 1,
  }, interactions: 'answer' })
  onTestFinished(() => peer.dispose())
  let active = true
  const actions = ctx.typert.local.list().map<RemoteAccessAction>(row => `${row.namespace}/${row.method}`)
  actions.push('event:settings/document-updated', 'event:api-session/added', 'event:api-session/status')
  const allowedSession = (await ctx.sessionController.create({ cwd: world })).sessionId
  const deniedSession = (await ctx.sessionController.create({ cwd: world })).sessionId
  const sessions = [allowedSession]
  const bindings: RemoteAccessBinding[] = [
    { role: { name: 'test-workspace-global', resource: 'global', actions }, resource: { kind: 'global' } },
    ...sessions.map(sessionId => ({
      role: { name: 'test-workspace-session', resource: 'session' as const, actions },
      resource: { kind: 'session' as const, id: sessionId },
    })),
  ]
  const stopPolicy = ctx.remoteAccess.registerPolicy('harmony-device', {
    bindings: principal => active && principal === peer.principal ? bindings : [],
  })
  onTestFinished(stopPolicy)
  const shell = await WorkspaceShell.open(join(root, 'apps/web/dist/index.html'), {
    maxFiles: 2000, maxFileBytes: 16 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024,
  })
  let scopeRefreshes = 0
  const channel = new WorkspaceChannel(ctx, {
    peer, signal: controller.signal,
    assertCurrent: () => { if (!active) throw new Error('fixture grant revoked') },
    refresh: async () => { scopeRefreshes += 1 },
  }, { origin: 'https://workspace.dsh.invalid', maxRequestBytes: 1024 * 1024, maxResponseBytes: 16 * 1024 * 1024 }, shell)
  const wire = new WorkspaceWireHost(channel, { maxChunkBytes: 64 * 1024, maxBufferedBytes: 32 * 1024 * 1024,
    maxBodyBytes: 16 * 1024 * 1024, maxBodies: 64, maxStreams: 32, maxRequestBytes: 2 * 1024 * 1024 })
  const linkCondition = process.env.DSH_HARMONY_WORKSPACE_LINK
  const nativeCache = process.env.DSH_HARMONY_WORKSPACE_CACHE === '1' ? await workspaceCacheFixture('https://workspace.dsh.invalid',
    JSON.parse(await readFile(resolve(import.meta.dirname, '../product.config.json'), 'utf8')).core.workspace.cache) : undefined
  const link = linkCondition === undefined ? undefined : workspaceLinkFixture(wire, { rttMs: linkCondition === 'slow' ? 80 : 0,
    bytesPerSecond: linkCondition === 'slow' ? 1048576 : 0, maxPending: 64 })
  const transfer = link ?? wire, traffic = () => link?.metrics()
  const timing = { navigationStart: 0, workspaceReadyMs: 0, settingsReadyMs: 0, saveMs: 0 }
  let readyTraffic: ReturnType<typeof traffic>, settingsTraffic: ReturnType<typeof traffic>
  let coldCache: ReturnType<NonNullable<typeof nativeCache>['metrics']> | undefined, warmCache: object | undefined
  const measuredPhase = async (phase: string) => { if (nativeCache !== undefined) await writeFile(join(world, 'measurement-progress.json'), JSON.stringify({ phase, traffic: traffic(), cache: nativeCache.metrics() }) + '\n') }
  let carrierBytes = 0, maxCarrierBytes = 0
  const client = new WorkspaceClient({
    request: async (value, signal) => {
      const result = JSON.stringify(await transfer.request(JSON.parse(JSON.stringify(value)), signal))
      carrierBytes += Buffer.byteLength(result); maxCarrierBytes = Math.max(maxCarrierBytes, Buffer.byteLength(result))
      return JSON.parse(result)
    },
    encode: bytes => Buffer.from(bytes).toString('base64url'),
    decode: value => Uint8Array.from(Buffer.from(value, 'base64url')),
  }, { origin: 'https://workspace.dsh.invalid', maxRequestBytes: 1024 * 1024,
    maxResponseBytes: 16 * 1024 * 1024, maxChunkBytes: 64 * 1024 })
  const requests: string[] = []
  const failures: string[] = []
  const detailImageUrl = (destination: string) => {
    const url = new URL('/api/plugin-manager/detail-file', 'https://workspace.dsh.invalid')
    url.search = new URLSearchParams({ bundle: '@deepseek-ai/dsh-experimental-cot-translation-bundle', document: 'docs/DETAIL.md', path: destination }).toString()
    return url
  }
  const preview = detailImageUrl('preview.svg')
  const page = await newEnglishPage(browser)
  const documentPort = await installWorkspaceDocument(page, transfer, allowedSession, requests, undefined, pluginTarget)
  try {
    expect((await client.fetch(new Request(preview))).status).toBe(404)
    const boot = channel.bootstrap()
    expect(await client.bootstrap(controller.signal)).toEqual(boot)
    const manifest = await client.manifest(controller.signal)
    expect(manifest.resources).toEqual(expect.arrayContaining([...shell.manifest.resources]))
    expect(manifest.resources.filter(row => row.path.startsWith('/plugins/'))).toHaveLength(ctx.clientModules.graph().batches.length)
    const cachedBatch = manifest.resources.find(row => row.path.startsWith('/plugins/')); assert.ok(cachedBatch)
    const refreshesBeforeResource = scopeRefreshes
    const batchBytes = new Uint8Array(await (await client.fetch(new Request(new URL(cachedBatch.path, 'https://workspace.dsh.invalid')))).arrayBuffer())
    expect(createHash('sha256').update(batchBytes).digest('hex')).toBe(cachedBatch.sha256); expect(batchBytes.byteLength).toBe(cachedBatch.bytes)
    expect(scopeRefreshes, 'resource bytes must not rescan the device-visible scope').toBe(refreshesBeforeResource)
    const graphSnapshot = ctx.clientModules.graph(), graphRead = vi.spyOn(ctx.clientModules, 'graph').mockReturnValueOnce(graphSnapshot).mockReturnValue({ ...graphSnapshot })
    try { await expect(channel.manifest(controller.signal)).rejects.toMatchObject({ code: 'workspace-shell-changed' }) } finally { graphRead.mockRestore() }
    expect(boot.find(row => row.kind === 'global' && row.name === '__DSH_REMOTE_ACCESS__')).toMatchObject({
      value: { owner: false },
    })
    expect(JSON.stringify(boot)).toContain('@deepseek-ai/dsh-experimental-client-ui-cot-translation')
    const loginUrl = new URL(scaffold.authenticatedUrl)
    loginUrl.hostname = '127.0.0.1'
    const login = await fetch(loginUrl, { redirect: 'manual', signal: controller.signal })
    expect(login.status).toBe(303)
    const browserCookie = login.headers.get('set-cookie')?.split(';', 1)[0]
    assert.ok(browserCookie, 'The isolated Host must mint its own browser credential')
    const renamePath = '/api/session/rename'
    let shadowCalls = 0
    onTestFinished(ctx.webServer.register({ kind: 'exact', path: renamePath, handler: (_request, response) => {
      shadowCalls += 1
      response.end('desktop-only route at the same path')
    } }))
    const shadow = await fetch(new URL(renamePath, loginUrl.origin), { method: 'POST', headers: { cookie: browserCookie }, signal: controller.signal })
    expect(shadow.status).toBe(200)
    expect(await shadow.text()).toBe('desktop-only route at the same path')
    const rename = async (sessionId: string, title: string) => {
      const response = await client.fetch(new Request('https://workspace.dsh.invalid' + renamePath, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: browserCookie },
        body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: 'session/rename', payload: { args: { request: { sessionId, title } } } }),
      }))
      return response.json()
    }
    const allowedLog = ctx.sessions.get(allowedSession), deniedLog = ctx.sessions.get(deniedSession)
    assert.ok(allowedLog && deniedLog)
    const deniedBefore = deniedLog.snapshotEvents()
    expect(await rename(deniedSession, 'must not change')).toMatchObject({ result: { ok: false, error: { code: 'remote-access/denied' } } })
    expect(scopeRefreshes, 'standard API dispatch still revalidates the granted scope').toBeGreaterThan(0)
    expect(await rename(allowedSession, 'Mobile workspace')).toMatchObject({ result: { ok: true } })
    expect(shadowCalls).toBe(1)
    expect(allowedLog.snapshotEvents().findLast(event => event.type === 'session/title')?.data).toMatchObject({ title: 'Mobile workspace' })
    expect(deniedLog.snapshotEvents()).toEqual(deniedBefore)
    await expect(channel.fetch(new Request('https://other.invalid/api/session/list'))).rejects.toMatchObject({ code: 'workspace-denied' })
    await expect(channel.fetch(new Request('https://workspace.dsh.invalid/api/session/rename', {
      method: 'POST', body: 'x'.repeat(1024 * 1024 + 1),
    }))).rejects.toMatchObject({ code: 'workspace-resource-limit' })
    const legacyPrefix = '/api/workspace-test/legacy'
    const legacyPath = legacyPrefix + '/status'
    const ownerPath = '/api/workspace-test/owner-only'
    let legacyCalls = 0, ownerCalls = 0
    onTestFinished(ctx.webServer.register({ kind: 'prefix', path: legacyPrefix, handler: (_request, response) => {
      legacyCalls += 1
      response.end('desktop route')
    } }))
    onTestFinished(ctx.connection.fetch.register({ path: ownerPath, methods: ['GET', 'HEAD'], requestBody: 'buffered', fetch: async () => {
      ownerCalls += 1
      return new Response('owner route')
    } }))
    const desktopResponse = await fetch(new URL(legacyPath, ctx.webServer.getOrigin()), { signal: controller.signal })
    expect(desktopResponse.status).toBe(200)
    expect(await desktopResponse.text()).toBe('desktop route')
    const ownerResponse = await fetch(new URL(ownerPath, loginUrl.origin), { headers: { cookie: browserCookie }, signal: controller.signal })
    expect(ownerResponse.status).toBe(200)
    expect(await ownerResponse.text()).toBe('owner route')
    for (const [path, status, reason] of [[legacyPath, 404, 'unregistered'], [ownerPath, 403, 'owner-only']] as const) {
      const response = await client.fetch(new Request('https://workspace.dsh.invalid' + path, { headers: { cookie: browserCookie } }))
      expect(response.status).toBe(status); expect(response.headers.get(WORKSPACE_ROUTE_HEADER)).toBe(reason)
      expect(await response.json()).toMatchObject({ error: { code: 'workspace-route-unavailable', reason } })
      const head = workspaceResponseSchema.parse(await wire.request({ operation: 'fetch', url: 'https://workspace.dsh.invalid' + path,
        method: 'HEAD', headers: [['cookie', browserCookie]] }, controller.signal))
      expect(head.status).toBe(status)
      expect(new Headers(head.headers).get(WORKSPACE_ROUTE_HEADER)).toBe(reason)
      expect(head.body.bytes).toBe(0)
      await wire.request({ operation: 'release', id: head.body.id }, controller.signal)
    }
    expect(() => new WorkspaceChannel(ctx, { peer: ctx.connection.browserPeer, signal: controller.signal, assertCurrent() {} },
      { origin: 'https://workspace.dsh.invalid', maxRequestBytes: 1024, maxResponseBytes: 1024 })).toThrow('workspace-denied')
    await page.setViewportSize({ width: 390, height: 844 })
    page.on('pageerror', error => failures.push(error.message))
    page.on('console', message => {
      if (message.type() !== 'error') return
      const text = message.text(), location = message.location().url
      failures.push(location ? `${text} (${location})` : text)
    })
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url())
      if (url.origin !== 'https://workspace.dsh.invalid') return route.abort()
      try {
        requests.push(url.pathname)
        const body = req.postDataBuffer()
        const request = new Request(url, {
          method: req.method(), headers: req.headers(), ...(body === null ? {} : { body: Uint8Array.from(body) }),
        })
        const load = () => client.fetch(request)
        const response = nativeCache === undefined ? await load() : await nativeCache.fetch(request, load)
        return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
      } catch { return route.fulfill({ status: 403, body: 'workspace request denied' }) }
    })
    link?.reset(); timing.navigationStart = performance.now()
    if (nativeCache !== undefined) { await client.bootstrap(controller.signal); nativeCache.select(await client.manifest(controller.signal)) }
    await page.goto('https://workspace.dsh.invalid/', { timeout: link === undefined ? 30000 : 90000 })
    if (pluginTarget === undefined) await page.locator('[data-conversation-session]').waitFor()
    await expect.poll(() => documentPort.signals.some(value => value.kind === 'workspace.ready')).toBe(true)
    await expect.poll(() => documentPort.signals.filter(value => value.kind === 'workspace.selection').at(-1)?.sessionId).toBe(allowedSession)
    timing.workspaceReadyMs = performance.now() - timing.navigationStart; readyTraffic = traffic()
    coldCache = nativeCache?.metrics()
    await measuredPhase('cold-ready')
    expect(await page.evaluate(() => (window as Window & { __DSH_TRANSPORT__?: { ownsHost?: boolean } }).__DSH_TRANSPORT__?.ownsHost)).not.toBe(true)
    const resetPath = '/plugins/workspace-fixture-reset'
    const fetchBundleWithoutResetFixture = ctx.clientModules.fetchBundle.bind(ctx.clientModules)
    const emptyResource = vi.spyOn(ctx.clientModules, 'fetchBundle').mockImplementation(request => new URL(request.url).pathname === resetPath
      ? Promise.resolve(new Response(null, { status: 205, headers: { 'x-fixture': 'reset' } })) : fetchBundleWithoutResetFixture(request))
    try {
      const reset = await page.evaluate(async path => {
        const response = await fetch(path)
        return { status: response.status, header: response.headers.get('x-fixture'), bodyIsNull: response.body === null }
      }, resetPath)
      expect(reset).toEqual({ status: 205, header: 'reset', bodyIsNull: true })
    } finally { emptyResource.mockRestore() }
    const routeFailures = await page.evaluate(async ({ legacyPath, ownerPath, header }) => {
      const notices: object[] = []
      const noticeType = 'harmony:workspace:route-unavailable'
      const report = (event: Event) => { if (event instanceof CustomEvent) notices.push(event.detail) }
      window.addEventListener(noticeType, report)
      try {
        const responses = []
        for (const path of [legacyPath, ownerPath]) {
          const response = await fetch(new Request(new URL(path + '?fixture=not-in-notice', location.origin)))
          responses.push({ status: response.status, reason: response.headers.get(header), body: await response.json() })
        }
        return { notices, responses }
      } finally {
        window.removeEventListener(noticeType, report)
      }
    }, { legacyPath, ownerPath, header: WORKSPACE_ROUTE_HEADER })
    expect(routeFailures.notices).toEqual([{ path: legacyPath, reason: 'unregistered' }, { path: ownerPath, reason: 'owner-only' }])
    expect(routeFailures.responses).toMatchObject([
      { status: 404, reason: 'unregistered', body: { error: { code: 'workspace-route-unavailable', reason: 'unregistered' } } },
      { status: 403, reason: 'owner-only', body: { error: { code: 'workspace-route-unavailable', reason: 'owner-only' } } },
    ])
    expect({ legacyCalls, ownerCalls }).toEqual({ legacyCalls: 1, ownerCalls: 1 })
    const panel = page.locator('[data-plugin-panel]')
    if (pluginTarget === undefined) {
    const sidebar = page.getByRole('button', { name: 'Open sidebar', exact: true })
    if (await sidebar.isVisible()) await sidebar.click()
    await page.getByRole('navigation', { name: 'Global panels' }).getByRole('button', { name: 'Plugins', exact: true }).click()
    const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true })
    if (await collapse.isVisible()) await collapse.click()
    }
    if (pluginTarget === undefined || pluginTarget === '') {
    await panel.waitFor()
    const more = panel.getByRole('button', { name: 'More', exact: true })
    if (await more.isVisible()) await more.click()
    await panel.locator('[data-plugin-package="@deepseek-ai/dsh-experimental-cot-translation-bundle"]').getByRole('button').first().click({ noWaitAfter: true })
    }
    await page.getByText('Expanded reasoning is sent to the selected service.', { exact: false }).waitFor()
    await expect.poll(() => requests.some(path => path.endsWith('/cotTranslation/limits'))).toBe(true)
    await expect.poll(() => panel.getByLabel('Target language', { exact: true }).isEnabled()).toBe(true)
    const previewImage = panel.locator('img[src*="/api/plugin-manager/detail-file"]').first()
    await previewImage.scrollIntoViewIfNeeded()
    await expect.poll(() => previewImage.evaluate(image => image instanceof HTMLImageElement && image.naturalWidth > 0)).toBe(true)
    const previewResponse = await client.fetch(new Request(preview))
    expect(previewResponse.status).toBe(200)
    expect(previewResponse.headers.get('content-type')).toBe('image/svg+xml')
    expect(previewResponse.headers.get('content-security-policy')).toContain('sandbox')
    expect(previewResponse.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await client.fetch(new Request(detailImageUrl('../icon.svg')))).status).toBe(404)
    expect((await client.fetch(new Request(detailImageUrl('../../outside.svg')))).status).toBe(404)
    timing.settingsReadyMs = performance.now() - timing.navigationStart; settingsTraffic = traffic()
    await panel.getByLabel('Target language', { exact: true }).fill('ja')
    const saving = performance.now()
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(async () => (await ctx.cotTranslation.limits(new AbortController().signal)).preferences.targetLanguage).toBe('ja')
    timing.saveMs = performance.now() - saving
    expect(failures).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: join(world, 'standard-plugin-390.png'), fullPage: true })
    const retiredBatches: string[] = []
    if (graphUpdates) {
      const packageName = '@deepseek-ai/dsh-experimental-cot-translation-bundle'
      const clientName = '@deepseek-ai/dsh-experimental-client-ui-cot-translation'
      const origin = 'https://workspace.dsh.invalid'
      const graphCache = await workspaceCacheFixture(origin, { maxEntries: 1, maxBytes: 32 * 1024 * 1024 })
      const remember = async (name: string) => {
        const before = await client.manifest(controller.signal)
        const batch = ctx.clientModules.graph().batches.find(row => row.entries.includes(name))
        assert.ok(batch, name)
        const url = new URL(batch.url, origin), path = url.pathname + url.search
        assert.ok(before.resources.some(row => row.path === path), path)
        graphCache.select(before)
        const request = new Request(url)
        expect((await graphCache.fetch(request, () => client.fetch(request))).status).toBe(200)
        expect((await graphCache.fetch(request, miss)).status).toBe(200)
        return { before, path, request }
      }
      const miss = () => Promise.resolve(new Response(null, { status: 410 }))
      const checkRetirement = async (stage: string, { before, path, request }: Awaited<ReturnType<typeof remember>>) => {
        const after = await client.manifest(controller.signal)
        expect(after.revision).not.toBe(before.revision)
        expect(after.resources.some(row => row.path === path), stage).toBe(false)
        graphCache.select(after)
        expect((await graphCache.fetch(request, miss)).status).toBe(410)
        retiredBatches.push(stage)
      }
      const enabled = await remember(clientName)
      expect(await ctx.pluginManager.setBundleEnabled(packageName, false)).toMatchObject({ application: 'applied' })
      await expect.poll(() => ctx.clientModules.graph().entries.some(row => row.id === clientName)).toBe(false)
      await expect.poll(() => panel.getByLabel('Target language', { exact: true }).count()).toBe(0)
      await checkRetirement('disabled', enabled)
      expect(await ctx.pluginManager.setBundleEnabled(packageName, true)).toMatchObject({ application: 'applied' })
      await expect.poll(() => ctx.clientModules.graph().entries.some(row => row.id === clientName)).toBe(true)
      await panel.getByLabel('Target language', { exact: true }).waitFor()
      expect(await panel.getByLabel('Target language', { exact: true }).inputValue()).toBe('ja')
      const reenabled = await remember(navigationId)
      const previous = ctx.clientModules.graph().entries.find(row => row.id === navigationId)?.rev
      assert.ok(previous)
      const bundle = join(navigation, 'lib/client.js')
      await writeFile(bundle, await readFile(bundle, 'utf8') + '\nglobalThis.__harmonyWorkspaceReloadFixture = "fresh-revision";\n')
      ctx.clientModules.rebuilt(navigationId)
      await expect.poll(() => ctx.clientModules.graph().entries.find(row => row.id === navigationId)?.rev).not.toBe(previous)
      await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { __harmonyWorkspaceReloadFixture?: string }).__harmonyWorkspaceReloadFixture)).toBe('fresh-revision')
      await checkRetirement('rebuilt', reenabled)
      const rebuilt = await remember(navigationId)
      const removed = await ctx.pluginManager.removeBundle(navigationId)
      expect(removed, removed.packageResult?.output).toMatchObject({ application: 'applied', packageResult: { exitCode: 0 } })
      expect(JSON.parse(await readFile(removalReceipt, 'utf8'))).toEqual({ name: navigationId })
      expect((await ctx.pluginManager.listBundles()).some(row => row.name === navigationId)).toBe(false)
      expect(ctx.clientModules.graph().entries.some(row => row.id === navigationId)).toBe(false)
      await checkRetirement('removed', rebuilt)
      expect(await panel.getByLabel('Target language', { exact: true }).inputValue()).toBe('ja')
      expect(documentPort.signals.some(value => value.kind === 'workspace.failed')).toBe(false)
      expect(failures).toEqual([])
    }
    let devflowObserved: object | undefined
    if (devflow !== undefined) {
      await panel.getByRole('button', { name: /^Back to / }).first().click()
      const backToPlugins = panel.getByRole('button', { name: 'Back to plugins', exact: true })
      if (await backToPlugins.isVisible()) await backToPlugins.click()
      await panel.locator('[data-plugin-package="dsh-devflow"]').getByRole('button').first().click()
      const editor = panel.locator('.devflow-v2-settings')
      await editor.getByRole('heading', { name: 'Multi-model toolbox', exact: true }).waitFor()
      const application = ctx.get('devflowToolboxApplication') as {
        settingsGet(input: { scope: 'global' | 'session'; sessionId?: string }): Promise<{ revision: number; effective: { mode: string; selectedPresetId: string; profiles: { id: string; label?: string; provider: string; model: string }[]; presets: { id: string; purposeBindings: Record<string, { kind: string; profileId?: string; effort?: string }> }[] }; draft: object }>
        settingsSave(input: { scope: 'session'; sessionId: string; expectedRevision: number; draft: object; actionId: string }): Promise<unknown>
        panelGet(input: { sessionId: string }): Promise<{ mode: string; runs: { status: string; purpose: string; access: string; childId?: string; resolvedRoute: { provider: string; model: string; reasoningEffort?: string } }[] }>
      }
      const before = await ctx.sessionController.readModelSelection({ sessionId: allowedSession })
      await application.settingsGet({ scope: 'global' })
      await editor.getByLabel('Orchestration', { exact: true }).selectOption('auto')
      await editor.getByRole('button', { name: 'Save', exact: true }).click()
      await expect.poll(async () => (await application.settingsGet({ scope: 'global' })).effective.mode).toBe('auto')
      await editor.getByText('Advanced', { exact: true }).click()
      await editor.getByRole('button', { name: 'Add profile', exact: true }).click()
      await editor.getByLabel('Name 1', { exact: true }).fill('Mobile delegate')
      await editor.getByLabel('Model', { exact: true }).selectOption(JSON.stringify(['workspace-replay', 'worker']))
      await editor.getByRole('button', { name: 'Save', exact: true }).click()
      await expect.poll(async () => (await application.settingsGet({ scope: 'global' })).effective.profiles).toContainEqual(expect.objectContaining({ label: 'Mobile delegate', provider: 'workspace-replay', model: 'worker' }))
      const global = await application.settingsGet({ scope: 'global' }), profile = global.effective.profiles.find(value => value.label === 'Mobile delegate')!
      await editor.getByLabel('Code', { exact: true }).selectOption('profile:' + profile.id)
      await editor.locator('.devflow-v2-purpose').first().getByLabel('Reasoning effort', { exact: true }).selectOption('effort:high')
      await editor.getByRole('button', { name: 'Save', exact: true }).click()
      await expect.poll(async () => {
        const value = (await application.settingsGet({ scope: 'global' })).effective
        return value.presets.find(item => item.id === value.selectedPresetId)?.purposeBindings.code
      }).toEqual({ kind: 'profile', profileId: profile.id, effort: 'high' })
      await editor.getByLabel('Scope', { exact: true }).selectOption('session')
      await editor.getByLabel('Target Session', { exact: true }).selectOption(allowedSession)
      await expect.poll(() => editor.getByLabel('Orchestration', { exact: true }).isEnabled()).toBe(true)
      await editor.getByLabel('Orchestration', { exact: true }).selectOption('direct')
      await editor.getByRole('button', { name: 'Save', exact: true }).click()
      await expect.poll(async () => (await application.settingsGet({ scope: 'session', sessionId: allowedSession })).effective.mode).toBe('direct')
      expect((await application.settingsGet({ scope: 'global' })).effective.mode).toBe('auto')
      expect(await ctx.sessionController.readModelSelection({ sessionId: allowedSession })).toEqual(before)
      await editor.getByLabel('Orchestration', { exact: true }).selectOption('auto')
      const current = await application.settingsGet({ scope: 'session', sessionId: allowedSession })
      await application.settingsSave({ scope: 'session', sessionId: allowedSession, expectedRevision: current.revision, draft: { mode: 'direct' }, actionId: randomUUID() })
      const saves = requests.filter(path => path === '/api/devflowToolbox/settingsSave').length
      await editor.getByRole('button', { name: 'Save', exact: true }).click()
      await editor.getByRole('alert').filter({ hasText: '设置已修改' }).waitFor()
      expect(await editor.getByLabel('Orchestration', { exact: true }).inputValue()).toBe('auto')
      expect((await application.settingsGet({ scope: 'session', sessionId: allowedSession })).effective.mode).toBe('direct')
      expect(requests.filter(path => path === '/api/devflowToolbox/settingsSave')).toHaveLength(saves + 1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: join(world, 'devflow-390.png'), fullPage: true })
      devflowObserved = { samePackage: true, global: 'auto', session: 'direct', modelProfile: 'workspace-replay/worker', codeEffort: 'high', parentModelUnchanged: true, conflictRetainsDraft: true, mutationRetries: 0 }
      if (workflow !== undefined) {
        const selection = await ctx.sessionController.readModelSelection({ sessionId: allowedSession })
        expect(await ctx.sessionController.compareAndSelectModel({ sessionId: allowedSession, expectedSelectionRevision: selection.selectionRevision,
          selection: { provider: 'workspace-replay', model: 'main' } })).toMatchObject({ applied: true })
        const prompt = async (name: string) => {
          const response = await client.fetch(new Request('https://workspace.dsh.invalid/api/session/prompt', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: 'session/prompt', payload: { args: { request: {
              sessionId: allowedSession, requestId: name, mode: 'queue', content: [{ type: 'text', text: 'Synthetic offline DevFlow acceptance: ' + name }],
            } } } }) }))
          expect(await response.json()).toMatchObject({ result: { ok: true, value: { accepted: true } } })
          const agent = ctx.agents.get(allowedSession); assert.ok(agent); await agent.whenIdle(); await ctx.sessionPersistence.flush()
        }
        await prompt('workspace-direct')
        expect(workflow.calls).toHaveLength(1)
        expect(workflow.calls[0]?.tools?.some(tool => tool.name === 'devflow_delegate')).toBe(false)
        const direct = await application.settingsGet({ scope: 'session', sessionId: allowedSession })
        await application.settingsSave({ scope: 'session', sessionId: allowedSession, expectedRevision: direct.revision, draft: { mode: 'auto' }, actionId: randomUUID() })
        await prompt('workspace-auto')
        workflow.assertConsumed()
        expect(workflow.calls).toHaveLength(4)
        const children = workflow.calls.filter(call => call.sessionId !== allowedSession)
        expect(children).toHaveLength(1); expect(children[0]).toMatchObject({ provider: 'workspace-replay', model: 'worker', reasoningEffort: 'high' })
        expect(workflow.calls.filter(call => call.sessionId === allowedSession).every(call => call.model === 'main')).toBe(true)
        const runs = await application.panelGet({ sessionId: allowedSession })
        expect(runs.runs).toContainEqual(expect.objectContaining({ status: 'completed', purpose: 'code', access: 'readonly',
          resolvedRoute: expect.objectContaining({ provider: 'workspace-replay', model: 'worker', reasoningEffort: 'high' }) }))
        const childId = runs.runs.find(run => run.status === 'completed')?.childId; assert.ok(childId)
        const persisted = await ctx.sessionQuery.readSession(id<'SessionId'>(childId))
        expect(persisted.events.filter(event => event.type === 'request/header').map(event => event.data.header.config)).toContainEqual(expect.objectContaining({
          provider: 'workspace-replay', model: 'worker', reasoningEffort: 'high',
        }))
        expect(await ctx.sessionController.readModelSelection({ sessionId: allowedSession })).toMatchObject({ selected: { provider: 'workspace-replay', model: 'main' } })
        devflowObserved = { settings: devflowObserved, replayCalls: 4, realModels: 0, parentModel: 'main', childModel: 'worker', childEffort: 'high', readonlyDelegationCompleted: true }
      }
    }
    expect(failures).toEqual([])
    if (nativeCache !== undefined) {
      await measuredPhase('retiring-cold')
      await documentPort.retire(); await measuredPhase('draining-cold'); await link?.drain(); await measuredPhase('cold-retired')
      const readyCount = documentPort.signals.filter(row => row.kind === 'workspace.ready').length
      link?.reset(); const started = performance.now()
      await client.bootstrap(controller.signal); nativeCache.select(await client.manifest(controller.signal))
      await measuredPhase('warm-authorized')
      await page.reload({ timeout: 90000 }); await page.locator('[data-conversation-session]').waitFor()
      await expect.poll(() => documentPort.signals.filter(row => row.kind === 'workspace.ready').length).toBeGreaterThan(readyCount)
      warmCache = { workspaceReadyMs: performance.now() - started, traffic: traffic(), cache: nativeCache.metrics(), freshPreparation: true }
      expect(nativeCache.metrics().hits).toBeGreaterThan(coldCache!.hits)
      expect(nativeCache.metrics().savedBytes).toBeGreaterThan(0)
      expect(failures).toEqual([])
    }
    const graph = ctx.clientModules.graph()
    const bundle = new URL(graph.batches[0]!.url, 'https://workspace.dsh.invalid/').href
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const fetchBundle = ctx.clientModules.fetchBundle.bind(ctx.clientModules)
    const deferred = vi.spyOn(ctx.clientModules, 'fetchBundle').mockImplementationOnce(async request => {
      entered.resolve()
      await release.promise
      return fetchBundle(request)
    })
    const pending = client.fetch(new Request(bundle))
    await entered.promise
    active = false
    controller.abort()
    ctx.remoteAccess.invalidate(peer.principal)
    release.resolve()
    await expect(pending).rejects.toMatchObject({ code: 'workspace-closed' })
    deferred.mockRestore()
    expect(() => channel.bootstrap()).toThrow()
    await expect(channel.fetch(new Request(preview))).rejects.toMatchObject({ code: 'workspace-closed' })
    await expect(channel.fetch(new Request('https://workspace.dsh.invalid/api/session/list', { method: 'POST' }))).rejects.toThrow()
    await writeFile(join(world, 'observed.json'), JSON.stringify({ plugin: 'cot-translation-bundle', samePackage: true,
      principal: peer.principal.kind, owner: false, requests, revoked: true, realModels: 0, arkWeb: false,
      detailImage: { rendered: true, deniedBeforeDocument: true, deniedUnreferenced: true, deniedTraversal: true, deniedAfterRevocation: true },
      routeFailures: { ...routeFailures, deniedHandlerCalls: 0, settingsUsableAfterDenial: true },
      routeIsolation: { validFixtureOwnerCookie: true, desktopShadowCalls: shadowCalls, deviceShadowCalls: 0,
        scopedGatewayWrite: true, unauthorizedSessionUnchanged: true },
      document: { actualGeneratedScript: true, handshake: 'onPageEnd', signals: documentPort.signals, operations: documentPort.operations }, devflow: devflowObserved,
      graphUpdates, graphRetirement: graphUpdates ? { retiredBatches, nativeCacheSdkSubstitute: true, packageRemovalProcessSubstitute: true } : undefined,
      pluginTarget, measurement: link === undefined ? undefined : { condition: linkCondition, timing, readyTraffic, settingsTraffic,
        nativeCache: nativeCache === undefined ? undefined : { coldCache, warmCache, actualEts: true, sdkSubstitute: true, preparationIncluded: true },
        excluded: ['profile/browser startup', 'encryption and outer RPC envelopes', ...(nativeCache === undefined ? ['native cache'] : []), 'ArkWeb', 'physical phone'] }, carrier: { kind: 'serialized-pull', bytes: carrierBytes + documentPort.metrics().carrierBytes,
        maxMessageBytes: Math.max(maxCarrierBytes, documentPort.metrics().maxCarrierBytes) } }, null, 2) + '\n')
  } catch (error) {
    const details = page.getByText('Error details', { exact: true }).first()
    if (await details.isVisible()) await details.click()
    await page.screenshot({ path: join(world, 'failure.png'), fullPage: true })
    const navigation = await page.evaluate(() => (window as typeof window & { __workspaceFixtureNavigation?: object[] }).__workspaceFixtureNavigation)
    await writeFile(join(world, 'failure.json'), JSON.stringify({ failures, requests, body: await page.locator('body').innerText(), navigation }, null, 2) + '\n')
    throw error
  } finally {
    await client.close()
    await link?.close()
    await wire.close()
    documentPort.close()
  }
})
