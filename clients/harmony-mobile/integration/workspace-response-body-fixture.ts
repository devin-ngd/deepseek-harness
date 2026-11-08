/** Synthetic Fetch responses reached by an unmodified ArkWeb workspace document. */
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-modules'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { WORKSPACE_ROUTE_HEADER } from '../src/workspace-protocol.ts'

const resetPath = '/plugins/workspace-fixture-reset'
const ownerPath = '/api/workspace-fixture-body/owner'
const cases = [
  { path: resetPath, method: 'GET', status: 205, header: 'x-fixture', value: 'reset' },
  { path: ownerPath, method: 'HEAD', status: 403, header: WORKSPACE_ROUTE_HEADER, value: 'owner-only' },
  { path: '/api/workspace-fixture-body/absent', method: 'HEAD', status: 404, header: WORKSPACE_ROUTE_HEADER, value: 'unregistered' },
]

const probe = `(() => {
  const run = async () => {
    const output = document.createElement('output')
    output.style.cssText = 'position:fixed;left:8px;top:8px;z-index:2147483647;background:white;color:black;padding:4px'
    output.textContent = 'Workspace response probe pending'
    document.body.append(output)
    try {
      for (const expected of ${JSON.stringify(cases)}) {
        const response = await fetch(expected.path, { method: expected.method })
        if (response.status !== expected.status || response.headers.get(expected.header) !== expected.value
          || response.body !== null || await response.text() !== '') throw new Error(expected.method + ' ' + expected.status)
      }
      output.textContent = 'Workspace response bodies verified'
    } catch (error) {
      output.textContent = 'Workspace response probe failed ' + String(error).slice(0, 100)
    }
  }
  if (document.readyState === 'complete') void run()
  else window.addEventListener('load', () => void run(), { once: true })
})()`

/** @param ctx - isolated synthetic Host. @returns observation and cleanup for this fixture only. */
export function installWorkspaceResponseBodyFixture(ctx: Context) {
  let resetReads = 0, ownerReads = 0
  const modules = ctx.clientModules
  const fetchBundle = modules.fetchBundle
  modules.fetchBundle = async request => {
    if (new URL(request.url).pathname !== resetPath) return fetchBundle.call(modules, request)
    assert.equal(request.method, 'GET')
    resetReads++
    return new Response(null, { status: 205, headers: { 'x-fixture': 'reset' } })
  }
  const stopOwner = ctx.connection.fetch.register({ path: ownerPath, methods: ['HEAD'], requestBody: 'buffered', async fetch() {
    ownerReads++
    return new Response(null, { status: 204 })
  } })
  const stopProbe = ctx.on('webserver/index-inject', rows => rows.push({ kind: 'script', placement: 'body', text: probe }))
  return {
    observed() {
      assert.equal(resetReads, 1)
      assert.equal(ownerReads, 0)
      return { resetReads, ownerReads, checkedStatuses: cases.map(row => row.status) }
    },
    dispose() {
      stopProbe(); stopOwner(); modules.fetchBundle = fetchBundle
    },
  }
}
