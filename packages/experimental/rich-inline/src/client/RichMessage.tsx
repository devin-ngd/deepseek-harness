/** Generic guest embedded in the normal chat message flow, with trusted external controls. */
import { createElement, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import {
  Button, IconCheckCircleOutlineRegular, IconChevronRightOutlineRegular, IconCloseOutlineRegular, IconInfoOutlineRegular,
  IconLoadingOutlineRegular, IconPaperclipOutlineRegular, IconRefreshOutlineRegular, IconSparkleRegular, IconWarningOutlineRegular,
  MarkdownText, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { RichActionState, RichBlockId } from '../shared/types.ts'
import type { RichMessageProps } from './slots.ts'
import css from './RichMessage.module.css'
import { authoredBlockId, authoredContent } from '../shared/authored.ts'
import { richPaletteProperties } from '../shared/theme.ts'
import type { RichAppearance } from '../shared/theme.ts'
import { nativeRich } from './native.ts'
import { RichPreview } from './preview.ts'

type Translate = RichMessageProps['t']
type Tone = 'info' | 'warning' | 'danger' | 'positive' | 'neutral'

const ACTION_TONES: Record<RichActionState, Tone> = {
  accepted: 'info', queued: 'neutral', running: 'info', cancel_requested: 'warning',
  outcome_unknown: 'warning', completed: 'positive', failed: 'danger', cancelled: 'neutral',
}

/** Built-in dark blocks carry the guest palette so trusted controls match the content they surround. */
function usePalette(appearance: RichAppearance): CSSProperties | undefined {
  return useMemo(() => appearance.theme === 'none' ? undefined : richPaletteProperties(appearance) as CSSProperties, [appearance])
}

function Header({ t, state, live = false, busy = false, tools }: {
  t: Translate
  state?: string | undefined
  live?: boolean
  busy?: boolean
  tools: readonly ReactElement[]
}) {
  return <div className={css.header}>
    <span className={css.title}><span className={css.mark} aria-hidden="true"><IconSparkleRegular size={13}/></span><span className={css.titleText}>{t('title')}</span></span>
    {state !== undefined && <p className={css.state} role="status">
      {live && <span className={css.live} aria-hidden="true"/>}
      {busy && <IconLoadingOutlineRegular size={13} className={css.spin}/>}
      {state}
    </p>}
    {tools.length > 0 && <div className={css.tools} role="group" aria-label={t('trusted')}>{tools}</div>}
  </div>
}

function ToolButton({ label, icon, disabled = false, onClick }: {
  label: string
  icon: ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return <Tooltip label={label} side="bottom" align="end" delayMs={400} portal>
    <Button size="sm" className={css.tool} aria-label={label} disabled={disabled} onClick={onClick} icon={icon}/>
  </Tooltip>
}

function Notice({ tone, role, busy = false, group, actions, children }: {
  tone: Tone
  role: 'status' | 'alert'
  busy?: boolean
  group?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const icon = busy ? <IconLoadingOutlineRegular size={14} className={css.spin}/>
    : tone === 'positive' ? <IconCheckCircleOutlineRegular size={14}/>
      : tone === 'warning' || tone === 'danger' ? <IconWarningOutlineRegular size={14}/> : <IconInfoOutlineRegular size={14}/>
  return <div className={css.notice} data-tone={tone} role={group === undefined ? undefined : 'group'} aria-label={group}>
    <span className={css.noticeIcon} aria-hidden="true">{icon}</span>
    <p className={css.noticeText} role={role}>{children}</p>
    {actions !== undefined && <div className={css.noticeActions}>{actions}</div>}
  </div>
}

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return <details className={css.disclosure}>
    <summary><span className={css.chevron} aria-hidden="true"><IconChevronRightOutlineRegular size={14}/></span><span>{label}</span></summary>
    {children}
  </details>
}

type BlockProps = Pick<RichMessageProps, 'useRich' | 'open' | 'close' | 'addFile' | 'update' | 'cancel' | 't'>
  & { appearance: RichAppearance
    messageId: MessageId
    blockId: RichBlockId
    labels: MarkdownLabels
    legacyText?: string
    sourceText?: string
    fallbackText?: string }

function RichBlock({ messageId, blockId, useRich, open, close, addFile, update, cancel, t, appearance,
  labels, legacyText, sourceText, fallbackText }: BlockProps) {
  const key = `${messageId}|${blockId}`
  const view = useRich(key, state => state)
  const palette = usePalette(appearance)
  const input = useRef<HTMLInputElement>(null)
  const [failure, setFailure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [archiveChoice, setArchiveChoice] = useState(false)
  useEffect(() => {
    open(key, messageId, blockId)
    return () => { void close(key).catch((error: unknown) => { console.error('Rich block teardown failed', error) }) }
  }, [open, close, key, messageId, blockId])
  if (view === undefined) return null
  if (legacyText !== undefined && view.error?.includes('PLAIN_TEXT_REQUESTED')) return <MarkdownText text={legacyText} labels={labels}/>
  const reservation = view.reservation
  const incompatible = view.snapshot?.pendingManifest != null
    && view.snapshot.pendingManifest.stateSchemaVersion !== view.snapshot.draft.stateSchemaVersion
  const apply = (discard: boolean): void => {
    setBusy(true); setFailure(false)
    void update(key, discard).catch(() => { setFailure(true) }).finally(() => { setBusy(false); setArchiveChoice(false) })
  }
  const loading = view.error === null && (busy || view.snapshot === null)
  const tools: ReactElement[] = []
  if (view.supported && !view.closed) tools.push(<ToolButton key="file" label={t('file')} icon={<IconPaperclipOutlineRegular size={16}/>}
    disabled={view.snapshot === null || view.snapshot.readOnly} onClick={() => input.current?.click()}/>)
  if (view.supported && (view.closed || view.error !== null)) tools.push(<ToolButton key="reload" label={t('reload')} icon={<IconRefreshOutlineRegular size={16}/>}
    onClick={() => { setFailure(false); open(key, messageId, blockId) }}/>)
  if (view.supported && !view.closed) tools.push(<ToolButton key="close" label={t('close')} icon={<IconCloseOutlineRegular size={16}/>}
    onClick={() => { void close(key).catch(() => { setFailure(true) }) }}/>)
  const fallback = (reservation === null || view.closed || view.error !== null) && view.snapshot !== null
    ? view.snapshot.manifest.fallbackText
    : view.error !== null && view.snapshot === null ? legacyText ?? fallbackText : undefined
  return <section className={css.block} style={palette} data-rich-theme={appearance.theme} data-rich-inline-block={blockId} aria-label={t('label')}>
    <Header t={t} state={loading ? t('loading') : view.supported ? undefined : t('web')} busy={loading} tools={tools}/>
    {view.supported && !view.closed && <input ref={input} type="file" className={css.file} onChange={(event) => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (file !== undefined) void addFile(key, file).catch(() => { setFailure(true) })
    }}/>}
    {legacyText !== undefined && <Notice tone="info" role="status">{t('legacy')}</Notice>}
    {view.repairing && <Notice tone="warning" role="status" busy>{t('repairing')}</Notice>}
    {view.snapshot?.pendingManifest != null && !archiveChoice && <Notice tone="info" role="status" actions={<Button size="sm" variant="primary" disabled={busy}
      onClick={() => { if (incompatible) setArchiveChoice(true); else apply(false) }}>{t('update')}</Button>}>{t('pending')}</Notice>}
    {archiveChoice && <Notice tone="warning" role="alert" group={t('archiveWarning')} actions={<>
      <Button size="sm" variant="primary" disabled={busy} onClick={() => { apply(true) }}>{t('archive')}</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => { setArchiveChoice(false) }}>{t('keep')}</Button>
    </>}>{t('archiveWarning')}</Notice>}
    {(view.error !== null || failure) && <Notice tone="danger" role="alert">{t(view.error?.includes('TOO_LARGE') ? 'sizeError' : 'error')}</Notice>}
    {view.inputWarning && <Notice tone="warning" role="alert">{t('inputWarning')}</Notice>}
    {view.snapshot?.readOnly === true && <Notice tone="neutral" role="status">{t('readOnly')}</Notice>}
    {view.snapshot?.actions.slice(-6).map(action => <Notice key={action.actionId} tone={ACTION_TONES[action.state]} role="status" busy={!action.terminal}
      actions={!action.terminal && action.state !== 'cancel_requested' && !view.closed ? <Button size="sm" variant="outline"
        onClick={() => { void cancel(key, action.actionId).catch(() => { setFailure(true) }) }}>{t('cancel')}</Button> : undefined}>
      {t(action.state)}{action.progress === null ? '' : ` ${action.progress.done}/${action.progress.total}`}
      {action.lateAfterCancel && <span className={css.noticeMeta}>{t('lateAfterCancel')}</span>}
    </Notice>)}
    {reservation !== null && !view.closed && createElement('webview', {
      key: reservation.lease, name: reservation.lease, partition: reservation.partition, src: reservation.src,
      className: css.guest, style: { height: view.height }, 'aria-label': t('label'),
    })}
    {fallback !== undefined && <div className={css.body}><MarkdownText text={fallback} labels={labels}/></div>}
    {view.error !== null && sourceText !== undefined && <Disclosure label={t('source')}><pre>{sourceText}</pre></Disclosure>}
    {legacyText !== undefined && reservation !== null && !view.closed && <Disclosure label={t('original')}>
      <div className={css.body}><MarkdownText text={legacyText} labels={labels}/></div>
    </Disclosure>}
    {(view.snapshot?.archivedDrafts.length ?? 0) > 0 && <Disclosure label={t('archived')}>
      <pre>{JSON.stringify(view.snapshot?.archivedDrafts, null, 2)}</pre>
    </Disclosure>}
  </section>
}

function Preview({ source, stopped, t, appearance }: { source: string; stopped: boolean; t: Translate; appearance: RichAppearance }) {
  // A theme switch rebuilds the preview with the new sheet, except after the user closed it.
  const [dismissed, setDismissed] = useState<RichAppearance | null>(null)
  const styled = dismissed ?? appearance
  const preview = useMemo(() => new RichPreview(nativeRich(), styled), [styled])
  const view = useSyncExternalStore(preview.subscribe, preview.getSnapshot)
  const palette = usePalette(appearance)
  useEffect(() => {
    void preview.open()
    return () => { void preview.close().catch((error: unknown) => { console.error('Rich preview cleanup failed', error) }) }
  }, [preview])
  useEffect(() => { preview.update(source) }, [preview, source])
  const tools = view.reservation === null ? [] : [<ToolButton key="close" label={t('close')} icon={<IconCloseOutlineRegular size={16}/>} onClick={() => {
    setDismissed(styled)
    void preview.close().catch((error: unknown) => { console.error('Rich preview close failed', error) })
  }}/>]
  return <section className={css.block} style={palette} data-rich-theme={appearance.theme} data-rich-inline-preview aria-label={t('label')}>
    <Header t={t} state={t(view.closed ? 'previewClosed' : stopped ? 'incomplete' : 'preview')} live={!view.closed && !stopped} tools={tools}/>
    {view.error && <Notice tone="danger" role="alert">{t('previewError')}</Notice>}
    {view.reservation !== null && !view.error && createElement('webview', { name: view.reservation.lease,
      partition: view.reservation.partition, src: view.reservation.src, className: css.guest, style: { height: view.height }, 'aria-label': t('label') })}
    {(view.error || view.closed || nativeRich() === undefined || stopped) && <Disclosure label={t('source')}><pre>{source}</pre></Disclosure>}
  </section>
}

/** @param props - scoped owner, parsed markers and private injected verbs. @returns inline content in original order. */
export function RichMessage(props: RichMessageProps) {
  const { matched, messageId, t } = props
  const appearance = props.useAppearance(value => value)
  const labels = useMemo<MarkdownLabels>(() => ({
    code: { copyLabel: t('copy'), copiedLabel: t('copied'), toolbarLabels: { codeLabel: t('code'), wrapLabel: t('wrap'), unwrapLabel: t('unwrap') } },
    footnotes: t('footnotes'),
  }), [t])
  return <div className={css.message}>{matched.map((part, index) => {
    if (part.kind === 'text') return <MarkdownText key={`prose-${index}`} text={part.text} labels={labels}/>
    if (part.kind === 'rich') return messageId === undefined ? null
      : <RichBlock key={part.blockId} {...props} appearance={appearance} messageId={messageId} blockId={part.blockId} labels={labels}/>
    if (part.kind === 'legacy') return messageId === undefined ? <MarkdownText key={index} text={part.text} labels={labels}/>
      : <RichBlock key={`legacy-${index}`} {...props} appearance={appearance} messageId={messageId} blockId={authoredBlockId(messageId, 'legacy')}
        labels={labels} legacyText={part.text}/>
    const code = part.complete ? authoredContent(part.source) : null
    if (code !== null && messageId !== undefined && !props.streaming && !props.interrupted) {
      const blockId = authoredBlockId(messageId, code.key)
      return <RichBlock key={`${blockId}-${index}`} {...props} appearance={appearance} messageId={messageId} blockId={blockId} labels={labels}
        sourceText={part.source} fallbackText={code.fallbackText}/>
    }
    return <Preview key={`preview-${index}`} source={part.source} stopped={!props.streaming} t={t} appearance={appearance}/>
  })}</div>
}
