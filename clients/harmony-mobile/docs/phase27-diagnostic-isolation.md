# Phase27 offline diagnostic correction

This reference covers the v25 observation defect and replacement source/HAP. The eighth native window remains closed and its failed initial read remains recorded in [phase26](phase26-round8-native-attempt.md). This phase starts no emulator, IDE, installation, HDC forwarding or native execution. Native acceptance requires a separately authorized future window.

## Protocol and failure ownership

The real MobileBff starts a new transport generation at `relayCursor=-1`, independently of the saved Session's durable cursor. The saved synthetic cancelled Session has durable cursor 35. `parseWireItem()` accepts this reset, and events advance to 0 and 1. The diagnostic reader previously rejected the legal sentinel before the view could publish.

`src/wire-fields.ts` owns the primitive cursor, natural integer, string and branded ID predicates. Its ArkTS copy is generated verbatim; the SDK build checks exact equality before invoking Hvigor. A branded ID still requires the original character set and maximum 128 characters; the generic string limit of 4096 never overrides `id()`. The review's alleged long-ID incompatibility was withdrawn after an actual parser test reached `id()`. ID, clock, expiry, generation, packet-size and ownership validation retain their original limits and failure codes.

Only diagnostic callbacks, serialization and logger calls are contained. Failures leave sticky counters and a sanitized failure record when the sink works; missing or failed evidence cannot qualify the checkpoint. NativeByteStream disposal settles even if both logging channels throw. Provider, domain decoder, clock, scope, private-port envelope, actual UI publication and resource errors retain their product owners and failure paths. The old-mount probe still refuses forwarding and throws on a failed safety assertion.

## Qualification observations

The checkpoint fixture's text and payload generation are unchanged. Qualification still requires correlated exact byte counts, clean EOF, payload and live-text SHA-256, admitted domain cursor, original task, exact native text identity and complete containment within the unique visible List. The latest observation for the same Session/message controls publication status. Later readonly, disconnect, error, text replacement, close or immediate native runtime failure prevents an earlier successful publication from passing. Close observes its final readonly view. Diagnostic failure also disqualifies the proof.

The full parsed first frame from a fresh actual source-service generation over ephemeral loopback is saved as [phase27-source-reset.json](../evidence/phase27-source-reset.json). Only the existing synthetic journal is copied to an owned temporary directory. No prompt, replay response, real model or upload is used; service and read waits close in `finally`. The test reconstructs the standard stream envelope around this captured frame; it does not preserve a packet capture of the original HTTP bytes.

The regression executes the same staged NativeByteStream and NativeRuntimeOwner `.ets` implementations with SDK substitutes, then the real ByteNetworkPhone decoder, observeNativeGeneration, PhoneCore/NativeAppHost and shared message projection. The unchanged NativeFollowFaults checkpoint supplies the hash/byte chain. Layout selectors are explicit substitutes, which do not establish ArkWeb, ArkUI visibility or device acceptance. [Complete-chain evidence](../evidence/phase27-complete-chain.json) records the passing substitute proof and the failing proof after the same owner's actual close publication.

## Evidence and rollback

[Independent review](../evidence/phase27-independent-review.json) records the findings, ID correction and final absence of a blocker within this correction. [Checks](../evidence/phase27-checks.json) lists actual commands and retained failures. [HAP metadata](../evidence/phase27-hap.json) identifies the final official API26 build, input hashes and unsigned artifact. The variant declares INTERNET only, selects fixed emulator loopback and creates no account, pairing, credential or network service by compilation.

[The final seal](../evidence/phase27-final-seal.json) binds the source delta, replacement HAP and predecessor v26 seal. Prior archives, HAPs and failed native reports remain intact. The delta includes pre-edit files under `rollback/`; restore only those paths and remove only newly introduced files listed in its manifest to return to the prior client state. No other repository or installed DSH path is part of rollback.

The replacement HAP is compiled only. The next native acceptance remains blocked on explicit authorization; no ninth window has been requested or used. Final phone-to-desktop/device acceptance remains unproved.
