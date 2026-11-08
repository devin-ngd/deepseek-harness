/** Bounded subscription to the standard Client Modules graph; the existing HMR browser face consumes unchanged frames. */
import type { Context } from '@deepseek-ai/cordis'
import type { PluginsEventFrame } from '@deepseek-ai/dsh-client-hmr'
import type {} from '@deepseek-ai/dsh-client-modules'
import { WorkspaceError } from './workspace-channel.ts'

/** @param modules - original standard Client Modules owner. @param signal - original device/workspace/request lifetime. @param maxBytes - finite queue and per-frame byte budget. @returns original graph/rebuilt frames with teardown on abort or consumer return. */
export async function* workspacePluginEvents(modules: Pick<Context['clientModules'], 'graph' | 'onGraphChanged' | 'onRebuilt'>, signal: AbortSignal, maxBytes: number): AsyncIterable<PluginsEventFrame> {
  let unsubscribeGraph = () => {}, unsubscribeRebuilt = () => {}, dispose = () => {}
  let terminated = false
  const stream = new ReadableStream<PluginsEventFrame>({
    start(controller) {
      let retired = false
      dispose = () => { if (retired) return; retired = true; unsubscribeGraph(); unsubscribeRebuilt(); signal.removeEventListener('abort', abort) }
      const abort = () => { if (!retired) { terminated = true; dispose(); controller.error(new WorkspaceError('workspace-closed')) } }
      const publish = (frame: PluginsEventFrame) => {
        if (retired) return
        const size = Buffer.byteLength(JSON.stringify(frame))
        if (size > maxBytes || size > (controller.desiredSize ?? 0)) { terminated = true; dispose(); controller.error(new WorkspaceError('workspace-resource-limit')); return }
        controller.enqueue(frame)
      }
      unsubscribeGraph = modules.onGraphChanged(() => publish({ type: 'graph', graph: modules.graph() }))
      unsubscribeRebuilt = modules.onRebuilt((id, rev) => publish({ type: 'rebuilt', id, rev }))
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort(); else publish({ type: 'graph', graph: modules.graph() })
    }, cancel() { dispose() },
  }, { highWaterMark: maxBytes, size: value => Buffer.byteLength(JSON.stringify(value)) })
  const reader = stream.getReader()
  try { for (;;) { const item = await reader.read(); if (item.done) return; yield item.value } }
  finally { dispose(); try { if (!terminated) await reader.cancel() } finally { reader.releaseLock() } }
}
