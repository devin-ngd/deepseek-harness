/** Focused current-source check only; no profile, identity, model or remote access. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { projectionTsconfig } from './projection-source.mjs'
const project = resolve('.'), root = JSON.parse(await readFile('source.json', 'utf8')).dshRoot, require = createRequire(join(root, 'package.json')), ts = require('typescript')
const names = ['src/native-device-product.ts', 'src/mobile-device-product.ts', 'desktop-plugin/src/device-binding-command.ts', 'standalone-relay/src/first-use.ts', 'standalone-relay/src/prepare-public-config.ts', 'standalone-relay/src/application.ts', 'integration/device-binding.spec.ts', 'integration/connection-lifetime.spec.ts', 'integration/endpoint-timers.spec.ts']
const path = await projectionTsconfig(project, root), raw = ts.readConfigFile(path, ts.sys.readFile)
if (raw.error) throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, '\n'))
// Match the existing product check: consume the vendor projects' declared build
// outputs instead of compiling their independent source projects as client roots.
raw.config.references = ['cordis', 'cosmokit', 'schemastery', 'loader', 'include', 'group'].map(name => ({ path: join(root, 'vendor', name) }))
const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, dirname(path))
const program = ts.createProgram({ rootNames: names.map(name => resolve(name)), options: { ...parsed.options, strict: true, noEmit: true, composite: false, incremental: false }, projectReferences: parsed.projectReferences })
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
const result = { at: new Date().toISOString(), strict: true, passed: diagnostics.length === 0, names, diagnostics: diagnostics.map(item => ({ file: item.file?.fileName, code: item.code, message: ts.flattenDiagnosticMessageText(item.messageText, '\n') })), sourceInputs: await Promise.all(names.map(async name => ({ path: name, sha256: createHash('sha256').update(await readFile(name)).digest('hex') }))), installed: false, realIdentities: false, remote: false }
await mkdir('evidence', { recursive: true }); const report = 'evidence/connection-recovery-typecheck-' + Date.now() + '.json'; await writeFile(report, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ passed: result.passed, diagnostics: diagnostics.length, report }))
if (diagnostics.length) process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => project, getCanonicalFileName: value => value, getNewLine: () => '\n' }))
process.exitCode = result.passed ? 0 : 1
