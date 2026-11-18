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
    previous: "2026-11-05-timeline-priority-notice"
    after: "6b71255f4888df3b38e0361aa3a33274f7ed69ae4e296d2a7e9b4f96c0268536"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-11-05-timeline-priority-notice"
    after: "31a1731ac8010511e9c17f794404399d95cbac63b4c2e025be32c2a285feb91a"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-11-05-timeline-priority-notice"
    after: "b6abe4f84f25021c62f767d34cb1da2d3c971933239fcf2aa38aa78f124f0007"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-11-05-timeline-priority-notice"
    after: "bd0965134bbc6c171c84741aa3b38b7c2d8a0300ff482115671455f52e5bc342"
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
