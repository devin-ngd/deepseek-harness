/** Version-pinned frontend files for a device workspace; no filesystem path comes from the phone. */
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { renderIndexInjections, type IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { WorkspaceError } from './workspace-channel.ts'

/** Deployment capacities for indexing one already built standard frontend. */
export interface WorkspaceShellLimits { readonly maxFiles: number; readonly maxFileBytes: number; readonly maxTotalBytes: number }
/** Public file metadata contains only document-relative URLs, immutable hashes and byte counts. */
export interface WorkspaceShellManifest {
  readonly revision: string
  readonly resources: readonly { readonly path: string; readonly sha256: string; readonly bytes: number; readonly mediaType: string }[]
}
const mime: Readonly<Record<string, string>> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' }
interface Resource { readonly file: string; readonly sha256: string; readonly bytes: number; readonly mediaType: string }
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

/** Index and serve one explicit frontend build, refusing changed files until the workspace is recreated. */
export class WorkspaceShell {
  private constructor(private readonly resources: ReadonlyMap<string, Resource>, private readonly entry: string,
    readonly manifest: WorkspaceShellManifest) {}

  /** @param distIndex - locally configured existing standard frontend index, never a phone-supplied path. @param limits - finite index and read capacities. @returns an immutable file inventory; symlinks and oversized trees refuse before activation. */
  static async open(distIndex: string, limits: WorkspaceShellLimits): Promise<WorkspaceShell> {
    if (!Object.values(limits).every(value => Number.isSafeInteger(value) && value > 0)) throw new WorkspaceError('workspace-denied')
    const root = await realpath(dirname(resolve(distIndex))), resources = new Map<string, Resource>()
    let total = 0
    const visit = async (directory: string, prefix: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true })
      entries.sort((left, right) => left.name.localeCompare(right.name))
      for (const item of entries) {
        const file = join(directory, item.name), path = prefix + '/' + encodeURIComponent(item.name)
        if (item.isSymbolicLink()) throw new WorkspaceError('workspace-denied')
        if (item.isDirectory()) { await visit(file, path); continue }
        if (!item.isFile() || resources.size >= limits.maxFiles) throw new WorkspaceError('workspace-resource-limit')
        const metadata = await stat(file)
        if (metadata.size > limits.maxFileBytes || metadata.size > limits.maxTotalBytes - total) throw new WorkspaceError('workspace-resource-limit')
        const resolved = await realpath(file)
        if (!resolved.startsWith(root + sep)) throw new WorkspaceError('workspace-denied')
        const bytes = await readFile(resolved)
        if (bytes.byteLength !== metadata.size) throw new WorkspaceError('workspace-shell-changed')
        total += bytes.byteLength
        resources.set(path, { file: resolved, bytes: bytes.byteLength, sha256: digest(bytes), mediaType: mime[extname(item.name)] ?? 'application/octet-stream' })
      }
    }
    await visit(root, '')
    const entry = '/' + encodeURIComponent(basename(distIndex))
    if (!resources.has(entry)) throw new WorkspaceError('workspace-denied')
    const inventory = [...resources].map(([path, value]) => ({ path, sha256: value.sha256, bytes: value.bytes, mediaType: value.mediaType }))
    return new WorkspaceShell(resources, entry, { revision: digest(JSON.stringify(inventory)), resources: inventory })
  }

  /** @param request - same-origin standard frontend request already admitted by the workspace. @param injections - original public Host boot rows for this exact Peer. @returns a bounded file or the rendered index; any build drift requires a new workspace. */
  async fetch(request: Request, injections: readonly IndexInjection[]): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
    const path = new URL(request.url).pathname
    const resource = this.resources.get(path === '/' ? this.entry : path)
    if (resource === undefined) return new Response(null, { status: 404 })
    const file = await realpath(resource.file)
    if (file !== resource.file) throw new WorkspaceError('workspace-shell-changed')
    const bytes = await readFile(file)
    if (bytes.byteLength !== resource.bytes || digest(bytes) !== resource.sha256) throw new WorkspaceError('workspace-shell-changed')
    const index = path === '/' || path === this.entry
    const body = index ? renderIndexInjections(bytes.toString('utf8'), [...injections]) : bytes
    return new Response(request.method === 'HEAD' ? null : body, { headers: {
      'content-type': resource.mediaType, 'cache-control': 'no-store',
      ...(index ? {} : { etag: '"' + resource.sha256 + '"' }),
    } })
  }
}
