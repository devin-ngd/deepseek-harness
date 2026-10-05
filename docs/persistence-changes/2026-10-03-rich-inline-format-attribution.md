---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-03-rich-inline-format-attribution

English | [中文](2026-10-03-rich-inline-format-attribution.zh.md)

## Summary

Adds rich-inline-format source attribution for fully logged, bounded output-format feedback.

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
    previous: "2026-09-21-user-question-reply"
    after: "49c7cf1ab9c34ddc5edae7b8875aec60dad4b214713b00c734a87a9083bc5d41"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-21-user-question-reply"
    after: "aaecf17bd453b5bfad4e4c1211efd611b3ceb6f71564666420e982072b5ac694"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-21-user-question-reply"
    after: "61a309c094c51106bbfcfc0648c5d47ecbdb0d5d20a46c0b8f0a880053fc85a9"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-21-user-question-reply"
    after: "a05bc7d633ccb9a0bd7c8d7468ee69cbb7d27e0f7e0aa880bf77d7a5879d3cdb"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Session format V4 is unchanged. Existing readers preserve unknown source kinds and continue to read the complete correction from message content. Only the owning plugin consumes this kind to count correction attempts and deny business tools during formatting; it grants no authority and changes no model roles. Existing records remain valid, and mounting historical content does not enqueue corrections.

<a id="verification"></a>
## Verification

The focused rich-inline Host and format suites passed 26 tests, including historical mounts, bounded logged correction, denied tool execution, admission of a new human prompt, reconstructed correction claims, and plugin disposal. The Electron chat acceptance test passed 24 checks with a deterministic model, including one format correction and native local filtering; no paid model was used in this regression.

<a id="dev-note"></a>
## Dev Note

None.
