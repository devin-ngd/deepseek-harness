/** Exclusive state lock with opt-in Linux local-host crash recovery. */
import { constants } from 'node:fs'
import { open, readFile, lstat, rename, unlink, type FileHandle } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

interface Metadata { schema: 'harmony-relay-lock/1'; boot: string; pid: number; phase: 'clean' | 'dirty' }
type SyncDirectory = (path: string) => Promise<void>
const bootPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const exists = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'EEXIST'
const missing = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ESRCH'

/** Content-free explanation for a lock that cannot safely be recovered. */
export class RelayLockError extends Error {
  constructor(readonly code: 'active' | 'dirty' | 'unknown' | 'recovery-busy') { super('relay state lock refused') }
}

/** Single-writer lock. Dirty or unrecognised locks always require investigation. */
export class RecoverableLock {
  private constructor(private readonly path: string, private readonly handle: FileHandle, private readonly syncDirectory: SyncDirectory, private readonly metadata?: Metadata) {}

  /** @param path - state path. @param syncDirectory - durable directory barrier. @returns exclusive lock. */
  static async acquire(path: string, syncDirectory: SyncDirectory): Promise<RecoverableLock> {
    const name = path + '.lock'
    const enabled = process.platform === 'linux' && process.env.HARMONY_RELAY_LOCAL_LOCK_RECOVERY === '1'
    const boot = enabled ? (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim() : ''
    if (enabled && !bootPattern.test(boot)) throw new Error('lock identity unavailable')
    const create = async () => {
      const handle = await open(name, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600)
      const metadata: Metadata | undefined = enabled ? { schema: 'harmony-relay-lock/1', boot, pid: process.pid, phase: 'clean' } : undefined
      try {
        if (metadata !== undefined) { await handle.writeFile(JSON.stringify(metadata) + '\n'); await handle.sync(); await syncDirectory(dirname(name)) }
        return new RecoverableLock(name, handle, syncDirectory, metadata)
      } catch (error) { await handle.close(); throw error }
    }
    try { return await create() } catch (error) {
      if (!enabled || !exists(error)) throw error
    }
    const guardName = name + '.recovering'
    let guard: FileHandle
    try { guard = await open(guardName, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600) } catch (error) { if (exists(error)) throw new RelayLockError('recovery-busy'); throw error }
    try {
      const info = await lstat(name)
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size <= 0 || info.size > 512 || (info.mode & 0o077) !== 0) throw new RelayLockError('unknown')
      let old: unknown
      try { old = JSON.parse(await readFile(name, 'utf8')) } catch (error) { void error; throw new RelayLockError('unknown') }
      if (old === null || typeof old !== 'object' || Object.keys(old).length !== 4 || !('schema' in old) || old.schema !== 'harmony-relay-lock/1' || !('boot' in old) || typeof old.boot !== 'string' || !bootPattern.test(old.boot) || !('pid' in old) || typeof old.pid !== 'number' || !Number.isSafeInteger(old.pid) || old.pid <= 1 || !('phase' in old) || old.phase !== 'clean' && old.phase !== 'dirty') throw new RelayLockError('unknown')
      if (old.phase === 'dirty') throw new RelayLockError('dirty')
      if (old.boot === boot) {
        try { process.kill(old.pid, 0); throw new RelayLockError('active') } catch (error) { if (!missing(error)) throw error }
      }
      await rename(name, name + '.recovered-' + randomBytes(12).toString('hex'))
      await syncDirectory(dirname(name))
      return await create()
    } finally { await guard.close(); await unlink(guardName); await syncDirectory(dirname(name)) }
  }

  private async phase(phase: Metadata['phase']): Promise<void> {
    if (this.metadata === undefined) return
    const next: Metadata = { ...this.metadata, phase }, temporary = this.path + '.phase-' + randomBytes(12).toString('hex')
    const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    try { await file.writeFile(JSON.stringify(next) + '\n'); await file.sync() } finally { await file.close() }
    await rename(temporary, this.path); await this.syncDirectory(dirname(this.path)); this.metadata.phase = phase
  }
  /** Mark before any append; a crash or unknown result remains refused. */
  async beginWrite(): Promise<void> { await this.phase('dirty') }
  /** Once a write starts, retain the dirty phase until a clean close removes the lock. */
  async finishWrite(): Promise<void> { /* A durable commit can still have an unacknowledged caller. */ }
  /** Close only the held file descriptor; caller controls removal after clean shutdown. */
  async close(): Promise<void> { await this.handle.close() }
}
