#!/bin/sh
# Temporarily qualify the approved binary/proxy with no configured pair, then restore the exact original service and nginx.
set -eu
umask 077
ROOT=/home/devin/harmony-relay
RUN=$ROOT/phase69-successor
DROP=/etc/systemd/system/harmony-relay.service.d/70-phase69-successor.conf
NGINX=/etc/nginx/conf.d/harmony-relay.conf
restore() {
  trap - EXIT HUP INT TERM
  if test -e "$DROP"; then
    cmp "$RUN/harmony-relay.service.drop-in.proposal" "$DROP"
    test ! -e "$RUN/rollback/probe.override.completed.conf"
    sudo -n systemctl stop harmony-relay.service
    sudo -n mv "$DROP" "$RUN/rollback/probe.override.completed.conf"
    sudo -n systemctl daemon-reload
    sudo -n systemctl start harmony-relay.service
  fi
  current=$(sha256sum "$NGINX" | cut -d ' ' -f1)
  if test "$current" = 5cdda3f1d2b2858df18fa0c4249d5134ac0d128fa397bdb1c3ce7620b79b56d5; then
    test "$(sha256sum "$RUN/rollback/nginx.before.conf" | cut -d ' ' -f1)" = 3d3f43d11bf6496f6555606812bd4d72c4c54a2f4fcfc3ac9d9a08ca908284b2
    sudo -n install -m 0644 "$RUN/rollback/nginx.before.conf" "$NGINX"
    sudo -n nginx -t
    sudo -n systemctl reload nginx
  else
    test "$current" = 3d3f43d11bf6496f6555606812bd4d72c4c54a2f4fcfc3ac9d9a08ca908284b2
  fi
  test ! -e "$DROP"
  test "$(sha256sum "$ROOT/config.enabled.json" | cut -d ' ' -f1)" = 55cfdc19bb1a809482df5c50b1d126cfd24ae66c5b8a9342918dc68ed5459bb3
  test "$(sha256sum "$ROOT/server.mjs" | cut -d ' ' -f1)" = 20e7126a911112eeca6b5966d85b7c47a8b410c470571635c3965200ae4cdd41
  systemctl is-active harmony-relay.service
  systemctl show harmony-relay.service -p ExecStart -p ReadWritePaths -p Restart -p Result
  printf 'restored_original=1 live_pair_created=0 grant_created=0\n'
}
test ! -e "$DROP"
test "$(sha256sum "$NGINX" | cut -d ' ' -f1)" = 3d3f43d11bf6496f6555606812bd4d72c4c54a2f4fcfc3ac9d9a08ca908284b2
test "$(sha256sum "$RUN/harmony-relay.service.drop-in.proposal" | cut -d ' ' -f1)" = fa6ad989ca67e144ea42f64fc91e1a548f3806f3fcad76e148ff45a7077fe35e
test "$(sha256sum "$RUN/relay.nginx.conf.proposal" | cut -d ' ' -f1)" = 5cdda3f1d2b2858df18fa0c4249d5134ac0d128fa397bdb1c3ce7620b79b56d5
cd "$RUN"
node --input-type=module - <<'JS'
import fs from 'node:fs';import assert from 'node:assert/strict';const c=JSON.parse(fs.readFileSync('field.active.json','utf8'));assert.equal(c.host,'127.0.0.1');assert.equal(c.port,17846);assert.equal(c.nativeOrigin,'networkkit-v1');assert.equal(c.broker.enabled,false);assert.equal(c.publicTrust,undefined);
JS
trap 'status=$?; restore; exit "$status"' EXIT HUP INT TERM
sudo -n install -d -m 0755 /etc/systemd/system/harmony-relay.service.d
sudo -n install -m 0644 "$RUN/harmony-relay.service.drop-in.proposal" "$DROP"
sudo -n systemctl daemon-reload
sudo -n systemctl stop harmony-relay.service
sudo -n systemctl start harmony-relay.service
systemctl is-active harmony-relay.service
systemctl show harmony-relay.service -p User -p ProtectHome -p ProtectSystem -p ReadWritePaths -p ExecStart -p MainPID -p Result
sudo -n install -m 0644 "$RUN/relay.nginx.conf.proposal" "$NGINX"
sudo -n nginx -t
sudo -n systemctl reload nginx
node --input-type=module - <<'JS'
import WebSocket from 'ws';import assert from 'node:assert/strict';
const origin='https://dsh.devinho.me';const socket=new WebSocket('wss://dsh.devinho.me/harmony/relay/control/v1','harmony-relay-control-v1',{headers:{Origin:origin,'X-DSH-Relay-Pair':'harmony-phase69-successor-20261016','X-DSH-Relay-Role':'phone'},handshakeTimeout:10000});
await new Promise((resolve,reject)=>{let received=false;socket.on('error',error=>{if(!received)reject(new Error('TLS/WS probe failed: '+(error.code??'unknown')))});socket.once('open',()=>{socket.terminate();reject(new Error('unconfigured pair unexpectedly upgraded'))});socket.once('unexpected-response',(_request,response)=>{received=true;let bytes=0;response.on('data',chunk=>bytes+=chunk.length);response.once('end',()=>{try{assert.equal(response.statusCode,403);assert.equal(bytes,0);console.log(JSON.stringify({tlsVerified:true,publicWssReached:true,unconfiguredPairDenied:true,status:response.statusCode,bodyBytes:bytes,grantCreated:false}));resolve()}catch(error){reject(error)}finally{socket.terminate()}})})});
JS
printf 'approved_binary_proxy_precheck=passed\n'
restore
