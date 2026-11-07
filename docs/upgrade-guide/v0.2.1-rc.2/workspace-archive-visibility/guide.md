---
kind: upgrade-guide
description: "Workspace archive mutation responses return the archived Session IDs visible to the caller."
---

# Workspace archive mutation results follow caller access

English | [中文](guide.zh.md)

## Change

`workspace.archiveSession` and `workspace.unarchiveSession` previously returned the complete `archivedSessionIds` array. The response now contains the archived Session IDs visible to the caller. The owner still receives the complete array.

## Migration

1. Store `archivedSessionIds` from either mutation in the caller's Workspace view. Use that view's `workspace.follow` stream to refresh the scoped archive set.
2. Test with a caller that can access only one of two archived Sessions. The mutation response contains only visible IDs. An owner response includes both IDs when both Sessions are archived.
