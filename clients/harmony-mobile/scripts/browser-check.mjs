/** Actual Chrome fixture QA; this script cannot certify ArkWeb or connect to user DSH. */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { startLoopbackFixture } from '../tests/helpers/loopback.mjs'

const config = JSON.parse(await readFile('source.json', 'utf8'))
const require = createRequire(resolve(config.dshRoot, 'package.json'))
const playwright = require(require.resolve('playwright', { paths: [resolve(config.dshRoot, 'node_modules/.pnpm')] }))
const fixture = await startLoopbackFixture()
let browser
let currentPage
const assertions = [], errors = []
const consoleErrors = []
await mkdir('evidence', { recursive: true })
try {
  browser = await playwright.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, chromiumSandbox: true })
  for (const width of [360, 480]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    currentPage = page
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    await page.goto(fixture.url.replace('/mock', '/assets/browser.html'))
    const frame = page.frameLocator('#rich')
    await frame.locator('input[name=title]').fill('蜂窝场景合成测试')
    await frame.locator('input[name=count]').fill('8')
    await frame.getByRole('button', { name: '提交演示表单' }).click()
    await page.waitForFunction(() => window.lab.snapshot.actions[0]?.state === 'completed')
    assert.equal(await page.evaluate(() => window.lab.admittedActions), 1)
    assert.equal(await page.evaluate(() => window.lab.snapshot.actions[0].values.title), '蜂窝场景合成测试')
    assertions.push(`form-completed-${width}`)
    const overflow = await frame.locator('body').evaluate(body => body.scrollWidth > document.documentElement.clientWidth)
    assert.equal(overflow, false)
    assertions.push(`no-horizontal-overflow-${width}`)
    const controls = await frame.locator('input,button').evaluateAll(elements => elements.every(element => element.getBoundingClientRect().height >= 44))
    assert.equal(controls, true)
    assertions.push(`touch-targets-${width}`)
    const isolated = await frame.locator('body').evaluate(() => {
      try { void parent.document.body; return false } catch (error) { return error.name === 'SecurityError' }
    })
    assert.equal(isolated, true)
    assertions.push(`sandbox-parent-denied-${width}`)
    assert.equal(await frame.locator('body').evaluate(() => typeof window.dshDesktop), 'undefined')
    assertions.push(`no-desktop-bridge-${width}`)
    let externalRequests = 0
    await page.route('https://example.invalid/**', route => { externalRequests++; return route.abort() })
    await frame.locator('form').evaluate(form => { form.action = 'https://example.invalid/send'; form.submit() })
    await page.waitForTimeout(100)
    assert.equal(externalRequests, 0)
    assertions.push(`native-form-network-denied-${width}`)
    await page.getByRole('button', { name: '重新打开历史' }).click()
    await frame.locator('input[name=title]').waitFor()
    await page.waitForFunction(() => window.lab.snapshot.actions[0]?.state === 'completed')
    await frame.locator('input[name=title]').evaluate(input => { if (input.value !== '蜂窝场景合成测试') throw new Error('saved draft not restored') })
    assert.equal(await page.evaluate(() => window.lab.admittedActions), 1)
    assertions.push(`history-no-rerun-${width}`)
    await page.screenshot({ path: `evidence/browser-${width}.png`, fullPage: true })
    await page.close()
  }
  assert.deepEqual(errors, [])
  assertions.push('no-browser-script-errors')
  await writeFile('evidence/browser-results.json', JSON.stringify({ layer: 'Chrome fixture only', passed: true, assertions,
    arkwebValidated: false, realDesktopConnected: false, deviceValidated: false }, null, 2) + '\n')
  console.log(`PASS: ${assertions.length} Chrome fixture assertions; 360/480 px screenshots; ArkWeb/device unverified`)
} catch (error) {
  const state = currentPage && !currentPage.isClosed() ? await currentPage.evaluate(() => ({ status: document.querySelector('#status')?.textContent,
    denials: window.lab?.denials, packets: window.lab?.packets, snapshot: window.lab?.snapshot, admittedActions: window.lab?.admittedActions })) : null
  await writeFile('evidence/browser-failure.json', JSON.stringify({ error: error.message, errors, consoleErrors, state }, null, 2) + '\n')
  console.error(JSON.stringify({ error: error.message, errors, consoleErrors, status: state?.status, denials: state?.denials, packets:state?.packets, admittedActions: state?.admittedActions }))
  throw error
} finally {
  if (browser) await browser.close()
  await fixture.close()
}
