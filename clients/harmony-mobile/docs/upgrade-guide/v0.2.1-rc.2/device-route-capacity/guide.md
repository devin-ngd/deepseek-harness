---
kind: upgrade-guide
description: Older Harmony phone packages cannot restore route history larger than 32 KiB.
---

# Harmony phone route history capacity

## Change

Private phone candidate rc2.20 raises `publicTrustMaxBytes` and `core.trustMaxBytes` from 32768 to 524288 bytes, matching the existing device route ledger limit. Persisted messages, keys, binding identifiers and route validation remain unchanged. Once retained history exceeds 32768 bytes, older phone packages cannot restore it; installing such a package is not a supported rollback.

## Migration

1. Review the [candidate and current device result](../../../route-history-rc2.20.md). Keep the original binding, identity and complete route history; do not clear data or prune history to fit an older package.
2. Use the matching complete rc2.20 phone HAP with both capacity settings. Sign with the original approved material and install in place only with deployment approval; do not uninstall the app.
3. Confirm the installed version and unchanged UID, then cold-start and verify the original paired state. A route append must retain every earlier offer, route and retired identifier; an oversized write must leave persisted bytes unchanged.
4. Keep a phone package that supports the retained history size for recovery. Verify connection, real catalog, reply and stop in a separately approved finite window; a successful route signature alone does not establish MVP acceptance.
