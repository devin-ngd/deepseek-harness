/** Device-only process lock and conditional legacy marker archival. Record bytes are never rewritten by recovery. */
import { fileIo as fs } from '@kit.CoreFileKit'
import { BusinessError } from '@kit.BasicServicesKit'
import { util } from '@kit.ArkTS'
import { NativeCacheFile } from '../native/NativeCacheFile'
import { NativeProductPublicStorage, NativeProductStorageMetadata } from './NativeProductOwner'
export class NativeDeviceTrustFile implements NativeProductPublicStorage {
  private static owners: Set<string> = new Set()
  private provisional: boolean
  private cache: NativeCacheFile
  private path: string
  private stem: string
  private directory: string
  private legacy: string
  private gatePath: string
  private dirty: string
  private gate: fs.File | undefined = undefined
  private failed: boolean = false
  private closed: boolean = false
  private pendingLegacy: boolean = false
  private raw: string | null = null
  private loaded: boolean = false
  constructor(filesDir: string, maxBytes: number, scope: string, provisional: boolean = false) {
    this.provisional = provisional
    if (scope !== 'device-binding-v1' && scope !== 'device-route-v1') throw new Error('device storage selector denied')
    this.stem = scope === 'device-binding-v1' ? 'mobile-device-binding-v1' : 'mobile-device-routes-v1'; this.directory = filesDir; this.path = filesDir + '/' + this.stem + '.json'; this.legacy = filesDir + '/' + this.stem + '.owner-lock'; this.gatePath = filesDir + '/' + this.stem + '.process-gate'; this.dirty = filesDir + '/' + this.stem + '.write-unknown'; this.cache = new NativeCacheFile(filesDir, maxBytes, this.stem + '.json')
  }
  private exists(path: string): boolean { try { fs.lstatSync(path); return true } catch (error) { if ((error as BusinessError).code === 13900002) return false; throw new Error('device storage metadata unavailable') } }
  private settled(): void { if (this.exists(this.dirty) || fs.listFileSync(this.directory).some((name: string) => name.startsWith(this.stem + '.json.') && name.endsWith('.pending'))) throw new Error('device storage write outcome unknown') }
  private acquire(): void {
    if (this.closed || this.failed || this.gate !== undefined || NativeDeviceTrustFile.owners.has(this.gatePath)) throw new Error('device storage owner unavailable')
    let file: fs.File | undefined = undefined
    try { file = fs.openSync(this.gatePath, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.NOFOLLOW); file.tryLock(true); this.gate = file; NativeDeviceTrustFile.owners.add(this.gatePath) }
    catch (error) { if (file !== undefined) fs.closeSync(file.fd); throw new Error('device process lock unavailable') }
  }
  recoveryRequired(): boolean { return this.pendingLegacy }
  inspect(): NativeProductStorageMetadata { let file = 'unknown', size = -1, lock = 'unknown'; try { const value = fs.lstatSync(this.path); file = 'present'; if (value.isFile() && Number.isSafeInteger(value.size) && value.size >= 0) size = value.size } catch (error) { if ((error as BusinessError).code === 13900002) file = 'missing' }; try { lock = this.exists(this.legacy) ? 'present' : 'missing' } catch (error) { void error }; return { file, size, lock, held: this.gate !== undefined } }
  async read(maxBytes: number): Promise<string | null> {
    if (this.loaded || this.closed || this.failed) throw new Error('device storage read unavailable')
    try { this.acquire(); this.settled(); this.pendingLegacy = this.exists(this.legacy); if (this.pendingLegacy && !this.provisional) throw new Error('device legacy recovery required'); this.raw = await this.cache.read(maxBytes); this.loaded = true; return this.raw }
    catch (error) { this.failed = true; throw new Error('device storage read refused') }
  }
  /** Called only after both records pass original-identity and full history verification under held process gates. */
  async archiveValidated(): Promise<void> {
    if (this.closed || this.failed || this.gate === undefined || !this.loaded || this.raw === null) throw new Error('device storage recovery unavailable')
    this.settled(); if (await this.cache.read(new util.TextEncoder().encodeInto(this.raw).byteLength) !== this.raw) throw new Error('device storage recovery changed')
    if (this.pendingLegacy) { const archived = this.legacy + '.recovered-v1'; if (this.exists(archived) || !fs.lstatSync(this.legacy).isDirectory() || fs.listFileSync(this.legacy).length !== 0) throw new Error('device legacy marker ambiguous'); fs.renameSync(this.legacy, archived); this.pendingLegacy = false }
    this.provisional = false
  }
  async write(raw: string): Promise<void> { if (this.closed || this.failed || this.gate === undefined || !this.loaded || this.provisional || this.pendingLegacy) throw new Error('device storage writes blocked'); this.settled(); try { fs.mkdirSync(this.dirty); await this.cache.write(raw); fs.rmdirSync(this.dirty); this.raw = raw } catch (error) { this.failed = true; throw new Error('device storage write unknown') } }
  async close(): Promise<void> { if (this.closed) return; this.closed = true; const file = this.gate; this.gate = undefined; if (file !== undefined) { try { fs.closeSync(file.fd) } finally { NativeDeviceTrustFile.owners.delete(this.gatePath) } } }
}
