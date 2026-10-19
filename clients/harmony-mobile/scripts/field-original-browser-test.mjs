/** Real Chrome clicks the candidate's exact ETS-owned document and default SDK form after a genuine process restart. */
import { readFile, writeFile, mkdtemp, rename } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { fixtureHome, startFixture, fixtureFile } from './field-processes.mjs'

if (process.argv.length !== 2 && !(process.argv.length === 4 && process.argv[2] === '--candidate')) throw new Error('explicit candidate only')
const project = resolve('.'), candidate = resolve(process.argv[3] ?? '.build/field-interaction-candidate'), world = await mkdtemp('D:/Temp/harmony-original-field-browser-'), selectedWorld = join(world, 'stable-world'), hash = bytes => createHash('sha256').update(bytes).digest('hex')
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), playwrightManifest = require.resolve('playwright/package.json', { paths: [join(root, 'node_modules/.pnpm')] }), playwright = JSON.parse(await readFile(playwrightManifest, 'utf8')), { chromium } = await import(pathToFileURL(resolve(playwrightManifest, '..', playwright.exports['.'].import)).href)
const manifest = JSON.parse(await readFile(join(candidate, 'browser-assets.json'), 'utf8')), entrypoints = await Promise.all(['runtime/node_modules/@deepseek-ai/dsh/lib/bin.js', 'runtime/node_modules/@local/dsh-harmony-replay/lib/index.js'].map(async path => ({ path, sha256: hash(await readFile(join(candidate, path))) })))
for (const row of manifest.outputs) assert.equal(hash(await readFile(join(candidate, row.path))), row.sha256)
assert.equal(manifest.htmlOrSdkRewritten, false)
const html = await readFile(join(candidate, 'product-rich-document.html')), policy = JSON.parse(await readFile(join(candidate, 'phone.config.json'), 'utf8')).core
const aHome = await fixtureHome(join(world, 'process-a'), 'browser-reopen', 'write', selectedWorld), bHome = await fixtureHome(join(world, 'process-b'), 'browser-reopen', 'read', selectedWorld), a = startFixture(candidate, aHome)
let b, browser, diagnosticPage, result, firstInvoke = '', actionId = '', sequence = 1
const pageErrors = []
try {
  const before = await fixtureFile(aHome, 'checkpoint.json', a); assert.equal(before.pid, a.child.pid); assert.equal(before.replayCalls, 1); assert.equal(before.realModels, 0)
  a.child.kill('SIGKILL'); assert.notEqual((await a.done).code, 0)
  b = startFixture(candidate, bHome)
  const baseline = await fixtureFile(bHome, 'browser-mount.json', b); assert.notEqual(baseline.pid, before.pid)
  assert.equal(baseline.mount.snapshot.manifest.js, 'window.rich.bindForm(document.querySelector("form"))')
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, chromiumSandbox: true })
  const page = await browser.newPage({ viewport: { width: 360, height: 720 } }); diagnosticPage = page; page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('**/*', route => route.request().url() === 'http://127.0.0.1:60080/original-field' ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort())
  await page.goto('http://127.0.0.1:60080/original-field')
  await page.evaluate(raw => {
    const channel = new MessageChannel(); window.__fieldDriver = { port: channel.port1, packets: [], ready: false }
    channel.port1.onmessage = event => { if (typeof event.data !== 'string') return; if (event.data === '{"kind":"rich.ready"}') window.__fieldDriver.ready = true; else window.__fieldDriver.packets.push(event.data) }
    channel.port1.start(); window.postMessage(JSON.stringify({ protocol: 'harmony-product-rich/1', policy: JSON.parse(raw) }), '*', [channel.port2])
  }, JSON.stringify(policy))
  await page.waitForFunction(() => window.__fieldDriver.ready)
  await page.evaluate(mount => window.__fieldDriver.port.postMessage(JSON.stringify({ kind: 'rich.mount', mount })), baseline.mount)
  async function exchange(input) {
    const current = sequence++, file = join(bHome, 'browser-request-' + current + '.json'), temporary = file + '.part'
    await writeFile(temporary, JSON.stringify(input) + '\n', { flag: 'wx' }); await rename(temporary, file)
    return fixtureFile(bHome, 'browser-response-' + current + '.json', b, 15000)
  }
  async function drain() {
    const packets = await page.evaluate(() => window.__fieldDriver.packets.splice(0))
    for (const raw of packets) {
      const packet = JSON.parse(raw); assert.equal(packet.kind, 'rich.request')
      if (packet.operation === 'rich.invoke') { assert.equal(firstInvoke, ''); firstInvoke = raw; actionId = packet.payload.actionId; assert.match(actionId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/) }
      const response = await exchange({ kind: 'request', raw }); await page.evaluate(reply => window.__fieldDriver.port.postMessage(reply), JSON.stringify(response))
    }
  }
  async function until(check) { const deadline = Date.now() + 15000; while (!await check()) { await drain(); if (Date.now() >= deadline) throw new Error('original browser deadline'); await delay(10) } }
  const frame = page.frameLocator('#rich-frame'); await frame.locator('form').waitFor()
  await until(async () => frame.locator('form').evaluate(() => window.rich.getState() !== null))
  assert.equal(await frame.locator('form').evaluate(form => form.outerHTML), baseline.mount.snapshot.manifest.html)
  await frame.locator('input[name="title"]').fill('Final mobile input'); await frame.locator('input[name="count"]').fill('7')
  await page.screenshot({ path: join(world, 'original-form.png') }); await frame.locator('button').click()
  let observed
  await until(async () => { try { observed = JSON.parse(await readFile(join(bHome, 'browser-observed.json'), 'utf8')); return observed.completed === true } catch (error) { if (error.code !== 'ENOENT') throw error; return false } })
  await drain(); assert.notEqual(firstInvoke, ''); assert.equal(observed.actionId, actionId); assert.deepEqual(observed.canonicalCompletedActionIds, [actionId]); assert.equal(observed.realModels, 0)
  await page.evaluate(mount => window.__fieldDriver.port.postMessage(JSON.stringify({ kind: 'rich.mount', mount })), { mountId: baseline.mount.mountId, snapshot: observed.completedSnapshot })
  await until(async () => frame.locator('form').evaluate((_form, id) => window.rich.getState().actions.some(action => action.actionId === id && action.state === 'completed'), actionId))
  const duplicate = await exchange({ kind: 'request', raw: firstInvoke }); assert.equal(duplicate.value.actionId, actionId); assert.equal(duplicate.value.accepted, true)
  const guestHostDenied = await frame.locator('form').evaluate(() => { try { return window.parent.__fieldDriver === undefined } catch (error) { return true } }); assert.equal(guestHostDenied, true)
  const widths = []
  for (const width of [360, 480]) { await page.setViewportSize({ width, height: 720 }); assert.equal(await frame.locator('form').evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('input,button')].every(control => control.getBoundingClientRect().height >= 44)), true); widths.push(width) }
  await page.screenshot({ path: join(world, 'original-completed.png') }); assert.deepEqual(pageErrors, [])
  await exchange({ kind: 'finish' }); assert.equal((await b.done).code, 0)
  const after = JSON.parse(await readFile(join(bHome, 'result.json'), 'utf8')); assert.equal(after.richCompleted, true); assert.equal(after.richDuplicate, true); assert.equal(after.cancellation, true); assert.equal(after.originalTaskPrompts, 0); assert.equal(after.originalMessages, 1); assert.equal(before.replayCalls + after.replayCalls, 4); assert.equal(after.realModels, 0); assert.deepEqual(after.browserEvidence.canonicalCompletedActionIds, [actionId]); assert.equal(after.browserEvidence.invokeCalls, 2)
  result = { schema: 'harmony-original-candidate-browser/1', passed: true, world, candidate, entrypoints, browser: browser.version(), htmlSha256: hash(html), sdkManifest: manifest, publicationContentHash: baseline.mount.snapshot.manifest.contentHash, publicationJs: baseline.mount.snapshot.manifest.js, browserGeneratedActionId: actionId, originalPacketSha256: hash(firstInvoke), scriptedActionId: false, formOrSdkReplaced: false, cryptoOverridden: false, actualClick: true, guestHostDenied, widths, pageErrors, before, after, realModels: 0, identitiesCreated: false, phoneOrArkWebAccepted: false }
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.__fieldDriver.port.close() })
} finally {
  if (!a.exited) a.child.kill('SIGKILL'); await a.done
  if (b && !b.exited) b.child.kill('SIGKILL'); if (b) await b.done
  let guestState; if (!result && diagnosticPage) { try { guestState = await diagnosticPage.frameLocator('#rich-frame').locator('form').evaluate(() => window.rich.getState()) } catch (error) { guestState = String(error) } }
  await browser?.close()
  await writeFile(join(project, 'evidence/phase53-original-browser.json'), JSON.stringify(result ?? { passed: false, world, candidate, entrypoints, firstInvoke, actionId, pageErrors, guestState, realModels: 0 }, null, 2) + '\n')
}
console.log(JSON.stringify({ passed: true, world, actualClick: true, browserGeneratedActionId: actionId, exactSdkActionCompleted: true, duplicate: true, replayCalls: 4, realModels: 0, originalPageUnchanged: true }))
