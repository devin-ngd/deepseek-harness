---
kind: upgrade-guide
description: "Rich-inline tools and formatting are available only to root Agents."
---

# Rich-inline is limited to root Agents

English | [中文](guide.zh.md)

## Change

Child Agents no longer receive rich-inline authoring guidance, formatting reminders, automatic format repair or any `rich_inline_*` tool, including source reads. This applies regardless of `activePresets` and optional authoring policies. Root sessions retain the configured authoring behavior and historical cards remain viewable.

Custom question forms use the standard `conversation.composer` chain. The fork-only `conversation.question.content` slot and `ui-user-questions/client` value exports `planReviewOf` and `parseRecommendedLabel` are removed. Rich-inline keeps its question and editable-plan behavior through the existing pending-interaction carrier.

## Migration

1. Remove rich-inline calls and HTML presentation requirements from child-agent instructions. Return concise internal reports and file or result references to the parent instead.
2. Keep user-facing rich-inline interaction in the root Agent. Verify that a spawned or forked child has no rich-inline tools in native or PTC presentation and that direct calls are rejected.
3. If a custom form used `conversation.question.content`, register it on `conversation.composer` with a priority before the default question entry and select `pendingInteraction` when its `kind` is `question` or `plan-review`. Keep `PendingQuestion` imports type-only and bind its state through an injected keyed hook. Verify answering, plan approval, cancellation and fallback when the plugin is disabled.
