---
kind: upgrade-guide
description: "Rich Inline 在自定义组合中需要 Session 投影服务。"
---

# Rich Inline 需要 Session 投影

[English](guide.md) | 中文

## 变更

以 Cordis 插件挂载 `@deepseek-ai/dsh-experimental-rich-inline` 时需要 `sessionProjections`。服务注册仅供 Host 使用的轮次投影；独立及尚未准备的 Session 保留同步兼容读取。

## 迁移

1. 在挂载 `@deepseek-ai/dsh-experimental-rich-inline` 的自定义组合中挂载 `@deepseek-ai/dsh-session-projection`。随附的 base profile 已包含该服务。
2. 等待插件激活，然后验证 Session 可以领取并结束 Rich Inline 操作。
