/** Separate native-provider test process; Chrome receives decoded views and a narrow host-owned request binding. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { NetworkPhone } from '../.build/network-phone.js'
import { SemanticPhone } from '../.build/semantic-phone.js'
import { PhoneCore } from '../.build/phone-core.js'

test('decoded native provider and scoped Chrome form complete fixed real DSH replay', { timeout: 40000 }, async () => {
  const baseUrl = process.env.DSH_HARMONY_PHONE_URL, output = process.env.DSH_HARMONY_PHONE_REPORT, readyFile = process.env.DSH_HARMONY_CANCEL_READY
  if (!baseUrl || !output || !readyFile) throw new Error('Owned phase5 launcher required')
  const source = JSON.parse(await readFile('source.json', 'utf8')), require = createRequire(resolve(source.dshRoot, 'package.json'))
  const playwright = require(require.resolve('playwright', { paths: [resolve(source.dshRoot, 'node_modules/.pnpm')] }))
  const transport = new NetworkPhone({ enabled: true, mode: 'loopback-fixed-replay', baseUrl, maxFrameBytes: 1048576, maxReadChunkBytes: 1048576, requestTimeoutMs: 30000, maxInFlight: 8 }, fetch)
  const model = new SemanticPhone({ desktopId: 'phase5-desktop', deviceId: 'phase5-phone', sessionId: 'phase5-session' }, { maxBytes: 1048576, maxEvents: 256, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }, 256)
  let sequence = 0, abort, feed, feedError, browser
  const core = new PhoneCore(transport, model, { follow: { mode: 'once' }, grantEpoch: 1, ttlMs: 60000, clock: () => Date.now(), nextCommandId: () => 'phase5-phone-' + process.pid + '-' + ++sequence, maxMounts: 4, maxIntents: 64 })
  const assertions = [], views = [], errors = []
  const until = async check => { const deadline = Date.now() + 5000; while (!await check()) { if (feedError !== undefined && !abort?.signal.aborted) throw feedError; if (Date.now() > deadline) throw new Error('Phase5 fixture timed out'); await new Promise(resolve => setTimeout(resolve, 5)) } }
  const start = () => { abort = new AbortController(); feedError = undefined; feed = (async () => { try { for await (const view of core.follow(abort.signal)) views.push(view) } catch (error) { feedError = error } })() }
  const stop = async () => { abort?.abort(); await feed }
  try {
    start(); await until(() => model.view.connection === 'connected')
    const receipt = await core.submit('phase5-intent', 'Display fixed native mobile form and chart.')
    assert.deepEqual(await core.submit('phase5-intent', 'Display fixed native mobile form and chart.'), receipt)
    await until(() => model.view.messages.some(message => message.rich.length === 2))
    const reference = model.view.messages.flatMap(message => message.rich)[0]
    assert.equal(reference.sessionId, 'phase5-session'); assert.equal(model.view.desktopId, 'phase5-desktop')
    assert.ok(views.some(view => view.liveText.length > 0)); assertions.push('BFF events drive shared semantic transcript and live text; duplicate task joins original receipt')
    await stop(); assert.equal(model.view.connection, 'disconnected'); const retainedTask = model.view.task
    const before = model.resume; start(); await core.receipt('phase5-intent'); assert.equal(model.view.connection, 'connected')
    assert.equal(model.resume.instance, before.instance); assertions.push('foreground reconnect preserves domain history and owner without dispatching a new task')
    browser = await playwright.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, chromiumSandbox: true })
    const bundle = await readFile('.build/mobile-renderer.bundle.js', 'utf8')
    let finalAction
    for (const width of [360, 480]) {
      const page = await browser.newPage({ viewport: { width, height: 920 }, reducedMotion: 'reduce' })
      page.on('pageerror', error => errors.push(error.message))
      // Test-owned UI document only. BFF keeps rejecting browser Origin/GET; actual commands remain in the native Node provider.
      await page.route(baseUrl, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">' }))
      await page.goto(baseUrl)
      await page.setContent('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:12px;background:#121317;color:#eee;font:16px system-ui}h1{font-size:22px}iframe{width:100%;height:680px;border:1px solid #61687a;box-sizing:border-box;border-radius:12px}#connection,#task,#transcript{overflow-wrap:anywhere}button{min-height:44px}*{box-sizing:border-box}</style><h1>DSH 移动会话</h1><p id="owner"></p><p id="connection" role="status"></p><p id="task"></p><div id="transcript"></div><iframe id="rich" title="真实回放富块"></iframe></html>')
      await page.exposeFunction('__trustedRichRequest', (operation, payload) => core.request(operation, payload))
      await page.evaluate(view => { document.querySelector('#owner').textContent = '执行归属：' + view.desktopId; document.querySelector('#connection').textContent = '回放服务已连接'; document.querySelector('#task').textContent = view.task; document.querySelector('#transcript').textContent = view.messages.filter(message => message.role !== 'context').flatMap(message => message.parts.filter(part => part.kind === 'text').map(part => part.text)).join('\n') }, model.view)
      assert.ok(!(await page.locator('#transcript').textContent()).includes('Current runtime context'))
      assert.ok(!(await page.locator('#transcript').textContent()).includes('Interactive input {'))
      const mount = await core.mount(reference)
      await page.evaluate(mountId => { window.lastGuestSeq=0; window.addEventListener('message',event=>{if(event.source===document.querySelector('#rich').contentWindow&&event.data?.mountId===mountId&&Number.isSafeInteger(event.data.seq))window.lastGuestSeq=Math.max(window.lastGuestSeq,event.data.seq)}) }, mount.mountId)
      await page.addScriptTag({ type: 'module', content: bundle + '\nwindow.mobileRenderer=new BrowserRichRenderer(document.querySelector("#rich"),{request:(op,payload)=>window.__trustedRichRequest(op,payload)},{rendererVersion:MOBILE_RENDERER_VERSION,packetBytes:131072,maxPackets:256});' })
      await page.waitForFunction(() => window.mobileRenderer !== undefined)
      assert.equal(await page.evaluate(mount => window.mobileRenderer.open(mount), mount), true)
      const frame = page.frameLocator('#rich'); await frame.locator('input[name=title]').waitFor()
      if (width === 360) {
        await frame.locator('input[name=title]').fill('Final mobile input'); await frame.locator('input[name=count]').fill('7')
        await until(async () => { const snapshot = await core.request('rich.snapshot', { mountId: mount.mountId }); return snapshot.draft.fields.title === 'Final mobile input' && snapshot.draft.fields.count === '7' })
        assertions.push('guest keystrokes pass same scoped gate to real persisted draft CAS')
        await frame.getByRole('button', { name: '提交固定回放' }).click()
        await until(async () => (await core.request('rich.snapshot', { mountId: mount.mountId })).actions.some(action => action.actionId === 'phase3-action'))
        await until(async () => { finalAction = await core.request('rich.status', { mountId: mount.mountId, actionId: 'phase3-action' }); return finalAction?.terminal === true })
        assert.equal(finalAction.state, 'completed'); assert.deepEqual(finalAction.values, { title: 'Final mobile input', count: '7' })
        const snapshot = await core.request('rich.snapshot', { mountId: mount.mountId }); await page.evaluate(snapshot => window.mobileRenderer.update(snapshot), snapshot)
        await frame.getByText('completed', { exact: true }).waitFor()
        assertions.push('Chrome authored form → canonical guest SDK → PhoneCore → actual BFF rich action → completed snapshot')
      } else {
        await frame.locator('input[name=title]').evaluate(input => { if (input.value !== 'Final mobile input') throw new Error('draft not restored') })
        await frame.getByText('completed', { exact: true }).waitFor()
        assertions.push('480px fresh native mount restores draft and completed historical action without rerun')
      }
      await frame.locator('summary').click()
      const layout = await frame.locator('body').evaluate(body => ({ overflow: body.scrollWidth > document.documentElement.clientWidth, touch: [...body.querySelectorAll('input,button,summary')].every(element => element.getBoundingClientRect().height >= 44), chart: body.querySelector('[role=img]').getBoundingClientRect().width <= document.documentElement.clientWidth, codeScrollable: body.querySelector('pre').scrollWidth > body.querySelector('pre').clientWidth }))
      assert.deepEqual(layout, { overflow: false, touch: true, chart: true, codeScrollable: true }); assertions.push(`form/chart/long-code/touch layout ${width}px`)
      assert.equal(await frame.locator('body').evaluate(() => { try { void parent.__trustedRichRequest; return false } catch (error) { return error.name === 'SecurityError' } }), true)
      assert.equal(await frame.locator('body').evaluate(() => typeof window.dshDesktop), 'undefined')
      const nextSeq = await page.evaluate(() => window.lastGuestSeq + 1), priorTask = model.view.task
      await frame.locator('body').evaluate((body, envelope) => window.richGuest.send(envelope), { protocol: 'lumina-rich/1', mountId: mount.mountId, renderRevision: mount.snapshot.scope.renderRevision, seq: nextSeq, packetId: 'fake-approval', type: 'approval.decide', payload: { approved: true } })
      try { await page.waitForFunction(() => window.mobileRenderer.error === 'forbidden') }
      catch (error) {
        console.log('PHASE5_FORBIDDEN_DIAGNOSTIC', JSON.stringify(await page.evaluate(() => ({ error: window.mobileRenderer.error, lastGuestSeq: window.lastGuestSeq }))), 'width', width, 'sentSeq', nextSeq)
        throw error
      }
      assert.equal(model.view.task, priorTask)
      assertions.push(`correctly scoped arbitrary rich packet cannot forge native approval ${width}px`)
      assertions.push(`opaque guest cannot access parent provider, credentials or desktop bridge ${width}px`)
      await page.screenshot({ path: `evidence/phase5-browser-${width}.png`, fullPage: true })
      if (width === 480) {
        await page.evaluate(() => window.mobileRenderer.close())
        const fallback = await core.mount(reference)
        await page.evaluate(() => { window.mobileRenderer=new window.mobileRenderer.constructor(document.querySelector('#rich'),{request:(op,payload)=>window.__trustedRichRequest(op,payload)},{rendererVersion:'future-renderer/2',packetBytes:131072,maxPackets:256}) })
        assert.equal(await page.evaluate(mount => window.mobileRenderer.open(mount), fallback), false)
        await frame.getByText('固定移动表单，比较图 A3/B7，提交状态可查询。', { exact: true }).waitFor()
        assert.equal(await frame.locator('body').evaluate(() => typeof window.rich), 'undefined')
        assertions.push('renderer-version mismatch has readable static fallback and no guest script')
        for (const mismatch of ['protocol', 'hash']) {
          await page.evaluate(() => window.mobileRenderer.close())
          const incompatible = await core.mount(reference)
          if (mismatch === 'protocol') incompatible.snapshot.protocol = 'future-rich/2'
          else incompatible.snapshot.manifest.contentHash = '0'.repeat(64)
          await page.evaluate(() => { window.mobileRenderer=new window.mobileRenderer.constructor(document.querySelector('#rich'),{request:(op,payload)=>window.__trustedRichRequest(op,payload)},{rendererVersion:'mobile-rich-renderer/1',packetBytes:131072,maxPackets:256}) })
          assert.equal(await page.evaluate(mount => window.mobileRenderer.open(mount), incompatible), false)
          await frame.getByText('固定移动表单，比较图 A3/B7，提交状态可查询。', { exact: true }).waitFor()
          assert.equal(await frame.locator('body').evaluate(() => typeof window.rich), 'undefined')
          assertions.push(`${mismatch} mismatch shows safe readable fallback with no guest script`)
        }
      }
      await page.evaluate(() => window.mobileRenderer.close()); await page.close()
    }
    assert.deepEqual(errors, [])
    assert.deepEqual(await core.request('approval.list', { sessionId: model.owner.sessionId }), [])
    await core.submit('phase5-cancel', 'Hold fourth fixed replay until native cancellation.')
    await until(async () => { try { await access(readyFile); return true } catch (error) { if (error.code !== 'ENOENT') throw error; return false } })
    await stop(); assert.equal(model.view.connection, 'disconnected')
    const disconnectedRunning = model.view.task
    await core.cancel(); start(); await until(() => model.view.task === 'cancelled')
    assertions.push('disconnect retains desktop running task; native cancel yields durable cancelled turn after reconnect')
    await stop(); await browser.close(); browser = undefined
    await writeFile(output, JSON.stringify({ processId: process.pid, mode: 'loopback-fixed-replay', assertions, semanticViews: views.length, durableCursor: model.view.cursor,
      streamedTextViews: views.filter(view => view.liveText.length > 0).length, finalAction, receipt, disconnectedRunning, retainedTask, domainView: model.view,
      rendererExecuted: true, renderer: 'Chrome sandboxed iframe reference carrier via native-owned Node binding', arkWebQualified: false, nativeDeviceQualified: false }, null, 2) + '\n')
  } finally { await stop(); if (browser) await browser.close(); await core.close() }
})
