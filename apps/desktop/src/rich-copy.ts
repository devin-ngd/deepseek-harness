/** Isolated-world copy controls. Only trusted activation can invoke the private clipboard writer. */
import { richCopySelection, richCopyTarget, richCopyText } from './rich-copy-content.ts'
import { installRichActions } from './rich-actions.ts'
import type { DesktopRichCopyLabels, DesktopRichCopyValue } from './rich-types.ts'

const explicitSelector = '[data-rich-copy],pre'
const automaticSelector = explicitSelector + ',img,table,blockquote,li,p,h1,h2,h3,h4,h5,h6'

/**
 * Install local copy affordances without exposing the writer to generated JavaScript.
 * @param labels - localized host-owned action and outcome labels.
 * @param write - private preload writer, called only after trusted button activation.
 * @param open - private native opener, called only after trusted link or menu activation.
 * @returns cleanup for observers, events and pending UI feedback.
 */
export function installRichCopy(labels: DesktopRichCopyLabels, write: (value: DesktopRichCopyValue) => Promise<boolean>,
  open: (url: string) => Promise<boolean>): () => void {
  const actions = labels.menu === undefined ? undefined : installRichActions({ ...labels, menu: labels.menu }, write, open)
  const selector = actions === undefined ? explicitSelector : automaticSelector
  const entries = new Map<HTMLElement, {
    host: HTMLElement
    root: ShadowRoot
    button: HTMLButtonElement
    tip: HTMLElement
    more?: HTMLButtonElement
  }>()
  let active: HTMLElement | undefined
  let disposed = false
  let pending = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let frame = 0
  const coarse = matchMedia('(hover: none)')
  const overlay = document.createElement('span')
  overlay.dataset.richCopyUi = ''
  const shadow = overlay.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = ':host{all:initial;display:contents}button{all:initial;box-sizing:border-box;position:fixed;inset:auto;margin:0;z-index:2147483646;width:28px;height:28px;display:grid;place-items:center;border-radius:5px;background:var(--rich-surface-raised,Canvas);color:var(--rich-muted,CanvasText);cursor:pointer;opacity:0;pointer-events:none}button[data-visible]{opacity:1;pointer-events:auto}button:hover{color:var(--rich-text-strong,CanvasText)}button:focus-visible{outline:2px solid var(--rich-accent,Highlight);outline-offset:2px}svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.tip,.status{position:fixed;inset:auto;margin:0;z-index:2147483647;max-width:calc(100vw - 16px);padding:5px 8px;border:1px solid var(--rich-border,ButtonBorder);border-radius:5px;background:var(--rich-surface-raised,Canvas);color:var(--rich-text,CanvasText);font:13px/1.5 system-ui,sans-serif;pointer-events:none}.tip{display:none}.tip[data-visible]{display:block}.status{bottom:10px;left:50%;transform:translateX(-50%)}[hidden]{display:none!important}@media(hover:none){button{width:44px;height:44px}}'
  shadow.append(style)
  const status = document.createElement('span')
  status.className = 'status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.popover = 'manual'
  status.hidden = true
  shadow.append(status)
  document.body.append(overlay)

  const allowed = (target: HTMLElement): boolean => !target.closest('[data-rich-copy="off"],[data-rich-copy-ignore],[aria-hidden="true"],[hidden],[inert]')
    && getComputedStyle(target).visibility === 'visible' && target.getClientRects().length > 0
  const isImage = (target: HTMLElement): boolean => target instanceof HTMLImageElement || target.dataset.richCopy === 'image'
  const imageOf = (target: HTMLElement): HTMLImageElement | null => target instanceof HTMLImageElement ? target
    : target.dataset.richCopy === 'image' ? target.querySelector('img') : null
  const layout = (): void => {
    frame = 0
    for (const [target, entry] of entries) {
      if (!coarse.matches && active !== target && entry.root.activeElement !== entry.button && entry.root.activeElement !== entry.more) {
        entry.button.removeAttribute('data-visible')
        entry.more?.removeAttribute('data-visible')
        continue
      }
      const rect = target.getBoundingClientRect(), size = coarse.matches ? 44 : 28
      const focus = entry.root.activeElement === entry.button
      const onscreen = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth
      const visible = allowed(target) && onscreen && (active === target || focus || coarse.matches && !target.querySelector(selector))
      entry.button.toggleAttribute('data-visible', visible)
      entry.button.disabled = !allowed(target)
      const label = isImage(target) ? labels.image
        : target instanceof HTMLAnchorElement && labels.menu !== undefined ? labels.menu.copyLink : labels.text
      entry.button.setAttribute('aria-label', label)
      entry.tip.textContent = label
      entry.button.style.left = `${Math.max(2, Math.min(innerWidth - size - 2, rect.right - size - 4))}px`
      entry.button.style.top = `${Math.max(2, Math.min(innerHeight - size - 2, rect.top + 4))}px`
      if (entry.more !== undefined) {
        entry.more.toggleAttribute('data-visible', visible || entry.root.activeElement === entry.more)
        entry.more.disabled = !allowed(target)
        entry.more.style.left = `${Math.max(2, Math.min(innerWidth - size * 2 - 6, rect.right - size * 2 - 8))}px`
        entry.more.style.top = entry.button.style.top
      }
      entry.tip.style.right = `${Math.max(8, innerWidth - rect.right + 4)}px`
      entry.tip.style.top = `${Math.max(4, Math.min(innerHeight - entry.tip.getBoundingClientRect().height - 4, rect.top + size + 8))}px`
    }
  }
  const schedule = (): void => { if (!disposed && frame === 0) frame = requestAnimationFrame(layout) }
  const showOutcome = (ok: boolean): void => {
    if (disposed) return
    clearTimeout(timer)
    status.textContent = ok ? labels.copied : labels.failed
    status.hidden = false
    status.showPopover()
    timer = setTimeout(() => { status.hidePopover(); status.hidden = true }, 1800)
  }
  const scan = (): void => {
    if (disposed) return
    if (!overlay.isConnected) document.body.append(overlay)
    for (const [target, entry] of entries) {
      if (!target.isConnected || !target.matches(selector) || actions !== undefined && richCopyTarget(target) !== target) {
        entry.host.remove()
        entries.delete(target)
      }
      else if (!entry.host.isConnected) { target.before(entry.host); entry.button.showPopover() }
    }
    for (const target of document.querySelectorAll<HTMLElement>(selector)) {
      if (entries.has(target) || target.dataset.richCopy === 'off' || target.closest('[data-rich-copy="off"]')
        || actions !== undefined && richCopyTarget(target) !== target) continue
      const host = document.createElement('span')
      host.dataset.richCopyUi = ''
      const root = host.attachShadow({ mode: 'closed' })
      root.append(style.cloneNode(true))
      target.before(host)
      const button = document.createElement('button')
      button.type = 'button'
      // The top layer avoids clipping by generated overflow and transformed ancestors.
      button.popover = 'manual'
      button.setAttribute('aria-label', isImage(target) ? labels.image : labels.text)
      // IconCopyOutlineRegular artwork; the isolated preload cannot mount the React primitive.
      button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.52075" y="4.07373" width="10.3932" height="10.3932" rx="2" stroke-width="1"></rect><path stroke="none" fill="currentColor" d="M11.9792 1.53296C13.36 1.53296 14.4792 2.65225 14.4792 4.03296V9.42847C14.4792 10.3756 13.9521 11.1987 13.1755 11.6228V10.3298C13.3652 10.0787 13.4792 9.7674 13.4792 9.42847V4.03296C13.4792 3.20453 12.8077 2.53296 11.9792 2.53296H6.58374C6.27966 2.53301 5.99684 2.6235 5.7605 2.77905H4.42358C4.85652 2.03463 5.66056 1.53304 6.58374 1.53296H11.9792Z"></path></svg>'
      const tip = document.createElement('span')
      tip.className = 'tip'
      tip.textContent = button.getAttribute('aria-label')
      tip.setAttribute('role', 'tooltip')
      tip.id = 'copy-tip'
      tip.popover = 'manual'
      button.setAttribute('aria-describedby', tip.id)
      root.append(button, tip)
      button.showPopover()
      let more: HTMLButtonElement | undefined
      if (actions !== undefined && labels.menu !== undefined) {
        more = document.createElement('button')
        more.type = 'button'
        more.popover = 'manual'
        more.textContent = '⋯'
        more.setAttribute('aria-label', labels.menu.more)
        more.setAttribute('aria-haspopup', 'menu')
        root.append(more)
        more.showPopover()
        more.addEventListener('pointerdown', (event) => { event.preventDefault() })
        more.addEventListener('focus', () => { active = target; schedule() })
        more.addEventListener('blur', schedule)
        more.addEventListener('click', (event) => {
          if (!event.isTrusted || disposed || !allowed(target)) return
          event.preventDefault()
          event.stopPropagation()
          const rect = button.getBoundingClientRect()
          actions.show(target, rect.left, rect.bottom + 4, event.detail === 0, more)
        })
      }
      entries.set(target, { host, root, button, tip, ...more === undefined ? {} : { more } })
      const tooltip = (visible: boolean): void => {
        tip.toggleAttribute('data-visible', visible)
        if (visible) tip.showPopover()
        else tip.hidePopover()
        schedule()
      }
      button.addEventListener('focus', () => { target.scrollIntoView({ block: 'nearest' }); active = target; tooltip(true) })
      button.addEventListener('blur', () => { tooltip(false) })
      button.addEventListener('pointerenter', () => { active = target; tooltip(true) })
      button.addEventListener('pointerleave', () => { tooltip(false) })
      button.addEventListener('pointerdown', (event) => { event.preventDefault() })
      button.addEventListener('click', (event) => {
        if (!event.isTrusted || pending || disposed || !allowed(target)) return
        event.preventDefault()
        event.stopPropagation()
        const image = imageOf(target)
        const selection = richCopySelection()
        const value: DesktopRichCopyValue = selection !== undefined ? { kind: 'text', text: richCopyText(selection) } : isImage(target)
          ? { kind: 'image', data: image !== null && image.complete && image.naturalWidth > 0 ? image.currentSrc : '' }
          : { kind: 'text', text: target instanceof HTMLAnchorElement ? target.getAttribute('href') ?? '' : richCopyText(target) }
        pending = true
        void write(value).then(showOutcome, () => { showOutcome(false) }).finally(() => { pending = false })
      })
    }
    schedule()
  }
  const pointer = (event: PointerEvent): void => {
    if (event.target instanceof HTMLElement && event.target.hasAttribute('data-rich-copy-ui')) return
    if (event.target instanceof Element) {
      active = actions === undefined ? event.target.closest<HTMLElement>(selector) ?? undefined : richCopyTarget(event.target)
    } else active = undefined
    if (active !== undefined && !entries.has(active)) active = undefined
    schedule()
  }
  const leave = (): void => { active = undefined; schedule() }
  const dismiss = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    for (const { tip } of entries.values()) { tip.removeAttribute('data-visible'); tip.hidePopover() }
    status.hidePopover()
    status.hidden = true
  }
  const observer = new MutationObserver(scan)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-rich-copy', 'data-rich-copy-ignore', 'aria-hidden', 'hidden', 'style', 'class', 'inert', 'src', 'href'] })
  const resize = new ResizeObserver(schedule)
  resize.observe(document.body)
  document.addEventListener('pointermove', pointer, true)
  document.addEventListener('pointerleave', leave)
  document.addEventListener('keydown', dismiss, true)
  window.addEventListener('scroll', schedule, true)
  window.addEventListener('resize', schedule)
  coarse.addEventListener('change', schedule)
  scan()
  return () => {
    disposed = true
    actions?.dispose()
    observer.disconnect()
    resize.disconnect()
    cancelAnimationFrame(frame)
    clearTimeout(timer)
    document.removeEventListener('pointermove', pointer, true)
    document.removeEventListener('pointerleave', leave)
    document.removeEventListener('keydown', dismiss, true)
    window.removeEventListener('scroll', schedule, true)
    window.removeEventListener('resize', schedule)
    coarse.removeEventListener('change', schedule)
    for (const entry of entries.values()) entry.host.remove()
    entries.clear()
    overlay.remove()
  }
}
