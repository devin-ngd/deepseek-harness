---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-03-rich-inline-format-attribution

English | [中文](2026-10-03-rich-inline-format-attribution.zh.md)

## Summary

Adds rich-inline-format attribution to message sources that also support user-rpc principal attribution.

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
## Compatibility

Session format V4 is unchanged. Both reader directions preserve unknown attribution kinds and read complete message content. The user-rpc principal remains optional and absence retains owner semantics. Only the rich-inline plugin consumes rich-inline-format to count bounded correction attempts and deny business tools during formatting; the attribution grants no authority and changes no model roles. Existing records remain valid, and historical mounts do not enqueue corrections.

<a id="verification"></a>
## Verification

The focused rich-inline Host, validator and controller selection passed 56 tests, including real Gateway/RemoteAccess/Peer authorization and Session-to-mount checks. The rich-inline-source SDK replay passed with four fixed responses and zero real dispatches. Native GUI and mobile acceptance remain separate.

<a id="dev-note"></a>
## Dev Note

None.
