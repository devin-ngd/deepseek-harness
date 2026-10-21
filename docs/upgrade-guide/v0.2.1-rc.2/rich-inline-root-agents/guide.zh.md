---
kind: upgrade-guide
description: "Rich-inline 工具与格式要求仅对主 Agent 开放。"
---

# Rich-inline 仅服务主 Agent

[English](guide.md) | 中文

## 变更

子 Agent 不再接收 rich-inline 创作指引、格式提醒、自动格式修复或任何 `rich_inline_*` 工具，包括源码回读。无论 `activePresets` 及可选创作策略如何配置均执行此限制。主会话保留配置的创作行为，已有卡片仍可查看。

## 迁移

1. 从子 Agent 指令中移除 rich-inline 调用和 HTML 展示要求，改为向主 Agent 返回简短内部报告及文件或结果引用。
2. 面向用户的 rich-inline 交互保留在主 Agent 中。验证 spawn 或 fork 子代理的原生和 PTC 工具列表均不含 rich-inline，且直接调用会被拒绝。
