/** Derive the same operator build pipeline for the new plan; no field or remote command is executed. */
import { readFile, writeFile } from 'node:fs/promises'
const source = await readFile('scripts/phase75-build-operations.mjs', 'utf8')
let text = source.replaceAll('phase75', 'phase76').replaceAll('Phase75', 'Phase76')
text = text.replace('export { pairedGrantSchema, enrollmentProofBytes }', "export { reviewPhoneConnectReady } from './replay-profile/src/connect-readiness.ts'; export { pairedGrantSchema, enrollmentProofBytes }")
text = text.replaceAll('.build/native-history-candidate-project', '.build/native-control-diagnostics-project')
text = text.replace("await copyFile('D:/Temp/dsh-harmony-phase74-operation/phone-previous-v2.json', join(stage, 'phone-anchor.fixture.json'))", "await copyFile('D:/Temp/dsh-harmony-phase75-operation/native-final-1792226230168.json', join(stage, 'phone-anchor.fixture.json'))")
text = text.replace("await copyFile('D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/fixed-world/exchange/run-fiSUnZ/relay-pair.json', join(stage, 'historical-relay.fixture.json'))", "await copyFile('D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/fixed-world/exchange/run-vQfb8Y/relay-pair.json', join(stage, 'historical-relay.fixture.json'))")
await writeFile('scripts/phase76-build-operations.mjs', text, { flag: 'wx' })
const path = 'operations/phase76/plan.json', plan = JSON.parse(await readFile(path, 'utf8')), review = JSON.parse(await readFile('evidence/phase76.1-candidate.json', 'utf8'))
plan.native.zip = review.archive.path; plan.native.zipSha256 = review.archive.sha256; plan.assemblyReady = false
await writeFile(path, JSON.stringify(plan, null, 2) + '\n')
