/** Trusted HTML forms settle the original question channel; no generated page authorizes tools. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PendingQuestion } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { AskUserQuestionAnswerItem } from '@deepseek-ai/dsh-user-questions/types'
import { richPaletteProperties } from '../shared/theme.ts'
import type { RichAppearance } from '../shared/theme.ts'
import { createRichQuestionDraftStore, restoreRichQuestionDraft } from './question-drafts.ts'
import type { RichQuestionDraft } from './question-drafts.ts'
import css from './RichQuestion.module.css'

/** Shared theme observation; the pending carrier owns answer, focus and wait operations. */
export interface RichQuestionInjected {
  hooks: { appearance: HostObservable<RichAppearance> }
  keyedHooks: { questionCard: (key: string) => PendingQuestion | undefined }
}
/** HTML-form props derived from the question extension and Session store. */
export type RichQuestionProps = PropsRuntime<'conversation.composer'> & PropsLocale<'richInline'>
  & { matched: PendingQuestion }
  & PropsStore<ReturnType<typeof createRichQuestionDraftStore>> & InjectFace<RichQuestionInjected>

const REMOVED_CARD: ReturnType<PendingQuestion['getSnapshot']> = {
  state: 'open', waitState: 'counting', countdown: undefined, channel: 'none', closed: true,
}

type PlanQuestion = PendingQuestion['questions'][number]
  & Required<Pick<PendingQuestion['questions'][number], 'detail' | 'intent'>>

function parseRecommendedLabel(label: string): { label: string; recommended: boolean } {
  const suffix = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i
  return suffix.test(label)
    ? { label: label.replace(suffix, ''), recommended: true }
    : { label, recommended: false }
}

/** Render the original pending question as a trusted HTML form.
 * @param props - original pending request and its current channel state.
 * @returns editable plan or question form.
 */
