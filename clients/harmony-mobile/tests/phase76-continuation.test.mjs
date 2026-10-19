/** Pre-grant continuation cannot adopt any committed or incompletely closed attempt; synthetic values only. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { reviewPregrantCloseout } from '../.build/phase76.2-continuation-operation/continuation.mjs'
const closed = JSON.parse(await readFile('evidence/phase76-field-closeout.json','utf8'))
test('the fully closed unused-grant9 predecessor is accepted without changing any authority',()=>reviewPregrantCloseout(closed))
for(const variant of ['committed','epoch10','active','resources','config','session','phone','signature']) test('continuation rejects '+variant,()=>{const value=structuredClone(closed);if(variant==='committed')value.grant.committed=true;if(variant==='epoch10')value.grant.final=10;if(variant==='active')value.grant.active=1;if(variant==='resources')value.local.ownerCleanup.resourcesClosed=false;if(variant==='config')value.local.integrity.originalPublicConfigRestored=false;if(variant==='session')value.local.integrity.originalSessionUnchanged=false;if(variant==='phone')value.phoneFinal.value.pid='123';if(variant==='signature')value.reviewBlocker.signatureAttemptFilePresent=true;assert.throws(()=>reviewPregrantCloseout(value))})
