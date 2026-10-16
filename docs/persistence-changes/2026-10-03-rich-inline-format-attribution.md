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
    previous: "2026-10-13-user-rpc-principal"
    after: "058d1c15434a3106dbd18660d95a720dbc3331381b0fd12979e2db3b846d9ffe"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "037ed2593911c74bd680ee4657a8dfc969a389fe4c79f540643abc9fefbc0de6"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-user-rpc-principal"
    after: "f6442fed975bf80bbc07a48e10c543feba1f8f10c472efa837db0121ec6f45d3"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "3006d32caea1ec8402c8c78f4370698be42b8b00ebb2a965cd8dcb004945b5b7"
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
