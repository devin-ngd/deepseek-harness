---
kind: reference
description: Phone history capacity, bounded canonical windows, cleanup guarantees and rc2.33 verification limits.
---

# Phone history capacity

English | [中文](history-capacity-rc2.33.zh.md)

The phone's observed failing Session remains connected and reports `unknown-outcome`. Its recent 50-message window contains 1,194,036 bytes of records before the snapshot and carrier metadata, exceeding the previous 1 MiB desktop response limit. A read-only scan of 194 local v4 Sessions finds 64 recent windows above 1 MiB, five above 2 MiB, and a largest record payload of 3,155,761 bytes. These sizes exclude snapshot projections and transport metadata; they establish a capacity mismatch, not phone memory or speed.

## Candidate limits

| Owner | Limit |
| --- | --- |
| Desktop canonical opening and phone domain | 4 MiB |
| Desktop response, phone decoded packet and encrypted plaintext | 5 MiB |
| Native crypto input | 5 MiB |
| Encrypted frame on both endpoints and relay | 8 MiB |
| Endpoint incoming queue and relay buffering | 16 MiB |
| Native lifetime send allowance | 64 MiB |
| Opening history | 50 messages and 512 records |
| Per text or arguments field | 262,144 UTF-16 units |

The source phone configuration remains disabled. The desktop example is a configuration template, not an installed-profile update. Deployment must preserve the current host, identities, pairing, routes and other settings, applying only the listed capacities to both endpoints and the existing relay configuration. A partial update still encounters the smallest remaining limit.

The desktop reads progressively smaller canonical message windows when bytes or record counts exceed the opening budget. It closes each rejected subscription before reopening, retains canonical `hasMore`, and neither splits nor discards individual records inside the chosen window. A single-message window that remains too large returns `history-too-large`; the phone directs the user to the desktop and permits another Session selection. The product page does not yet offer older-history pagination.

Each phone follow queue is bounded by both frame count and the decoded-packet byte budget. Other record, text, block, request, expiry and frame-count protections remain active. Cancelling a wait on an already retired crypto binding sends no new unsubscribe; the native channel owner still awaits resource cleanup, and actual active-send or resource-release failures remain failures. This removes one reproducible false-cleanup path; the original phone's cleanup report has not yet been reverified with this candidate.

## Verification

The source window/queue checks, connection diagnostics and cancellation regressions pass. The encrypted local service replay covers a roughly 3 MiB history without shrinking, a history above 4 MiB with a smaller canonical opening, ordered delivered text and return to another Session. It uses synthetic Sessions, fixed replay and loopback sockets. Strict source/integration types and the official API26 unsigned build pass; SDK warnings remain in the build log.

The coordinated desktop rc2.33 and local emulator deployment additionally reopened the old “MVP体验” history with rich content, returned to another Session and completed a new message. The emulator adapter, local relay and native candidate use the current shared capacities; the common mobile core and page are copied unchanged. See [coordinated acceptance](../evidence/mobile-coordinated-20261102.json). The physical phone and public relay remain unchanged; the original phone failure, physical memory peaks, load latency and background recovery remain unverified. Current reports are retained under `evidence/`; the earlier unsigned candidate under `.build/native-controls-device-rc2-33/` predates the integrated connection fixes.
