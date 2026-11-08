/** Explicitly granted standard Web workspace over a carrier-owned non-owner Peer. */
import type { Context } from '@deepseek-ai/cordis'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-api-gateway'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import type {} from '@deepseek-ai/dsh-client-modules'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import type { WorkspaceShell } from './workspace-shell.ts'
import { createHash } from 'node:crypto'
import { WORKSPACE_PLUGIN_EVENTS, WORKSPACE_ROUTE_HEADER, workspaceAllowsResponseBody } from '../../src/workspace-protocol.ts'
import { workspacePluginEvents } from './workspace-plugin-events.ts'

/** Carrier resource budgets resolved before a workspace is opened. */
export interface WorkspaceLimits {
  readonly origin: string
  readonly maxRequestBytes: number
  readonly maxResponseBytes: number
}

/** A local carrier must revalidate its original device grant on every operation and delivery. */
export interface WorkspaceAdmission {
  readonly peer: PeerScope
  readonly signal: AbortSignal
  assertCurrent(): void
  /** Optional Host-owned refresh of the same granted resource scope before dispatch and delivery. */
  refresh?(): Promise<void>
}

/** Safe-to-display failures emitted before dispatch or after an uncertain delivery. */
export class WorkspaceError extends Error {
  constructor(readonly code: 'workspace-grant-required' | 'workspace-denied' | 'workspace-closed' | 'workspace-resource-limit' | 'workspace-shell-changed', options?: ErrorOptions) {
    super(code, options)
  }
}

/** Why the shared `/api` handler did not serve a path to a device Peer. */
export type WorkspaceRouteReason = 'unregistered' | 'owner-only'

/** Exact bodies the shared handler returns when it serves nothing: no exact route or Gateway endpoint matched, or an exact route is owner-only. A feature's own error bodies differ and pass through unchanged. */
const UNSERVED_RESPONSES: ReadonlyArray<{ readonly status: number; readonly body: string; readonly reason: WorkspaceRouteReason }> = [
  { status: 404, body: 'not found', reason: 'unregistered' },
  { status: 403, body: 'forbidden', reason: 'owner-only' },
]

function unservedReason(status: number, bytes: Uint8Array): WorkspaceRouteReason | undefined {
  const body = new TextDecoder().decode(bytes)
  return UNSERVED_RESPONSES.find(row => row.status === status && row.body === body)?.reason
}

/** Plugin Web server prefix routes and owner-only exact routes are not forwarded to phones; answer with the same status and a structured explanation instead of an anonymous failure. */
function routeUnavailable(method: string, status: number, reason: WorkspaceRouteReason): Response {
  const message = reason === 'owner-only'
    ? 'This route is limited to the desktop owner and is not available to a phone device.'
    : 'No route for this path is served to phone devices. Routes that a plugin registers only on the desktop Web server are not forwarded.'
  const body = workspaceAllowsResponseBody(method, status) ? JSON.stringify({ error: { code: 'workspace-route-unavailable', reason, message } }) : null
  return new Response(body,
    { status, headers: { 'content-type': 'application/json', [WORKSPACE_ROUTE_HEADER]: reason } })
}

/** Standard assets and Gateway dispatch with the carrier's exact device identity, never the browser owner. */
export class WorkspaceChannel {
  private readonly lifetime = new AbortController()
  private readonly fetchHandler
  private readonly origin: string
  /** Combined original device, Peer and workspace revocation lifetime. */
  readonly signal: AbortSignal

