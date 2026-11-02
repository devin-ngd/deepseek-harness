/** UI-preview owner with the native owner's exports: fixed synthetic sessions and replies for layout review; no key, file, socket or desktop access. */
import { common } from '@kit.AbilityKit'
import { ProductStorage } from './ProductCore'
import { NativeRelayBudgets } from '../paired/PairedCore'
import { NativeProductRichPort } from './NativeProductRichOwner'
import { ProductView, ProductProject, ProductSession, ProductMessage, ProductPairingPreview } from './ProductView'

export interface NativeDeviceRecoveryPolicy { bindingId: string; epoch: number; desktopCredentialId: string; credentialId: string; identityAlias: string; retiredRoutes: string[] }
export interface NativeProductConfiguration { deviceRecovery?: NativeDeviceRecoveryPolicy; deviceBindingMode?: boolean; deviceAutoConnect?: boolean; deviceReconnectMs?: number; deviceRoutingTtlMs?: number; deviceCatalogRefreshMs?: number; enabled: boolean; approvedHost: string; identityAlias: string; deviceApiVerified: number; maxCryptoBytes: number; maxTotalSendBytes: number; publicTrustMaxBytes: number; corePolicyJson: string; relay: NativeRelayBudgets }
export interface NativeProductStorageMetadata { file: string; size: number; lock: string; held: boolean }
export interface NativeProductPublicStorage extends ProductStorage { inspect?(): NativeProductStorageMetadata; recoveryRequired?(): boolean }

const HOST: string = 'desktop.preview.invalid'
const activeProducts: Set<NativeProductOwner> = new Set()

const REVIEW_REPLY: string = [
  '已检查 `clients/harmony-mobile` 的页面结构，主要问题如下：',
  '',
  '## 发现',
  '1. 历史与输入框共用一个滚动区，键盘弹起时输入框可能被遮挡',
  '2. 错误只显示通用文案，看不出原因',
  '3. 会话列表没有运行状态',
  '',
  '### 建议',
  '- 顶栏固定，输入区固定在底部',
  '- 新消息到达时**自动滚到底部**，手动上滑后暂停跟随',
  '  - 出现“跳到最新”按钮',
  '',
  '```ts',
  'const scroller: Scroller = new Scroller()',
  'scroller.scrollEdge(Edge.Bottom)',
  '```',
  '',
  '| 检查项 | 状态 |',
  '| --- | --- |',
  '| 布局审计 | 通过 |',
  '| 真机验收 | 待进行 |',
  '',
  '> 模拟器结果不能代替真机验收。'
].join('\n')

function message(id: string, role: string, text: string): ProductMessage { const value: ProductMessage = { id: id, role: role, text: text }; return value }
interface PreviewIntent { action: string; projectId?: string | null; sessionId?: string }
function session(sessionId: string, projectId: string | null, title: string, minutesAgo: number, running: boolean = false, pinned: boolean = false, archived: boolean = false, blank: boolean = false): ProductSession { const value: ProductSession = { sessionId: sessionId, projectId: projectId, title: title, updatedAt: Date.now() - minutesAgo * 60000, running: running, pinned: pinned, archived: archived, blank: blank }; return value }
function project(projectId: string, title: string): ProductProject { const value: ProductProject = { projectId: projectId, title: title }; return value }

function history(sessionId: string): ProductMessage[] {
  if (sessionId === 's1') return [message('s1-1', 'user', '检查手机端 UI 和交互是否合理，重点是会话控制。'), message('s1-2', 'assistant', REVIEW_REPLY)]
  if (sessionId === 's2') return [message('s2-1', 'user', '重连之后任务状态没有同步，帮我看一下。'), message('s2-2', 'assistant', '重连后需要先查询原回执，再决定是否重发。相关入口在 `receipt()`，失败时界面会显示 **查询原回执** 按钮。')]
  if (sessionId === 's4') return [message('s4-1', 'user', '整理本周合并的 PR。'), message('s4-2', 'assistant', '本周共合并 6 个 PR：\n- 移动端布局审计\n- relay 重连修复\n- 文档更新')]
  if (sessionId === 's5') {
    const rows: ProductMessage[] = []
    for (let i = 1; i <= 8; i++) {
      rows.push(message('s5-u' + i, 'user', '第 ' + i + ' 个问题：这一段用来检查较长历史的滚动表现。'))
      rows.push(message('s5-a' + i, 'assistant', '第 ' + i + ' 条回复。滚动到中间后，新的回复不应把视图强制拉到底部；点击右下角按钮可以回到最新位置。\n\n- 要点 A\n- 要点 B'))
    }
    return rows
  }
  return []
}

