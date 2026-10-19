/** Durable parser failures preserve uncertain task state; no Session prompt or model call occurs in these cases. */
import { join } from 'node:path'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { sourceComposition } from './source-composition.ts'
import { openMobileJournal } from './durable-journal.ts'

it.each(['corrupt-json', 'invalid-record', 'foreign-version', 'wrong-key', 'missing-file'])('refuses %s without replacing the independent mobile journal', async (failure: string) => {
  const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD
  if (parent === undefined) throw new Error('Isolated integration launcher required')
  const world = join(parent, 'journal-' + failure); await mkdir(join(world, 'state'), { recursive: true })
  const value = { desktopId: 'phase3-desktop', deviceId: 'phase3-phone', sessionId: 'phase3-session', requestId: 'pending',
    fingerprint: '{}', state: failure === 'invalid-record' ? 'silently-forgotten' : 'submitting' }
  const body = failure === 'corrupt-json' ? '{ interrupted' : JSON.stringify({ unit: { name: 'harmony_mobile_lab', version: failure === 'foreign-version' ? 2 : 1 },
    global: null, tables: { admissions: { [failure === 'wrong-key' ? 'foreign/key' : 'phase3-session/pending']: value }, checkpoints: {} } })
  const file = join(world, 'state', 'harmony_mobile_lab.json')
  if (failure !== 'missing-file') await writeFile(file, body)
  const ctx = await sourceComposition(world)
  try {
    const prompt = vi.spyOn(ctx.sessionController, 'prompt')
    await expect(openMobileJournal(ctx, 128, { mode: 'reopen', root: join(world, 'state') })).rejects.toThrow()
    if (failure === 'missing-file') await expect(access(file)).rejects.toHaveProperty('code', 'ENOENT')
    else expect(await readFile(file, 'utf8')).toBe(body)
    expect(prompt).not.toHaveBeenCalled(); ctx.llm.assertZeroRealCalls()
  } finally { await ctx.fiber.dispose() }
})

it.each(['mode', 'dispatch-guard'])('refuses missing %s before source service construction', async (switchName: string) => {
  vi.stubEnv(switchName === 'mode' ? 'DSH_SNAPSHOT' : 'DSH_SNAPSHOT_REPLAY_ONLY', '')
  try { await expect(sourceComposition('unused-refused-world')).rejects.toThrow('hard-block required') }
  finally { vi.unstubAllEnvs() }
})
