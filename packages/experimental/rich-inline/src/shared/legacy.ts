/** Identify substantial prose for compatible presentation; code examples retain their source UI. */

/** Qualify long structured prose without changing ordinary code examples.
 * @param text - settled assistant text.
 * @returns whether a long structured answer can use the HTML prose presentation.
 */
export function legacyEligible(text: string): boolean {
  return text.length >= 600 && text.length <= 524288 && !text.includes('```') && /(^|\n)(#{1,6}\s|[-*]\s|\d+\.\s|\|)/u.test(text)
}
