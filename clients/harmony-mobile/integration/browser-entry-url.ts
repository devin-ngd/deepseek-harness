/** Collect the standard profile's browser entry for a synthetic test world. */
import type { Context } from '@deepseek-ai/cordis'
import type { WebEntryUrl } from '@deepseek-ai/dsh-host-webserver'

/**
 * @param ctx - Isolated host context with the standard token provider.
 * @param baseUrl - The fixture web server's loopback entry URL.
 * @returns The browser entry published by the token provider.
 */
export function browserEntryUrl(ctx: Context, baseUrl: string): string {
  const entries: WebEntryUrl[] = []
  ctx.emit(ctx.webServer, 'webserver/entry-url', baseUrl, entries)
  const entry = entries.find(candidate => candidate.open && candidate.label === 'dsh web')
  if (entry === undefined) throw new Error('Standard token provider did not publish a browser entry')
  return entry.url
}
