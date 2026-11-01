# Connection recovery rc2.6 candidate reference

## Summary

This offline candidate repairs public relay configuration compatibility and explicit host permission after a phone cold start. The phone HAP is unsigned and uninstalled. The desktop runtime is unchanged from rc2.5. Existing device bindings, original identities, relay state and installed applications were not accessed or changed in this stage.

## Contents

- [Behavior](#behavior)
- [Qualification](#qualification)
- [Candidates](#candidates)
- [Remaining acceptance](#remaining-acceptance)

## Behavior

Relay preparation omits `nativeOrigin` only when its resolved value is `deny`, which is the deployed legacy server's existing behavior. Originless requests remain subject to signed relay authentication; every browser Origin remains refused by that server. Explicit `networkkit-v1` is preserved and is rejected by the legacy server. Unknown policies refuse. This fixes the invalid-configuration failure without treating legacy server compatibility as native NetworkKit support.

The phone recovers the verified original binding and audience locally. The page displays the bound host and requires a fresh explicit host checkbox before each foreground owner's connection. Background disposal, owner generation change, host change or loss of the verified binding resets the checkbox. Saving a newly verified receipt can retain the already selected permission only for the exact same displayed host. Neither recovery nor saving initiates networking. The native device facade also rejects connection without an explicit true approval argument.

A failed transport classified as `connection-unavailable` permits an explicitly requested manual retry. Terminal pairing, revocation and cleanup failures remain refused. This does not add automatic reconnect, restore an expired ticket, modify the device record, or weaken signature, identity, profile, Session or rich interaction isolation.

## Qualification

The 21 targeted regressions pass. They execute the generated public tools against the SHA-pinned deployed legacy server on an ephemeral loopback port, verify Origin refusal, and exercise the real page's parsed methods and button guard. The layout expectation includes the pre-existing scope-management buttons and the changed confirm/connect actions; other expected actions are preserved.

The 7 integration regressions pass after the fixture grant assertions were made type-safe. They compose the real SessionController and encrypted loopback carrier, execute the actual ETS owner with SDK substitutes, and use the existing HTML runtime with fixed replay responses. They do not use physical HUKS, public networking or a real model.

Strict TypeScript reports zero diagnostics for the changed shared/parser/native and command imports plus the integration suite, using the same vendor project references as the existing product check. The initial checker lacked those references and also found three un-narrowed test-record assertions; its failed report is retained. Official API26 SDK compilation, packing and the native JS import audit pass; compilation emits exception-handling and device-capability warnings. SDK success does not establish physical ArkWeb or native network behavior.

## Candidates

The [candidate manifest](../evidence/connection-recovery-candidates-rc2.6.json) records source parity, build receipts, exact hashes and the two independent artifacts: an unsigned phone rc2.6 HAP and public maintenance first-use.5 tools. Both preserve prior candidates. No new desktop archive is needed because this stage changes no desktop runtime code.

## Remaining acceptance

Signing and installation are outside this stage. Before any new public connection test, review the actual relay's native Origin capability and the retained revocation epoch/history; do not delete or reinitialize the journal to reuse an old epoch. A compatible server deployment and any actual public registration, ticket or timed service run require their own explicit scope. The failed prior connection test remains failed; this candidate has not been tried on the phone.

After approved deployment, verify cold launch shows the original pairing and exact host, no connection occurs before the checkbox and Connect action, manual reconnect obtains a fresh finite ticket, and Session list/switch/sync plus original rich HTML round trips remain isolated. Actual model tasks are excluded from those prerequisite checks. Retain the persistent device binding when cleaning up a temporary connection test.
