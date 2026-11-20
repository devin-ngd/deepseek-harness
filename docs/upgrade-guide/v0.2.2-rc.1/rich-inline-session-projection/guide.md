---
kind: upgrade-guide
description: "Rich Inline requires the Session projection service in custom compositions."
---

# Rich Inline requires Session projections

English | [中文](guide.zh.md)

## Change

`@deepseek-ai/dsh-experimental-rich-inline` requires `sessionProjections` when mounted as a Cordis plugin. It registers a host-only turn projection; independent and unprepared Sessions retain the synchronous compatibility reader.

## Migration

1. Mount `@deepseek-ai/dsh-session-projection` in custom compositions that mount `@deepseek-ai/dsh-experimental-rich-inline`. The shipped base profile includes it.
2. Wait for plugin activation, then verify that a Rich Inline action can be claimed and settled in a Session.
