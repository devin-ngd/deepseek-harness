---
kind: upgrade-guide
description: "Sessions that only ran a slash command stay in the session list; blankness projection caches at state version 1 are reinterpreted or recomputed."
---

# Command-only Sessions remain listed

English | [中文](guide.zh.md)

## Change

Before, the session-list blankness bit cleared only on `turn/start`, so a Session whose log held only a submitted slash command (`command/run`) was treated as an empty draft: hidden from the list and eligible for New Session reuse. Starting with this release, a committed `command/run` also clears blankness, so a command waiting for confirmation remains discoverable after navigating away. The `sessionListMetadata` projection moves to state version 2; persisted version-1 cache rows that already saw a turn still serve, still-blank version-1 rows and missing rows are answered by a bounded Agent-free log recompute (at most `SESSION_COLD_RECOMPUTE_EVENT_LIMIT` events per cold row), and an undecidable row keeps the Session visible rather than hidden.

Anyone with Sessions that only ran commands sees them listed after the upgrade; genuinely empty drafts stay hidden.

## Migration

1. No action is required. The first `session.list` after the upgrade recomputes undecided cold rows once and refreshes their persisted projection cache; oversized or unreadable logs stay visible until their Session is opened.
2. Confirm a healthy upgrade by opening the session list: command-only Sessions appear under their last activity, empty drafts do not, and no Session is duplicated.
