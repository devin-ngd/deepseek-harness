/** One trusted message block's transport, durable refresh and disposable native guest. */
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type {
  RichActionRequest, RichActionStatus, RichApplyUpdateRequest, RichBlockId, RichFileGrant,
  RichInvokeRequest, RichMountId, RichMountRequest, RichMountRequestId, RichMountValue,
  RichReceipt, RichRegisterFileRequest, RichSaveDraftRequest, RichSnapshot, RichRenderRequest, RichRenderReceipt,
  RichPollRequest, RichPollValue,
} from '../shared/types.ts'
import { guestSdk } from './guest-sdk.ts'
import { parseActionRequest, parseInvokeRequest, parseSaveDraftRequest } from '../shared/validate.ts'
import type { NativeRichBridge, RichCopyLabels, RichReservation } from './native.ts'
import type { RichAppearance } from '../shared/theme.ts'
import { richThemeCss, richThemeTokens } from '../shared/theme.ts'

/** Unwrapped generated RPC methods; connection errors remain rejections. */
export interface RichRpc {
  mount(this: void, request: RichMountRequest): Promise<RichMountValue>
  snapshot(this: void, request: RichMountRequestId): Promise<RichSnapshot>
  snapshotIfChanged?(this: void, request: RichPollRequest): Promise<RichPollValue>
  reportRender(this: void, request: RichRenderRequest): Promise<RichRenderReceipt>
  saveDraft(this: void, request: RichSaveDraftRequest): Promise<RichReceipt>
  invoke(this: void, request: RichInvokeRequest): Promise<RichReceipt>
  status(this: void, request: RichActionRequest): Promise<RichActionStatus | null>
  registerFile(this: void, request: RichRegisterFileRequest): Promise<RichFileGrant>
  applyUpdate(this: void, request: RichApplyUpdateRequest): Promise<RichSnapshot>
  dispose(this: void, request: RichMountRequestId): Promise<void>
}

/** Immutable object-layer state read through the renderer's keyed hook. */
export interface BlockView {
  readonly snapshot: RichSnapshot | null
  readonly reservation: RichReservation | null
  readonly height: number
  readonly error: string | null
  readonly closed: boolean
  readonly supported: boolean
  readonly inputWarning: boolean
  readonly repairing: boolean
}

/** Guest packets omit session/message/block targeting entirely. */
interface GuestPacket {
  protocol: 'lumina-rich/1'
  mountId: string
  renderRevision: number
  packetId: string
  seq: number
  type: 'ready' | 'resize' | 'draft.save' | 'action.invoke' | 'action.status' | 'content.error' | 'render.result' | 'input.error' | 'update.ready'
  payload: Record<string, unknown>
}

/** Parse the untrusted process packet before routing any intent. */
function guestPacket(value: Record<string, unknown>): GuestPacket | null {
  const allowed = new Set(['protocol', 'mountId', 'renderRevision', 'packetId', 'seq', 'type', 'payload'])
  if (Object.keys(value).some(key => !allowed.has(key))) return null
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 131072 || value.protocol !== 'lumina-rich/1') return null
  if (typeof value.mountId !== 'string' || typeof value.packetId !== 'string' || value.packetId.length > 128) return null
  if (!Number.isSafeInteger(value.seq) || Number(value.seq) < 1 || !Number.isSafeInteger(value.renderRevision)) return null
  if (!['ready', 'resize', 'draft.save', 'action.invoke', 'action.status', 'content.error', 'render.result', 'input.error', 'update.ready'].includes(String(value.type))) return null
  if (typeof value.payload !== 'object' || value.payload === null || Array.isArray(value.payload)) return null
  return value as object as GuestPacket
}

