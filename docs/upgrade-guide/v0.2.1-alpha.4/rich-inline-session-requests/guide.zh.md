---
kind: upgrade-guide
description: "Rich Inline 挂载 RPC 请求需要显式 Session 身份以执行资源权限检查。"
---

# Rich Inline 挂载请求声明所属 Session

[English](guide.md) | 中文

## 变更

只发送 `mountId` 的 Rich Inline RPC 客户端还须发送 `sessionId`。受影响的方法为 `snapshot`、`snapshotIfChanged`、`reportRender`、`saveDraft`、`invoke`、`status`、`registerFile`、`applyUpdate` 和 `dispose`。Gateway 在派发前检查所请求的 Session；Session 与挂载记录的所属者不一致时，Host 拒绝请求。缺少身份时直接拒绝，不选择默认 Session。

guest 的 `lumina-rich/1` 消息和持久化的发布、草稿、动作沿用现有格式。生成脚本不能选择 Session。完整原生渲染仍需要 Rich Inline 的 Desktop 接入。

## 迁移

1. 同时更新 Host 插件与可信 Client，再刷新已连接页面。官方插件 Update 先移除旧包再安装替代包；自定义安装器须保留该顺序，并处理 restart-required 结果。
2. 在所有受影响的 RPC 请求中，将可信当前 Session 的 `sessionId` 放在 `mountId` 旁。处理 guest 数据后再附加该值，不从生成脚本读取。重连或销毁旧挂载时，请求继续携带对应身份。
3. 非 owner 传输须传入经过认证的 Peer，并为该 Session 上每个允许的 `richInline/<method>` 动作提供策略授权。全局授权不授予 Session 权限。审批回答继续由现有获授权客户端处理。
4. 验证已授权快照可读取、未授权 Session 被拒绝、Session 与挂载不匹配被拒绝、已销毁 Peer 无法调用 Gateway。再通过更新后的 Client 检查草稿保存、动作重试和刷新。
