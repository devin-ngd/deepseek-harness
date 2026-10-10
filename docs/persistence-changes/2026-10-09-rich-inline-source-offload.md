---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-09-rich-inline-source-offload

English | [中文](2026-10-09-rich-inline-source-offload.zh.md)

## Summary

Adds rich-inline source-offload and tool-offload decisions identifying immutable authored source or successfully confirmed replacement arguments by sequence, position, SHA-256 and block revisions.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing Session records remain valid with no structural format version change. Both new events are required-on-read and require their owning plugin interpreters. Older builds refuse these events and interpreter removal fails explicitly. Original messages and tool arguments remain available for source reading, audit history and read-only forks. Code rollback does not downgrade persisted decisions.

<a id="verification"></a>
## Verification

The selected rich-inline, Chat, plan and desktop suites passed 427 tests, including failed or unsettled calls, argument preservation, bounded source reads, replay refusal, interpreter revocation and image-projection composition. The rich-inline-source SDK replay passed with four independently authored responses and zero live dispatches; actual adapter messages verify source offload and mandatory working-directory context. The same process acknowledged session/wait and shutdown, then exited with code 0. Python SDK output and the remaining SDK scenario matrix were not run. An earlier SDK attempt reached a live provider; separate incident evidence retains its reported usage with unknown cost.

<a id="dev-note"></a>
## Dev Note

None.
