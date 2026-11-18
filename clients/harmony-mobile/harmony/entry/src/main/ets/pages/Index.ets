/** Dark native client: a fixed header with the error banner, one history Scroll and the conversation footer share the resized keyboard viewport; ArkWeb renders scoped rich blocks. */
import { common } from '@kit.AbilityKit'
import { util } from '@kit.ArkTS'
import { FrameCallback, KeyboardAvoidMode, LengthMetrics, SymbolGlyphModifier } from '@kit.ArkUI'
import { NativeProductOwner } from '../product/NativeProductOwner'
import { NativeProductRichOwner } from '../product/NativeProductRichOwner'
import { ProductRichSurface } from '../product/ProductRichSurface'
import { NativeWorkspaceOwner } from '../product/NativeWorkspaceOwner'
import { WorkspaceSurface } from '../product/WorkspaceSurface'
import { WorkspaceRichSurface } from '../product/WorkspaceRichSurface'
import { ProductView, ProductProject, ProductSession, ProductMessage, ProductPairingPreview, ProductSavedScope, ProductCreationOptions, ProductCreationPreset, ProductCreationModel, ProductModelSelection } from '../product/ProductView'
import { productConfiguration } from '../product/ProductConfiguration'
import { NativeLifecycle } from '../native/NativeLifecycle'
import { NativeDiagnostics } from '../native/NativeDiagnostics'
import { TaskState, taskLabel, taskTone } from '../components/TaskState'
import { MessageView } from '../components/MessageView'

