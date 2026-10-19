/** Strictly check every replay-profile source with the same canonical aliases as the mobile integration program. */
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { projectionPaths } from './projection-source.mjs'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot
const require = createRequire(join(root, 'package.json')), ts = require('typescript')
const base = JSON.parse(await readFile('.build/tsconfig.check.json', 'utf8'))
const path = resolve('.build/phase66-profile-tsconfig.json')
const config = { ...base, compilerOptions: { ...base.compilerOptions, paths: await projectionPaths(project, root) }, include: [join(project, 'replay-profile/src/**/*.ts').replaceAll('\\', '/')] }
await writeFile(path, JSON.stringify(config, null, 2) + '\n')
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, project)
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences })
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
if (diagnostics.length) process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => project, getCanonicalFileName: value => value, getNewLine: () => '\n' }))
const report = { at: new Date().toISOString(), strict: true, sourceModules: parsed.fileNames.length, errors: diagnostics.length, passed: diagnostics.length === 0, noEmit: true, realModels: 0 }
await writeFile('evidence/phase66-profile-typecheck.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report)); if (diagnostics.length) process.exitCode = 1
