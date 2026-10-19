/** Read-only bounded inspection of the approved phase75 relay restoration; no messages, tokens or configuration bodies are returned. */
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import assert from 'node:assert/strict'
import { PLAN, reviewApprovalRecord } from '../.build/phase75.1-complete-operation-plan/policy.mjs'
import { verifyPackage } from '../.build/phase75.1-complete-operation-plan/cli.mjs'
assert.equal(process.platform, 'win32'); assert.ok(process.stdin.isTTY && process.stdout.isTTY)
const approved = JSON.parse(await readFile('evidence/phase75.1-execution-approval.json', 'utf8')), verified = await verifyPackage()
reviewApprovalRecord(approved, verified.planSha256, verified.manifestSha256)
assert.equal(approved.sourceHumanMessageId, 'Sentinel_89e6422f7b5c8191a26ce3f3bee61489')
const terminal = createInterface({ input: process.stdin, output: process.stdout })
try { assert.equal(await terminal.question('Type INSPECT PHASE75 RESTORE: '), 'INSPECT PHASE75 RESTORE') } finally { terminal.close() }
const program = `import {readFile,readdir,lstat} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';const r=${JSON.stringify(PLAN.relay)};const digest=b=>createHash('sha256').update(b).digest('hex');const file=async p=>{try{const s=await lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.size>1048576)throw Error('selected file denied');return await readFile(p)}catch(e){if(e.code==='ENOENT')return null;throw e}};const files=await readdir(r.run);const restores=[];for(const name of files.filter(n=>/^restore-\\d+\\.json$/.test(n)).sort().slice(-8)){const b=await file(r.run+'/'+name);restores.push({name,...JSON.parse(b)})};const prop=p=>execFileSync('/usr/bin/systemctl',['show','--value','-p',p,r.service],{encoding:'utf8'}).trim();const drop=await file(r.drop),nginx=await file(r.nginx),backup=await file(r.run+'/rollback/nginx.before.conf');console.log(JSON.stringify({observedAt:Date.now(),readOnly:true,restores,dropPresent:drop!==null,dropSha256:drop?digest(drop):null,completedDropPresent:(await file(r.run+'/rollback/completed.override.conf'))!==null,nginxSha256:digest(nginx),backupSha256:digest(backup),service:{active:prop('ActiveState'),dropIns:prop('DropInPaths'),writable:prop('ReadWritePaths'),protectSystem:prop('ProtectSystem'),protectHome:prop('ProtectHome'),usesPhase75:prop('ExecStart').includes(r.config)}}));`
const result = spawnSync('C:/Program Files/OpenSSH/ssh.exe', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', PLAN.relay.sshAlias, '/usr/bin/node --input-type=module -'], { input: program, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1048576 })
assert.equal(result.error, undefined); assert.equal(result.status, 0, 'read-only relay inspection failed')
const value = JSON.parse(result.stdout.trim()), path = join(PLAN.local.run, 'relay-cleanup-diagnostic-' + Date.now() + '.json')
await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ ...value, evidence: resolve(path) }))
