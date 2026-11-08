/** Virtual ArkWeb origin separates persisted Web UI state for each original desktop identity. */
import { z } from 'zod'
const fingerprint = z.string().regex(/^p256-sha256-[a-f0-9]{64}$/)
/** @param desktopCredentialId - verified original desktop fingerprint. @returns an identity-partitioned reserved HTTPS origin; the desktop profile is fixed by the device protocol. */
export function deviceWorkspaceOrigin(desktopCredentialId: string): string {
  const digest = fingerprint.parse(desktopCredentialId).slice('p256-sha256-'.length)
  return 'https://d-' + digest.slice(0, 32) + '.' + digest.slice(32) + '.desktop.workspace.dsh.invalid'
}
