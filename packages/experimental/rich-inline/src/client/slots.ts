/** Private injection seat; components receive values and callbacks, never Cordis context. */
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { RichBlockId, RichActionId } from '../shared/types.ts'
import type { BlockView } from './controller.ts'
import type { MessagePart } from './markers.ts'
import type {} from './locales.ts'
import type { RichAppearance } from '../shared/theme.ts'

/** Actions are scoped by the trusted Session injection factory. */
export interface RichInjected {
  /** Modes whose settled ordinary prose may receive the compatibility view; saved rich blocks remain viewable. */
  activePresets: readonly string[]
  hooks: { /** Profile appearance; follows the profile theme without remounting messages. */ appearance: HostObservable<RichAppearance> }
  keyedHooks: { /** One immutable view per message/block key. */ rich: (key: string) => HostObservable<BlockView> }
  /** @param key - private view key. @param messageId - durable owner. @param blockId - marker. @returns cleanup. */
  open(key: string, messageId: MessageId, blockId: RichBlockId): () => void
  /** @param key - private view key. */ close(key: string): Promise<void>
  /** @param key - private view key. @param file - trusted host file picker selection. */ addFile(key: string, file: File): Promise<void>
  /** @param key - private view key. @param discardDraft - explicit trusted archive choice. */
  update(key: string, discardDraft: boolean): Promise<void>
  /** @param key - private view key. @param actionId - Host-published action. */ cancel(key: string, actionId: RichActionId): Promise<void>
}
/** Whole original text block with rich markers and ordinary prose in source order. */
export type RichMessageProps = PropsRuntime<'conversation.chat.assistant-block'> & PropsLocale<'richInline'>
  & InjectFace<RichInjected> & { matched: readonly MessagePart[] }
