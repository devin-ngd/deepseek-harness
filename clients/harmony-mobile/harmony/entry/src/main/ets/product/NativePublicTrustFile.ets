/** Public trust file has an exclusive held refusal lock. Unknown read/write/cleanup keeps the lock across owner restart. */
import { fileIo as fs } from '@kit.CoreFileKit'
import { NativeCacheFile } from '../native/NativeCacheFile'
import { NativeProductPublicStorage, NativeProductStorageMetadata } from './NativeProductOwner'
import { BusinessError } from '@kit.BasicServicesKit'
/** Lock acquisition precedes every admitted record; a clean close alone removes this app-private lock. Device power-loss/directory-sync acceptance is separate. */
export class NativePublicTrustFile implements NativeProductPublicStorage {
  private path: string
  private cache: NativeCacheFile
  private lock: string
  private acquired: boolean = false
  private failed: boolean = false
  private closed: boolean = false
  constructor(filesDir: string, maxBytes: number, scope: string = '') { if (scope !== '' && scope !== 'catalog' && scope !== 'device-binding-v1' && scope !== 'device-route-v1' && !/^[a-f0-9]{64}$/.test(scope)) throw new Error('native scope selector denied'); const stem = scope === '' ? 'mobile-product-public-trust' : scope === 'catalog' ? 'mobile-product-scopes' : scope === 'device-binding-v1' ? 'mobile-device-binding-v1' : scope === 'device-route-v1' ? 'mobile-device-routes-v1' : 'mobile-product-scope-' + scope; this.path = filesDir + '/' + stem + '.json'; this.cache = new NativeCacheFile(filesDir, maxBytes, stem + '.json'); this.lock = filesDir + '/' + stem + '.owner-lock' }
  /** lstat only: no read/open, symlink following, lock mutation or exception text is exposed. */
  inspect(): NativeProductStorageMetadata {
    let file = 'unknown', size = -1, lock = 'unknown'
    try { const stat = fs.lstatSync(this.path); file = 'present'; if (stat.isFile() && Number.isSafeInteger(stat.size) && stat.size >= 0) size = stat.size } catch (error) { if ((error as BusinessError).code === 13900002) file = 'missing' }
    try { fs.lstatSync(this.lock); lock = 'present' } catch (error) { if ((error as BusinessError).code === 13900002) lock = 'missing' }
    return { file, size, lock, held: this.acquired }
  }
  async read(maxBytes: number): Promise<string | null> { if (this.failed || this.closed || this.acquired) throw new Error('native public trust locked'); try { fs.mkdirSync(this.lock); this.acquired = true; return await this.cache.read(maxBytes) } catch (error) { void error; this.failed = true; throw new Error('native public trust unavailable') } }
  async write(raw: string): Promise<void> { if (this.failed || this.closed || !this.acquired) throw new Error('native public trust unavailable'); try { await this.cache.write(raw) } catch (error) { void error; this.failed = true; throw new Error('native public trust write unknown') } }
  async close(): Promise<void> { if (this.closed) { if (this.failed) throw new Error('native public trust cleanup failed'); return }; this.closed = true; if (this.failed) throw new Error('native public trust locked'); if (this.acquired) { try { fs.rmdirSync(this.lock); this.acquired = false } catch (error) { void error; this.failed = true; throw new Error('native public trust cleanup failed') } } }
}
