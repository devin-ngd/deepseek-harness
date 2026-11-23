/** Names of generated entries left in removed package directories. */

const generatedPackageEntries = new Set(['node_modules', 'lib', '.typecheck'])

/**
 * Identify entries the repository cleaner treats as generated package residue.
 * @param entry - Name immediately inside a package directory.
 * @returns Whether the entry is generated residue.
 */
export function isGeneratedPackageResidue(entry: string): boolean {
  return generatedPackageEntries.has(entry) || entry.endsWith('.tsbuildinfo')
}
