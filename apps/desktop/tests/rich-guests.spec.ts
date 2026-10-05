import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import { DESKTOP_IPC } from '../src/ipc.ts'
import { RICH_NATIVE_LIMITS, readRichPacket, readRichRequest, richDocumentUrl } from '../src/rich-document.ts'
import type { DesktopRichBootstrap, DesktopRichReservation } from '../src/rich-types.ts'

const native = vi.hoisted(() => ({ sessions: new Map<string, Record<string, unknown>>() }))
vi.mock('electron', () => ({ session: { fromPartition: (partition: string) => {
  const value = { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(), setDisplayMediaRequestHandler: vi.fn(), on: vi.fn(),
    clearStorageData: vi.fn(async () => {}), webRequest: { onBeforeRequest: vi.fn() } }
  Object.assign(value, { enableNetworkEmulation: vi.fn(), protocol: { handle: vi.fn(), unhandle: vi.fn() } })
  native.sessions.set(partition, value)
  return value
} } }))
const { DesktopRichGuests } = await import('../src/rich-guests.ts')
const request = { mountId: 'mount-one', mountNonce: 'a-nonce-at-least-16-characters', html: '<div>arbitrary</div>', css: 'div{color:red}', js: 'window.answer=42' }

afterEach(() => { native.sessions.clear(); vi.restoreAllMocks() })

function contents(pid: number, browserSession?: object) {
  const emitter = new EventEmitter()
  let destroyed = false
  let attached = false
  const debuggerApi = new EventEmitter()
  const value = Object.assign(emitter, {
    mainFrame: { url: '' }, session: browserSession, getOSProcessId: () => pid, isDestroyed: () => destroyed,
    send: vi.fn(), setWindowOpenHandler: vi.fn(), getURL: vi.fn(),
    debugger: Object.assign(debuggerApi, {
      attach: vi.fn((_version: string) => { attached = true }),
      isAttached: () => attached,
      detach: vi.fn(() => { attached = false }),
      sendCommand: vi.fn(async (_method: string, _params?: Record<string, unknown>) => ({})),
    }),
    loadURL: vi.fn(async (url: string) => { value.mainFrame.url = url }),
    forcefullyCrashRenderer: vi.fn(),
    setWebRTCIPHandlingPolicy: vi.fn(),
    close: vi.fn(() => { destroyed = true; emitter.emit('destroyed') }),
  })
  return value
}
type Fixture = ReturnType<typeof contents>
type ContentsFace = Pick<WebContents, 'getOSProcessId' | 'isDestroyed' | 'send' | 'setWindowOpenHandler' | 'getURL' | 'loadURL' | 'forcefullyCrashRenderer' | 'close'> & {
  mainFrame: Pick<WebContents['mainFrame'], 'url'>
  session: object | undefined
}
interface FixtureManager {
  acquire(owner: ContentsFace, value: unknown): DesktopRichReservation
  prepareAttach(owner: ContentsFace, event: Electron.Event, preferences: Electron.WebPreferences, params: Record<string, string>): boolean
  bindGuest(owner: ContentsFace, guest: ContentsFace): boolean
  bootstrap(event: { sender: ContentsFace; senderFrame: ContentsFace['mainFrame'] | null }): DesktopRichBootstrap | undefined
  receive(event: { sender: ContentsFace; senderFrame: ContentsFace['mainFrame'] | null }, value: unknown): void
  send(owner: ContentsFace, id: unknown, value: unknown): void
  release(owner: ContentsFace, id: unknown): Promise<void>
  releaseAll(owner: ContentsFace): void
}
// Native module substitution exercises only these members; fixtures do not claim a complete WebContents.
const fixtureManager = (manager: InstanceType<typeof DesktopRichGuests>): FixtureManager => manager
const fixtureOwner = (value: Fixture): ContentsFace => value

