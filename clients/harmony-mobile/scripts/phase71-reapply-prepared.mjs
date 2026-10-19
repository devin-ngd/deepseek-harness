/** Reapply the identical public-only prepared settings after trusted live-execution approval; does not open keys, a profile or a grant. */
import assert from 'node:assert/strict'
import { readFile, writeFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
const marker=JSON.parse(await readFile('.build/phase71-field-active.json','utf8')),hash=b=>createHash('sha256').update(b).digest('hex'),path=join(marker.home,'field.json'),before=await readFile('.build/phase71-field-config-before.json');assert.equal(hash(before),marker.configBeforeSha256);assert.equal(hash(await readFile(path)),marker.configBeforeSha256);const info=await lstat(path);assert.ok(info.isFile()&&!info.isSymbolicLink());const config=JSON.parse(before.toString('utf8')),after=Buffer.from(JSON.stringify({...config,pairId:marker.pairId,publicTrustMaxBytes:32768,renewal:{previousPublicPath:marker.previousPath}},null,2)+'\n');assert.equal(hash(after),marker.configPreparedSha256);await writeFile(path,after);console.log('Identical public-only field settings reapplied; profile not started and grant not created.')
