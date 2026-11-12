/** Chromium layout of the native-owned Rich document, using only synthetic publications. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { richFixture } from '../.build/fixtures.js'

const require = createRequire(resolve('../../package.json'))
const dependencies = { paths: [resolve('../../node_modules/.pnpm')] }
const esbuild = require(require.resolve('esbuild', dependencies))
const { chromium } = require(require.resolve('playwright', dependencies))
const built = await esbuild.build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `import { BrowserRichRenderer, MOBILE_RENDERER_VERSION } from './src/rich-renderer.ts';
      const renderer = new BrowserRichRenderer(document.querySelector('iframe'), {
        request: async operation => { window.layoutRequests.push(operation); return { disposed: true }; }
      }, { rendererVersion: MOBILE_RENDERER_VERSION, packetBytes: 1048576, maxPackets: 256,
        scrollInDocument: !location.search.includes('fixed') });
      window.layoutRequests = [];
      window.openPublication = value => renderer.open(value);
      window.closePublication = () => renderer.close();`,
  },
  bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022',
  tsconfig: resolve('.build/projection.tsconfig.json'),
})
const document = '<!doctype html><meta name="viewport" content="width=device-width"><style>html,body{margin:0}iframe{display:block;width:100%;height:240px;min-height:240px;border:0}</style><iframe sandbox="allow-scripts allow-forms"></iframe><script type="module">'
  + built.outputFiles[0].text.replaceAll('</script', '<\\/script') + '</script>'

function publication(html, css = '', fallbackText = '') {
  const snapshot = richFixture('layout-session')
  const content = { css, html, js: '', stateSchemaVersion: 1 }
  snapshot.manifest = { ...snapshot.manifest, ...content, fallbackText,
    contentHash: createHash('sha256').update(JSON.stringify(content)).digest('hex') }
  return { mountId: 'layout-mount', snapshot }
}

test('native Rich document scrolls long and expanding content and retires its size listener', async t => {
  const browser = await chromium.launch({ executablePath: process.env.DSH_TEST_CHROMIUM_EXECUTABLE_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 360, height: 240 } })
  await page.route('**/*', route => route.request().url().startsWith('https://rich-layout.dsh.invalid/')
    ? route.fulfill({ contentType: 'text/html', body: document }) : route.abort())
  const open = async (value, query = '') => {
    await page.goto('https://rich-layout.dsh.invalid/' + query)
    await page.waitForFunction(() => typeof window.openPublication === 'function')
    return page.evaluate(value => window.openPublication(value), value)
  }
  const sections = Array.from({ length: 24 }, (_, i) => '<section>Report section ' + i + '</section>').join('')
  const long = publication('<h2>Report start</h2>' + sections + '<p id="end">Report end</p>', 'section{min-height:90px}')

  await t.test('long publication scrolls in the owning document', async () => {
    assert.equal(await open(long), true)
    await page.waitForFunction(() => document.documentElement.scrollHeight > 2000)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const bounds = await page.frameLocator('iframe').locator('#end').boundingBox()
    assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 240)
  })

  await t.test('expanding and folding a form changes its document height', async () => {
    const form = publication('<label><input type="checkbox">Confirm</label><details><summary>Appendix</summary>' + sections + '<p id="end">Appendix end</p></details>', 'section{min-height:90px}')
    assert.equal(await open(form), true)
    const frame = page.frameLocator('iframe')
    await frame.locator('input').check()
    assert.equal(await frame.locator('input').isChecked(), true)
    await frame.locator('summary').click()
    await page.waitForFunction(() => document.documentElement.scrollHeight > 2000)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const end = await frame.locator('#end').boundingBox()
    assert.ok(end && end.y >= 0 && end.y + end.height <= 240)
    await frame.locator('summary').click()
    await page.waitForFunction(() => document.documentElement.scrollHeight <= 240)
    assert.equal(await frame.locator('input').isChecked(), true)
  })

  await t.test('resize events from a different source or mount cannot resize the frame', async () => {
    assert.equal(await open(long), true)
    await page.waitForFunction(() => document.documentElement.scrollHeight > 2000)
    const before = await page.locator('iframe').evaluate(frame => frame.style.height)
    await page.frameLocator('iframe').locator('body').evaluate(() => {
      parent.postMessage({ protocol: 'lumina-rich/1', mountId: 'old-mount', renderRevision: 1,
        seq: 1, packetId: 'old-resize', type: 'resize', payload: { height: 42 } }, '*')
    })
    await page.evaluate(() => window.postMessage({ protocol: 'lumina-rich/1', mountId: 'layout-mount', renderRevision: 1,
      seq: 1, packetId: 'parent-resize', type: 'resize', payload: { height: 42 } }, '*'))
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.locator('iframe').evaluate(frame => frame.style.height), before)
    assert.deepEqual(await page.evaluate(() => window.layoutRequests), [])
    await page.evaluate(() => window.closePublication())
    assert.equal(await page.locator('iframe').evaluate(frame => frame.style.height), '')
    assert.deepEqual(await page.evaluate(() => window.layoutRequests), ['rich.dispose'])
  })

  await t.test('incompatible publication retains its static fallback scrolling', async () => {
    const fallback = publication('<p>Unused</p>', '', Array(400).fill('Readable fallback').join(' '))
    fallback.snapshot.manifest.contentHash = 'invalid'
    assert.equal(await open(fallback), false)
    const body = page.frameLocator('iframe').locator('body')
    await body.waitFor()
    assert.match(await body.innerText(), /Readable fallback/)
    assert.ok(await body.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
      return window.scrollY > 0
    }))
    assert.deepEqual(await page.evaluate(() => window.layoutRequests), [])
  })

  await t.test('other renderer consumers retain their fixed frame viewport', async () => {
    assert.equal(await open(long, '?fixed'), true)
    assert.equal(await page.locator('iframe').evaluate(frame => frame.style.height), '')
    assert.equal(await page.locator('iframe').evaluate(frame => frame.clientHeight), 240)
  })
})
