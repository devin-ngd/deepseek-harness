#!/bin/sh
# Approved exact candidate activation/rollback only; new public journal is initialized separately after grant3.
set -eu
umask 077
ROOT=/home/devin/harmony-relay
RUN=$ROOT/phase69-successor
DROP=/etc/systemd/system/harmony-relay.service.d/70-phase69-successor.conf
NGINX=/etc/nginx/conf.d/harmony-relay.conf
case "$1" in
  ready)
    test ! -e "$DROP"
    test ! -e "$RUN/state/public.jsonl"
    test ! -e "$RUN/state/public.jsonl.head"
    test ! -e "$RUN/state/public.jsonl.lock"
    test "$(sha256sum "$ROOT/config.enabled.json" | cut -d ' ' -f1)" = 55cfdc19bb1a809482df5c50b1d126cfd24ae66c5b8a9342918dc68ed5459bb3
    test "$(sha256sum "$ROOT/server.mjs" | cut -d ' ' -f1)" = 20e7126a911112eeca6b5966d85b7c47a8b410c470571635c3965200ae4cdd41
    test "$(sha256sum "$NGINX" | cut -d ' ' -f1)" = 3d3f43d11bf6496f6555606812bd4d72c4c54a2f4fcfc3ac9d9a08ca908284b2
    cd "$RUN"
    python3 - <<'PY'
import json,hashlib,pathlib
rows=json.load(open('phase70-relay-files.json'))
for row in rows:
    p=pathlib.Path(row['file'][len('relay/'):]); assert not p.is_symlink(); assert hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256']
assert len(rows)==40
print('candidate_public_files=40 hashes_matched=1 actual_journal_absent=1')
PY
    systemctl is-active harmony-relay.service
    date -u +%Y-%m-%dT%H:%M:%SZ
    ;;
  activate)
    cd "$RUN"
    test ! -e "$DROP"
    test ! -e "$RUN/state/public.jsonl.lock"
    test -s "$RUN/state/public.jsonl"
    test -s "$RUN/state/public.jsonl.head"
    test ! -e "$RUN/field.preflight.json"
    test "$(sha256sum "$NGINX" | cut -d ' ' -f1)" = 3d3f43d11bf6496f6555606812bd4d72c4c54a2f4fcfc3ac9d9a08ca908284b2
    node --input-type=module - <<'JS'
import fs from 'node:fs';import assert from 'node:assert/strict';const c=JSON.parse(fs.readFileSync('field.authorized.json','utf8')),p=c.broker.pairs[0];assert.equal(c.nativeOrigin,'networkkit-v1');assert.equal(c.host,'127.0.0.1');assert.equal(c.port,17846);assert.equal(c.publicHost,'dsh.devinho.me');assert.equal(c.publicTrust.path,'/home/devin/harmony-relay/phase69-successor/state/public.jsonl');assert.equal(c.broker.pairs.length,1);assert.equal(p.pairId,'harmony-phase69-successor-20261016');assert.equal(p.epoch,1);assert.equal(p.revoked,false);assert.ok(p.expiresAt>Date.now()+30000&&p.expiresAt<=Date.now()+1800000);assert.equal(JSON.parse(fs.readFileSync('field.active.json','utf8')).broker.enabled,false);
JS
    cp field.active.json field.preflight.json
    cp field.authorized.json field.active.next.json
    mv field.active.next.json field.active.json
    sudo -n install -d -m 0755 /etc/systemd/system/harmony-relay.service.d
    sudo -n install -m 0644 harmony-relay.service.drop-in.proposal "$DROP"
    sudo -n systemctl daemon-reload
    sudo -n systemctl stop harmony-relay.service
    sudo -n systemctl start harmony-relay.service
    systemctl is-active harmony-relay.service
    sudo -n install -m 0644 relay.nginx.conf.proposal "$NGINX"
    sudo -n nginx -t
    sudo -n systemctl reload nginx
    systemctl show harmony-relay.service -p ExecStart -p ReadWritePaths -p ProtectHome -p ProtectSystem -p MainPID -p Result
    printf 'approved_live_relay_activated=1\n'
    ;;
  restore)
    if test -e "$DROP"; then
      cmp "$RUN/harmony-relay.service.drop-in.proposal" "$DROP"
      test ! -e "$RUN/rollback/live.override.completed.conf"
      sudo -n systemctl stop harmony-relay.service
      sudo -n mv "$DROP" "$RUN/rollback/live.override.completed.conf"
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
    systemctl show harmony-relay.service -p ExecStart -p ReadWritePaths -p MainPID -p Result
    printf 'original_relay_and_nginx_restored=1 public_history_preserved=1\n'
    ;;
  *) exit 2 ;;
esac
