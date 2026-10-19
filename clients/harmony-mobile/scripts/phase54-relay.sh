#!/bin/sh
# Only the approved dedicated relay and one bounded public-state directory; no key or unrelated service access.
set -eu
umask 077
ROOT=/home/devin/harmony-relay
RUN=$ROOT/field-20261015-phase54-lEUAMM
DROP=/etc/systemd/system/harmony-relay.service.d/60-phase54.conf
case "$1" in
  prepare)
    test "$(id -un)" = devin
    test "$(sha256sum "$ROOT/config.enabled.json" | cut -d ' ' -f1)" = 55cfdc19bb1a809482df5c50b1d126cfd24ae66c5b8a9342918dc68ed5459bb3
    test "$(sha256sum "$ROOT/server.mjs" | cut -d ' ' -f1)" = 20e7126a911112eeca6b5966d85b7c47a8b410c470571635c3965200ae4cdd41
    test ! -e "$RUN"
    test ! -e "$DROP"
    mkdir "$RUN"
    mkdir "$RUN/rollback" "$RUN/public-state"
    cp "$ROOT/config.enabled.json" "$RUN/rollback/config.before.json"
    systemctl cat harmony-relay.service > "$RUN/rollback/unit.before.txt"
    systemctl show harmony-relay.service -p User -p Restart -p UnitFileState -p ProtectHome -p ReadWritePaths -p ExecStart > "$RUN/rollback/service.before.txt"
    date -u +%Y-%m-%dT%H:%M:%SZ
    stat -c '%a %U %G %n' "$RUN" "$RUN/public-state"
    ;;
  unpack)
    cd "$RUN"
    test "$(sha256sum public-tools.zip | cut -d ' ' -f1)" = b3d9262aca7e73a7a88f2ff4b71d8a05cbc449db95536ffb4ea78c24acf88f96
    test ! -e public-tools
    python3 - <<'PY'
import pathlib,zipfile,stat
target=pathlib.Path('public-tools').resolve()
with zipfile.ZipFile('public-tools.zip') as archive:
    if len(archive.infolist())!=7: raise RuntimeError('unexpected tools entries')
    for entry in archive.infolist():
        path=(target/entry.filename).resolve()
        if not path.is_relative_to(target) or stat.S_ISLNK(entry.external_attr>>16): raise RuntimeError('unsafe archive path')
    archive.extractall(target)
print('sealed public tools extracted; no initialization or service change')
PY
    ;;
  activate)
    cd "$RUN"
    test ! -e "$DROP"
    test -s public-state/replay-v1.jsonl
    test -s public-state/replay-v1.jsonl.head
    test ! -e public-state/replay-v1.jsonl.lock
    remaining=$(node --input-type=module -e 'import fs from "node:fs";const c=JSON.parse(fs.readFileSync("config.enabled.json","utf8")),n=Math.floor((c.broker.pairs[0].expiresAt-Date.now())/1000);if(n<30||n>1800)throw Error("bounded unexpired pair required");console.log(n)')
    cat > service.override.conf <<EOF
[Service]
ExecStart=
ExecStart=/usr/bin/node $ROOT/server.mjs --config $RUN/config.enabled.json
ReadWritePaths=$RUN/public-state
RuntimeMaxSec=${remaining}s
EOF
    sudo -n install -d -m 0755 /etc/systemd/system/harmony-relay.service.d
    sudo -n install -m 0644 service.override.conf "$DROP"
    sudo -n systemctl daemon-reload
    sudo -n systemctl stop harmony-relay.service
    sudo -n systemctl start harmony-relay.service
    systemctl is-active harmony-relay.service
    systemctl show harmony-relay.service -p MainPID -p User -p Restart -p UnitFileState -p ProtectHome -p ReadWritePaths -p RuntimeMaxUSec -p ExecStart
    ;;
  restore)
    test -f "$RUN/service.override.conf"
    cmp "$RUN/service.override.conf" "$DROP"
    test "$(sha256sum "$ROOT/config.enabled.json" | cut -d ' ' -f1)" = 55cfdc19bb1a809482df5c50b1d126cfd24ae66c5b8a9342918dc68ed5459bb3
    sudo -n systemctl stop harmony-relay.service
    sudo -n mv "$DROP" "$RUN/rollback/service.override.completed.conf"
    sudo -n systemctl daemon-reload
    sudo -n systemctl start harmony-relay.service
    systemctl is-active harmony-relay.service
    systemctl show harmony-relay.service -p MainPID -p User -p Restart -p UnitFileState -p ProtectHome -p ReadWritePaths -p RuntimeMaxUSec -p ExecStart
    ;;
  status)
    systemctl is-active harmony-relay.service
    systemctl show harmony-relay.service -p MainPID -p ExecMainStatus -p Result -p Restart -p ReadWritePaths -p RuntimeMaxUSec
    stat -c '%a %U %G %n' "$RUN/public-state"
    ;;
  verify)
    cmp "$ROOT/config.enabled.json" "$RUN/rollback/config.before.json"
    test ! -e "$DROP"
    test -z "$(find "$RUN/public-state" -mindepth 1 -maxdepth 1 -print -quit)"
    test ! -e "$RUN/relay-pair.json"
    test ! -e "$RUN/config.enabled.json"
    test "$(sha256sum "$ROOT/server.mjs" | cut -d ' ' -f1)" = 20e7126a911112eeca6b5966d85b7c47a8b410c470571635c3965200ae4cdd41
    printf '%s\n' 'original config and server unchanged; no pair, public trust or service override'
    ;;
  *) exit 2 ;;
esac
