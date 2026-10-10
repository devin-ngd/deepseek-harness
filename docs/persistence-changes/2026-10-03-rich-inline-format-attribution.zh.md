---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-03-rich-inline-format-attribution

[English](2026-10-03-rich-inline-format-attribution.md) | 中文

## 概述

在保留上游工作目录归属记录的基础上，增加 rich-inline-format 归属类型。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-03-rich-inline-format-attribution
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-05-working-directory-attribution"
    after: "d549a96998d9c3785a72c58e635d4d324037a085148e8aecfbd4747531db5b25"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "c48492703e9e1a5db07bc938cf17b3632df31ea8367d0923c243f7e4a31781c6"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-07-title-reasoning-effort"
    after: "74975b4277515eae173b486b4b4ce014f35b53c1eee9843746a9eacf45dd324a"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "1cfeca32c03ae604b6405890ba1737a231fd08405ca832d9b22b31d55ae9875d"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

Session 格式仍为 V4。新旧读取方向均保留未知归属类型，并读取完整消息内容。工作目录类型仍由生产者标注归属。只有 rich-inline 插件消费 rich-inline-format，以计数有上限的格式修复并在修复期间拒绝业务工具；它不授予权限，也不改变模型角色。既有记录仍然有效，历史挂载不会提交修复。这个尚未接受的末端确认记录接续上游工作目录确认记录，已定稿记录保持不变。

<a id="verification"></a>
## 验证

选定的 rich-inline、Chat、计划和桌面测试共 427 项通过。rich-inline-source SDK 回放通过，使用四次固定模型响应、零真实分派，并验证必要工作目录上下文、session/wait、shutdown 和进程退出码 0。原生 Electron 验收单独检查；单元模拟和 SDK 文本回放不证明原生 GUI 行为。

<a id="dev-note"></a>
## 开发备注

无。
