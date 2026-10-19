/** Native product UI owns pairing, catalogue, composer and transcript; ArkWeb renders only scoped rich blocks. */
import { common } from '@kit.AbilityKit'
import { util } from '@kit.ArkTS'
import { NativeProductOwner } from '../product/NativeProductOwner'
import { NativeProductRichOwner } from '../product/NativeProductRichOwner'
import { ProductRichSurface } from '../product/ProductRichSurface'
import { ProductView, ProductProject, ProductSession, ProductMessage, ProductPairingPreview } from '../product/ProductView'
import { productConfiguration } from '../product/ProductConfiguration'
import { NativeLifecycle } from '../native/NativeLifecycle'
import { TaskState } from '../components/TaskState'
@Entry
@Component
struct Index {
  @State private view: ProductView = new ProductView()
  @State private draft: string = ''
  @State private publicOffer: string = ''
  @State private compared: boolean = false
  @State private preview: ProductPairingPreview = new ProductPairingPreview()
  @State private busy: boolean = false
  @State private failed: boolean = false
  @State private project: string = ''
  @State private revokePending: boolean = false
  @State private identityPending: boolean = false
  @State private identityPublic: string = ''
  @State private identityAlias: string = ''
  @State private enrollmentOffer: string = ''
  @State private enrollmentPreview: ProductPairingPreview = new ProductPairingPreview()
  @State private enrollmentCompared: boolean = false
  @State private enrollmentReply: string = ''
  @State private networkApproved: boolean = false
  @State private connectionEnabled: boolean = false
  private lastRequest: string = ''
  private product: NativeProductOwner = new NativeProductOwner(productConfiguration)
  private rich: NativeProductRichOwner = new NativeProductRichOwner(this.product, productConfiguration.corePolicyJson)
  aboutToAppear(): void {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext
    this.rich.initialize(context); NativeLifecycle.registerProduct(this.product, this.rich); this.busy = true
    void this.product.initialize(context, (raw: string) => { this.view = JSON.parse(raw) as ProductView; this.rich.setMount(this.view.richJson) }).catch((error: Error) => { void error; this.failed = true }).finally(() => { this.busy = false })
  }
  aboutToDisappear(): void { void this.rich.close(); void this.product.close() }
  private run(operation: () => Promise<void>): void { if (this.busy) return; this.busy = true; this.failed = false; void operation().catch((error: Error) => { void error; this.failed = true }).finally(() => { this.busy = false }) }
  private pairingLabel(): Resource { if (this.view.pairing === 'paired') return $r('app.string.product_paired'); if (this.view.pairing === 'revoked') return $r('app.string.product_revoked'); if (this.view.pairing === 'blocked') return $r('app.string.product_blocked'); return $r('app.string.product_unpaired') }
  private connectionLabel(): Resource { if (this.view.connection === 'connected') return $r('app.string.product_connected'); if (this.view.connection === 'connecting' || this.view.connection === 'recovering') return $r('app.string.product_connecting'); return $r('app.string.product_disconnected') }
  private rows(): ProductSession[] { return this.view.sessions.filter((row: ProductSession) => this.project === '' || row.projectId === this.project) }
  build() {
    Column({ space: 10 }) {
      Text($r('app.string.title')).fontSize(24).fontWeight(FontWeight.Bold)
      Row({ space: 12 }) { Text(this.pairingLabel()); Text(this.connectionLabel()) }.width('100%')
      if (!this.connectionEnabled) { Text($r('app.string.product_disabled')).fontSize(13).width('100%') }
      if (this.failed || this.view.error.length > 0) { Text($r('app.string.product_operation_failed')).fontColor('#efb366').width('100%') }
      if (this.view.pairing === 'unpaired') {
        Scroll() { Column({ space: 8 }) {
        Text($r('app.string.product_identity_notice')).width('100%')
        TextInput({ text: this.identityAlias, placeholder: $r('app.string.product_identity_name') }).enabled(!this.busy).onChange((value: string) => { this.identityAlias = value; this.identityPending = false; this.identityPublic = '' })
        Row({ space: 8 }) {
          Button($r('app.string.product_identity_begin')).id('product-identity-begin').enabled(this.identityAlias.length > 0 && !this.busy).onClick(() => { this.identityPending = true })
          Button($r('app.string.product_identity_existing')).enabled(this.identityAlias.length > 0 && !this.busy).onClick(() => this.run(async () => { this.identityPublic = await this.product.publicIdentity(this.identityAlias) }))
        }
        if (this.identityPending) { Text($r('app.string.product_identity_confirm_notice')).width('100%'); Row({ space: 8 }) {
          Button($r('app.string.product_identity_confirm')).id('product-identity-confirm').enabled(!this.busy).onClick(() => this.run(async () => { this.identityPending = false; this.identityPublic = await this.product.initializeIdentity(this.identityAlias, true) }))
          Button($r('app.string.product_identity_deny')).enabled(!this.busy).onClick(() => { this.identityPending = false })
        } }
        if (this.identityPublic.length > 0) { Text(this.identityPublic).fontSize(12).width('100%').copyOption(CopyOptions.LocalDevice) }
        Text($r('app.string.product_enrollment_notice')).width('100%')
        TextArea({ text: this.enrollmentOffer, placeholder: $r('app.string.product_enrollment_offer') }).height(90).enabled(!this.busy).onChange((value: string) => { this.enrollmentOffer = value; this.enrollmentCompared = false; this.enrollmentReply = ''; this.enrollmentPreview = new ProductPairingPreview() })
        Button($r('app.string.product_enrollment_preview')).enabled(!this.busy && this.enrollmentOffer.length > 0).onClick(() => this.run(async () => { this.enrollmentPreview = JSON.parse(await this.product.previewEnrollment(this.enrollmentOffer)) as ProductPairingPreview }))
        if (this.enrollmentPreview.desktopFingerprint.length > 0) { Text(this.enrollmentPreview.audience).fontSize(12).width('100%'); Text(this.enrollmentPreview.operations.join(', ')).fontSize(12).width('100%'); Text($r('app.string.product_enrollment_deadline', new Date(this.enrollmentPreview.expiresAt).toISOString(), Math.ceil(this.enrollmentPreview.grantTtlMs / 60000))).fontSize(12).width('100%') }
        if (this.enrollmentPreview.desktopFingerprint.length > 0) { Text(this.enrollmentPreview.desktopFingerprint).fontSize(12).width('100%'); Text(this.enrollmentPreview.phoneFingerprint).fontSize(12).width('100%'); Text(this.enrollmentPreview.desktopId + ' / ' + this.enrollmentPreview.sessions.join(', ')).fontSize(12).width('100%'); Row({ space: 8 }) { Checkbox().select(this.enrollmentCompared).onChange((value: boolean) => { this.enrollmentCompared = value }); Text($r('app.string.product_compared')).layoutWeight(1) } }
        Button($r('app.string.product_enrollment_sign')).enabled(!this.busy && this.enrollmentCompared && this.enrollmentPreview.desktopFingerprint.length > 0).onClick(() => this.run(async () => { this.enrollmentReply = await this.product.signEnrollment(this.enrollmentOffer, this.enrollmentCompared); this.enrollmentCompared = false }))
        if (this.enrollmentReply.length > 0) { Text(this.enrollmentReply).fontSize(12).width('100%').copyOption(CopyOptions.LocalDevice) }
        Button($r('app.string.product_restore_saved')).enabled(!this.busy && !this.connectionEnabled).onClick(() => this.run(async () => { this.publicOffer = await this.product.savedPairing(true); this.preview = JSON.parse(this.product.preview(this.publicOffer)) as ProductPairingPreview; this.compared = false; this.networkApproved = false }))
        Text($r('app.string.product_local_offer')).width('100%')
        TextArea({ text: this.publicOffer, placeholder: $r('app.string.product_public_offer') }).height(100).enabled(!this.busy).onChange((value: string) => { this.publicOffer = value; this.compared = false; this.networkApproved = false; this.preview = new ProductPairingPreview(); try { this.preview = JSON.parse(this.product.preview(value)) as ProductPairingPreview } catch (error) { void error } })
        if (this.preview.desktopFingerprint.length > 0) { Text($r('app.string.product_desktop_fingerprint')).fontSize(12); Text(this.preview.desktopFingerprint).fontSize(12).width('100%').copyOption(CopyOptions.InApp); Text($r('app.string.product_phone_fingerprint')).fontSize(12); Text(this.preview.phoneFingerprint).fontSize(12).width('100%').copyOption(CopyOptions.InApp); Text(this.preview.desktopId + ' / ' + this.preview.sessions.join(', ')).fontSize(12).width('100%'); Text(this.preview.operations.includes('task.submit') ? $r('app.string.product_write_scope') : $r('app.string.product_read_scope')).fontSize(12) }
        Row({ space: 8 }) { Checkbox().select(this.compared).onChange((value: boolean) => { this.compared = value }); Text($r('app.string.product_compared')).layoutWeight(1) }.width('100%')
        if (this.preview.audience.length > 0) { Text($r('app.string.product_network_notice')).width('100%'); Text(this.preview.audience).fontSize(12).width('100%'); Row({ space: 8 }) { Checkbox().select(this.networkApproved).onChange((value: boolean) => { this.networkApproved = value }); Text($r('app.string.product_network_allow')).layoutWeight(1) } }
        Button($r('app.string.product_confirm_pair')).id('product-confirm-pair').enabled(this.networkApproved && this.compared && this.preview.desktopFingerprint.length > 0 && !this.busy).onClick(() => this.run(async () => { await this.product.pairWithConnection(this.publicOffer, this.compared, this.networkApproved); this.connectionEnabled = this.product.connectionEnabled() }))
        }.width('100%') }.height(360).width('100%')
      }
      Row({ space: 8 }) {
        Button($r('app.string.product_connect')).id('product-connect').enabled(this.connectionEnabled && this.view.pairing === 'paired' && this.view.connection !== 'connected' && !this.busy).onClick(() => this.run(() => this.product.connect()))
        Button($r('app.string.product_reconcile')).enabled(this.lastRequest.length > 0 && this.view.selected.length > 0 && !this.busy).onClick(() => this.run(async () => { await this.product.receipt(this.lastRequest) }))
        Button($r('app.string.product_exit')).onClick(() => this.run(async () => { await this.rich.close(); await this.product.close(); const context = this.getUIContext().getHostContext() as common.UIAbilityContext; await context.terminateSelf() }))
      }.width('100%')
      Scroll() { Column({ space: 6 }) {
        Button($r('app.string.product_all_sessions')).onClick(() => { this.project = '' })
        ForEach(this.view.projects, (row: ProductProject) => { Button(row.title).width('100%').onClick(() => { this.project = row.projectId }) }, (row: ProductProject) => row.projectId)
        ForEach(this.rows(), (row: ProductSession) => { Button(row.title).id('product-session-' + row.sessionId).width('100%').enabled(!this.busy).onClick(() => this.run(() => this.product.select(row.sessionId))) }, (row: ProductSession) => row.sessionId)
      }.width('100%') }.height(this.view.selected.length > 0 ? 100 : 200)
      TaskState({ status: this.view.task })
      List({ space: 12 }) {
        ForEach(this.view.messages, (message: ProductMessage) => { ListItem() { Column({ space: 6 }) { Text(message.role === 'user' ? $r('app.string.role_user') : $r('app.string.role_assistant')).fontWeight(FontWeight.Bold); Text(message.text).width('100%').copyOption(CopyOptions.InApp) }.alignItems(HorizontalAlign.Start).width('100%') } }, (message: ProductMessage) => message.id)
        if (this.view.liveText.length > 0) { ListItem() { Text(this.view.liveText).id('product-live-text').width('100%') } }
      }.layoutWeight(1)
      ProductRichSurface({ owner: this.rich }).height(this.view.richJson.length > 0 ? 240 : 1).visibility(this.view.richJson.length > 0 ? Visibility.Visible : Visibility.Hidden)
      TextInput({ text: this.draft, placeholder: $r('app.string.composer') }).onChange((value: string) => { this.draft = value })
      Row({ space: 8 }) {
        Button($r('app.string.send')).id('product-send').layoutWeight(1).enabled(this.view.selected.length > 0 && !this.view.readOnly && this.view.connection === 'connected' && !this.busy && this.draft.trim().length > 0).onClick(() => this.run(async () => { this.lastRequest = util.generateRandomUUID(false); await this.product.submit(this.lastRequest, this.draft); this.draft = '' }))
        Button($r('app.string.cancel')).layoutWeight(1).enabled(this.view.selected.length > 0 && !this.view.readOnly && !this.busy).onClick(() => this.run(() => this.product.cancel()))
        Button($r('app.string.product_revoke')).enabled(this.view.pairing === 'paired' && !this.busy).onClick(() => { this.revokePending = true })
      }.width('100%')
      if (this.revokePending) { Text($r('app.string.product_revoke_notice')).width('100%'); Row({ space: 8 }) { Button($r('app.string.product_confirm_revoke')).onClick(() => this.run(async () => { await this.product.revoke(); this.revokePending = false })); Button($r('app.string.product_keep_pair')).onClick(() => { this.revokePending = false }) } }
    }.padding(16).width('100%').height('100%')
  }
}
