---
kind: upgrade-guide
description: "包含 rich-inline 源码投影的 Session 恢复时需要所属解释器。"
---

# 为已投影的 Session 保留 rich-inline

[English](guide.md) | 中文

## 变更

较大的已结算 `rich-html` 消息以及成功发布或状态更新的参数在审计日志中保留完整源码，后续模型请求使用限定范围的引用。插件记录必读型的消息投影 `rich-inline/source-offload` 和 `rich-inline/tool-offload`。旧构建不认识这些事件。禁用或移除解释器会使受影响 Session 的模型历史重建明确失败，不会静默发送另一份对话。普通显示继续使用原始发布事实。

安装包遵循当前发布文件规范，不再包含仓库中的 `examples/*.ts` 文件。示例仍保留在仓库中，导出的 `theme` API 和构建后的运行时继续可用。

## 迁移

1. 一起升级 Host 和 rich-inline 包；恢复含有源码卸载事件的 Session 时保留启用的插件。只读源码访问使用 `rich_inline_read`，引用不授予动作或跨 Session 访问权限。
2. 保留原始 Session 日志。若部署不需要新增卸载决策，将 `sourceOffloadMinBytes` 设为超过该部署最大发布和工具参数字节数的值；已有决策仍需解释器。撤销代码补丁不会降级这些日志。
3. 确认重开的 Session 派生出相同引用，所需源码片段仍能读取。用量统计和限定参见包的[参考说明](../../../../packages/experimental/rich-inline/README.zh.md#usage-source)。
4. 从仓库读取创作示例，并从 `@deepseek-ai/dsh-experimental-rich-inline/theme` 导入主题 helper，不再从安装包读取 TypeScript 示例。
