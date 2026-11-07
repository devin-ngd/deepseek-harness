---
kind: upgrade-guide
description: "工作区归档变更响应返回调用者可见的已归档会话 ID。"
---

# 工作区归档变更结果遵循调用者的访问权限

[English](guide.md) | 中文

## 变更

`workspace.archiveSession` 和 `workspace.unarchiveSession` 原先返回完整的 `archivedSessionIds` 数组。现在响应包含调用者可见的已归档会话 ID。Owner 仍收到完整数组。

## 迁移

1. 将这两个方法返回的 `archivedSessionIds` 存入调用者的工作区视图。使用该视图的 `workspace.follow` 流刷新当前权限内的归档集合。
2. 用只能访问两个已归档会话中一个的调用者测试。变更响应只包含可见 ID。两个会话均已归档时，Owner 的响应包含两个 ID。
