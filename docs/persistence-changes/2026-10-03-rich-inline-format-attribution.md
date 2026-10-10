---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-03-rich-inline-format-attribution

English | [中文](2026-10-03-rich-inline-format-attribution.zh.md)

## Summary

Adds rich-inline-format attribution alongside the working-directory attribution retained from the upstream history.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-03-rich-inline-format-attribution
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-05-working-directory-attribution"
    after: "d549a96998d9c3785a72c58e635d4d324037a085148e8aecfbd4747531db5b25"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "c48492703e9e1a5db07bc938cf17b3632df31ea8367d0923c243f7e4a31781c6"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-07-title-reasoning-effort"
    after: "74975b4277515eae173b486b4b4ce014f35b53c1eee9843746a9eacf45dd324a"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "1cfeca32c03ae604b6405890ba1737a231fd08405ca832d9b22b31d55ae9875d"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Session format V4 is unchanged. Both reader directions preserve unknown attribution kinds and read complete message content. The working-directory kind remains producer-owned attribution. Only the rich-inline plugin consumes rich-inline-format to count bounded correction attempts and deny business tools during formatting; it grants no authority and changes no model roles. Existing records remain valid, and historical mounts do not enqueue corrections. This unaccepted terminal acknowledgement follows the upstream working-directory acknowledgement; finalized records remain unchanged.

<a id="verification"></a>
## Verification

The selected rich-inline, Chat, plan and desktop suites passed 427 tests. The rich-inline-source SDK replay passed with four fixed model responses, zero live dispatches, mandatory working-directory context, session/wait, shutdown and process exit code 0. Native Electron acceptance is checked separately; unit mocks and SDK transcript replay do not establish native GUI behavior.

<a id="dev-note"></a>
## Dev Note

None.
