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
## Compatibility

Session format V4 is unchanged. Both reader directions preserve unknown attribution kinds and read complete message content. The user-rpc principal remains optional and absence retains owner semantics. Only the rich-inline plugin consumes rich-inline-format to count bounded correction attempts and deny business tools during formatting; the attribution grants no authority and changes no model roles. Existing records remain valid, and historical mounts do not enqueue corrections.

<a id="verification"></a>
## Verification

The focused rich-inline Host, validator and controller selection passed 56 tests, including real Gateway/RemoteAccess/Peer authorization and Session-to-mount checks. The rich-inline-source SDK replay passed with four fixed responses and zero real dispatches. Native GUI and mobile acceptance remain separate.

<a id="dev-note"></a>
## Dev Note

None.
