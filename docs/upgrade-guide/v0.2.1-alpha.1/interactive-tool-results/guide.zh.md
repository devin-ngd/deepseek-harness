---
kind: upgrade-guide
description: "严格的工具结果解码器需要接受批准后的计划和文档数据版本字段。"
---

# 交互工具结果

[English](guide.md) | 中文

## 变更

`exit_plan_mode` 返回 `{ approved: true, plan: string }`，并在渲染后的确认文本中包含该计划。批准回答带有可选 `reviewedPlan` 时使用用户编辑后的计划；普通批准使用原有参数。`custom` 仍表示审查反馈。`rich_inline_publish` 还返回 `dataRevision`；`rich_inline_update` 使用页面和数据版本，只替换数据，不替换页面代码。使用严格结果解码器的接入方需要接受这些字段。

## 迁移

1. 更新 `exit_plan_mode` 结果解码器，接受 `plan` 并执行返回的计划。调用时继续传入原有 `plan` 参数。
2. 更新 `rich_inline_publish` 结果解码器，接受 `dataRevision`。调用 `rich_inline_update` 时将它与 `renderRevision` 一起使用。
3. 替换实验插件安装包前先重新构建 DSH：HTML 表单和实时进度需要新的 Chat 注册服务和问题内容槽。将 profile 的 `rich-inline.config.activePresets` 设为 `[]` 可启用所有模式。`htmlQuestions` 和 `compactLiveProcess` 默认均为 `true`。
4. 重新启动 Desktop，确认编辑后的计划出现在已入档工具结果和下一次 Agent 请求中。[包使用说明](../../../../packages/experimental/rich-inline/README.zh.md) 介绍安装与配置。
