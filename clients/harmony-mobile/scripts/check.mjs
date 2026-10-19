/** Offline source-linked TypeScript check and deterministic build; installs nothing. */
import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { projectionPaths, projectionTsconfig } from './projection-source.mjs'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(await readFile(join(project, 'source.json'), 'utf8'))
const root = resolve(config.dshRoot)
const require = createRequire(join(root, 'package.json'))
const ts = require('typescript')
const includeIntegration = process.argv.includes('--integration')
await mkdir(join(project, '.build'), { recursive: true })
const checkPath = join(project, '.build', 'tsconfig.check.json')
await writeFile(checkPath, JSON.stringify({
  extends: join(root, 'tsconfig.base.json'),
  compilerOptions: { noEmit: true, composite: false, incremental: false, declaration: false,
    declarationMap: false, sourceMap: false, strict: true, jsx: 'react-jsx',
    typeRoots: [join(root, 'node_modules', '@types')], paths: await projectionPaths(project, root), noUnusedLocals: true, noUnusedParameters: true },
  include: [join(project, 'src', '**', '*.ts'), ...(includeIntegration ? [join(project, 'integration', '**', '*.ts'), join(project, 'network-tests', '**', '*.ts'), join(project, 'native-network-tests', '**', '*.ts'), join(project, 'desktop-plugin', 'src', '**', '*.ts')] : [])].map(path => path.replaceAll('\\', '/')),
  references: ['cordis', 'cosmokit', 'schemastery', ...(includeIntegration ? ['loader', 'include', 'group'] : [])].map(name => ({ path: join(root, 'vendor', name) })),
}, null, 2) + '\n')
const raw = ts.readConfigFile(checkPath, ts.sys.readFile)
if (raw.error) throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, dirname(checkPath))
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences })
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
if (diagnostics.length > 0) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => project, getCanonicalFileName: x => x, getNewLine: () => '\n',
  }))
  process.exitCode = 1
} else {
  const hashes = {}
  const emit = async (source, destination) => {
    const text = await readFile(source, 'utf8')
    const result = ts.transpileModule(text, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      rewriteRelativeImportExtensions: true, verbatimModuleSyntax: false,
    }, fileName: source })
    await writeFile(destination, result.outputText)
    hashes[source] = createHash('sha256').update(text).digest('hex')
  }
  for (const name of await readdir(join(project, 'src'))) {
    if (name.endsWith('.ts') && !['upstream.ts', 'upstream-stream.ts', 'upstream-domain.ts'].includes(name)) await emit(join(project, 'src', name), join(project, '.build', name.replace(/\.ts$/, '.js')))
  }
  const rich = join(root, 'packages', 'experimental', 'rich-inline', 'src')
  for (const [source, target] of [['shared/validate.ts', 'upstream-validate.js'], ['shared/theme.ts', 'upstream-theme.js'], ['client/guest-sdk.ts', 'upstream-guest-sdk.js']]) {
    await emit(join(rich, source), join(project, '.build', target))
  }
  await emit(join(root, 'vitest.shared.ts'), join(project, '.build', 'upstream-vitest-shared.js'))
  await writeFile(join(project, '.build', 'upstream.js'), "export { isRichJson, parseActionRequest, parseInvokeRequest, parseSaveDraftRequest } from './upstream-validate.js';\n")
  const esbuild = require(require.resolve('esbuild', { paths: [join(root, 'node_modules/.pnpm')] }))
  const domainBuild = await esbuild.build({ entryPoints: [join(project, 'src/upstream-domain.ts')], outfile: join(project, '.build/upstream-domain.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', tsconfig: await projectionTsconfig(project, root), absWorkingDir: root, metafile: true })
  for (const input of Object.keys(domainBuild.metafile.inputs)) { const path = resolve(root, input); hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex') }
  await emit(join(root, 'packages/typert/protocol/src/json-value.ts'), join(project, '.build', 'upstream-remote-json.js'))
  await emit(join(root, 'packages/api/gateway/src/stream-protocol.ts'), join(project, '.build', 'upstream-stream-protocol.js'))
  const streamPath = join(project, '.build', 'upstream-stream-protocol.js')
  await writeFile(streamPath, (await readFile(streamPath, 'utf8')).replace("from '@deepseek-ai/dsh-typert-protocol'", "from './upstream-remote-json.js'"))
  await writeFile(join(project, '.build', 'upstream-stream.js'), "export { parseRemoteStreamServerMessage } from './upstream-stream-protocol.js';\n")
  await emit(join(rich, 'shared', 'limits.ts'), join(project, '.build', 'upstream-limits.js'))
  await emit(join(rich, 'shared', 'authored.ts'), join(project, '.build', 'upstream-authored.js'))
  const authoredPath = join(project, '.build', 'upstream-authored.js')
  await writeFile(authoredPath, (await readFile(authoredPath, 'utf8')).replace(/from (['"])\.\/validate\.js\1/, "from './upstream-validate.js'").replace(/from (['"])\.\/limits\.js\1/, "from './upstream-limits.js'"))
  for (const source of [join(rich, 'shared', 'types.ts'), join(root, 'packages/api/session-controller/src/types.ts'), join(root, 'packages/core/session/src/types.ts'), join(project, 'src/upstream.ts')]) {
    hashes[source] = createHash('sha256').update(await readFile(source)).digest('hex')
  }
  await writeFile(join(project, '.build', 'source-hashes.json'), JSON.stringify(hashes, null, 2) + '\n')
  console.log(`PASS: strict TypeScript ${ts.version}; ${parsed.fileNames.length} lab/integration modules; canonical source imports`)
}
