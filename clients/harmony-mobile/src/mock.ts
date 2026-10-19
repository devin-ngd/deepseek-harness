/** In-memory desktop fixture. No DSH, process, credential, model or network capability is imported. */
import { canonical, id, MobileError } from './protocol.ts'
import type { JournalFrame, RequestId, SessionId, SessionRow, TaskReceipt, TaskRequest } from './protocol.ts'
import { richFixture } from './fixtures.ts'
import { isRichJson } from './upstream.ts'
import type { RichActionStatus, RichInvokeRequest, RichMountValue, RichReceipt, RichSaveDraftRequest, RichSnapshot, RichValues } from './upstream.ts'

interface TaskRecord { readonly fingerprint: string; readonly receipt: TaskReceipt; state: 'queued' | 'running' | 'completed' | 'cancelled' }
interface ActionRecord { readonly fingerprint: string; readonly receipt: RichReceipt; readonly values: RichValues }
interface Mount { readonly sessionId: SessionId; readonly revision: number }

/** Test-only dispatch implementation, owning fixture admission and state. */
export class MockDesktop {
  readonly desktopId = id<'mobile-desktop'>('mock-desktop')
  readonly sessions: readonly SessionRow[] = [
    { sessionId: id<'SessionId'>('mock-session-a'), project: '离线实验', title: '表单任务', executionOwner: this.desktopId },
    { sessionId: id<'SessionId'>('mock-session-b'), project: '离线实验', title: '独立会话', executionOwner: this.desktopId },
  ]
  private readonly tasks = new Map<string, TaskRecord>()
  private readonly journals = new Map<SessionId, JournalFrame[]>()
  private readonly blocks = new Map<SessionId, RichSnapshot>()
  private readonly mounts = new Map<string, Mount>()
  private readonly actions = new Map<string, ActionRecord>()
  private nextMount = 0
  admittedTasks = 0
  admittedActions = 0

  /**
   * Refuse all modes except the fixed mock implementation.
   * @param mode - explicit fixture dispatch choice; real adapters are unavailable.
   */
  constructor(mode: string) {
    if (mode !== 'mock') throw new MobileError('mock-only')
    for (const row of this.sessions) { this.journals.set(row.sessionId, []); this.blocks.set(row.sessionId, richFixture(row.sessionId)) }
  }

  /** @param candidate - untrusted request JSON. @returns original admission receipt, or throws before mutation. */
  prompt(candidate: unknown): TaskReceipt {
    if (!isRichJson(candidate) || candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) throw new MobileError('invalid-request')
    const allowed = ['protocol', 'desktopId', 'sessionId', 'requestId', 'scenario', 'text']
    if (Object.keys(candidate).length !== allowed.length || Object.keys(candidate).some(key => !allowed.includes(key))
      || candidate.protocol !== 'dsh-mobile-lab/1' || candidate.desktopId !== this.desktopId || candidate.scenario !== 'rich-form'
      || typeof candidate.sessionId !== 'string' || typeof candidate.requestId !== 'string'
      || typeof candidate.text !== 'string' || !candidate.text.trim() || candidate.text.length > 4096) throw new MobileError('invalid-request')
    const request: TaskRequest = { protocol: 'dsh-mobile-lab/1', desktopId: this.desktopId, scenario: 'rich-form',
      sessionId: id<'SessionId'>(candidate.sessionId), requestId: id<'mobile-request'>(candidate.requestId), text: candidate.text }
    this.requireSession(request.sessionId)
    const key = request.sessionId + '/' + request.requestId
    const fingerprint = canonical(request)
    const prior = this.tasks.get(key)
    if (prior !== undefined) {
      if (prior.fingerprint !== fingerprint) throw new MobileError('id-conflict')
      return structuredClone(prior.receipt)
    }
    const receipt: TaskReceipt = { sessionId: request.sessionId, requestId: request.requestId, accepted: true, state: 'queued' }
    this.tasks.set(key, { fingerprint, receipt, state: 'queued' })
    this.admittedTasks++
    this.append(request.sessionId, { kind: 'task', requestId: request.requestId, state: 'queued' })
    return structuredClone(receipt)
  }

  /** @param sessionId - trusted selected session. @param requestId - original request. @returns receipt without dispatch, or null. */
  receipt(sessionId: SessionId, requestId: RequestId): TaskReceipt | null {
    this.requireSession(sessionId)
    return structuredClone(this.tasks.get(sessionId + '/' + requestId)?.receipt ?? null)
  }

