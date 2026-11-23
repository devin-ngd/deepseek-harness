---
kind: upgrade-guide
description: "Goal 工具要求 Session 投影服务并异步完成注册。"
---

# Goal 工具要求 Session 投影

[English](guide.md) | 中文

## 变更

`@deepseek-ai/dsh-tool-goal` 要求 `sessionProjections` 服务，并在注册工具前等待其授权投影。`apply(ctx, config)` 返回 Promise；此前直接调用后立即使用工具的代码必须等待激活完成。无效配置仍会同步抛错。

## 迁移

1. 在使用 Goal 工具的自定义组合中挂载 `@deepseek-ai/dsh-session-projection`。随附 profile 已包含该服务。
2. 直接调用 `apply(ctx, config)` 时，先等待返回的 Promise，再查找或执行 Goal 工具。由 Loader 管理的组合会等待插件激活。
3. 确认 `get_goal`、`create_goal` 和 `update_goal` 已注册，并确认未经授权的修改被拒绝。
