/** Browser execution of the generated document-start script; only the ArkWeb port API is substituted. */
import { readFile } from 'node:fs/promises'
import type { Page } from 'playwright'
import { workspacePortMessageSchema } from '../src/workspace-document-protocol.ts'
import { workspaceRequestSchema, type WorkspaceRequest } from '../src/workspace-protocol.ts'
import type { WorkspaceRichPolicy } from '../src/workspace-rich-protocol.ts'
import type { JsonValue } from '../src/upstream.ts'

/** Synthetic native rendering port; the generated document and standard plugin remain real. */
export interface WorkspaceRichFixturePort {
  readonly policy: WorkspaceRichPolicy
  request(raw: string): Promise<string>
  bind(send: (lease: string, packet: string, id?: string) => Promise<void>): void
}

/** @param page - isolated real Chromium page. @param host - real serialized workspace owner. @param sessionId - native navigation target. @param requests - observed original API paths. @param maxChunkBytes - native transfer limit supplied to the document. @returns port state and teardown for this document only. */
export async function installWorkspaceDocument(page: Page, host: { request(input: WorkspaceRequest, signal: AbortSignal): Promise<JsonValue> }, sessionId: string, requests: string[], rich?: WorkspaceRichFixturePort, plugin?: string, maxChunkBytes = 65536) {
  const pending = new Map<string, AbortController>(), signals: { kind: string; sessionId?: string | null }[] = []
  const operations: string[] = []
  await page.addInitScript(() => {
    const rows: { type: string; detail?: object | string | null }[] = []
    Object.assign(window, { __workspaceFixtureNavigation: rows })
    for (const type of ['harmony:workspace:navigation-ready', 'harmony:workspace:navigate', 'harmony:workspace:selection']) window.addEventListener(type, event => {
      rows.push({ type, ...(event instanceof CustomEvent ? { detail: event.detail } : {}) })
    })
  })
  let carrierBytes = 0, maxCarrierBytes = 0
  rich?.bind(async (lease, packet, id) => { await page.evaluate(value => {
    const bridge = window as typeof window & { __workspaceFixturePort?: MessagePort }
    bridge.__workspaceFixturePort?.postMessage(JSON.stringify(value))
  }, { kind: 'workspace.rich-packet', lease, packet, id }) })
  await page.addInitScript({ content: 'if(window.top===window){' + await readFile(new URL('../harmony/entry/src/main/resources/rawfile/workspace-document.js', import.meta.url), 'utf8') + '}' })
  await page.exposeBinding('__nativeWorkspacePort', async (source, raw: string) => {
    if (source.frame !== page.mainFrame()) throw new Error('workspace main frame required')
    const message = workspacePortMessageSchema.parse(JSON.parse(raw))
    if (message.kind === 'workspace.cancel') { pending.get(message.id)?.abort(); return }
    if (message.kind === 'workspace.rich-request') {
      try { if (rich === undefined) throw new Error('native rich absent'); return JSON.stringify({ kind: 'workspace.reply', id: message.id, value: await rich.request(message.request), error: false }) }
      catch (error) { void error; return JSON.stringify({ kind: 'workspace.reply', id: message.id, value: 'null', error: true }) }
    }
    if (message.kind !== 'workspace.request') { signals.push(message); return }
    const input = workspaceRequestSchema.parse(JSON.parse(message.request)), controller = new AbortController()
    operations.push(input.operation)
    if (input.operation === 'fetch') requests.push(new URL(input.url).pathname)
    if (input.operation === 'stream-open') requests.push('stream:' + input.endpoint)
    if (pending.has(message.id)) throw new Error('duplicate native correlation')
    pending.set(message.id, controller)
    try {
      const value = JSON.stringify(await host.request(input, controller.signal)), bytes = Buffer.byteLength(value)
      carrierBytes += bytes; maxCarrierBytes = Math.max(maxCarrierBytes, bytes)
      return JSON.stringify({ kind: 'workspace.reply', id: message.id, value, error: false })
    }
    catch (error) { void error; return JSON.stringify({ kind: 'workspace.reply', id: message.id, value: 'null', error: true }) }
    finally { pending.delete(message.id) }
  })
  // ArkWeb binds at onPageEnd. Binding after load also tests that Web boot waits without blocking that event.
  page.on('load', () => { void page.evaluate(({ target, richPolicy, pluginTarget, chunkBytes }) => {
    const bridge = window as typeof window & { __nativeWorkspacePort(raw: string): Promise<string | undefined>; __workspaceFixturePort?: MessagePort }
    const ports = new MessageChannel()
    bridge.__workspaceFixturePort = ports.port1
    ports.port1.onmessage = event => { void bridge.__nativeWorkspacePort(event.data).then(reply => { if (reply !== undefined) ports.port1.postMessage(reply) }) }
    ports.port1.start()
    window.postMessage(JSON.stringify({ protocol: 'harmony-workspace/1', sessionId: target, ...(richPolicy === undefined ? {} : { rich: richPolicy }), ...(pluginTarget === undefined ? {} : { plugin: pluginTarget }),
      limits: { origin: location.origin, maxRequestBytes: 1024 * 1024, maxResponseBytes: 16 * 1024 * 1024,
        maxChunkBytes: chunkBytes, maxPending: 32, maxPacketBytes: 5 * 1024 * 1024 } }), location.origin, [ports.port2])
  }, { target: sessionId, richPolicy: rich?.policy, pluginTarget: plugin, chunkBytes: maxChunkBytes }) })
  return { signals, operations, metrics: () => ({ carrierBytes, maxCarrierBytes }),
    async retire() { await page.evaluate(() => { const bridge = window as typeof window & { __workspaceFixturePort?: MessagePort }; bridge.__workspaceFixturePort?.postMessage('{"kind":"workspace.closed"}') }); for (const controller of pending.values()) controller.abort() },
    close() { for (const controller of pending.values()) controller.abort() } }
}