  /** Advance a fixture task; callers may simulate phone absence without changing its execution owner. */
  advance(sessionId: SessionId, requestId: RequestId): void {
    this.requireSession(sessionId)
    const record = this.tasks.get(sessionId + '/' + requestId)
    if (record === undefined) throw new MobileError('not-found')
    if (record.state === 'completed' || record.state === 'cancelled') return
    if (record.state === 'queued') {
      record.state = 'running'
      this.append(sessionId, { kind: 'task', requestId, state: 'running' })
    } else {
      record.state = 'completed'
      this.append(sessionId, { kind: 'text', messageId: 'demo-message', text: '固定演示已完成。执行归属：mock-desktop。' })
      this.append(sessionId, { kind: 'rich', snapshot: this.snapshotFor(sessionId) })
      this.append(sessionId, { kind: 'task', requestId, state: 'completed' })
    }
  }

  /** Cancellation is a separate intent. The fixture has no external effects to reconcile. */
  cancelTask(sessionId: SessionId, requestId: RequestId): void {
    this.requireSession(sessionId)
    const record = this.tasks.get(sessionId + '/' + requestId)
    if (record === undefined) throw new MobileError('not-found')
    if (record.state === 'completed' || record.state === 'cancelled') return
    this.append(sessionId, { kind: 'task', requestId, state: 'cancel_requested' })
    record.state = 'cancelled'
    this.append(sessionId, { kind: 'task', requestId, state: 'cancelled' })
  }

  /** @param sessionId - owner. @param cursor - inclusive last received sequence, or -1. @returns detached replay only; never dispatches. */
  replay(sessionId: SessionId, cursor: number): JournalFrame[] {
    this.requireSession(sessionId)
    const journal = this.journals.get(sessionId)!
    if (!Number.isSafeInteger(cursor) || cursor < -1 || cursor >= journal.length) throw new MobileError('invalid-request')
    return structuredClone(journal.filter(frame => frame.seq > cursor))
  }

  /** Mount authority belongs to this adapter, not the generated page. */
  mount(sessionId: SessionId): RichMountValue {
    this.requireSession(sessionId)
    const snapshot = this.snapshotFor(sessionId)
    const mountId = id<'rich-inline-mount'>('mock-mount-' + ++this.nextMount)
    this.mounts.set(mountId, { sessionId, revision: snapshot.scope.renderRevision })
    return { mountId, snapshot }
  }

  /** Revoke a disposable guest; reopening creates a fresh mount and does not replay actions. */
  dispose(mountId: string): void { this.mounts.delete(mountId) }

  /** @param request - canonically parsed upstream draft request. @returns fixture CAS receipt; rejected saves preserve the old draft. */
  saveDraft(request: RichSaveDraftRequest): RichReceipt {
    const [mount, snapshot] = this.resolveMount(request.mountId)
    if (snapshot.readOnly) throw new MobileError('forbidden')
    if (request.draft.baseRevision !== snapshot.draft.draftRevision) return this.reject(snapshot, 'DRAFT_CONFLICT')
    if (request.draft.stateSchemaVersion !== snapshot.manifest.stateSchemaVersion) return this.reject(snapshot, 'STATE_SCHEMA_CONFLICT')
    const draft = { draftRevision: snapshot.draft.draftRevision + 1, stateSchemaVersion: request.draft.stateSchemaVersion,
      fields: structuredClone(request.draft.fields), dirty: [...request.draft.dirty] }
    this.blocks.set(mount.sessionId, { ...snapshot, draft })
    return { accepted: true, code: 'SAVED', actionId: null, state: null, draftRevision: draft.draftRevision }
  }

  /** @param request - canonically parsed upstream intent. @returns original receipt on identical retries; no real task runs. */
  invoke(request: RichInvokeRequest): RichReceipt {
    const [mount, snapshot] = this.resolveMount(request.mountId)
    if (snapshot.readOnly) throw new MobileError('forbidden')
    const key = mount.sessionId + '/' + snapshot.scope.blockId + '/' + request.actionId
    const { mountId: _mountId, sessionId: _sessionId, ...intent } = request
    const fingerprint = canonical(intent)
    const prior = this.actions.get(key)
    if (prior !== undefined) return prior.fingerprint === fingerprint ? structuredClone(prior.receipt) : this.reject(snapshot, 'ACTION_ID_CONFLICT')
    if (request.expectedDataRevision !== snapshot.dataRevision) return this.reject(snapshot, 'DATA_CONFLICT')
    if (request.draft.baseRevision !== snapshot.draft.draftRevision) return this.reject(snapshot, 'DRAFT_CONFLICT')
    if (request.draft.stateSchemaVersion !== snapshot.manifest.stateSchemaVersion) return this.reject(snapshot, 'STATE_SCHEMA_CONFLICT')
    if (request.fileGrants.length > 0) throw new MobileError('forbidden')
    if (request.actionName !== 'submit') throw new MobileError('forbidden')
    if (snapshot.actions.some(action => !action.terminal)) return this.reject(snapshot, 'BUSY')
    const receipt: RichReceipt = { accepted: true, code: 'ACCEPTED', actionId: request.actionId, state: 'accepted', draftRevision: snapshot.draft.draftRevision + 1 }
    const action: RichActionStatus = { actionId: request.actionId, state: 'accepted', terminal: false, ledgerSeq: 1,
      values: {}, progress: null, lateAfterCancel: false }
    this.actions.set(key, { fingerprint, receipt, values: structuredClone(request.values) })
    this.blocks.set(mount.sessionId, { ...snapshot, actions: [...snapshot.actions, action],
      draft: { draftRevision: receipt.draftRevision, stateSchemaVersion: request.draft.stateSchemaVersion, fields: structuredClone(request.draft.fields), dirty: [] } })
    this.admittedActions++
    return structuredClone(receipt)
  }

