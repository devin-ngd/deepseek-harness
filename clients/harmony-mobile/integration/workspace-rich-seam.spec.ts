// @vitest-environment jsdom
/** Actual isolated RichGuest component and the document's native-only bridge; no generated guest executes here. */
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, onTestFinished, vi } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RichGuest } from '../.build/workspace-core-checkout/packages/experimental/rich-inline/src/client/RichGuest.tsx'
import { nativeRich } from '../.build/workspace-core-checkout/packages/experimental/rich-inline/src/client/native.ts'
import { WorkspaceNativeRich } from '../src/workspace-native-rich.ts'
import { workspaceRichRequest, workspaceRichPacket } from '../src/workspace-rich-protocol.ts'

const limits = { maxGuests: 4, maxQueuedPackets: 32, maxQueuedBytes: 4194304, documentBytes: 2097152, sdkBytes: 131072, guestPacketBytes: 131072, hostPacketBytes: 5242880, closeTimeoutMs: 30000 }
const reservation = { lease: 'native-fixture', partition: 'native-fixture', src: 'https://native-rich.dsh.invalid/fixture' }
const acquire = { mountId: 'mount', mountNonce: 'nonce', html: '<p>Content</p>', css: '', js: '', sdk: 'canonical-sdk' }

it('keeps the Desktop guest element and detaches a carrier-owned view on unmount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const rootElement = document.createElement('div'); document.body.append(rootElement)
  const root = createRoot(rootElement), detach = vi.fn(), attach = vi.fn((_lease: string, _container: HTMLElement) => detach)
  onTestFinished(async () => { await act(async () => root.unmount()); rootElement.remove(); vi.unstubAllGlobals() })
  await act(async () => root.render(createElement(RichGuest, { reservation, height: 160, className: undefined, label: 'Interactive content' })))
  expect(rootElement.querySelector('webview')?.getAttribute('name')).toBe(reservation.lease)
  vi.stubGlobal('__DSH_RICH_CARRIER__', { attach })
  await act(async () => root.render(createElement(RichGuest, { reservation, height: 200, className: undefined, label: 'Interactive content' })))
  expect(attach).toHaveBeenCalledOnce(); expect(attach.mock.calls[0]?.[0]).toBe(reservation.lease)
  expect(rootElement.querySelector('webview')).toBeNull()
  await act(async () => root.render(null)); expect(detach).toHaveBeenCalledOnce()
  await writeFile(join(process.env.DSH_HARMONY_WORKSPACE_WORLD!, 'observed.json'), JSON.stringify({ desktopGuestRetained: true, carrierView: true, nativeExecuted: false, models: 0 }) + '\n')
})

it('opens only the native reservation on a user click and drops released callbacks', async () => {
  const calls: string[] = []
  const bridge = new WorkspaceNativeRich({ request: async value => { calls.push(value.operation); return value.operation === 'acquire' ? reservation : null } }, limits)
  vi.stubGlobal('__DSH_RICH_CARRIER__', bridge)
  onTestFinished(() => { bridge.close(); vi.unstubAllGlobals() })
  expect(nativeRich()).toBe(bridge)
  await bridge.acquire(acquire)
  const container = document.createElement('div'); container.setAttribute('aria-label', 'Interactive content')
  const dispose = bridge.attach(reservation.lease, container), button = container.querySelector('button')!
  expect(calls).toEqual(['acquire'])
  button.click(); await Promise.resolve(); expect(calls).toEqual(['acquire', 'open'])
  const received = vi.fn(), stop = bridge.subscribe(reservation.lease, received)
  await bridge.receive(reservation.lease, { type: 'ready' }); expect(received).toHaveBeenCalledOnce()
  await bridge.release(reservation.lease); await bridge.receive(reservation.lease, { type: 'ready' }); button.click()
  expect(received).toHaveBeenCalledOnce(); expect(calls).toEqual(['acquire', 'open', 'release'])
  stop(); dispose(); expect(container.children).toHaveLength(0)
})

it('rejects unsupported native operations and byte overflows before a guest is acquired', () => {
  expect(() => workspaceRichRequest(JSON.stringify({ operation: 'workspace', url: '/api/session/create' }), JSON.stringify(limits))).toThrow()
  expect(() => workspaceRichRequest(JSON.stringify({ operation: 'acquire', request: { ...acquire, sdk: 'x'.repeat(limits.sdkBytes + 1) } }), JSON.stringify(limits))).toThrow('native rich document capacity')
  expect(() => workspaceRichRequest(JSON.stringify({ operation: 'acquire', request: { ...acquire, sessionId: 'foreign' } }), JSON.stringify(limits))).toThrow()
  expect(() => workspaceRichPacket('{"type":"native.close-request","requestId":"forged"}', limits.guestPacketBytes)).toThrow('native rich guest message denied')
})

it('applies native backpressure until the standard controller finishes its guest packet', async () => {
  const bridge = new WorkspaceNativeRich({ request: async value => value.operation === 'acquire' ? reservation : null }, limits)
  onTestFinished(() => bridge.close())
  await bridge.acquire(acquire)
  const gate = Promise.withResolvers<void>(); let acknowledged = false
  bridge.subscribe(reservation.lease, () => gate.promise)
  const pending = bridge.receive(reservation.lease, { type: 'ready' }).then(() => { acknowledged = true })
  await Promise.resolve(); expect(acknowledged).toBe(false)
  gate.resolve(); await pending; expect(acknowledged).toBe(true)
})
