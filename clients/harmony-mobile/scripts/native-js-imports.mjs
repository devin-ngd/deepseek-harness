/** Verify the actual compiler output imports the default native util module, rather than an unexpanded Kit name. */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join, relative, isAbsolute } from 'node:path'
const root = JSON.parse(await readFile(new URL('../source.json', import.meta.url), 'utf8')).dshRoot, ts = createRequire(join(root, 'package.json'))('typescript')
/** @param {string} source Compiled native JavaScript core. @param {string} label Public file label for actionable failures. @returns {object} Confirmed SDK module and binding. */
export function auditNativeCoreImports(source, label) {
  const file = ts.createSourceFile(label, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS), imports = []
  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) throw new Error('Compiled native core must bundle re-exports: ' + label)
    if (!ts.isImportDeclaration(statement)) continue
    const module = statement.moduleSpecifier.text, clause = statement.importClause
    if (module !== '@ohos:util' || !clause?.name || clause.namedBindings) throw new Error('Compiled native core requires default @ohos:util; inspect JavaScript SDK import: ' + label)
    imports.push({ module, binding: 'default' })
  }
  if (imports.length !== 1) throw new Error('Compiled native core must import native util exactly once: ' + label)
  return { file: label, ...imports[0] }
}
/** @param {string} native Isolated unsigned project root. @param {string[]} expected Core filenames required by the selected application. @returns {Promise<object>} Verified compiler-recorded JavaScript imports. */
export async function verifyNativeJsImports(native, expected) {
  const cache = resolve(native, 'entry/build/default/cache/default/default@CompileArkTS/esmodule/debug'), lines = (await readFile(join(cache, 'filesInfo.txt'), 'utf8')).split(/\r?\n/), records = [], found = new Set()
  for (const line of lines.filter(line => /(?:ProductCore|PairedCore)\.js;/.test(line))) {
    const path = resolve(line.split(';')[0]), delta = relative(cache, path)
    if (delta.startsWith('..') || isAbsolute(delta)) throw new Error('Compiled native core path is outside its cache')
    const label = path.replaceAll('\\', '/').split('/').at(-1); if (found.has(label)) throw new Error('Duplicate compiled native core record: ' + label)
    found.add(label); records.push(auditNativeCoreImports(await readFile(path, 'utf8'), label))
  }
  for (const label of expected) if (!found.has(label)) throw new Error('Required native core was not compiled: ' + label)
  return { passed: true, records }
}
