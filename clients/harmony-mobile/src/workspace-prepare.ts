/** Native startup verifies an authorized fresh workspace before any cached frontend can run. */
import { workspaceBodySchema, workspaceShellManifestSchema } from './workspace-protocol.ts'
import { readWorkspaceBytes, type WorkspaceBytePorts } from './workspace-bytes.ts'

/** @param ports - original admitted native carrier. @param limits - resource assembly capacities. @returns the validated inventory after explicitly opening or reopening the Host generation. */
export async function prepareWorkspace(ports: WorkspaceBytePorts, limits: { readonly maxBytes: number; readonly maxChunkBytes: number }) {
  const bootstrap = workspaceBodySchema.parse(await ports.request({ operation: 'bootstrap' }))
  await ports.release({ operation: 'release', id: bootstrap.id })
  const descriptor = await ports.request({ operation: 'manifest' })
  const bytes = await readWorkspaceBytes(descriptor, ports, limits)
  return workspaceShellManifestSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
}
