/** Browser interaction qualification for isolated content controls; native OS calls are observation substitutes. */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const require = createRequire(new URL('../../web/package.json', import.meta.url))
const { chromium } = require('playwright')
const { build } = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm/node_modules')] }))
const output = resolve(process.argv[2] ?? join(root, '.artifacts/rich-actions-browser'))
await mkdir(output, { recursive: true })
const labels = { text: 'Copy this section', image: 'Copy image', copied: 'Copied', failed: 'Could not copy',
  menu: { plain: 'Copy plain text', markdown: 'Copy Markdown', copyLink: 'Copy link address', openLink: 'Open link',
    more: 'More actions', selectAll: 'Select all content', openFailed: 'Could not open link' } }
const bundle = await build({ stdin: { contents: `import { installRichCopy } from './apps/desktop/src/rich-copy.ts';
const writes=[],opened=[];window.observed={writes,opened};
window.disposeActions=installRichCopy(${JSON.stringify(labels)},async value=>{writes.push(value);return true},async url=>{opened.push(url);return true});`,
  resolveDir: root, sourcefile: 'rich-actions-browser-entry.ts', loader: 'ts' }, bundle: true, platform: 'browser', format: 'iife', write: false,
  nodePaths: [join(root, 'apps/desktop/node_modules')] })
const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
  ...process.env.DSH_TEST_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.DSH_TEST_CHROMIUM_EXECUTABLE_PATH } : {} })