async function mounted(pid = 2) {
  const manager = fixtureManager(new DesktopRichGuests('/trusted/preload-rich.cjs'))
  const owner = contents(1)
  const reservation = manager.acquire(fixtureOwner(owner), request)
  const browserSession = native.sessions.get(reservation.partition)
  const guest = contents(pid, browserSession)
  const preventDefault = vi.fn()
  const preferences: Electron.WebPreferences = { nodeIntegration: true, preload: '/evil.cjs' }
  const params = { src: reservation.src, partition: reservation.partition }
  expect(manager.prepareAttach(fixtureOwner(owner), { preventDefault, defaultPrevented: false }, preferences, params)).toBe(true)
  expect(preventDefault).not.toHaveBeenCalled()
  expect(manager.bindGuest(fixtureOwner(owner), fixtureOwner(guest))).toBe(true)
  guest.emit('dom-ready')
  await vi.waitFor(() => { expect(pid === 1 ? guest.close : guest.loadURL).toHaveBeenCalled() })
  return { manager, owner, guest, reservation, preferences, browserSession }
}

it('rejects non-JSON, deeply nested and oversized native packets', () => {
  expect(readRichPacket({ value: [42, null, true] })).toEqual({ value: [42, null, true] })
  for (const packet of [[], null, { number: NaN }, { method() {} }, { buffer: new Uint8Array(2) }, { text: 'x'.repeat(128 * 1024) }]) {
    expect(() => readRichPacket(packet)).toThrow()
  }
  let nested: Record<string, unknown> = {}
  for (let i = 0; i < 18; i++) nested = { child: nested }
  expect(() => readRichPacket(nested)).toThrow('nesting')
})

it('validates complete requests and embeds source as inert base64 payload', () => {
  expect(readRichRequest(request)).toEqual(request)
  expect(() => readRichRequest({ ...request, preload: '/evil' })).toThrow()
  expect(() => readRichRequest({ ...request, mountNonce: 'short' })).toThrow()
  const url = richDocumentUrl({ ...request, html: '</script><script>escape()</script>', css: '</style><script>escape()</script>' })
  const text = Buffer.from(url.slice('data:text/html;base64,'.length), 'base64').toString('utf8')
  expect(text).toContain("connect-src 'none'")
  expect(text).not.toContain('escape()')
  expect(text).toContain('root.innerHTML=data.html')
})

it('isolates every reservation and cancels external requests before dispatch', () => {
  const manager = fixtureManager(new DesktopRichGuests('/trusted/preload-rich.cjs'))
  const owner = fixtureOwner(contents(1))
  const first = manager.acquire(owner, request)
  const second = manager.acquire(owner, { ...request, mountId: 'mount-two' })
  expect(first.partition).not.toBe(second.partition)
  expect(first.partition).not.toMatch(/^persist:/)
  expect(() => manager.acquire(owner, request)).toThrow('already reserved')
  const browserSession = native.sessions.get(first.partition) as { webRequest: { onBeforeRequest: ReturnType<typeof vi.fn> } }
  type RequestListener = (details: { url: string }, callback: (result: { cancel: boolean }) => void) => void
  const listener = browserSession.webRequest.onBeforeRequest.mock.calls[0]?.[0] as RequestListener
  for (const url of ['https://remote.invalid/', 'http://127.0.0.1:3080/api', 'file:///D:/secret', 'ws://localhost:1234/', 'dsh-app://app/']) {
    const result = vi.fn()
    listener({ url }, result)
    expect(result).toHaveBeenCalledWith({ cancel: true })
  }
})

it('configures native chooser and isolated drop guards before executing generated scripts', async () => {
  const { guest, preferences } = await mounted()
  expect(preferences).toMatchObject({ preload: '/trusted/preload-rich.cjs', nodeIntegration: false, nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false, contextIsolation: true, sandbox: true, devTools: false })
  expect(guest.debugger.sendCommand.mock.calls.map(call => call[0])).toEqual(['Page.enable', 'Page.setInterceptFileChooserDialog', 'Page.addScriptToEvaluateOnNewDocument', 'Page.addScriptToEvaluateOnNewDocument'])
  expect(guest.debugger.sendCommand.mock.calls[1]?.[1]).toEqual({ enabled: true, cancel: true })
  const prevent = vi.fn()
  guest.emit('will-frame-navigate', { preventDefault: prevent, isMainFrame: false })
  expect(prevent).toHaveBeenCalled()
})

