/** Durable admission receipts on the existing StorageDomain owner; no device grants, keys or credentials are stored. */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { AdmissionJournal, AdmissionRecord } from '../../src/admission-journal.ts'
import { admissionKey } from '../../src/admission-journal.ts'
import { id } from '../../src/protocol.ts'
import { LinkError } from '../../src/link-protocol.ts'
import type { DesktopId } from '../../src/protocol.ts'
import type { MobileProfileId } from '../../src/profile-capabilities.ts'
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/)
const row = z.object({ desktopId: identifier.transform(value => id<'mobile-desktop'>(value)), deviceId: identifier.transform(value => id<'mobile-device'>(value)),
  sessionId: identifier.transform(value => id<'SessionId'>(value)), requestId: identifier.transform(value => id<'session-request-id'>(value)),
  fingerprint: z.string().min(1).max(1048576), state: z.enum(['submitting', 'accepted']) }).strict()
const header = z.discriminatedUnion('state', [z.object({ state: z.literal('uninitialized') }).strict(),
  z.object({ state: z.literal('ready'), desktopId: identifier, profileId: identifier }).strict()])
const spec = defineDomain({ name: 'harmony_mobile_admission', version: 1, global: { schema: header, initial: { state: 'uninitialized' } as z.infer<typeof header> }, tables: { admissions: domainTable<string, AdmissionRecord>(row) } })
/** Explicit first-use or recovery instruction; only an approved first activation may initialize fresh receipt storage. */
export interface JournalPolicy { readonly mode: 'create' | 'reopen'; readonly desktopId: DesktopId; readonly profileId: MobileProfileId }
/** Expected initialization/recovery refusal; no file is treated as an empty replacement after an unknown outcome. */
export class ProfileJournalError extends Error {
  /** @param code - existing initialization or missing/different recovery owner. */
  constructor(readonly code: 'journal-already-exists' | 'journal-recovery-invalid') { super(code); this.name = 'ProfileJournalError' }
}
/** @param ctx - existing enabled StorageDomain owner. @param maxRecords - positive retention cap; uncertain rows are never evicted. @param policy - explicit create/reopen and owner identities. @returns sole serial writer and awaited close; missing/replaced/unreadable recovery state fails before dispatch. */
export async function openProfileJournal(ctx: Context, maxRecords: number, policy: JournalPolicy): Promise<{ readonly journal: AdmissionJournal; close(): Promise<void> }> {
  const domain = await ctx.storageDomain.open(spec), rows = domain.table('admissions')
  try {
    const marker = domain.global.get()
    if (policy.mode === 'create') {
      if (marker.state !== 'uninitialized' || rows.size !== 0) throw new ProfileJournalError('journal-already-exists')
      await domain.global.set({ state: 'ready', desktopId: policy.desktopId, profileId: policy.profileId })
    } else if (marker.state !== 'ready' || marker.desktopId !== policy.desktopId || marker.profileId !== policy.profileId) throw new ProfileJournalError('journal-recovery-invalid')
    if (rows.size > maxRecords) throw new LinkError('queue-full')
    for (const [key, record] of rows.entries()) if (key !== admissionKey(record.sessionId, record.requestId)) throw new LinkError('invalid-packet')
  } catch (error) { await domain.close(); throw error }
  let tail = Promise.resolve()
  const serial = <T>(operation: () => Promise<T>): Promise<T> => { const next = tail.then(operation); tail = next.then(() => {}, () => {}); return next }
  return { journal: {
    claim: record => serial(async () => {
      const key = admissionKey(record.sessionId, record.requestId), old = rows.get(key)
      if (old !== undefined) return { created: false, record: structuredClone(old) }
      if (rows.size >= maxRecords) throw new LinkError('queue-full')
      await rows.put(key, record); return { created: true, record: structuredClone(record) }
    }), get: async (sessionId, requestId) => structuredClone(rows.get(admissionKey(sessionId, requestId))),
    accept: record => serial(async () => {
      const key = admissionKey(record.sessionId, record.requestId), old = rows.get(key)
      if (old === undefined || old.desktopId !== record.desktopId || old.deviceId !== record.deviceId || old.fingerprint !== record.fingerprint) throw new LinkError('id-conflict')
      await rows.put(key, { ...old, state: 'accepted' })
    }),
  }, close: async () => { await tail; await domain.close() } }
}
