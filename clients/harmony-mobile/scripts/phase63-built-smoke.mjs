/** Qualify the emitted projection subpath under plain Node and a browser bundle; never opens a listener or native key. */
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const project = resolve(import.meta.dirname, '..'), spec = JSON.parse(await readFile(join(project, 'projection-source.json'), 'utf8')), root = JSON.parse(await readFile(join(project, 'source.json'), 'utf8')).dshRoot
const entry = join(spec.checkout, 'packages/experimental/rich-inline/lib/types/shared/message-projections.js')
const library = await import(pathToFileURL(entry).href), digest = text => createHash('sha256').update(text).digest('hex')
assert.equal(library.createRichSourceProjection(digest).type, 'rich-inline/source-offload')
assert.equal(library.createRichToolSourceProjection(digest).type, 'rich-inline/tool-offload')
assert.equal(library.richProjectionHistoryStart([]), null)
const require = createRequire(join(root, 'package.json')), esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
const output = join(project, '.build/phase63-published-projections.js'), built = await esbuild.build({ entryPoints: [entry], outfile: output, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', metafile: true })
assert.deepEqual(Object.values(built.metafile.outputs).flatMap(value => value.imports), [])
assert.equal(Object.keys(built.metafile.inputs).some(path => path.includes('dsh-harmony-upstream-v15')), false)
const before = JSON.parse(await readFile(join(project, 'evidence/phase63-core-build.json'), 'utf8')), after = JSON.parse(await readFile(join(project, 'evidence/phase63-core-build-verified.json'), 'utf8'))
assert.deepEqual(before.reports.map(value => value.sha256), after.reports.map(value => value.sha256))
const bytes = await readFile(output)
await writeFile(join(project, 'evidence/phase63-built-smoke.json'), JSON.stringify({ at: new Date().toISOString(), entry, plainNodeImportPassed: true, browserBundled: true, browserExternalImports: [], bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), candidateRuntimesUnchanged: true, arkWebExecuted: false, signed: false, installed: false }, null, 2) + '\n')
console.log('PASS: emitted library under Node/browser; no old projection or external host import; candidate runtime bytes unchanged')
