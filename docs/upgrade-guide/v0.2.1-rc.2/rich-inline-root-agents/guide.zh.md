---
kind: upgrade-guide
description: "Rich-inline 工具与格式要求仅对主 Agent 开放。"
---

# Rich-inline 仅服务主 Agent

[English](guide.md) | 中文

## 变更

子 Agent 不再接收 rich-inline 创作指引、格式提醒、自动格式修复或任何 `rich_inline_*` 工具，包括源码回读。无论 `activePresets` 及可选创作策略如何配置均执行此限制。主会话保留配置的创作行为，已有卡片仍可查看。

自定义问题表单使用标准 `conversation.composer` 链。此分支增加的 `conversation.question.content` 槽位和 `ui-user-questions/client` 值导出 `planReviewOf`、`parseRecommendedLabel` 已移除。Rich-inline 通过现有待处理交互对象保留问答和可编辑计划行为。

## 迁移

1. 从子 Agent 指令中移除 rich-inline 调用和 HTML 展示要求，改为向主 Agent 返回简短内部报告及文件或结果引用。
2. 面向用户的 rich-inline 交互保留在主 Agent 中。验证 spawn 或 fork 子代理的原生和 PTC 工具列表均不含 rich-inline，且直接调用会被拒绝。
3. 若自定义表单使用了 `conversation.question.content`，将其注册到 `conversation.composer`，优先级排在默认问题表单之前，并在 `pendingInteraction.kind` 为 `question` 或 `plan-review` 时选取该对象。`PendingQuestion` 仅作类型导入，通过注入的 keyed hook 绑定其状态。验证回答、批准计划、取消操作，以及禁用插件后的普通面板回退。
