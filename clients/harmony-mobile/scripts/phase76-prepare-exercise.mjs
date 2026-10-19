/** Derive a closed phone exercise from the reviewed prior helper without retaining its old approval or entry path. */
import assert from 'node:assert/strict'
import { readFile, writeFile, copyFile } from 'node:fs/promises'
let text = await readFile('scripts/phase75-phone-exercise.mjs', 'utf8')
text = text.replace("import { createInterface } from 'node:readline/promises'\n", '').replace("import { verifyPackage } from '../.build/phase75.1-complete-operation-plan/cli.mjs'\n", '')
text = text.replaceAll("'../.build/phase75.1-complete-operation-plan/policy.mjs'", "'./policy.mjs'").replaceAll("'../.build/phase75.1-complete-operation-plan/local.mjs'", "'./local.mjs'").replace("'./phase68-connection-lines.mjs'", "'./connection-lines.mjs'")
text = text.replace("const root = PLAN.local.run, sealed = resolve('.build/phase75.1-complete-operation-plan')", 'const root = PLAN.local.run')
text = text.replace('export async function exercise(command) {', 'export async function exercise(command, approved, location, sealed) {')
const start = text.indexOf("  const approved = JSON.parse(await readFile('evidence/phase75.1-execution-approval.json'")
const end = text.indexOf('  const state = await desktopState(location)', start)
assert.ok(start > 0 && end > start)
text = text.slice(0, start) + "  reviewApprovalRecord(approved, hash(await readFile(join(sealed, 'plan.json'))), hash(await readFile(join(sealed, 'files.sha256.json'))))\n  assert.equal(JSON.parse(await readFile(join(root, 'operation.json'), 'utf8')).sourceHumanMessageId, approved.sourceHumanMessageId)\n" + text.slice(end)
text = text.replaceAll('phase75', 'phase76').replace('live7', 'live9').replace("reviewDesktop(state, PLAN.epochs.before, Date.now())", "assert.ok([PLAN.epochs.before, PLAN.epochs.after].includes(state.grants[0]?.epoch)); reviewDesktop(state, state.grants[0].epoch, Date.now())")
text = text.replace("import { connectionMarkers } from './connection-lines.mjs'", "import { connectionMarkers } from './connection-lines.mjs'\nimport { controlMarkers } from './control-lines.mjs'\nimport { handshakeMarkers as e2eHandshakeMarkers } from './e2e-lines.mjs'")
text = text.replace('markers: connectionMarkers(raw),', 'markers: connectionMarkers(raw), control: controlMarkers(raw), e2e: e2eHandshakeMarkers(raw),')
text = text.slice(0, text.indexOf('\nif (process.argv[1]')) + '\n'
assert.equal(text.includes('Sentinel_'), false); assert.equal(text.includes('phase75'), false)
await writeFile('operations/phase76/exercise.mjs', text, { flag: 'wx' })
await copyFile('scripts/phase68-connection-lines.mjs', 'operations/phase76/connection-lines.mjs')
await copyFile('scripts/phase76-diagnostic-lines.mjs', 'operations/phase76/control-lines.mjs')
await copyFile('scripts/phase75-detached-profile-test.mjs', 'scripts/phase76-detached-profile-test.mjs')
const detached = (await readFile('scripts/phase76-detached-profile-test.mjs', 'utf8')).replaceAll('phase75.1', 'phase76')
await writeFile('scripts/phase76-detached-profile-test.mjs', detached)
console.log('Created inactive phase76 exercise and detached test; no live IO.')
