---
kind: reference
description: Local native logging self-check and its collection evidence.
---

# Local log self-check

## Summary

The phone page has a local logging self-check button. It requests one fixed INFO record, `DSH_LOG_PROBE=local-only`, through the existing native diagnostic sink. Its page result acknowledges the logging call; collection success requires a separate same-process record.

## Collection

The collector selects only the original App PID, this exact marker and a bounded time interval. The tested filter constructs only approved timestamps, the selected PID, a closed stage enum and bounded counters. Unknown fields, raw exceptions and message bodies are not projected.

## Qualification

The actual diagnostic/page regressions pass 14/14, strict types have zero diagnostics, and the official API26 compiler accepts the independent rc2.15 candidate. Original-certificate signing, profile verification and exact 23-entry application payload parity pass. The original phone was updated in place to rc2.15 using the original certificate; the UID is unchanged. Owned startup shows paired and disconnected, without a startup recovery failure. Binding and history byte sizes match the pre-update public metadata. One approved no-network self-check was performed and passed: PID 40712 emitted the fixed probe at 2026-10-27T08:54:30.243Z, the page acknowledged the logging call, and the bounded whitelist collector accepted exactly one matching record. Its actual scoped filter passed 13 tests and 10,000 synthetic inputs. The owned log reader exited and the phone remained paired and disconnected, with unchanged binding/history sizes. Earlier empty results from isolated execution were not reliable evidence of host USB absence; normally reviewed host access confirmed the existing HDC server and original Connected device. See [qualification evidence](../evidence/log-selfcheck-rc2.15.json).

## Scope

The button updates only its in-memory diagnostic result and emits the fixed record. Existing host consent, identity, binding, route and task actions retain their guards. Desktop and relay changes and another connection window are outside this self-check.
