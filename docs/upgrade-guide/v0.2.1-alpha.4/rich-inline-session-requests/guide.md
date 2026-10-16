---
kind: upgrade-guide
description: "Rich Inline mount RPC requests require an explicit Session identity for resource access checks."
---

# Rich Inline mount requests name their Session

English | [中文](guide.zh.md)

## Change

Rich Inline RPC clients that send only `mountId` must also send `sessionId`. This affects `snapshot`, `snapshotIfChanged`, `reportRender`, `saveDraft`, `invoke`, `status`, `registerFile`, `applyUpdate` and `dispose`. The Gateway checks the requested Session before dispatch; the Host rejects a Session that differs from the mount's recorded owner. Missing identities are refused without selecting a default Session.

The guest `lumina-rich/1` messages and stored publications, drafts and actions keep their existing format. Generated scripts cannot choose a Session. Complete native rendering still requires the Rich Inline Desktop integration.

## Migration

1. Update the Host plugin and trusted Client together, then refresh connected pages. Official plugin Update removes the old package before installing its replacement; custom installers must preserve this order and honor a restart-required result.
2. Add the current trusted Session's `sessionId` beside `mountId` in every affected RPC request. Attach it after processing guest data; do not take it from generated scripts. Keep the identity with the request when reconnecting or disposing an old mount.
3. For a non-owner transport, supply its authenticated Peer and a policy binding for each permitted `richInline/<method>` action on that Session. A global binding does not grant Session access. Keep approval answering with the existing authorized client.
4. Verify an authorized snapshot succeeds, an unauthorized Session is denied, a Session/mount mismatch is refused, and a disposed Peer cannot call the Gateway. Confirm draft save, action retry and refresh through the updated Client.
