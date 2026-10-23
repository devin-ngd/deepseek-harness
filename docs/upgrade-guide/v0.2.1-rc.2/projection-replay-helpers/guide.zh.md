---
kind: upgrade-guide
description: "自定义调用方改用已有的消息投影与回放校验接口。"
---

# 使用已有的投影与回放接口

[English](guide.md) | 中文

## 变更

移除此分支新增的 `SessionSurface.projectedMessages` 访问器和格式目录对 `imageOffloadProjection` 的转出口。Session 实例保留已有的 `deriveEventMessage(event)` 方法，独立折叠仍返回消息投影结果。

移除快照帮助函数 `startOfflineSnapshotEntry` 和 `startPreparedOfflineSnapshot`。对应校验函数保留，`OfflineSnapshotEntry` 不再接收未使用的 `composition` 字段。

## 迁移

1. 计量保留节点时保存原始不可变事件，调用 `session.deriveEventMessage(event)` 读取其当前投影消息。从 `@deepseek-ai/dsh-compaction-image-offload/projection` 导入 `imageOffloadProjection`。
2. 在导入 fixture 或构造 SDK 运行器前调用 `requireOfflineSnapshotEntry`，并将其声明传给场景。调用一次 `prepareOfflineSnapshot`，使用预检后的 fixture 构造 Harness。删除入口校验实参中的 `composition`。
3. 验证投影计量和受保护的 SDK 回放场景。保留显式回放模式、有限的路由与调用预算，以及全部离线标记。
