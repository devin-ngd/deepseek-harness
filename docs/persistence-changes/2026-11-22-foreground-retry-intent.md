---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-22-foreground-retry-intent

English | [中文](2026-11-22-foreground-retry-intent.zh.md)

## Summary

Adds optional foreground intent to RPC-origin user and manual continuation messages.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-22-foreground-retry-intent
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-03-rich-inline-format-attribution"
    after: "013f3af87522b312422fbdf18f6bd9a11ba7304b98996bc02abfa31020f8d63a"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-03-rich-inline-format-attribution"
    after: "29e9072d17d6ea3849007d4024b37cb79e51a7b8db3a6cff353dcaa8c96a3038"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-03-rich-inline-format-attribution"
    after: "f9a61564f513cc2b73a4f7adaa41ca002de217365a31f546a94232e5bc434e43"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-03-rich-inline-format-attribution"
    after: "5dfa01cc138778c39070ec379fc03185d9e92ea956183b8962e5e567a81cfde4"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Older records omit the field and keep the existing retry policy. Older readers can retain the additional source metadata without treating it as a new event or permission; this is not a downgrade guarantee.

<a id="verification"></a>
## Verification

Focused Session RPC, retry, cancellation, and Loader fixture tests pass without model calls.

<a id="dev-note"></a>
## Dev Note

None.
