/** Reject stale generated ArkTS before SDK compilation; this check never generates or changes files. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
/** @param sourceRoot - owning client sources. @param nativeRoot - default or staged HAP sources. @returns after exact primitive schema equality; mismatches throw before the build starts. */
export async function verifyWireFields(sourceRoot, nativeRoot) {
  if (await readFile(join(sourceRoot, 'src/wire-fields.ts'), 'utf8') !== await readFile(join(nativeRoot, 'entry/src/main/ets/generated/WireFields.ets'), 'utf8')) {
    throw new Error('Generated ArkTS wire validation differs from the owning protocol source; regenerate before building.')
  }
}
