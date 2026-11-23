---
kind: upgrade-guide
description: "Basic compaction requires the Session projection service in custom compositions."
---

# Basic compaction requires Session projections

English | [中文](guide.zh.md)

## Change

`@deepseek-ai/dsh-compaction-basic` requires `sessionProjections` when mounted as a Cordis plugin. It registers a host-only transaction projection before accepting work; unprepared Sessions retain the synchronous compatibility path.

## Migration

1. Mount `@deepseek-ai/dsh-session-projection` in custom compositions that mount `@deepseek-ai/dsh-compaction-basic`. The shipped base profile includes it.
2. Wait for plugin activation before invoking compaction. Verify that the compaction service mounts and an idle Session can run `/compact`.
