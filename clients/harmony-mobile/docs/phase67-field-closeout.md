# Native pairing verified; connection acceptance blocked

This reference records the completed field window. The original installed alpha.4 HAP, phone HUKS identity, desktop DPAPI identity and single fixed-replay Session remain intact. No build was signed or installed in this window. The native phone produced a 71-byte enrollment signature, the desktop verified it, and the phone saved the exact reviewed public pairing record.

The grant was valid from 2026-10-16T13:47:36.182Z to 2026-10-16T14:17:36.182Z, without renewal. Cleanup revoked it at 14:04:08.527Z, before expiry. The durable desktop record is revoked at epoch 2, with zero active grants. The field profile exited with code 0 and reported successful resource cleanup. The phone's native Exit retained its original process, so the same owned bundle process was stopped; its final PID is absent. Shared official HDC PID 20964 remains on 127.0.0.1:8710.

The relay uses its original configuration and server bytes. The temporary systemd override is absent, the original broker is disabled, and its configuration contains no field pair. The temporary public pair, configuration, journal and head remain preserved for recovery; they are not loaded by the restored service. No relay tombstone was written, and the inactive temporary pair retains its original 14:17:36.182Z expiry. Do not reactivate it. The desktop grant is already revoked.

| Acceptance item | Actual evidence |
| --- | --- |
| Original HUKS key and desktop identity | Matched; no replacement |
| Native challenge signature and desktop verification | Passed |
| Native fingerprint, scope and host confirmation; local pairing | Passed |
| Native connection and catalogue | Blocked: phone remained disconnected |
| Task, stream and ArkWeb action on the real phone | Not reached |
| Live reconnect, duplicate suppression and cancellation | Not reached |
| Revocation and owned process cleanup | Verified |
| Fixed Session and model budget | Session bytes unchanged; 0 user messages, 0 replay calls, 0 real model calls |

The failing stage remains unknown. Native connection logging exposed no diagnostic category. A second Connect selection produced the generic incomplete-operation notice; no task was submitted. The original relay listener was present, and sampled backend connections were zero. An uncredentialed desktop HTTPS request verified TLS; the control upgrade route denied missing pairing headers with HTTP 403. These checks establish neither native NetworkKit TLS nor native control, E2E or device-proof success. The screenshot command produced no image and supplies no visual evidence.

The next independent work is to expose bounded, content-free connection stages and refusal codes in both native and desktop owners, report terminal recovery in the native UI, and require observed plugin/transport readiness before the field entry prints ready. Validate acquisition, authentication, callback and cleanup failures with fixed substitutes before preparing another candidate. No new signing, installation, grant or relay activation is authorized by this completed window.

Before another enrollment, validate recovery with the preserved phone public record and relay journal. The current product only permits exact saved-record resume; a changed grant is rejected, and an expired public record blocks load. Relay pair generation and device grant epoch have separate owners. A successor flow needs explicit comparison and monotonic history checks; it must not clear data, recreate keys, reset history or equate those two counters implicitly. This recovery path was not exercised and is not an established cause of the connection failure.

Evidence is consolidated in [the closeout record](../evidence/phase67-closeout.json), with [desktop cleanup](../evidence/phase67-desktop-cleanup.json), [fixed replay counters](../evidence/phase67-fixed-result.json), [phone cleanup](../evidence/phase67-phone-cleanup.json), [public upgrade denial](../evidence/phase67-public-upgrade-denial.json), and [native pairing review](../evidence/phase67-pair-reviewed.json). The closeout collector checks the original Session hash, revoked grant, absent processes, restored relay metadata and preserved journal/head. Earlier [grant progress](phase67-grant-progress.md) is a historical checkpoint.