  /**
   * @param ctx - original profile's standard Web services.
   * @param admission - independently authorized device Peer and revocation lifetime.
   * @param limits - validated carrier limits.
   * @param shell - optional locally selected standard frontend build, with immutable file inventory.
   */
  constructor(private readonly ctx: Context, private readonly admission: WorkspaceAdmission, private readonly limits: WorkspaceLimits, private readonly shell?: WorkspaceShell) {
    const origin = new URL(limits.origin)
    if (origin.origin !== limits.origin || origin.protocol !== 'https:' || admission.peer.principal.kind === 'owner'
      || ![limits.maxRequestBytes, limits.maxResponseBytes].every(value => Number.isSafeInteger(value) && value > 0)) {
      throw new WorkspaceError('workspace-denied')
    }
    this.signal = AbortSignal.any([this.lifetime.signal, admission.signal, admission.peer.signal])
    this.origin = origin.origin
    this.fetchHandler = ctx.connection.createSharedFetchHandler('/api')
    this.current()
  }

  private current(): void {
    if (this.signal.aborted) {
      throw new WorkspaceError('workspace-closed')
    }
    this.admission.assertCurrent()
  }

  /** Revalidate before a carrier delivers retained bytes or stream frames. */
  assertCurrent(): void { this.current() }

  /** @param error - original Gateway failure. @returns its standard safe wire representation. */
  failure(error: unknown) { return this.ctx.typertGateway.wireStream.failure(error) }

  /** @returns standard boot rows with the actual device's access baseline; no transport or credentials are injected. */
  bootstrap(): readonly IndexInjection[] {
    this.current()
    const table: IndexInjection[] = []
    this.ctx.emit('webserver/index-inject', table, this.admission.peer)
    // __DSH_INSPECTOR__ carries the Host's loopback developer-socket endpoint and credential; a phone resolves loopback against itself.
    const rows = table.filter(row =>
      row.kind !== 'global' || !['__DSH_REMOTE_ACCESS__', '__DSH_TRANSPORT__', '__DSH_INSPECTOR__', '__DSH_WORKSPACE_INITIAL_SELECTION__'].includes(row.name))
    const result: IndexInjection[] = [
      { kind: 'global', name: '__DSH_REMOTE_ACCESS__', value: this.ctx.remoteAccess.snapshotFor(this.admission.peer.principal) },
      { kind: 'global', name: '__DSH_WORKSPACE_INITIAL_SELECTION__', value: 'external' },
      ...rows,
    ]
    this.size(result, this.limits.maxResponseBytes)
    this.current()
    return result
  }

