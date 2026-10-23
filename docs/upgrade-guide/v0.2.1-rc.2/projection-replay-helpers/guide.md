---
kind: upgrade-guide
description: "Custom consumers use the existing message projection and replay validation APIs."
---

# Use the existing projection and replay APIs

English | [中文](guide.zh.md)

## Change

The fork-only `SessionSurface.projectedMessages` accessor and the format catalog's `imageOffloadProjection` re-export are removed. Session instances retain their existing `deriveEventMessage(event)` method, and detached folds retain their projection results.

The snapshot helpers `startOfflineSnapshotEntry` and `startPreparedOfflineSnapshot` are removed. Their validation functions remain, and `OfflineSnapshotEntry` no longer accepts the unused `composition` field.

## Migration

1. Keep the original immutable event when measuring a retained node and call `session.deriveEventMessage(event)` to read its current projected message. Import `imageOffloadProjection` from `@deepseek-ai/dsh-compaction-image-offload/projection`.
2. Call `requireOfflineSnapshotEntry` before importing fixtures or constructing an SDK runner, and pass its declaration to the scenario. Call `prepareOfflineSnapshot` once and construct the harness from its prepared fixtures. Remove `composition` from entry validation input.
3. Verify projected measurement and the guarded SDK replay scenarios. Keep explicit replay mode, the finite route and call budget, and all offline markers enabled.
