---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-09-rich-inline-source-offload

[English](2026-10-09-rich-inline-source-offload.md) | 中文

## 概述

新增 rich-inline source-offload 和 tool-offload 决策，以序号、位置、SHA-256 和块版本标识不可变的创作源码或成功确认的替换参数。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-09-rich-inline-source-offload
baseline: false
changes:
  - root: "event:rich-inline/source-offload"
    previous: null
    after: "cd16f43e1a0118ef5212096132eb89feb67955757b2215ed5d8b72b9db222e94"
    decision: same-version
  - root: "event:rich-inline/tool-offload"
    previous: null
    after: "78dc1a7de868ba84365365894746f1212987a775abe2adcfd0cb765275c996bd"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

原有 Session 记录仍有效，不改变结构性格式版本。两个新事件均为必读型，必须保留所属插件解释器。旧构建拒绝这些事件，移除解释器会明确失败。原始消息和工具参数继续供源码读取、审计历史和只读分支使用。撤销代码不会降级已持久化的决策。

<a id="verification"></a>
## 验证

选定的 rich-inline、Chat、计划和桌面测试共 427 项通过，包括失败或未结算调用、参数保留、有上限的源码读取、回放拒绝、解释器撤销和图像投影组合。rich-inline-source SDK 回放通过，使用四次独立编写的响应、零真实分派；实际 adapter messages 验证源码精简和必要工作目录上下文。同一进程确认 session/wait 和 shutdown，随后以退出码 0 结束。Python SDK 输出和其余 SDK 场景矩阵未运行。较早一次 SDK 尝试曾访问真实提供商；独立事件证据保留了其已报告用量，费用未知。

<a id="dev-note"></a>
## 开发备注

无。
