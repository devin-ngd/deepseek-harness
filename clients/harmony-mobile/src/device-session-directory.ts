/** Desktop Session directory rows and list-management actions carried by the device carrier `metadata` and `manage` methods; no host path is carried. */
import { z } from 'zod'
import { creationModelSelectionSchema } from './session-creation.ts'

const identifier = z.string().min(1).max(256)
/** One visible desktop Session. Desktops before directory state send only the first four fields; readers default the rest to an idle, unpinned, unarchived, non-blank row with unknown activity time. */
export const deviceSessionRowSchema = z.object({
  profileId: z.literal('desktop'), sessionId: identifier, title: z.string(), projectId: z.string().max(256).nullable(),
  updatedAt: z.number().int().nonnegative().default(0), running: z.boolean().default(false), pinned: z.boolean().default(false), archived: z.boolean().default(false), blank: z.boolean().default(false),
}).strict()
/** Sanitized visible Session row from the desktop profile; `updatedAt` is epoch milliseconds and 0 when unknown. */
export type DeviceSessionRow = Readonly<z.output<typeof deviceSessionRowSchema>>
/** One desktop project (workspace) by opaque id and title; its directory path is never carried. */
export const deviceProjectRowSchema = z.object({ projectId: identifier, title: z.string() }).strict()
/** Desktop project row available for grouping and new Session placement. */
export type DeviceProjectRow = Readonly<z.output<typeof deviceProjectRowSchema>>
/** Current directory; `projects` is null when the desktop predates list management, which also means it rejects `manage`. */
export interface DeviceSessionDirectory { readonly sessions: readonly DeviceSessionRow[]; readonly projects: readonly DeviceProjectRow[] | null }
/** Phone list-management intent: create a blank Session (in a project or the desktop default directory), or change one visible Session's archive or pin state. No model step starts. */
export const deviceSessionActionSchema = z.union([
  z.object({ action: z.literal('create'), projectId: identifier.nullable(),
    agentPreset: identifier.optional(), model: creationModelSelectionSchema.optional() }).strict(),
  z.object({ action: z.enum(['archive', 'unarchive', 'pin', 'unpin']), sessionId: identifier }).strict(),
])
/** Parsed list-management intent. */
export type DeviceSessionAction = z.output<typeof deviceSessionActionSchema>
/** Acknowledgement naming the created or changed Session. */
export const deviceSessionManagedSchema = z.object({ sessionId: identifier }).strict()
const metadataSchema = z.object({ desktopId: identifier, profileId: z.literal('desktop'), sessions: z.array(deviceSessionRowSchema), projects: z.array(deviceProjectRowSchema).optional() }).strict()
/**
 * @param candidate - decrypted carrier `metadata` result.
 * @param desktopId - desktop the verified channel belongs to.
 * @returns directory with unique Session ids; rejects another desktop's catalogue.
 */
export function deviceSessionDirectory(candidate: unknown, desktopId: string): DeviceSessionDirectory {
  const value = metadataSchema.parse(candidate)
  if (value.desktopId !== desktopId) throw new Error('device catalogue identity denied')
  if (new Set(value.sessions.map(row => row.sessionId)).size !== value.sessions.length) throw new Error('device duplicate catalogue row')
  return { sessions: value.sessions, projects: value.projects ?? null }
}
