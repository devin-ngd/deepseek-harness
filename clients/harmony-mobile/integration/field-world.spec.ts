/** Stable-world parser/ownership refusals use only new synthetic directories; no Agent, identity or network is activated. */
import { it, expect, vi } from 'vitest'
import { mkdir, readFile, writeFile, symlink, access } from 'node:fs/promises'
import { join } from 'node:path'
import { FieldWorldOwner } from '../replay-profile/src/field-world.ts'
import { id } from '../src/protocol.ts'
import { fieldProfile, fieldSession } from '../src/first-use-protocol.ts'
import { resolveFieldConfig } from '../replay-profile/src/field-config.ts'
import { sourceComposition } from './source-composition.ts'
import { installFourResponses, fixedReplayPosition } from './replay-host.ts'

const base = { desktopId: id<'mobile-desktop'>('world-fixture-desktop'), identityAlias: 'fixture-desktop', assetsSha256: '0'.repeat(64), maxAdmissionRecords: 8, lockWaitMs: 1000 }
function path(name: string): string { const root = process.env.DSH_HARMONY_INTEGRATION_WORLD; if (!root) throw new Error('isolated world required'); return join(root, name) }

it('create refuses an existing directory and incomplete initialization cannot become an empty reopened world', async () => {
  const selected = path('initializing-world'); await FieldWorldOwner.open({ ...base, path: selected, mode: 'create' })
  const before = await readFile(join(selected, 'field-world.json'), 'utf8')
  await expect(FieldWorldOwner.open({ ...base, path: selected, mode: 'create' })).rejects.toMatchObject({ code: 'world-exists' })
  await expect(FieldWorldOwner.open({ ...base, path: selected, mode: 'reopen' })).rejects.toMatchObject({ code: 'world-incomplete' })
  expect(await readFile(join(selected, 'field-world.json'), 'utf8')).toBe(before)
})

it('fixed position reads canonical completed responses and refuses unfinished, foreign or exhausted snapshots without activating an Agent', async () => {
  const world = path('fixed-position'); await mkdir(world); const ctx = await sourceComposition(world), replay = await installFourResponses(ctx, world), sessionId = id<'SessionId'>('position-session')
  await ctx.sessionController.create({ sessionId, cwd: world }); await ctx.sessionController.prompt({ sessionId, requestId: id<'session-request-id'>('position-task'), mode: 'queue', content: [{ type: 'text', text: 'Fixed position fixture.' }] }, new AbortController().signal); await ctx.agents.get(sessionId)!.whenIdle(); await ctx.sessionPersistence.flush()
  const inspection = await ctx.sessionController.inspect(sessionId), inspect = vi.spyOn(ctx.sessionController, 'inspect'), resolve = vi.spyOn(ctx.sessionController, 'resolveAgent')
  try {
    expect(await fixedReplayPosition(ctx, sessionId)).toBe(1)
    inspect.mockResolvedValue({ ...inspection, events: inspection.events.filter(event => event.type !== 'turn/end') }); await expect(fixedReplayPosition(ctx, sessionId)).rejects.toThrow('unfinished')
    inspect.mockResolvedValue({ ...inspection, events: inspection.events.map(event => event.type === 'request/context' ? { ...event, data: { ...event.data, provider: 'foreign-route' } } : event) }); await expect(fixedReplayPosition(ctx, sessionId)).rejects.toThrow('foreign route')
    inspect.mockResolvedValue({ ...inspection, events: [...inspection.events, ...Array.from({ length: 3 }, () => inspection.events.filter(event => event.type === 'request/context' || event.type === 'assistant/message')).flat()] }); await expect(fixedReplayPosition(ctx, sessionId)).rejects.toThrow('exhausted')
    expect(resolve).not.toHaveBeenCalled(); ctx.llm.assertZeroRealCalls()
  } finally { inspect.mockRestore(); resolve.mockRestore(); replay.handle.dispose(); await ctx.fiber.dispose() }
})

it('reopen rejects missing, corrupt and foreign owner metadata without replacement', async () => {
  const missing = path('missing-world'); await expect(FieldWorldOwner.open({ ...base, path: missing, mode: 'reopen' })).rejects.toMatchObject({ code: 'world-unavailable' }); await expect(access(missing)).rejects.toMatchObject({ code: 'ENOENT' })
  for (const [name, text] of [['corrupt', '{ interrupted'], ['foreign', JSON.stringify({ format: 'harmony-field-world/1', state: 'ready', desktopId: 'foreign', profileId: fieldProfile, sessionId: fieldSession, identityAlias: base.identityAlias, assetsSha256: base.assetsSha256 })]]) {
    const selected = path('metadata-' + name); await mkdir(selected); await writeFile(join(selected, 'field-world.json'), text!)
    await expect(FieldWorldOwner.open({ ...base, path: selected, mode: 'reopen' })).rejects.toThrow()
    expect(await readFile(join(selected, 'field-world.json'), 'utf8')).toBe(text)
  }
})

it('reparse aliases cannot select another world and enabled legacy settings cannot restore implicit temporary storage', async () => {
  const real = path('real-directory'), alias = path('linked-directory'); await mkdir(real); await symlink(real, alias, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(FieldWorldOwner.open({ ...base, path: alias, mode: 'reopen' })).rejects.toMatchObject({ code: 'path-denied' })
  const example = JSON.parse(await readFile(new URL('../replay-profile/field.enabled.example.json', import.meta.url), 'utf8'))
  expect(() => resolveFieldConfig({ ...example, schema: 'harmony-replay-field/1' })).toThrow()
  expect(() => resolveFieldConfig({ ...example, world: undefined })).toThrow()
  expect(() => resolveFieldConfig({ ...example, identityProtectionTimeoutMs: 0 })).toThrow()
  expect(() => resolveFieldConfig({ ...example, world: { ...example.world, path: 'relative' } })).toThrow()
})
