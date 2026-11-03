/** Browser interaction assertions; transport and crypto fixtures are explicitly local substitutes. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** @param spec - isolated build locations and candidate identity. @returns after browser and Host teardown, preserving failed evidence too. */
export async function runPanelBrowser(spec) {
  const require = createRequire(join(spec.root, 'package.json')), playwright = require(require.resolve('playwright', { paths: [join(spec.root, 'node_modules/.pnpm')] }))
  const { createControlPanelHost } = await import(pathToFileURL(spec.host).href)
  const chrome = await playwright.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, chromiumSandbox: true })
  const checks = [], errors = [], page = await chrome.newPage({ viewport: { width: 900, height: 900 } })
  page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message))
  let host, failure, verification
  const record = { at: new Date().toISOString(), version: spec.version, packageMode: spec.packageMode, artifact: spec.artifact, world: spec.world, checks, realModels: 0, realPairing: false, realRelay: false, installed: false, transport: 'Playwright binding with installed public Host APIs, fixture identities and non-network relay mount', fullDshShell: false }
  try {
    await page.route('**/*', route => route.request().url() === 'http://127.0.0.1/panel-fixture' ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="fixture"></div></body></html>' }) : route.abort())
    await page.goto('http://127.0.0.1/panel-fixture')
    host = await createControlPanelHost(join(spec.world, 'synthetic-host'), async (id, questions) => {
      const reply = await page.evaluate(async ({ id, questions }) => window.panelFixture.ask(id, questions), { id, questions })
      if (reply.ok) return reply.answer
      throw Object.assign(new Error('Synthetic question cancelled'), { name: reply.name, code: reply.code })
    })
    await page.exposeFunction('fixtureExecute', (id, line) => host.execute(id, line))
    await page.addScriptTag({ path: spec.browser })
    const css = await readFile(spec.browser.replace(/\.js$/, '.css'), 'utf8'); await page.addStyleTag({ content: css })
    await page.addStyleTag({ content: 'body{margin:20px;font:14px system-ui;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-primary)}:root{--dsw-alias-label-primary:#202020;--dsw-specific-menu:#fff;--dsw-alias-border-l1:#888;--dsw-radius-lg:8px;--dsw-radius-md:5px}button,textarea{font:inherit}' })
    await page.addScriptTag({ path: join(spec.stage, 'lib/client.js') }); await page.evaluate(() => window.startPanelFixture())
    assert.equal(await page.locator('[data-testid="harmony-controls"]').count(), 0); assert.equal(host.calls.length, 0); checks.push('no-session mount dispatches nothing')
    const openSettings = async () => { await page.getByTestId('open-plugin-settings').click(); await page.getByRole('dialog', { name: '插件设置', exact: true }).waitFor() }
    const closeSettings = async () => { await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.getByTestId('plugin-settings').waitFor({ state: 'hidden' }) }
    await openSettings()
    await page.getByText('请先打开一个会话，再管理手机连接', { exact: true }).waitFor()
    assert.equal(host.calls.length, 0); checks.push('Plugins settings guide an absent Session without dispatch')
    await closeSettings()
    await page.evaluate(() => window.panelFixture.select('panel-empty'))
    assert.equal(await page.getByTestId('harmony-controls').count(), 0)
    await page.screenshot({ path: join(spec.world, 'chat-without-controls.png'), fullPage: true })
    await openSettings()
    await page.getByRole('tab', { name: '手机连接', exact: true }).waitFor()
    const panel = page.getByTestId('plugin-settings').getByTestId('harmony-controls'), action = name => panel.locator('[data-harmony-action="' + name + '"]')
    await panel.waitFor(); assert.equal(host.calls.length, 0); checks.push('controls mount only inside Plugins settings and never in the composer')
    await action('status').click(); await page.waitForFunction(() => window.panelFixture.snapshot('panel-empty').publicState === 'bound'); checks.push('retained blank Session status uses real Host command')
    await action('route-start').click(); await page.getByRole('radio', { name: 'Allow', exact: true }).waitFor()
    assert.equal(await panel.count(), 0)
    assert.deepEqual(await page.evaluate(() => window.panelFixture.snapshot('panel-empty').allowed), [])
    await page.screenshot({ path: join(spec.world, 'panel-confirmation.png'), fullPage: true })
    const beforeDuplicate = host.calls.length; await page.evaluate(() => window.panelFixture.run('panel-empty', 'route-start')); assert.equal(host.calls.length, beforeDuplicate); checks.push('settings close for normal confirmation and duplicate actions stay locked')
    await page.getByRole('button', { name: '放弃整组问题', exact: true }).click()
    await page.waitForFunction(() => window.panelFixture.snapshot('panel-empty').firstFailure === 'rejected'); checks.push('official question cancellation settles without retry')
    await openSettings()
    await action('stop').click(); await page.waitForFunction(() => window.panelFixture.snapshot('panel-empty').publicState === 'stopped')
    await action('route-start').click(); await page.getByRole('radio', { name: 'Allow', exact: true }).click(); await page.getByRole('button', { name: '提交', exact: true }).click()
    await page.waitForFunction(() => window.panelFixture.snapshot('panel-empty').publicState === 'route-offered'); checks.push('official question approval returns a signed route offer')
    await openSettings()
    const publicResult = JSON.parse(await page.evaluate(() => window.panelFixture.snapshot('panel-empty').publicText)), signed = await host.signRoute(publicResult.publicResult)
    const input = page.getByRole('textbox', { name: '手机签署的公开回执 JSON', exact: true })
    await input.fill('{"token":"fixture-secret"}'); const beforeInvalid = host.calls.length; await action('route-confirm').click()
    await page.waitForFunction(() => window.panelFixture.snapshot('panel-empty').notice === 'invalidInput'); assert.equal(host.calls.length, beforeInvalid)
    await input.fill(JSON.stringify(signed)); await action('route-confirm').click(); await page.waitForFunction(() => window.panelFixture.snapshot('panel-empty').publicState === 'route-ready'); assert.equal(await input.inputValue(), ''); checks.push('invalid reply refuses locally and signed fixture reply verifies in Host')
    await action('connect').click(); await page.getByRole('radio', { name: 'Allow', exact: true }).click(); await page.getByRole('button', { name: '提交', exact: true }).click(); await page.waitForFunction(() => window.panelFixture.snapshot('panel-empty').publicState === 'transport-started'); checks.push('connect uses explicit confirmation and non-network relay substitute')
    assert.equal(await panel.count(), 0); await openSettings()
    await action('reconnect').click(); await page.getByRole('radio', { name: 'Allow', exact: true }).click(); await page.getByRole('button', { name: '提交', exact: true }).click(); await page.waitForFunction(() => window.panelFixture.snapshot('panel-empty').phase === 'settled' && window.panelFixture.snapshot('panel-empty').publicState === 'transport-started'); checks.push('manual reconnect settles through Host cleanup')
    assert.equal(await panel.count(), 0); await openSettings()
    await page.evaluate(() => window.panelFixture.select('panel-second')); await action('status').click(); await page.waitForFunction(() => window.panelFixture.snapshot('panel-second').phase === 'settled')
    assert.equal(host.calls.at(-1).sessionId, 'panel-second'); checks.push('Session switch keeps command destination explicit')
    await page.evaluate(() => window.panelFixture.select('panel-empty')); await action('stop').click(); await page.waitForFunction(() => window.panelFixture.snapshot('panel-empty').publicState === 'stopped')
    assert.equal(await page.evaluate(() => window.panelFixture.snapshot('panel-empty').firstFailure), 'rejected'); checks.push('local stop retains first failure and original binding')
    await closeSettings(); assert.equal(await panel.count(), 0)
    await openSettings(); await panel.waitFor()
    for (const width of [390, 900]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true) }
    await page.screenshot({ path: join(spec.world, 'panel-light.png'), fullPage: true })
    await page.addStyleTag({ content: ':root{--dsw-alias-label-primary:#eee;--dsw-specific-menu:#222;--dsw-alias-border-l1:#888}' }); await page.screenshot({ path: join(spec.world, 'panel-dark.png'), fullPage: true }); checks.push('light and dark themes fit 390px and 900px viewports')
    await page.evaluate(() => window.panelFixture.language('en')); await page.getByText('Phone connection controls', { exact: true }).waitFor(); checks.push('locale switch updates mounted panel')
    const beforeRemount = host.calls.length; await page.evaluate(() => window.panelFixture.remount()); await page.evaluate(() => window.panelFixture.remount()); assert.equal(host.calls.length, beforeRemount); checks.push('component remount dispatches nothing')
    await page.evaluate(() => window.panelFixture.unload()); assert.equal(await panel.count(), 0); checks.push('plugin unload withdraws the panel')
    verification = await host.verify(); assert.ok(verification.stoppedMounts >= 2); assert.deepEqual(errors, [])
  } catch (error) { failure = error; record.error = { name: error.name, message: error.message }; console.error(error) }
  finally {
    const cleanup = await Promise.allSettled([page.evaluate(() => window.panelFixture?.close())]);
    try { await host?.close() } catch (error) { failure ??= error; record.hostCleanupFailed = true }
    try { await chrome.close() } catch (error) { failure ??= error; record.browserCleanupFailed = true }
    record.fixtureCloseFailed = cleanup.some(result => result.status === 'rejected'); record.passed = failure === undefined && !record.fixtureCloseFailed; record.verification = verification; record.pageErrors = errors
    const evidence = 'evidence/control-panel-browser-' + (spec.packageMode ? 'package-' : '') + spec.version + '-' + Date.now() + '.json'
    await writeFile(evidence, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ passed: record.passed, checks: checks.length, evidence, world: spec.world }))
  }
  if (!record.passed) process.exitCode = 1
}