const checks = []
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 520 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.setContent('<style>body{margin:0;font:16px/1.8 sans-serif}p{margin:8px 0;padding:12px}a{display:inline-block}.noselect{user-select:none}#local-target{margin-top:600px}</style>'
    + '<main data-rich-content-root class="noselect"><p id="auto">Ordinary <strong>paragraph</strong></p>'
    + '<p id="select-one">First selection line</p><p id="select-two">Second selection line</p>'
    + '<p><a id="web" href="https://example.com/document">External source</a></p>'
    + '<p><a id="hash" href="#local-target">Local section</a></p>'
    + '<p><a id="unsafe" href="file:///C:/secret.txt">Restricted local file</a></p>'
    + '<pre id="code">  run();\n\n  finish();\n</pre><table id="table"><tr><th>A</th><th>B</th></tr><tr><td>x</td><td>y</td></tr></table>'
    + '<input id="edit" value="edited draft"><div data-rich-copy="off"><p id="off">No copy action</p></div>'
    + '<p id="local-target">Local section target</p></main>')
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  const session = await page.context().newCDPSession(page)
  const controls = async () => {
    const { root: dom } = await session.send('DOM.getDocument', { depth: -1, pierce: true })
    const nodes = []
    const visit = node => {
      if (node.nodeName === 'BUTTON') nodes.push(node)
      for (const child of [...node.children ?? [], ...node.shadowRoots ?? []]) visit(child)
    }
    visit(dom)
    return await Promise.all(nodes.map(async node => {
      const { object } = await session.send('DOM.resolveNode', { nodeId: node.nodeId })
      try {
        const { result } = await session.send('Runtime.callFunctionOn', { objectId: object.objectId,
          functionDeclaration: 'function(){const r=this.getBoundingClientRect(),s=getComputedStyle(this);return {label:this.getAttribute("aria-label")||this.textContent,role:this.getAttribute("role"),x:r.left+r.width/2,y:r.top+r.height/2,visible:r.width>0&&r.height>0&&s.opacity!=="0",focused:this.getRootNode().activeElement===this}}', returnByValue: true })
        return result.value
      } finally { await session.send('Runtime.releaseObject', { objectId: object.objectId }) }
    }).map(promise => promise.catch(error => {
      if (/No node with given id found/u.test(error.message)) return { visible: false }
      throw error
    })))
  }
  const wait = async test => {
    const deadline = Date.now() + 4000
    while (!await test()) {
      if (Date.now() > deadline) throw new Error('Expected interaction did not settle: ' + test.toString())
      await new Promise(resolveWait => setTimeout(resolveWait, 20))
    }
  }
  const action = async label => {
    await wait(async () => (await controls()).some(c => c.visible && c.label === label))
    const c = (await controls()).find(c => c.visible && c.label === label)
    await page.mouse.click(c.x, c.y)
  }
  const copied = async expected => { await wait(async () => await page.evaluate(() => observed.writes.at(-1)?.text) === expected) }
  const check = name => checks.push({ name, passed: true })
  await page.locator('#auto').hover()
  await action('Copy this section')
  await copied('Ordinary paragraph')
  check('unmarked paragraph hover copy')
  await page.locator('#auto').click({ button: 'right', position: { x: 10, y: 15 } })
  await action('Copy Markdown')
  await copied('Ordinary **paragraph**')
  check('context menu Markdown with semantic formatting')
  await page.locator('#auto').hover()
  await action('More actions')
  await action('Copy plain text')
  await copied('Ordinary paragraph')
  check('hover more menu opens and copies')
  const selectedPoint = await page.evaluate(() => {
    const r = document.createRange(), a = document.getElementById('select-one').firstChild, b = document.getElementById('select-two').firstChild
    r.setStart(a, 6); r.setEnd(b, 6); getSelection().removeAllRanges(); getSelection().addRange(r)
    const rect = r.getClientRects()[0]
    return { x: rect.left + 5, y: rect.top + rect.height / 2 }
  })
  await page.mouse.click(selectedPoint.x, selectedPoint.y, { button: 'right' })
  await action('Copy Markdown')
  await copied('selection line\n\nSecond')
  assert.equal(await page.evaluate(() => getSelection().isCollapsed), false)
  check('cross-paragraph selected boundaries and selection preservation')
  await page.evaluate(() => getSelection().removeAllRanges())
  await page.locator('#web').hover()
  await wait(async () => (await controls()).some(c => c.visible && c.label === 'Open link'))
  await action('Copy link address')
  await copied('https://example.com/document')
  assert.equal(await page.evaluate(() => observed.opened.length), 0)
  check('delayed link hover menu and copy address')
  await page.locator('#web').click()
  await wait(async () => await page.evaluate(() => observed.opened.length) === 1)
  assert.equal(await page.evaluate(() => observed.opened[0]), 'https://example.com/document')
  check('default trusted click opens the external link')
  await page.evaluate(() => { document.getElementById('web').click(); document.querySelectorAll('[data-rich-copy-ui]').forEach(el => el.click()) })
  assert.equal(await page.evaluate(() => observed.opened.length), 1)
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('[data-rich-copy-ui]')].every(el => el.shadowRoot === null)), true)
  check('synthetic activation is rejected and controls have closed shadow roots')
  await page.locator('#web').focus()
  await page.keyboard.press('Shift+F10')
  await wait(async () => (await controls()).some(c => c.visible && c.label === 'Open link'))
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await copied('https://example.com/document')
  assert.equal(await page.locator('#web').evaluate(el => document.activeElement === el), true)
  check('keyboard context menu, arrow navigation and focus restoration')
  await page.locator('#unsafe').click()
  await wait(async () => await page.evaluate(() => observed.opened.length) === 1)
  check('local paths are never passed to the opener')
  await page.locator('#hash').click()
  await wait(async () => await page.evaluate(() => scrollY) > 0)
  assert.equal(await page.evaluate(() => observed.opened.length), 1)
  check('local fragment scrolls without navigation')
  await page.evaluate(() => scrollTo(0, 0))
  const drag = await page.locator('#select-one').boundingBox()
  await page.mouse.move(drag.x + 13, drag.y + drag.height / 2)
  await page.mouse.down()
  await page.mouse.move(drag.x + 125, drag.y + drag.height / 2, { steps: 8 })
  await page.mouse.up()
  const text = await page.evaluate(() => getSelection().toString())
  assert.ok(text.length > 0 && 'First selection line'.includes(text))
  check('real pointer dragging selects text despite authored user-select none')
  await page.evaluate(() => getSelection().removeAllRanges())
  await page.locator('#table').scrollIntoViewIfNeeded()
  await page.locator('#table').click({ button: 'right', position: { x: 8, y: 8 } })
  await action('Copy Markdown')
  await copied('| A | B |\n| --- | --- |\n| x | y |')
  check('table context menu copies Markdown table')
  await page.locator('#code').click({ button: 'right', position: { x: 8, y: 8 } })
  await action('Copy plain text')
  await copied('  run();\n\n  finish();\n')
  check('code copy preserves indentation and trailing newline')
  await page.locator('#code').click({ button: 'right', position: { x: 8, y: 8 } })
  await action('Copy Markdown')
  await copied('```\n  run();\n\n  finish();\n```')
  check('bare pre elements copy as fenced Markdown code')
  await page.locator('#web').focus()
  await page.keyboard.press('Enter')
  await wait(async () => await page.evaluate(() => observed.opened.length) === 2)
  check('keyboard Enter opens the default link')
  await page.locator('#web').hover()
  await wait(async () => (await controls()).some(c => c.visible && c.role === 'menuitem'))
  await page.mouse.move(590, 500)
  await wait(async () => !(await controls()).some(c => c.visible && c.role === 'menuitem'))
  check('hover menu dismisses after leaving the link and menu')
  await page.locator('#auto').scrollIntoViewIfNeeded()
  await page.locator('#auto').click({ button: 'right', position: { x: 8, y: 8 } })
  await page.keyboard.press('Escape')
  assert.equal((await controls()).some(c => c.visible && c.role === 'menuitem'), false)
  check('Escape dismisses the menu')
  await page.evaluate(() => disposeActions())
  assert.equal(await page.locator('[data-rich-copy-ui]').count(), 0)
  check('cleanup removes all controls and observers')
  assert.deepEqual(errors, [])
  check('no uncaught page errors')
} catch (error) {
  const failedPage = browser.contexts()[0]?.pages()[0]
  const detail = failedPage === undefined ? null : await failedPage.evaluate(() => ({ writes: observed.writes, opened: observed.opened,
    selection: getSelection().toString() })).catch(() => null)
  checks.push({ name: 'runner error', passed: false, error: error.stack, detail })
  process.exitCode = 1
} finally {
  await browser.close()
  const report = { passed: checks.length > 0 && checks.every(c => c.passed), evidence: 'Real Chromium pointer/keyboard events; clipboard and external opener are observation substitutes, not Electron IPC.', checks, errors }
  await writeFile(join(output, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
