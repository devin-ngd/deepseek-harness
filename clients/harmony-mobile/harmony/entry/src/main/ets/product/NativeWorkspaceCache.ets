/** Bounded in-memory cache of verified shell and immutable plugin files; every workspace requires fresh Host admission and inventory. */
import { cryptoFramework } from '@kit.CryptoArchitectureKit'
import { util } from '@kit.ArkTS'

export interface NativeWorkspaceCachePolicy { maxEntries: number; maxBytes: number }
interface Resource { path: string; sha256: string; bytes: number; mediaType: string }
interface Manifest { revision: string; resources: Resource[] }
interface Response { status: number; headers: string[][]; body: string }
interface Entry { raw: string; bytes: number; contentBytes: number; sha256: string; mediaType: string }
/** Native-owned static bytes survive workspace close only when the same desktop freshly advertises the exact content. API responses and HTML are excluded. */
export class NativeWorkspaceCache {
  private readonly policy: NativeWorkspaceCachePolicy
  private origin: string = ''
  private bytes: number = 0
  private readonly inventory: Map<string, Resource> = new Map()
  private readonly entries: Map<string, Entry> = new Map()
  constructor(policy: NativeWorkspaceCachePolicy) { this.policy = policy }
  /** The product facade already validated this decrypted inventory before returning it to native. */
  select(origin: string, manifestJson: string): void {
    const manifest = JSON.parse(manifestJson) as Manifest
    if (origin !== this.origin) { this.entries.clear(); this.bytes = 0 }
    this.origin = origin; this.inventory.clear()
    for (const row of manifest.resources) if (row.mediaType !== 'text/html') this.inventory.set(origin + row.path, row)
    for (const row of this.entries) {
      const current = this.inventory.get(row[0]), entry = row[1]
      if (current === undefined || current.sha256 !== entry.sha256 || current.bytes !== entry.contentBytes || current.mediaType !== entry.mediaType) { this.entries.delete(row[0]); this.bytes -= entry.bytes }
    }
  }
  get(url: string): string | undefined {
    const entry = this.entries.get(url)
    if (entry === undefined) return undefined
    this.entries.delete(url); this.entries.set(url, entry); return entry.raw
  }
  /** Verify listed successful responses before delivery. Empty files and over-budget responses are not retained. */
  put(url: string, raw: string): void {
    const expected = this.inventory.get(url)
    if (expected === undefined || !url.startsWith(this.origin + '/')) return
    const response = JSON.parse(raw) as Response
    if (response.status !== 200) return
    const content = response.body.length === 0 ? new Uint8Array(0) : new util.Base64Helper().decodeSync(response.body, util.Type.BASIC_URL_SAFE)
    if (content.byteLength !== expected.bytes) throw new Error('workspace cache resource length changed')
    if (content.byteLength === 0) return
    const md = cryptoFramework.createMd('SHA256'); md.updateSync({ data: content })
    let hash = ''
    for (const byte of md.digestSync().data) hash += byte.toString(16).padStart(2, '0')
    if (hash !== expected.sha256) throw new Error('workspace cache resource digest changed')
    const bytes = new util.TextEncoder().encodeInto(raw).byteLength
    if (bytes > this.policy.maxBytes) return
    const previous = this.entries.get(url)
    if (previous !== undefined) { this.entries.delete(url); this.bytes -= previous.bytes }
    while (this.entries.size >= this.policy.maxEntries || bytes > this.policy.maxBytes - this.bytes) {
      let key: string = ''
      for (const candidate of this.entries.keys()) { key = candidate; break }
      if (key.length === 0) return
      const entry = this.entries.get(key)
      if (entry !== undefined) this.bytes -= entry.bytes
      this.entries.delete(key)
    }
    this.entries.set(url, { raw, bytes, contentBytes: content.byteLength, sha256: expected.sha256, mediaType: expected.mediaType }); this.bytes += bytes
  }
}
