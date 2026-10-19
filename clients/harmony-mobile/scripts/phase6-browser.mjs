import { projectionTsconfig } from './projection-source.mjs'
/** Chrome-only mobile/desktop fixtures share PhoneCore, PhoneLibrary, MessageWindow and canonical rich SDK; no real task or image is accessed. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { MockDesktop } from '../.build/mock.js'
import { SemanticPhone } from '../.build/semantic-phone.js'
import { PhoneCore } from '../.build/phone-core.js'
import { PhoneLibrary } from '../.build/phone-library.js'
import { canonicalRichJson } from '../.build/upstream-domain.js'
import { TransportError } from '../.build/wire.js'
const source = JSON.parse(await readFile('source.json', 'utf8')), require = createRequire(resolve(source.dshRoot, 'package.json'))
const playwright = require(require.resolve('playwright', { paths: [resolve(source.dshRoot, 'node_modules/.pnpm')] })), esbuild = require(require.resolve('esbuild', { paths: [resolve(source.dshRoot, 'node_modules/.pnpm')] }))
await esbuild.build({ entryPoints: [resolve('src/native-runtime.ts')], outfile: resolve('.build/phase6-phone.bundle.js'), absWorkingDir: source.dshRoot, tsconfig: await projectionTsconfig(resolve('.'), source.dshRoot), bundle: true, format: 'esm', platform: 'browser', target: 'es2022' })
const phoneBundle = await readFile('.build/phase6-phone.bundle.js', 'utf8'), rendererBundle = await readFile('.build/mobile-renderer.bundle.js', 'utf8')
const baseManifest = {
  html: '<section class="rich-answer"><h2>共享富消息</h2><p>固定合成数据 · 手机与桌面同一内容</p><form><label>标题<input name="title"></label><label>数量<input name="count" type="number"></label><button type="submit">提交合成表单</button></form><output aria-live="polite">等待输入</output><div role="img" aria-label="动态图表" class="chart"><div class="bar" data-value="3">3</div></div><details><summary>代码</summary><pre><code>' + 'stable_long_code_'.repeat(34) + '</code></pre></details></section>',
  css: 'form,label{display:grid;gap:12px}.rich-answer{padding:16px}.rich-answer h2,.rich-answer p{width:100%;text-wrap:wrap;overflow-wrap:normal}output{display:block;margin:12px 0}.chart{margin:16px 0;min-height:44px}.bar{padding:10px;background:var(--rich-accent);color:var(--rich-accent-ink);min-width:44px}summary{min-height:44px}',
  js: 'rich.bindForm(document.querySelector("form"));rich.onState(s=>{const n=Number(s.values.count||3);const bar=document.querySelector(".bar");bar.dataset.value=String(n);bar.style.width=Math.min(100,Math.max(10,n*10))+"%";bar.textContent=String(n);document.querySelector("output").textContent=s.readOnly?"历史只读":s.actions.at(-1)?.state||"等待输入";for(const control of document.querySelectorAll("input,button"))control.disabled=s.readOnly;});',
  stateSchemaVersion: 1,
}
const publication = (previous, revision, suffix = '') => { const content = { ...baseManifest, html: baseManifest.html + suffix }; return { ...previous, ...content, renderRevision: revision, fallbackText: '共享合成表单和动态比较图；当前输入保留。', contentHash: createHash('sha256').update(canonicalRichJson(content)).digest('hex') } }
const assertions = [], comparisons = [], errors = []
let browser, page
try {
  browser = await playwright.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, chromiumSandbox: true })
  for (const width of [360, 480, 1080]) {
    const desktop = new MockDesktop('mock'), sessionId = desktop.sessions[0].sessionId, original = desktop.snapshotFor(sessionId)
    desktop.replaceFixturePublication(sessionId, publication(original.manifest, 2))
    const owner = { desktopId: desktop.desktopId, deviceId: 'phase6-chrome', sessionId }, limits = { maxSourceItems: 500, maxPageItems: 4, maxSnapshots: 8, maxSnapshotBytes: 1048576, snapshotTtlMs: 60000, maxHistoryEvents: 256, maxImageBytes: 4096, maxImageDimension: 512, maxImagePixels: 262144, maxImageHandles: 2, imageTtlMs: 60000, maxImageChunkBytes: 32, maxInFlight: 4 }
    const events = Array.from({ length: 100 }, (_, seq) => ({ type: 'user/message', seq, time: seq, surfaceOp: 'append', data: { id: 'message-' + seq, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '合成历史消息 ' + seq }] } }))
    events.push({ type: 'assistant/message', seq: 100, time: 100, surfaceOp: 'append', data: { turn: 1, step: 1, message: { id: 'demo-message', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'text', text: '```rich-inline\n{"blockId":"demo-form"}\n```' }, { type: 'image', attachment: { attachmentId: 'expired-synthetic-image', mediaType: 'image/png', bytes: 64, width: 24, height: 16 } }] }, stream: [] } })
    const model = new SemanticPhone(owner, { maxBytes: 1048576, maxEvents: 256, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }, 256)
    const snapshot = rows => ({ protocol: 'dsh-mobile-wire/1', mode: 'fixed-replay', ...owner, instance: 'phase6-chrome-generation', relayCursor: 0, kind: 'reset', payload: { type: 'snapshot', header: { id: sessionId, version: 4, createdAt: 0, isSeeded: false }, cursor: 100, records: rows.map(event => ({ type: 'event', event })), hasMore: rows[0].seq > 0, projections: { asOfSeq: 100, values: {} }, assistantStream: { revision: 0 } } })
    model.accept(snapshot(events.slice(81)))
    let sequence = 0
    const provider = {
      request: async command => {
        const payload = command.payload
        switch (command.operation) {
          case 'rich.mount': return desktop.mount(sessionId)
          case 'rich.snapshot': return desktop.snapshotFor(sessionId)
          case 'rich.saveDraft': return desktop.saveDraft(payload)
          case 'rich.invoke': { const receipt = desktop.invoke(payload); await new Promise(resolve => setTimeout(resolve, 50)); if (receipt.accepted && desktop.status(payload.mountId, payload.actionId)?.terminal !== true) desktop.completeAction(payload.mountId, payload.actionId); return receipt }
          case 'rich.status': return desktop.status(payload.mountId, payload.actionId)
          case 'rich.dispose': desktop.dispose(payload.mountId); return { disposed: true }
          case 'read.history': { const before = payload.beforeSeq, first = Math.max(0, before - payload.maxMessages); return { mobileRead: { protocol: 'dsh-mobile-read/1', sessionId, throughSeq: payload.throughSeq, beforeSeq: before, records: events.slice(first, before).map(event => ({ type: 'event', event })), hasMore: first > 0 } } }
          case 'image.open': throw new TransportError('read-expired')
          default: throw new TransportError('fixture-method-refused')
        }
      }, follow: async function* () { throw new Error('No automatic fixture dispatch or follow') }, close: async () => {},
    }
    const core = new PhoneCore(provider, model, { follow: { mode: 'once' }, clock: () => Date.now(), grantEpoch: 1, ttlMs: 60000, maxMounts: 4, maxIntents: 8, nextCommandId: () => 'chrome-' + ++sequence }), library = new PhoneLibrary(core, model, limits, () => Date.now(), 1, 60000)
    const reference = model.view.messages.flatMap(row => row.rich)[0]; let activeCore = core
    page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: 'reduce' }); page.on('pageerror', error => errors.push(error.message))
    await page.route('http://127.0.0.1:46000/fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' }))
    await page.goto('http://127.0.0.1:46000/fixture')
    await page.setContent('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:12px;background:#121317;color:#eee;font:16px system-ui}main{max-width:1000px;margin:auto}h1{font-size:22px}button{min-height:44px;font:inherit}#columns{display:grid;gap:16px}#transcript{height:230px;overflow:auto;border:1px solid #61687a;padding:8px;overflow-anchor:none}.message{min-height:44px;padding:8px;border-bottom:1px solid #40434d}iframe{width:100%;height:710px;border:1px solid #61687a;border-radius:12px}#image{min-height:80px;max-height:160px;display:grid;place-content:center;background:#24272e;border-radius:8px;margin-top:12px;overflow-wrap:anywhere}p{overflow-wrap:anywhere}@media(min-width:900px){#columns{grid-template-columns:1fr 1.4fr}}</style><main><h1>DSH 会话 · 合成验收</h1><p>执行归属：mock-desktop · 当前页为固定 fixture</p><div id="columns"><section><button id="history">读取更早消息</button><p id="history-state"></p><div id="transcript"></div><div id="image" role="img" aria-label="图片暂不可用">图片暂不可用 · 重新读取</div></section><section><iframe id="rich" title="共享富消息"></iframe></section></div><p id="notice">只在本测试内执行合成状态变更</p></main></html>')
    await page.exposeFunction('__phase6Request', (operation, payload) => activeCore.request(operation, payload))
    await page.addScriptTag({ type: 'module', content: phoneBundle + '\nwindow.viewport=new MessageWindow(20);window.nodes=new Map();window.showView=view=>{const result=window.viewport.update(view.messages.filter(row=>row.role!=="context"));const list=document.querySelector("#transcript");const children=result.rows.map(row=>{let node=window.nodes.get(row.id);if(!node){node=document.createElement("div");node.className="message";node.dataset.messageId=row.id;window.nodes.set(row.id,node)}node.textContent=row.parts.filter(part=>part.kind==="text").map(part=>part.text).join(" ")||"富消息与附件";return node});list.replaceChildren(...children);for(const key of window.nodes.keys())if(!children.some(node=>node.dataset.messageId===key))window.nodes.delete(key);if(result.anchor){const row=window.nodes.get(result.anchor.id);if(row)list.scrollTop=row.offsetTop-list.offsetTop+result.anchor.offset}document.querySelector("#history-state").textContent="当前保留 "+result.total+" 条，页面绘制 "+children.length+" 条";return result};' })
    await page.waitForFunction(() => window.viewport !== undefined); await page.evaluate(view => window.showView(view), model.view)
    await page.evaluate(() => { const list=document.querySelector('#transcript'),row=list.querySelector('[data-message-id="message-90"]');window.anchorNode=row;window.viewport.position('message-90',12,false);list.scrollTop=row.offsetTop-list.offsetTop+12 })
    await library.history(4); await page.evaluate(view => window.showView(view), model.view)
    assert.equal(await page.evaluate(() => window.nodes.get('message-90')===window.anchorNode), true)
    assert.ok(await page.evaluate(() => { const list=document.querySelector('#transcript'),row=window.nodes.get('message-90');return Math.abs(list.scrollTop-(row.offsetTop-list.offsetTop+12))<2 }))
    assert.ok(await page.locator('.message').count() <= 20); assertions.push(`bounded keyed history prepend preserves anchor ${width}px`)
    const image = await library.image(model.view.messages.at(-1), 'expired-synthetic-image'); assert.equal(image.state, 'unavailable')
    await page.evaluate(image => { const element=document.querySelector('#image');element.dataset.state=image.state;element.dataset.width=String(image.width);element.dataset.height=String(image.height);element.textContent='图片暂不可用 · '+image.width+' × '+image.height+' · 稍后读取' }, image)
    assert.ok(await page.locator('#image').evaluate(element => element.getBoundingClientRect().width <= innerWidth)); assertions.push(`expired image has bounded native placeholder ${width}px`)
    await page.addScriptTag({ type: 'module', content: rendererBundle + '\nwindow.renderer=new BrowserRichRenderer(document.querySelector("#rich"),{request:(op,payload)=>window.__phase6Request(op,payload)},{rendererVersion:MOBILE_RENDERER_VERSION,packetBytes:131072,maxPackets:256});' }); await page.waitForFunction(() => window.renderer !== undefined)
    let mount = await core.mount(reference); await page.evaluate(mount => window.renderer.open(mount), mount)
    const frame = page.frameLocator('#rich'); await frame.locator('input[name=title]').fill('焦点和草稿保留'); await frame.locator('input[name=count]').fill('8'); await frame.locator('input[name=title]').focus()
    const until = async check => { const deadline=Date.now()+5000; while(!await check()){if(Date.now()>deadline)throw new Error('Phase6 browser timeout');await new Promise(resolve=>setTimeout(resolve,10))} }
    await until(async () => (await core.request('rich.snapshot', { mountId: mount.mountId })).draft.fields.count === '8')
    desktop.updateFixtureValues(sessionId, { count: '9' }); const updated = await core.request('rich.snapshot', { mountId: mount.mountId }); assert.equal(await page.evaluate(value => window.renderer.update(value), updated), true)
    await frame.locator('.bar[data-value="9"]').waitFor(); assert.equal(await frame.locator('input[name=title]').evaluate(input => document.activeElement===input&&input.value==='焦点和草稿保留'), true)
    assertions.push(`data revision updates chart without losing focus or draft ${width}px`)
    await frame.getByRole('button', { name: '提交合成表单' }).dblclick(); await frame.getByText('completed', { exact: true }).waitFor(); assert.equal(desktop.admittedActions, 1)
    assertions.push(`doubleclick joins one admitted action ${width}px`)
    await page.evaluate(() => window.renderer.close()); mount = await core.mount(reference); await page.evaluate(mount => window.renderer.open(mount), mount)
    await frame.getByText('completed', { exact: true }).waitFor(); assert.equal(desktop.admittedActions, 1); assert.equal(await frame.locator('input[name=title]').inputValue(), '焦点和草稿保留')
    assertions.push(`history restores draft and terminal action without reexecution ${width}px`)
    await frame.locator('input[name=title]').fill('新 revision 前的草稿'); await until(async () => (await core.request('rich.snapshot', { mountId: mount.mountId })).draft.fields.title === '新 revision 前的草稿')
    const current = desktop.snapshotFor(sessionId); desktop.replaceFixturePublication(sessionId, publication(current.manifest, 3, '<p>内容 revision 3</p>'))
    const next = await core.request('rich.snapshot', { mountId: mount.mountId }); assert.equal(await page.evaluate(value => window.renderer.update(value), next), false)
    await page.evaluate(() => window.renderer.close()); mount = await core.mount(reference); await page.evaluate(mount => window.renderer.open(mount), mount)
    await frame.getByText('内容 revision 3', { exact: true }).waitFor(); assert.equal(await frame.locator('input[name=title]').inputValue(), '新 revision 前的草稿'); assert.equal(desktop.admittedActions, 1)
    assertions.push(`new code revision requires remount and retains unsent draft ${width}px`)
    await frame.locator('summary').click()
    const captureHeight = await page.evaluate(() => Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)))
    await page.setViewportSize({ width, height: captureHeight })
    await frame.locator('body').evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))) })
    const captureLayout = async () => frame.locator('body').evaluate(body => {
      const heading = body.querySelector('h2').getBoundingClientRect(), paragraph = body.querySelector('.rich-answer>p').getBoundingClientRect()
      return { headingWidth: heading.width, headingHeight: heading.height, paragraphWidth: paragraph.width, paragraphHeight: paragraph.height, viewport: document.documentElement.clientWidth }
    })
    const captureBefore = await captureLayout()
    assert.ok(captureBefore.headingWidth >= captureBefore.viewport * .65 && captureBefore.headingHeight <= 60)
    assert.ok(captureBefore.paragraphWidth >= captureBefore.viewport * .65 && captureBefore.paragraphHeight <= 80)
    const layout = await frame.locator('body').evaluate(body => ({ overflow: body.scrollWidth>document.documentElement.clientWidth, touch: [...body.querySelectorAll('input,button,summary')].every(element=>element.getBoundingClientRect().height>=44), codeScroll: body.querySelector('pre').scrollWidth>body.querySelector('pre').clientWidth, chart: body.querySelector('.bar').dataset.value }))
    assert.deepEqual(layout, { overflow: false, touch: true, codeScroll: true, chart: '8' }); assert.equal(await page.locator('body').evaluate(body=>body.scrollWidth>innerWidth), false)
    assert.equal(await page.locator('#history').evaluate(element=>element.getBoundingClientRect().height>=44), true)
    assert.equal(await frame.locator('h2').evaluate(element=>element.getBoundingClientRect().height<=60), true)
    assert.equal(await frame.locator('.rich-answer>p').evaluate(element=>element.getBoundingClientRect().height<=80), true)
    await page.screenshot({ path: `evidence/phase6-browser-${width}.png`, fullPage: false })
    const captureAfter = await captureLayout(); assert.deepEqual(captureAfter, captureBefore)
    comparisons.push({ width, contentHash: mount.snapshot.manifest.contentHash, draft: mount.snapshot.draft.fields, chart: layout.chart, admittedActions: desktop.admittedActions, screenshot: { viewportHeight: captureHeight, fullPageResize: false, before: captureBefore, after: captureAfter } })
    assertions.push(`code scroll, chart, native/guest touch targets and stable capture layout without overflow ${width}px`)
    await page.evaluate(() => window.renderer.close()); desktop.setInheritedReadOnly(sessionId)
    const historicalModel = new SemanticPhone(owner, { maxBytes: 1048576, maxEvents: 256, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }, 256); historicalModel.accept(snapshot(events.slice(81)))
    const historicalCore = new PhoneCore(provider, historicalModel, { follow: { mode: 'once' }, clock: () => Date.now(), grantEpoch: 1, ttlMs: 60000, maxMounts: 4, maxIntents: 8, nextCommandId: () => 'historical-' + ++sequence })
    activeCore = historicalCore
    mount = await historicalCore.mount(reference); await page.evaluate(mount=>window.renderer.open(mount), mount)
    await frame.getByText('历史只读', { exact: true }).waitFor(); assert.equal(await frame.locator('input[name=title]').isDisabled(), true)
    await assert.rejects(historicalCore.request('rich.invoke', { mountId: mount.mountId, actionId: 'forbidden' }), error=>error.code==='read-only'); assert.equal(desktop.admittedActions,1)
    assertions.push(`inherited history refuses writes before native provider ${width}px`)
    await page.evaluate(() => window.renderer.close()); await historicalCore.close(); await core.close(); await page.close(); page=undefined
  }
  assert.deepEqual(errors, []); assert.equal(new Set(comparisons.map(row=>row.contentHash)).size,1); assert.equal(new Set(comparisons.map(row=>JSON.stringify(row.draft))).size,1)
  assertions.push('mobile 360/480 and desktop 1080 share exact rich content, draft and chart values')
  await writeFile('evidence/phase6-browser.json', JSON.stringify({ passed: true, layer: 'Chrome synthetic fixtures; shared phone core and canonical guest SDK', assertions, comparisons, realModelCalls: 0, uploadCalls: 0, userFilesAccessed: false, arkTsCompiled: false, arkWebQualified: false, deviceQualified: false }, null, 2)+'\n')
  console.log(`PASS: ${assertions.length} shared mobile/desktop Chrome assertions; no real dispatch or resource reads`)
} catch(error) { await writeFile('evidence/phase6-browser-failure.json', JSON.stringify({ error: error.message, assertions, errors },null,2)+'\n'); throw error }
finally { if(page&&!page.isClosed())await page.close(); if(browser)await browser.close() }
