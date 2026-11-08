/** Trusted workspace face of the native rich carrier; generated content receives only its separate guest port. */
import type { NativeRichBridge } from '../../../packages/experimental/rich-inline/src/client/native.ts'
import { workspaceRichReservationSchema, workspaceRichRequestSchema, type WorkspaceRichPolicy, type WorkspaceRichRequest } from './workspace-rich-protocol.ts'

/** The document owner routes these requests locally to native, separately from standard Host calls. */
export interface WorkspaceNativeRichPort { request(value: WorkspaceRichRequest): Promise<unknown> }
interface Lease { readonly listeners: Set<(packet: Record<string, unknown>) => void | Promise<void>> }
/** A standard Rich bridge whose view opens a separately isolated native document on user activation. */
export class WorkspaceNativeRich implements NativeRichBridge {
  readonly limits: WorkspaceRichPolicy
  private readonly leases = new Map<string, Lease>()
  private closed = false
  /** @param port - native-only rendering operations. @param limits - public native byte and guest budgets. */
  constructor(private readonly port: WorkspaceNativeRichPort, limits: WorkspaceRichPolicy) { this.limits = limits }
  /** @param request - standard controller's committed content and canonical SDK. @returns a new native reservation, with no workspace authority in it. */
  acquire: NativeRichBridge['acquire'] = async request => {
    if (this.closed || this.leases.size >= this.limits.maxGuests) throw new Error('native rich capacity')
    const reservation = workspaceRichReservationSchema.parse(await this.port.request({ operation: 'acquire', request }))
    if (this.closed) { await this.port.request({ operation: 'release', lease: reservation.lease }); throw new Error('native rich closed') }
    this.leases.set(reservation.lease, { listeners: new Set() }); return reservation
  }
  /** @param lease - current reservation. @param container - trusted standard-plugin view. @returns disposer for its user-activated native entry. */
  attach = (lease: string, container: HTMLElement): (() => void) => {
    if (this.closed || !this.leases.has(lease)) return () => {}
    const button = container.ownerDocument.createElement('button'), label = container.getAttribute('aria-label')
    if (label === null) throw new Error('native rich view label missing')
    button.type = 'button'; button.textContent = label; button.dataset.workspaceRich = lease
    button.style.cssText = 'width:100%;height:100%;min-height:44px;font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-radius:8px;cursor:pointer'
    const open = () => { if (this.closed || !this.leases.has(lease)) return; void this.port.request({ operation: 'open', lease }).catch(error => { void error; this.receive(lease, { type: 'native.error', code: 'RICH_NATIVE_OPEN_FAILED' }) }) }
    button.addEventListener('click', open); container.append(button)
    return () => { button.removeEventListener('click', open); button.remove() }
  }
  /** @param lease - registered guest. @param packet - unchanged standard controller envelope. */
  send: NativeRichBridge['send'] = async (lease, packet) => {
    if (this.closed || !this.leases.has(lease)) throw new Error('native rich closed')
    await this.port.request(workspaceRichRequestSchema.parse({ operation: 'send', lease, packet }))
  }
  /** @param lease - current reservation. @param listener - standard controller's scoped packet validator. @returns unsubscribe. */
  subscribe: NativeRichBridge['subscribe'] = (lease, listener) => {
    const owner = this.leases.get(lease)
    if (this.closed || owner === undefined) throw new Error('native rich closed')
    owner.listeners.add(listener); return () => { owner.listeners.delete(listener) }
  }
  /** @param lease - native-selected lease, never selected by generated packet fields. @param packet - already bounded native guest JSON. */
  async receive(lease: string, packet: Record<string, unknown>): Promise<void> {
    if (this.closed) return
    await Promise.all([...(this.leases.get(lease)?.listeners ?? [])].map(listener => listener(packet)))
  }
  /** @param lease - original native reservation; stale releases are idempotent. */
  release: NativeRichBridge['release'] = async lease => { if (!this.leases.delete(lease) || this.closed) return; await this.port.request({ operation: 'release', lease }) }
  /** Stop local routing before the native document owner revokes every reservation. */
  close(): void { this.closed = true; this.leases.clear() }
}
