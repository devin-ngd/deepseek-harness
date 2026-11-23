---
kind: upgrade-guide
description: "The goal tools require Session projections and finish registration asynchronously."
---

# Goal tools require Session projections

English | [中文](guide.zh.md)

## Change

`@deepseek-ai/dsh-tool-goal` requires the `sessionProjections` service and awaits its authority projection before registering its tools. Its `apply(ctx, config)` returns a Promise; direct callers that previously used the tools immediately must wait for activation. Invalid configuration still throws synchronously.

## Migration

1. Mount `@deepseek-ai/dsh-session-projection` in custom compositions that use the goal tools. Shipped profiles already include it.
2. When calling `apply(ctx, config)` directly, await the returned Promise before looking up or executing the goal tools. Loader-managed compositions wait for plugin activation.
3. Verify that `get_goal`, `create_goal`, and `update_goal` register and that unauthorized mutations are rejected.