@Extend(Button) function primaryAction() { .type(ButtonType.Capsule).constraintSize({ minHeight: 44 }).fontSize(15).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_on_accent')).backgroundColor($r('app.color.accent')) }
@Extend(Button) function secondaryAction() { .type(ButtonType.Capsule).constraintSize({ minHeight: 44 }).fontSize(14).fontColor($r('app.color.text_primary')).backgroundColor($r('app.color.surface_high')) }
@Extend(Button) function dangerAction() { .type(ButtonType.Capsule).constraintSize({ minHeight: 44 }).fontSize(14).fontColor($r('app.color.danger')).backgroundColor($r('app.color.danger_soft')) }
@Extend(Button) function chip(selected: boolean) { .type(ButtonType.Capsule).height(32).fontSize(13).padding({ left: 14, right: 14 }).fontColor(selected ? $r('app.color.text_on_accent') : $r('app.color.text_secondary')).backgroundColor(selected ? $r('app.color.accent') : $r('app.color.surface')) }
@Extend(Text) function bodyText() { .fontSize(14).lineHeight(21).fontColor($r('app.color.text_secondary')).width('100%') }
@Extend(Text) function detailText() { .fontSize(12).lineHeight(18).fontColor($r('app.color.text_tertiary')).width('100%') }
@Extend(TextArea) function areaField() { .backgroundColor($r('app.color.surface_high')).fontColor($r('app.color.text_primary')).placeholderColor($r('app.color.text_tertiary')).borderRadius(12) }
@Extend(TextInput) function inputField() { .backgroundColor($r('app.color.surface_high')).fontColor($r('app.color.text_primary')).placeholderColor($r('app.color.text_tertiary')).borderRadius(12) }
@Extend(Text) function segment(selected: boolean) { .height(32).layoutWeight(1).textAlign(TextAlign.Center).borderRadius(9).fontSize(14).fontWeight(selected ? FontWeight.Medium : FontWeight.Normal).fontColor(selected ? $r('app.color.text_primary') : $r('app.color.text_secondary')).backgroundColor(selected ? $r('app.color.surface_high') : Color.Transparent) }
@Styles function card() { .width('100%').padding(14).backgroundColor($r('app.color.surface')).borderRadius(16) }

/** Project section of the grouped list; `key` is '' for Sessions outside every project. */
class SessionGroup { key: string = ''; projectId: string | null = null; title: string = ''; rows: ProductSession[] = []; latest: number = 0 }
class HistoryFrame extends FrameCallback {
  private readonly done: () => void
  constructor(done: () => void) { super(); this.done = done }
  onFrame(_frameTimeInNano: number): void { this.done() }
  onIdle(_timeLeftInNano: number): void {}
}
interface CreateIntent { action: string; projectId: string | null; agentPreset?: string; model?: ProductModelSelection }
interface CreationRecovery { projectId: string | null; knownSessions: Set<string> }
interface SessionIntent { action: string; sessionId: string }
interface MessageRowRevision { message: ProductMessage; revision: number }

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
  @State private listMode: string = 'recent'
  @State private listFilter: string = 'active'
  @State private query: string = ''
  @State private collapsed: string[] = []
  @State private created: string[] = []
  @State private newSheet: boolean = false
  @State private creation: ProductCreationOptions = new ProductCreationOptions()
  @State private creationLoading: boolean = false
  @State private creationUnavailable: boolean = false
  @State private creationFailed: boolean = false
  @State private creationProjectId: string = ''
  @State private creationPreset: number = -1
  @State private creationModel: number = -1
  @State private creationEffort: number = -1
  @State private workspaceState: string = ''
  @State private workspaceStartupFailure: string = ''
  @State private workspaceViewGeneration: number = 0
  @State private workspaceMounted: boolean = false
  @State private workspaceRich: boolean = false
  @State private workspaceRichCloseFailed: boolean = false
  @State private workspacePlugin: string = ''
  private richCloseGeneration: number = 0
  private workspaceOpening: boolean = false
  private creationGeneration: number = 0
  private creationRecovery: CreationRecovery | undefined = undefined
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
  @State private stickToBottom: boolean = true
  @State private expandedProcesses: string[] = []
  @State private historyRefreshing: boolean = false
  @State private historyNotice: string = ''
  @State private historyViewportHeight: number = 1
  private historyRequest: number = 0
  private openingSession: string = ''
  private historyContentHeight: number = 0
  private historyAnchorHeight: number = -1
  private historyAnchorOffset: number = 0
  private messageRowRevision: number = 0
  private messageRows: Map<string, MessageRowRevision> = new Map()
  @State private dismissedError: string = ''
  private scroller: Scroller = new Scroller()
  private logDiagnostics: NativeDiagnostics = new NativeDiagnostics()
  private lastRequest: string = ''
  private drafts: Map<string, string> = new Map()
  private draftSessionId: string = ''
  private product: NativeProductOwner = new NativeProductOwner(productConfiguration)
  private rich: NativeProductRichOwner = new NativeProductRichOwner(this.product, productConfiguration.corePolicyJson)
  private workspace: NativeWorkspaceOwner = new NativeWorkspaceOwner(this.product, productConfiguration.corePolicyJson)
  aboutToAppear(): void {
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE)
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext
    this.rich.initialize(context); NativeLifecycle.registerProduct(this.product, this.rich); this.busy = true
    this.workspace.initialize(context, (state: string) => this.onWorkspaceState(state)); NativeLifecycle.registerWorkspace(this.workspace)
    this.networkApproved = false
    void this.product.initialize(context, (raw: string) => this.receiveView(JSON.parse(raw) as ProductView)).then(() => this.refreshConnectionControls()).catch((error: Error) => { void error; this.failed = true }).finally(() => { this.busy = false })
  }
  aboutToDisappear(): void { this.networkApproved = false; this.routeApproved = false; this.connectionEnabled = false; this.connectionHost = ''; void this.workspace.close().finally(() => this.product.close()).catch((error: Error) => { void error; this.failed = true }); void this.rich.close() }
  private onWorkspaceState(state: string): void {
    if (state === 'unmount') {
      this.workspaceMounted = false
      if (this.workspaceState !== 'failed') this.workspaceState = 'closed'
    } else if (state === 'rich-open') { this.workspaceRich = true; this.workspaceRichCloseFailed = false }
    else if (state === 'rich-closed') this.workspaceRich = false
    else this.workspaceState = state
  }
  onBackPress(): boolean { if (this.page === 'sessions') return false; if (this.page === 'workspace') this.run(() => this.workspaceBack()); else this.showPage('sessions'); return true }
  private refreshConnectionControls(): void {
    const enabled = this.product.connectionEnabled(), host = this.product.connectionHost()
    if (!enabled || host !== this.connectionHost) this.networkApproved = false
    this.connectionEnabled = enabled; this.connectionHost = host
  }
  private updateMessageRows(next: ProductView): void {
    const rows = new Map<string, MessageRowRevision>()
    const sameSession = next.selected === this.view.selected
    for (const message of next.messages) {
      const previous = sameSession ? this.messageRows.get(message.id) : undefined
      if (previous !== undefined && previous.message.role === message.role && previous.message.text === message.text
        && previous.message.processKey === message.processKey && previous.message.processText === message.processText
        && previous.message.richPending === message.richPending) {
        rows.set(message.id, previous)
      } else {
        rows.set(message.id, { message, revision: ++this.messageRowRevision })
      }
    }
    this.messageRows = rows
  }
  private receiveView(next: ProductView): void {
    if (next.selected !== this.view.selected) this.expandedProcesses = []
    else if (this.view.liveText.length > 0 && next.liveText.length === 0) {
      this.expandedProcesses = this.expandedProcesses.filter((key: string) => key !== 'live')
    }
    if (next.selected !== this.view.selected || next.connectionGeneration !== this.view.connectionGeneration || next.connection !== this.view.connection && next.connection !== 'connected') {
      this.resetHistoryPull()
    } else if (this.historyRefreshing && this.view.messages.length > 0
      && next.messages.findIndex((row: ProductMessage) => row.id === this.view.messages[0].id) > 0) {
      this.historyAnchorHeight = this.historyContentHeight
      this.historyAnchorOffset = this.scroller.currentOffset().yOffset
      this.stickToBottom = false
    }
    if ((this.page === 'workspace' || this.workspaceOpening) && (next.connection !== 'connected' || next.connectionGeneration !== this.view.connectionGeneration)) {
      this.workspaceOpening = false
      this.richCloseGeneration++
      const generation = this.workspaceViewGeneration
      void this.workspace.close().catch((error: Error) => { void error; this.failed = true }).finally(() => {
        if (this.page === 'workspace' && generation === this.workspaceViewGeneration) { this.workspaceRich = false; this.showPage('sessions') }
      })
    }
    if (next.connectionGeneration !== this.view.connectionGeneration) this.networkApproved = false
    if (next.selected.length > 0 && next.selected !== this.draftSessionId) { if (this.draftSessionId.length > 0) this.drafts.set(this.draftSessionId, this.draft); this.draft = this.drafts.get(next.selected) || ''; this.draftSessionId = next.selected; this.lastRequest = '' }
    if (next.error === '') this.dismissedError = ''
    if (next.connection !== 'connected') this.newSheet = false
    if (next.pairing !== 'paired') { this.creationRecovery = undefined; this.creationFailed = false }
    const retiredPreview = this.view.historySyncing === true && next.selected === ''
    this.updateMessageRows(next)
    this.view = next; this.refreshConnectionControls(); this.rich.setMount(this.view.richJson)
    if (next.historySyncing === true && next.selected === this.openingSession && this.page === 'sessions') {
      this.openingSession = ''
      this.showPage('conversation')
    } else if (retiredPreview && this.page === 'conversation') {
      this.showPage('sessions')
    }
  }
  private async savePairing(): Promise<void> {
    const approved = this.networkApproved, host = this.preview.audience
    await this.product.pairWithConnection(this.publicOffer, this.compared, approved)
    this.refreshConnectionControls(); this.networkApproved = approved && host === this.connectionHost
  }
  /** Tapping the button that names the current host is the network approval; a host that changed or was withdrawn after rendering refuses. */
  private async connectShownHost(host: string): Promise<void> {
    this.refreshConnectionControls()
    if (host.length === 0 || host !== this.connectionHost || !this.connectionEnabled) throw new Error('connection host changed before approval')
    await this.product.connect(true)
  }
  private connectable(): boolean { return this.connectionEnabled && this.connectionHost.length > 0 && this.view.pairing === 'paired' && (this.view.connection === 'disconnected' || this.view.connection === 'blocked' && this.view.error === 'connection-unavailable') }
  private connecting(): boolean { return this.view.connection === 'connecting' || this.view.connection === 'recovering' }
  private run(operation: () => Promise<void>): void { if (this.busy) return; this.busy = true; this.failed = false; this.workspaceStartupFailure = ''; void operation().catch((error: Error) => { void error; this.failed = true }).finally(() => { this.busy = false }) }
  private logSelfCheck(): void { this.logCheckState = this.logDiagnostics.localSelfCheck() ? 'requested' : 'failed' }
  private pairingLabel(): Resource { if (this.view.pairing === 'paired') return $r('app.string.product_paired'); if (this.view.pairing === 'revoked') return $r('app.string.product_revoked'); if (this.view.pairing === 'blocked') return $r('app.string.product_blocked'); return $r('app.string.product_unpaired') }
  private connectionLabel(): Resource { if (this.view.connection === 'connected') return $r('app.string.product_connected'); if (this.view.connection === 'connecting' || this.view.connection === 'recovering') return $r('app.string.product_connecting'); if (this.view.connection === 'blocked' || this.view.connection === 'closed') return $r('app.string.product_connection_stopped'); return $r('app.string.product_disconnected') }
  private statusLabel(): Resource { if (this.view.connection === 'blocked' || this.view.connection === 'closed') return $r('app.string.status_stopped'); return this.connectionLabel() }
  private statusTone(): Resource { if (this.view.connection === 'connected') return $r('app.color.success'); if (this.connecting()) return $r('app.color.warning'); if (this.view.connection === 'blocked' || this.view.connection === 'closed') return $r('app.color.danger'); return $r('app.color.text_tertiary') }
  private taskActive(): boolean { return this.view.task === 'accepted' || this.view.task === 'running' || this.view.task === 'cancel_requested' || this.view.task === 'pending_confirmation' }
  private receiptVisible(): boolean { return this.lastRequest.length > 0 && (this.view.task === 'outcome_unknown' || this.failed) }
  private errorVisible(): boolean { return this.failed || this.view.error.length > 0 && this.view.error !== this.dismissedError }
  private dismissError(): void { this.failed = false; this.workspaceStartupFailure = ''; this.dismissedError = this.view.error }
  private errorMessage(): Resource {
    if (this.failed && this.workspaceStartupFailure !== '') {
      if (this.workspaceStartupFailure === 'workspace-grant-required') return $r('app.string.workspace_grant_required')
      if (this.workspaceStartupFailure === 'timeout') return $r('app.string.workspace_start_timeout')
      return $r('app.string.workspace_failed')
    }
    switch (this.view.error) {
      case '': return $r('app.string.product_operation_failed')
      case 'connection-unavailable':
        if (this.view.connectionDiagnostic === 'native-channel/mesh-required') return $r('app.string.error_connection_mesh_required')
        if (this.view.connectionDiagnostic === 'native-channel/lan-unavailable') return $r('app.string.error_connection_lan_unavailable')
        if (this.view.connectionDiagnostic === 'native-channel/endpoints-unavailable') return $r('app.string.error_connection_endpoints_unavailable')
        return $r('app.string.error_connection_unavailable')
      case 'connection-expiry': return $r('app.string.error_connection_expiry')
      case 'connection-stopped': return $r('app.string.error_connection_stopped')
      case 'connection-cleanup-failed':
      case 'selection-cleanup-failed': return $r('app.string.error_cleanup_failed')
      case 'catalog-unavailable':
      case 'device-catalog-unavailable': return $r('app.string.error_catalog_unavailable')
      case 'public-trust-expired': return $r('app.string.product_successor_notice')
      case 'device-binding-unavailable':
      case 'device-binding-locally-revoked': return $r('app.string.error_binding_unavailable')
      case 'device-route-history-unavailable': return $r('app.string.error_route_history')
      case 'rich-unavailable': return $r('app.string.error_rich_unavailable')
      case 'history-too-large': return $r('app.string.error_history_too_large')
      default: return $r('app.string.error_generic')
    }
  }
  private canSend(): boolean { return this.view.selected.length > 0 && !this.view.readOnly && !this.selectedArchived() && this.view.connection === 'connected' && !this.busy && this.draft.trim().length > 0 }
  private composerHint(): Resource { if (this.selectedArchived()) return $r('app.string.composer_archived'); if (this.view.readOnly) return $r('app.string.composer_read_only'); if (this.view.connection !== 'connected') return $r('app.string.composer_offline'); return $r('app.string.product_composer') }
  private projectTitle(projectId: string | null): string { const row = this.view.projects.find((item: ProductProject) => item.projectId === projectId); return row === undefined ? '' : row.title }
  /** Desktops without list management publish no `manageable` flag; their list stays read-only. */
  private manageable(): boolean { return this.view.manageable === true && this.view.connection === 'connected' }
  /** The desktop titles an untitled Session with its id. */
  private sessionTitle(row: ProductSession): ResourceStr { return row.title.length === 0 || row.title === row.sessionId ? $r('app.string.session_untitled') : row.title }
  private running(row: ProductSession): boolean { return row.running === true || row.sessionId === this.view.selected && this.taskActive() }
  private listed(row: ProductSession): boolean {
    const recovery = this.creationRecovery
    return row.blank !== true || row.sessionId === this.view.selected || this.created.includes(row.sessionId)
      || recovery !== undefined && recovery.projectId === row.projectId && !recovery.knownSessions.has(row.sessionId)
  }
  private inFilter(row: ProductSession, filter: string): boolean { if (filter === 'archived') return row.archived === true; return row.archived !== true && (filter !== 'running' || this.running(row)) }
  private counted(filter: string): number { return this.view.sessions.filter((row: ProductSession) => this.listed(row) && this.inFilter(row, filter)).length }
  /** Filtered and searched rows, pinned first, then most recently active; equal rows keep the desktop order. */
  private rows(): ProductSession[] {
    const query = this.query.trim().toLowerCase()
    return this.view.sessions.filter((row: ProductSession) => this.listed(row) && this.inFilter(row, this.listFilter) && (query.length === 0 || row.title.toLowerCase().includes(query) || this.projectTitle(row.projectId).toLowerCase().includes(query)))
      .sort((left: ProductSession, right: ProductSession) => { const pinned = (right.pinned === true ? 1 : 0) - (left.pinned === true ? 1 : 0); return pinned !== 0 ? pinned : (right.updatedAt ?? 0) - (left.updatedAt ?? 0) })
  }
  /** Project sections ordered by their latest activity; Sessions without a project come last. */
  private groups(): SessionGroup[] {
    const groups: SessionGroup[] = [], index: Map<string, SessionGroup> = new Map()
    for (const row of this.rows()) {
      const key = row.projectId ?? ''
      let group = index.get(key)
      if (group === undefined) { group = new SessionGroup(); group.key = key; group.projectId = row.projectId; group.title = this.projectTitle(row.projectId); index.set(key, group); groups.push(group) }
      group.rows.push(row); group.latest = Math.max(group.latest, row.updatedAt ?? 0)
    }
    return groups.sort((left: SessionGroup, right: SessionGroup) => left.key === '' ? 1 : right.key === '' ? -1 : right.latest - left.latest)
  }
  private projectChoices(): ProductProject[] {
    const latest: Map<string, number> = new Map()
    for (const row of this.view.sessions) if (row.projectId !== null) latest.set(row.projectId, Math.max(latest.get(row.projectId) ?? 0, row.updatedAt ?? 0))
    return this.view.projects.slice().sort((left: ProductProject, right: ProductProject) => (latest.get(right.projectId) ?? 0) - (latest.get(left.projectId) ?? 0))
  }
  private projectCount(projectId: string): number { return this.view.sessions.filter((row: ProductSession) => row.projectId === projectId && row.blank !== true && row.archived !== true).length }
  private rowKey(row: ProductSession): string { return row.sessionId + '|' + row.title + '|' + (row.projectId ?? '') + '|' + (row.pinned === true) + '|' + (row.archived === true) + '|' + (row.running === true) + '|' + (row.updatedAt ?? 0) }
  private toggleGroup(key: string): void { this.collapsed = this.collapsed.includes(key) ? this.collapsed.filter((item: string) => item !== key) : this.collapsed.concat([key]) }
  private emptyLabel(): Resource {
    if (this.query.trim().length > 0) return $r('app.string.no_matches')
    if (this.listFilter === 'running') return $r('app.string.no_running')
    if (this.listFilter === 'archived') return $r('app.string.no_archived')
    return this.manageable() ? $r('app.string.mvp_no_sessions_manage') : $r('app.string.mvp_no_sessions')
  }
  private age(at: number): ResourceStr {
    const elapsed = Math.max(0, Date.now() - at), minute = 60000, hour = 3600000, day = 86400000
    if (elapsed < minute) return $r('app.string.age_now')
    if (elapsed < hour) return $r('app.string.age_minutes', Math.floor(elapsed / minute))
    if (elapsed < day) return $r('app.string.age_hours', Math.floor(elapsed / hour))
    if (elapsed < 7 * day) return $r('app.string.age_days', Math.floor(elapsed / day))
    const date = new Date(at)
    if (date.getFullYear() === new Date().getFullYear()) return $r('app.string.age_date', date.getMonth() + 1, date.getDate())
    return $r('app.string.age_full_date', date.getFullYear(), date.getMonth() + 1, date.getDate())
  }
  private selectedRow(): ProductSession | undefined { return this.view.sessions.find((item: ProductSession) => item.sessionId === this.view.selected) }
  private selectedTitle(): ResourceStr { const row = this.selectedRow(); return row === undefined ? '' : this.sessionTitle(row) }
  private selectedArchived(): boolean { const row = this.selectedRow(); return row !== undefined && row.archived === true }
  private rowMenu(row: ProductSession): MenuElement[] {
    const pinned = row.pinned === true, archived = row.archived === true
    return [
      { value: pinned ? $r('app.string.session_unpin') : $r('app.string.session_pin'), symbolIcon: new SymbolGlyphModifier(pinned ? $r('sys.symbol.pin_slash') : $r('sys.symbol.pin')), action: () => this.run(() => this.manageSession(pinned ? 'unpin' : 'pin', row.sessionId)) },
      { value: archived ? $r('app.string.session_unarchive') : $r('app.string.session_archive'), symbolIcon: new SymbolGlyphModifier($r('sys.symbol.archivebox')), action: () => this.run(() => this.manageSession(archived ? 'unarchive' : 'archive', row.sessionId)) },
    ]
  }
  private selectedMenu(): MenuElement[] { const row = this.selectedRow(); return row === undefined ? [] : this.rowMenu(row) }
  /** The desktop stops an archived Session's activity; the returned catalogue already reflects the change. */
  private async manageSession(action: string, sessionId: string): Promise<void> {
    const intent: SessionIntent = { action: action, sessionId: sessionId }
    await this.product.manage(JSON.stringify(intent))
    if (action === 'archive') this.getUIContext().getPromptAction().showToast({ message: $r('app.string.session_archived_notice') })
    else if (action === 'unarchive') this.getUIContext().getPromptAction().showToast({ message: $r('app.string.session_unarchived_notice') })
  }
  /** Creates a blank desktop Session and opens it; no model step starts until the first message. */
  private async createSession(projectId: string | null): Promise<void> {
    const intent: CreateIntent = { action: 'create', projectId: projectId }
    if (this.creationPreset >= 0) intent.agentPreset = this.creation.presets[this.creationPreset].id
    if (this.creationModel >= 0) {
      const model = this.creation.models[this.creationModel]
      const selection: ProductModelSelection = { provider: model.provider, model: model.model }
      if (this.creationEffort >= 0) selection.reasoningEffort = model.efforts[this.creationEffort]
      intent.model = selection
    }
    const recovery: CreationRecovery = { projectId: projectId, knownSessions: new Set(this.view.sessions.map((row: ProductSession) => row.sessionId)) }
    let sessionId: string
    try { sessionId = await this.product.manage(JSON.stringify(intent)) }
    catch (error) {
      if (this.view.pairing === 'paired') {
        this.creationRecovery = recovery; this.creationFailed = true
        this.listFilter = 'active'; this.query = ''; this.collapsed = this.collapsed.filter((key: string) => key !== (projectId ?? ''))
      }
      throw (error as Error)
    }
    this.newSheet = false
    this.created = this.created.concat([sessionId]); this.listFilter = 'active'; this.query = ''
    await this.openSession(sessionId)
  }
  /** Read choices for one sheet generation; an older desktop can still explicitly create with its defaults. */
  private async openCreation(projectId: string = ''): Promise<void> {
    const generation = ++this.creationGeneration
    this.creation = new ProductCreationOptions(); this.creationPreset = -1; this.creationModel = -1; this.creationEffort = -1
    this.creationRecovery = undefined
    this.creationProjectId = projectId; this.creationUnavailable = false; this.creationFailed = false; this.creationLoading = true; this.newSheet = true
    try {
      const raw = await this.product.creationOptions()
      if (this.newSheet && generation === this.creationGeneration) this.creation = JSON.parse(raw) as ProductCreationOptions
    } catch (error) {
      if (this.newSheet && generation === this.creationGeneration) this.creationUnavailable = true
    } finally {
      if (generation === this.creationGeneration) this.creationLoading = false
    }
  }
  private presetOptions(): SelectOption[] {
    const values: SelectOption[] = [{ value: $r('app.string.creation_desktop_default') }]
    return values.concat(this.creation.presets.map((row: ProductCreationPreset): SelectOption => ({ value: row.name })))
  }
  private modelOptions(): SelectOption[] {
    const values: SelectOption[] = [{ value: $r('app.string.creation_desktop_default') }]
    return values.concat(this.creation.models.map((row: ProductCreationModel): SelectOption => ({ value: row.label })))
  }
  private effortOptions(): SelectOption[] {
    const values: SelectOption[] = [{ value: $r('app.string.creation_model_default') }]
    if (this.creationModel < 0) return values
    return values.concat(this.creation.models[this.creationModel].efforts.map((value: string): SelectOption => ({ value: value })))
  }
  private async openWorkspace(plugin?: string): Promise<void> {
    const selected = this.page === 'workspace' ? this.workspace.selectedSession() : this.view.selected
    if (this.page === 'conversation' && selected.length === 0) return
    const connection = this.view.connectionGeneration
    await this.rich.close()
    try {
      if (this.view.connection !== 'connected' || this.view.connectionGeneration !== connection
        || this.page === 'conversation' && this.view.selected !== selected) return
      this.workspaceRich = false; this.richCloseGeneration++; this.workspaceOpening = true
      await this.workspace.open(selected, plugin)
      if (!this.workspaceOpening) return
      this.workspaceViewGeneration = this.workspace.viewGeneration(); this.workspaceMounted = true; this.showPage('workspace')
    } catch (error) {
      const failure: Error = error instanceof Error ? error : new Error('native workspace startup failed')
      if (this.workspaceOpening) {
        this.workspaceStartupFailure = this.workspace.startupFailure(failure)
        throw failure
      }
    }
    finally {
      this.workspaceOpening = false
      if (this.page === 'conversation') {
        this.rich.setMount(this.view.richJson)
        await this.rich.foreground()
      }
    }
  }
  private async workspaceBack(): Promise<void> {
    if (!this.workspaceRich) { await this.leaveWorkspace(); return }
    const generation = ++this.richCloseGeneration
    this.workspaceRichCloseFailed = false
    try { await this.workspace.richClose() }
    catch (error) { void error; if (generation === this.richCloseGeneration && this.page === 'workspace') { this.workspaceRichCloseFailed = true; if (!this.workspaceRich) this.workspaceState = 'failed' } }
  }
  private async discardWorkspaceRich(): Promise<void> {
    this.richCloseGeneration++; this.workspaceRichCloseFailed = false
    try { await this.workspace.richDiscard() } catch (error) { void error; this.workspaceState = 'failed'; this.workspaceRich = false }
  }
  private async leaveWorkspace(): Promise<void> {
    const sessionId = this.workspace.selectedSession()
    let failed = false
    try { await this.workspace.close() } catch (error) { void error; failed = true }
    if (this.view.connection === 'connected') {
      try {
        await this.product.refreshSessions()
        if (sessionId.length > 0 && sessionId !== this.view.selected && this.view.sessions.some((row: ProductSession) => row.sessionId === sessionId)) {
          await this.product.select(sessionId)
        }
      } catch (error) { void error; failed = true }
    }
    this.showPage(this.view.selected.length === 0 ? 'sessions' : 'conversation'); this.failed = failed
    await this.rich.foreground()
  }
  /** Each page starts at its top; a conversation then follows the newest message until the user scrolls away. */
  private showPage(page: string): void { if (page !== this.page) { this.scroller.scrollTo({ xOffset: 0, yOffset: 0 }); this.resetHistoryPull() }; this.stickToBottom = page === 'conversation'; this.page = page }
  private resetHistoryPull(): void {
    this.historyRequest++
    this.historyRefreshing = false
    this.historyNotice = ''
    this.historyAnchorHeight = -1
  }
  private canPullHistory(): boolean {
    return this.page === 'conversation' && (this.view.connection === 'connected' || this.view.historyOffline === true) && this.view.historyHasMore === true
      && this.historyNotice !== 'limit' && this.historyNotice !== 'empty'
  }
  private async pullHistory(): Promise<void> {
    if (!this.canPullHistory() || this.historyRefreshing) return
    const request = ++this.historyRequest
    this.historyRefreshing = true
    this.historyNotice = ''
    try {
      const outcome = await this.product.loadOlder()
      if (outcome === 'loaded') {
        await this.afterHistoryFrame()
        if (request === this.historyRequest) {
          this.stickToBottom = false
          this.historyAnchorHeight = -1
          this.scroller.scrollTo({ xOffset: 0, yOffset: 0 })
          await this.afterHistoryFrame()
        }
      }
      if (request === this.historyRequest && outcome !== 'loaded') this.historyNotice = outcome
    } catch (error) {
      void error
      if (request === this.historyRequest) this.historyNotice = 'failed'
    } finally {
      if (request === this.historyRequest) this.historyRefreshing = false
    }
  }
  private afterHistoryFrame(): Promise<void> {
    return new Promise<void>((resolve: () => void) => {
      this.getUIContext().postFrameCallback(new HistoryFrame(() => {
        this.getUIContext().postFrameCallback(new HistoryFrame(resolve))
      }))
    })
  }
  private conversationContentArea(height: number): void {
    this.historyContentHeight = height
    if (this.page === 'conversation' && this.historyAnchorHeight >= 0 && height !== this.historyAnchorHeight) {
      const offset = Math.max(0, this.historyAnchorOffset + height - this.historyAnchorHeight)
      this.historyAnchorHeight = -1
      this.scroller.scrollTo({ xOffset: 0, yOffset: offset })
      return
    }
    this.followLatest()
  }
  private followLatest(): void { if (this.page === 'conversation' && this.stickToBottom) this.scroller.scrollEdge(Edge.Bottom) }
  /** Reaching the end resumes following; only a finger drag away from the end stops it, so programmatic scrolling and its intermediate offsets never do. */
  private trackScroll(state: ScrollState): void {
    if (this.page !== 'conversation') return
    if (this.historyRefreshing || this.historyAnchorHeight >= 0) return
    if (state === ScrollState.Scroll) this.dismissKeyboard()
    if (this.scroller.isAtEnd()) this.stickToBottom = true
    else if (state === ScrollState.Scroll) this.stickToBottom = false
  }
  private dismissKeyboard(): void { this.getUIContext().getFocusController().clearFocus() }
  private async openSession(sessionId: string): Promise<void> {
    this.openingSession = sessionId
    this.expandedProcesses = []
    try {
      await this.rich.foreground()
      await this.product.select(sessionId)
      if (this.openingSession === sessionId) {
        this.rich.setMount(this.view.richJson)
        this.showPage('conversation')
      }
    } finally { this.openingSession = '' }
  }
  private toggleProcess(key: string): void {
    this.stickToBottom = false
    this.expandedProcesses = this.expandedProcesses.includes(key)
      ? this.expandedProcesses.filter((open: string) => open !== key) : this.expandedProcesses.concat(key)
  }

  @Builder processDisclosure(key: string, text: string, live: boolean) {
    Column({ space: 4 }) {
      Button(this.expandedProcesses.includes(key) ? $r('app.string.product_process_collapse') : $r('app.string.product_process_expand'))
        .id('product-process-toggle-' + key).secondaryAction().constraintSize({ minHeight: 44 })
        .onClick(() => this.toggleProcess(key))
      if (this.expandedProcesses.includes(key)) {
        MessageView({ role: 'assistant', text: text, live: live }).id(live ? 'product-live-text' : 'product-process-content-' + key)
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }

  @Builder sessionRow(row: ProductSession, showProject: boolean) {
    Stack({ alignContent: Alignment.End }) {
      Button({ type: ButtonType.Normal, stateEffect: true }) {
        Row({ space: 12 }) {
          Column({ space: 5 }) {
            Text(this.sessionTitle(row)).fontSize(16).lineHeight(22).fontColor($r('app.color.text_primary')).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis })
            Row({ space: 6 }) {
              if (row.pinned === true) { SymbolGlyph($r('sys.symbol.pin_fill')).fontSize(12).fontColor([$r('app.color.text_tertiary')]) }
              if (row.sessionId === this.view.selected && this.view.task !== 'idle') {
                Row().width(6).height(6).borderRadius(3).backgroundColor(taskTone(this.view.task))
                Text(taskLabel(this.view.task)).fontSize(12).fontColor(taskTone(this.view.task)).maxLines(1)
              } else if (row.running === true) {
                Row().width(6).height(6).borderRadius(3).backgroundColor($r('app.color.success'))
                Text($r('app.string.session_running')).fontSize(12).fontColor($r('app.color.success')).maxLines(1)
              } else if (row.sessionId === this.view.selected) {
                Text($r('app.string.session_current')).fontSize(12).fontColor($r('app.color.text_secondary')).maxLines(1)
              } else if ((row.updatedAt ?? 0) > 0) {
                Text(this.age(row.updatedAt ?? 0)).fontSize(12).fontColor($r('app.color.text_tertiary')).maxLines(1)
              }
              if (showProject && this.projectTitle(row.projectId).length > 0) {
                SymbolGlyph($r('sys.symbol.folder')).fontSize(12).fontColor([$r('app.color.text_tertiary')])
                Text(this.projectTitle(row.projectId)).fontSize(12).fontColor($r('app.color.text_tertiary')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1)
              }
            }.width('100%')
          }.layoutWeight(1).alignItems(HorizontalAlign.Start)
          if (!this.manageable()) { SymbolGlyph($r('sys.symbol.chevron_right')).fontSize(16).fontColor([$r('app.color.text_tertiary')]) }
        }.width('100%').padding({ left: 16, right: this.manageable() ? 52 : 12, top: 14, bottom: 14 })
      }.id('product-session-' + row.sessionId).width('100%').borderRadius(14).backgroundColor(row.sessionId === this.view.selected ? $r('app.color.surface_high') : $r('app.color.surface'))
        .enabled((this.view.connection === 'connected' || this.view.offlineAvailable === true) && !this.busy).onClick(() => this.run(() => this.openSession(row.sessionId)))
      if (this.manageable()) {
        Button({ type: ButtonType.Circle, stateEffect: true }) { SymbolGlyph($r('sys.symbol.dot_grid_1x2')).fontSize(18).fontColor([$r('app.color.text_tertiary')]) }
          .id('product-session-more-' + row.sessionId).width(40).height(40).margin({ right: 6 }).backgroundColor(Color.Transparent).accessibilityText($r('app.string.session_more')).enabled(!this.busy).bindMenu(this.rowMenu(row))
      }
    }.width('100%')
  }
  @Builder newSessionSheet() {
    Column({ space: 8 }) {
      Text($r('app.string.new_session')).fontSize(18).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
      Text($r('app.string.new_session_hint')).detailText()
      Scroll() {
        Column({ space: 8 }) {
          if (this.creationLoading) {
            Text($r('app.string.creation_loading')).detailText()
          } else if (this.creationUnavailable) {
            Text($r('app.string.creation_unavailable')).bodyText()
          } else {
            Text($r('app.string.creation_type')).detailText()
            Select(this.presetOptions()).id('product-create-preset').selected(this.creationPreset + 1).width('100%').height(44).enabled(!this.busy)
              .accessibilityText($r('app.string.creation_type')).onSelect((index: number) => { this.creationPreset = index - 1 })
            Text($r('app.string.creation_model')).detailText()
            Select(this.modelOptions()).id('product-create-model').selected(this.creationModel + 1).width('100%').height(44).enabled(!this.busy)
              .accessibilityText($r('app.string.creation_model')).onSelect((index: number) => { this.creationModel = index - 1; this.creationEffort = -1 })
            if (this.creationModel >= 0 && this.creation.models[this.creationModel].efforts.length > 0) {
              Text($r('app.string.creation_effort')).detailText()
              Select(this.effortOptions()).id('product-create-effort').selected(this.creationEffort + 1).width('100%').height(44).enabled(!this.busy)
                .accessibilityText($r('app.string.creation_effort')).onSelect((index: number) => { this.creationEffort = index - 1 })
            }
            Text($r('app.string.creation_session_only')).detailText()
          }
          if (this.creationFailed) { Text($r('app.string.creation_failed')).bodyText() }
          ForEach(this.projectChoices().filter((row: ProductProject) => this.creationProjectId === '' || row.projectId === this.creationProjectId), (row: ProductProject) => {
            Button({ type: ButtonType.Normal, stateEffect: true }) {
              Row({ space: 12 }) {
                SymbolGlyph($r('sys.symbol.folder')).fontSize(20).fontColor([$r('app.color.accent')])
                Column({ space: 2 }) {
                  Text(row.title).fontSize(15).fontColor($r('app.color.text_primary')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
                  Text($r('app.string.project_sessions', this.projectCount(row.projectId))).detailText()
                }.layoutWeight(1).alignItems(HorizontalAlign.Start)
              }.width('100%').padding({ left: 14, right: 14, top: 12, bottom: 12 })
            }.id('product-new-in-' + row.projectId).width('100%').borderRadius(14).backgroundColor($r('app.color.surface')).enabled(!this.busy && !this.creationLoading && !this.creationFailed).onClick(() => this.run(() => this.createSession(row.projectId)))
          }, (row: ProductProject) => row.projectId + '|' + row.title)
          Button({ type: ButtonType.Normal, stateEffect: true }) {
            Row({ space: 12 }) {
              SymbolGlyph($r('sys.symbol.plus')).fontSize(20).fontColor([$r('app.color.text_secondary')])
              Column({ space: 2 }) {
                Text($r('app.string.new_session_no_project')).fontSize(15).fontColor($r('app.color.text_primary'))
                Text($r('app.string.new_session_no_project_hint')).detailText()
              }.layoutWeight(1).alignItems(HorizontalAlign.Start)
            }.width('100%').padding({ left: 14, right: 14, top: 12, bottom: 12 })
          }.id('product-new-unassigned').width('100%').borderRadius(14).backgroundColor($r('app.color.surface')).enabled(!this.busy && !this.creationLoading && !this.creationFailed).onClick(() => this.run(() => this.createSession(null)))
        }.width('100%')
      }.layoutWeight(1).width('100%').align(Alignment.Top).scrollBar(BarState.Off)
    }.width('100%').height('100%').padding({ left: 16, right: 16, top: 4, bottom: 16 })
  }
  build() {
    Column() {
    Column() {
      if (this.page === 'sessions') {
        Row({ space: 8 }) {
          Column({ space: 3 }) {
            Text($r('app.string.mvp_title')).fontSize(22).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
            Row({ space: 6 }) { Row().width(7).height(7).borderRadius(3.5).backgroundColor(this.statusTone()); Text(this.statusLabel()).fontSize(12).fontColor($r('app.color.text_secondary')) }
          }.layoutWeight(1).alignItems(HorizontalAlign.Start)
          if (this.manageable()) {
            Button({ type: ButtonType.Circle, stateEffect: true }) { SymbolGlyph($r('sys.symbol.square_and_pencil')).fontSize(20).fontColor([$r('app.color.text_primary')]) }
              .id('product-new-session').width(40).height(40).backgroundColor($r('app.color.surface')).accessibilityText($r('app.string.new_session')).enabled(!this.busy).onClick(() => { void this.openCreation() })
              .bindSheet(this.newSheet, this.newSessionSheet(), { height: SheetSize.LARGE, dragBar: true, showClose: false, backgroundColor: $r('app.color.page_background'), onDisappear: () => { this.newSheet = false; this.creationGeneration++ } })
          }
          if (this.workspace.supported() && this.product.deviceBindingMode() && this.view.connection === 'connected') {
            Button({ type: ButtonType.Circle, stateEffect: true }) { SymbolGlyph($r('sys.symbol.square_grid_2x2')).fontSize(20).fontColor([$r('app.color.text_primary')]) }
              .id('product-workspace-open').width(40).height(40).backgroundColor($r('app.color.surface')).accessibilityText($r('app.string.workspace_title')).enabled(!this.busy).onClick(() => this.run(() => this.openWorkspace()))
          }
          Button({ type: ButtonType.Circle, stateEffect: true }) { SymbolGlyph($r('sys.symbol.gearshape')).fontSize(20).fontColor([$r('app.color.text_primary')]) }
            .id('product-nav-device').width(40).height(40).backgroundColor($r('app.color.surface')).accessibilityText($r('app.string.nav_settings')).onClick(() => { this.showPage('device') })
        }.width('100%').padding({ left: 16, right: 12, top: 10, bottom: 10 })
        if (this.view.connection === 'connected' && this.view.projects.length > 0) {
          Column() {
            Row({ space: 4 }) {
              Text($r('app.string.view_recent')).segment(this.listMode === 'recent').id('product-list-recent').onClick(() => { this.listMode = 'recent' })
              Text($r('app.string.view_projects')).segment(this.listMode === 'projects').id('product-list-projects').onClick(() => { this.listMode = 'projects' })
            }.width('100%').padding(3).backgroundColor($r('app.color.surface')).borderRadius(12)
          }.width('100%').padding({ left: 16, right: 16, bottom: 10 })
        }
      }
      if (this.page === 'conversation') {
        Row({ space: 4 }) {
          Button({ type: ButtonType.Circle, stateEffect: true }) { SymbolGlyph($r('sys.symbol.chevron_left')).fontSize(22).fontColor([$r('app.color.text_primary')]) }
            .id('product-chat-back').width(40).height(40).backgroundColor(Color.Transparent).accessibilityText($r('app.string.mvp_back')).onClick(() => { this.showPage('sessions') })
          Column({ space: 2 }) {
            Text(this.selectedTitle()).fontSize(17).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
            Row({ space: 6 }) {
              Row().width(6).height(6).borderRadius(3).backgroundColor(this.statusTone())
              Text(this.view.historySyncing === true ? $r('app.string.product_history_syncing') : this.statusLabel())
                .id(this.view.historySyncing === true ? 'product-history-syncing' : 'product-chat-connection').fontSize(12).fontColor($r('app.color.text_secondary'))
            }
          }.layoutWeight(1).alignItems(HorizontalAlign.Start)
          if (this.workspace.supported() && this.product.deviceBindingMode() && this.view.connection === 'connected' && this.view.selected.length > 0) {
            Button({ type: ButtonType.Circle, stateEffect: true }) { SymbolGlyph($r('sys.symbol.square_grid_2x2')).fontSize(20).fontColor([$r('app.color.text_primary')]) }
              .id('product-chat-workspace').width(40).height(40).backgroundColor(Color.Transparent).accessibilityText($r('app.string.workspace_title')).enabled(!this.busy).onClick(() => this.run(() => this.openWorkspace()))
          }
          if (this.manageable() && this.view.selected.length > 0) {
            Button({ type: ButtonType.Circle, stateEffect: true }) { SymbolGlyph($r('sys.symbol.dot_grid_1x2')).fontSize(20).fontColor([$r('app.color.text_primary')]) }
              .id('product-chat-more').width(40).height(40).backgroundColor(Color.Transparent).accessibilityText($r('app.string.session_more')).enabled(!this.busy).bindMenu(this.selectedMenu())
          }
        }.width('100%').padding({ left: 4, right: 8, top: 6, bottom: 6 })
      }
      if (this.page === 'workspace') {
        Row({ space: 6 }) {
          Button({ type: ButtonType.Circle, stateEffect: true }) { SymbolGlyph($r('sys.symbol.chevron_left')).fontSize(22).fontColor([$r('app.color.text_primary')]) }
            .id('product-workspace-back').width(40).height(40).backgroundColor(Color.Transparent).accessibilityText($r('app.string.mvp_back')).enabled(!this.busy).onClick(() => this.run(() => this.workspaceBack()))
          Column({ space: 2 }) {
            Text(this.workspaceRich ? $r('app.string.workspace_rich_title') : $r('app.string.workspace_title')).fontSize(17).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
            if (!this.workspaceRich && this.draft.length > 0) { Text($r('app.string.workspace_draft_retained')).fontSize(12).fontColor($r('app.color.text_secondary')) }
          }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        }.width('100%').padding({ left: 4, right: 12, top: 6, bottom: 6 })
      }
      if (this.page === 'device') {
        Row({ space: 4 }) {
          Button({ type: ButtonType.Circle, stateEffect: true }) { SymbolGlyph($r('sys.symbol.chevron_left')).fontSize(22).fontColor([$r('app.color.text_primary')]) }
            .id('product-device-back').width(40).height(40).backgroundColor(Color.Transparent).accessibilityText($r('app.string.mvp_back')).onClick(() => { this.showPage('sessions') })
          Text($r('app.string.nav_settings')).fontSize(18).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
        }.width('100%').padding({ left: 4, right: 16, top: 6, bottom: 6 })
      }
      if (this.errorVisible()) {
        Column() {
          Row({ space: 10 }) {
            SymbolGlyph($r('sys.symbol.exclamationmark_triangle')).fontSize(18).fontColor([$r('app.color.warning')]).margin({ top: 7 })
            Column({ space: 2 }) {
              Text(this.errorMessage()).fontSize(14).lineHeight(20).fontColor($r('app.color.text_primary')).width('100%')
              if (this.view.error.length > 0) { Text($r('app.string.error_code', this.view.error)).detailText() }
            }.layoutWeight(1).alignItems(HorizontalAlign.Start).padding({ top: 6 })
            Button({ type: ButtonType.Circle, stateEffect: true }) { SymbolGlyph($r('sys.symbol.xmark')).fontSize(14).fontColor([$r('app.color.text_secondary')]) }
              .id('product-error-dismiss').width(32).height(32).backgroundColor(Color.Transparent).accessibilityText($r('app.string.dismiss')).onClick(() => this.dismissError())
          }.width('100%').padding({ left: 12, right: 6, top: 8, bottom: 10 }).backgroundColor($r('app.color.warning_soft')).borderRadius(12).alignItems(VerticalAlign.Top)
        }.id('product-error').width('100%').padding({ left: 12, right: 12, bottom: 8 })
      }
    }.id('product-header').width('100%').border({ width: { bottom: 1 }, color: { bottom: $r('app.color.border') } })
    Stack({ alignContent: Alignment.BottomEnd }) {
    if (this.page === 'workspace') {
      ForEach(this.workspaceMounted ? [this.workspaceViewGeneration] : [], (generation: number) => {
        WorkspaceSurface({ owner: this.workspace, generation }).visibility(this.workspaceRich ? Visibility.Hidden : Visibility.Visible)
      }, (generation: number) => generation.toString())
      if (this.workspaceRich) {
        Column({ space: 12 }) {
          if (this.busy) { Text($r('app.string.workspace_rich_saving')).bodyText() }
          if (this.workspaceRichCloseFailed) {
            Text($r('app.string.workspace_rich_save_failed')).bodyText()
            Button($r('app.string.workspace_rich_discard')).id('product-workspace-rich-discard').dangerAction().onClick(() => this.discardWorkspaceRich())
          }
          WorkspaceRichSurface({ owner: this.workspace.richGuest() }).layoutWeight(1).width('100%')
        }.id('product-workspace-rich').padding(12).width('100%').height('100%').backgroundColor($r('app.color.page_background'))
      }
      if (this.workspaceState === 'loading') { LoadingProgress().width(36).height(36).color($r('app.color.accent')).align(Alignment.Center) }
      if (this.workspaceState === 'failed' || this.workspaceState === 'closed') {
        Column({ space: 16 }) {
          Text(this.workspaceState === 'closed' ? $r('app.string.workspace_closed') : $r('app.string.workspace_failed')).bodyText()
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
            Button($r('app.string.workspace_retry')).id('product-workspace-retry').primaryAction().enabled(!this.busy).onClick(() => this.run(() => this.openWorkspace(this.workspace.pluginTarget())))
            Button($r('app.string.mvp_back')).id('product-workspace-return').secondaryAction().enabled(!this.busy).onClick(() => this.run(() => this.leaveWorkspace()))
          }.width('100%')
        }.padding(24).width('100%').backgroundColor($r('app.color.page_background')).align(Alignment.Center)
      }
    } else {
    Refresh({ refreshing: this.historyRefreshing }) {
    Scroll(this.scroller) {
    Column({ space: 12 }) {
      if (this.page === 'sessions') {
        if (this.creationFailed && !this.newSheet) {
          Column({ space: 8 }) {
            Text($r('app.string.creation_failed')).bodyText()
            Button($r('app.string.creation_refresh')).id('product-creation-refresh').secondaryAction().width('100%')
              .enabled(this.view.connection === 'connected' && !this.busy).onClick(() => this.run(() => this.product.refreshSessions()))
          }.card()
        }
        if (this.view.connection !== 'connected') {
          Column({ space: 12 }) {
            Row({ space: 12 }) {
              SymbolGlyph($r('sys.symbol.computer')).fontSize(26).fontColor([$r('app.color.accent')])
              Column({ space: 2 }) {
                Text(this.connecting() ? $r('app.string.product_connecting') : $r('app.string.home_offline_title')).fontSize(16).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
                if (this.connectionHost.length > 0) { Text(this.connectionHost).detailText().maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }) }
              }.layoutWeight(1).alignItems(HorizontalAlign.Start)
              if (this.connecting()) { LoadingProgress().width(26).height(26).color($r('app.color.accent')) }
            }.width('100%')
            Text(this.connectionEnabled ? $r('app.string.mvp_offline') : $r('app.string.mvp_connection_prepare')).bodyText()
            if (this.connectable()) {
              Button($r('app.string.product_connect_host', this.connectionHost)).id('product-home-connect').primaryAction().width('100%').enabled(this.connectable() && !this.busy).onClick(() => this.run(() => this.connectShownHost(this.connectionHost)))
            }
            if (!this.connectable() && !this.connecting()) {
              Button($r('app.string.home_open_settings')).id('product-home-setup').secondaryAction().width('100%').onClick(() => { this.showSetup = !this.connectionEnabled; this.showPage('device') })
            }
          }.card()
        }
        if ((this.view.connection === 'connected' || this.view.offlineAvailable === true) && this.view.sessions.length > 0) {
          Row({ space: 8 }) {
            SymbolGlyph($r('sys.symbol.magnifyingglass')).fontSize(18).fontColor([$r('app.color.text_tertiary')])
            TextInput({ text: this.query, placeholder: $r('app.string.search_sessions') }).id('product-session-search').layoutWeight(1).height(40).padding({ left: 0, right: 0 }).borderRadius(0).fontSize(15)
              .backgroundColor(Color.Transparent).fontColor($r('app.color.text_primary')).placeholderColor($r('app.color.text_tertiary')).enterKeyType(EnterKeyType.Search)
              .cancelButton({ style: CancelButtonStyle.INPUT, icon: { size: 16, color: $r('app.color.text_tertiary') } }).onChange((value: string) => { this.query = value })
          }.width('100%').padding({ left: 12, right: 4 }).backgroundColor($r('app.color.surface')).borderRadius(12)
        }
        if (this.view.connection === 'connected' && this.view.manageable === true) {
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
            Button($r('app.string.filter_all')).id('product-filter-active').chip(this.listFilter === 'active').onClick(() => { this.listFilter = 'active' })
            Button(this.counted('running') > 0 ? $r('app.string.filter_running_count', this.counted('running')) : $r('app.string.filter_running')).id('product-filter-running').chip(this.listFilter === 'running').onClick(() => { this.listFilter = 'running' })
            Button($r('app.string.filter_archived')).id('product-filter-archived').chip(this.listFilter === 'archived').onClick(() => { this.listFilter = 'archived' })
          }.width('100%')
        }
        if (this.view.connection === 'connected' && this.rows().length === 0) { Text(this.emptyLabel()).bodyText().textAlign(TextAlign.Center).padding({ top: 32 }) }
        if (this.listMode === 'recent' || this.view.projects.length === 0) {
          ForEach(this.rows(), (row: ProductSession) => { this.sessionRow(row, true) }, (row: ProductSession) => this.rowKey(row))
        } else {
          ForEach(this.groups(), (group: SessionGroup) => {
            Column({ space: 8 }) {
              Stack({ alignContent: Alignment.End }) {
                Button({ type: ButtonType.Normal, stateEffect: true }) {
                  Row({ space: 8 }) {
                    SymbolGlyph(this.collapsed.includes(group.key) && this.query.trim().length === 0 ? $r('sys.symbol.chevron_right') : $r('sys.symbol.chevron_down')).fontSize(14).fontColor([$r('app.color.text_tertiary')])
                    Text(group.title.length > 0 ? group.title : $r('app.string.project_none')).fontSize(14).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_secondary')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1)
                    Text(group.rows.length.toString()).fontSize(12).fontColor($r('app.color.text_tertiary'))
                  }.width('100%').padding({ left: 6, right: group.projectId !== null && this.manageable() ? 48 : 10, top: 8, bottom: 8 })
                }.id('product-group-' + group.key).width('100%').borderRadius(10).backgroundColor(Color.Transparent).onClick(() => this.toggleGroup(group.key))
                if (group.projectId !== null && this.manageable()) {
                  Button({ type: ButtonType.Circle, stateEffect: true }) { SymbolGlyph($r('sys.symbol.plus')).fontSize(18).fontColor([$r('app.color.text_secondary')]) }
                    .id('product-group-new-' + group.key).width(36).height(36).margin({ right: 2 }).backgroundColor(Color.Transparent).accessibilityText($r('app.string.project_new_session')).enabled(!this.busy).onClick(() => { void this.openCreation(group.projectId ?? '') })
                }
              }.width('100%')
              if (!this.collapsed.includes(group.key) || this.query.trim().length > 0) {
                ForEach(group.rows, (row: ProductSession) => { this.sessionRow(row, false) }, (row: ProductSession) => this.rowKey(row))
              }
            }.width('100%')
          }, (group: SessionGroup) => group.key + '|' + group.title + '|' + group.rows.length)
        }
      }
      if (this.page === 'device') {
        Column({ space: 12 }) {
          Row({ space: 8 }) {
            Row().width(8).height(8).borderRadius(4).backgroundColor(this.statusTone())
            Text(this.connectionLabel()).fontSize(15).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).layoutWeight(1)
          }.width('100%')
          Text(this.pairingLabel()).detailText()
          if (this.connectionHost.length > 0) {
            Column({ space: 2 }) {
              Text($r('app.string.settings_host')).detailText()
              Text(this.connectionHost).fontSize(14).fontColor($r('app.color.text_primary')).width('100%').copyOption(CopyOptions.LocalDevice)
            }.width('100%')
          }
          if (!this.connectionEnabled) { Text($r('app.string.mvp_connection_prepare')).bodyText() }
          if (this.workspace.supported() && this.product.deviceBindingMode() && this.view.connection === 'connected') {
            Text($r('app.string.workspace_plugin_target')).detailText()
            TextInput({ text: this.workspacePlugin, placeholder: $r('app.string.workspace_plugin_hint') }).id('product-workspace-plugin-target').inputField().width('100%').maxLength(256).enabled(!this.busy).accessibilityText($r('app.string.workspace_plugin_target')).onChange((value: string) => { this.workspacePlugin = value })
            Button($r('app.string.workspace_plugins')).id('product-workspace-plugins').secondaryAction().width('100%').enabled(!this.busy).onClick(() => this.run(() => this.openWorkspace(this.workspacePlugin.trim())))
          }
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
            Button(this.connectable() ? $r('app.string.product_connect_host', this.connectionHost) : $r('app.string.product_connect')).id('product-connect').primaryAction().padding({ left: 20, right: 20 }).enabled(this.connectable() && !this.busy).onClick(() => this.run(() => this.connectShownHost(this.connectionHost)))
            Button($r('app.string.product_route_stop')).id('product-route-stop').secondaryAction().padding({ left: 20, right: 20 }).enabled(!this.busy).onClick(() => this.run(async () => { await this.rich.close(); await this.product.stopRoute(); this.networkApproved = false; this.routeReply = ''; this.refreshConnectionControls(); await this.rich.foreground() }))
          }.width('100%')
        }.card()
        Button({ type: ButtonType.Normal, stateEffect: true }) {
          Row() {
            Text($r('app.string.mvp_setup')).fontSize(15).fontColor($r('app.color.text_primary')).layoutWeight(1)
            SymbolGlyph(this.showSetup ? $r('sys.symbol.chevron_up') : $r('sys.symbol.chevron_down')).fontSize(16).fontColor([$r('app.color.text_tertiary')])
          }.width('100%').padding({ left: 16, right: 14, top: 14, bottom: 14 })
        }.id('product-setup-toggle').width('100%').borderRadius(14).backgroundColor($r('app.color.surface')).accessibilityText($r('app.string.mvp_setup')).onClick(() => { this.showSetup = !this.showSetup })
        if (this.showSetup) {
        if (this.product.deviceBindingMode() && productConfiguration.deviceAutoConnect !== true && this.view.pairing === 'paired') {
          Column({ space: 10 }) {
            Text($r('app.string.product_route_notice')).bodyText()
            TextArea({ text: this.routeOffer, placeholder: $r('app.string.product_route_offer') }).id('product-route-offer').areaField().height(100).enabled(!this.busy).onChange((value: string) => { this.routeOffer = value; this.routeSummary = ''; this.routeReply = ''; this.routeApproved = false })
            Button($r('app.string.product_route_preview')).id('product-route-preview').secondaryAction().width('100%').enabled(!this.busy && this.routeOffer.length > 0).onClick(() => this.run(async () => { this.routeSummary = await this.product.previewRoute(this.routeOffer); this.routeApproved = false }))
            if (this.routeSummary.length > 0) { Text(this.routeSummary).detailText().copyOption(CopyOptions.LocalDevice); Row({ space: 8 }) { Checkbox().select(this.routeApproved).onChange((value: boolean) => { this.routeApproved = value }); Text($r('app.string.product_route_approve')).fontSize(14).fontColor($r('app.color.text_primary')).layoutWeight(1) } }
            Button($r('app.string.product_route_sign')).id('product-route-sign').primaryAction().width('100%').enabled(!this.busy && this.routeApproved && this.routeSummary.length > 0).onClick(() => this.run(async () => { this.routeReply = await this.product.signRoute(this.routeOffer, this.routeApproved); this.routeApproved = false; this.refreshConnectionControls() }))
            if (this.routeReply.length > 0) { Text(this.routeReply).detailText().copyOption(CopyOptions.LocalDevice) }
          }.card()
        }
        if (!this.product.deviceBindingMode()) {
        Button($r('app.string.product_scope_manage')).id('product-scope-manage').secondaryAction().width('100%').enabled(!this.busy).onClick(() => this.run(async () => { await this.rich.close(); this.savedScopes = JSON.parse(await this.product.listSavedScopes(true)) as ProductSavedScope[]; this.connectionEnabled = false; this.lastRequest = ''; this.scopeEntry = true; await this.rich.foreground() }))
        ForEach(this.savedScopes, (row: ProductSavedScope) => { Button(row.profileId + ' / ' + row.sessions.join(', ')).id('product-scope-' + row.key).secondaryAction().width('100%').enabled(!this.busy).onClick(() => this.run(async () => { await this.rich.close(); this.publicOffer = await this.product.selectSavedScope(row.key, true); this.preview = JSON.parse(this.product.preview(this.publicOffer)) as ProductPairingPreview; this.identityAlias = this.preview.identityAlias; this.compared = false; this.networkApproved = false; this.connectionEnabled = false; this.lastRequest = ''; this.scopeEntry = true; await this.rich.foreground() })) }, (row: ProductSavedScope) => row.key)
        }
        if (this.scopeEntry || this.view.pairing === 'unpaired' || this.view.error === 'public-trust-expired') {
          Column({ space: 10 }) {
          Text(this.product.deviceBindingMode() ? $r('app.string.product_device_identity') : $r('app.string.product_identity_notice')).bodyText()
          TextInput({ text: this.identityAlias, placeholder: $r('app.string.product_identity_name') }).inputField().enabled(!this.busy).onChange((value: string) => { this.identityAlias = value; this.identityPending = false; this.identityPublic = '' })
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
            if (!this.product.deviceBindingMode()) { Button($r('app.string.product_identity_begin')).id('product-identity-begin').secondaryAction().enabled(this.identityAlias.length > 0 && !this.busy).onClick(() => { this.identityPending = true }) }
            Button($r('app.string.product_identity_existing')).secondaryAction().enabled(this.identityAlias.length > 0 && !this.busy).onClick(() => this.run(async () => { this.identityPublic = await this.product.publicIdentity(this.identityAlias) }))
          }.width('100%')
          if (this.identityPending) { Text($r('app.string.product_identity_confirm_notice')).bodyText(); Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
            Button($r('app.string.product_identity_confirm')).id('product-identity-confirm').primaryAction().enabled(!this.busy).onClick(() => this.run(async () => { this.identityPending = false; this.identityPublic = await this.product.initializeIdentity(this.identityAlias, true) }))
            Button($r('app.string.product_identity_deny')).secondaryAction().enabled(!this.busy).onClick(() => { this.identityPending = false })
          }.width('100%') }
          if (this.identityPublic.length > 0) { Text(this.identityPublic).detailText().copyOption(CopyOptions.LocalDevice) }
          Text($r('app.string.product_enrollment_notice')).bodyText()
          TextArea({ text: this.enrollmentOffer, placeholder: $r('app.string.product_enrollment_offer') }).areaField().height(90).enabled(!this.busy).onChange((value: string) => { this.enrollmentOffer = value; this.enrollmentCompared = false; this.enrollmentReply = ''; this.enrollmentPreview = new ProductPairingPreview() })
          Button($r('app.string.product_enrollment_preview')).secondaryAction().width('100%').enabled(!this.busy && this.enrollmentOffer.length > 0).onClick(() => this.run(async () => { this.enrollmentPreview = JSON.parse(await this.product.previewEnrollment(this.enrollmentOffer)) as ProductPairingPreview }))
          if (this.enrollmentPreview.desktopFingerprint.length > 0) { Text(this.enrollmentPreview.audience).detailText(); Text(this.enrollmentPreview.operations.join(', ')).detailText(); Text($r('app.string.product_enrollment_deadline', new Date(this.enrollmentPreview.expiresAt).toISOString(), Math.ceil(this.enrollmentPreview.grantTtlMs / 60000))).detailText() }
          if (this.enrollmentPreview.desktopFingerprint.length > 0) { Text(this.enrollmentPreview.desktopFingerprint).detailText(); Text(this.enrollmentPreview.phoneFingerprint).detailText(); Text(this.enrollmentPreview.desktopId + ' / ' + this.enrollmentPreview.profileId + ' / ' + (this.enrollmentPreview.deviceBinding ? $r('app.string.product_device_scope') : this.enrollmentPreview.sessions.join(', '))).detailText(); Row({ space: 8 }) { Checkbox().select(this.enrollmentCompared).onChange((value: boolean) => { this.enrollmentCompared = value }); Text($r('app.string.product_compared')).fontSize(14).fontColor($r('app.color.text_primary')).layoutWeight(1) } }
          Button($r('app.string.product_enrollment_sign')).primaryAction().width('100%').enabled(!this.busy && this.enrollmentCompared && this.enrollmentPreview.desktopFingerprint.length > 0).onClick(() => this.run(async () => { this.enrollmentReply = await this.product.signEnrollment(this.enrollmentOffer, this.enrollmentCompared); this.enrollmentCompared = false }))
          if (this.enrollmentReply.length > 0) { Text(this.enrollmentReply).detailText().copyOption(CopyOptions.LocalDevice) }
          Button($r('app.string.product_restore_saved')).secondaryAction().width('100%').enabled(!this.busy && (!this.connectionEnabled || this.view.error === 'public-trust-expired')).onClick(() => this.run(async () => { this.publicOffer = await this.product.savedPairing(true); this.preview = JSON.parse(this.product.preview(this.publicOffer)) as ProductPairingPreview; this.compared = false; this.networkApproved = false }))
          if (this.view.error === 'public-trust-expired') { Text($r('app.string.product_successor_notice')).bodyText() }
          Text($r('app.string.product_local_offer')).bodyText()
          TextArea({ text: this.publicOffer, placeholder: $r('app.string.product_public_offer') }).areaField().height(100).enabled(!this.busy).onChange((value: string) => { this.publicOffer = value; this.compared = false; this.networkApproved = false; this.preview = new ProductPairingPreview(); try { this.preview = JSON.parse(this.product.preview(value)) as ProductPairingPreview } catch (error) { void error } })
          if (this.preview.desktopFingerprint.length > 0) { Text($r('app.string.product_desktop_fingerprint')).detailText(); Text(this.preview.desktopFingerprint).detailText().copyOption(CopyOptions.InApp); Text($r('app.string.product_phone_fingerprint')).detailText(); Text(this.preview.phoneFingerprint).detailText().copyOption(CopyOptions.InApp); Text(this.preview.desktopId + ' / ' + this.preview.profileId + ' / ' + this.preview.sessions.join(', ')).detailText(); Text(this.preview.operations.join(', ')).detailText(); if (this.preview.deviceBinding) { Text($r('app.string.product_device_scope')).detailText() } else { Text($r('app.string.product_grant_summary', this.preview.grantEpoch, new Date(this.preview.expiresAt).toISOString())).detailText() }
          Text($r('app.string.product_pair_identifier', this.preview.pairId)).detailText(); Text(this.preview.operations.includes('task.submit') ? $r('app.string.product_write_scope') : $r('app.string.product_read_scope')).detailText() }
          Row({ space: 8 }) { Checkbox().select(this.compared).onChange((value: boolean) => { this.compared = value }); Text($r('app.string.product_compared')).fontSize(14).fontColor($r('app.color.text_primary')).layoutWeight(1) }.width('100%')
          if (this.preview.audience.length > 0) { Text($r('app.string.product_network_notice')).bodyText(); Text(this.preview.audience).detailText(); Row({ space: 8 }) { Checkbox().select(this.networkApproved).onChange((value: boolean) => { this.networkApproved = value }); Text($r('app.string.product_network_allow')).fontSize(14).fontColor($r('app.color.text_primary')).layoutWeight(1) } }
          Button($r('app.string.product_confirm_pair')).id('product-confirm-pair').primaryAction().width('100%').enabled(this.networkApproved && this.compared && this.preview.desktopFingerprint.length > 0 && !this.busy).onClick(() => this.run(() => this.savePairing()))
          if (!this.product.deviceBindingMode()) {
          Text($r('app.string.product_scope_new_notice')).bodyText()
          Button($r('app.string.product_scope_save_new')).id('product-scope-save-new').secondaryAction().width('100%').enabled(this.networkApproved && this.compared && this.preview.desktopFingerprint.length > 0 && !this.busy).onClick(() => this.run(async () => { await this.rich.close(); await this.product.saveNewScope(this.publicOffer, this.compared, this.networkApproved); this.connectionEnabled = this.product.connectionEnabled(); this.savedScopes = []; this.compared = false; this.networkApproved = false; this.lastRequest = ''; this.scopeEntry = false; await this.rich.foreground() }))
          }
          }.card()
        }
        }
        Button({ type: ButtonType.Normal, stateEffect: true }) {
          Row() {
            Text($r('app.string.mvp_diagnostics')).fontSize(15).fontColor($r('app.color.text_primary')).layoutWeight(1)
            SymbolGlyph(this.showDiagnostics ? $r('sys.symbol.chevron_up') : $r('sys.symbol.chevron_down')).fontSize(16).fontColor([$r('app.color.text_tertiary')])
          }.width('100%').padding({ left: 16, right: 14, top: 14, bottom: 14 })
        }.id('product-diagnostics-toggle').width('100%').borderRadius(14).backgroundColor($r('app.color.surface')).accessibilityText($r('app.string.mvp_diagnostics')).onClick(() => { this.showDiagnostics = !this.showDiagnostics })
        if (this.showDiagnostics) {
          Column({ space: 10 }) {
            Button($r('app.string.product_log_selfcheck')).id('product-log-selfcheck').secondaryAction().width('100%').enabled(!this.busy).onClick(() => this.logSelfCheck())
            if (this.logCheckState.length > 0) { Text(this.logCheckState === 'requested' ? $r('app.string.product_log_selfcheck_requested') : $r('app.string.product_log_selfcheck_failed')).id('product-log-selfcheck-result').detailText() }
            if (typeof this.view.connectionDiagnostic === 'string' && this.view.connectionDiagnostic.length > 0) { Text($r('app.string.product_connection_diagnostic', this.view.connectionDiagnostic)).id('product-connection-diagnostic').detailText() }
            if (typeof this.view.startupDiagnostic === 'string' && this.view.startupDiagnostic.length > 0) { Text($r('app.string.product_startup_diagnostic', this.view.startupDiagnostic)).id('product-startup-diagnostic').detailText() }
            if (typeof this.view.startupStorage === 'string' && this.view.startupStorage.length > 0) { Text($r('app.string.product_startup_storage', this.view.startupStorage)).id('product-startup-storage').detailText() }
            if (this.view.storageRecovery === 'required') { Button($r('app.string.product_storage_recover')).id('product-storage-recover').secondaryAction().width('100%').enabled(!this.busy).onClick(() => this.run(() => this.product.recoverDeviceStorage(true))) }
            if (typeof this.view.storageRecoveryAudit === 'string' && this.view.storageRecoveryAudit.length > 0) { Text($r('app.string.product_storage_audit', this.view.storageRecoveryAudit)).id('product-storage-audit').bodyText() }
            if (this.view.storageRecovery === 'recovered') { Text($r('app.string.product_storage_recovered')).id('product-storage-recovered').bodyText() }
            Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
              Button($r('app.string.product_exit')).secondaryAction().onClick(() => this.run(async () => { await this.rich.close(); await this.product.close(); const context = this.getUIContext().getHostContext() as common.UIAbilityContext; await context.terminateSelf() }))
              Button($r('app.string.product_revoke')).dangerAction().enabled(this.view.pairing === 'paired' && !this.busy).onClick(() => { this.revokePending = true })
            }.width('100%')
            if (this.revokePending) { Text($r('app.string.product_revoke_notice')).bodyText(); Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) { Button($r('app.string.product_confirm_revoke')).dangerAction().onClick(() => this.run(async () => { await this.product.revoke(); this.revokePending = false })); Button($r('app.string.product_keep_pair')).secondaryAction().onClick(() => { this.revokePending = false }) }.width('100%') }
          }.card()
        }
      }
      if (this.page === 'conversation') {
        if (this.selectedArchived()) {
          Column({ space: 10 }) {
            Row({ space: 8 }) { SymbolGlyph($r('sys.symbol.archivebox')).fontSize(16).fontColor([$r('app.color.text_secondary')]); Text($r('app.string.archived_notice')).fontSize(13).lineHeight(19).fontColor($r('app.color.text_secondary')).layoutWeight(1) }.width('100%')
            if (this.manageable()) {
              Button($r('app.string.session_unarchive')).id('product-unarchive').secondaryAction().constraintSize({ minHeight: 36 }).height(36).fontSize(13).padding({ left: 16, right: 16 }).enabled(!this.busy).onClick(() => this.run(() => this.manageSession('unarchive', this.view.selected)))
            }
          }.width('100%').padding(10).backgroundColor($r('app.color.surface')).borderRadius(12).alignItems(HorizontalAlign.Start)
        } else if (this.view.readOnly && this.view.historySyncing !== true) {
          Row({ space: 8 }) { SymbolGlyph($r('sys.symbol.lock')).fontSize(16).fontColor([$r('app.color.text_secondary')]); Text($r('app.string.mvp_read_only')).fontSize(13).fontColor($r('app.color.text_secondary')).layoutWeight(1) }
            .width('100%').padding(10).backgroundColor($r('app.color.surface')).borderRadius(12)
        }
        if (this.view.connection !== 'connected') {
          Row({ space: 8 }) { SymbolGlyph($r('sys.symbol.wifi_slash')).fontSize(16).fontColor([$r('app.color.warning')]); Text($r('app.string.mvp_offline')).fontSize(13).fontColor($r('app.color.text_secondary')).layoutWeight(1) }
            .width('100%').padding(10).backgroundColor($r('app.color.surface')).borderRadius(12)
        }
        if (this.view.selected.length > 0 && this.view.messages.length === 0 && this.view.liveText.length === 0) { Text($r('app.string.conversation_empty')).bodyText().textAlign(TextAlign.Center).padding({ top: 40 }) }
        if (this.view.historyHasMore === true) {
          Text(this.historyNotice === 'limit' ? $r('app.string.product_history_limit')
            : this.historyNotice === 'failed' ? $r('app.string.product_history_retry')
            : this.historyNotice === 'empty' ? $r('app.string.product_history_end') : $r('app.string.product_history_pull'))
            .id('product-history-pull').detailText().width('100%').textAlign(TextAlign.Center)
        }
        if (this.view.historyCachedEnd === true) {
          Text($r('app.string.product_history_cached_end')).id('product-history-cached-end').detailText().width('100%').textAlign(TextAlign.Center)
        }
        // An earlier page can change a row's process without changing the answer ID.
        ForEach(this.view.messages, (message: ProductMessage) => {
          Column({ space: 6 }) {
            if (message.processKey !== undefined && message.processText !== undefined) {
              this.processDisclosure(message.processKey, message.processText, false)
            }
            if (message.text.length > 0) {
              MessageView({ role: message.role, text: message.text }).id('product-message-' + message.id)
            } else if (message.richPending === true) {
              Text($r('app.string.product_rich_workspace_hint')).detailText()
            }
          }.width('100%').alignItems(HorizontalAlign.Start)
        }, (message: ProductMessage) => message.id + ':' + this.messageRows.get(message.id)?.revision)
        if (this.view.liveText.length > 0) { this.processDisclosure('live', this.view.liveText, true) }
        ProductRichSurface({ owner: this.rich, viewportHeight: this.view.richJson.length > 0 ? this.historyViewportHeight : 1 })
          .visibility(this.view.richJson.length > 0 ? Visibility.Visible : Visibility.Hidden)
      }
    }.padding({ left: 16, right: 16, top: 12, bottom: this.page === 'conversation' && this.view.richJson.length > 0 ? 0 : 20 }).width('100%').onAreaChange((_previous: Area, current: Area) => this.conversationContentArea(Number(current.height)))
    }.id('product-page-scroll').scrollable(ScrollDirection.Vertical).align(Alignment.Top).width('100%').height('100%').onDidScroll((xOffset: number, yOffset: number, state: ScrollState) => this.trackScroll(state)).onClick(() => this.dismissKeyboard())
      .onAreaChange((_previous: Area, current: Area) => {
        const height = Math.max(1, Number(current.height))
        if (Number.isFinite(height) && height !== this.historyViewportHeight) this.historyViewportHeight = height
        this.followLatest()
      })
    }.width('100%').height('100%').pullToRefresh(this.canPullHistory()).onRefreshing(() => { void this.pullHistory() })
    }
      if (this.page === 'conversation' && !this.stickToBottom) {
        Button({ type: ButtonType.Circle, stateEffect: true }) { SymbolGlyph($r('sys.symbol.arrow_down')).fontSize(18).fontColor([$r('app.color.text_primary')]) }
          .id('product-jump-latest').width(40).height(40).margin({ right: 16, bottom: 12 }).backgroundColor($r('app.color.surface_high')).shadow({ radius: 12, color: '#66000000' }).accessibilityText($r('app.string.latest_messages')).onClick(() => { this.stickToBottom = true; this.scroller.scrollEdge(Edge.Bottom) })
      }
    }.width('100%').layoutWeight(1)
    if (this.page === 'conversation') {
    Column({ space: 8 }) {
      if (this.view.task !== 'idle' || this.receiptVisible()) {
        Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceBetween, alignItems: ItemAlign.Center, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(6) } }) {
          TaskState({ status: this.view.task, active: this.taskActive() })
          if (this.taskActive()) { Button($r('app.string.product_stop')).id('product-cancel').dangerAction().constraintSize({ minHeight: 32 }).height(32).fontSize(13).padding({ left: 14, right: 14 }).enabled(this.view.selected.length > 0 && !this.view.readOnly && this.view.connection === 'connected' && !this.busy).onClick(() => this.run(() => this.product.cancel())) }
          if (this.receiptVisible()) { Button($r('app.string.product_reconcile')).secondaryAction().constraintSize({ minHeight: 32 }).height(32).fontSize(13).padding({ left: 14, right: 14 }).enabled(this.lastRequest.length > 0 && this.view.selected.length > 0 && !this.busy).onClick(() => this.run(async () => { await this.product.receipt(this.lastRequest) })) }
        }.id('product-task-actions').width('100%')
      }
      Row({ space: 8 }) {
        TextArea({ text: this.draft, placeholder: this.composerHint() }).id('product-composer').areaField().layoutWeight(1).constraintSize({ minHeight: 44, maxHeight: 140 }).borderRadius(22).padding({ left: 16, right: 16, top: 11, bottom: 11 }).fontSize(15).onChange((value: string) => { this.draft = value })
        Button({ type: ButtonType.Circle, stateEffect: true }) { SymbolGlyph($r('sys.symbol.arrow_up')).fontSize(20).fontColor([this.canSend() ? $r('app.color.text_on_accent') : $r('app.color.text_tertiary')]) }
          .id('product-send').width(44).height(44).backgroundColor(this.canSend() ? $r('app.color.accent') : $r('app.color.surface_high')).accessibilityText($r('app.string.product_send'))
          .enabled(this.canSend()).onClick(() => this.run(async () => { this.stickToBottom = true; this.lastRequest = util.generateRandomUUID(false); await this.product.submit(this.lastRequest, this.draft); this.draft = '' }))
      }.width('100%').alignItems(VerticalAlign.Bottom)
    }.id('product-conversation-controls').padding({ left: 12, right: 12, top: 8, bottom: 12 }).width('100%').border({ width: { top: 1 }, color: { top: $r('app.color.border') } })
    }
    }.width('100%').height('100%').backgroundColor($r('app.color.page_background'))
  }
}
