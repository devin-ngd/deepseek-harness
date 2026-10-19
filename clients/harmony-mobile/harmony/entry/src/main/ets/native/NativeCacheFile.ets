/** One app-owned cache; bounded allocation, complete writes and fsync precede same-filesystem rename. */
import { fileIo as fs } from '@kit.CoreFileKit'
import { util } from '@kit.ArkTS'
import { BusinessError } from '@kit.BasicServicesKit'
import { NativeCacheStorage } from '../provider/MobileProvider'
import { NativeFailure } from './NativeFailure'

/** PhoneLibrary validates owner/version/age after these file guarantees; credentials are not stored here. */
export class NativeCacheFile implements NativeCacheStorage {
  private path: string
  private maxBytes: number
  constructor(filesDir: string, maxBytes: number, filename: string = 'mobile-offline-cache.json') {
    if (!filesDir.startsWith('/') || filesDir.includes('..') || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || !/^(mobile-offline-cache|mobile-product-public-trust|mobile-product-scopes|mobile-product-scope-[a-f0-9]{64})\.json$/.test(filename)) throw new NativeFailure('cache-config-invalid')
    this.path = filesDir + '/' + filename
    this.maxBytes = maxBytes
  }
  /** @param maxBytes - caller cap, bounded by HAP configuration. @returns absent or complete UTF-8 content; corrupt files never become empty caches. */
  async read(maxBytes: number): Promise<string | null> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > this.maxBytes) throw new NativeFailure('cache-too-large')
    let file: fs.File
    try { file = fs.openSync(this.path, fs.OpenMode.READ_ONLY | fs.OpenMode.NOFOLLOW) }
    catch (error) {
      if ((error as BusinessError).code === 13900002) return null
      throw new NativeFailure('cache-read-failed')
    }
    try {
      const size = fs.statSync(file.fd).size
      if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes) throw new NativeFailure('cache-too-large')
      const bytes = new Uint8Array(size)
      let offset = 0
      while (offset < size) {
        const remaining = new ArrayBuffer(size - offset)
        const read = fs.readSync(file.fd, remaining)
        if (read < 1 || read > remaining.byteLength) throw new NativeFailure('cache-read-incomplete')
        bytes.set(new Uint8Array(remaining, 0, read), offset)
        offset += read
      }
      if (fs.statSync(file.fd).size !== size) throw new NativeFailure('cache-read-conflict')
      return util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(bytes)
    } finally { fs.closeSync(file.fd) }
  }
  /** @param text - admitted offline source facts. Complete writes and file fsync precede replacement; directory/power-loss guarantees need platform testing. */
  async write(text: string): Promise<void> {
    const bytes = new util.TextEncoder().encodeInto(text)
    if (bytes.byteLength < 1 || bytes.byteLength > this.maxBytes) throw new NativeFailure('cache-too-large')
    const pendingDir = this.path + '.' + util.generateRandomUUID(false) + '.pending'
    fs.mkdirSync(pendingDir)
    const pending = pendingDir + '/cache'
    let file: fs.File | null = null
    let closed = false
    let committed = false
    try {
      file = fs.openSync(pending, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.NOFOLLOW)
      let offset = 0
      while (offset < bytes.byteLength) {
        const buffer = bytes.slice(offset).buffer
        const written = fs.writeSync(file.fd, buffer)
        if (written < 1 || written > buffer.byteLength) throw new NativeFailure('cache-write-incomplete')
        offset += written
      }
      fs.fsyncSync(file.fd)
      fs.closeSync(file.fd); closed = true
      fs.renameSync(pending, this.path)
      committed = true
      fs.rmdirSync(pendingDir)
    } catch (error) {
      let cleanupFailed = false
      if (!closed && file !== null) {
        try { fs.closeSync(file.fd) } catch (closeError) { cleanupFailed = true; void closeError }
      }
      if (!committed && file !== null) { try { fs.unlinkSync(pending) } catch (unlinkError) { cleanupFailed = true; void unlinkError } }
      try { fs.rmdirSync(pendingDir) } catch (directoryError) { cleanupFailed = true; void directoryError }
      void error
      throw new NativeFailure(committed ? 'cache-committed-cleanup-failed' : 'cache-write-failed', cleanupFailed)
    }
  }
  /** Clear this explicitly selected app-owned file. Absence succeeds; other IO errors stay visible. */
  async clear(): Promise<void> {
    try { fs.unlinkSync(this.path) }
    catch (error) { if ((error as BusinessError).code !== 13900002) throw new NativeFailure('cache-clear-failed') }
  }
}
