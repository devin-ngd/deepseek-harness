---
kind: upgrade-guide
description: "Python SDK 在上一次运行时的读取线程尚未退出时拒绝重启。"
---

# Python SDK 重启等待旧读取线程

[English](guide.md) | 中文

## 变更

调用 `DeepSeekHarness.close()` 或 `HarnessClient.close()` 后，若上一运行时的读取线程仍在关闭，重新启动同一实例现在会抛出 `deepseek_harness.errors.TransportClosedError`。此前重启可能收到上一运行时的通知或请求。

## 迁移

1. 如果应用在 `close()` 后复用实例，请捕获 `start()` 或触发延迟启动的操作抛出的 `TransportClosedError`，在旧读取线程退出后重试，并由应用限制重试次数。也可以使用独立的新实例。
2. 确认重启成功，且通知和审批请求来自新的运行时。
