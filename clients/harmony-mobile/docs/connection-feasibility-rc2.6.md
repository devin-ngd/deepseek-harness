# rc2.6 actual connection feasibility reference

## Summary

The unsigned rc2.6 phone and first-use.5 tools repair two local defects but are not a complete connection recovery. The deployed relay lacks native Origin compatibility, and the current product couples a persistent device binding to a terminally revoked relay route. Neither a reinstall nor a different epoch parameter resolves these two conditions safely. This review uses source and preserved public evidence only; no real network, identity store or authorization was accessed.

## Contents

- [Origin compatibility](#origin-compatibility)
- [Retained epochs](#retained-epochs)
- [Required evolution](#required-evolution)
- [Evidence and next step](#evidence-and-next-step)

## Origin compatibility

`NativeRelaySocket.connectOwned` passes the existing NetworkKit WebSocket options without an Origin override or removal mechanism. The retained [platform examination](../evidence/phase68-platform-source-evidence.json) records that the installed API26 declaration provides no removal option, examined NetworkKit sets the Origin from the endpoint address, and libwebsockets serializes the scheme-qualified header. That examination explicitly does not establish a binary match to this phone. No HTTP handshake headers from the failed physical rc2.5 attempt were captured. Therefore the exact Origin sent by that particular device remains unobserved; the examined supported NetworkKit behavior is incompatible with the deployed legacy relay.

The SHA-pinned deployed server accepts an originless synthetic request and refuses the same request with `Origin: https://relay.example`. Omitting the default `deny` configuration field fixes only its strict parser. It does not remove the platform's Origin, change the proxy or enable NetworkKit compatibility. A phone producing that canonical Origin will still be refused before broker proof.

There is no relevant DSH release number that enables this custom relay feature. The minimum server capability already exists in the local phase68 source: `standalone-relay/src/config.ts` recognizes the closed `deny | networkkit-v1` choice; `host.ts` passes it into both control/data handlers; `control-upgrade.ts` and `integration/relay-upgrade.ts` enforce it. A compatible current relay must be independently built and reviewed before any approved deployment. The old deployed server cannot consume `nativeOrigin: networkkit-v1`.

The current explicit mode accepts exactly one `Origin` equal to `https://` plus the configured audience, only with role `phone`, and with neither `Sec-Fetch-Mode` nor `Sec-Fetch-Site`. Originless clients retain the existing path. Both handlers still require one exact Host and subprotocol, exact query-free route and no Cookie; control requires the registered pair/role and no Authorization header, while data requires the exact live room capability. Duplicate Origin, foreign/null/HTTP/explicit-port origins, desktop Origin, browser fetch mode/site and missing or wrong native routing headers refuse. These HTTP checks do not authenticate a native device: pinned original-key broker proofs, one-use room capabilities, E2E and device ticket checks remain mandatory. No broad Host/Origin wildcard, header stripping, spoofing or TLS verification change is proposed.

## Retained epochs

The preserved [test restoration receipt](D:/Temp/harmony-connection-test-20261024-0931/relay-final-restoration.json) records relay pair `f466715e-908b-4c83-8684-9f22a9ab3e94`, epoch2, revoked and independently verified; its persistent device binding was not modified. The known original device binding remains epoch1. This review does not reopen either real store.

`DeviceBindingProductCommand.pair` and `connect` currently derive relay `pairId` from `bindingId` and relay epoch from binding epoch. The native owner uses the same bindingId for its control route, and `NativeDeviceCore.initialize` also derives its relay epoch from the binding. The desktop carrier additionally compares the application ticket's bindingId and epoch with its relay pairId and epoch. Thus editing only the relay registration to epoch3 would not match the endpoints or application ticket.

`PublicTrustStore.successor` permits only an active-to-revoked transition at the next epoch and preserves keys/expiry. A revoked record cannot become active again. Reopening uses the persisted current pair set, so stale static epoch1 config does not override the epoch2 tombstone. Initialization is exclusive and refuses existing state. The current store also has no operation for adding a newly authorized route. Its snapshot pair count is fixed and its broker capacity includes the whole supplied pair set. A random new ID, alternate empty journal or changed config is not a supported recovery flow.

## Required evolution

Keep the existing signed persistent `bindingId` and `bindingEpoch=1` unchanged until genuine device revocation. Introduce a separately identified, explicitly authorized finite relay route for each connection window. Its signed public descriptor must bind a fresh routeId and route epoch to the original bindingId/binding epoch, both pinned public identities, exact audience and expiry. Both endpoints verify that mapping before opening the carrier. Application tickets must bind the persistent registration and fresh authenticated channel plus the selected routing generation; a relay route identifier is not a replacement device authority.

The former route's epoch2 tombstone remains terminal. A new route uses a new namespace and new fresh proofs; it cannot extend or restore any former room, ticket or route. Registration requires a supported append-only, crash-safe operation that retains old tombstones and refuses replay, duplicates, changed keys, stale generations and uncertain writes. Separate the one-active-route capacity from bounded retained history. Durable temporary-route revocation and readback must be available before activation, and must not revoke the persistent device binding. Do not add an unconditional revoked-to-active transition or reset journal/history.

The affected code spans a strict signed routing-descriptor schema, desktop command/owner and isolated storage, desktop carrier validation, native bridge/facade/ETS routing input, public-trust journal/broker and registration/revocation tooling. Existing `PairedRelayEndpoint` proof and E2E enforcement should be reused. Tests must cover two successive windows on the same persistent device binding, rejection of the first window after durable revoke/restart, mapping/epoch/signature mismatches, history capacity and interrupted registration/revocation. A fresh synthetic directory with a newly bound device does not cover this lifecycle.

## Evidence and next step

The [bounded current-source regressions](../evidence/connection-feasibility-1792839250781.json) pass 18 selected Origin tests (two unrelated cases skipped) and 10 public-state tests. The added case verifies that an epoch2 tombstone cannot be replaced by epoch1, active epoch3 or an unregistered new routeId, and that journal/head bytes remain unchanged. This protects the refusal behavior; it does not implement successive routing windows or prove the phone's actual headers.

Keep the [rc2.6 candidates](../evidence/connection-recovery-candidates-rc2.6.json) sealed as partial offline fixes. Complete and qualify independent routing lifecycle support before building successor desktop/phone/relay candidates. Review the native Origin-compatible relay deployment and retained history migration separately. Only then consider signing, installation and a newly approved timed physical connection test. No candidate, actual binding or remote state changed during this review.
