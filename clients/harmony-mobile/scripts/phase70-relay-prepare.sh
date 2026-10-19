#!/bin/sh
# Only prepare the approved version/state directories and immutable rollback copies; no service or grant activation.
set -eu
umask 077
ROOT=/home/devin/harmony-relay
RUN=$ROOT/phase69-successor
DROP=/etc/systemd/system/harmony-relay.service.d/70-phase69-successor.conf
NGINX=/etc/nginx/conf.d/harmony-relay.conf
test "$(id -un)" = devin
test "$(sha256sum "$ROOT/config.enabled.json" | cut -d ' ' -f1)" = 55cfdc19bb1a809482df5c50b1d126cfd24ae66c5b8a9342918dc68ed5459bb3
test "$(sha256sum "$ROOT/server.mjs" | cut -d ' ' -f1)" = 20e7126a911112eeca6b5966d85b7c47a8b410c470571635c3965200ae4cdd41
test "$(sha256sum "$NGINX" | cut -d ' ' -f1)" = 3d3f43d11bf6496f6555606812bd4d72c4c54a2f4fcfc3ac9d9a08ca908284b2
test ! -e "$RUN"
test ! -e "$DROP"
mkdir "$RUN" "$RUN/state" "$RUN/rollback"
cp "$ROOT/config.enabled.json" "$RUN/rollback/config.before.json"
cp "$NGINX" "$RUN/rollback/nginx.before.conf"
systemctl cat harmony-relay.service > "$RUN/rollback/unit.before.txt"
systemctl show harmony-relay.service -p User -p Restart -p UnitFileState -p ProtectHome -p ProtectSystem -p ReadWritePaths -p ExecStart > "$RUN/rollback/service.before.txt"
sha256sum "$RUN/rollback/config.before.json" "$RUN/rollback/nginx.before.conf"
stat -c '%a %U %G %n' "$RUN" "$RUN/state"
printf 'prepared=1 service_changed=0 grant_created=0\n'
