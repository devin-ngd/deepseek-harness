/** Explicit replay-world ownership; create never replaces state and reopen never substitutes an empty Session. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises'
import { join, resolve, parse } from 'node:path'
import { z } from 'zod'
import { canonicalizeWatchPath } from '@deepseek-ai/dsh-home-paths'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { openProfileJournal } from '../../desktop-plugin/src/journal.ts'
import { id, type DesktopId } from '../../src/protocol.ts'
import { fieldSession, fieldProfile } from '../../src/first-use-protocol.ts'

const schema = z.object({ format: z.literal('harmony-field-world/1'), state: z.enum(['initializing', 'ready']), desktopId: z.string(), profileId: z.literal(fieldProfile), sessionId: z.literal(fieldSession), identityAlias: z.string(), assetsSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
/** Explicit local storage selection; no current-directory or temporary-world default exists. */
export interface FieldWorldSpec { readonly path: string; readonly mode: 'create' | 'reopen'; readonly desktopId: DesktopId; readonly identityAlias: string; readonly assetsSha256: string; readonly maxAdmissionRecords: number; readonly lockWaitMs: number }
/** Safe local disposition; incomplete and foreign state remains untouched for inspection. */
export class FieldWorldError extends Error {
  /** @param code - path, owner, completeness, persistence or canonical Session failure. */
  constructor(readonly code: 'path-denied' | 'world-exists' | 'world-unavailable' | 'world-invalid' | 'world-incomplete' | 'session-unavailable' | 'write-unknown') { super('field world ' + code); this.name = 'FieldWorldError' }
}
function samePath(left: string, right: string): boolean { const a = resolve(left), b = resolve(right); return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b }

/** Stable selected world; this object stores only public owner fields and owns no key, grant, socket or Session loop. */
export class FieldWorldOwner {
  private constructor(readonly spec: FieldWorldSpec, readonly root: string, private readonly manifest: z.infer<typeof schema>) {}
  /** @param spec - explicit local world selection. @param operation - complete process-owned journey, including service teardown. @returns its result while the maintained cross-process lock prevents another field process reading or activating this world. */
  static async use<T>(spec: FieldWorldSpec, operation: (owner: FieldWorldOwner) => Promise<T>): Promise<T> {
    const root = resolve(spec.path)
    if (samePath(root, parse(root).root) || !samePath(await canonicalizeWatchPath(root), root)) throw new FieldWorldError('path-denied')
    return withFileLock(root + '.field-owner', async () => operation(await FieldWorldOwner.open(spec)), { waitMs: spec.lockWaitMs })
  }
  /** @param spec - validated explicit local storage policy. @returns selected public world; create refuses every existing path and reopen requires its exact ready marker. */
  static async open(spec: FieldWorldSpec): Promise<FieldWorldOwner> {
    const root = resolve(spec.path)
    if (samePath(root, parse(root).root)) throw new FieldWorldError('path-denied')
    let canonical: string
    try { canonical = await canonicalizeWatchPath(root) } catch (error) { void error; throw new FieldWorldError('world-unavailable') }
    if (!samePath(canonical, root)) throw new FieldWorldError('path-denied')
    const expected = { format: 'harmony-field-world/1', state: 'initializing', desktopId: spec.desktopId, profileId: fieldProfile, sessionId: fieldSession, identityAlias: spec.identityAlias, assetsSha256: spec.assetsSha256 } as const
    if (spec.mode === 'create') {
      try { await mkdir(root) } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new FieldWorldError('world-exists'); throw new FieldWorldError('world-unavailable') }
      try { await writeFile(join(root, 'field-world.json'), JSON.stringify(expected, null, 2) + '\n', { flag: 'wx', mode: 0o600 }) } catch (error) { void error; throw new FieldWorldError('write-unknown') }
      return new FieldWorldOwner(spec, root, expected)
    }
    try {
      const stat = await lstat(root), file = join(root, 'field-world.json'), fileStat = await lstat(file)
      if (!stat.isDirectory() || stat.isSymbolicLink() || !fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size > 8192) throw new FieldWorldError('world-invalid')
      const manifest = schema.parse(JSON.parse(await readFile(file, 'utf8')))
      if (manifest.state !== 'ready') throw new FieldWorldError('world-incomplete')
      if (manifest.desktopId !== expected.desktopId || manifest.profileId !== expected.profileId || manifest.sessionId !== expected.sessionId || manifest.identityAlias !== expected.identityAlias || manifest.assetsSha256 !== expected.assetsSha256) throw new FieldWorldError('world-invalid')
      return new FieldWorldOwner(spec, root, manifest)
    } catch (error) { if (error instanceof FieldWorldError) throw error; throw new FieldWorldError('world-unavailable') }
  }
  /** @param ctx - isolated fixed-replay Context with its four-response provider installed. @returns after exact Session attachment and admission-domain validation; no prompt is dispatched by this owner. */
  async prepareSession(ctx: Context): Promise<void> {
    if (process.env.DSH_SNAPSHOT !== 'replay' || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw new FieldWorldError('session-unavailable')
    ctx.llm.assertOfflineReplayReady('rich-inline-replay', 'rich-inline-fixed')
    const sessionId = id<'SessionId'>(fieldSession), policy = { desktopId: this.spec.desktopId, profileId: id<'mobile-profile'>(fieldProfile), mode: this.spec.mode }
    if (this.spec.mode === 'create') {
      await ctx.sessionController.create({ sessionId, cwd: this.root })
      const state = await openProfileJournal(ctx, this.spec.maxAdmissionRecords, policy); await state.close(); await ctx.sessionPersistence.flush()
      const path = join(this.root, 'field-world.json')
      try { await withFileLock(path, async () => { const current = schema.parse(JSON.parse(await readFile(path, 'utf8'))); if (JSON.stringify(current) !== JSON.stringify(this.manifest)) throw new FieldWorldError('world-invalid'); await writeFileAtomic(path, JSON.stringify({ ...current, state: 'ready' }, null, 2) + '\n', { mode: 0o600, dirMode: 0o700 }) }, { waitMs: this.spec.lockWaitMs }) } catch (error) { if (error instanceof FieldWorldError) throw error; throw new FieldWorldError('write-unknown') }
    } else {
      let inspection: Awaited<ReturnType<typeof ctx.sessionController.inspect>>
      try { inspection = await ctx.sessionController.inspect(sessionId) } catch (error) { void error; throw new FieldWorldError('session-unavailable') }
      if (inspection.meta.cwd === undefined || !samePath(inspection.meta.cwd, this.root)) throw new FieldWorldError('world-invalid')
      const state = await openProfileJournal(ctx, this.spec.maxAdmissionRecords, policy); await state.close()
      const resumed = await ctx.sessionController.resolveAgent(sessionId)
      if ('error' in resumed) throw new FieldWorldError('session-unavailable')
    }
  }
}