function replyFor(text: string): string {
  const head = '收到：「' + text + '」\n\n这是预览环境的模拟回复，用于检查流式输出、自动滚动和 Markdown 显示。\n\n## 步骤\n1. 解析输入\n2. 生成计划\n3. 执行并汇报\n\n```bash\npnpm run test -- --filter mobile\n```\n\n'
  if (text.startsWith('/long')) {
    let body = ''
    for (let i = 1; i <= 6; i++) body += '### 第 ' + i + ' 部分\n这是一段较长的说明文字，用于确认流式输出期间页面会持续跟随最新内容，而手动上滑后不会被拉回底部。\n\n'
    return head + body + '完成后任务状态会变为 **已完成**。'
  }
  return head + '完成后任务状态会变为 **已完成**。'
}

/** Mirrors the native owner's methods; only connect, select, manage, submit, cancel, stopRoute and revoke change the synthetic view. */
export class NativeProductOwner implements NativeProductRichPort {
  private view: ProductView = new ProductView()
  private publish: (view: string) => void = () => {}
  private enabled: boolean = true
  private timers: number[] = []
  private stream: number = -1
  private streamText: string = ''
  private streamOffset: number = 0
  private histories: Map<string, ProductMessage[]> = new Map()
  private counter: number = 0
  constructor(config: NativeProductConfiguration) { void config }
  private emit(): void { this.publish(JSON.stringify(this.view)) }
  private later(delay: number, work: () => void): void { this.timers.push(setTimeout(work, delay)) }
  private messages(sessionId: string): ProductMessage[] { const known = this.histories.get(sessionId); if (known !== undefined) return known; const created = history(sessionId); this.histories.set(sessionId, created); return created }
  private stopStream(): void { if (this.stream >= 0) clearInterval(this.stream); this.stream = -1 }
  async recoverDeviceStorage(confirmed: boolean): Promise<void> { void confirmed }
  deviceBindingMode(): boolean { return true }
  async initialize(context: common.UIAbilityContext, publish: (view: string) => void): Promise<void> {
    void context; activeProducts.add(this); this.publish = publish
    this.view.pairing = 'paired'; this.view.connection = 'disconnected'; this.view.connectionGeneration = 1; this.view.readOnly = true
    this.emit()
  }
  connectionEnabled(): boolean { return this.enabled }
  connectionHost(): string { return this.enabled ? HOST : '' }
  async previewEnrollment(raw: string): Promise<string> { void raw; throw new Error('preview only') }
  async signEnrollment(raw: string, compared: boolean): Promise<string> { void raw; void compared; throw new Error('preview only') }
  async savedPairing(confirmed: boolean): Promise<string> { void confirmed; throw new Error('preview only') }
  async listSavedScopes(confirmed: boolean): Promise<string> { void confirmed; return '[]' }
  async selectSavedScope(key: string, confirmed: boolean): Promise<string> { void key; void confirmed; throw new Error('preview only') }
  async saveNewScope(raw: string, compared: boolean, networkApproved: boolean): Promise<void> { void raw; void compared; void networkApproved; throw new Error('preview only') }
  async pairWithConnection(raw: string, compared: boolean, networkApproved: boolean): Promise<void> { void raw; void compared; void networkApproved; throw new Error('preview only') }
  async initializeIdentity(alias: string, confirmed: boolean): Promise<string> { void alias; void confirmed; throw new Error('preview only') }
  async publicIdentity(alias: string): Promise<string> { void alias; throw new Error('preview only') }
  preview(raw: string): string { void raw; return JSON.stringify(new ProductPairingPreview()) }
  pair(raw: string, compared: boolean): Promise<void> { void raw; void compared; return Promise.reject(new Error('preview only')) }
  async connect(networkApproved: boolean = false): Promise<void> {
    if (!networkApproved || !this.enabled) throw new Error('preview connection refused')
    this.view.connection = 'connecting'; this.view.error = ''; this.emit()
    this.later(1500, () => {
      this.view.connection = 'connected'; this.view.connectionGeneration++
      this.view.projects = [project('p1', 'deepseek-harness'), project('p2', '日常事务'), project('p3', 'dsh-plugins')]
      this.view.sessions = [session('s1', 'p1', '移动端深色主题与会话控制优化', 3, false, true), session('s2', 'p1', '排查 relay 重连后任务状态不同步', 0, true), session('s3', 'p1', '为 session-query 增加全文检索', 130), session('s4', 'p2', '周报：整理本周合并的 PR', 4320, false, false, true), session('s5', 'p2', '很长的会话标题用于检查两行截断效果，包含较多文字以便确认列表项在窄屏上的换行与省略号显示是否正常', 13000), session('s6', null, '临时问题：查看磁盘占用', 1500), session('s7', 'p1', 's7', 1, false, false, false, true)]
      this.view.manageable = true
      this.emit()
    })
  }
  async previewRoute(raw: string): Promise<string> { void raw; throw new Error('preview only') }
  async signRoute(raw: string, approved: boolean): Promise<string> { void raw; void approved; throw new Error('preview only') }
  async stopRoute(): Promise<void> {
    this.stopStream(); this.enabled = false
    this.view.connection = 'disconnected'; this.view.sessions = []; this.view.projects = []; this.view.manageable = false; this.view.selected = ''; this.view.messages = []; this.view.liveText = ''; this.view.task = 'idle'; this.view.readOnly = true
    this.emit()
  }
  async manage(raw: string): Promise<string> {
    if (this.view.connection !== 'connected') throw new Error('preview offline')
    const intent = JSON.parse(raw) as PreviewIntent
    if (intent.action === 'create') { const sessionId = 'n' + (++this.counter); this.view.sessions = [session(sessionId, intent.projectId ?? null, sessionId, 0, false, false, false, true)].concat(this.view.sessions); this.emit(); return sessionId }
    const row = this.view.sessions.find((item: ProductSession) => item.sessionId === intent.sessionId)
    if (row === undefined) throw new Error('preview session absent')
    if (intent.action === 'archive') { row.archived = true; row.running = false }
    else if (intent.action === 'unarchive') row.archived = false
    else if (intent.action === 'pin') row.pinned = true
    else if (intent.action === 'unpin') row.pinned = false
    else throw new Error('preview action refused')
    this.emit(); return row.sessionId
  }
  async select(sessionId: string): Promise<void> {
    if (this.view.connection !== 'connected') throw new Error('preview offline')
    this.stopStream()
    this.view.selected = sessionId; this.view.messages = this.messages(sessionId); this.view.liveText = ''
    this.view.task = sessionId === 's1' ? 'completed' : 'idle'; this.view.readOnly = false
    this.emit()
  }
  async submit(request: string, text: string): Promise<string> {
    if (this.view.connection !== 'connected' || this.view.readOnly || this.stream >= 0) throw new Error('preview submit refused')
    const value = text.trim()
    if (value.startsWith('/error')) { this.view.error = 'connection-unavailable'; this.emit(); return request }
    const rows = this.messages(this.view.selected)
    rows.push(message('local-' + (++this.counter), 'user', value))
    const row = this.view.sessions.find((item: ProductSession) => item.sessionId === this.view.selected)
    if (row !== undefined) { row.blank = false; row.updatedAt = Date.now(); if (row.title === row.sessionId) row.title = value.substring(0, 24) }
    this.view.messages = rows; this.view.task = 'accepted'; this.view.liveText = ''; this.emit()
    this.streamText = replyFor(value); this.streamOffset = 0
    this.later(500, () => {
      this.view.task = 'running'; this.emit()
      this.stream = setInterval(() => {
        this.streamOffset = Math.min(this.streamText.length, this.streamOffset + 7)
        this.view.liveText = this.streamText.substring(0, this.streamOffset)
        if (this.streamOffset >= this.streamText.length) { this.stopStream(); rows.push(message('local-' + (++this.counter), 'assistant', this.streamText)); this.view.messages = rows; this.view.liveText = ''; this.view.task = 'completed' }
        this.emit()
      }, 80)
    })
    return request
  }
  async receipt(request: string): Promise<string> { void request; return '' }
  async cancel(): Promise<void> {
    if (this.stream < 0 && this.view.task !== 'accepted') throw new Error('preview nothing to cancel')
    this.stopStream(); this.view.task = 'cancel_requested'; this.emit()
    this.later(700, () => {
      const rows = this.messages(this.view.selected)
      if (this.view.liveText.length > 0) rows.push(message('local-' + (++this.counter), 'assistant', this.view.liveText))
      this.view.messages = rows; this.view.liveText = ''; this.view.task = 'cancelled'; this.emit()
    })
  }
  richRequest(packet: string): Promise<string> { void packet; return Promise.reject(new Error('preview only')) }
  richRefusal(packet: string): string { void packet; return '' }
  async revoke(): Promise<void> { this.stopStream(); this.enabled = false; this.view.pairing = 'revoked'; this.view.connection = 'disconnected'; this.view.sessions = []; this.view.selected = ''; this.emit() }
  async foreground(): Promise<void> { activeProducts.add(this) }
  async close(): Promise<void> { this.stopStream(); for (const timer of this.timers) clearTimeout(timer); this.timers = []; activeProducts.delete(this) }
}

export async function closeActiveProducts(): Promise<void> { const work: Promise<void>[] = []; for (const owner of activeProducts) work.push(owner.close()); await Promise.allSettled(work) }
