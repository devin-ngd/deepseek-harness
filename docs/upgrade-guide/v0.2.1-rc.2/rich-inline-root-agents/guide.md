---
kind: upgrade-guide
description: "Rich-inline tools and formatting are available only to root Agents."
---

# Rich-inline is limited to root Agents

English | [中文](guide.zh.md)

## Change

Child Agents no longer receive rich-inline authoring guidance, formatting reminders, automatic format repair or any `rich_inline_*` tool, including source reads. This applies regardless of `activePresets` and optional authoring policies. Root sessions retain the configured authoring behavior and historical cards remain viewable.

## Migration

1. Remove rich-inline calls and HTML presentation requirements from child-agent instructions. Return concise internal reports and file or result references to the parent instead.
2. Keep user-facing rich-inline interaction in the root Agent. Verify that a spawned or forked child has no rich-inline tools in native or PTC presentation and that direct calls are rejected.
