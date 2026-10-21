/** Content-aware menus live only in the isolated preload and require trusted user activation. */
import { richCopyMarkdown, richCopySelection, richCopyTarget, richCopyText } from './rich-copy-content.ts'
import { richExternalUrl } from './rich-links.ts'
import type { DesktopRichCopyLabels, DesktopRichCopyValue, DesktopRichMenuLabels } from './rich-types.ts'

/** Private affordances shared with the isolated copy buttons, never exposed through contextBridge. */
export interface RichContentActions {
  show(target: HTMLElement, x: number, y: number, focus?: boolean, returnTo?: HTMLElement): void
  dispose(): void
}

/**
 * Install selection, link and contextual actions without granting generated scripts native APIs.
 * @param labels - complete trusted localization, including content-menu labels.
 * @param write - bounded native clipboard writer.
 * @param open - allowlisted native external opener.
 * @returns private menu controls and lifecycle cleanup.
 */
export function installRichActions(labels: DesktopRichCopyLabels & { menu: DesktopRichMenuLabels },
  write: (value: DesktopRichCopyValue) => Promise<boolean>, open: (url: string) => Promise<boolean>): RichContentActions {
  const owner = document.createElement('span')
  owner.dataset.richCopyUi = ''
  const shadow = owner.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = ':host{all:initial;display:contents}[hidden]{display:none!important}.menu,.status{all:initial;box-sizing:border-box;position:fixed;inset:auto;margin:0;z-index:2147483647;background:var(--rich-surface-raised,Canvas);color:var(--rich-text,CanvasText);border:1px solid var(--rich-border,ButtonBorder);border-radius:var(--rich-radius-sm,6px);font:13px/1.5 system-ui,sans-serif}.menu{padding:4px;min-width:min(190px,calc(100vw - 16px));max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;box-shadow:0 4px 16px #0005}.address{display:block;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:5px 8px;color:var(--rich-muted,CanvasText);user-select:text}button{all:initial;box-sizing:border-box;display:block;width:100%;padding:7px 10px;border-radius:4px;font:inherit;color:inherit;cursor:pointer;text-align:start}button:hover,button:focus-visible{background:var(--rich-surface,ButtonFace);outline:1px solid var(--rich-accent,Highlight)}.status{padding:6px 10px;bottom:10px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 16px)}'
  const menu = document.createElement('div')
  menu.className = 'menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', labels.menu.more)
  menu.popover = 'manual'
  menu.hidden = true
  const status = document.createElement('span')
  status.className = 'status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.popover = 'manual'
  status.hidden = true
  shadow.append(style, menu, status)
  document.body.append(owner)
  const selectable = document.createElement('style')
  selectable.textContent = '[data-rich-content-root],[data-rich-content-root] *:not(button):not(input):not(select):not(textarea){user-select:text!important;-webkit-user-select:text!important}'
  document.head.append(selectable)
  let disposed = false
  let pending = false
  let sticky = false
  let hoverTarget: HTMLAnchorElement | undefined
  let returnFocus: HTMLElement | undefined
  let hoverTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let statusTimer: ReturnType<typeof setTimeout> | undefined
  const editable = (element: EventTarget | null): boolean => element instanceof Element
    && element.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])') !== null
  const hide = (restoreFocus = false): void => {
    clearTimeout(hoverTimer)
    clearTimeout(closeTimer)
    hoverTarget = undefined
    menu.hidePopover()
    menu.hidden = true
    hoverTimer = undefined
    closeTimer = undefined
    sticky = false
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    returnFocus = undefined
  }
  const outcome = (text: string): void => {
    if (disposed) return
    clearTimeout(statusTimer)
    if (!owner.isConnected) document.body.append(owner)
    status.textContent = text
    status.hidden = false
    status.showPopover()
    statusTimer = setTimeout(() => { status.hidePopover(); status.hidden = true }, 2400)
  }
  const copy = async (text: string): Promise<void> => {
    const ok = await write({ kind: 'text', text })
    outcome(ok ? labels.copied : labels.failed)
  }
  const openLink = async (href: string): Promise<void> => {
    if (href.startsWith('#')) {
      let id = href.slice(1)
      try { id = decodeURIComponent(id) }
      catch (_error) { /* Malformed escapes remain a literal local fragment. */ }
      const destination = document.getElementById(id)
      if (destination !== null) destination.scrollIntoView({ block: 'start' })
      else if (id === '') window.scrollTo(0, 0)
      else outcome(labels.menu.openFailed)
      return
    }
    const url = richExternalUrl(href)
    if (url === undefined) { outcome(labels.menu.openFailed); return }
    try { if (!await open(url)) outcome(labels.menu.openFailed) }
    catch (_error) { outcome(labels.menu.openFailed) }
  }
  const activate = (action: () => Promise<void> | void): void => {
    if (pending || disposed) return
    pending = true
    void Promise.resolve().then(action).catch(() => { outcome(labels.failed) }).finally(() => { pending = false })
  }
  const show = (region: HTMLElement, x: number, y: number, focus = false): void => {
    hide()
    if (disposed || !region.isConnected) return
    if (!owner.isConnected) document.body.append(owner)
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const selection = richCopySelection()
    const source = selection ?? region
    menu.replaceChildren()
    const add = (label: string, action: () => Promise<void> | void): void => {
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.textContent = label
      button.addEventListener('click', (event) => {
        if (!event.isTrusted) return
        event.preventDefault()
        event.stopPropagation()
        activate(action)
        hide(focus)
      })
      menu.append(button)
    }
    if (selection === undefined && region instanceof HTMLAnchorElement) {
      const href = region.getAttribute('href') ?? ''
      const address = document.createElement('span')
      address.className = 'address'
      address.textContent = href
      address.title = href
      menu.append(address)
      if (richExternalUrl(href) !== undefined || href.startsWith('#')) add(labels.menu.openLink, async () => { await openLink(href) })
      add(labels.menu.copyLink, async () => { await copy(href) })
    }
    const image = region instanceof HTMLImageElement ? region : region.dataset.richCopy === 'image' ? region.querySelector('img') : null
    if (selection === undefined && (image !== null || region.dataset.richCopy === 'image')) {
      add(labels.image, async () => {
        const ok = await write({ kind: 'image', data: image?.complete && image.naturalWidth > 0 ? image.currentSrc : '' })
        outcome(ok ? labels.copied : labels.failed)
      })
    } else {
      add(labels.menu.plain, async () => { await copy(richCopyText(source)) })
      add(labels.menu.markdown, async () => { await copy(richCopyMarkdown(source)) })
    }
    add(labels.menu.selectAll, () => {
      const root = document.querySelector('[data-rich-content-root]') ?? document.body
      const range = document.createRange()
      range.selectNodeContents(root)
      const selected = document.getSelection()
      selected?.removeAllRanges()
      selected?.addRange(range)
    })
    menu.hidden = false
    menu.showPopover()
    const rect = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(8, Math.min(innerWidth - rect.width - 8, x))}px`
    menu.style.top = `${Math.max(8, Math.min(innerHeight - rect.height - 8, y))}px`
    if (focus) menu.querySelector('button')?.focus({ preventScroll: true })
  }
  const context = (event: MouseEvent): void => {
    if (!event.isTrusted || editable(event.target) || !(event.target instanceof Element) || event.target.closest('[data-rich-copy-ui]')) return
    const region = richCopyTarget(event.target)
    if (region === undefined) return
    event.preventDefault()
    event.stopImmediatePropagation()
    show(region, event.clientX, event.clientY, true)
    sticky = true
  }
  const pointer = (event: PointerEvent): void => {
    if (!event.isTrusted || event.buttons !== 0 || sticky) return
    if (event.target === owner || event.target instanceof Element && event.target.closest('[data-rich-copy-ui]')) {
      clearTimeout(closeTimer)
      closeTimer = undefined
      return
    }
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
    if (link !== null && richCopyTarget(link) === link) {
      clearTimeout(closeTimer)
      closeTimer = undefined
      if (hoverTarget === link) return
      clearTimeout(hoverTimer)
      hoverTarget = link
      hoverTimer = setTimeout(() => {
        if (!link.isConnected || disposed || document.getSelection()?.isCollapsed === false) return
        const rect = link.getBoundingClientRect()
        show(link, rect.left, rect.bottom + 5)
        hoverTarget = link
      }, 450)
    } else {
      clearTimeout(hoverTimer)
      hoverTarget = undefined
      if (!menu.hidden && closeTimer === undefined) closeTimer = setTimeout(() => { closeTimer = undefined; hide() }, 180)
    }
  }
  const clickLink = (event: MouseEvent): void => {
    if (!(event.target instanceof Element) || !(event.button === 0 || event.type === 'auxclick' && event.button === 1)) return
    const link = event.target.closest<HTMLAnchorElement>('a[href]')
    if (link === null || editable(link)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!event.isTrusted || event.detail !== 0 && document.getSelection()?.isCollapsed === false) return
    const href = link.getAttribute('href') ?? ''
    hide()
    activate(async () => { await openLink(href) })
  }
  const down = (event: PointerEvent): void => {
    if (event.target === owner || event.target instanceof Element && event.target.closest('[data-rich-copy-ui]')) return
    hide()
  }
  const key = (event: KeyboardEvent): void => {
    if (!event.isTrusted || editable(event.target)) return
    if (event.key === 'Escape') { hide(true); return }
    if ((event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') && event.target instanceof Element) {
      const region = richCopyTarget(event.target) ?? document.querySelector<HTMLElement>('[data-rich-content-root]')
      if (region === null) return
      event.preventDefault()
      const rect = region.getBoundingClientRect()
      show(region, rect.left + 8, rect.top + 8, true)
      sticky = true
    }
  }
  menu.addEventListener('pointerdown', (event) => { event.preventDefault() })
  menu.addEventListener('keydown', (event) => {
    if (!event.isTrusted) return
    const buttons = Array.from(menu.querySelectorAll('button'))
    const index = buttons.findIndex(button => button === shadow.activeElement)
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
      buttons[next]?.focus()
    }
    if (event.key === 'Tab') hide()
  })
  const selectionCopy = (event: ClipboardEvent): void => {
    if (!event.isTrusted || editable(event.target) || event.clipboardData === null) return
    const selected = richCopySelection()
    if (selected === undefined) return
    event.preventDefault()
    event.stopImmediatePropagation()
    event.clipboardData.setData('text/plain', richCopyText(selected))
  }
  const blur = (): void => { hide() }
  const scroll = (event: Event): void => { if (event.target !== owner && !menu.hidden) hide() }
  const events = new AbortController()
  const options = { capture: true, signal: events.signal }
  window.addEventListener('click', clickLink, options)
  window.addEventListener('auxclick', clickLink, options)
  window.addEventListener('contextmenu', context, options)
  window.addEventListener('pointermove', pointer, options)
  window.addEventListener('pointerdown', down, options)
  window.addEventListener('keydown', key, options)
  window.addEventListener('copy', selectionCopy, options)
  window.addEventListener('blur', blur, { signal: events.signal })
  window.addEventListener('scroll', scroll, options)
  window.addEventListener('resize', blur, options)
  return {
    show: (region, x, y, focus = false, returnTo) => {
      show(region, x, y, focus)
      if (returnTo !== undefined) returnFocus = returnTo
      sticky = true
    },
    dispose: () => {
      disposed = true
      hide()
      clearTimeout(statusTimer)
      events.abort()
      status.hidePopover()
      owner.remove()
      selectable.remove()
    },
  }
}
