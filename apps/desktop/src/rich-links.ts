/** Browser-safe link validation shared by the isolated controls and the native opener. */

/** @param value - untrusted destination. @returns a bounded web/email URL, never a path or executable scheme. */
export function richExternalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192 || /[\u0000-\u001f\u007f]/u.test(value)) return undefined
  let url: URL
  try { url = new URL(value) }
  catch (_error) { return undefined /* A relative path is not an external browser destination. */ }
  if (!['https:', 'http:', 'mailto:'].includes(url.protocol) || url.username || url.password) return undefined
  if (url.protocol === 'mailto:' && !url.pathname) return undefined
  return url.href
}