  /** @param signal - individual preparation lifetime. @returns the current shell and revisioned initial plugin batches, hashed before any cached code may run. */
  async manifest(signal: AbortSignal = this.signal) {
    await this.admission.refresh?.()
    this.current()
    if (this.shell === undefined) throw new WorkspaceError('workspace-denied')
    const graph = this.ctx.clientModules.graph(), resources = [...this.shell.manifest.resources]
    for (const batch of graph.batches) {
      signal.throwIfAborted(); this.current()
      const url = new URL(batch.url, this.origin)
      if (url.origin !== this.origin || !url.pathname.startsWith('/plugins/')) throw new WorkspaceError('workspace-denied')
      const response = await this.ctx.clientModules.fetchBundle(new Request(url, { signal }))
      if (response.status !== 200 || !response.headers.get('cache-control')?.includes('immutable')) throw new WorkspaceError('workspace-shell-changed')
      const bytes = await this.read(response, this.limits.maxResponseBytes)
      resources.push({ path: url.pathname + url.search, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength,
        mediaType: response.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream' })
    }
    await this.admission.refresh?.(); this.current(); signal.throwIfAborted()
    if (this.ctx.clientModules.graph() !== graph) throw new WorkspaceError('workspace-shell-changed')
    const result = { revision: createHash('sha256').update(JSON.stringify(resources)).digest('hex'), resources }
    this.size(result, this.limits.maxResponseBytes)
    return result
  }

  /**
   * @param request - same-origin resource or standard API request from the trusted workspace.
   * @returns a bounded response after fresh admission; revocation after dispatch leaves mutations uncertain.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.origin !== this.origin || url.username || url.password) throw new WorkspaceError('workspace-denied')
    // Resource bytes never consult the device's visible scope: only standard API dispatch does, and refreshing the
    // scope per asset rescans every visible Session several times and starves the carrier during shell loading.
    const scoped = url.pathname.startsWith('/api/')
    if (scoped) await this.admission.refresh?.()
    this.current()
    const signal = AbortSignal.any([request.signal, this.lifetime.signal, this.admission.signal, this.admission.peer.signal])
    signal.throwIfAborted()
    const body = request.body === null ? undefined : await this.read(request, this.limits.maxRequestBytes)
    this.current()
    const input = new Request(url, { method: request.method, headers: request.headers, ...(body === undefined ? {} : { body }), signal })
    let response: Response
    if (url.pathname.startsWith('/plugins/')) {
      response = await this.ctx.clientModules.fetchBundle(input)
    } else if (scoped) {
      response = await this.fetchHandler.fetch(input, this.admission.peer)
    } else if (this.shell !== undefined) {
      response = await this.shell.fetch(input, this.bootstrap())
    } else {
      throw new WorkspaceError('workspace-denied')
    }
    const bytes = await this.read(response, this.limits.maxResponseBytes)
    if (scoped) await this.admission.refresh?.()
    this.current()
    signal.throwIfAborted()
    const unserved = scoped ? unservedReason(response.status, bytes) : undefined
    if (unserved !== undefined) return routeUnavailable(request.method, response.status, unserved)
    return new Response(workspaceAllowsResponseBody(request.method, response.status) ? bytes : null,
      { status: response.status, headers: response.headers })
  }

  /**
   * @param endpoint - standard Gateway stream endpoint.
   * @param payload - original stream request, decoded and authorized by Gateway.
   * @param signal - caller's stream lifetime.
   * @param uplink - optional standard client-to-Host stream.
   * @returns standard frames while the original device remains authorized.
   */
  async *open(endpoint: string, payload: unknown, signal: AbortSignal, uplink?: AsyncIterable<unknown>): AsyncIterable<unknown> {
    await this.admission.refresh?.()
    this.current()
    this.size(payload, this.limits.maxRequestBytes)
    const lifetime = AbortSignal.any([signal, this.lifetime.signal, this.admission.signal, this.admission.peer.signal])
    if (endpoint === WORKSPACE_PLUGIN_EVENTS) {
      if (payload !== null) throw new WorkspaceError('workspace-denied')
      for await (const frame of workspacePluginEvents(this.ctx.clientModules, lifetime, this.limits.maxResponseBytes)) {
        await this.admission.refresh?.(); this.current(); lifetime.throwIfAborted(); yield frame
      }
      return
    }
    const frames = await this.ctx.typertGateway.wireStream.open(endpoint, payload, this.boundedUplink(uplink ?? empty(), lifetime), this.admission.peer, lifetime)
    for await (const frame of frames) {
      this.current()
      lifetime.throwIfAborted()
      this.size(frame, this.limits.maxResponseBytes)
      yield frame
    }
  }

  /** Stop this workspace's outstanding waits. The carrier owns Peer disposal and accepted desktop tasks. */
  close(): void { this.lifetime.abort() }

  private async *boundedUplink(input: AsyncIterable<unknown>, signal: AbortSignal): AsyncIterable<unknown> {
    for await (const value of input) {
      this.current(); signal.throwIfAborted(); this.size(value, this.limits.maxRequestBytes)
      yield value
    }
  }

  private size(value: unknown, maximum: number): void {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maximum) {
      throw new WorkspaceError('workspace-resource-limit')
    }
  }

  private async read(source: Request | Response, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
    const reader = source.body?.getReader()
    if (reader === undefined) return new Uint8Array()
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const item = await reader.read()
        if (item.done) break
        length += item.value.byteLength
        if (length > maximum) throw new WorkspaceError('workspace-resource-limit')
        chunks.push(item.value)
      }
    } finally { await reader.cancel(); reader.releaseLock() }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return bytes
  }
}

async function* empty(): AsyncIterable<unknown> { /* A stream without client input ends its uplink immediately. */ }
