/** Test-owned mobile state on the maintained DSH JSON storage backend; no credentials or grants are stored. */
import type { Context } from '@deepseek-ai/cordis'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { AdmissionJournal, AdmissionRecord } from '../src/admission-journal.ts'
import { admissionKey } from '../src/admission-journal.ts'
import { id } from '../src/protocol.ts'
import { LinkError } from '../src/link-protocol.ts'

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/)
const desktopId = identifier.transform(value => id<'mobile-desktop'>(value))
const deviceId = identifier.transform(value => id<'mobile-device'>(value))
const sessionId = identifier.transform(value => id<'SessionId'>(value))
const requestId = identifier.transform(value => id<'session-request-id'>(value))
const row = z.object({ desktopId, deviceId, sessionId, requestId, fingerprint: z.string().min(1).max(1048576),
  state: z.enum(['submitting', 'accepted']) }).strict()
const checkpoint = z.object({ desktopId, deviceId, sessionId, sessionFormatVersion: z.literal(4),
  lastDurableSeq: z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER) }).strict()
/** Verified display watermark; reopening always requests a fresh canonical snapshot, since follow has no resume parameter. */
export type PhoneCheckpoint = z.infer<typeof checkpoint>
const spec = defineDomain({ name: 'harmony_mobile_lab', version: 1,
  tables: { admissions: domainTable<string, AdmissionRecord>(row), checkpoints: domainTable<string, PhoneCheckpoint>(checkpoint) } })

/** @param ctx - actual isolated StorageDomain owner. @param maxRecords - cap for each table. @param medium - explicit first-use or recovery policy and test-owned backend root. @returns sole journal writer and checkpoint operations. */
export async function openMobileJournal(ctx: Context, maxRecords: number, medium: { readonly mode: 'create' | 'reopen'; readonly root: string }) {
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1) throw new LinkError('invalid-packet')
  let exists = true
  try { await access(join(medium.root, 'harmony_mobile_lab.json')) }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    exists = false
  }
  if (medium.mode === 'reopen' && !exists) throw new Error('MOBILE_JOURNAL_MISSING_ON_RECOVERY')
  if (medium.mode === 'create' && exists) throw new Error('MOBILE_JOURNAL_ALREADY_EXISTS')
  const domain = await ctx.storageDomain.open(spec), rows = domain.table('admissions'), checkpoints = domain.table('checkpoints')
  try {
    if (rows.size > maxRecords || checkpoints.size > maxRecords) throw new LinkError('queue-full')
    for (const [key, value] of rows.entries()) if (key !== admissionKey(value.sessionId, value.requestId)) throw new LinkError('invalid-packet')
    for (const [key, value] of checkpoints.entries()) if (key !== value.desktopId + '/' + value.sessionId) throw new LinkError('invalid-packet')
  } catch (error) { await domain.close(); throw error }
  let tail = Promise.resolve()
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation)
    // A failed durable write remains visible to its caller; subsequent operations can retry safely.
    tail = result.then(() => {}, () => {})
    return result
  }
  const journal: AdmissionJournal = {
    claim: record => serial(async () => {
      const key = admissionKey(record.sessionId, record.requestId), old = rows.get(key)
      if (old !== undefined) return { created: false, record: structuredClone(old) }
      if (rows.size >= maxRecords) throw new LinkError('queue-full')
      await rows.put(key, record)
      return { created: true, record: structuredClone(record) }
    }),
    get: async (sessionId, requestId) => structuredClone(rows.get(admissionKey(sessionId, requestId))),
    accept: record => serial(async () => {
      const key = admissionKey(record.sessionId, record.requestId), old = rows.get(key)
      if (old === undefined || old.desktopId !== record.desktopId || old.deviceId !== record.deviceId || old.fingerprint !== record.fingerprint) throw new LinkError('id-conflict')
      await rows.put(key, { ...old, state: 'accepted' })
    }),
  }
  return { journal,
    saveCheckpoint: (value: PhoneCheckpoint) => serial(async () => {
      const key = value.desktopId + '/' + value.sessionId
      if (checkpoints.get(key) === undefined && checkpoints.size >= maxRecords) throw new LinkError('queue-full')
      await checkpoints.put(key, value)
    }),
    checkpoint: (desktopId: PhoneCheckpoint['desktopId'], sessionId: PhoneCheckpoint['sessionId']) => structuredClone(checkpoints.get(desktopId + '/' + sessionId)),
    close: async () => { await tail; await domain.close() },
  }
}