it('routes only the registered main frame and immutable mount nonce, and revokes before killing', async () => {
  const { manager, owner, guest, reservation, browserSession } = await mounted()
  const event = { sender: fixtureOwner(guest), senderFrame: guest.mainFrame as WebContents['mainFrame'] }
  expect(manager.bootstrap(event)).toEqual({ mountId: request.mountId, mountNonce: request.mountNonce })
  const packet = { type: 'ready', mountId: request.mountId }
  manager.receive(event, { mountId: request.mountId, mountNonce: request.mountNonce, packet })
  expect(owner.send).toHaveBeenCalledWith(DESKTOP_IPC.richPacket, { lease: reservation.lease, packet })
  manager.receive({ ...event, senderFrame: { url: guest.mainFrame.url } }, { ...request, packet })
  manager.receive(event, { mountId: request.mountId, mountNonce: 'forged', packet })
  expect(owner.send).toHaveBeenCalledTimes(1)
  expect(() => { manager.send(fixtureOwner(contents(3)), reservation.lease, packet) }).toThrow()
  manager.send(fixtureOwner(owner), reservation.lease, packet)
  expect(guest.send).toHaveBeenCalledWith(DESKTOP_IPC.richToGuest, packet)
  await manager.release(fixtureOwner(owner), reservation.lease)
  expect(guest.forcefullyCrashRenderer).toHaveBeenCalledOnce()
  expect(guest.debugger.detach.mock.invocationCallOrder[0]).toBeLessThan(guest.forcefullyCrashRenderer.mock.invocationCallOrder[0]!)
  expect(guest.debugger.isAttached()).toBe(false)
  expect(manager.bootstrap(event)).toBeUndefined()
  expect((browserSession as { clearStorageData: ReturnType<typeof vi.fn> }).clearStorageData).toHaveBeenCalledOnce()
})

it('releases every guest of a retiring owner document after detaching its debugger', async () => {
  const { manager, owner, guest, reservation, browserSession } = await mounted()
  const event = { sender: fixtureOwner(guest), senderFrame: guest.mainFrame as WebContents['mainFrame'] }
  manager.releaseAll(fixtureOwner(owner))
  expect(manager.bootstrap(event)).toBeUndefined()
  expect(guest.debugger.detach).toHaveBeenCalledOnce()
  expect(guest.debugger.detach.mock.invocationCallOrder[0]).toBeLessThan(guest.forcefullyCrashRenderer.mock.invocationCallOrder[0]!)
  expect(guest.close).toHaveBeenCalledWith({ waitForBeforeUnload: false })
  const { clearStorageData } = browserSession as { clearStorageData: ReturnType<typeof vi.fn> }
  await vi.waitFor(() => { expect(clearStorageData).toHaveBeenCalledOnce() })
  await manager.release(fixtureOwner(owner), reservation.lease)
  expect(guest.close).toHaveBeenCalledOnce()
})

it('fails closed when the guest shares its host process and never kills that process', async () => {
  const { owner, guest } = await mounted(1)
  expect(guest.forcefullyCrashRenderer).not.toHaveBeenCalled()
  expect(guest.loadURL).not.toHaveBeenCalled()
  expect(owner.send).toHaveBeenCalledWith(DESKTOP_IPC.richPacket, expect.objectContaining({ packet: { type: 'native.error', code: 'CONTAINER_UNAVAILABLE' } }))
})

function packetWithBytes(bytes: number, fields: Record<string, unknown> = {}): Record<string, unknown> {
  const packet = { ...fields, text: '' }
  const available = bytes - Buffer.byteLength(JSON.stringify(packet), 'utf8')
  packet.text = 'é'.repeat(Math.floor(available / 2)) + 'a'.repeat(available % 2)
  expect(Buffer.byteLength(JSON.stringify(packet), 'utf8')).toBe(bytes)
  return packet
}

it('uses immutable native caps and accepts the exact multibyte document boundary', () => {
  expect(Object.isFrozen(RICH_NATIVE_LIMITS)).toBe(true)
  expect(RICH_NATIVE_LIMITS).toEqual({
    documentBytes: 2 * 1024 * 1024 + 64 * 1024, sdkBytes: 64 * 1024,
    guestPacketBytes: 128 * 1024, hostPacketBytes: 16 * 1024 * 1024,
  })
  const exact = { ...request, html: 'é'.repeat(RICH_NATIVE_LIMITS.documentBytes / 2), css: '', js: '' }
  expect(readRichRequest(exact)).toEqual(exact)
  expect(() => readRichRequest({ ...exact, html: exact.html + 'a' })).toThrow('RICH_DOCUMENT_TOO_LARGE')
  expect(() => readRichRequest({ ...request, sdk: 's'.repeat(RICH_NATIVE_LIMITS.sdkBytes + 1) })).toThrow('RICH_SDK_TOO_LARGE')
  expect(readRichRequest({ ...request, sdk: 's'.repeat(RICH_NATIVE_LIMITS.sdkBytes) }).sdk).toHaveLength(RICH_NATIVE_LIMITS.sdkBytes)
  // Component boundaries cannot combine surrogate halves and undercount the independently decoded sources.
  expect(() => readRichRequest({ ...request, html: 'a'.repeat(RICH_NATIVE_LIMITS.documentBytes - 5) + '\ud800',
    css: '\udc00', js: '' })).toThrow('RICH_DOCUMENT_TOO_LARGE')
})

