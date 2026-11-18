/** Inspect the standard profile after CLI installation, without supplying replacement node_modules or executing a task. */
import assert from 'node:assert/strict'
import { readFile, readdir, writeFile, realpath } from 'node:fs/promises'
import { join, relative, isAbsolute, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { Context, FiberState } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/dsh-client-modules'
import type {} from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-api-gateway'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '../desktop-plugin/src/device-policy.ts'
import { installLlmReplay } from '@deepseek-ai/dsh-llm-replay'
import { id } from '../src/protocol.ts'
import { browserEntryUrl } from './browser-entry-url.ts'

/** Wait for actual profile services before examining its standard module registry. */
export const inject = ['appReady', 'appExit', 'llm', 'clientModules', 'profileContext', 'connection', 'webServer', 'sessionController', 'agents', 'sessionPersistence', 'workspaceRegistry', 'pluginManager', 'pluginPackages', 'typertGateway', 'remoteAccess']

async function checkArchiveDelivery(ctx: Context, world: string, raw: string) {
  const pins: Array<{ name: string; path: string; sha256: string }> = JSON.parse(raw)
  const parent = pathToFileURL(join(ctx.profileContext.dir, 'package.json')).href
  for (const pin of pins) {
    const selected = ctx.pluginPackages.packageOf(pin.name, parent)
    assert.ok(selected)
    assert.equal(await realpath(selected.dir), await realpath(join(ctx.profileContext.dir, 'node_modules', pin.name)))
    assert.equal(createHash('sha256').update(await readFile(join(selected.dir, pin.path))).digest('hex'), pin.sha256)
  }
  const controller = [...ctx.loader.entries()].find(row => row.options.id === 'workspace-controller')
  assert.equal(controller?.fiber?.state, 2 as FiberState.ACTIVE)
  const compact = pins.find(pin => pin.name === '@deepseek-ai/dsh-client-ui-settings-general')
  if (compact !== undefined) {
    const settings = [...ctx.loader.entries()].find(row => row.options.id === 'ui-settings-general')
    assert.equal(settings?.fiber?.state, 2 as FiberState.ACTIVE)
    const client = ctx.clientModules.clientPath(compact.name)
    assert.ok(client)
    assert.equal(await realpath(client), await realpath(join(ctx.profileContext.dir, 'node_modules', compact.name, compact.path)))
    assert.ok(ctx.clientModules.graph().entries.some(row => row.id === compact.name))
  }
  const visible = (await ctx.sessionController.create({ cwd: world })).sessionId
  const hidden = (await ctx.sessionController.create({ cwd: world })).sessionId
  const peer = ctx.connection.createPeer({ principal: { kind: 'harmony-device', desktopId: id<'mobile-desktop'>('archive-delivery'), deviceId: id<'mobile-device'>('archive-delivery-phone'), epoch: 1 }, interactions: 'none' })
  const stop = ctx.remoteAccess.registerPolicy('harmony-device', { bindings: principal => principal === peer.principal ? [{
    role: { name: 'archive-delivery-visible', resource: 'session', actions: ['workspace/archiveSession', 'workspace/unarchiveSession'] },
    resource: { kind: 'session', id: visible },
  }] : [] })
  const invoke = (method: string, caller = peer) => ctx.typertGateway.invoke({ namespace: 'workspace', method,
    args: { request: { sessionId: visible } }, peer: caller, signal: AbortSignal.timeout(10000) })
  try {
    await ctx.workspaceRegistry.archiveSession(hidden)
    assert.deepEqual(await invoke('archiveSession'), { archivedSessionIds: [visible] })
    assert.deepEqual(await invoke('unarchiveSession'), { archivedSessionIds: [] })
    assert.deepEqual(await invoke('archiveSession', ctx.connection.browserPeer), { archivedSessionIds: [hidden, visible] })
    assert.deepEqual(await invoke('unarchiveSession', ctx.connection.browserPeer), { archivedSessionIds: [hidden] })
    return { installedEntries: pins, workspaceControllerActive: true, scopedArchiveVerified: true, ownerSeesFullArchive: true,
      ...(compact === undefined ? {} : { compactSettingsClientActive: true }) }
  } finally {
    stop()
    await peer.dispose()
    await ctx.workspaceRegistry.unarchiveSession(visible)
    await ctx.workspaceRegistry.unarchiveSession(hidden)
  }
}
/** @param ctx - real services loaded by the copied CLI from the standard-installed private profile. */
export function apply(ctx: Context): void {
  const world = process.env.DSH_HARMONY_STANDARD_WORLD, runtime = process.env.DSH_HARMONY_STANDARD_RUNTIME
  if (!world || !runtime || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw new Error('private standard-install probe required')
  let operation = Promise.resolve()
  ctx.effect(() => ctx.appReady!.onReady(() => {
    operation = (async () => {
      const file = join(world, 'four-responses.json')
      await writeFile(file, JSON.stringify(Array.from({ length: 4 }, () => ({ kind: 'chunks', chunks: [{ type: 'finish', reason: { kind: 'stop' } }] }))) + '\n')
      const replay = installLlmReplay(ctx, { file, overrideFile: file, offline: true, providers: [{ id: 'standard-install-replay', models: [{ id: 'main', contextWindow: 100000, defaultMaxTokens: 1000 }] }] })
      let replayResponses = 0
      const stopCounting = ctx.on('llm-replay/request', () => { replayResponses++ })
      try {
        const name = '@deepseek-ai/dsh-experimental-harmony-mobile', packageDir = join(ctx.profileContext.dir, 'node_modules', name)
        const require = createRequire(join(packageDir, 'package.json')), peers = []
        const descriptor: { files: Array<{ path: string; sha256: string }> } = JSON.parse(await readFile(join(runtime, 'desktop-runtime.json'), 'utf8'))
        for (const name of ['@deepseek-ai/cordis', '@deepseek-ai/dsh-typert-registry']) {
          const path = await realpath(require.resolve(name)), metadata = await realpath(require.resolve(name + '/package.json'))
          const allowed = (directory: string) => { const local = relative(directory, path); return local && !local.startsWith('..') && !isAbsolute(local) }
          assert.ok(allowed(runtime) || allowed(join(ctx.profileContext.dir, 'node_modules')), 'SDK peer resolved outside runtime or standard installation: ' + name + ' -> ' + path)
          const local = relative(dirname(metadata), path).replaceAll('\\', '/'), expected = descriptor.files.find(file => file.path === 'node_modules/' + name + '/' + local); assert.ok(expected)
          const actual = createHash('sha256').update(await readFile(path)).digest('hex'); assert.equal(actual, expected.sha256)
          peers.push({ name, path, sha256: actual })
        }
        const clients = []
        const expectedClients: ReadonlyArray<readonly [string, string]> = [['@deepseek-ai/dsh-experimental-harmony-mobile', 'lib/client.js'], ['@deepseek-ai/dsh-experimental-rich-inline', 'lib/client.js'], ['dsh-devflow', 'lib/client.js']]
        for (const [name, entry] of expectedClients) {
          const client = ctx.clientModules.clientPath(name); assert.ok(client, name)
          assert.equal(await realpath(client), await realpath(join(ctx.profileContext.dir, 'node_modules', name, entry)))
          clients.push({ name, client })
        }
        const thirdPartyPin = process.env.DSH_HARMONY_STANDARD_THIRD_PARTY
        const graph = ctx.clientModules.graph(); assert.ok(graph.batches.length > 0)
        let thirdParty: { name: string; client: string; entryId: string; clientSha256: string; graphBatch: string;
          apiProbe?: { path: string; deviceStatus: number; ownerLoopbackStatus: number; ownerLoopbackBody: string } } | undefined
        if (thirdPartyPin !== undefined) {
          const expected: { name: string; entryId: string; clientEntry: string } = JSON.parse(thirdPartyPin)
          const client = ctx.clientModules.clientPath(expected.name); assert.ok(client, expected.name)
          assert.equal(await realpath(client), await realpath(join(ctx.profileContext.dir, 'node_modules', expected.name, expected.clientEntry)))
          const entry = [...ctx.loader.entries()].find(row => row.options.id === expected.entryId)
          assert.ok(entry?.fiber, 'The third-party host plugin entry must be loaded: ' + expected.entryId)
          // FiberState is a const enum, so the built package has no runtime export of it.
          assert.equal(entry.fiber.state, 2 as FiberState.ACTIVE, 'The third-party host plugin must be active: ' + expected.entryId)
          assert.ok(graph.entries.some(row => row.id === expected.name))
          const [batch] = graph.batches.filter(row => row.entries.includes(expected.name)); assert.ok(batch)
          thirdParty = { name: expected.name, client, entryId: expected.entryId, clientSha256: createHash('sha256').update(await readFile(client)).digest('hex'), graphBatch: batch.url }
          if (expected.name === '@michengai/dsh-skills-manager') {
            // Workspace forwards /api/ to the shared handler using the device Peer.
            const peer = ctx.connection.createPeer({ principal: { kind: 'harmony-device', desktopId: id<'mobile-desktop'>('standard-install'), deviceId: id<'mobile-device'>('standard-install-phone'), epoch: 1 }, interactions: 'none' })
            const apiPath = '/api/dsh-skills-manager/sidebar-entry'
            const apiResponse = await ctx.connection.createSharedFetchHandler('/api').fetch(new Request('https://workspace.dsh.invalid' + apiPath), peer)
            const origin = ctx.webServer.getOrigin()
            const minted = await fetch(browserEntryUrl(ctx, origin + '/'), { redirect: 'manual' })
            const cookie = minted.headers.getSetCookie().map(row => row.split(';')[0]).join('; ')
            const ownerResponse = await fetch(origin + apiPath, { headers: { cookie } })
            thirdParty.apiProbe = { path: apiPath, deviceStatus: apiResponse.status, ownerLoopbackStatus: ownerResponse.status, ownerLoopbackBody: (await ownerResponse.text()).slice(0, 200) }
          }
        }
        let servedBundleBytes = 0
        for (const batch of graph.batches) {
          const response = await ctx.clientModules.fetchBundle(new Request(new URL(batch.url, 'https://workspace.dsh.invalid')))
          assert.ok(response); assert.equal(response.status, 200); servedBundleBytes += (await response.arrayBuffer()).byteLength
        }
        assert.ok(servedBundleBytes > 0)
        const delivery = process.env.DSH_HARMONY_STANDARD_ARCHIVE_DELIVERY
        const archiveDelivery = delivery === undefined ? undefined : await checkArchiveDelivery(ctx, world, delivery)
        const browserCase = process.env.DSH_HARMONY_STANDARD_BROWSER
        assert.ok(browserCase === undefined || browserCase === 'rail' || browserCase === 'brick' || browserCase === 'brick-graph')
        let desktopBrowser: object | undefined, browserTarget: { title: string; sessionId: string } | undefined
        if (browserCase === 'rail') {
          assert.equal(thirdParty?.name, 'dsh-chat-index-rail')
          const workspace = await ctx.workspaceRegistry.create(world, 'Isolated rail workspace')
          const { sessionId } = await ctx.sessionController.create({ workspaceId: workspace.id })
          const title = 'Isolated rail Session'
          const selection = await ctx.sessionController.readModelSelection({ sessionId })
          assert.equal((await ctx.sessionController.compareAndSelectModel({ sessionId, expectedSelectionRevision: selection.selectionRevision,
            selection: { provider: 'standard-install-replay', model: 'main' } })).applied, true)
          await ctx.sessionController.prompt({ sessionId, requestId: id<'session-request-id'>('published-rail-fixture'), mode: 'queue',
            content: [{ type: 'text', text: 'Synthetic rail question' }] }, AbortSignal.timeout(20000))
          await ctx.agents.get(sessionId)!.whenIdle(); await ctx.sessionController.rename({ sessionId, title }); await ctx.sessionPersistence.flush()
          browserTarget = { title, sessionId }
        }
        if (browserCase !== undefined) {
          if (browserCase !== 'rail') assert.equal(thirdParty?.name, 'dsh-theme-brick')
          const origin = ctx.webServer.getOrigin()
          await writeFile(join(world, 'published-browser.json'), JSON.stringify({ origin, url: browserEntryUrl(ctx, origin + '/'), ...browserTarget }), { flag: 'wx' })
          await writeFile(join(world, 'published-browser.ready'), '', { flag: 'wx' })
          const deadline = Date.now() + 75000
          let brickChanges = 0
          while (Date.now() < deadline) {
            if (browserCase === 'brick-graph' && brickChanges < 2) {
              const enabled = brickChanges === 1, name = 'dsh-theme-brick'
              const marker = enabled ? 'brick-enable' : 'brick-disable'
              if ((await readdir(world)).includes(marker + '.request')) {
                const change = await ctx.pluginManager.setBundleEnabled(name, enabled)
                assert.equal(change.application, 'applied', JSON.stringify(change))
                assert.equal(change.changed, true)
                assert.equal(ctx.clientModules.graph().entries.some(row => row.id === name), enabled)
                await writeFile(join(world, marker + '.done'), '', { flag: 'wx' })
                brickChanges++
              }
            }
            try { desktopBrowser = JSON.parse(await readFile(join(world, 'published-browser-result.json'), 'utf8')); break }
            catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
            await delay(250)
          }
          assert.ok(desktopBrowser, 'Desktop browser did not report its terminal observation')
          if (browserCase === 'brick-graph') assert.equal(brickChanges, 2)
        }
        assert.equal(replayResponses, browserCase === 'rail' ? 1 : 0)
        ctx.llm.assertZeroRealCalls()
        await writeFile(join(world, 'probe.json'), JSON.stringify({ passed: true, profileDir: ctx.profileContext.dir, clients, peers, thirdParty,
          graphBatches: graph.batches.length, servedBundleBytes, desktopBrowser, archiveDelivery, standardInstalledLayout: true, replacementNodeModules: false, replayResponses, modelCalls: 0, realModels: 0 }, null, 2) + '\n')
      } finally { stopCounting(); replay.dispose() }
    })().then(() => { ctx.appExit!(0) }, async error => {
      await writeFile(join(world, 'probe.json'), JSON.stringify({ passed: false, error: String(error), stack: error instanceof Error ? error.stack : undefined }) + '\n'); ctx.appExit!(1)
    })
  }))
  ctx.effect(() => () => operation)
}
