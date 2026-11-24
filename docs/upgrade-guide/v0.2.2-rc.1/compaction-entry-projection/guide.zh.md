---
kind: upgrade-guide
description: "自定义组合中的基本压缩要求 Session 投影服务。"
---

# 基本压缩要求 Session 投影

[English](guide.md) | 中文

## 变更

以 Cordis 插件挂载 `@deepseek-ai/dsh-compaction-basic` 时需要 `sessionProjections`。服务在接受工作前注册仅供 Host 使用的事务投影。对尚未准备的 Session 直接调用压缩时，服务会先等待恢复完成，再检查事务锁并开启事务。

## 迁移

1. 在挂载 `@deepseek-ai/dsh-compaction-basic` 的自定义组合中挂载 `@deepseek-ai/dsh-session-projection`。随附的 base profile 已包含该服务。
2. 等待插件完成激活后再调用压缩。确认压缩服务成功挂载，且空闲 Session 可以执行 `/compact`。
