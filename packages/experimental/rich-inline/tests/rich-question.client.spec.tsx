// @vitest-environment jsdom
/** Trusted form lifecycle over the original question carrier; no generated scripts or model calls. */
import { useSyncExternalStore } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PendingQuestion, createWaterfallRequest } from '../../../client/ui-user-questions/src/client/contract/slots.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { RichQuestion } from '../src/client/RichQuestion.tsx'
import type { RichQuestionProps } from '../src/client/RichQuestion.tsx'
import { createRichQuestionDraftStore } from '../src/client/question-drafts.ts'
import { zh } from '../src/client/locales.ts'

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
  function Form() {
    const card = useSyncExternalStore(pending.subscribe, pending.getSnapshot)
    const props = { pending, card, actions: instance.actions,
      useStore: (selector => useSyncExternalStore(listener => instance.subscribe(listener),
        () => selector(instance.getSnapshot()))) as RichQuestionProps['useStore'],
      useAppearance: (selector => selector({ theme: 'cyber', accent: 'auto' })) as RichQuestionProps['useAppearance'],
      t: (key => (zh as Record<string, string>)[key] ?? key) as RichQuestionProps['t'],
    }
    // The framework supplies unused Session hooks in composition; this unit fixture supplies only consumed hooks.
    return <RichQuestion {...props as RichQuestionProps} />
  }
  return { pending, answer, result: request.result, instance, Form }
}

const planQuestions: PendingQuestion['questions'] = [{ id: 'review', question: 'Review plan',
  detail: '# Original plan\n\nCheck the code.', intent: { kind: 'plan-review', approve: 'Approve' },
  options: [{ label: 'Approve' }, { label: 'Keep planning' }] }]

describe('HTML question form', () => {
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
