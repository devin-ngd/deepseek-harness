/** Executes the shipped guest bootstrap in jsdom; Native transport and absent layout observation are shims.
 * These tests do not verify Electron isolation, resource policy, or Host persistence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import type { DOMWindow } from 'jsdom'
import { guestSdk } from '../src/client/guest-sdk.ts'

interface Packet {
  protocol: string
  mountId: string
  renderRevision: number
  packetId: string
  seq: number
  type: string
  payload: Record<string, unknown>
}
interface Sdk {
  getDraft(): Record<string, string>
  setDraft(next: Record<string, string>, changed?: string[]): void
  submit(values?: Record<string, string>, options?: { fileGrants: string[] }): Promise<Record<string, unknown>>
  retry(): Promise<Record<string, unknown>>
  bindForm(form: HTMLFormElement): () => void
}
const guests: JSDOM[] = []

/** Simulate readonly data crossing Electron contextBridge without claiming real native validation. */
function freezeBridgeData(value: unknown): void {
  if (typeof value !== 'object' || value === null) return
  for (const child of Object.values(value)) freezeBridgeData(child)
  Object.freeze(value)
}

function guest(fields: Record<string, string> = {}, dirty: string[] = [], packetBytes = 131072) {
  const dom = new JSDOM('<!doctype html><html><body><form><input name="name"><button>Send</button></form></body></html>', {
    url: 'https://guest.invalid/', runScripts: 'outside-only',
  })
  guests.push(dom)
  Object.defineProperty(dom.window, 'TextEncoder', { value: TextEncoder })
  const sent: Packet[] = []
  let inbound = 0
  let listener: ((packet: Packet) => void) | null = null
  Object.defineProperty(dom.window, 'richGuest', { value: {
    send(packet: Packet) { sent.push(JSON.parse(JSON.stringify(packet)) as Packet) },
    subscribe(callback: (packet: Packet) => void) { listener = callback; return () => { listener = null } },
  } })
  Object.defineProperty(dom.window, 'ResizeObserver', { value: class {
    observe(): void { /* jsdom has no layout engine. */ }
    disconnect(): void { /* No native resources were acquired. */ }
  } })
  const deliver = (type: string, payload: Record<string, unknown>, mountId = 'mount-one', renderRevision = 1) => {
    freezeBridgeData(payload)
    listener?.({ protocol: 'lumina-rich/1', mountId, renderRevision,
      packetId: `host-${++inbound}`, seq: inbound, type, payload })
  }
  const reply = (packet: Packet, revision: number, state: string | null = null) =>{  deliver('receipt', {
    requestId: packet.packetId,
    receipt: { accepted: true, code: 'ACCEPTED', draftRevision: revision,
      actionId: packet.payload.actionId ?? null, state },
  }) }
  dom.window.eval(guestSdk('mount-one', 1, packetBytes))
  const sdk = (dom.window as DOMWindow & { rich: Sdk }).rich
  deliver('init', { snapshot: {
    protocol: 'lumina-rich/1', scope: { sessionId: 'session-one', messageId: 'message-one', blockId: 'block-one', renderRevision: 1 },
    manifest: { blockId: 'block-one', renderRevision: 1, html: '', css: '', js: '', fallbackText: 'Fallback', stateSchemaVersion: 1, contentHash: 'a'.repeat(64) },
    pendingManifest: null, dataRevision: 0, values: {},
    draft: { draftRevision: 0, stateSchemaVersion: 1, fields, dirty },
    archivedDrafts: [], actions: [], files: [],
  }, theme: { mode: 'light', tokens: {}, reducedMotion: true } })
  const packets = (type: string) => sent.filter(packet => packet.type === type)
  const dispose = () =>{  deliver('dispose', {}) }
  return { dom, sdk, sent, packets, deliver, reply, dispose }
}

