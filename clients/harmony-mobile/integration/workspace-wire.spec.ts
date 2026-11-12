/** Serialized workspace transfers and stream ownership; these fixtures exercise no model or external listener. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { expect, it, onTestFinished } from 'vitest'
import { WorkspaceWireHost, type WorkspaceWireSource, type WorkspaceWireLimits, type WorkspaceWireTrace } from '../desktop-plugin/src/workspace-wire.ts'
import { WorkspaceError } from '../desktop-plugin/src/workspace-channel.ts'
import { workspacePageDiagnostic } from '../desktop-plugin/src/workspace-page-diagnostic.ts'
import { WorkspaceClient } from '../src/workspace-client.ts'
import { workspaceBodySchema, workspaceResponseSchema, workspaceStreamSchema, workspaceShellManifestSchema } from '../src/workspace-protocol.ts'
import { WorkspaceShell } from '../desktop-plugin/src/workspace-shell.ts'
import { prepareWorkspace } from '../src/workspace-prepare.ts'
import { readWorkspaceBytes } from '../src/workspace-bytes.ts'
import { workspacePluginEvents } from '../desktop-plugin/src/workspace-plugin-events.ts'

function fixture(overrides: Partial<WorkspaceWireLimits> = {}) {
  const controller = new AbortController()
  const image = Uint8Array.from({ length: 300000 }, (_, index) => index % 251)
  const source: WorkspaceWireSource = {
    signal: controller.signal,
    assertCurrent() { if (controller.signal.aborted) throw new WorkspaceError('workspace-closed') },
    bootstrap: () => [],
    manifest: async () => ({ revision: 'a'.repeat(64), resources: [] }),
    fetch: async () => new Response(image, { headers: { 'content-type': 'image/png' } }),
    open: async function* (endpoint, _payload, signal, uplink) {
      if (endpoint === 'failure') throw new Error('fixture refusal')
      if (endpoint === 'pending') {
        const waiting = Promise.withResolvers<void>()
        const stop = () => waiting.resolve()
        signal.addEventListener('abort', stop, { once: true })
        try { if (!signal.aborted) await waiting.promise; signal.throwIfAborted() }
        finally { signal.removeEventListener('abort', stop) }
        return
      }
      if (endpoint === 'large') { yield { text: 'x'.repeat(250000) }; return }
      if (uplink !== undefined) for await (const value of uplink) yield value
    },
    failure: () => ({ code: 'fixture/failed', message: 'Fixture refused', details: {} }),
    close: () => controller.abort(),
  }
  const wire = new WorkspaceWireHost(source, { maxChunkBytes: 8192, maxBufferedBytes: 1024 * 1024,
    maxBodyBytes: 1024 * 1024, maxBodies: 8, maxStreams: 4, maxRequestBytes: 128 * 1024, ...overrides })
  onTestFinished(() => wire.close())
  const sizes: number[] = []
  const client = new WorkspaceClient({
    request: async (value, signal) => {
      const request = JSON.stringify(value)
      const result = JSON.stringify(await wire.request(JSON.parse(request), signal))
      sizes.push(Buffer.byteLength(request), Buffer.byteLength(result))
      return JSON.parse(result)
    },
    encode: bytes => Buffer.from(bytes).toString('base64url'),
    decode: value => Uint8Array.from(Buffer.from(value, 'base64url')),
  }, { origin: 'https://workspace.dsh.invalid', maxRequestBytes: 64 * 1024,
    maxResponseBytes: 1024 * 1024, maxChunkBytes: 8192 })
  onTestFinished(() => client.close())
  return { wire, client, controller, source, image, sizes, signal: new AbortController().signal }
}

it('reassembles binary resources and large stream frames with bounded serialized pieces', async () => {
  const f = fixture()
  const response = await f.client.fetch(new Request('https://workspace.dsh.invalid/plugins/image'))
  expect(response.headers.get('content-type')).toBe('image/png')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(f.image)
  const frames: unknown[] = []
  for await (const frame of f.client.openStream('large', { args: {} }, f.signal)) frames.push(frame)
  expect(frames).toEqual([{ text: 'x'.repeat(250000) }])
  expect(Math.max(...f.sizes)).toBeLessThan(12000)
  const world = process.env.DSH_HARMONY_WORKSPACE_WORLD
  assert.ok(world)
  await writeFile(join(world, 'observed.json'), JSON.stringify({ binaryBytes: f.image.byteLength,
    largeFrameBytes: 250000, maxMessageBytes: Math.max(...f.sizes), encrypted: false, native: false }) + '\n')
})

it('preserves status and headers for responses without a Fetch body', async () => {
  const f = fixture()
  for (const status of [204, 205, 304]) {
    f.source.fetch = async () => new Response(null, { status, headers: { 'x-fixture': 'bodyless' } })
    const response = await f.client.fetch(new Request('https://workspace.dsh.invalid/plugins/bodyless'))
    expect(response.status).toBe(status)
    expect(response.headers.get('x-fixture')).toBe('bodyless')
    expect(response.body).toBeNull()
  }
})

it('releases a zero-byte workspace response without invoking the native decoder', async () => {
  const f = fixture()
  f.source.fetch = async () => new Response('', { status: 200, headers: { 'content-type': 'text/css' } })
  const response = workspaceResponseSchema.parse(await f.wire.request({
    operation: 'fetch', method: 'GET', url: 'https://workspace.dsh.invalid/assets/empty.css', headers: [],
  }, f.signal))
  const request = (value: unknown) => f.wire.request(value, f.signal)
  const bytes = await readWorkspaceBytes(response.body, {
    request, release: request,
    decode(value) {
      if (value.length === 0) throw new Error('native decoder requires a nonempty input')
      return Uint8Array.from(Buffer.from(value, 'base64url'))
    },
  }, { maxBytes: 1024, maxChunkBytes: 1024 })
  expect(bytes.byteLength).toBe(0)
  await expect(request({ operation: 'read', id: response.body.id, offset: 0 })).rejects.toThrow()
})

it('classifies standard page replies without exposing fields or changing the forwarded bytes', async () => {
  const f = fixture()
  const input = Buffer.from(JSON.stringify({ type: 'client-request', method: 'session/page',
    payload: { args: { request: { beforeSeq: 4, address: 'private-session' } } } }))
  const operation = { operation: 'fetch', method: 'POST', url: 'https://workspace.dsh.invalid/api/session/page',
    headers: [], body: input.toString('base64url') }
  const envelope = (records: unknown[], hasMore: boolean) => Buffer.from(JSON.stringify({
    type: 'server-response', result: { ok: true, value: { records, hasMore } },
  }))
  const record = (seq: number) => ({ type: 'event', event: { seq, data: 'private-body' } })
  const unchanged = envelope([record(4)], true)
  expect(workspacePageDiagnostic(input, 200, unchanged)).toEqual({
    outcome: 'no-progress', status: 200, bytes: unchanged.length, records: 1, hasMore: true,
  })
  expect(workspacePageDiagnostic(input, 200, envelope([], true))).toMatchObject({ outcome: 'no-progress' })
  expect(workspacePageDiagnostic(input, 200, envelope([], false))).toMatchObject({ outcome: 'empty' })
  expect(workspacePageDiagnostic(input, 200, Buffer.from('{'))).toMatchObject({ outcome: 'unrecognized' })
  expect(workspacePageDiagnostic(input, 503, Buffer.from('private-error'))).toEqual({ outcome: 'http-error', status: 503, bytes: 13 })
  const payload = Buffer.from(JSON.stringify({ type: 'server-response', result: { ok: false,
    error: { code: 'remote-access/denied', message: 'private-error' } } }))
  f.source.fetch = async () => new Response(Uint8Array.from(payload))
  const observations: unknown[] = []
  const response = workspaceResponseSchema.parse(await f.wire.request(operation, f.signal, { kind: 'page', sequence: 1, observe: diagnostic => {
    observations.push(diagnostic)
    throw new Error('fixture logging failure')
  } }))
  expect(observations).toEqual([{ outcome: 'scope-denied', status: 200, bytes: payload.length }])
  const piece = await f.wire.request({ operation: 'read', id: response.body.id, offset: 0 }, f.signal)
  expect(piece).toMatchObject({ body: payload.toString('base64url'), done: true })
  await f.wire.request({ operation: 'release', id: response.body.id }, f.signal)
})

it('associates interleaved page chunks with their original request and removes released bodies', async () => {
  const f = fixture({ maxChunkBytes: 4, maxBodyBytes: 64 })
  f.source.fetch = async () => new Response('fixture-body')
  const operation = { operation: 'fetch', method: 'POST', url: 'https://workspace.dsh.invalid/api/session/page', headers: [] }
  const open = async (sequence: number) => workspaceResponseSchema.parse(await f.wire.request(operation, f.signal,
    { kind: 'page', sequence, observe() {} })).body.id
  const first = await open(7), second = await open(9)
  const observations: unknown[] = []
  const trace: WorkspaceWireTrace = { kind: 'chunk', observe(chunk) { observations.push(chunk); throw new Error('fixture logging failure') } }
  const read = (id: typeof first, offset: number) => f.wire.request({ operation: 'read', id, offset }, f.signal, trace)
  const ordinary = workspaceResponseSchema.parse(await f.wire.request(operation, f.signal)).body.id
  await read(ordinary, 0)
  await read(first, 0)
  await read(second, 0)
  await expect(read(second, 0)).rejects.toMatchObject({ code: 'workspace-denied' })
  await f.wire.request({ operation: 'release', id: second }, f.signal)
  await expect(read(second, 4)).rejects.toMatchObject({ code: 'workspace-denied' })
  await read(first, 4)
  await expect(read(first, 8)).resolves.toEqual({ offset: 8, body: Buffer.from('body').toString('base64url'), done: true })
  await expect(read(first, 8)).rejects.toMatchObject({ code: 'workspace-denied' })
  expect(observations).toEqual([
    { pageSequence: 7, offset: 0, bytes: 4, done: false }, { pageSequence: 9, offset: 0, bytes: 4, done: false },
    { pageSequence: 7, offset: 4, bytes: 4, done: false }, { pageSequence: 7, offset: 8, bytes: 4, done: true },
  ])
})

it('preserves duplex order, input completion and standard stream failures', async () => {
  const f = fixture()
  async function* input() { yield { index: 1 }; yield { index: 2 } }
  const frames: unknown[] = []
  for await (const frame of f.client.openStream('echo', { args: {} }, f.signal, input())) frames.push(frame)
  expect(frames).toEqual([{ index: 1 }, { index: 2 }])
  const iterator = f.client.openStream('failure', {}, f.signal)[Symbol.asyncIterator]()
  await expect(iterator.next()).rejects.toMatchObject({ code: 'fixture/failed', message: 'Fixture refused' })
})

it('explicit native preparation opens bootstrap, releases its bytes and validates the shell inventory', async () => {
  const f = fixture({ maxBodies: 1 })
  const manifest = await prepareWorkspace({ request: value => f.wire.request(value, f.signal), release: value => f.wire.request(value, f.signal),
    decode: value => Uint8Array.from(Buffer.from(value, 'base64url')) }, { maxBytes: 1024 * 1024, maxChunkBytes: 8192 })
  expect(manifest).toEqual({ revision: 'a'.repeat(64), resources: [] })
  // The one-body budget remains available after preparation drains both transfers.
  await expect(f.wire.request({ operation: 'bootstrap' }, f.signal)).resolves.toMatchObject({ bytes: 2 })
})

it('cache inventories accept exact revisioned plugin URLs and reject external, API, normalized or duplicate paths', () => {
  const row = { path: '/plugins/??fixture&rev=one', sha256: 'a'.repeat(64), bytes: 12, mediaType: 'text/javascript' }
  const manifest = { revision: 'b'.repeat(64), resources: [row] }
  expect(workspaceShellManifestSchema.parse(manifest)).toEqual(manifest)
  for (const path of ['//external.invalid/a', 'https://external.invalid/a', '/a/../b', '/a#fragment', '/api/session/list', '/plugins/events', '/a\\b']) {
    expect(workspaceShellManifestSchema.safeParse({ ...manifest, resources: [{ ...row, path }] }).success).toBe(false)
  }
  expect(workspaceShellManifestSchema.safeParse({ ...manifest, resources: [row, row] }).success).toBe(false)
})

it('rejects guessed and out-of-order body handles and bounds retained resources and streams', async () => {
  const f = fixture({ maxBodies: 1, maxStreams: 1 })
  const body = workspaceBodySchema.parse(await f.wire.request({ operation: 'bootstrap' }, f.signal))
  await expect(f.wire.request({ operation: 'read', id: body.id, offset: 1 }, f.signal)).rejects.toMatchObject({ code: 'workspace-denied' })
  const abort = new AbortController(), queued = f.wire.request({ operation: 'bootstrap' }, abort.signal)
  const cancelled = expect(queued).rejects.toMatchObject({ code: 'workspace-closed' })
  await expect(f.wire.request({ operation: 'bootstrap' }, f.signal)).rejects.toMatchObject({ code: 'workspace-resource-limit' })
  abort.abort(); await cancelled
  await f.wire.request({ operation: 'release', id: body.id }, f.signal)
  await expect(f.wire.request({ operation: 'read', id: body.id, offset: 0 }, f.signal)).rejects.toMatchObject({ code: 'workspace-denied' })
  const other = fixture()
  const retained = workspaceBodySchema.parse(await f.wire.request({ operation: 'bootstrap' }, f.signal))
  await expect(other.wire.request({ operation: 'read', id: retained.id, offset: 0 }, other.signal)).rejects.toThrow()
  const stream = workspaceStreamSchema.parse(await f.wire.request({ operation: 'stream-open', endpoint: 'pending', payload: {} }, f.signal))
  await expect(f.wire.request({ operation: 'stream-open', endpoint: 'pending', payload: {} }, f.signal)).rejects.toMatchObject({ code: 'workspace-resource-limit' })
  await f.wire.request({ operation: 'stream-close', id: stream.id }, f.signal)
})

it('reserves response capacity before concurrent resource reads and releases queued readers on close', async () => {
  const f = fixture(), gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>(); let reads = 0
  f.source.fetch = async () => { reads++; entered.resolve(); await gate.promise; return new Response(f.image) }
  const input = { operation: 'fetch', method: 'GET', url: 'https://workspace.dsh.invalid/asset', headers: [] }
  const first = f.wire.request(input, f.signal); await entered.promise
  const second = f.wire.request(input, f.signal)
  gate.resolve(); const body = workspaceBodySchema.parse((await first as { body: unknown }).body)
  expect(reads).toBe(1)
  await f.wire.request({ operation: 'release', id: body.id }, f.signal)
  const next = workspaceBodySchema.parse((await second as { body: unknown }).body); expect(reads).toBe(2)
  const third = f.wire.request(input, f.signal), cancelled = expect(third).rejects.toMatchObject({ code: 'workspace-closed' })
  await f.wire.close(); await cancelled; expect(reads).toBe(2)
  await expect(f.wire.request({ operation: 'read', id: next.id, offset: 0 }, f.signal)).rejects.toThrow()
})

it('revokes retained bytes and pending reads, then drains every stream owner', async () => {
  const f = fixture()
  const body = workspaceBodySchema.parse(await f.wire.request({ operation: 'bootstrap' }, f.signal))
  const stream = workspaceStreamSchema.parse(await f.wire.request({ operation: 'stream-open', endpoint: 'pending', payload: {} }, f.signal))
  const waiting = f.wire.request({ operation: 'stream-next', id: stream.id }, f.signal)
  const rejected = expect(waiting).rejects.toMatchObject({ code: 'workspace-closed' })
  f.controller.abort()
  await rejected
  await expect(f.wire.request({ operation: 'read', id: body.id, offset: 0 }, f.signal)).rejects.toMatchObject({ code: 'workspace-closed' })
  await f.wire.close()
})

it('pins standard shell files, rejects unknown paths and requires reload when the build changes', async () => {
  const parent = process.env.DSH_HARMONY_WORKSPACE_WORLD
  assert.ok(parent)
  const world = await mkdtemp(join(parent, 'shell-'))
  await mkdir(join(world, 'assets'))
  await writeFile(join(world, 'index.html'), '<html><head></head><body><script src="/assets/main.js"></script></body></html>')
  await writeFile(join(world, 'assets/main.js'), 'window.fixture = true;')
  const index = join(world, 'index.html')
  const shell = await WorkspaceShell.open(index, { maxFiles: 8, maxFileBytes: 1024, maxTotalBytes: 4096 })
  expect(shell.manifest.resources.map(row => row.path)).toEqual(['/assets/main.js', '/index.html'])
  expect(JSON.stringify(shell.manifest)).not.toContain(world)
  const response = await shell.fetch(new Request('https://workspace.dsh.invalid/'), [{ kind: 'global', name: '__DSH_REMOTE_ACCESS__', value: { owner: false } }])
  expect(await response.text()).toContain('"owner":false')
  expect((await shell.fetch(new Request('https://workspace.dsh.invalid/../secret'), [])).status).toBe(404)
  expect((await shell.fetch(new Request('https://workspace.dsh.invalid/%2e%2e%2fsecret'), [])).status).toBe(404)
  await expect(WorkspaceShell.open(index, { maxFiles: 1, maxFileBytes: 1024, maxTotalBytes: 4096 })).rejects.toMatchObject({ code: 'workspace-resource-limit' })
  await writeFile(join(world, 'assets/main.js'), 'window.fixture = false;')
  await expect(shell.fetch(new Request('https://workspace.dsh.invalid/assets/main.js'), [])).rejects.toMatchObject({ code: 'workspace-shell-changed' })
})

it('bounds standard plugin event queues and removes both subscriptions after overflow or revocation', async () => {
  let graphChanged = () => {}, rebuilt = (_id: string, _rev: string) => {}, unsubscribed = 0
  const modules = { graph: () => ({ rev: 'fixture', entries: [], batches: [] }),
    onGraphChanged(listener: () => void) { graphChanged = listener; return () => { unsubscribed++ } },
    onRebuilt(listener: (id: string, rev: string) => void) { rebuilt = listener; return () => { unsubscribed++ } } }
  const abort = new AbortController(), stream = workspacePluginEvents(modules, abort.signal, 256)[Symbol.asyncIterator]()
  expect((await stream.next()).value).toMatchObject({ type: 'graph' })
  graphChanged(); expect((await stream.next()).value).toMatchObject({ type: 'graph' })
  rebuilt('plugin', 'first'); expect((await stream.next()).value).toEqual({ type: 'rebuilt', id: 'plugin', rev: 'first' })
  for (let index = 0; index < 10; index++) rebuilt('plugin', String(index))
  await expect(stream.next()).rejects.toMatchObject({ code: 'workspace-resource-limit' }); expect(unsubscribed).toBe(2)
  const next = workspacePluginEvents(modules, abort.signal, 256)[Symbol.asyncIterator]()
  await next.next(); const pending = expect(next.next()).rejects.toMatchObject({ code: 'workspace-closed' })
  abort.abort(); await pending; expect(unsubscribed).toBe(4)
})

it('drains a revoked standard plugin event reader without treating its original abort as a cleanup failure', async () => {
  const f = fixture(); let reads = 0
  const modules = { graph: () => ({ rev: 'fixture', entries: [], batches: [] }),
    onGraphChanged: (_listener: () => void) => () => {}, onRebuilt: (_listener: (id: string, rev: string) => void) => () => {} }
  f.source.open = async function* (_endpoint, _payload, signal) {
    for await (const frame of workspacePluginEvents(modules, signal, 1024)) { reads++; yield frame }
  }
  const stream = workspaceStreamSchema.parse(await f.wire.request({ operation: 'stream-open', endpoint: 'plugins', payload: null }, f.signal))
  const initial = await f.wire.request({ operation: 'stream-next', id: stream.id }, f.signal) as { body: unknown }
  await f.wire.request({ operation: 'release', id: workspaceBodySchema.parse(initial.body).id }, f.signal)
  const pending = f.wire.request({ operation: 'stream-next', id: stream.id }, f.signal), rejected = expect(pending).rejects.toMatchObject({ code: 'workspace-closed' })
  expect(reads).toBe(1)
  f.controller.abort(); await rejected; await expect(f.wire.close()).resolves.toBeUndefined()
})
