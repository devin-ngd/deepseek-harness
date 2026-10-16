// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { ChainRenderOpts } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'
import { useRef } from 'react'
import type { AssistantBlockOwnerProps } from '../src/client/contract/slots.ts'
import { AssistantMarkdown, type AssistantMarkdownProps } from '../src/client/chat/AssistantMarkdown.tsx'
import { useDetailedPresentation } from './presentation-fixture.client.ts'
import { useDisclosure } from '../src/client/chat/use-disclosure.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const props: AssistantMarkdownProps = {
  blocks: [], streaming: false, useDisclosure, usePresentation: useDetailedPresentation,
  useGroupAction: () => useRef<HTMLDivElement>(null),
  renderSlot: (_key, _owner, options) => options?.fallback,
  loadImage: async () => '',
  t: () => 'fallback',
}
const owner = { nodeKey: 'assistant-step:1:1', messageId: 'assistant-1' as MessageId }

// One declared chain key makes this concrete fixture equivalent to the framework's generic dispatch domain.
function inlineRenderer(renderBlock: (key: 'conversation.chat.assistant-block', block: AssistantBlockOwnerProps, options?: ChainRenderOpts) => ReactNode): NonNullable<AssistantMarkdownProps['renderSlotChain']> {
  return renderBlock as NonNullable<AssistantMarkdownProps['renderSlotChain']>
}

describe('Assistant inline extension', () => {
  it('offers original indexes and durable identity while retaining declined Markdown and JSON', () => {
    const seen: AssistantBlockOwnerProps[] = []
    const renderSlotChain = inlineRenderer((_key, block, options) => {
      seen.push(block)
      return options?.fallback
    })
    const { getByRole, getByText } = render(<AssistantMarkdown {...props} blockOwner={owner} renderSlotChain={renderSlotChain}
      groupPart="response" interrupted blocks={[
        { kind: 'reasoning', text: 'hidden thought' },
        { kind: 'text', text: '**ordinary answer**' },
        { kind: 'tool-call', callId: 'tool-1', name: 'tool', argsRaw: '{}' },
        { kind: 'other', block: { field: 'unknown data' } },
      ]} />)
    expect(getByText('ordinary answer').tagName).toBe('STRONG')
    fireEvent.click(getByRole('button', { name: /fallback/u }))
    expect(getByText(/unknown data/u)).toBeDefined()
    expect(seen.map(block => block.blockIndex)).toEqual([1, 3])
    expect(seen.every(block => block.nodeKey === owner.nodeKey
      && block.messageId === owner.messageId && block.interrupted === true && !block.streaming)).toBe(true)
  })

  it('allows an inline replacement beside ordinary text without taking over reasoning', () => {
    const renderSlotChain = inlineRenderer((_key, block, options) =>
      block.block.kind === 'text' && block.block.text === 'rich block'
        ? <section aria-label="interactive block"><button>Continue</button></section>
        : options?.fallback)
    const { getByRole, getByText, queryByText } = render(<AssistantMarkdown {...props} blockOwner={owner}
      renderSlotChain={renderSlotChain} blocks={[
        { kind: 'reasoning', text: 'existing reasoning' },
        { kind: 'text', text: 'plain before' },
        { kind: 'text', text: 'rich block' },
        { kind: 'text', text: 'plain after' },
      ]} />)
    expect(getByRole('button', { name: 'Continue' })).toBeDefined()
    expect(getByText('plain before')).toBeDefined()
    expect(getByText('plain after')).toBeDefined()
    expect(queryByText('rich block')).toBeNull()
  })

  it('exposes unsettled and interrupted state so a selector can decline execution', () => {
    const seen: AssistantBlockOwnerProps[] = []
    const renderSlotChain = inlineRenderer((_key, block, options) => {
      seen.push(block)
      return block.streaming || block.interrupted === true
        ? options?.fallback
        : <button>Committed</button>
    })
    const { rerender, getByText, queryByRole } = render(<AssistantMarkdown {...props}
      blockOwner={{ nodeKey: owner.nodeKey }} renderSlotChain={renderSlotChain}
      streaming blocks={[{ kind: 'text', text: 'incomplete HTML' }]} />)
    expect(getByText('incomplete HTML')).toBeDefined()
    expect(queryByRole('button')).toBeNull()
    expect(seen[0]?.messageId).toBeUndefined()
    rerender(<AssistantMarkdown {...props} blockOwner={owner} renderSlotChain={renderSlotChain}
      interrupted blocks={[{ kind: 'text', text: 'interrupted HTML' }]} />)
    expect(getByText('interrupted HTML')).toBeDefined()
    expect(queryByRole('button')).toBeNull()
    rerender(<AssistantMarkdown {...props} blockOwner={owner} renderSlotChain={renderSlotChain}
      blocks={[{ kind: 'text', text: 'complete HTML' }]} />)
    expect(getByText('Committed')).toBeDefined()
  })
})
