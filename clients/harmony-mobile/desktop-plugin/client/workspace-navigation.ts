/** Native/Web handoff consumes the existing navigation service and renderer's read-only Session binding source. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { z } from 'zod'
const target = z.object({ sessionId: z.string().max(256), plugin: z.string().max(256).optional() }).strict()

/** @param root - browser plugin; navigation attaches only while its uiWorkspace and uiSession providers exist. No Session or Host task is created. */
export function registerWorkspaceNavigation(root: Context): void {
  root.inject(['uiWorkspace', 'uiSession'], ctx => {
    const source = ctx.uiSession.adapter.current
    let ready = false, listening = false, reconciling = false, requested: string | undefined, requestedPlugin: string | undefined
    let openBundle: ((name: string) => void) | undefined
    const publish = () => {
      const sessionId = source.getSnapshot().props.sessionId
      if (sessionId !== undefined && typeof sessionId !== 'string') throw new Error('workspace Session binding invalid')
      window.dispatchEvent(new CustomEvent('harmony:workspace:selection', { detail: sessionId ?? null }))
    }
    const reconcile = () => {
      if (!listening || reconciling) return
      reconciling = true
      try {
        const list = ctx.sessions.list.getSnapshot()
        if (list.phase !== 'ready') return
        if (!ready) { ready = true; window.dispatchEvent(new Event('harmony:workspace:navigation-ready')) }
        if (requested !== undefined) {
          const selected = requested; requested = undefined
          if (selected !== '') {
            const sessionId = SessionId(selected)
            if (list.byId[sessionId] === undefined) { requestedPlugin = undefined; window.dispatchEvent(new Event('harmony:workspace:navigation-failed')); return }
            ctx.uiWorkspace.openSession(sessionId); publish()
          }
        }
        if (requestedPlugin !== undefined) {
          if (openBundle !== undefined) { const name = requestedPlugin; requestedPlugin = undefined; openBundle(name) }
        }
      } finally { reconciling = false }
    }
    const navigate = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const request = target.parse(event.detail)
      requested = request.sessionId; requestedPlugin = request.plugin; reconcile()
    }
    ctx.inject(['pluginNavigation'], scope => {
      scope.effect(() => {
        openBundle = name => scope.pluginNavigation.openBundle(name); reconcile()
        return () => { openBundle = undefined }
      })
    })
    ctx.effect(() => {
      window.addEventListener('harmony:workspace:navigate', navigate)
      listening = true
      const stop = source.subscribe(publish)
      const stopList = ctx.sessions.list.subscribe(reconcile)
      reconcile()
      publish()
      return () => {
        listening = false
        stopList(); stop(); window.removeEventListener('harmony:workspace:navigate', navigate)
        window.dispatchEvent(new Event('harmony:workspace:navigation-disposed'))
      }
    })
  })
}
