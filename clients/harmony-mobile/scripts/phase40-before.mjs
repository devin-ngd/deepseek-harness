/** Save local preimages only; preserve every sealed predecessor and installed/server file. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
const files = ['README.md', 'docs/acceptance.md', 'docs/tasks.md', 'standalone-relay/README.md', 'standalone-relay/src/broker-policy.ts', 'standalone-relay/src/config.ts', 'standalone-relay/src/main.ts', 'desktop-plugin/src/index.ts', 'desktop-plugin/README.md', 'harmony/entry/src/main/ets/native/NativeRelaySocket.ets', 'scripts/build-native.mjs']
for (const file of files) { const target = '.build/phase40-before/' + file; await mkdir(dirname(target), { recursive: true }); await writeFile(target, await readFile(file), { flag: 'wx' }) }
console.log('PASS: scoped Phase40 preimages saved')