/** Owns one rendering lifetime; RPC scope is resolved by the Host's registered mount. */
export class RichBlockController {
  private view: BlockView
  private readonly listeners = new Set<() => void>()
  private mountId: RichMountId | null = null
  private stopNative: (() => void) | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private generation = 0
  private guestSeq = 0
  private hostSeq = 0
  private ready = false
  private pollRevision: string | null = null
  private lastTheme = ''
  /** Theme whose base CSS the current executable guest document contains. */
  private styledAs: RichAppearance['theme'] | null = null
  private notifying = false
  private chain: Promise<void> = Promise.resolve()
  private refreshing: Promise<void> | null = null
  private readonly packets = new Map<string, { json: string; response: Record<string, unknown> }>()
  private readonly actions = new Map<string, number>()
  private updateBarrier: { id: string; resolve: () => void; reject: (error: Error) => void } | null = null

  /**
   * @param sessionId - trusted Session binding.
   * @param rpc - generated Host service adapter.
   * @param native - trusted Desktop adapter, absent on Web.
   * @param pollIntervalMs - deployment-configured refresh cadence.
   * @param appearance - reads the current profile preferences, shared with streaming previews.
   * @param copyLabels - localized copy controls; omitted for consumers without that UI.
   */
  constructor(private readonly sessionId: SessionId, private readonly rpc: RichRpc,
    private readonly native: NativeRichBridge | undefined, private readonly pollIntervalMs: number,
    private readonly appearance: () => RichAppearance, private readonly copyLabels?: () => RichCopyLabels) {
    this.view = { snapshot: null, reservation: null, height: 160, error: null, closed: false,
      supported: native !== undefined, inputWarning: false, repairing: false }
  }

  /**
   * Read the renderer view.
   * @returns the current immutable view.
   */
  getSnapshot = (): BlockView => this.view
  /**
   * Observe view changes.
   * @param listener - renderer subscriber.
   * @returns unsubscribe.
   */
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  private publish(change: Partial<BlockView>): void {
    if (Object.entries(change).every(([key, value]) => this.view[key as keyof BlockView] === value)) return
    this.view = { ...this.view, ...change }
    if (this.notifying) return
    this.notifying = true
    queueMicrotask(() => {
      this.notifying = false
      for (const listener of this.listeners) { try { listener() } catch (error) { console.error('Rich block subscriber failed', error) } }
    })
  }

  /**
   * Open only a block selected from a durable assistant message; no history action is replayed.
   * @param messageId - owner-provided durable assistant identity.
   * @param blockId - marker id checked again by Host against that message.
   * @returns cleanup for this view's lifetime.
   */
  open(messageId: MessageId, blockId: RichBlockId): () => void {
    const generation = ++this.generation
    this.publish({ closed: false, error: null, repairing: false })
    void this.restart(messageId, blockId, generation).catch((error: unknown) => {
      if (generation === this.generation) this.publish({ error: String(error), reservation: null })
    })
    return () => { if (generation === this.generation) void this.close() }
  }

