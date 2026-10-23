// @vitest-environment jsdom
/** Trusted form lifecycle over the original question carrier; no generated scripts or model calls. */
import { useSyncExternalStore } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PendingQuestion, createWaterfallRequest } from '../../../client/ui-user-questions/src/client/contract/slots.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { RichQuestion } from '../src/client/RichQuestion.tsx'
import type { RichQuestionProps } from '../src/client/RichQuestion.tsx'
import { createRichQuestionDraftStore } from '../src/client/question-drafts.ts'
import { zh } from '../src/client/locales.ts'
import { RichAppearanceSource } from '../src/client/appearance.ts'

const sid = SessionId('rich-question')
const carriers = new Set<PendingQuestion>()
beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); for (const carrier of carriers) carrier.delegate(); carriers.clear() })

function harness(questions: PendingQuestion['questions'], deadline?: number) {
  const pending = new PendingQuestion(sid, questions)
  carriers.add(pending)
  const request = createWaterfallRequest(deadline, undefined, (channel) => { pending.detachWaterfall(channel) })
  pending.attachWaterfall(request.channel)
  void request.result.catch(() => {})
  const answer = vi.spyOn(pending, 'answer')
  const instance = createRichQuestionDraftStore().create(sid)
  const appearance = new RichAppearanceSource({ theme: 'cyber', accent: 'auto' })
  function Form() {
    const props = { matched: pending, actions: instance.actions,
      useQuestionCard: ((_key, selector) => selector(useSyncExternalStore(pending.subscribe, pending.getSnapshot))) as RichQuestionProps['useQuestionCard'],
      useStore: (selector => useSyncExternalStore(listener => instance.subscribe(listener),
        () => selector(instance.getSnapshot()))) as RichQuestionProps['useStore'],
      useAppearance: (selector => selector(useSyncExternalStore(appearance.subscribe, appearance.getSnapshot))) as RichQuestionProps['useAppearance'],
      t: (key => (zh as Record<string, string>)[key] ?? key) as RichQuestionProps['t'],
    }
    // The framework supplies unused Session hooks in composition; this unit fixture supplies only consumed hooks.
    return <RichQuestion {...props as RichQuestionProps} />
  }
  return { pending, answer, result: request.result, instance, appearance, Form }
}

const planQuestions: PendingQuestion['questions'] = [{ id: 'review', question: 'Review plan',
  detail: '# Original plan\n\nCheck the code.', intent: { kind: 'plan-review', approve: 'Approve' },
  options: [{ label: 'Approve' }, { label: 'Keep planning' }] }]

