/**
 * Command invocations and turns keep a Session discoverable in the list;
 * configuration events alone leave a fresh draft blank.
 */

import { describe, expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import { CommandId } from '@deepseek-ai/dsh-commands/brand'
// Side-effect type imports: the configuration-event SessionEventMap merges.
import type {} from '@deepseek-ai/dsh-permission-presets'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { createSessionTestRemote, type TestSessionRemote } from './test-remote.ts'

async function harness(): Promise<{ ctx: Context; remote: TestSessionRemote; attach: (session: Session) => Promise<void> }> {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  return {
    ctx,
    remote: createSessionTestRemote(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' }),
    attach: async (session) => {
      await ctx.agents.register({ id: session.id, session, status: 'idle', ctx } as Agent)
    },
  }
}

/** Append configuration events that do not represent a submitted command or prompt. */
function appendStandalone(session: Session): void {
  session.append('plan/mode', { active: true })
  session.append('session/title', {
    title: 'standalone title', messageSeqs: [], source: { kind: 'fallback' },
  })
  // Permission configuration events from a /permission switch on a fresh session.
  session.append('permission/preset', { preset: 'danger-full-access' })
  session.append('sandbox/mode', { mode: 'danger-full-access' })
}

async function listBlank(remote: TestSessionRemote, id: string): Promise<boolean | undefined> {
  const result = await remote.list({})
  if (!result.ok) throw new Error('list failed')
  return result.value.items.find(item => item.sessionId === id)?.blank
}

describe('summary blank = no submitted command or turn', () => {
  it('configuration and title events keep the session blank', async () => {
    const { ctx, remote, attach } = await harness()
    const session = ctx.sessions.create()
    await attach(session)
    expect(await listBlank(remote, session.id)).toBe(true)
    appendStandalone(session)
    expect(await listBlank(remote, session.id)).toBe(true)
  })

  it('keeps a Session listed from command admission through a rejected result without starting a turn', async () => {
    const { ctx, remote, attach } = await harness()
    const session = ctx.sessions.create()
    await attach(session)
    session.append('command/run', {
      commandId: CommandId('blank-cmd-1'), name: 'test-command', source: { kind: 'user' },
    })
    expect(await listBlank(remote, session.id)).toBe(false)
    session.append('command/done', { commandId: CommandId('blank-cmd-1'), kind: 'error', text: 'Not approved.' })
    expect({ blank: await listBlank(remote, session.id), events: session.snapshotEvents().map(({ type, data }) => ({ type, data })) }).toMatchInlineSnapshot(`
      {
        "blank": false,
        "events": [
          {
            "data": {
              "commandId": "blank-cmd-1",
              "name": "test-command",
              "source": {
                "kind": "user",
              },
            },
            "type": "command/run",
          },
          {
            "data": {
              "commandId": "blank-cmd-1",
              "kind": "error",
              "text": "Not approved.",
            },
            "type": "command/done",
          },
        ],
      }
    `)
  })

  it('the first turn clears blank', async () => {
    const { ctx, remote, attach } = await harness()
    const session = ctx.sessions.create()
    await attach(session)
    appendStandalone(session)
    session.append('turn/start', { turn: 0 })
    expect(await listBlank(remote, session.id)).toBe(false)
  })
})
