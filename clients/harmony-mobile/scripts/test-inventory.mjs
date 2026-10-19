/** Enumerate executable test registrations, including literal Vitest tables; fail on unclassified files or lost historical cases. */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const source = JSON.parse(await readFile('source.json', 'utf8')), require = createRequire(resolve(source.dshRoot, 'package.json')), ts = require('typescript')
const cases = (name, text) => {
  const found = [], file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true)
  const visit = node => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && ['test', 'it'].includes(node.expression.text) && ts.isStringLiteral(node.arguments[0])) found.push(node.arguments[0].text)
      if (ts.isCallExpression(node.expression) && ts.isPropertyAccessExpression(node.expression.expression) && node.expression.expression.name.text === 'each') {
        const values = node.expression.arguments[0], title = node.arguments[0]
        if (!ts.isArrayLiteralExpression(values) || !ts.isStringLiteral(title)) throw new Error('Unclassified test table: ' + name)
        for (const value of values.elements) { if (!ts.isStringLiteral(value)) throw new Error('Nonliteral test table: ' + name); found.push(title.text.replace('%s', value.text)) }
      }
    }
    ts.forEachChild(node, visit)
  }; visit(file); return found
}
const files = []
for (const directory of ['tests', 'integration', 'network-tests']) {
  for (const name of (await readdir(directory)).sort()) {
    if (!/(\.test\.mjs|\.spec\.ts)$/.test(name)) continue
    const path = directory + '/' + name, content = await readFile(path, 'utf8')
    const layer = directory === 'tests' ? 'node' : name.endsWith('.test.mjs') ? 'embedded-child' : directory === 'integration' ? 'source-replay' : 'bff-replay'
    const tests = cases(path, content); if (tests.length === 0) throw new Error('Unclassified test file: ' + path)
    files.push({ path, layer, tests, count: tests.length, sha256: createHash('sha256').update(content).digest('hex') })
  }
}
const archives = JSON.parse(await readFile('.build/continuity-archives.json', 'utf8')), continuity = []
const retirements = []
for (const archive of archives) {
  const changed = [], unchanged = [], missing = [], lostCases = [], historicalFiles = []
  for (const file of archive.files) {
    let current
    try { current = await readFile(file.path) } catch (error) { if (error.code !== 'ENOENT') throw error; missing.push(file.path); continue }
    const hash = createHash('sha256').update(current).digest('hex'); (hash === file.sha256 ? unchanged : changed).push(file.path)
    if (file.testSource !== null) {
      const tests = cases(file.path, file.testSource), now = files.find(item => item.path === file.path)
      historicalFiles.push({ path: file.path, count: tests.length })
      for (const title of tests) if (!now?.tests.includes(title)) lostCases.push({ path: file.path, title })
    }
  }
  continuity.push({ version: archive.version, archive: archive.path, archiveSha256: archive.sha256, historicalFiles, unchanged, changed, missing, lostCases })
}
const result = { schema: 'harmony-test-inventory/1', sourceTree: resolve('.'), sourceRoot: source.dshRoot, files, continuity, retirements,
  counts: Object.fromEntries(['node', 'source-replay', 'bff-replay', 'embedded-child'].map(layer => [layer, files.filter(file => file.layer === layer).reduce((sum, file) => sum + file.count, 0)])),
  counting: 'Distinct executable registrations by owning layer. Embedded child tests are already exercised by BFF parents. Chrome assertion groups are separate; historical phases are subsets, not additive totals.' }
await writeFile('evidence/test-inventory.json', JSON.stringify(result, null, 2) + '\n')
if (continuity.some(row => row.missing.length > 0 || row.lostCases.length > 0)) throw new Error('Historical files/cases lost; explicit reviewed retirement required; see test-inventory.json')
console.log('PASS: v1-v6 continuity; no retired or lost cases; current counts ' + JSON.stringify(result.counts))