async function microtasks(): Promise<void> { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
afterEach(() => { for (const dom of guests.splice(0)) dom.window.close(); vi.useRealTimers() })

describe('real guest SDK input and action lifecycle', () => {
  it('reports a failed save without claiming the latest local draft was persisted', async () => {
    const g = guest()
    g.sdk.setDraft({ name: 'keep this local input' })
    g.dom.window.dispatchEvent(new g.dom.window.ErrorEvent('error', { message: 'bad code' }))
    await microtasks()
    const saved = g.packets('draft.save')[0]!
    g.deliver('receipt', { requestId: saved.packetId, error: 'DRAFT_CONFLICT' })
    await microtasks(); await microtasks()
    expect(g.sdk.getDraft()).toEqual({ name: 'keep this local input' })
    expect(g.packets('content.error')).toMatchObject([{ payload: { draftPreserved: true } }])
  })
  it('flushes unsent input before reporting one execution error and ignores repeated failures', async () => {
    const g = guest()
    g.sdk.setDraft({ name: 'latest unsent' })
    g.dom.window.dispatchEvent(new g.dom.window.ErrorEvent('error', { message: 'bad code' }))
    g.dom.window.dispatchEvent(new g.dom.window.ErrorEvent('error', { message: 'another error' }))
    await microtasks()
    expect(g.packets('content.error')).toHaveLength(0)
    const saved = g.packets('draft.save')[0]!
    expect(saved.payload.draft).toMatchObject({ fields: { name: 'latest unsent' } })
    g.reply(saved, 1)
    await microtasks(); await microtasks()
    expect(g.packets('content.error')).toMatchObject([{ payload: { message: 'bad code' } }])
  })
  it('flushes the last keystroke before acknowledging a Host update and releases input on cancellation', async () => {
    const g = guest()
    g.sdk.setDraft({ name: 'unsaved last keystroke' })
    g.deliver('prepare.update', { requestId: 'update-one' })
    await microtasks()
    expect(g.dom.window.document.body.inert).toBe(true)
    expect(g.packets('update.ready')).toHaveLength(0)
    const saved = g.packets('draft.save')[0]!
    expect(saved.payload.draft).toMatchObject({ fields: { name: 'unsaved last keystroke' } })
    g.reply(saved, 1)
    await microtasks()
    expect(g.packets('update.ready')[0]?.payload.requestId).toBe('update-one')
    g.deliver('update.cancel', {})
    expect(g.dom.window.document.body.inert).toBe(false)
  })
  it('keeps editable inputs after an autosave timeout and can save them again without terminating content', async () => {
    const g = guest()
    g.sdk.setDraft({ name: 'saved locally' })
    await vi.advanceTimersByTimeAsync(15251)
    expect(g.packets('content.error')).toHaveLength(0)
    expect(g.sdk.getDraft()).toEqual({ name: 'saved locally' })
    g.sdk.setDraft({ name: 'retry input' })
    await vi.advanceTimersByTimeAsync(251)
    const next = g.packets('draft.save').at(-1)!
    g.reply(next, 1)
    await microtasks()
    expect(next.payload.draft).toMatchObject({ fields: { name: 'retry input' } })
  })
  it('freezes submitted attachment references against caller mutation before retry', async () => {
    const g = guest()
    const grants = ['grant-original']
    const first = g.sdk.submit({ name: 'same' }, { fileGrants: grants }).catch(() => null)
    grants.push('grant-mutated-before-send')
    await microtasks()
    const original = g.packets('action.invoke')[0]!
    expect(original.payload.fileGrants).toEqual(['grant-original'])
    await vi.advanceTimersByTimeAsync(15001)
    await first
    grants.push('grant-mutated-before-retry')
    const retry = g.sdk.retry().catch(() => null)
    const next = g.packets('action.invoke')[1]!
    expect(next.payload).toEqual(original.payload)
    g.dispose()
    await retry
  })
  it('rejects an oversized UTF-8 request locally without losing draft, sequence or submission availability', async () => {
    const g = guest({}, [], 2048)
    const validations: unknown[] = []
    g.dom.window.addEventListener('rich:validation', event => validations.push((event as CustomEvent).detail))
    const large = '\u754c'.repeat(600)
    g.sdk.setDraft({ name: large })
    await expect(g.sdk.submit()).resolves.toMatchObject({ accepted: false, code: 'RICH_GUEST_PACKET_TOO_LARGE' })
    expect(g.sdk.getDraft()).toEqual({ name: large })
    expect(g.packets('action.invoke')).toHaveLength(0)
    expect(validations).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
    g.sdk.setDraft({ name: 'smaller' })
    const next = g.sdk.submit()
    await microtasks()
    const action = g.packets('action.invoke')[0]!
    expect(action.seq).toBe(g.sent.at(-2)!.seq + 1)
    expect(action.payload.values).toEqual({ name: 'smaller' })
    g.reply(action, 1, 'queued')
    await expect(next).resolves.toMatchObject({ accepted: true })
  })

  it('preserves oversized autosave fields and permits a later bounded draft save', async () => {
    const g = guest({}, [], 2048)
    g.sdk.setDraft({ name: '\u754c'.repeat(800) })
    await vi.advanceTimersByTimeAsync(251)
    expect(g.packets('draft.save')).toHaveLength(0)
    expect(g.sdk.getDraft().name).toHaveLength(800)
    expect(vi.getTimerCount()).toBe(0)
    g.sdk.setDraft({ name: 'fixed' })
    await vi.advanceTimersByTimeAsync(251)
    const saved = g.packets('draft.save')[0]!
    expect(g.packets('input.error')).toHaveLength(1)
    expect(saved.seq).toBe(3)
    g.reply(saved, 1)
    await microtasks()
  })
  it('submits the last DOM keystroke before the debounce saves a draft', async () => {
    const g = guest()
    const form = g.dom.window.document.querySelector('form')!
    const input = form.querySelector('input')!
    const unbind = g.sdk.bindForm(form)
    input.value = 'first'
    input.dispatchEvent(new g.dom.window.Event('input', { bubbles: true }))
    input.value = '最后一键Z'
    form.dispatchEvent(new g.dom.window.Event('submit', { bubbles: true, cancelable: true }))
    await microtasks()
    const action = g.packets('action.invoke')[0]!
    expect(action.payload.values).toEqual({ name: '最后一键Z' })
    expect(action.payload.draft).toMatchObject({ fields: { name: '最后一键Z' }, dirty: ['name'] })
    expect(g.packets('draft.save')).toHaveLength(0)
    g.reply(action, 1, 'queued')
    await microtasks()
    unbind()
  })

  it('coalesces two submissions while the persistence receipt is pending', async () => {
    const g = guest()
    const first = g.sdk.submit({ name: 'same' })
    const second = g.sdk.submit({ name: 'same' })
    await microtasks()
    expect(g.packets('action.invoke')).toHaveLength(1)
    g.reply(g.packets('action.invoke')[0]!, 1, 'queued')
    await expect(first).resolves.toMatchObject({ state: 'queued' })
    await expect(second).resolves.toMatchObject({ state: 'queued' })
  })

  it('keeps the logical action locked after ACK until its matching terminal result', async () => {
    const g = guest()
    const first = g.sdk.submit({ name: 'same' })
    await microtasks()
    const packet = g.packets('action.invoke')[0]!
    g.reply(packet, 1, 'queued')
    await first
    const duplicate = g.sdk.submit({ name: 'same' }).catch(() => null)
    expect(g.packets('action.invoke')).toHaveLength(1)
    g.deliver('result', { result: { actionId: packet.payload.actionId, state: 'completed', terminal: true,
      ledgerSeq: 2, values: {}, progress: null, lateAfterCancel: false } })
    await microtasks()
    const next = g.sdk.submit({ name: 'next' }).catch(() => null)
    await microtasks()
    expect(g.packets('action.invoke')).toHaveLength(2)
    g.dispose()
    await Promise.all([duplicate, next])
  })

  it('preserves the logical action identity after an ACK timeout', async () => {
    const g = guest()
    const first = g.sdk.submit({ name: 'same' }).catch(() => null)
    await microtasks()
    const actionId = g.packets('action.invoke')[0]!.payload.actionId
    await vi.advanceTimersByTimeAsync(15_001)
    await first
    const retry = g.sdk.retry().catch(() => null)
    expect(g.packets('action.invoke').every(packet => packet.payload.actionId === actionId)).toBe(true)
    g.dispose()
    await retry
  })

  it('reports busy rather than acknowledging different values with the old queued receipt', async () => {
    const g = guest()
    const first = g.sdk.submit({ name: 'first' })
    await microtasks()
    g.reply(g.packets('action.invoke')[0]!, 1, 'queued')
    await first
    const outcome = await g.sdk.submit({ name: 'changed input' }).then(
      receipt => ({ receipt, error: null }),
      (error: unknown) => ({ receipt: null, error }),
    )
    if (outcome.receipt !== null) expect(outcome.receipt).toMatchObject({ accepted: false, code: 'BUSY' })
    else expect(String(outcome.error)).toMatch(/busy|pending|unresolved/i)
    expect(g.packets('action.invoke')).toHaveLength(1)
    g.dispose()
  })

  it('releases an unresolved action only after its retry receives a definite rejection', async () => {
    const g = guest()
    const first = g.sdk.submit({ name: 'first' }).catch(() => null)
    await microtasks()
    const original = g.packets('action.invoke')[0]!
    await vi.advanceTimersByTimeAsync(15_001)
    await first
    const retry = g.sdk.retry().catch(() => null)
    const retryPacket = g.packets('action.invoke')[1]!
    g.deliver('receipt', { requestId: retryPacket.packetId,
      receipt: { accepted: false, code: 'DATA_CONFLICT', draftRevision: 1,
        actionId: original.payload.actionId, state: null } })
    await retry
    const next = g.sdk.submit({ name: 'fresh' }).catch(() => null)
    await microtasks()
    expect(g.packets('action.invoke')).toHaveLength(3)
    expect(g.packets('action.invoke')[2]!.payload.actionId).not.toBe(original.payload.actionId)
    g.dispose()
    await next
  })

  it('restores both saved fields and their dirty markers before submitting', async () => {
    const g = guest({ name: 'persisted edit' }, ['name'])
    expect(g.sdk.getDraft()).toEqual({ name: 'persisted edit' })
    const submission = g.sdk.submit().catch(() => null)
    await microtasks()
    expect(g.packets('action.invoke')[0]!.payload.draft).toMatchObject({ fields: { name: 'persisted edit' }, dirty: ['name'] })
    g.dispose()
    await submission
  })

  it('waits for an in-flight draft CAS before sending the complete last-keystroke action', async () => {
    const g = guest()
    g.sdk.setDraft({ name: 'before' })
    await vi.advanceTimersByTimeAsync(251)
    const saved = g.packets('draft.save')[0]!
    g.sdk.setDraft({ name: '最后一键Z' })
    const submission = g.sdk.submit({ name: '最后一键Z' }).catch(() => null)
    expect(g.packets('action.invoke')).toHaveLength(0)
    g.reply(saved, 1)
    await microtasks()
    const action = g.packets('action.invoke')[0]!
    expect(action.payload.draft).toMatchObject({ baseRevision: 1, fields: { name: '最后一键Z' } })
    g.reply(action, 2, 'queued')
    await submission
  })

  it('ignores another mount and another render revision when restoring state', () => {
    const g = guest({ name: 'mine' }, ['name'])
    g.deliver('snapshot', { snapshot: { draft: { fields: { name: 'changed' } } } }, 'mount-other')
    g.deliver('snapshot', { snapshot: { draft: { fields: { name: 'changed' } } } }, 'mount-one', 2)
    expect(g.sdk.getDraft()).toEqual({ name: 'mine' })
  })
})
