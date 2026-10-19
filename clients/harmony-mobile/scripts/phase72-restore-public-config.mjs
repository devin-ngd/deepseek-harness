/** Restore only the exact backed-up public field configuration after confirmed durable revocation; never restore credential epochs. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
const m=JSON.parse(await readFile('.build/phase71-field-active.json','utf8')),e=JSON.parse(await readFile('.build/phase71-exchange.json','utf8')),cleanup=JSON.parse(await readFile(join(e.exchange,'desktop-cleanup.json'),'utf8')),state=JSON.parse(await readFile('.build/phase70-reconcile-current.json','utf8'))
assert.equal(cleanup.revocationSucceeded,true);assert.equal(cleanup.resourcesClosed,true);assert.equal(state.activeGrantCount,0);assert.equal(state.grants[0].epoch,4);assert.equal(state.grants[0].revoked,true)
const hash=b=>createHash('sha256').update(b).digest('hex'),path=join(m.home,'field.json'),before=await readFile('.build/phase71-field-config-before.json');assert.equal(hash(before),m.configBeforeSha256);assert.equal(hash(await readFile(path)),m.configPreparedSha256)
await writeFile(path,before);assert.equal(hash(await readFile(path)),m.configBeforeSha256)
const report={at:new Date().toISOString(),originalPublicConfigRestored:true,sha256:m.configBeforeSha256,retainedRevokedEpoch:4,credentialsRestored:false};await writeFile('evidence/phase72-field-config-restored.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report))
