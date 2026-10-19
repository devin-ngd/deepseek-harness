/** Read only approved relay public state and service counters; do not project capabilities, peer addresses or raw logs. */
import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
const script = `set -eu
date -u +%Y-%m-%dT%H:%M:%SZ
systemctl show harmony-relay.service -p ActiveState -p MainPID -p Result -p ExecMainStatus -p ExecStart -p ReadWritePaths
node --input-type=module - <<'JS'
import fs from 'node:fs';import cp from 'node:child_process';import crypto from 'node:crypto';
const root='/home/devin/harmony-relay/phase69-successor',files=['state/public.jsonl','state/public.jsonl.head'];
const records=files.map(name=>{const b=fs.readFileSync(root+'/'+name);return{name,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex'),lines:b.toString('utf8').trim().split('\\n').length}});
const raw=cp.execFileSync('journalctl',['--no-pager','-u','harmony-relay.service','--since','2026-10-17 03:55:00 UTC','-o','cat'],{encoding:'utf8',maxBuffer:1048576});
const categories=Object.fromEntries(Object.entries({startup:/listening|started/i,stop:/stopped|stopping/i,authentication:/auth|signature|challenge/i,connection:/connection|websocket|upgrade/i,failure:/failed|error|refused/i}).map(([key,re])=>[key,raw.split('\\n').filter(line=>re.test(line)).length]));
const established=cp.execFileSync('ss',['-Htn','state','established','sport','=','17846'],{encoding:'utf8'}).trim();
const originalRoot='/home/devin/harmony-relay',originalHashes=Object.fromEntries(['server.mjs','config.enabled.json','field-20261015-phase54-lEUAMM/public-state/replay-v1.jsonl','field-20261015-phase54-lEUAMM/public-state/replay-v1.jsonl.head'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(originalRoot+'/'+name)).digest('hex')]));
const originalConfig=JSON.parse(fs.readFileSync(originalRoot+'/config.enabled.json','utf8'));
console.log(JSON.stringify({publicFiles:records,originalHashes,nginxSha256:crypto.createHash('sha256').update(fs.readFileSync('/etc/nginx/conf.d/harmony-relay.conf')).digest('hex'),temporaryDropPresent:fs.existsSync('/etc/systemd/system/harmony-relay.service.d/70-phase69-successor.conf'),publicJournalLockPresent:fs.existsSync(root+'/state/public.jsonl.lock'),originalBrokerEnabled:originalConfig.broker.enabled,originalPairListPresent:Array.isArray(originalConfig.broker.pairs),originalPairCount:Array.isArray(originalConfig.broker.pairs)?originalConfig.broker.pairs.length:0,categories,backendSocketCount:established?established.split('\\n').length:0,rawLogsRetained:false,peerAddressesProjected:false}));
JS
`
const r=spawnSync('C:/Program Files/OpenSSH/ssh.exe',['-o','BatchMode=yes','-o','ConnectTimeout=10','dhome','sh -s'],{input:script,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1048576})
const report={at:new Date().toISOString(),code:r.status,output:r.stdout,stderr:r.stderr,readOnly:true};await writeFile('evidence/phase72-relay-inspection-'+Date.now()+'.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));process.exitCode=r.status??1
