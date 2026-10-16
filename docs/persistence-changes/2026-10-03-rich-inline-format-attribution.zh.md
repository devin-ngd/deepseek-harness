---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-03-rich-inline-format-attribution

[English](2026-10-03-rich-inline-format-attribution.md) | 中文

## 概述

为同时支持 user-rpc principal 归属的消息来源加入 rich-inline-format 归属。

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
    previous: "2026-10-13-user-rpc-principal"
    after: "058d1c15434a3106dbd18660d95a720dbc3331381b0fd12979e2db3b846d9ffe"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "037ed2593911c74bd680ee4657a8dfc969a389fe4c79f540643abc9fefbc0de6"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-user-rpc-principal"
    after: "f6442fed975bf80bbc07a48e10c543feba1f8f10c472efa837db0121ec6f45d3"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "3006d32caea1ec8402c8c78f4370698be42b8b00ebb2a965cd8dcb004945b5b7"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

Session 格式仍为 V4。新旧读取方向均保留未知归属类型，并读取完整消息内容。user-rpc 的 principal 仍为可选，缺失时保留 owner 语义。只有 rich-inline 插件消费 rich-inline-format，以计数有上限的格式修复并在修复期间拒绝业务工具；该归属不授予权限，也不改变模型角色。既有记录仍然有效，历史挂载不会提交修复。

<a id="verification"></a>
## 验证

选定的 rich-inline Host、校验器和 controller 测试共 56 项通过，包括真实 Gateway/RemoteAccess/Peer 授权及 Session 与 mount 归属检查。rich-inline-source SDK 回放通过，使用四次固定响应和零真实分派。原生 GUI 与手机验收单独进行。

<a id="dev-note"></a>
## 开发备注

无。
