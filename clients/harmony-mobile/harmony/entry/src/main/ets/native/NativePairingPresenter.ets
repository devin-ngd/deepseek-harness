/** Native decision owner shared by the actual confirmation page and offline SDK-substitute tests; it never grants desktop access or signs bytes. */
import { NativePairingConsent, PairingView } from './NativePairingConsent'
/** Explicit owner scheduler; expiry is not inferred from an HTTP or guest event. */
export interface NativePairingScheduler { after(delayMs: number, callback: () => void): () => void }
/** Each pending decision refers to one exact view. No remote JSON can resolve this promise. */
export class NativePairingPresenter {
  private authority: object
  private clock: () => number
  private scheduler: NativePairingScheduler
  private show: (view: PairingView) => void
  private owner: NativePairingConsent
  private current: PairingView | undefined = undefined
  private complete: ((value: PairingView | undefined) => void) | undefined = undefined
  private stop: () => void = () => {}
  private closed: boolean = false
  constructor(authority: object, clock: () => number, scheduler: NativePairingScheduler, show: (view: PairingView) => void) { this.authority = authority; this.clock = clock; this.scheduler = scheduler; this.show = show; this.owner = new NativePairingConsent(authority, clock) }
  requestNative(authority: object, view: PairingView): Promise<PairingView | undefined> {
    if (authority !== this.authority || this.closed) throw new Error('native pairing unavailable')
    this.cancelNative(authority); this.owner.offer(authority, view); this.current = view
    const pending = new Promise<PairingView | undefined>(resolve => { this.complete = resolve })
    this.stop = this.scheduler.after(view.expiresAt - this.clock(), () => this.cancelNative(authority))
    try { this.show(view) } catch (error) { void error; this.cancelNative(authority); throw new Error('native pairing presentation failed') }
    return pending
  }
  decideNative(authority: object, view: PairingView, compared: boolean, allow: boolean): void {
    if (authority !== this.authority || this.closed || this.current !== view) throw new Error('native pairing decision stale')
    if (!allow) { this.cancelNative(authority); return }
    this.owner.compare(authority, view, compared); const receipt = this.owner.accept(authority, view), complete = this.complete
    this.stop(); this.current = undefined; this.complete = undefined; complete?.(receipt)
  }
  cancelNative(authority: object): void {
    if (authority !== this.authority) throw new Error('native pairing local only')
    this.stop(); this.owner.clear(authority); const complete = this.complete; this.current = undefined; this.complete = undefined; complete?.(undefined)
  }
  closeNative(authority: object): void { if (authority !== this.authority) throw new Error('native pairing local only'); this.closed = true; this.cancelNative(authority) }
}
