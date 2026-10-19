/** Chrome plus actual plain .ets logic with SDK substitutes; never ArkWeb/device evidence or a live desktop connection. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { NativeRuntimeOwner, NATIVE_DOCUMENT, NATIVE_ORIGIN, resetSdk, sdk, context } from '../.build/native-adapters.js'

const source = JSON.parse(await readFile('source.json', 'utf8')), require = createRequire(resolve(source.dshRoot, 'package.json'))
const playwright = require(require.resolve('playwright', { paths: [resolve(source.dshRoot, 'node_modules/.pnpm')] }))
const rawDir = 'harmony/entry/src/main/resources/rawfile/', manifest = JSON.parse(await readFile(rawDir + 'native-runtime-source-manifest.json', 'utf8'))
globalThis.canIUse = () => true
const assertions = [], failures = [], pendingBridge = new Set()
let browser, currentOwner, currentPage, pumpTimer, pumping = false, externalRequests = 0, uiCalls = 0, cacheWrites = 0, byteCalls = 0
async function until(predicate) { const deadline = Date.now() + 8000; while (!predicate()) { if (Date.now() > deadline) throw new Error('Native fixture wait timed out'); await new Promise(accept => setTimeout(accept, 10)) } }
try {
  browser = await playwright.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, chromiumSandbox: true })
  for (const width of [360, 480]) {
    resetSdk(); for (const row of manifest.resources) sdk.resources.set(row.name, await readFile(rawDir + row.name))
    const views = [], errors = [], busy = [], incoming = [], owner = new NativeRuntimeOwner(); currentOwner = owner
    owner.initialize(context(), view => views.push(view), code => errors.push(code), value => busy.push(value)); owner.load()
    const page = await browser.newPage({ viewport: { width, height: 700 }, reducedMotion: 'reduce' }); currentPage = page
    page.on('pageerror', error => failures.push(error.message))
    await page.route('**/*', route => { if (route.request().url() === NATIVE_DOCUMENT) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: owner.controller.html }); externalRequests++; return route.abort() })
    let nativePort
    await page.goto(NATIVE_DOCUMENT)
    let bootstrap
    owner.controller.onBootstrap = raw => { bootstrap = raw }
    owner.bind(NATIVE_DOCUMENT); nativePort = owner.controller.ports[0]
    nativePort.deliver = raw => {
      uiCalls += JSON.parse(raw).kind === 'ui' ? 1 : 0
      const work = page.evaluate(raw => window.__nativeFixture.deliver(raw), raw).catch(error => { failures.push(error.message) })
      pendingBridge.add(work); void work.finally(() => pendingBridge.delete(work))
    }
    await page.evaluate(({ bootstrap, origin }) => {
      const channel = new MessageChannel()
      window.__nativeFixture = { deliver: raw => channel.port1.postMessage(raw), lastAction: null, queue: [] }
      channel.port1.addEventListener('message', event => { window.__nativeFixture.queue.push(event.data) }); channel.port1.start()
      addEventListener('message', event => { if (event.data?.protocol === 'lumina-rich/1' && event.data.type === 'action.invoke') window.__nativeFixture.lastAction = event.data })
      postMessage(bootstrap, origin, [channel.port2])
    }, { bootstrap, origin: NATIVE_ORIGIN })
    pumpTimer = setInterval(() => {
      if (pumping) return
      pumping = true
      const work = page.evaluate(() => window.__nativeFixture.queue.splice(0)).then(rows => {
        for (const raw of rows) {
          incoming.push(JSON.parse(raw)); const call = incoming.at(-1)
          if (call.kind === 'io' && call.method === 'cache.write') cacheWrites++
          if (call.kind === 'io' && call.method === 'fixture.bytes') byteCalls++
          nativePort.emit(raw)
        }
      }).catch(error => { failures.push(error.message) }).finally(() => { pumping = false })
      pendingBridge.add(work); void work.finally(() => pendingBridge.delete(work))
    }, 10)
    await until(() => incoming.some(row => row.kind === 'ready')); owner.command('connect.demo', 'mock-session-a'); await until(() => busy.at(-1) === false && views.at(-1)?.connection === 'connected')
    owner.command('submit', '', 'native-intent-' + width, '仅限合成任务 ' + width); await until(() => busy.at(-1) === false && views.at(-1)?.task === 'completed')
    assert.ok(views.some(view => view.messages.some(row => row.id.startsWith('native-live-') && row.text.includes('🙂')))); assertions.push('native-utf8-stream-admitted-and-settled-' + width)
    const submit = nativePort.posted.find(raw => JSON.parse(raw).method === 'submit'); nativePort.postMessageEvent(submit); await until(() => incoming.filter(row => row.kind === 'ui.reply' && row.id === JSON.parse(submit).id).length === 2)
    assert.equal(views.at(-1).messages.filter(row => row.role === 'user').length, 1); assertions.push('same-native-intent-once-' + width)
    const frame = page.frameLocator('#rich-frame'); await frame.locator('input[name=title]').fill('原生离线富块 ' + width); await frame.locator('body').evaluate(() => rich.onState(state => { window.__fixtureState = state })); await frame.locator('input[name=count]').fill('9'); await frame.locator('button[type=submit]').click(); await until(() => incoming.some(row => row.kind === 'view' && row.view.messages.some(message => message.hasRich)))
    await frame.locator('output').filter({ hasText: 'completed' }).waitFor({ timeout: 8000 }); assertions.push('native-byte-core-rich-action-completed-' + width)
    const isolated = await frame.locator('body').evaluate(() => { try { void parent.document.body; return false } catch (error) { return error.name === 'SecurityError' } }); assert.equal(isolated, true); assertions.push('opaque-guest-cannot-read-native-port-' + width)
    assert.equal(await frame.locator('body').evaluate(() => typeof window.dshDesktop + '/' + typeof window.__nativeFixtureReceive), 'undefined/undefined'); assertions.push('no-guest-host-or-native-fixture-bridge-' + width)
    const action = await page.evaluate(() => window.__nativeFixture.lastAction); assert.ok(action)
    await frame.locator('body').evaluate((_body, action) => parent.postMessage(action, '*'), action); await frame.locator('output').filter({ hasText: 'completed' }).waitFor(); const state = await frame.locator('body').evaluate(() => window.__fixtureState); assert.equal(state.actions.length, 1); assert.equal(state.actions[0].values.title, '原生离线富块 ' + width); assert.equal(views.at(-1).messages.filter(row => row.role === 'user').length, 1); assertions.push('duplicate-guest-action-keeps-one-ledger-action-' + width)
    assert.equal(await frame.locator('body').evaluate(body => body.scrollWidth > document.documentElement.clientWidth), false); assertions.push('rich-layout-within-mobile-width-' + width)
    assert.equal(await frame.locator('input,button').evaluateAll(rows => rows.every(row => row.getBoundingClientRect().height >= 44)), true); assertions.push('rich-touch-controls-' + width)
    await page.screenshot({ path: 'evidence/phase9-browser-' + width + '.png', fullPage: true })
    await frame.locator('form').evaluate(form => { form.action = 'https://forbidden.invalid/post'; form.submit() }); await page.waitForTimeout(40); assert.equal(externalRequests, 0); assertions.push('guest-form-network-denied-' + width)
    owner.command('cache.save'); await until(() => busy.at(-1) === false); assert.ok(sdk.files.get('/app/mobile-offline-cache.json').bytes.length > 0)
    const savedCache = Buffer.from(sdk.files.get('/app/mobile-offline-cache.json').bytes)
    owner.command('connect.demo', 'mock-session-b'); await until(() => busy.at(-1) === false && views.at(-1)?.messages.length === 0)
    owner.command('submit', '', 'security-intent-' + width, 'Fixed security task'); await until(() => busy.at(-1) === false && views.at(-1)?.task === 'completed')
    await frame.locator('#security-run').click()
    try { await frame.locator('#security-result').filter({ hasText: 'shell-rpc:blocked' }).waitFor({ timeout: 8000 }) }
    catch (error) { console.log('SECURITY_DIAGNOSTIC', await frame.locator('#security-result').textContent(), await frame.locator('body').evaluate(() => ({ scope: typeof scope === 'undefined' ? null : scope, violations: typeof violations === 'undefined' ? null : [...violations] }))); throw error }
    const security = await frame.locator('#security-result').textContent()
    for (const label of ['parent-dom:blocked','host-bridge:absent','popup:blocked','worker:blocked','websocket:blocked','network:blocked','file:blocked']) assert.ok(security.includes(label), security)
    assert.ok(security.includes('connect-src') && security.includes('worker-src'), security); assertions.push('synthetic-worker-websocket-csp-events-and-guest-denials-' + width)
    assert.ok(security.includes('shell-rpc:blocked')); assertions.push('scoped-shell-rpc-denied-' + width)
    assert.equal(incoming.some(row => row.id === 'forged-cache-clear' || row.id === 'forged-submit'), false)
    assert.equal(views.at(-1).messages.filter(row => row.role === 'user').length, 1)
    assert.deepEqual(Buffer.from(sdk.files.get('/app/mobile-offline-cache.json').bytes), savedCache); assertions.push('forged-native-io-and-submit-have-no-effect-' + width)
    const beforeSwitch = views.length
    owner.command('connect.demo', 'mock-session-a'); await until(() => busy.at(-1) === false && views.at(-1)?.messages.length === 0)
    assert.ok(views.slice(beforeSwitch).every(view => view.totalMessages === 0)); assertions.push('retiring-rich-session-does-not-publish-old-view-' + width)
    owner.command('disconnect'); await until(() => busy.at(-1) === false && views.at(-1)?.connection === 'disconnected'); assert.equal(views.at(-1).readOnly, true)
    const callsAfterDisconnect = byteCalls
    owner.command('cache.restore'); await until(() => busy.at(-1) === false && views.at(-1)?.offline === true); assert.equal(views.at(-1).readOnly, true); assert.equal(byteCalls, callsAfterDisconnect); assertions.push('native-cache-restores-readonly-after-disconnect-' + width)
    await owner.close(); assert.equal(nativePort.closed, true); assert.ok(!errors.includes('native-close-unconfirmed')); assert.equal(sdk.fds.size, 0); assert.equal(sdk.requests.length, 0); assertions.push('shared-core-close-ack-before-native-revoke-' + width)
    clearInterval(pumpTimer); pumpTimer = undefined; await Promise.all([...pendingBridge]); await page.close(); currentPage = null; currentOwner = null
    assert.deepEqual(errors, []); assertions.push('native-display-admission-no-errors-' + width)
  }
  assert.deepEqual(failures, []); assert.equal(externalRequests, 0)
  await writeFile('evidence/phase9-browser.json', JSON.stringify({ schema: 'native-offline-cross-layer/1', generatedAt: new Date().toISOString(), runtimeResources: manifest.resources, passed: true, layer: 'Chrome + actual plain .ets logic / in-memory SDK substitutes', assertions, byteCalls, cacheWrites, uiCalls, externalRequests, realModelCalls: 0, uploadCalls: 0, arkWebQualified: false, nativeFsQualified: false, nativeHttpQualified: false, deviceQualified: false, actualDesktopConnected: false }, null, 2) + '\n')
  console.log('PASS: ' + assertions.length + ' native offline cross-layer Chrome assertions; actual ArkWeb/device not exercised')
} catch (error) {
  await writeFile('evidence/phase9-browser-failure.json', JSON.stringify({ passed: false, error: error.message, assertions, failures, externalRequests }, null, 2) + '\n'); throw error
} finally { await currentOwner?.close(); clearInterval(pumpTimer); await Promise.all([...pendingBridge]); await currentPage?.close(); await browser?.close() }
