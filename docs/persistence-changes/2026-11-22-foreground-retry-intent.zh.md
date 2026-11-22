---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-22-foreground-retry-intent

[English](2026-11-22-foreground-retry-intent.md) | 中文

## 概述

为 RPC 用户消息和手动继续消息增加可选的前台意图。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-22-foreground-retry-intent
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-03-rich-inline-format-attribution"
    after: "013f3af87522b312422fbdf18f6bd9a11ba7304b98996bc02abfa31020f8d63a"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-03-rich-inline-format-attribution"
    after: "29e9072d17d6ea3849007d4024b37cb79e51a7b8db3a6cff353dcaa8c96a3038"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-03-rich-inline-format-attribution"
    after: "f9a61564f513cc2b73a4f7adaa41ca002de217365a31f546a94232e5bc434e43"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-03-rich-inline-format-attribution"
    after: "5dfa01cc138778c39070ec379fc03185d9e92ea956183b8962e5e567a81cfde4"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

旧记录没有该字段时继续使用原重试策略。旧读取器可以保留额外的来源元数据，无须将其视为新事件或权限；这不保证降级兼容。

<a id="verification"></a>
## 验证

会话 RPC、重试、取消和 Loader 离线夹具的针对性测试通过，未调用模型。

<a id="dev-note"></a>
## 开发备注

无。
