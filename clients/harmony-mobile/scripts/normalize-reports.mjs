/** Normalize locally generated regression logs/reporter output only; historical phase1–5 artifacts and test results are unchanged. */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
let changed = 0
for (const directory of await readdir('evidence', { withFileTypes: true })) {
  if (!directory.isDirectory() || !directory.name.startsWith('regression-')) continue
  for (const name of await readdir(join('evidence', directory.name))) {
    if (!/\.(txt|json)$/.test(name)) continue
    const path = join('evidence', directory.name, name), original = await readFile(path, 'utf8'), normalized = original.replace(/\r\n/g, '\n').trimEnd() + '\n'
    if (original !== normalized) { await writeFile(path, normalized); changed++ }
  }
}
console.log('Normalized owned regression text reports: ' + changed)
