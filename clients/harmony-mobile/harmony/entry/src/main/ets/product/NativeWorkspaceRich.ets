/** Native owns every rich reservation and private guest port for one workspace document. */
import { util } from '@kit.ArkTS'
import { NativeAssets } from '../native/NativeAssets'
import { workspaceRichRequest } from './ProductCore'
import { NativeWorkspaceRichGuest, NativeWorkspaceRichPolicy } from './NativeWorkspaceRichGuest'

interface NativeRichInput { operation: string; request?: Object; lease?: string; packet?: Object; id?: string }
interface ClosePacket { type: string; requestId?: string; ok?: boolean }
interface Reservation { lease: string; partition: string; src: string }
interface CloseWait { requestId: string; resolve: (saved: boolean) => void }
/** Pending close is acknowledged by the existing SDK draft barrier, while forced workspace teardown revokes immediately. */
export class NativeWorkspaceRich {
  private readonly leases: Map<string, string> = new Map()
  private active: NativeWorkspaceRichGuest | undefined = undefined
  private activeLease: string = ''
  private closed: boolean = false
  private opening: boolean = false
  private cleanupFailed: boolean = false
  private wait: CloseWait | undefined = undefined
  private closingView: Promise<void> | undefined = undefined
  private releasing: Promise<void> | undefined = undefined
  private closing: Promise<void> | undefined = undefined
  private readonly assets: NativeAssets
  private readonly policy: NativeWorkspaceRichPolicy
  private readonly emit: (lease: string, packet: string, id?: string) => void
  private readonly visible: (opened: boolean) => void
  constructor(assets: NativeAssets, policy: NativeWorkspaceRichPolicy,
    emit: (lease: string, packet: string, id?: string) => void, visible: (opened: boolean) => void) {
    this.assets = assets; this.policy = policy; this.emit = emit; this.visible = visible
  }
  guest(): NativeWorkspaceRichGuest { if (this.active === undefined || this.closed) throw new Error('native rich guest unavailable'); return this.active }
  view(): NativeWorkspaceRichGuest | undefined { return this.closed ? undefined : this.active }
  private current(): void { if (this.closed) throw new Error('native rich workspace retired') }
  /** Only native rendering operations are accepted here; Host calls retain the workspace's other dispatcher. */
  async request(raw: string): Promise<string> {
    this.current()
    const input = JSON.parse(workspaceRichRequest(raw, JSON.stringify(this.policy))) as NativeRichInput
    const lease = input.lease ?? ''
    if (input.operation === 'acquire') {
      if (this.leases.size >= this.policy.maxGuests) throw new Error('native rich reservation capacity')
      const id = util.generateRandomUUID(false), reservation: Reservation = { lease: id, partition: id, src: 'https://workspace-rich.dsh.invalid/document' }
      this.leases.set(id, JSON.stringify(input.request)); return JSON.stringify(reservation)
    }
    if (input.operation === 'release') { await this.release(lease); return 'null' }
    if (input.operation === 'ack') { if (this.activeLease === lease) this.active?.acknowledge(input.id ?? ''); return 'null' }
    const content = this.leases.get(lease)
    if (content === undefined) throw new Error('native rich reservation denied')
    if (input.operation === 'open') {
      if (this.activeLease === lease) return 'null'
      if (this.opening) throw new Error('native rich open pending')
      this.opening = true
      try {
      if (this.releasing !== undefined) await this.releasing
      if (this.active !== undefined) await this.closeView()
      this.current()
      if (!this.leases.has(lease)) throw new Error('native rich reservation retired')
      const owner = new NativeWorkspaceRichGuest(this.assets, lease, content, this.policy, (packet: string, id: string) => {
        if (!this.closed && this.active === owner) this.emit(lease, packet, id)
      }, () => {
        if (this.closed || this.active !== owner) return
        this.emit(lease, '{"type":"native.error","code":"RICH_NATIVE_GUEST_FAILED"}')
        void this.release(lease).catch((error: Error) => { void error; this.cleanupFailed = true })
      }, () => { if (this.active === owner) this.visible(false) })
      this.active = owner; this.activeLease = lease; this.visible(true); return 'null'
      } finally { this.opening = false }
    }
    if (input.operation === 'send') {
      const rawPacket = JSON.stringify(input.packet), packet = JSON.parse(rawPacket) as ClosePacket
      if (packet.type === 'native.close-ready') {
        if (this.activeLease === lease && packet.requestId === this.wait?.requestId) this.wait?.resolve(packet.ok === true)
        return 'null'
      }
      if (this.activeLease !== lease) throw new Error('native rich guest not open')
      this.guest().send(rawPacket); return 'null'
    }
    throw new Error('native rich operation denied')
  }
  private release(lease: string): Promise<void> {
    this.leases.delete(lease)
    if (this.activeLease !== lease) return Promise.resolve()
    if (this.releasing !== undefined) return this.releasing
    const active = this.active; this.wait?.resolve(false)
    this.releasing = (async () => {
      try { await active?.close() }
      catch (error) { void error; this.cleanupFailed = true; throw new Error('native rich release failed') }
      finally {
        if (this.active === active) { this.active = undefined; this.activeLease = ''; this.visible(false) }
        this.releasing = undefined
      }
    })()
    return this.releasing
  }
  /** User back waits for a saved draft; refusal keeps the isolated page available for recovery. */
  closeView(): Promise<void> {
    if (this.closingView !== undefined) return this.closingView
    if (this.releasing !== undefined) return this.releasing
    if (this.active === undefined) return Promise.resolve()
    const lease = this.activeLease, requestId = util.generateRandomUUID(false)
    let timer: number = -1
    const settled = new Promise<boolean>(resolve => { this.wait = { requestId, resolve }; timer = setTimeout(() => resolve(false), this.policy.closeTimeoutMs) })
    this.closingView = (async () => {
      try {
        this.emit(lease, JSON.stringify({ type: 'native.close-request', requestId }))
        if (!await settled) throw new Error('native rich draft not saved')
        this.current()
        if (this.activeLease !== lease) throw new Error('native rich selection changed')
        await this.release(lease); this.emit(lease, '{"type":"native.closed"}')
      } finally { clearTimeout(timer); this.wait = undefined; this.closingView = undefined }
    })()
    return this.closingView
  }
  /** Explicit exit after failed draft settlement; no accepted Host action is cancelled or replayed. */
  async discardView(): Promise<void> { if (this.releasing !== undefined) { await this.releasing; return }; const lease = this.activeLease; if (lease.length === 0) return; await this.release(lease); this.emit(lease, '{"type":"native.closed"}') }
  /** Workspace close revokes all guest ports before releasing the parent Host peer. */
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    this.closed = true; this.wait?.resolve(false); this.leases.clear()
    this.closing = (async () => {
      try { await this.release(this.activeLease) } catch (error) { void error; this.cleanupFailed = true }
      if (this.cleanupFailed) throw new Error('native rich cleanup failed')
    })()
    return this.closing
  }
}
