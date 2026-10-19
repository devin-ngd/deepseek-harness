/** Run the official export-doc rule over complete copies of the two changed packages. */
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { collectExportJsdocViolations } from '../../../scripts/verify-export-jsdoc.ts'
import { projectionPaths } from './projection-source.mjs'
const project = resolve(import.meta.dirname, '..'), checkout = 'D:/Temp/dsh-harmony-alpha4-source-20261016', root = JSON.parse(await readFile(join(project, 'source.json'), 'utf8')).dshRoot, scan = join(project, '.build/phase63-doc-scope')
await mkdir(scan, { recursive: true })
for (const directory of ['packages/experimental/rich-inline', 'packages/typert/registry']) {
  await mkdir(join(scan, directory), { recursive: true })
  await cp(join(checkout, directory, 'src'), join(scan, directory, 'src'), { recursive: true })
  await cp(join(checkout, directory, 'package.json'), join(scan, directory, 'package.json'))
}
await writeFile(join(scan, 'tsconfig.base.json'), JSON.stringify({ extends: join(root, 'tsconfig.base.json'), compilerOptions: { paths: await projectionPaths(project, root) } }, null, 2) + '\n')
const findings = collectExportJsdocViolations(scan)
await writeFile(join(project, 'evidence/phase63-focused-export-docs.json'), JSON.stringify({ at: new Date().toISOString(), checker: 'scripts/verify-export-jsdoc.ts', packages: ['experimental/rich-inline', 'typert/registry'], findings, pass: findings.length === 0, entireRepository: false }, null, 2) + '\n')
if (findings.length > 0) { console.error(findings.join('\n')); process.exitCode = 1 } else console.log('PASS: official export-doc rule, both changed packages')
