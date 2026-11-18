/** Local build outputs and copied mobile handoff inputs are not maintained source. */

/**
 * Identify generated trees that may contain copied source, binary files, or historical evidence.
 * @param file - Repository-relative path with forward slashes.
 * @returns Whether the path belongs to a local generated artifact tree.
 */
export function isLocalGeneratedArtifact(file: string): boolean {
  if (file.startsWith('.build/')) return true
  const prefix = 'clients/harmony-mobile/handoff/'
  if (!file.startsWith(prefix)) return false
  const handoff = file.slice(prefix.length)
  return /^deploy-[^/]+\/profile-backup[^/]*\//u.test(handoff)
    || /^standard-plugin-workspace\/source-(?:candidates|fixes)-[^/]+\//u.test(handoff)
    || /^standard-plugin-workspace\/desktop-command-[^/]+\/validation-[^/]+\/sources\//u.test(handoff)
    || /^standard-plugin-workspace\/review-[^/]+\/official-plugin-[^/]+\/official-packages\//u.test(handoff)
    || /^(?:device-native-|workspace-)[^/]+\/documentation\//u.test(handoff)
    || /^workspace-admission-[^/]+\/inputs\//u.test(handoff)
}
