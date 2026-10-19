/** Copy the owning primitive wire schema verbatim to ArkTS; no handwritten diagnostic limits. */
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const source = await readFile('src/wire-fields.ts', 'utf8')
const target = 'harmony/entry/src/main/ets/generated/WireFields.ets'
await writeFile(target, source)
await writeFile('evidence/phase27-wire-schema.json', JSON.stringify({ source: 'src/wire-fields.ts', target, verbatim: true, sha256: createHash('sha256').update(source).digest('hex') }, null, 2) + '\n')
