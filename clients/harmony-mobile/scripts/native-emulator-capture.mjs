/** Capture only the owned emulator's synthetic layout and specified screenshot directory; no device commands or private paths. */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

const label = process.argv[2]
if (!label || !/^[a-z0-9-]{1,64}$/.test(label)) throw new Error('A bounded owned evidence label is required')
const instance = 'D:/Temp/dsh-harmony-hvd-api26-20261011/DSHOfflineAPI26'
const output = resolve('evidence/native-emulator', label)
await mkdir(output, { recursive: true })
const hashes = {}
for (const name of ['analysis.md', 'analysis_result.json', 'widget_tree.json']) {
  const bytes = await readFile(join(instance, 'uiLayout', name))
  hashes[name] = createHash('sha256').update(bytes).digest('hex')
  await writeFile(join(output, name), bytes.toString('utf8').replaceAll('\r\n', '\n').trimEnd() + '\n')
}
const screenshotDir = process.argv[3]
if (screenshotDir !== undefined) {
  const path = resolve(screenshotDir)
  if (!path.startsWith(resolve('D:/Temp/dsh-harmony-emulator-acceptance-20261011') + '\\')) throw new Error('Screenshot directory must be within this task acceptance directory')
  for (const name of await readdir(path)) {
    if (!/^Screenshot_[0-9T-]+\.png$/.test(name)) continue
    let bytes
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate = await readFile(join(path, name))
      if (candidate.length >= 32 && candidate.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && candidate.subarray(-12).toString('hex') === '0000000049454e44ae426082') { bytes = candidate; break }
      await delay(50)
    }
    if (bytes === undefined) throw new Error('Emulator screenshot PNG is incomplete: ' + name)
    hashes[name] = createHash('sha256').update(bytes).digest('hex')
    await writeFile(join(output, name), bytes)
  }
}
await writeFile(join(output, 'capture.json'), JSON.stringify({ capturedAt: new Date().toISOString(), emulator: 'DSHOfflineAPI26', originalHashes: hashes, textNormalizedToLF: true, syntheticOnly: true }, null, 2) + '\n')
console.log(JSON.stringify({ output, files: Object.keys(hashes) }))