it('loads a complete 2 MiB fragment plus the 64 KiB SDK allowance without truncation', async () => {
  const manager = fixtureManager(new DesktopRichGuests('/trusted/preload-rich.cjs'))
  const full = { ...request, html: 'h'.repeat(2 * 1024 * 1024), css: '', js: ' '.repeat(RICH_NATIVE_LIMITS.sdkBytes) }
  const reservation = manager.acquire(fixtureOwner(contents(1)), full)
  const browserSession = native.sessions.get(reservation.partition) as { protocol: { handle: ReturnType<typeof vi.fn> } }
  const handler = browserSession.protocol.handle.mock.calls[0]?.[1] as (request: { url: string; method: string }) => Response
  const response = handler({ url: `dsh-app://${reservation.lease}/`, method: 'GET' })
  expect(response.status).toBe(200)
  const embedded = Buffer.from(JSON.stringify({ html: full.html, css: full.css, js: full.js, sdk: '' }), 'utf8').toString('base64')
  expect(await response.text()).toContain(embedded)
})

it('checks exact UTF-8 packet boundaries independently for the two fixed directions', () => {
  const guest = packetWithBytes(RICH_NATIVE_LIMITS.guestPacketBytes)
  expect(readRichPacket(guest)).toEqual(guest)
  expect(() => readRichPacket(packetWithBytes(RICH_NATIVE_LIMITS.guestPacketBytes + 1))).toThrow('RICH_GUEST_PACKET_TOO_LARGE')
  const host = packetWithBytes(RICH_NATIVE_LIMITS.hostPacketBytes)
  expect(readRichPacket(host, 'host-to-guest')).toEqual(host)
  expect(() => readRichPacket(packetWithBytes(RICH_NATIVE_LIMITS.hostPacketBytes + 1), 'host-to-guest'))
    .toThrow('RICH_HOST_PACKET_TOO_LARGE')
})

it('cannot increase the guest receive budget through forged direction or limit fields', async () => {
  const { manager, owner, guest } = await mounted()
  const packet = packetWithBytes(RICH_NATIVE_LIMITS.guestPacketBytes + 1, {
    direction: 'host-to-guest', hostPacketBytes: RICH_NATIVE_LIMITS.hostPacketBytes,
    limits: { guestPacketBytes: RICH_NATIVE_LIMITS.hostPacketBytes },
  })
  const event = { sender: fixtureOwner(guest), senderFrame: guest.mainFrame as WebContents['mainFrame'] }
  expect(() => { manager.receive(event, { mountId: request.mountId, mountNonce: request.mountNonce, packet }) })
    .toThrow('RICH_GUEST_PACKET_TOO_LARGE')
  expect(owner.send).not.toHaveBeenCalled()
})

it('allows a bounded large owner packet and rejects other owners before applying the trusted budget', async () => {
  const { manager, owner, guest, reservation } = await mounted()
  const packet = packetWithBytes(2 * 1024 * 1024)
  expect(() => { manager.send(fixtureOwner(contents(3)), reservation.lease, packet) }).toThrow('desktop rich: unavailable lease')
  expect(guest.send).not.toHaveBeenCalled()
  manager.send(fixtureOwner(owner), reservation.lease, packet)
  expect(guest.send).toHaveBeenCalledWith(DESKTOP_IPC.richToGuest, packet)
  expect(() => { manager.send(fixtureOwner(owner), reservation.lease, packetWithBytes(RICH_NATIVE_LIMITS.hostPacketBytes + 1)) })
    .toThrow('RICH_HOST_PACKET_TOO_LARGE')
  expect(guest.send).toHaveBeenCalledOnce()
})
