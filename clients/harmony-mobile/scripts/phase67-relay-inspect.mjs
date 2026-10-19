/** Read only the original relay service and dedicated public journal; never prints keys, capabilities, peers or raw logs. */
import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const marker = JSON.parse(await readFile('.build/phase54-active.json', 'utf8'))
assert.equal(marker.authorization, 'Sentinel_8dcca9e84ab88191aa8537f5e2c9e695')
const script = `set -eu
ROOT=/home/devin/harmony-relay
RUN=$ROOT/field-20261015-phase54-lEUAMM
date -u +%Y-%m-%dT%H:%M:%SZ
sha256sum "$ROOT/config.enabled.json" "$ROOT/server.mjs"
systemctl show harmony-relay.service -p ActiveState -p MainPID -p Result -p ExecMainStatus -p ExecStart -p ReadWritePaths -p RuntimeMaxUSec -p Restart
if test -e /etc/systemd/system/harmony-relay.service.d/60-phase54.conf; then printf 'temporary_override=present\\n'; else printf 'temporary_override=absent\\n'; fi
node --input-type=module - <<'NODE'
import fs from 'node:fs';import crypto from 'node:crypto';import cp from 'node:child_process';
const root='/home/devin/harmony-relay/field-20261015-phase54-lEUAMM';
const original=JSON.parse(fs.readFileSync('/home/devin/harmony-relay/config.enabled.json','utf8'));
const originalConfig={brokerEnabled:original.broker?.enabled===true,fieldPairConfigured:Array.isArray(original.broker?.pairs)&&original.broker.pairs.some(p=>p.pairId==='harmony-phase54-00af17be-fa25-4680-85e2-8b4c20f3b210')};
const files=['relay-pair.json','config.enabled.json','public-state/replay-v1.jsonl','public-state/replay-v1.jsonl.head'];
const records=files.map(name=>{try{const b=fs.readFileSync(root+'/'+name);return {name,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex'),lines:b.toString('utf8').trim().split('\\n').length}}catch(e){if(e.code!=='ENOENT')throw e;return {name,present:false}}});
const logs=cp.execFileSync('journalctl',['--no-pager','-u','harmony-relay.service','--since','2026-10-16 13:45:00 UTC','-o','cat'],{encoding:'utf8',maxBuffer:1048576});
const categories=Object.fromEntries(Object.entries({startup:/listening|started/i,stop:/stopped|stopping|time limit/i,authentication:/auth|signature|challenge/i,connection:/connection|websocket|upgrade/i,failure:/failed|error|refused/i}).map(([name,p])=>[name,logs.split('\\n').filter(l=>p.test(l)).length]));
const sockets=cp.execFileSync('ss',['-Htn','state','established','sport','=','17846'],{encoding:'utf8'}).trim();
const listeners=cp.execFileSync('ss',['-Hltn','sport','=','17846'],{encoding:'utf8'}).trim();
console.log(JSON.stringify({originalConfig,publicFiles:records,logCategories:categories,establishedBackendSockets:sockets?sockets.split('\\n').length:0,originalLoopbackListenerPresent:listeners.includes('127.0.0.1:17846'),rawLogsRetained:false,peerAddressesProjected:false}));
NODE
`
const result = spawnSync('C:/Program Files/OpenSSH/ssh.exe', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'dhome', 'sh -s'], { input: script, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1048576 })
const report = { at: new Date().toISOString(), exit: result.status, output: result.stdout, stderr: result.stderr, mutation: false, privateMaterialProjected: false }
await writeFile('evidence/phase67-relay-inspection-' + Date.now() + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report)); assert.equal(result.status, 0)
