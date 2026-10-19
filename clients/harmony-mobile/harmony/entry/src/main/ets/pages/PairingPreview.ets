/** Permission-free native confirmation preview. All identifiers/fingerprints are explicitly synthetic; no pairing provider or signer is constructed. */
import { PairingView } from '../native/NativePairingConsent'
import { NativePairingPresenter, NativePairingScheduler } from '../native/NativePairingPresenter'
class PreviewAuthority { readonly previewOnly: boolean = true }
class PreviewScheduler implements NativePairingScheduler { after(delayMs: number, callback: () => void): () => void { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer) } }
@Entry
@Component
struct PairingPreview {
  private authority: object = new PreviewAuthority()
  private owner: NativePairingPresenter = new NativePairingPresenter(this.authority, () => Date.now(), new PreviewScheduler(), (view: PairingView) => { this.offer = view; this.compared = false; this.completed = false })
  @State offer: PairingView = new PairingView('p256-sha256-' + '1'.repeat(64), 'p256-sha256-' + '2'.repeat(64), 'FAKE-desktop', 'FAKE-profile', 'FAKE-device', 'FAKE-session', 'session.sync, task.receipt', Date.now() + 300000, 60000)
  @State compared: boolean = false
  @State completed: boolean = false
  aboutToAppear(): void { void this.owner.requestNative(this.authority, this.offer).then(() => { this.completed = true; this.compared = false }) }
  aboutToDisappear(): void { this.owner.closeNative(this.authority) }
  build() {
    Scroll() {
      Column({ space: 16 }) {
        Text($r('app.string.pairing_preview_title')).fontSize(24).fontWeight(FontWeight.Bold)
        Text($r('app.string.pairing_preview_notice'))
        Text($r('app.string.pairing_desktop_fingerprint'))
        Text(this.offer.desktopFingerprint).fontFamily('monospace').copyOption(CopyOptions.None)
        Text($r('app.string.pairing_phone_fingerprint'))
        Text(this.offer.phoneFingerprint).fontFamily('monospace').copyOption(CopyOptions.None)
        Text($r('app.string.pairing_scope', this.offer.desktopId, this.offer.profileId, this.offer.deviceId, this.offer.sessionIds, this.offer.operations, this.offer.grantTtlMs.toString()))
        Text($r('app.string.pairing_deadline', this.offer.expiresAt.toString()))
        Checkbox().select(this.compared).onChange((value: boolean) => { this.compared = value })
        Text($r('app.string.pairing_compared'))
        Button($r('app.string.pairing_deny')).enabled(!this.completed).onClick(() => { this.owner.decideNative(this.authority, this.offer, false, false) })
        Button($r('app.string.pairing_confirm')).enabled(this.compared && !this.completed).onClick(() => { try { this.owner.decideNative(this.authority, this.offer, this.compared, true) } catch (error) { void error; this.owner.cancelNative(this.authority); this.compared = false; this.completed = true } })
        if (this.completed) { Text($r('app.string.pairing_preview_finished')) }
      }.padding(24).width('100%')
    }.width('100%').height('100%')
  }
}
