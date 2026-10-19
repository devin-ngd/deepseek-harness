/** Strict source-only checking of changed shared parser/facade and their imports; emits no application or earlier evidence. */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { projectionPaths } from './projection-source.mjs'
const client = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), ts = require('typescript')
const raw = { extends: join(root, 'tsconfig.base.json'), compilerOptions: { noEmit: true, composite: false, incremental: false, declaration: false, declarationMap: false, sourceMap: false, strict: true, jsx: 'react-jsx', typeRoots: [join(root, 'node_modules/@types')], paths: await projectionPaths(client, root), noUnusedLocals: true, noUnusedParameters: true }, files: ['src/first-use-protocol.ts', 'src/native-product-facade.ts'].map(path => join(client, path)), references: ['cordis', 'cosmokit', 'schemastery'].map(name => ({ path: join(root, 'vendor', name) })) }
const parsed = ts.parseJsonConfigFileContent(raw, ts.sys, client), program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences }), diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
await writeFile('evidence/phase56-parser-typecheck.json', JSON.stringify({ at: new Date().toISOString(), rootFiles: raw.files, strict: true, noEmit: true, diagnosticCount: diagnostics.length, exitCode: diagnostics.length ? 1 : 0 }, null, 2) + '\n')
if (diagnostics.length) { process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => client, getCanonicalFileName: value => value, getNewLine: () => '\n' })); process.exitCode = 1 } else console.log('PASS: changed parser/facade and imported source graph under strict TypeScript')
