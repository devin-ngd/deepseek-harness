# Ninth-round native socket recovery

This reference records the approved API26 emulator socket recovery test using the unchanged [v27 HAP](../evidence/phase28-hap.json). The native case passes under the existing checkpoint criterion; the earlier socket and initial-read failures remain unchanged. [The summary](../evidence/phase28-summary.json) and [artifact index](../evidence/phase28-artifact-index.json) preserve the observations and cleanup.

## Observed result

The initial native read uses command `native-core-c9c04fdb-318b-419e-a628-4e9b9509b36a-1`. Its reset is decoded and admitted with relay cursor -1, durable cursor 35, connected state and readonly false. Native received and delivered 76,088 bytes with clean EOF. The payload SHA-256 matches the previously captured source reset; diagnostic validation no longer closes the private port.

The injected socket reset is written for command -7. Native receives and delivers its 76,009 bytes, then reports `transport-lost` with EOF false. A new native follow command is generated and admitted without a task or action redispatch. The checkpoint snapshot is written for command -9; all stages pass: built, written, byte delivery, decoded payload, semantic admission, native publication, exact fully visible text and original task label.

The checkpoint receives and delivers exactly 76,322 bytes with clean EOF and no delivery error. The admitted relay cursor is -1 and durable cursor is 35. Payload SHA-256 is `e5d240c197e614c1a18bd3f6c9fc5f661f3970f4edffe4b7b0f2082dff004e54`; the 70-byte text SHA-256 is `9647149321c54a2263871f7db384303f2db66c08742e22e79b160bb3bb1f6a1b`. The original marker appears in native Text `dsh-message-native-live-phase11-session`, with bounds `[48,876][1032,1044]` fully inside the unique visible List `[48,835][1032,1044]`. Its native task label remains cancelled. The driver uses the observed native latest-message button once, and records `located=true`.

The copied [native widget tree](../evidence/phase28-native/round9-resume1/checkpoint-native-layout.json) was generated at `02:50:35.026 UTC`, inside the observation interval and before case completion at `02:50:35.914`. Rechecking the closed original logs, source audit and native tree with the unchanged proof function also passes. This is native emulator evidence, without a SDK or layout substitute.

## Window and preparation

The sole first forward starts at `2026-10-13T02:50:01.658Z`; total expiry is `03:20:01.658`, cleanup reserve begins `03:17:01.658`, and the original driver deadline is `03:10:02.471`. Cleanup finishes at `02:50:43.590`, 41,932ms after the first forward. There is one mapping, `tcp:18081 tcp:9572`, and no deadline reset or in-window retry.

The first preparation is retained separately. Cold startup reports `screen-not-ready`, then the normal launcher is observed without an authentication screen. A readiness-dispatch freshness guard later prevents forwarding and triggers complete cleanup at `02:43:41.167`. That preparation uses BFF port 10932, creates no mapping and dispatches no follow or task. The second preparation observes the ordinary clock/swipe screen, performs the previously authorized single normal swipe, and confirms native app/document/controls before forwarding. No PIN, credential, developer mode, lock setting or system time is changed.

The readiness check and forward/driver dispatch now execute consecutively in the owner process, retaining the original 60-second readiness requirement. Runner changes add the phase28 approval/world selector and preserve the existing proof logic. The written proof-observation artifact is recorded as a structured successful artifact after its write completes; the earlier bare path would otherwise be treated as a missing artifact. Application sources and the sealed HAP are unchanged during this round.

## Cleanup and limits

All nine cleanup operations pass for the unopened first preparation, and all ten pass for the actual window: exact mapping removal and empty mapping list; BFF exit and listener refusal; independent package uninstall and absence; license audits around official emulator stop; emulator target-port closure. The final scoped host check retains only shared HDC PID33004 listening on 127.0.0.1:8710. IDE remains closed. Eight startup/stop license snapshots retain the same SHA-256 and modification time as before, and no raw license file is copied.

Prompt, fixed replay response, real model and upload counts are zero. Desktop clock remains trusted, with no elapsed/future-limit rejection. The final carrier has zero active work. A gateway-error counter increases from 0 at the last pre-cleanup status to 1 in the closed source report; that shutdown counter is retained rather than normalized away. Native checkpoint qualification is established before cleanup; cleanup closure is checked separately.

The result qualifies this one native emulator socket recovery case. It does not qualify a real phone, WAN, persistent pairing, installed desktop execution, all rich action/form flows or full native isolation. The [phase28 seal](../evidence/phase28-final-seal.json) binds the report and predecessor v27 seal; the source delta includes rollback files and preserves prior failed reports.
