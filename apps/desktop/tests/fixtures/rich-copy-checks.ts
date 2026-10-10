/** Native clipboard assertions use the shipped isolated preload and actual pointer events. */
import { clipboard, ClipboardItem, nativeImage, type WebContents } from 'electron'

/**
 * Exercise region, code and bitmap copying while restoring the user's clipboard afterward.
 * @param guest - registered executable rich guest with copy controls enabled.
 * @param check - fixture assertion recorder.
 */
export async function runRichCopyChecks(guest: WebContents,
  check: (name: string, condition: boolean, detail: unknown) => void): Promise<void> {
  const previous = await Promise.all((await clipboard.read()).filter(item => item.types.length > 0).map(async item => new ClipboardItem(
    Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)] as const))),
  )))
  interface DomNode { nodeId: number; nodeName: string; attributes?: string[]; children?: DomNode[]; shadowRoots?: DomNode[] }
  const nodes = async (attribute: string): Promise<DomNode[]> => {
    const { root } = await guest.debugger.sendCommand('DOM.getDocument', { depth: -1, pierce: true }) as { root: DomNode }
    const found: DomNode[] = []
    const visit = (node: DomNode): void => {
      if (node.attributes?.includes(attribute)) found.push(node)
      for (const child of [...node.children ?? [], ...node.shadowRoots ?? []]) visit(child)
    }
    visit(root)
    return found
  }
  const inControl = async (node: DomNode, functionDeclaration: string): Promise<unknown> => {
    const { object } = await guest.debugger.sendCommand('DOM.resolveNode', { nodeId: node.nodeId }) as { object: { objectId: string } }
    try {
      const result = await guest.debugger.sendCommand('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration, returnByValue: true }) as { result: { value: unknown } }
      return result.result.value
    } finally { await guest.debugger.sendCommand('Runtime.releaseObject', { objectId: object.objectId }) }
  }
  const waitFor = async (test: () => Promise<boolean>): Promise<void> => {
    const deadline = Date.now() + 5000
    while (!(await test())) {
      if (Date.now() >= deadline) throw new Error('rich copy did not reach the expected native state')
      await new Promise<void>(resolve => setTimeout(resolve, 20))
    }
  }
  const point = async (id: string): Promise<{ x: number; y: number }> => await guest.executeJavaScript(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:Math.round(r.right-18),y:Math.round(r.top+18)}})()`) as { x: number; y: number }
  const click = async (id: string): Promise<void> => {
    await guest.executeJavaScript(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({block:'nearest'})`)
    const position = await point(id)
    guest.sendInputEvent({ type: 'mouseMove', ...position })
    await guest.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    guest.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...position })
    guest.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...position })
  }
  try {
    const bitmap = nativeImage.createFromBitmap(Buffer.from([0, 0, 255, 255, 0, 255, 0, 255]), { width: 2, height: 1 })
    const html = '<div style="transform:translateX(10px);width:90%;overflow:hidden"><article id="copy-issue" data-rich-copy style="padding:24px"><h3>[P1] Retry</h3><p>checkout.ts:84</p>'
      + '<p>Reuse the request key.</p><button>Ignore control</button><span hidden>Hidden text</span></article>'
      + '<section id="copy-prompt" data-rich-copy style="padding:24px">Exact prompt<br>Second line</section>'
      + '<section data-rich-copy id="copy-outer" style="padding:24px"><pre id="copy-code" style="padding:24px">  run();\n\n  finish();\n</pre></section>'
      + `<img id="copy-image" data-rich-copy="image" src="${bitmap.toDataURL()}" style="width:120px;height:60px">`
      + '<figure id="copy-missing" data-rich-copy="image" style="padding:24px">Image unavailable</figure>'
      + '<section data-rich-copy="off"><pre>Copy disabled</pre></section></div>'
    await guest.executeJavaScript(`document.body.innerHTML=${JSON.stringify(html)}`)
    await waitFor(async () => await guest.executeJavaScript('document.querySelectorAll("[data-rich-copy-ui]").length>=6 && document.getElementById("copy-image").naturalWidth===2') === true)
    const buttons = await nodes('Copy this section')
    const reviewButton = buttons[0]
    if (reviewButton === undefined) throw new Error('native copy button missing')
    guest.sendInputEvent({ type: 'mouseMove', x: 599, y: 449 })
    await guest.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    const idleOpacity = await inControl(reviewButton, 'function(){return getComputedStyle(this).opacity}')
    check('copy controls stay visually hidden before hover or focus', idleOpacity === '0', { opacity: idleOpacity })
    await clipboard.writeText('rich-copy-sentinel')
    await inControl(reviewButton, 'function(){this.click()}')
    await guest.executeJavaScript('document.querySelectorAll("[data-rich-copy-ui]").forEach(element=>element.click());richGuest.send({type:"clipboard.copy",text:"script-write"})')
    check('generated scripts cannot call the private clipboard writer', await clipboard.readText() === 'rich-copy-sentinel'
      && await guest.executeJavaScript('typeof richGuest.copy==="undefined" && [...document.querySelectorAll("[data-rich-copy-ui]")].every(element=>element.shadowRoot===null)') === true, {})
    guest.focus()
    await guest.executeJavaScript('document.body.tabIndex=-1;document.body.focus()')
    await guest.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    await guest.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    await guest.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    const focused = await inControl(reviewButton, 'function(){return {opacity:getComputedStyle(this).opacity,focused:this.getRootNode().activeElement===this,disabled:this.disabled}}') as { opacity: string; focused: boolean }
    check('Tab reaches and reveals the copy action', focused.opacity === '1' && focused.focused, focused)
    await guest.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
    await guest.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    const issue = '[P1] Retry\n\ncheckout.ts:84\n\nReuse the request key.'
    await waitFor(async () => await clipboard.readText() === issue)
    check('keyboard activation writes the selected section', true, {})
    await clipboard.writeText('rich-copy-pointer-sentinel')
    await click('copy-issue')
    await waitFor(async () => await clipboard.readText() === issue)
    check('trusted pointer copies only visible review text', await clipboard.readText() === issue, {})
    check('copy controls remain usable inside transformed and clipped containers', await inControl(reviewButton, 'function(){return this.matches(":popover-open")}') === true, {})
    check('disabled regions receive no copy action', buttons.length === 4, { controls: buttons.length })
    await click('copy-prompt')
    await waitFor(async () => await clipboard.readText() === 'Exact prompt\nSecond line')
    check('prompt copying retains line breaks', true, {})
    await click('copy-code')
    await waitFor(async () => await clipboard.readText() === '  run();\n\n  finish();\n')
    check('nested code copying keeps exact whitespace and excludes its parent', true, {})
    const outer = buttons[2]
    if (outer === undefined) throw new Error('outer copy action missing')
    check('hovering nested code leaves its parent action hidden', await inControl(outer, 'function(){return getComputedStyle(this).opacity}') === '0', {})
    await guest.executeJavaScript('document.getElementById("copy-prompt").textContent="Updated prompt"')
    await click('copy-prompt')
    await waitFor(async () => await clipboard.readText() === 'Updated prompt')
    check('copy reads the current content after local updates', true, {})
    await guest.executeJavaScript('document.getElementById("copy-image").scrollIntoView({block:"center"})')
    await click('copy-image')
    await waitFor(async () => (await clipboard.read()).some(item => item.types.includes('image/png')))
    const imageItem = (await clipboard.read()).find(item => item.types.includes('image/png'))
    if (imageItem === undefined) throw new Error('clipboard image missing')
    const payload = await imageItem.getType('image/png')
    if (!(payload instanceof Blob)) throw new Error('clipboard image is not binary')
    const copied = nativeImage.createFromBuffer(Buffer.from(await payload.arrayBuffer()))
    check('image copy writes image pixels instead of a URL or HTML screenshot', copied.toBitmap().equals(bitmap.toBitmap()), copied.getSize())
    await click('copy-missing')
    const outcomes = await nodes('status')
    const outcome = outcomes[0]
    if (outcome === undefined) throw new Error('copy outcome missing')
    await waitFor(async () => await inControl(outcome, 'function(){return this.textContent}') === 'Could not copy')
    check('unavailable image reports failure and preserves its content', await guest.executeJavaScript('document.getElementById("copy-missing").textContent') === 'Image unavailable', {})
  } finally {
    if (previous.length > 0) await clipboard.write(previous)
    else clipboard.clear()
  }
}