export function RichQuestion(props: RichQuestionProps) {
  const { matched: pending, useQuestionCard, useStore, actions, useAppearance, t } = props
  const card = useQuestionCard(pending.key, snapshot => snapshot ?? REMOVED_CARD)
  const appearance = useAppearance(value => value)
  // The carrier's plan-review discriminator guarantees one question with detail and an approval intent.
  const review = pending.kind === 'plan-review' ? pending.questions[0] as PlanQuestion : undefined
  const decline = review?.options?.find(option => option.label !== review.intent.approve)
  const signature = JSON.stringify(pending.questions)
  const initial = useMemo<RichQuestionDraft>(() => ({ signature, plan: review?.detail ?? '',
    answers: pending.questions.map((question) => {
      const recorded = pending.review?.find(answer => answer.id === question.id)
      const first = question.options?.[0]?.label
      const selected = recorded?.selected ?? (first !== undefined && parseRecommendedLabel(first).recommended ? [first] : [])
      return { id: question.id, selected,
        custom: recorded?.custom ?? '', skipped: false }
    }),
  }), [pending, signature, review?.detail])
  const saved = useStore(state => state.byRequest[pending.key])
  const draft = useMemo(() => restoreRichQuestionDraft(saved, signature, pending.questions.map(question => question.id)) ?? initial,
    [saved, signature, pending.questions, initial])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sentVia = useRef<'waterfall' | 'rpc' | null>(null)
  const inFlight = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const readOnly = pending.review !== undefined
  const locked = busy || readOnly || card.channel === 'none'
  const plan = readOnly ? pending.review.find(answer => answer.id === review?.id)?.reviewedPlan ?? draft.plan : draft.plan
  const style = appearance.theme === 'none' ? undefined : richPaletteProperties(appearance) as CSSProperties

  useEffect(() => { actions.prune(pending.liveKeys()) }, [actions, pending])
  useEffect(() => { if (!readOnly && draft !== initial) pending.engage() }, [pending, draft, initial, readOnly])
  useEffect(() => {
    if (card.closed) actions.prune(pending.liveKeys().filter(key => key !== pending.key))
    if (sentVia.current === 'waterfall' && card.state === 'continued') {
      sentVia.current = null
      inFlight.current = false
      setBusy(false)
      setError(t('questionResubmit'))
    }
  }, [actions, card.closed, card.state, pending, t])
  useEffect(() => {
    const release = () => { pending.releaseFocus() }
    const refocus = () => { if (form.current?.contains(document.activeElement)) pending.holdFocus() }
    const visibility = () => { if (document.hidden) release(); else refocus() }
    window.addEventListener('blur', release)
    window.addEventListener('focus', refocus)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('blur', release)
      window.removeEventListener('focus', refocus)
      document.removeEventListener('visibilitychange', visibility)
      release()
    }
  }, [pending])

  const markdownLabels = { code: { copyLabel: t('copy'), copiedLabel: t('copied'), toolbarLabels: {
    codeLabel: t('code'), wrapLabel: t('wrap'), unwrapLabel: t('unwrap'),
  } }, footnotes: t('footnotes') }
  const edit = (value: RichQuestionDraft): void => {
    pending.engage()
    actions.save(pending.key, value)
    setError(null)
  }
  const updateAnswer = (index: number, update: (answer: RichQuestionDraft['answers'][number]) => RichQuestionDraft['answers'][number]): void => {
    edit({ ...draft, answers: draft.answers.map((answer, at) => at === index ? update(answer) : answer) })
  }
  const send = (answers: AskUserQuestionAnswerItem[]): void => {
    if (locked || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    const channel = card.channel
    sentVia.current = channel
    void pending.answer({ answers }).then(() => {
      if (channel === 'rpc') return pending.dismiss()
      return undefined
    }).catch((cause: unknown) => {
      sentVia.current = null
      inFlight.current = false
      setBusy(false)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }
  const submit = (): void => {
    if (review !== undefined) {
      if (!/^#\s+\S/u.test(plan.trim())) { setError(t('questionPlanInvalid')); return }
      send([{ id: review.id, selected: [review.intent.approve], reviewedPlan: plan }])
      return
    }
    if (draft.answers.some(answer => answer.selected.length === 0 && !answer.custom.trim() && !answer.skipped)) {
      setError(t('questionIncomplete'))
      return
    }
    send(draft.answers.map(({ id, selected, custom }) => ({ id, selected,
      ...(custom.trim() ? { custom } : {}) })))
  }

  return <div className={css.frame}><section className={css.root} style={style} data-rich-question={pending.key}
    data-rich-themed={style === undefined ? undefined : true}
    data-rich-theme={style === undefined ? undefined : appearance.theme} aria-busy={busy}>
    <header className={css.header}>
      <h2 className={css.panelTitle}>{t(review === undefined ? 'questionTitle' : 'questionPlanTitle')}</h2>
      <span className={css.status}>{readOnly ? t('questionRecorded') : busy ? t('questionSending') : t('questionWaiting')}</span>
    </header>
    <form ref={form} onSubmit={(event) => { event.preventDefault(); submit() }}
      onFocus={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) pending.holdFocus() }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) pending.releaseFocus() }}>
      {review !== undefined ? <div className={css.plan}>
        <label htmlFor={`${pending.key}-plan`}>{t('questionPlanLabel')}</label>
        <textarea id={`${pending.key}-plan`} value={plan} rows={10} disabled={locked}
          onChange={(event) => { edit({ ...draft, plan: event.currentTarget.value }) }} />
        <details><summary>{t('questionPlanPreview')}</summary><MarkdownText text={plan} labels={markdownLabels} /></details>
        <label htmlFor={`${pending.key}-feedback`}>{t('questionFeedback')}</label>
        <textarea id={`${pending.key}-feedback`} rows={2} value={draft.answers[0]?.custom ?? ''} disabled={locked}
          onChange={(event) => { const custom = event.currentTarget.value; updateAnswer(0, current => ({ ...current, custom })) }} />
      </div> : pending.questions.map((question, index) => {
        const answer = draft.answers[index]
        if (answer === undefined) return null
        return <fieldset key={question.id} className={css.question} disabled={locked}>
          <legend className={css.questionTitle}><span className={css.questionNumber} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{question.header ?? question.question}</legend>
          {question.header !== undefined && <p className={css.prompt}>{question.question}</p>}
          {question.detail !== undefined && <MarkdownText text={question.detail} labels={markdownLabels} />}
          <div className={css.options}>{question.options?.map((option) => {
            const label = parseRecommendedLabel(option.label)
            return <label key={option.label} className={css.option}>
              <input type={question.multiSelect ? 'checkbox' : 'radio'} name={`${pending.key}-${question.id}`}
                checked={answer.selected.includes(option.label)} onChange={() => { updateAnswer(index, current => ({ ...current,
                  selected: question.multiSelect ? current.selected.includes(option.label)
                    ? current.selected.filter(value => value !== option.label) : [...current.selected, option.label] : [option.label],
                  custom: question.multiSelect ? current.custom : '', skipped: false })) }} />
              <span className={css.optionCopy}><span className={css.optionHeading}>
                <span className={css.optionTitle}>{label.label}</span>
                {label.recommended && <small className={css.recommended}>{t('questionRecommended')}</small>}
              </span>{option.description !== undefined && <span className={css.description}>{option.description}</span>}</span>
            </label>
          })}</div>
          <label className={css.custom}><span className={css.fieldLabel}>{t('questionText')}</span>
            <textarea rows={2} value={answer.custom} onChange={(event) => {
              const custom = event.currentTarget.value
              updateAnswer(index, current => ({ ...current, custom,
                selected: question.multiSelect ? current.selected : [], skipped: false }))
            }} />
          </label>
          {!readOnly && <div className={css.questionActions}><Button size="sm" variant="outline" disabled={locked} onClick={() => {
            updateAnswer(index, current => ({ ...current, selected: [], custom: '', skipped: true }))
          }}>{answer.skipped ? t('questionSkipped') : t('questionSkip')}</Button></div>}
        </fieldset>
      })}
      <footer className={css.footer}>
        <p role="alert" className={css.error}>{error}</p>
        <div className={css.actions}>
          {card.countdown !== undefined && !readOnly && <Button size="sm" variant="outline" disabled={busy}
            onClick={() => { pending.takeTime() }}>{t('questionTakeTime')}</Button>}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => {
            void pending.dismiss().catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)) })
          }}>{t('questionClose')}</Button>
          {!readOnly && <Button type="submit" variant="primary" disabled={locked}>
            {t(review === undefined ? 'questionSubmit' : 'questionApprove')}
          </Button>}
          {!readOnly && review !== undefined && decline !== undefined && <Button variant="outline" disabled={locked} onClick={() => {
            const custom = draft.answers[0]?.custom.trim()
            send([{ id: review.id, selected: [decline.label], ...(custom ? { custom } : {}) }])
          }}>{t('questionDecline')}</Button>}
        </div>
      </footer>
    </form>
  </section></div>
}
