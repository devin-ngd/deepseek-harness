/** Real pointer and keyboard checks for the shipped isolated content actions; no external browser is launched. */
import { clipboard, ClipboardItem, type WebContents } from 'electron'

/** @param guest - live action-enabled guest. @param opened - observed OS-open requests. @param check - fixture assertion recorder. */
export async function runRichActionChecks(guest: WebContents, opened: string[],
  check: (name: string, condition: boolean, detail: unknown) => void): Promise<void> {
  const previous = await Promise.all((await clipboard.read()).filter(item => item.types.length > 0).map(async item => new ClipboardItem(
    Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)] as const))),
  )))
  const wait = async (test: () => Promise<boolean>): Promise<void> => {
    const deadline = Date.now() + 4000
    while (!await test()) {
      if (Date.now() > deadline) throw new Error('rich content actions did not reach expected state')
      await new Promise<void>(resolve => setTimeout(resolve, 20))
    }
  }
  const frame = async (): Promise<void> => { await guest.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))') }
  const point = async (id: string): Promise<{ x: number; y: number }> => await guest.executeJavaScript(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:Math.round(r.left+12),y:Math.round(r.top+r.height/2)}})()`) as { x: number; y: number }
  const pointer = (position: { x: number; y: number }, button: 'left' | 'right' = 'left'): void => {
    guest.sendInputEvent({ type: 'mouseMove', ...position })
    guest.sendInputEvent({ type: 'mouseDown', button, clickCount: 1, ...position })
    guest.sendInputEvent({ type: 'mouseUp', button, clickCount: 1, ...position })
  }
  const key = async (name: string, code: number): Promise<void> => {
    await guest.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: name, windowsVirtualKeyCode: code })
    await guest.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: name, windowsVirtualKeyCode: code })
  }
  interface DomNode { nodeId: number; nodeName: string; children?: DomNode[]; shadowRoots?: DomNode[] }
  const controls = async (): Promise<{ id: string; label: string; x: number; y: number; visible: boolean }[]> => {
    const { root } = await guest.debugger.sendCommand('DOM.getDocument', { depth: -1, pierce: true }) as { root: DomNode }
    const buttons: DomNode[] = []
    const visit = (node: DomNode): void => {
      if (node.nodeName === 'BUTTON') buttons.push(node)
      for (const child of [...node.children ?? [], ...node.shadowRoots ?? []]) visit(child)
    }
    visit(root)
    return await Promise.all(buttons.map(async (node) => {
      const { object } = await guest.debugger.sendCommand('DOM.resolveNode', { nodeId: node.nodeId }) as { object: { objectId: string } }
      try {
        const { result } = await guest.debugger.sendCommand('Runtime.callFunctionOn', { objectId: object.objectId,
          functionDeclaration: 'function(){const r=this.getBoundingClientRect(),s=getComputedStyle(this);return {id:this.id,label:this.getAttribute("aria-label")||this.textContent,x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),visible:r.width>0&&r.height>0&&s.opacity!=="0"&&s.visibility!=="hidden"}}', returnByValue: true }) as { result: { value: { id: string; label: string; x: number; y: number; visible: boolean } } }
        return result.value
      } finally { await guest.debugger.sendCommand('Runtime.releaseObject', { objectId: object.objectId }) }
    }).map(promise => promise.catch((error: unknown) => {
      if (error instanceof Error && /No node with given id found/u.test(error.message)) return { id: '', label: '', x: 0, y: 0, visible: false }
      throw error
    })))
  }
  const menuClick = async (label: string): Promise<void> => {
    await wait(async () => (await controls()).some(control => control.visible && control.label === label))
    const control = (await controls()).find(control => control.visible && control.label === label)
    if (control === undefined) throw new Error('missing action ' + label)
    pointer(control)
  }
  try {
    const html = '<div data-rich-content-root style="padding:20px;color:CanvasText;font:16px/1.8 sans-serif">'
      + '<p id="auto" style="padding:16px">Ordinary <strong>paragraph</strong></p>'
      + '<p id="select-one">First selection line</p><p id="select-two">Second selection line</p>'
      + '<p><a id="web" href="https://example.com/document">External source</a></p>'
      + '<p><a id="hash" href="#local-target">Local section</a></p>'
      + '<p><a id="unsafe" href="file:///C:/secret.txt">Local file is not permitted</a></p>'
      + '<p id="local-target">Local section target</p><input id="edit" value="editable draft"></div>'
    await guest.executeJavaScript(`document.body.innerHTML=${JSON.stringify(html)}`)
    await frame()
    guest.focus()
    await clipboard.writeText('actions-sentinel')
    const auto = await point('auto')
    guest.sendInputEvent({ type: 'mouseMove', ...auto })
    await frame()
    await menuClick('Copy this section')
    await wait(async () => await clipboard.readText() === 'Ordinary paragraph')
    check('unmarked paragraphs receive a working hover copy action', true, {})
    pointer(auto, 'right')
    await menuClick('Copy Markdown')
    await wait(async () => await clipboard.readText() === 'Ordinary **paragraph**')
    check('right-click copies visible prose as Markdown', true, {})

    await guest.executeJavaScript('(()=>{const a=document.getElementById("select-one").firstChild,b=document.getElementById("select-two").firstChild,r=document.createRange();r.setStart(a,6);r.setEnd(b,6);getSelection().removeAllRanges();getSelection().addRange(r)})()')
    pointer(await point('select-one'), 'right')
    await menuClick('Copy plain text')
    await wait(async () => await clipboard.readText() === 'selection line\n\nSecond')
    check('selection copy keeps exact cross-paragraph boundaries rather than the entire region', true, {})
    check('opening and clicking menus preserves the free selection', await guest.executeJavaScript('getSelection().isCollapsed===false') as boolean, {})
    await guest.executeJavaScript('getSelection().removeAllRanges()')

    const web = await point('web')
    guest.sendInputEvent({ type: 'mouseMove', ...web })
    await wait(async () => (await controls()).some(control => control.visible && control.label === 'Open link'))
    const visible = (await controls()).filter(control => control.visible).map(control => control.label)
    check('hovering a link exposes only its useful local actions', visible.includes('Copy link address') && visible.includes('Copy Markdown'), visible)
    await menuClick('Copy link address')
    await wait(async () => await clipboard.readText() === 'https://example.com/document')
    check('hover menu copies the link address without navigation', opened.length === 0, opened)
    pointer(web)
    await wait(async () => opened.length === 1)
    check('trusted default link click requests the system browser and leaves the guest mounted', opened[0] === 'https://example.com/document'
      && guest.getURL().startsWith('dsh-app://dsh-rich-'), opened)
    await guest.executeJavaScript('document.getElementById("web").click();window.open("https://example.com/script");richGuest.send({type:"openLink",url:"https://example.com/forged"})')
    await frame()
    check('generated clicks, popups and forged packets cannot request the native opener', opened.length === 1, opened)
    pointer(await point('hash'))
    await frame()
    check('same-document links remain local and do not request an external application', opened.length === 1 && await guest.executeJavaScript('document.getElementById("local-target")!==null') as boolean, opened)
    pointer(await point('unsafe'))
    await frame()
    check('local-file links never reach the OS opener', opened.length === 1, opened)

    await guest.executeJavaScript('document.getElementById("web").focus()')
    await guest.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F10', code: 'F10', modifiers: 8, windowsVirtualKeyCode: 121 })
    await guest.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F10', code: 'F10', windowsVirtualKeyCode: 121 })
    await wait(async () => (await controls()).some(control => control.visible && control.label === 'Open link'))
    await key('ArrowDown', 40)
    await key('Enter', 13)
    await wait(async () => await clipboard.readText() === 'https://example.com/document')
    check('keyboard context menu and arrow navigation can copy a link', true, {})
    await key('Escape', 27)

    // Drag across ordinary prose using actual pointer events, then use the native copy command.
    const drag = await point('select-one')
    guest.sendInputEvent({ type: 'mouseMove', x: drag.x - 10, y: drag.y })
    guest.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: drag.x - 10, y: drag.y })
    guest.sendInputEvent({ type: 'mouseMove', x: drag.x + 110, y: drag.y })
    guest.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: drag.x + 110, y: drag.y })
    const selection = await guest.executeJavaScript('getSelection().toString()') as string
    check('ordinary text remains freely selectable by dragging', selection.length > 0 && 'First selection line'.includes(selection), { selection })
    guest.copy()
    await wait(async () => await clipboard.readText() === selection)
    check('normal copy command retains plain-text selection behavior', true, {})
  } finally {
    if (previous.length > 0) await clipboard.write(previous)
    else clipboard.clear()
  }
}
