/** Legacy persona migration preserves required directory context in admitted requests. */
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { PERSONA_SUFFIX_SECTION } from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-working-directory'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import type {} from '../../../core/agent-loop/src/runtime-context.ts'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { describe, expect, it } from 'vitest'

describe('legacy cwd persona migration', () => {
  it.each([false,true])('preserves dynamic directory requests with optional context=%s', async (optional) => {
    const root = await realpath(await mkdtemp(join(tmpdir(),'dsh-persona-cwd-')))
    const selected = join(root,'selected-{{cwd}}-{{dshHome}}')
    await mkdir(selected)
    const ctx = new Context()
    try {
      await mountAgentLoopTestDependencies(ctx,{ workingDirectory:true,systemPrompt:{ includeHarnessIdentity:false,includeRuntimeContext:optional,personaPrefix:'Keep personalized guidance. Model {{model}}.' } })
      const adapter = new MockAdapter([textResponse('first reply'),textResponse('second reply')])
      ctx.llm.registerAdapter(['mock'],adapter)
      const harness = await mountAgentLoopTestHarness(ctx)
      const agent = await harness.create(SessionId('persona-cwd-migration'),{ provider:'mock',model:'mock' },{ cwd:root })
      let suffix = 'Your working directory is {{cwd}}.'
      agent.ctx.systemPrompt.section({ name:PERSONA_SUFFIX_SECTION,order:ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX'),text:()=>suffix })
      const input = () => createUserMessage({ content:[{ type:'text',text:'Read the active project.' }],source:{ kind:'user' } })
      agent.followup(input())
      await agent.whenIdle()
      expect(adapter.requests).toHaveLength(0)
      const failed = agent.session.snapshotEvents().findLast(event=>event.type === 'turn/end')
      expect(failed?.data.reason.kind).toBe('error')
      expect(JSON.stringify(failed)).toContain('unknown prompt variable')
      expect(JSON.stringify(failed)).toContain('{{cwd}}')
      suffix = ''
      agent.followup(input())
      await agent.whenIdle()
      expect(adapter.requests).toHaveLength(1)
      const directoryText = (index:number) => adapter.requests[index]!.messages.findLast(message=>message.role === 'user' && message.source?.kind === 'runtime-context')!.content.flatMap(block=>block.type === 'text' ? [block.text] : []).join('\n')
      const systemText = (index:number) => adapter.requests[index]!.messages.filter(message=>message.role === 'system').flatMap(message=>message.content).flatMap(block=>block.type === 'text' ? [block.text] : []).join('\n')
      expect(systemText(0)).toBe('Keep personalized guidance. Model mock.')
      expect(directoryText(0)).toContain(`Current working directory: ${JSON.stringify(root)}.`)
      await ctx.workingDirectory.set(agent,selected)
      agent.followup(input())
      await agent.whenIdle()
      expect(adapter.requests).toHaveLength(2)
      expect(systemText(1)).toBe(systemText(0))
      expect(directoryText(1)).toContain(`Current working directory: ${JSON.stringify(selected)}.`)
      expect(directoryText(1)).not.toContain(`Current working directory: ${JSON.stringify(root)}.`)
      expect(agent.session.header.cwd).toBe(root)
      expect(ctx.workingDirectory.get(agent.session)).toBe(selected)
      expect(agent.session.snapshotEvents().findLast(event=>event.type === 'turn/end')?.data.reason.kind).toBe('completed')
    } finally {
      await ctx.fiber.dispose()
      expect(root.startsWith(join(tmpdir(),'dsh-persona-cwd-'))).toBe(true)
      await rm(root,{ recursive:true,force:true })
    }
  })
})
