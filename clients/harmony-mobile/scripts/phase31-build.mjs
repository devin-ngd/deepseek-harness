/** Bundle the unregistered source adapter and framework-only test helpers; source aliases preserve the source plane. */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { projectionTsconfig } from './projection-source.mjs'
const root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const require = createRequire(resolve(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [resolve(root, 'node_modules/.pnpm')] }))
await writeFile('.build/phase31-entry.ts', "export * from '../integration/profile-inactive-adapter.ts';\nexport { FollowJournal, MobileBffCore } from '../integration/mobile-bff.ts';\nexport { Context } from '@deepseek-ai/cordis';\nexport { scopeTarget } from '@deepseek-ai/dsh-scope';\n")
const result = await esbuild.build({ entryPoints: [resolve('.build/phase31-entry.ts')], outfile: resolve('.build/phase31-adapter.js'), bundle: true, format: 'esm', platform: 'node', target: 'es2022', metafile: true, tsconfig: await projectionTsconfig(resolve('.'), root), absWorkingDir: root })
const inputs = []
for (const name of Object.keys(result.metafile.inputs)) {
  const path = resolve(root, name), bytes = await readFile(path)
  if (/packages[\\/](llm|credentials|sdk)[\\/].*[\\/]src[\\/].*\.(ts|js)$/.test(path)) throw new Error('Execution/credential/SDK runtime entered source bundle')
  inputs.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') })
}
await writeFile('evidence/phase31-bundle-inputs.json', JSON.stringify({ sourcePlane: true, inputs, productRegistration: false, models: 0, listenerOpened: false }, null, 2) + '\n')
console.log('PASS: unregistered source adapter bundle; ' + inputs.length + ' inputs; no application runtime')
