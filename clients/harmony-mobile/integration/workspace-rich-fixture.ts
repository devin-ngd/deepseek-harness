/** Real ETS rich owner and generated app document with only ArkWeb rendering/port APIs substituted by Chromium. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Browser, Page } from 'playwright'
import type { WorkspaceRichPolicy } from '../src/workspace-rich-protocol.ts'
import type { WorkspaceRichFixturePort } from './workspace-document-fixture.ts'

interface NativePort { posted: string[]; deliver: ((raw: string) => void) | null; emit(raw: string): void }
interface NativeGuest { controller: { html: string; ports: NativePort[]; bootstrap: { raw: string }; detach(): void }; attached(): void; bind(url: string): void; exited(): void }
interface NativeManager { request(raw: string): Promise<string>; view(): NativeGuest | undefined; closeView(): Promise<void>; close(): Promise<void> }
interface NativeFixtureModule {
  NativeAssets: new (context: object) => object
  NativeWorkspaceRich: new (assets: object, policy: WorkspaceRichPolicy, emit: (lease: string, raw: string, id?: string) => void, visible: (opened: boolean) => void) => NativeManager
  resetProductSdk(): void
  sdk: { resources: Map<string, Uint8Array> }
  context(): object
  webview: { WebviewController: { setRenderProcessMode(mode: number): void; setWebDestroyMode(mode: number): void }; RenderProcessMode: { MULTIPLE: number }; WebDestroyMode: { FAST_MODE: number } }
}
const origin = 'https://workspace-rich.dsh.invalid', documentUrl = origin + '/document'
/** @param browser - isolated test Chromium. @param policy - actual native rendering limits. @returns real native manager and page access; this does not establish ArkWeb network blocking. */
export async function workspaceRichFixture(browser: Browser, policy: WorkspaceRichPolicy) {
  const clientRoot = resolve(import.meta.dirname, '..')
  const module = await import(pathToFileURL(resolve(clientRoot, '.build/product-native.js')).href) as NativeFixtureModule
  Object.assign(globalThis, { canIUse: () => true }); module.resetProductSdk()
  module.webview.WebviewController.setRenderProcessMode(module.webview.RenderProcessMode.MULTIPLE)
  module.webview.WebviewController.setWebDestroyMode(module.webview.WebDestroyMode.FAST_MODE)
  module.sdk.resources.set('workspace-rich-document.js', await readFile(resolve(clientRoot, 'harmony/entry/src/main/resources/rawfile/workspace-rich-document.js')))
  let deliver: ((lease: string, packet: string, id?: string) => Promise<void>) | undefined
  let page: Page | undefined, selected: NativeGuest | undefined
  const failures: string[] = [], network: string[] = [], emitted: { lease: string; type: string | undefined }[] = []
  const manager = new module.NativeWorkspaceRich(new module.NativeAssets(module.context()), policy, (lease, packet, id) => {
    emitted.push({ lease, type: (JSON.parse(packet) as { type?: string }).type })
    void deliver?.(lease, packet, id).catch(error => { failures.push(String(error)) })
  }, opened => {
    if (opened || selected === undefined) return
    const guest = selected, current = page; page = undefined
    if (current === undefined) guest.controller.detach()
    else void current.close().then(() => guest.controller.detach(), error => { failures.push(String(error)) })
  })
  const render = async () => {
    const guest = manager.view()
    if (guest === selected) return
    selected = guest; await page?.close(); page = undefined
    if (guest === undefined) return
    guest.attached()
    const next = await browser.newPage({ viewport: { width: 390, height: 740 } }); page = next
    next.on('pageerror', error => failures.push(error.message))
    await next.route('**/*', async route => {
      if (route.request().url() === documentUrl) return route.fulfill({ contentType: 'text/html', body: guest.controller.html })
      network.push(route.request().url()); return route.abort()
    })
    await next.exposeBinding('__richNativeSend', (source, raw: string) => {
      if (source.frame !== next.mainFrame()) throw new Error('rich app frame required')
      guest.controller.ports[0]!.emit(raw)
    })
    await next.goto(documentUrl); guest.bind(documentUrl)
    const port = guest.controller.ports[0]!
    port.deliver = raw => { void next.evaluate(value => {
      const bridge = window as typeof window & { __richNativePort?: MessagePort }; bridge.__richNativePort?.postMessage(value)
    }, raw).catch(error => { if (!next.isClosed()) failures.push(String(error)) }) }
    await next.evaluate(init => {
      const bridge = window as typeof window & { __richNativeSend(raw: string): Promise<void>; __richNativePort?: MessagePort }
      const ports = new MessageChannel(); bridge.__richNativePort = ports.port1
      ports.port1.onmessage = event => { void bridge.__richNativeSend(event.data) }; ports.port1.start()
      window.postMessage(init, location.origin, [ports.port2])
    }, guest.controller.bootstrap.raw)
  }
  let rendering = Promise.resolve()
  const synchronize = () => rendering = rendering.then(render)
  const port: WorkspaceRichFixturePort = { policy, bind(send) { deliver = send }, async request(raw) {
    const result = await manager.request(raw)
    if (JSON.parse(raw).operation !== 'ack') await synchronize()
    return result
  } }
  return { port, manager, failures, network, emitted, page: () => page,
    async back() { await manager.closeView(); await synchronize() }, async close() { await manager.close(); await page?.close(); page = undefined } }
}
