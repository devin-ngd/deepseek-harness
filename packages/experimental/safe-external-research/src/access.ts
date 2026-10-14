/** Anonymous bounded retrieval whose model interface accepts only source ids. @module dsh-experimental-safe-external-research/access */

import { parse } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'
import { HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http'
import type { WebFetchProvider } from '@deepseek-ai/dsh-web'
import { inertText, ResearchError, sourceUrl, withinSource } from './policy.ts'
import type { ResearchAudit, ResearchConfig, ResearchRequest } from './types.ts'

/**
 * Convert HTML to inert text and collect links without fetching any resource.
 * @param html - bounded response body.
 * @returns text and candidate source links.
 */
export function extractHtml(html: string): { text: string; links: string[] } {
  const root = parse(html)
  const stack: DefaultTreeAdapterMap['node'][] = [root]
  const text: string[] = []
  const links: string[] = []
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if ('tagName' in node) {
      if (['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript'].includes(node.tagName)) continue
      if (node.attrs.some(attr => attr.name === 'hidden' || (attr.name === 'aria-hidden' && attr.value === 'true'))) continue
      if (node.tagName === 'a') {
        const href = node.attrs.find(attr => attr.name === 'href')?.value
        if (href !== undefined) links.push(href)
      }
    }
    if ('value' in node) text.push(node.value)
    if ('childNodes' in node) stack.push(...node.childNodes.toReversed())
  }
  return { text: inertText(text.join(' ').replace(/\s+/gu, ' ').trim()), links }
}

/** Per-operation access owner; it cannot receive model-authored URLs, headers or queries. */
export class ResearchAccess {
  /** Successful read locations eligible for result citations. */
  readonly reads = new Map<string, { url: string; locator: string }>()
  private readonly sources = new Map<string, string>()
  private readonly bounds: URL[]
  private count = 0
  private searched = false
  private readonly provider: WebFetchProvider

  constructor(
    private readonly config: ResearchConfig,
    private readonly request: ResearchRequest,
    private readonly signal: AbortSignal,
    private readonly audit: (record: ResearchAudit) => void,
    provider?: WebFetchProvider,
  ) {
    const deploymentBounds = config.allowedSources.map(sourceUrl)
    this.bounds = request.sources.map(sourceUrl)
    if (this.bounds.some(url => !deploymentBounds.some(prefix => withinSource(url, prefix)))) {
      throw new ResearchError('RESEARCH_SOURCE_SCOPE')
    }
    for (const url of this.bounds) this.addSource(url.href)
    this.provider = provider ?? new HttpFetchProvider({
      maxResponseBytes: config.maxResponseBytes, maxBodyChars: config.maxResponseBytes,
      timeoutMs: config.timeoutMs, maxRedirects: 0, directOnly: true, userAgent: 'DSH-public-research/1',
    })
  }

  /** Return host-approved source ids without response bodies.
   * @returns Current source inventory.
   */
  inventory(): { id: string; url: string }[] {
    return [...this.sources].map(([id, url]) => ({ id, url }))
  }

  private addSource(url: string): void {
    if (this.sources.size >= 12 || [...this.sources.values()].includes(url)) return
    this.sources.set(`s${this.sources.size + 1}`, url)
  }

  private checkActive(): void {
    if (this.signal.aborted) throw new ResearchError('RESEARCH_CANCELLED')
  }

  private record(operation: 'read' | 'search', target: string, code: string): void {
    this.audit({ operation, target, code, protection: 'research-tool-policy' })
  }

  private async fetch(url: URL, operation: 'read' | 'search'): Promise<{ text: string; links: string[] }> {
    // Search query values never enter the audit record.
    const target = `${url.origin}${url.pathname}`
    try {
      this.checkActive()
      if (++this.count > this.request.budget.reads) throw new ResearchError('RESEARCH_BUDGET')
      const response = await this.provider.fetch({ url: url.href }, this.signal)
      this.checkActive()
      if (response.url !== url.href || response.statusCode < 200 || response.statusCode >= 300) throw new ResearchError('RESEARCH_RESPONSE')
      if (response.truncated || Buffer.byteLength(response.body.content, 'utf8') > this.config.maxResponseBytes) throw new ResearchError('RESEARCH_RESPONSE_SIZE')
      const body = response.body.kind === 'html'
        ? extractHtml(response.body.content) : { text: inertText(response.body.content), links: [] }
      if (Buffer.byteLength(body.text, 'utf8') > this.config.maxResponseBytes) throw new ResearchError('RESEARCH_RESPONSE_SIZE')
      this.record(operation, target, 'READ')
      return body
    } catch (error: unknown) {
      const code = error instanceof ResearchError ? error.code : this.signal.aborted ? 'RESEARCH_CANCELLED' : 'RESEARCH_FETCH_FAILED'
      this.record(operation, target, code)
      throw new ResearchError(code)
    }
  }

  /**
   * Read one approved source; unknown ids never reach the transport.
   * @param id - host-minted source id.
   * @returns inert content and host-owned citation data.
   */
  async read(id: string): Promise<{ id: string; url: string; locator: string; text: string }> {
    const url = this.sources.get(id)
    if (url === undefined) throw new ResearchError('RESEARCH_SOURCE_ID')
    const { text } = await this.fetch(sourceUrl(url), 'read')
    const locator = 'Retrieved document text'
    this.reads.set(id, { url, locator })
    return { id, url, locator, text }
  }

  /**
   * Search once with the original public question; only in-scope links become readable.
   * @returns updated source inventory; search snippets are not evidence for claims.
   */
  async search(): Promise<{ id: string; url: string }[]> {
    if (!this.request.search || this.searched || !this.config.searchUrl) throw new ResearchError('RESEARCH_SEARCH_DISABLED')
    this.searched = true
    const url = sourceUrl(this.config.searchUrl)
    url.searchParams.set(this.config.searchQueryKey, this.request.question)
    const body = await this.fetch(url, 'search')
    for (const href of body.links) {
      let candidate: URL
      try { candidate = sourceUrl(new URL(href, url).href) } catch (_error: unknown) {
        continue // Search providers also link to settings, accounts and unsupported query URLs.
      }
      if (this.bounds.some(prefix => withinSource(candidate, prefix))) this.addSource(candidate.href)
    }
    return this.inventory()
  }
}
