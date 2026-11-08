/** Actual native cache with only SDK crypto/bytes substituted; Chromium still owns resource rendering. */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { WorkspaceShellManifest } from '../desktop-plugin/src/workspace-shell.ts'

interface Cache { select(origin: string, manifest: string): void; get(url: string): string | undefined; put(url: string, raw: string): void }
interface CachedResponse { status: number; headers: [string, string][]; body: string }
interface NativeModule { NativeWorkspaceCache: new (policy: { maxEntries: number; maxBytes: number }) => Cache }
/** @param origin - exact admitted desktop origin. @param policy - configured native capacities. @returns the actual ETS cache and resource adapter; no disk or ArkWeb cache is used. */
export async function workspaceCacheFixture(origin: string, policy: { maxEntries: number; maxBytes: number }) {
  const module = await import(pathToFileURL(resolve(import.meta.dirname, '../.build/product-native.js')).href) as NativeModule
  Object.assign(globalThis, { canIUse: () => true })
  const cache = new module.NativeWorkspaceCache(policy)
  let hits = 0, downloadedBytes = 0, savedBytes = 0
  return {
    select(manifest: WorkspaceShellManifest) { cache.select(origin, JSON.stringify(manifest)) },
    metrics: () => ({ hits, downloadedBytes, savedBytes }),
    async fetch(request: Request, load: () => Promise<Response>): Promise<Response> {
      if (request.method !== 'GET') return load()
      const cached = cache.get(request.url)
      if (cached !== undefined) {
        const row = JSON.parse(cached) as CachedResponse
        hits++; savedBytes += Buffer.byteLength(cached)
        return new Response(Buffer.from(row.body, 'base64url'), { status: row.status, headers: row.headers })
      }
      const response = await load(), bytes = Buffer.from(await response.arrayBuffer())
      downloadedBytes += bytes.byteLength
      cache.put(request.url, JSON.stringify({ status: response.status, headers: [...response.headers], body: bytes.toString('base64url') }))
      return new Response(bytes, { status: response.status, headers: response.headers })
    },
  }
}
