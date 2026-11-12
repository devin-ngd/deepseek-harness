/** Installed bundle images referenced by detail documents delivered to the original workspace Peer. */
import { createHash } from 'node:crypto'
import type { Nodes } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-plugin-manager'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import { resolveBundleDir } from '@deepseek-ai/dsh-app-boot'
import { DetailFailure, detailImage, detailImageResponse, localFiles, markdownOf } from '@deepseek-ai/dsh-plugin-detail'

const method = 'pluginManager/readBundleDetail'
const imageRoute = '/api/plugin-manager/detail-file'
const cacheControl = 'no-store'
const maxDocumentReceipts = 24
const maxImageReferences = 256
const requestSchema = z.object({ type: z.literal('client-request'), method: z.literal(method), payload: z.object({ args: z.object({
  name: z.string().min(1).max(214), language: z.string().min(1).max(128), options: z.object({ npmFileSources: z.array(z.string()).optional() }).optional(),
}) }) })
const detailSchema = z.object({ type: z.literal('server-response'), result: z.object({ ok: z.literal(true), value: z.object({
  status: z.literal('found'), path: z.string().min(1).max(1024), markdown: z.string(),
}) }) })
interface DocumentReceipt {
  readonly args: z.infer<typeof requestSchema>['payload']['args']
  readonly digest: string
  readonly images: ReadonlySet<string>
}
const digest = (markdown: string): string => createHash('sha256').update(markdown).digest('hex')
const key = (name: string, path: string): string => JSON.stringify([name, path])

function imagePaths(document: string, markdown: string): ReadonlySet<string> {
  const nodes: Nodes[] = [fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })]
  const definitions = new Map<string, string>(), references = new Set<string>(), paths = new Set<string>()
  const add = (destination: string) => {
    const image = detailImage(document, destination)
    if (image !== undefined && paths.size < maxImageReferences) paths.add(image.path)
  }
  while (nodes.length > 0) {
    const node = nodes.pop()!
    if (node.type === 'image') add(node.url)
    else if (node.type === 'imageReference') references.add(node.identifier)
    else if (node.type === 'definition' && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url)
    if ('children' in node) for (let index = node.children.length - 1; index >= 0; index--) nodes.push(node.children[index]!)
  }
  for (const reference of references) {
    const destination = definitions.get(reference)
    if (destination !== undefined) add(destination)
  }
  return paths
}

/** Only the standard bundle-detail image URL has a workspace-specific reader. */
export class WorkspaceDetailImages {
  private readonly receipts = new Map<string, DocumentReceipt>()

  /** @param ctx - the current profile's services. @param peer - the original device Peer. @param maxBytes - the workspace response limit. */
  constructor(private readonly ctx: Context, private readonly peer: PeerScope, private readonly maxBytes: number) {}

  /** @param request - the admitted workspace request. @returns whether it asks for a standard bundle-detail image. */
  matches(request: Request): boolean {
    return request.method === 'GET' && new URL(request.url).pathname === imageRoute
  }

  /** @param request - original Gateway request. @param input - bounded request bytes. @param response - Gateway response. @param output - bounded response bytes. */
  record(request: Request, input: Uint8Array | undefined, response: Response, output: Uint8Array): void {
    if (request.method !== 'POST' || new URL(request.url).pathname !== `/api/${method}` || input === undefined
      || response.status !== 200 || !response.headers.get('content-type')?.startsWith('application/json')) return
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true })
      const sent = requestSchema.safeParse(JSON.parse(decoder.decode(input)))
      const received = detailSchema.safeParse(JSON.parse(decoder.decode(output)))
      if (!sent.success || !received.success) return
      const { path, markdown } = received.data.result.value, { args } = sent.data.payload
      const id = key(args.name, path)
      this.receipts.delete(id)
      const images = imagePaths(path, markdown)
      if (images.size === 0) return
      this.receipts.set(id, { args, digest: digest(markdown), images })
      if (this.receipts.size > maxDocumentReceipts) this.receipts.delete(this.receipts.keys().next().value!)
    } catch (error) {
      // A detail document that cannot be indexed still reaches the standard page.
      this.ctx.logger('harmony-workspace').debug('Could not index bundle detail images: %s', error instanceof Error ? error.name : 'unknown error')
    }
  }

  private selected(request: Request) {
    const params = new URL(request.url).searchParams
    const name = params.get('bundle'), document = params.get('document'), path = params.get('path')
    if (name === null || document === null || path === null) return undefined
    const receipt = this.receipts.get(key(name, document)), image = detailImage(document, path)
    if (receipt === undefined || image === undefined || !receipt.images.has(image.path)) return undefined
    return { name, document, image, receipt }
  }

  /** @param request - the same image request, after a scope refresh. @returns whether the original document permission still holds. */
  canDeliver(request: Request): boolean {
    const selected = this.selected(request)
    return selected !== undefined && this.ctx.remoteAccess.decide({ principal: this.peer.principal, action: method,
      resources: [{ kind: 'global' }], args: selected.receipt.args }).kind === 'allow'
  }

  /** @param request - admitted image request. @returns a bounded installed-package image or the standard image failure response. */
  async fetch(request: Request): Promise<Response> {
    const selected = this.selected(request)
    const manager = this.ctx.get('pluginManager'), profile = this.ctx.get('profileContext')
    if (selected === undefined || !this.canDeliver(request) || manager === undefined || profile === undefined) return detailImageResponse(undefined, cacheControl)
    const { name, document, image, receipt } = selected
    const bundle = (await manager.listBundles()).find(item => item.name === name && item.availability !== 'missing')
    if (bundle === undefined) return detailImageResponse(undefined, cacheControl)
    let directory: string
    try {
      directory = resolveBundleDir('dsh', bundle.name, profile.installAnchor, profile.dir)
    } catch (error) {
      // A listed bundle can be removed before its path is resolved.
      this.ctx.logger('harmony-workspace').debug('Bundle detail image package no longer resolves: %s', error instanceof Error ? error.name : 'unknown error')
      return detailImageResponse(undefined, cacheControl)
    }
    const files = localFiles(directory, String(bundle.version))
    try {
      request.signal.throwIfAborted()
      const doc = await files.read(document, this.maxBytes, request.signal)
      if (doc === undefined || digest(markdownOf(doc)) !== receipt.digest) return detailImageResponse(undefined, cacheControl)
      request.signal.throwIfAborted()
      const bytes = await files.read(image.path, this.maxBytes, request.signal)
      request.signal.throwIfAborted()
      return detailImageResponse(bytes === undefined ? undefined : { bytes, mediaType: image.mediaType }, cacheControl)
    } catch (error) {
      if (error instanceof DetailFailure) return detailImageResponse(error.reason, cacheControl)
      throw error
    }
  }
}
