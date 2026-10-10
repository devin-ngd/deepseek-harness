---
kind: upgrade-guide
description: "Sessions with rich-inline source projections require the owning interpreter on resume."
---

# Keep rich-inline available for projected Sessions

English | [中文](guide.zh.md)

## Change

Large settled `rich-html` messages and successful publication or state-update arguments retain their full source in the audit log but use scoped references in later model requests. The plugin records required message projections `rich-inline/source-offload` and `rich-inline/tool-offload`. Older builds do not understand these events. Disabling or removing the interpreter makes model-history reconstruction fail explicitly for affected Sessions; it does not silently send a different conversation. Ordinary presentation continues to use original publication facts.

Installed packages follow the current publication file policy and omit the repository's `examples/*.ts` files. The examples remain in the repository; the exported `theme` API and built runtime remain available.

## Migration

1. Upgrade the Host and rich-inline package together, and retain the enabled plugin when resuming Sessions with source-offload events. Read-only source access uses `rich_inline_read`; its references permit no actions or cross-Session access.
2. Keep original Session logs. To avoid new offload decisions for a deployment, set `sourceOffloadMinBytes` above its maximum publication and tool-argument bytes; existing decisions still require their interpreter. Reversing a code patch does not downgrade those logs.
3. Confirm that a reopened Session derives the same scoped references and that needed source fragments remain readable. See the package's [reference](../../../../packages/experimental/rich-inline/README.md#usage-source) for usage accounting and limits.
4. Read authoring examples from the repository and import theme helpers from `@deepseek-ai/dsh-experimental-rich-inline/theme`, rather than reading TypeScript examples from an installed package.
