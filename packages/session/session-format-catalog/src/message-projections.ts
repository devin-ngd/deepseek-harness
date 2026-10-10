/** Pure first-party message interpreters for detached current-format replay, including browser readers. */

import { imageOffloadProjection } from '@deepseek-ai/dsh-compaction-image-offload/projection'
import type { SessionMessageProjection } from '@deepseek-ai/dsh-session/surface'
export { imageOffloadProjection }

const definitions: SessionMessageProjection[] = [imageOffloadProjection]
const registrations = new Map<SessionMessageProjection, number>()
/** Installed interpretation definitions; recovery listeners are mounted separately by their owning plugins. */
export const currentSessionMessageProjections: readonly SessionMessageProjection[] = definitions

/**
 * Keep an optional plugin's pure interpretation available during detached format validation.
 * The caller owns disposal; registration confers no Session access or action authority.
 * @param projection - owning plugin's interpretation definition, shared across its fibers.
 * @returns idempotent disposer; the final owner removes its definition.
 * @throws when a different definition already interprets this event type.
 */
export function registerCurrentSessionMessageProjection(projection: SessionMessageProjection): () => void {
  const existing = definitions.find(item => item.type === projection.type)
  if (existing !== undefined && existing !== projection) throw new Error(`current message projection "${projection.type}" is already registered`)
  if (existing === undefined) definitions.push(projection)
  registrations.set(projection, (registrations.get(projection) ?? 0) + 1)
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    const remaining = (registrations.get(projection) ?? 1) - 1
    if (remaining > 0) registrations.set(projection, remaining)
    else {
      registrations.delete(projection)
      if (projection !== imageOffloadProjection) definitions.splice(definitions.indexOf(projection), 1)
    }
  }
}