  private async restart(messageId: MessageId, blockId: RichBlockId, generation: number): Promise<void> {
    const oldMount = this.mountId
    this.mountId = null
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null }
    await this.retireGuest()
    if (oldMount !== null) await this.rpc.dispose({ mountId: oldMount })
    if (generation === this.generation) await this.start(messageId, blockId, generation)
  }

  private async start(messageId: MessageId, blockId: RichBlockId, generation: number): Promise<void> {
    const mounted = await this.rpc.mount({ sessionId: this.sessionId, messageId, blockId })
    if (generation !== this.generation) { await this.rpc.dispose({ mountId: mounted.mountId }); return }
    this.mountId = mounted.mountId
    this.pollRevision = null
    this.publish({ snapshot: mounted.snapshot, error: null, repairing: false })
    if (this.native !== undefined) await this.createGuest(mounted.snapshot, generation)
    this.schedule(generation)
  }

  private async createGuest(snapshot: RichSnapshot, generation: number): Promise<void> {
    if (this.native === undefined || this.mountId === null) return
    const mountId = this.mountId
    this.guestSeq = 0; this.hostSeq = 0; this.ready = false
    this.chain = Promise.resolve()
    this.packets.clear(); this.actions.clear()
    const manifest = snapshot.manifest
    const limits = this.native.limits
    if (![limits.documentBytes, limits.sdkBytes, limits.guestPacketBytes, limits.hostPacketBytes]
      .every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('RICH_NATIVE_LIMITS_INVALID')
    const sdk = guestSdk(mountId, manifest.renderRevision, limits.guestPacketBytes)
    if (new TextEncoder().encode(sdk).byteLength > limits.sdkBytes) throw new Error('RICH_SDK_TOO_LARGE')
    const appearance = this.appearance()
    const css = richThemeCss(appearance) + manifest.css
    const documentBytes = [manifest.html, css, manifest.js, sdk]
      .reduce((bytes, source) => bytes + new TextEncoder().encode(source).byteLength, 0)
    if (documentBytes > limits.documentBytes) {
      throw new Error('RICH_DOCUMENT_TOO_LARGE')
    }
    const reservation = await this.native.acquire({ mountId, mountNonce: randomUUID(),
      html: manifest.html, css, js: manifest.js, sdk, ...this.copyLabels === undefined ? {} : { copy: this.copyLabels() } })
    if (generation !== this.generation || mountId !== this.mountId) { await this.native.release(reservation.lease); return }
    this.stopNative = this.native.subscribe(reservation.lease, (value) => {
      if (generation !== this.generation || this.view.reservation?.lease !== reservation.lease) return
      if (value.type === 'native.error') { this.publish({ error: String(value.code) }); void this.close(); return }
      this.chain = this.chain.then(() => this.receive(value, generation)).catch((error: unknown) => {
        if (generation === this.generation) this.publish({ error: String(error) })
      })
    })
    this.styledAs = appearance.theme
    this.publish({ reservation })
    // A switch that landed while this document was being built is applied once the guest exists.
    if (this.appearance().theme !== appearance.theme) void this.restyle().catch((error: unknown) => { console.error('Rich restyle failed', error) })
  }

  private async send(type: string, payload: Record<string, unknown>): Promise<void> {
    if (this.native === undefined || this.mountId === null || this.view.reservation === null || this.view.snapshot === null) return
    const packet = { protocol: 'lumina-rich/1', mountId: this.mountId,
      renderRevision: this.view.snapshot.manifest.renderRevision, packetId: randomUUID(), seq: this.hostSeq + 1, type, payload }
    if (new TextEncoder().encode(JSON.stringify(packet)).byteLength > this.native.limits.hostPacketBytes) {
      this.publish({ error: 'RICH_HOST_PACKET_TOO_LARGE' })
      await this.close()
      return
    }
    this.hostSeq++
    await this.native.send(this.view.reservation.lease, packet)
  }

  private async receive(value: Record<string, unknown>, generation: number): Promise<void> {
    const packet = guestPacket(value)
    const snapshot = this.view.snapshot
    if (packet === null || snapshot === null || this.mountId === null || packet.mountId !== this.mountId
      || packet.renderRevision !== snapshot.manifest.renderRevision || generation !== this.generation) return
    const json = JSON.stringify(packet)
    const previous = this.packets.get(packet.packetId)
    if (previous !== undefined) {
      if (previous.json === json) await this.send('receipt', previous.response)
      else await this.send('receipt', { requestId: packet.packetId, error: 'PACKET_CONFLICT' })
      return
    }
    if (packet.seq !== this.guestSeq + 1) return
    this.guestSeq = packet.seq
    if (packet.type === 'ready') {
      if (this.ready || packet.payload.sdkVersion !== '1') return
      this.ready = true
      const theme = this.theme()
      this.lastTheme = JSON.stringify(theme)
      await this.send('init', { snapshot, theme })
      return
    }
    if (!this.ready) return
    if (packet.type === 'update.ready') {
      const barrier = this.updateBarrier
      if (barrier !== null && packet.payload.requestId === barrier.id) {
        if (typeof packet.payload.error === 'string') barrier.reject(new Error(packet.payload.error))
        else barrier.resolve()
      }
      return
    }
    if (packet.type === 'resize') {
      const height = packet.payload.height
      // Reserve one CSS pixel for device-scale rounding of the native viewport.
      if (typeof height === 'number' && Number.isFinite(height)) this.publish({ height: Math.max(24, Math.min(12000, Math.ceil(height) + 1)) })
      return
    }
    if (packet.type === 'content.error') {
      if (typeof packet.payload.message !== 'string' || Object.keys(packet.payload).some(key => !['message', 'draftPreserved'].includes(key))
        || packet.payload.draftPreserved !== undefined && typeof packet.payload.draftPreserved !== 'boolean') return
      const preserveGuest = packet.payload.draftPreserved === true
      this.publish({ error: 'CONTENT_ERROR', inputWarning: this.view.inputWarning || preserveGuest })
      // Keep the Host mount for polling repaired code; retire only the failing executable guest.
      let repairQueued = false
      try { repairQueued = (await this.rpc.reportRender({ mountId: this.mountId, state: 'failed', message: packet.payload.message.slice(0, 512) })).repairQueued }
      finally { if (!preserveGuest) await this.retireGuest() }
      if (generation === this.generation) this.publish({ repairing: repairQueued })
      return
    }
    if (packet.type === 'render.result') {
      if (packet.payload.state !== 'rendered' || Object.keys(packet.payload).some(key => key !== 'state')) return
      await this.rpc.reportRender({ mountId: this.mountId, state: 'rendered', message: '' })
      return
    }
    if (packet.type === 'input.error') { this.publish({ inputWarning: true }); return }
    const request = { ...packet.payload, mountId: this.mountId }
    let response: Record<string, unknown>
    try {
      switch (packet.type) {
        case 'draft.save': {
          const parsed = parseSaveDraftRequest(request)
          if (parsed === null) throw new Error('INVALID_DRAFT')
          const receipt = await this.rpc.saveDraft(parsed)
          this.publish({ inputWarning: !receipt.accepted })
          response = { requestId: packet.packetId, receipt }; break
        }
        case 'action.invoke': {
          const parsed = parseInvokeRequest(request)
          if (parsed === null) throw new Error('INVALID_ACTION')
          response = { requestId: packet.packetId, receipt: await this.rpc.invoke(parsed) }; break
        }
        case 'action.status': {
          const parsed = parseActionRequest(request)
          if (parsed === null) throw new Error('INVALID_ACTION_LOOKUP')
          response = { requestId: packet.packetId, result: await this.rpc.status(parsed) }; break
        }
      }
    } catch (error) { response = { requestId: packet.packetId, error: String(error) } }
    if (generation !== this.generation || packet.mountId !== this.mountId) return
    this.packets.set(packet.packetId, { json, response })
    if (this.packets.size > 64) { const key = this.packets.keys().next().value; if (key !== undefined) this.packets.delete(key) }
    await this.send('receipt', response)
    await this.refresh(generation)
  }

  private theme(): Record<string, unknown> {
    if (this.styledAs !== 'none') return { mode: 'dark', tokens: richThemeTokens(),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }
    const style = getComputedStyle(document.documentElement)
    const tokens: Record<string, string> = {}
    for (const name of ['--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-interactive-bg-hover', '--dsw-radius-sm']) {
      tokens[name] = style.getPropertyValue(name)
    }
    return { mode: style.colorScheme || 'light dark', tokens, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }
  }

  private schedule(generation: number): void {
    if (generation !== this.generation || this.view.closed || this.timer !== null) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.refresh(generation).catch((error: unknown) => {
        if (generation === this.generation) this.publish({ error: String(error) })
      }).finally(() => { this.schedule(generation) })
    }, this.pollIntervalMs)
  }

  private refresh(generation: number): Promise<void> {
    if (this.refreshing !== null) return this.refreshing
    const pending = this.refreshNow(generation)
    this.refreshing = pending
    const settled = (): void => { if (this.refreshing === pending) this.refreshing = null }
    void pending.then(settled, settled)
    return pending
  }

  private async remount(snapshot: RichSnapshot, generation: number, mountId: RichMountId): Promise<void> {
    if (generation !== this.generation || mountId !== this.mountId) return
    this.mountId = null
    await this.retireGuest()
    await this.rpc.dispose({ mountId })
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- Another async lifecycle may mount while teardown is awaited.
    if (generation !== this.generation || this.mountId !== null) return
    await this.start(snapshot.scope.messageId, snapshot.scope.blockId, generation)
  }

  private async refreshNow(generation: number): Promise<void> {
    const mountId = this.mountId
    if (mountId === null) return
    let snapshot: RichSnapshot
    try {
      if (this.rpc.snapshotIfChanged !== undefined) {
        const result = await this.rpc.snapshotIfChanged({ mountId, revision: this.pollRevision })
        if (generation !== this.generation || mountId !== this.mountId) return
        this.pollRevision = result.revision
        if (result.snapshot === null) {
          const theme = this.theme(), serialized = JSON.stringify(theme)
          if (this.ready && serialized !== this.lastTheme) { this.lastTheme = serialized; await this.send('theme', { theme }) }
          return
        }
        snapshot = result.snapshot
      } else snapshot = await this.rpc.snapshot({ mountId })
    }
    catch (error) {
      const previous = this.view.snapshot
      if (generation !== this.generation || mountId !== this.mountId) return
      if (previous === null || !/STALE_RENDER|STALE_MOUNT/u.test(String(error))) throw error
      await this.remount(previous, generation, mountId)
      return
    }
    if (generation !== this.generation || mountId !== this.mountId) return
    const previous = this.view.snapshot
    if ((this.native === undefined || this.view.error === 'CONTENT_ERROR' && this.view.reservation === null) && snapshot.pendingManifest !== null
      && snapshot.pendingManifest.stateSchemaVersion === snapshot.draft.stateSchemaVersion) {
      const applied = await this.rpc.applyUpdate({ mountId, discardDraft: false })
      await this.remount(applied, generation, mountId)
      return
    }
    if (previous !== null
      && (snapshot.dataRevision < previous.dataRevision || snapshot.draft.draftRevision < previous.draft.draftRevision)) return
    if (previous !== null && snapshot.manifest.renderRevision !== previous.manifest.renderRevision) {
      // Revoke the old process and channel before activating the new executable version.
      await this.remount(snapshot, generation, mountId)
      return
    }
    this.publish({ snapshot, error: this.view.error === 'CONTENT_ERROR' ? this.view.error : null,
      repairing: this.view.repairing && !['outcome_unknown', 'failed', 'cancelled'].includes(snapshot.renderRepair ?? '') })
    if (this.ready) {
      const theme = this.theme()
      this.lastTheme = JSON.stringify(theme)
      await this.send('snapshot', { snapshot, theme })
      for (const action of snapshot.actions) {
        if ((this.actions.get(action.actionId) ?? -1) >= action.ledgerSeq) continue
        this.actions.set(action.actionId, action.ledgerSeq)
        await this.send('result', { result: action })
      }
    }
  }

  /**
   * Register a trusted upload.
   * @param receiptId - uploader receipt; file intentions alone cannot mint a grant.
   */
  async registerFile(receiptId: RichRegisterFileRequest['receiptId']): Promise<void> {
    if (this.mountId === null) throw new Error('NOT_MOUNTED')
    await this.rpc.registerFile({ mountId: this.mountId, receiptId })
    await this.refresh(this.generation)
  }

  /**
   * Request cancellation without promising rollback.
   * @param actionId - An action displayed by trusted Host state.
   */
  async cancelAction(actionId: RichActionRequest['actionId']): Promise<void> {
    const snapshot = this.view.snapshot
    if (this.mountId === null || snapshot === null) return
    await this.rpc.invoke({ mountId: this.mountId, actionId: randomUUID() as RichInvokeRequest['actionId'],
      actionName: 'cancel', targetActionId: actionId, expectedDataRevision: snapshot.dataRevision,
      values: {}, fileGrants: [], draft: { baseRevision: snapshot.draft.draftRevision,
        stateSchemaVersion: snapshot.draft.stateSchemaVersion, fields: snapshot.draft.fields, dirty: snapshot.draft.dirty } })
    await this.refresh(this.generation)
  }

  /**
   * Apply staged content.
   * @param discardDraft - trusted toolbar decision, never generated-content confirmation.
   */
  async applyUpdate(discardDraft: boolean): Promise<void> {
    if (this.mountId === null || this.updateBarrier !== null) return
    const previous = this.view.snapshot
    await this.settleDraft()
    try { await this.rpc.applyUpdate({ mountId: this.mountId, discardDraft }) }
    catch (error) { await this.send('update.cancel', {}); throw error }
    if (previous === null) return
    await this.close()
    this.open(previous.scope.messageId, previous.scope.blockId)
  }

  /**
   * Rebuild the executable guest with the current profile theme. The guest saves its pending draft first;
   * a failed save keeps the old guest and its input, shows the input warning, and the next theme change retries.
   */
  async restyle(): Promise<void> {
    const mountId = this.mountId, generation = this.generation
    if (this.native === undefined || mountId === null || this.updateBarrier !== null || this.view.reservation === null
      || this.styledAs === this.appearance().theme) return
    try { await this.settleDraft() }
    catch (error) {
      if (generation === this.generation) this.publish({ inputWarning: true })
      throw error
    }
    if (generation !== this.generation || mountId !== this.mountId) return
    await this.retireGuest()
    try {
      const snapshot = await this.rpc.snapshot({ mountId })
      if (generation !== this.generation || mountId !== this.mountId) return
      const previous = this.view.snapshot
      if (previous !== null && snapshot.manifest.renderRevision !== previous.manifest.renderRevision) {
        await this.remount(snapshot, generation, mountId)
        return
      }
      this.publish({ snapshot })
      await this.createGuest(snapshot, generation)
    } catch (error) {
      if (generation === this.generation) this.publish({ error: String(error) })
      throw error
    }
  }

  /** Ask a ready guest to save its draft and stay inert until its document is replaced or `update.cancel` arrives. */
  private async settleDraft(): Promise<void> {
    if (!this.ready || this.view.reservation === null) return
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const id = randomUUID()
      const barrier = new Promise<void>((resolve, reject) => {
        this.updateBarrier = { id, resolve, reject }
        timeout = setTimeout(() => { reject(new Error('UPDATE_SYNC_TIMEOUT')) }, 15000)
      })
      await Promise.all([this.send('prepare.update', { requestId: id }), barrier])
    } catch (error) { await this.send('update.cancel', {}); throw error }
    finally { clearTimeout(timeout); this.updateBarrier = null }
  }

  private async retireGuest(): Promise<void> {
    const reservation = this.view.reservation
    this.stopNative?.(); this.stopNative = null
    this.publish({ reservation: null })
    if (reservation !== null && this.native !== undefined) await this.native.release(reservation.lease)
  }

  /** Revoke the channel before terminating scripts; history never replays an action. */
  async close(): Promise<void> {
    const generation = ++this.generation
    this.updateBarrier?.reject(new Error('CONTENT_CLOSED'))
    this.updateBarrier = null
    this.refreshing = null
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null }
    const mountId = this.mountId; this.mountId = null
    await this.retireGuest()
    if (mountId !== null) await this.rpc.dispose({ mountId })
    if (generation === this.generation) this.publish({ closed: true, repairing: false })
  }
}
