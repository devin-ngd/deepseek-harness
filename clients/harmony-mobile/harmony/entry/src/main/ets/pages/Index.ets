/** Native history scrolls above fixed conversation controls within the resized keyboard viewport; ArkWeb renders scoped rich blocks. */
import { common } from '@kit.AbilityKit'
import { util } from '@kit.ArkTS'
import { KeyboardAvoidMode, LengthMetrics } from '@kit.ArkUI'
import { NativeProductOwner } from '../product/NativeProductOwner'
import { NativeProductRichOwner } from '../product/NativeProductRichOwner'
import { ProductRichSurface } from '../product/ProductRichSurface'
import { ProductView, ProductProject, ProductSession, ProductMessage, ProductPairingPreview, ProductSavedScope } from '../product/ProductView'
import { productConfiguration } from '../product/ProductConfiguration'
import { NativeLifecycle } from '../native/NativeLifecycle'
import { NativeDiagnostics } from '../native/NativeDiagnostics'
import { TaskState } from '../components/TaskState'
@Entry
@Component
struct Index {
  @State private view: ProductView = new ProductView()
  @State private page: string = 'sessions'
  @State private showSetup: boolean = false
  @State private showDiagnostics: boolean = false
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
  @State private connectionHost: string = ''
  @State private routeOffer: string = ''
  @State private routeSummary: string = ''
  @State private routeReply: string = ''
  @State private routeApproved: boolean = false
  @State private savedScopes: ProductSavedScope[] = []
  @State private scopeEntry: boolean = false
  @State private logCheckState: string = ''
  private logDiagnostics: NativeDiagnostics = new NativeDiagnostics()
  private lastRequest: string = ''
  private drafts: Map<string, string> = new Map()
  private product: NativeProductOwner = new NativeProductOwner(productConfiguration)
  private rich: NativeProductRichOwner = new NativeProductRichOwner(this.product, productConfiguration.corePolicyJson)
  aboutToAppear(): void {
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE)
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext
    this.rich.initialize(context); NativeLifecycle.registerProduct(this.product, this.rich); this.busy = true
    this.networkApproved = false
    void this.product.initialize(context, (raw: string) => this.receiveView(JSON.parse(raw) as ProductView)).then(() => this.refreshConnectionControls()).catch((error: Error) => { void error; this.failed = true }).finally(() => { this.busy = false })
  }
  aboutToDisappear(): void { this.networkApproved = false; this.routeApproved = false; this.connectionEnabled = false; this.connectionHost = ''; void this.rich.close(); void this.product.close() }
  private refreshConnectionControls(): void {
    const enabled = this.product.connectionEnabled(), host = this.product.connectionHost()
    if (!enabled || host !== this.connectionHost) this.networkApproved = false
    this.connectionEnabled = enabled; this.connectionHost = host
  }
  private receiveView(next: ProductView): void {
    if (next.connectionGeneration !== this.view.connectionGeneration) this.networkApproved = false
    if (next.selected !== this.view.selected) { if (this.view.selected.length > 0) this.drafts.set(this.view.selected, this.draft); this.draft = this.drafts.get(next.selected) || ''; this.lastRequest = '' }
    this.view = next; this.refreshConnectionControls(); this.rich.setMount(this.view.richJson)
  }
  private async savePairing(): Promise<void> {
    const approved = this.networkApproved, host = this.preview.audience
    await this.product.pairWithConnection(this.publicOffer, this.compared, approved)
    this.refreshConnectionControls(); this.networkApproved = approved && host === this.connectionHost
  }
  private run(operation: () => Promise<void>): void { if (this.busy) return; this.busy = true; this.failed = false; void operation().catch((error: Error) => { void error; this.failed = true }).finally(() => { this.busy = false }) }
  private logSelfCheck(): void { this.logCheckState = this.logDiagnostics.localSelfCheck() ? 'requested' : 'failed' }
  private pairingLabel(): Resource { if (this.view.pairing === 'paired') return $r('app.string.product_paired'); if (this.view.pairing === 'revoked') return $r('app.string.product_revoked'); if (this.view.pairing === 'blocked') return $r('app.string.product_blocked'); return $r('app.string.product_unpaired') }
  private connectionLabel(): Resource { if (this.view.connection === 'connected') return $r('app.string.product_connected'); if (this.view.connection === 'connecting' || this.view.connection === 'recovering') return $r('app.string.product_connecting'); if (this.view.connection === 'blocked' || this.view.connection === 'closed') return $r('app.string.product_connection_stopped'); return $r('app.string.product_disconnected') }
  private rows(): ProductSession[] { return this.view.sessions.filter((row: ProductSession) => this.project === '' || row.projectId === this.project) }
  private selectedTitle(): string { const row = this.view.sessions.find((item: ProductSession) => item.sessionId === this.view.selected); return row === undefined ? '' : row.title }
  private async openSession(sessionId: string): Promise<void> { await this.product.select(sessionId); this.page = 'conversation' }
  build() {
    Column() {
    Scroll() {
    Column({ space: 10 }) {
      Text($r('app.string.mvp_title')).fontSize(24).fontWeight(FontWeight.Medium)
      Row({ space: 12 }) { Text(this.pairingLabel()); Text(this.connectionLabel()) }.width('100%')
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        Button($r('app.string.mvp_sessions')).id('product-nav-sessions').enabled(this.page !== 'sessions').onClick(() => { this.page = 'sessions' })
        Button($r('app.string.mvp_device')).id('product-nav-device').enabled(this.page !== 'device').onClick(() => { this.page = 'device' })
      }.width('100%')
      if (this.page === 'device') {
      if (!this.connectionEnabled) { Text($r('app.string.mvp_connection_prepare')).fontSize(14).width('100%') }
      if (this.failed || this.view.error.length > 0) { Text($r('app.string.product_operation_failed')).fontColor('#efb366').width('100%') }
      Button($r('app.string.mvp_setup')).id('product-setup-toggle').onClick(() => { this.showSetup = !this.showSetup })
      if (this.showSetup) {
      if (this.product.deviceBindingMode() && this.view.pairing === 'paired') {
        Column({ space: 8 }) {
          Text($r('app.string.product_route_notice')).width('100%')
          TextArea({ text: this.routeOffer, placeholder: $r('app.string.product_route_offer') }).id('product-route-offer').height(100).enabled(!this.busy).onChange((value: string) => { this.routeOffer = value; this.routeSummary = ''; this.routeReply = ''; this.routeApproved = false })
          Button($r('app.string.product_route_preview')).id('product-route-preview').enabled(!this.busy && this.routeOffer.length > 0).onClick(() => this.run(async () => { this.routeSummary = await this.product.previewRoute(this.routeOffer); this.routeApproved = false }))
          if (this.routeSummary.length > 0) { Text(this.routeSummary).fontSize(12).width('100%').copyOption(CopyOptions.LocalDevice); Row({ space: 8 }) { Checkbox().select(this.routeApproved).onChange((value: boolean) => { this.routeApproved = value }); Text($r('app.string.product_route_approve')).layoutWeight(1) } }
          Button($r('app.string.product_route_sign')).id('product-route-sign').enabled(!this.busy && this.routeApproved && this.routeSummary.length > 0).onClick(() => this.run(async () => { this.routeReply = await this.product.signRoute(this.routeOffer, this.routeApproved); this.routeApproved = false; this.refreshConnectionControls() }))
          if (this.routeReply.length > 0) { Text(this.routeReply).fontSize(12).width('100%').copyOption(CopyOptions.LocalDevice) }
        }.width('100%')
      }
      if (!this.product.deviceBindingMode()) {
      Button($r('app.string.product_scope_manage')).id('product-scope-manage').enabled(!this.busy).onClick(() => this.run(async () => { await this.rich.close(); this.savedScopes = JSON.parse(await this.product.listSavedScopes(true)) as ProductSavedScope[]; this.connectionEnabled = false; this.lastRequest = ''; this.scopeEntry = true; await this.rich.foreground() }))
      ForEach(this.savedScopes, (row: ProductSavedScope) => { Button(row.profileId + ' / ' + row.sessions.join(', ')).id('product-scope-' + row.key).width('100%').enabled(!this.busy).onClick(() => this.run(async () => { await this.rich.close(); this.publicOffer = await this.product.selectSavedScope(row.key, true); this.preview = JSON.parse(this.product.preview(this.publicOffer)) as ProductPairingPreview; this.identityAlias = this.preview.identityAlias; this.compared = false; this.networkApproved = false; this.connectionEnabled = false; this.lastRequest = ''; this.scopeEntry = true; await this.rich.foreground() })) }, (row: ProductSavedScope) => row.key)
      }
      if (this.scopeEntry || this.view.pairing === 'unpaired' || this.view.error === 'public-trust-expired') {
        Column({ space: 8 }) {
        Text(this.product.deviceBindingMode() ? $r('app.string.product_device_identity') : $r('app.string.product_identity_notice')).width('100%')
        TextInput({ text: this.identityAlias, placeholder: $r('app.string.product_identity_name') }).enabled(!this.busy).onChange((value: string) => { this.identityAlias = value; this.identityPending = false; this.identityPublic = '' })
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          if (!this.product.deviceBindingMode()) { Button($r('app.string.product_identity_begin')).id('product-identity-begin').enabled(this.identityAlias.length > 0 && !this.busy).onClick(() => { this.identityPending = true }) }
          Button($r('app.string.product_identity_existing')).enabled(this.identityAlias.length > 0 && !this.busy).onClick(() => this.run(async () => { this.identityPublic = await this.product.publicIdentity(this.identityAlias) }))
        }.width('100%')
        if (this.identityPending) { Text($r('app.string.product_identity_confirm_notice')).width('100%'); Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          Button($r('app.string.product_identity_confirm')).id('product-identity-confirm').enabled(!this.busy).onClick(() => this.run(async () => { this.identityPending = false; this.identityPublic = await this.product.initializeIdentity(this.identityAlias, true) }))
          Button($r('app.string.product_identity_deny')).enabled(!this.busy).onClick(() => { this.identityPending = false })
        }.width('100%') }
        if (this.identityPublic.length > 0) { Text(this.identityPublic).fontSize(12).width('100%').copyOption(CopyOptions.LocalDevice) }
        Text($r('app.string.product_enrollment_notice')).width('100%')
        TextArea({ text: this.enrollmentOffer, placeholder: $r('app.string.product_enrollment_offer') }).height(90).enabled(!this.busy).onChange((value: string) => { this.enrollmentOffer = value; this.enrollmentCompared = false; this.enrollmentReply = ''; this.enrollmentPreview = new ProductPairingPreview() })
        Button($r('app.string.product_enrollment_preview')).enabled(!this.busy && this.enrollmentOffer.length > 0).onClick(() => this.run(async () => { this.enrollmentPreview = JSON.parse(await this.product.previewEnrollment(this.enrollmentOffer)) as ProductPairingPreview }))
        if (this.enrollmentPreview.desktopFingerprint.length > 0) { Text(this.enrollmentPreview.audience).fontSize(12).width('100%'); Text(this.enrollmentPreview.operations.join(', ')).fontSize(12).width('100%'); Text($r('app.string.product_enrollment_deadline', new Date(this.enrollmentPreview.expiresAt).toISOString(), Math.ceil(this.enrollmentPreview.grantTtlMs / 60000))).fontSize(12).width('100%') }
        if (this.enrollmentPreview.desktopFingerprint.length > 0) { Text(this.enrollmentPreview.desktopFingerprint).fontSize(12).width('100%'); Text(this.enrollmentPreview.phoneFingerprint).fontSize(12).width('100%'); Text(this.enrollmentPreview.desktopId + ' / ' + this.enrollmentPreview.profileId + ' / ' + (this.enrollmentPreview.deviceBinding ? $r('app.string.product_device_scope') : this.enrollmentPreview.sessions.join(', '))).fontSize(12).width('100%'); Row({ space: 8 }) { Checkbox().select(this.enrollmentCompared).onChange((value: boolean) => { this.enrollmentCompared = value }); Text($r('app.string.product_compared')).layoutWeight(1) } }
        Button($r('app.string.product_enrollment_sign')).enabled(!this.busy && this.enrollmentCompared && this.enrollmentPreview.desktopFingerprint.length > 0).onClick(() => this.run(async () => { this.enrollmentReply = await this.product.signEnrollment(this.enrollmentOffer, this.enrollmentCompared); this.enrollmentCompared = false }))
        if (this.enrollmentReply.length > 0) { Text(this.enrollmentReply).fontSize(12).width('100%').copyOption(CopyOptions.LocalDevice) }
        Button($r('app.string.product_restore_saved')).enabled(!this.busy && (!this.connectionEnabled || this.view.error === 'public-trust-expired')).onClick(() => this.run(async () => { this.publicOffer = await this.product.savedPairing(true); this.preview = JSON.parse(this.product.preview(this.publicOffer)) as ProductPairingPreview; this.compared = false; this.networkApproved = false }))
        if (this.view.error === 'public-trust-expired') { Text($r('app.string.product_successor_notice')).width('100%') }
        Text($r('app.string.product_local_offer')).width('100%')
        TextArea({ text: this.publicOffer, placeholder: $r('app.string.product_public_offer') }).height(100).enabled(!this.busy).onChange((value: string) => { this.publicOffer = value; this.compared = false; this.networkApproved = false; this.preview = new ProductPairingPreview(); try { this.preview = JSON.parse(this.product.preview(value)) as ProductPairingPreview } catch (error) { void error } })
        if (this.preview.desktopFingerprint.length > 0) { Text($r('app.string.product_desktop_fingerprint')).fontSize(12); Text(this.preview.desktopFingerprint).fontSize(12).width('100%').copyOption(CopyOptions.InApp); Text($r('app.string.product_phone_fingerprint')).fontSize(12); Text(this.preview.phoneFingerprint).fontSize(12).width('100%').copyOption(CopyOptions.InApp); Text(this.preview.desktopId + ' / ' + this.preview.profileId + ' / ' + this.preview.sessions.join(', ')).fontSize(12).width('100%'); Text(this.preview.operations.join(', ')).fontSize(12).width('100%'); if (this.preview.deviceBinding) { Text($r('app.string.product_device_scope')).fontSize(12).width('100%') } else { Text($r('app.string.product_grant_summary', this.preview.grantEpoch, new Date(this.preview.expiresAt).toISOString())).fontSize(12).width('100%') }
        Text($r('app.string.product_pair_identifier', this.preview.pairId)).fontSize(12).width('100%'); Text(this.preview.operations.includes('task.submit') ? $r('app.string.product_write_scope') : $r('app.string.product_read_scope')).fontSize(12) }
        Row({ space: 8 }) { Checkbox().select(this.compared).onChange((value: boolean) => { this.compared = value }); Text($r('app.string.product_compared')).layoutWeight(1) }.width('100%')
        if (this.preview.audience.length > 0) { Text($r('app.string.product_network_notice')).width('100%'); Text(this.preview.audience).fontSize(12).width('100%'); Row({ space: 8 }) { Checkbox().select(this.networkApproved).onChange((value: boolean) => { this.networkApproved = value }); Text($r('app.string.product_network_allow')).layoutWeight(1) } }
        Button($r('app.string.product_confirm_pair')).id('product-confirm-pair').enabled(this.networkApproved && this.compared && this.preview.desktopFingerprint.length > 0 && !this.busy).onClick(() => this.run(() => this.savePairing()))
        if (!this.product.deviceBindingMode()) {
        Text($r('app.string.product_scope_new_notice')).width('100%')
        Button($r('app.string.product_scope_save_new')).id('product-scope-save-new').enabled(this.networkApproved && this.compared && this.preview.desktopFingerprint.length > 0 && !this.busy).onClick(() => this.run(async () => { await this.rich.close(); await this.product.saveNewScope(this.publicOffer, this.compared, this.networkApproved); this.connectionEnabled = this.product.connectionEnabled(); this.savedScopes = []; this.compared = false; this.networkApproved = false; this.lastRequest = ''; this.scopeEntry = false; await this.rich.foreground() }))
        }
        }.width('100%')
      }
      }
      if (this.product.deviceBindingMode() && this.view.pairing === 'paired' && this.connectionHost.length > 0) {
        Text($r('app.string.product_network_notice')).width('100%')
        Text(this.connectionHost).fontSize(12).width('100%')
        Row({ space: 8 }) { Checkbox().select(this.networkApproved).enabled(!this.busy).onChange((value: boolean) => { this.networkApproved = value }); Text($r('app.string.product_network_allow')).layoutWeight(1) }
      }
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
          Button($r('app.string.product_route_stop')).id('product-route-stop').enabled(!this.busy).onClick(() => this.run(async () => { await this.rich.close(); await this.product.stopRoute(); this.networkApproved = false; this.routeReply = ''; this.refreshConnectionControls(); await this.rich.foreground() }))
        Button($r('app.string.product_connect')).id('product-connect').enabled(this.connectionEnabled && this.networkApproved && this.view.pairing === 'paired' && (this.view.connection === 'disconnected' || this.view.connection === 'blocked' && this.view.error === 'connection-unavailable') && !this.busy).onClick(() => this.run(() => this.product.connect(this.networkApproved)))
      }.width('100%')
      Button($r('app.string.mvp_diagnostics')).id('product-diagnostics-toggle').onClick(() => { this.showDiagnostics = !this.showDiagnostics })
      if (this.showDiagnostics) {
      Button($r('app.string.product_log_selfcheck')).id('product-log-selfcheck').enabled(!this.busy).onClick(() => this.logSelfCheck())
      if (this.logCheckState.length > 0) { Text(this.logCheckState === 'requested' ? $r('app.string.product_log_selfcheck_requested') : $r('app.string.product_log_selfcheck_failed')).id('product-log-selfcheck-result').fontSize(12).width('100%') }
      if (typeof this.view.connectionDiagnostic === 'string' && this.view.connectionDiagnostic.length > 0) { Text($r('app.string.product_connection_diagnostic', this.view.connectionDiagnostic)).id('product-connection-diagnostic').fontSize(12).width('100%') }
      if (typeof this.view.startupDiagnostic === 'string' && this.view.startupDiagnostic.length > 0) { Text($r('app.string.product_startup_diagnostic', this.view.startupDiagnostic)).id('product-startup-diagnostic').fontSize(12).width('100%') }
      if (typeof this.view.startupStorage === 'string' && this.view.startupStorage.length > 0) { Text($r('app.string.product_startup_storage', this.view.startupStorage)).id('product-startup-storage').fontSize(12).width('100%') }
      if (this.view.storageRecovery === 'required') { Button($r('app.string.product_storage_recover')).id('product-storage-recover').enabled(!this.busy).onClick(() => this.run(() => this.product.recoverDeviceStorage(true))) }
      if (typeof this.view.storageRecoveryAudit === 'string' && this.view.storageRecoveryAudit.length > 0) { Text($r('app.string.product_storage_audit', this.view.storageRecoveryAudit)).id('product-storage-audit').width('100%') }
      if (this.view.storageRecovery === 'recovered') { Text($r('app.string.product_storage_recovered')).id('product-storage-recovered').width('100%') }
        Button($r('app.string.product_exit')).onClick(() => this.run(async () => { await this.rich.close(); await this.product.close(); const context = this.getUIContext().getHostContext() as common.UIAbilityContext; await context.terminateSelf() }))
        Button($r('app.string.product_revoke')).enabled(this.view.pairing === 'paired' && !this.busy).onClick(() => { this.revokePending = true })
      if (this.revokePending) { Text($r('app.string.product_revoke_notice')).width('100%'); Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) { Button($r('app.string.product_confirm_revoke')).onClick(() => this.run(async () => { await this.product.revoke(); this.revokePending = false })); Button($r('app.string.product_keep_pair')).onClick(() => { this.revokePending = false }) }.width('100%') }
      }
      }
      if (this.page === 'sessions') {
        if (this.failed || this.view.error.length > 0) { Text($r('app.string.product_operation_failed')).width('100%') }
        Text($r('app.string.mvp_sessions')).fontSize(20).fontWeight(FontWeight.Medium).width('100%')
        if (this.view.connection !== 'connected') {
          Text($r('app.string.mvp_offline')).width('100%')
          Button($r('app.string.mvp_go_connect')).id('product-home-connect').onClick(() => { this.page = 'device' })
        }
        if (this.view.connection === 'connected' && this.rows().length === 0) { Text($r('app.string.mvp_no_sessions')).width('100%') }
      Column({ space: 6 }) {
        Button($r('app.string.product_all_sessions')).onClick(() => { this.project = '' })
        ForEach(this.view.projects, (row: ProductProject) => { Button(row.title).width('100%').onClick(() => { this.project = row.projectId }) }, (row: ProductProject) => row.projectId)
        ForEach(this.rows(), (row: ProductSession) => { Button(row.title).id('product-session-' + row.sessionId).width('100%').enabled(this.view.connection === 'connected' && !this.busy).onClick(() => this.run(() => this.openSession(row.sessionId))) }, (row: ProductSession) => row.sessionId)
      }.width('100%')
      }
      if (this.page === 'conversation') {
        Button($r('app.string.mvp_back')).id('product-chat-back').onClick(() => { this.page = 'sessions' })
        Text(this.selectedTitle()).fontSize(20).fontWeight(FontWeight.Medium).width('100%')
        if (this.view.readOnly) { Text($r('app.string.mvp_read_only')).width('100%') }
        if (this.view.connection !== 'connected') { Text($r('app.string.mvp_offline')).width('100%') }
        if (this.failed || this.view.error.length > 0) { Text($r('app.string.product_operation_failed')).width('100%') }
      TaskState({ status: this.view.task })
      Column({ space: 12 }) {
        ForEach(this.view.messages, (message: ProductMessage) => { Column({ space: 6 }) { Text(message.role === 'user' ? $r('app.string.role_user') : $r('app.string.role_assistant')).fontWeight(FontWeight.Bold); Text(message.text).width('100%').copyOption(CopyOptions.InApp) }.alignItems(HorizontalAlign.Start).width('100%') }, (message: ProductMessage) => message.id)
        if (this.view.liveText.length > 0) { Text(this.view.liveText).id('product-live-text').width('100%') }
      }.width('100%')
      ProductRichSurface({ owner: this.rich }).height(this.view.richJson.length > 0 ? 240 : 1).visibility(this.view.richJson.length > 0 ? Visibility.Visible : Visibility.Hidden)
      }
    }.padding(16).width('100%')
    }.id('product-page-scroll').scrollable(ScrollDirection.Vertical).width('100%').layoutWeight(1)
    if (this.page === 'conversation') {
    Column({ space: 10 }) {
      TextInput({ text: this.draft, placeholder: $r('app.string.product_composer') }).id('product-composer').width('100%').onChange((value: string) => { this.draft = value })
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        Button($r('app.string.product_send')).id('product-send').enabled(this.view.selected.length > 0 && !this.view.readOnly && this.view.connection === 'connected' && !this.busy && this.draft.trim().length > 0).onClick(() => this.run(async () => { this.lastRequest = util.generateRandomUUID(false); await this.product.submit(this.lastRequest, this.draft); this.draft = '' }))
        Button($r('app.string.product_stop')).id('product-cancel').enabled(this.view.selected.length > 0 && !this.view.readOnly && this.view.connection === 'connected' && !this.busy).onClick(() => this.run(() => this.product.cancel()))
        Button($r('app.string.product_reconcile')).enabled(this.lastRequest.length > 0 && this.view.selected.length > 0 && !this.busy).onClick(() => this.run(async () => { await this.product.receipt(this.lastRequest) }))
      }.id('product-task-actions').width('100%')
    }.id('product-conversation-controls').padding(16).width('100%')
    }
    }.width('100%').height('100%')
  }
}
