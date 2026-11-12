/** Compact transcript for the native chat. The wire journal retains all message parts. */
import type { MessageView } from './semantic-phone.ts'

interface NativeChatRow {
  readonly id: string
  readonly role: string
  readonly text: string
  readonly processKey?: string
  readonly processText?: string
  readonly richPending?: boolean
}

function textOf(message: MessageView): string {
  return message.parts.flatMap(part => part.kind === 'text' ? [part.text] : []).join('\n')
}

function assistantRow(group: readonly MessageView[], mountedMessageId: string | undefined): NativeChatRow {
  let rich: MessageView | undefined
  let plain: MessageView | undefined
  for (const message of group) {
    if (message.rich.length > 0) rich = message
    else if (!message.parts.some(part => part.kind === 'tool-call') && textOf(message).trim() !== '') plain = message
  }
  const answer = rich ?? plain
  const last = group[group.length - 1]!
  const processText = group.flatMap(message => message.parts.flatMap(part =>
    part.kind === 'reasoning' || (part.kind === 'text' && (message !== answer || rich !== undefined)) ? [part.text] : [],
  )).filter(text => text.trim() !== '').join('\n\n')
  const fallback = rich?.rich.flatMap(reference => reference.fallback === 'rich-block-pending' ? [] : [reference.fallback]).join('\n\n') ?? ''
  const richPending = rich !== undefined && rich.id !== mountedMessageId && fallback === ''
  const text = rich === undefined ? (answer === undefined ? '' : textOf(answer)) : rich.id === mountedMessageId ? '' : fallback
  return {
    id: (answer ?? last).id, role: 'assistant', text,
    ...(processText === '' ? {} : { processKey: last.turn === undefined ? last.id : 'turn-' + last.turn, processText }),
    ...(richPending ? { richPending: true } : {}),
  }
}

/**
 * @param messages - admitted native conversation rows in journal order.
 * @param mountedMessageId - message whose rich result already has its own native surface.
 * @returns user rows and one answer with separately revealable process text for each contiguous assistant turn.
 */
export function nativeChatRows(messages: readonly MessageView[], mountedMessageId?: string): readonly NativeChatRow[] {
  const rows: NativeChatRow[] = []
  let group: MessageView[] = []
  const finish = () => {
    if (group.length === 0) return
    rows.push(assistantRow(group, mountedMessageId))
    group = []
  }
  for (const message of messages) {
    if (message.role !== 'assistant') {
      finish()
      rows.push({ id: message.id, role: message.role, text: textOf(message) })
      continue
    }
    if (message.turn === undefined || group[0]?.turn !== message.turn) finish()
    group.push(message)
  }
  finish()
  return rows
}