  /** Deterministically settle a known fixture action; acceptance and completion remain distinct. */
  completeAction(mountId: string, actionId: RichActionStatus['actionId']): void {
    const [mount, snapshot] = this.resolveMount(mountId)
    const selected = snapshot.actions.find(action => action.actionId === actionId)
    if (selected === undefined) throw new MobileError('not-found')
    if (selected.terminal) return
    const record = this.actions.get(mount.sessionId + '/' + snapshot.scope.blockId + '/' + actionId)
    if (record === undefined) throw new MobileError('not-found')
    const actions = snapshot.actions.map(action => action.actionId === actionId ? { ...action, state: 'completed' as const, terminal: true, ledgerSeq: action.ledgerSeq + 1, values: structuredClone(record.values) } : action)
    const updated = { ...snapshot, dataRevision: snapshot.dataRevision + 1, values: structuredClone(record.values), actions }
    this.blocks.set(mount.sessionId, updated)
    this.append(mount.sessionId, { kind: 'rich', snapshot: structuredClone(updated) })
  }

  /** Read status without any dispatch or state mutation. */
  status(mountId: string, actionId: string): RichActionStatus | null {
    const [, snapshot] = this.resolveMount(mountId)
    return structuredClone(snapshot.actions.find(action => action.actionId === actionId) ?? null)
  }

  /** Read complete fixture state for history and draft recovery. */
  snapshotFor(sessionId: SessionId): RichSnapshot {
    this.requireSession(sessionId)
    return structuredClone(this.blocks.get(sessionId)!)
  }

  /** Restore inherited publication as read-only; drafts and actions are not inherited. */
  setInheritedReadOnly(sessionId: SessionId): void {
    const snapshot = this.snapshotFor(sessionId)
    this.blocks.set(sessionId, { ...snapshot, readOnly: true, actions: [], files: [], draft: { ...snapshot.draft, fields: {}, dirty: [] } })
  }

  /** @param sessionId - synthetic owner. @param values - confirmed fixture values. Advance only dataRevision; preserve unsent drafts and existing actions. */
  updateFixtureValues(sessionId: SessionId, values: RichSnapshot['values']): void {
    const snapshot = this.snapshotFor(sessionId)
    this.blocks.set(sessionId, { ...snapshot, dataRevision: snapshot.dataRevision + 1, values: structuredClone(values) })
  }

  /** @param sessionId - synthetic owner. @param manifest - next code revision with unchanged state schema. Preserve drafts and actions; old mounts become stale. */
  replaceFixturePublication(sessionId: SessionId, manifest: RichSnapshot['manifest']): void {
    const snapshot = this.snapshotFor(sessionId)
    if (manifest.blockId !== snapshot.scope.blockId || manifest.renderRevision !== snapshot.scope.renderRevision + 1 || manifest.stateSchemaVersion !== snapshot.manifest.stateSchemaVersion) throw new MobileError('forbidden')
    this.blocks.set(sessionId, { ...snapshot, scope: { ...snapshot.scope, renderRevision: manifest.renderRevision }, manifest: structuredClone(manifest) })
  }

  private requireSession(sessionId: SessionId): void {
    if (!this.sessions.some(row => row.sessionId === sessionId)) throw new MobileError('not-found')
  }
  private append(sessionId: SessionId, event: JournalFrame['event']): void {
    const journal = this.journals.get(sessionId)!
    journal.push({ desktopId: this.desktopId, sessionId, seq: journal.length, event: structuredClone(event) })
  }
  private resolveMount(mountId: string): [Mount, RichSnapshot] {
    const mount = this.mounts.get(mountId)
    if (mount === undefined) throw new MobileError('stale-lease')
    const snapshot = this.snapshotFor(mount.sessionId)
    if (snapshot.scope.renderRevision !== mount.revision) throw new MobileError('stale-lease')
    return [mount, snapshot]
  }
  private reject(snapshot: RichSnapshot, code: string): RichReceipt {
    return { accepted: false, code, actionId: null, state: null, draftRevision: snapshot.draft.draftRevision }
  }
}
