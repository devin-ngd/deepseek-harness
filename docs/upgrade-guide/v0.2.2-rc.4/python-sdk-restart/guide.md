---
kind: upgrade-guide
description: "Python SDK restart rejects a previous runtime whose reader threads are still closing."
---

# Python SDK restart waits for previous readers

English | [中文](guide.zh.md)

## Change

After `DeepSeekHarness.close()` or `HarnessClient.close()`, restarting the same instance now raises `deepseek_harness.errors.TransportClosedError` if the previous runtime's reader threads are still closing. Previously a restart could deliver notifications or requests from the previous runtime.

## Migration

1. If your application reuses an instance after `close()`, catch `TransportClosedError` from `start()` or the lazy-starting operation and retry after the previous readers finish, with an application-owned retry limit. A separate new instance is also an option.
2. Verify that restart succeeds and that notifications and approval requests belong to the new runtime.
