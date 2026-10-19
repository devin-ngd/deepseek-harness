/** Source-plane checking/build prep using installed compiler/ws only, without installation or network access. */
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { projectionPaths } from './projection-source.mjs'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), ts = require('typescript')
await mkdir('.build', { recursive: true })
const path = resolve('.build/phase36.tsconfig.json'), paths = await projectionPaths(project, root)
paths.ws = [join(root, 'node_modules/.pnpm/@types+ws@8.18.2/node_modules/@types/ws/index.d.ts')]
await writeFile(path, JSON.stringify({ extends: join(root, 'tsconfig.base.json'), compilerOptions: { paths, noEmit: true, composite: false, incremental: false, declaration: false, declarationMap: false, sourceMap: false, strict: true, jsx: 'react-jsx', noUnusedLocals: true, noUnusedParameters: true, typeRoots: [join(root, 'node_modules/@types')] }, include: ['src/**/*.ts', 'integration/**/*.ts', 'network-tests/**/*.ts', 'native-network-tests/**/*.ts', 'desktop-plugin/src/**/*.ts', 'relay-plugin/src/**/*.ts'].map(x => join(project, x).replaceAll('\\', '/')), references: ['cordis', 'cosmokit', 'schemastery', 'loader', 'include', 'group'].map(x => ({ path: join(root, 'vendor', x) })) }, null, 2) + '\n')
const raw = ts.readConfigFile(path, ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, resolve('.build')), program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences })
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
if (diagnostics.length) { process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => project, getCanonicalFileName: x => x, getNewLine: () => '\n' })); process.exitCode = 1 }
else console.log(`PASS: strict TypeScript ${ts.version}; ${parsed.fileNames.length} modules; no listener or real dispatch`)
