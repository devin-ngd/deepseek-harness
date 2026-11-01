import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const config=await readFile(new URL('../standalone-relay/relay.nginx.conf.proposal',import.meta.url),'utf8')
// Virtual leaky-bucket decisions; actual nginx and device outcomes require separate evidence.
function admit(burst,times){let excess=-1,last=times[0];return times.map(at=>{const next=Math.max(0,excess-(at-last)/12000)+1;last=at;if(excess===-1){excess=0;return true}if(next>burst)return false;excess=next;return true})}
test('four simultaneous same-key upgrades exceed the predecessor burst',()=>{assert.deepEqual(admit(2,[0,0,0,0]),[true,true,true,false])})
test('shared control and data locations admit four upgrades with the minimum burst',()=>{const limits=[...config.matchAll(/limit_req zone=harmony_relay_upgrade burst=(\d+) nodelay;/g)].map(m=>+m[1]);assert.deepEqual(limits,[3,3]);assert.deepEqual(admit(limits[0],[0,0,0,0]),[true,true,true,true])})
test('the sustained rate and a fifth immediate rejection remain',()=>{assert.match(config,/zone=harmony_relay_upgrade:1m rate=5r\/m;/);assert.deepEqual(admit(3,[0,0,0,0,0]),[true,true,true,true,false]);assert.deepEqual(admit(3,[0,0,0,0,12000]),[true,true,true,true,true])})
test('connection cap and both bounded proxy deadlines remain',()=>{assert.match(config,/limit_conn harmony_relay_conn 4;/);assert.equal((config.match(/proxy_read_timeout 660s;/g)||[]).length,2)})