describe('HTML question form', () => {
  it('exposes a panel heading and separately named question groups', () => {
    const h = harness([
      { id: 'one', header: 'Implementation direction', question: 'Choose an approach', options: [{ label: 'Keep native controls' }] },
      { id: 'two', question: 'Describe the remaining issue' },
    ])
    render(<h.Form />)
    expect(screen.getByRole('heading', { level: 2, name: '需要你的回答' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Implementation direction' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Describe the remaining issue' })).toBeTruthy()
  })

  it('replaces a single choice with custom text and preserves multiple choices alongside a recovered supplement', async () => {
    const h = harness([
      { id: 'one', question: 'Choose an approach', options: [{ label: 'Native' }, { label: 'Cyber' }] },
      { id: 'many', question: 'Choose improvements', multiSelect: true, options: [{ label: 'Hierarchy' }, { label: 'Selection' }] },
    ])
    const view = render(<h.Form />)
    const single = within(screen.getByRole('group', { name: 'Choose an approach' }))
    fireEvent.click(single.getByRole('radio', { name: 'Cyber' }))
    fireEvent.change(single.getByRole('textbox'), { target: { value: '保留原生布局，配色跟随插件' } })
    expect(single.getByRole<HTMLInputElement>('radio', { name: 'Cyber' }).checked).toBe(false)
    const multiple = within(screen.getByRole('group', { name: 'Choose improvements' }))
    fireEvent.click(multiple.getByRole('checkbox', { name: 'Hierarchy' }))
    fireEvent.click(multiple.getByRole('checkbox', { name: 'Selection' }))
    fireEvent.change(multiple.getByRole('textbox'), { target: { value: '说明弱化但可读\n正文不要发光' } })
    expect(multiple.getByRole<HTMLInputElement>('checkbox', { name: 'Hierarchy' }).checked).toBe(true)
    expect(multiple.getByRole<HTMLInputElement>('checkbox', { name: 'Selection' }).checked).toBe(true)
    view.unmount()
    render(<h.Form />)
    const restored = within(screen.getByRole('group', { name: 'Choose improvements' }))
    expect(restored.getByRole<HTMLTextAreaElement>('textbox').value).toBe('说明弱化但可读\n正文不要发光')
    expect(restored.getByRole<HTMLInputElement>('checkbox', { name: 'Hierarchy' }).checked).toBe(true)
    expect(restored.getByRole<HTMLInputElement>('checkbox', { name: 'Selection' }).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '提交回答' }))
    await expect(h.result).resolves.toEqual({ answers: [
      { id: 'one', selected: [], custom: '保留原生布局，配色跟随插件' },
      { id: 'many', selected: ['Hierarchy', 'Selection'], custom: '说明弱化但可读\n正文不要发光' },
    ] })
  })

  it('follows the chosen theme and returns to native appearance without resetting an answer', async () => {
    const h = harness([{ id: 'text', question: 'Write text' }])
    const view = render(<h.Form />)
    const field = screen.getByRole<HTMLTextAreaElement>('textbox')
    const panel = view.container.querySelector<HTMLElement>('[data-rich-question]')!
    const accent = panel.style.getPropertyValue('--rich-accent')
    expect(accent).not.toBe('')
    expect(panel.getAttribute('data-rich-theme')).toBe('cyber')
    fireEvent.change(field, { target: { value: 'Keep my draft' } })
    act(() => { h.appearance.accept('ember') })
    expect(panel.style.getPropertyValue('--rich-accent')).not.toBe(accent)
    expect(panel.getAttribute('data-rich-theme')).toBe('ember')
    expect(field.value).toBe('Keep my draft')
    act(() => { h.appearance.accept('none') })
    expect(panel.style.getPropertyValue('--rich-accent')).toBe('')
    expect(panel.hasAttribute('data-rich-themed')).toBe(false)
    expect(panel.hasAttribute('data-rich-theme')).toBe(false)
    expect(screen.getByRole('textbox')).toBe(field)
    expect(field.value).toBe('Keep my draft')
    fireEvent.click(screen.getByRole('button', { name: '提交回答' }))
    await expect(h.result).resolves.toEqual({ answers: [{ id: 'text', selected: [], custom: 'Keep my draft' }] })
  })

  it('submits the original plan unchanged or preserves and submits a reviewed draft', async () => {
    const original = harness(planQuestions)
    const first = render(<original.Form />)
    fireEvent.click(screen.getByRole('button', { name: '提交并执行' }))
    await expect(original.result).resolves.toEqual({ answers: [{ id: 'review', selected: ['Approve'],
      reviewedPlan: '# Original plan\n\nCheck the code.' }] })
    first.unmount()
    const h = harness(planQuestions)
    const view = render(<h.Form />)
    const edited = '# Human-approved plan\n\nAdd the missing regression.'
    fireEvent.change(screen.getByLabelText('确认执行的计划'), { target: { value: edited } })
    view.unmount()
    render(<h.Form />)
    expect(screen.getByLabelText<HTMLTextAreaElement>('确认执行的计划').value).toBe(edited)
    const recovered = createRichQuestionDraftStore().create(sid)
    expect(recovered.getSnapshot().byRequest[h.pending.key]?.plan).toBe(edited)
    fireEvent.click(screen.getByRole('button', { name: '提交并执行' }))
    fireEvent.click(screen.getByRole('button', { name: '提交并执行' }))
    await expect(h.result).resolves.toEqual({ answers: [{ id: 'review', selected: ['Approve'], reviewedPlan: edited }] })
    expect(h.answer).toHaveBeenCalledTimes(1)
  })

  it('validates plans and submits single, multiple, text and skipped answers together', async () => {
    const bad = harness(planQuestions)
    const first = render(<bad.Form />)
    fireEvent.change(screen.getByLabelText('确认执行的计划'), { target: { value: 'no heading' } })
    fireEvent.click(screen.getByRole('button', { name: '提交并执行' }))
    expect(screen.getByRole('alert').textContent).toContain('一级标题')
    expect(bad.answer).not.toHaveBeenCalled()
    first.unmount()
    const h = harness([
      { id: 'one', question: 'Pick one', options: [{ label: 'Alpha (Recommended)' }, { label: 'Beta' }] },
      { id: 'many', question: 'Pick many', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] },
      { id: 'text', question: 'Write text' }, { id: 'skip', question: 'Optional question' },
    ])
    render(<h.Form />)
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /Alpha/ }).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Beta' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'A' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'B' }))
    fireEvent.change(screen.getAllByRole('textbox')[2]!, { target: { value: 'Keep this text' } })
    fireEvent.click(screen.getAllByRole('button', { name: '跳过此问题' })[3]!)
    fireEvent.click(screen.getByRole('button', { name: '提交回答' }))
    await expect(h.result).resolves.toEqual({ answers: [
      { id: 'one', selected: ['Beta'] }, { id: 'many', selected: ['A', 'B'] },
      { id: 'text', selected: [], custom: 'Keep this text' }, { id: 'skip', selected: [] },
    ] })
  })

  it('retains input after a channel error, pauses edited timed requests, and never submits on IME Enter', async () => {
    const h = harness([{ id: 'text', question: 'Write text' }], Date.now() + 60_000)
    const view = render(<h.Form />)
    expect(h.pending.snapshot().countdown?.running).toBe(true)
    const field = screen.getByRole('textbox')
    fireEvent.focus(field)
    expect(h.pending.snapshot().countdown?.running).toBe(false)
    fireEvent.change(field, { target: { value: 'unsent' } })
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
    expect(h.answer).not.toHaveBeenCalled()
    h.answer.mockRejectedValueOnce(new Error('Disconnected'))
    fireEvent.click(screen.getByRole('button', { name: '提交回答' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe('Disconnected') })
    expect((field as HTMLTextAreaElement).value).toBe('unsent')
    act(() => { h.pending.timeout() })
    expect(h.pending.snapshot().channel).toBe('waterfall')
    view.unmount()
    render(<h.Form />)
    fireEvent.click(screen.getByRole('button', { name: '提交回答' }))
    await expect(h.result).resolves.toEqual({ answers: [{ id: 'text', selected: [], custom: 'unsent' }] })
  })
})
