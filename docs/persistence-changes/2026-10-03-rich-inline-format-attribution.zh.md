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
    previous: "2026-10-27-retry-control-input"
    after: "22677bfa6ac8f0cc4ef872a2c011376ee362b7987c756501ed395a915baa06d6"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-27-retry-control-input"
    after: "48b0bcad187955b249b78475619835d82fe929bef9c08862ef3af98446a6365e"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-27-retry-control-input"
    after: "47755e72890708060cb50817b1c572c04c7baeff99095c7c12b64f0e32b1a54d"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-27-retry-control-input"
    after: "0266ce3326fc9596621fb35a5054c136cdab5c180fd997ef81a6962ea9640546"
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
