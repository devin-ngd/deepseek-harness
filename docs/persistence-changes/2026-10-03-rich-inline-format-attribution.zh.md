---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-03-rich-inline-format-attribution

[English](2026-10-03-rich-inline-format-attribution.md) | 中文

## 概述

为完整记录、次数受限的输出格式反馈添加 rich-inline-format 来源标记。

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
    previous: "2026-09-21-user-question-reply"
    after: "49c7cf1ab9c34ddc5edae7b8875aec60dad4b214713b00c734a87a9083bc5d41"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-21-user-question-reply"
    after: "aaecf17bd453b5bfad4e4c1211efd611b3ceb6f71564666420e982072b5ac694"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-21-user-question-reply"
    after: "61a309c094c51106bbfcfc0648c5d47ecbdb0d5d20a46c0b8f0a880053fc85a9"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-21-user-question-reply"
    after: "a05bc7d633ccb9a0bd7c8d7468ee69cbb7d27e0f7e0aa880bf77d7a5879d3cdb"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

会话格式 V4 保持不变。已有读取方保留未知来源类型，并从消息正文读取完整纠正指令。只有所属插件消费该标记，用于统计纠正次数以及在格式纠正期间禁止业务工具；该标记不授予权限，也不改变模型角色。已有记录仍然有效，挂载历史内容不会排队触发格式纠正。

<a id="verification"></a>
## 验证

rich-inline Host 与格式专项测试共 26 项通过，覆盖历史挂载、次数受限且已记录的纠正、工具执行拒绝、新用户消息入场、恢复后的纠正来源以及插件释放。Electron 聊天验收使用确定性模型通过 24 项检查，包含一次格式纠正和原生本地筛选；本轮回归未使用付费模型。

<a id="dev-note"></a>
## 开发备注

无。
