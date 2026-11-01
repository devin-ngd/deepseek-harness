# Device route rc2.7 reference

## Summary

The rc2.7 candidates retain an existing original-phone/desktop binding while separating finite, dual-signed relay windows. They are offline candidates: the HAP is unsigned, no installed package or real pairing was changed, and actual NetworkKit, HUKS, ArkWeb and public TLS acceptance remains pending. The matching desktop, phone, relay and public-tool versions are 0.0.0-rc2.7. Exact hashes and qualification receipts belong to `evidence/device-route-candidates-rc2.7.json` in the source checkout.

## Contents

- [Authorization and protocol](#authorization-and-protocol)
- [Retained history and migration](#retained-history-and-migration)
- [Deployment and acceptance plan](#deployment-and-acceptance-plan)
- [Cleanup and rollback](#cleanup-and-rollback)
- [Qualification limits](#qualification-limits)

## Authorization and protocol

The persistent device binding selects all current and future visible Sessions in the existing desktop instance's `desktop` profile. Other profiles, phone creation of Sessions and arbitrary Host APIs remain excluded. Legacy Session grants are never parsed or promoted as bindings. Original HUKS and DPAPI identities are reused; these candidates contain no identity-creation path in device mode.

Each route has a fresh routeId, independent routeEpoch 1, nonce and expiry of at most 30 minutes. The original desktop signs the complete persistent binding plus routing offer; the original phone verifies and signs the exact offer after explicit comparison. Both signatures are required before public registration. Challenge and ticket signatures bind the routeId, routeEpoch, deadline, persistent binding and fresh encrypted channel. Temporary-route retirement does not revoke the device; device revocation denies all its tickets and, after publication of its signed tombstone, all registered and future routes in the relay journal.

The relay mode is explicitly `networkkit-v1`. A present Origin must be exactly `https://` plus the configured audience, only for role phone, with neither Sec-Fetch-Mode nor Sec-Fetch-Site. Originless endpoint behavior is retained. Exact Host, query-free control/data paths, subprotocols, no Cookie, original-key proofs, room capabilities and E2E remain required. No wildcard, Origin stripping, TLS bypass or new Host API is introduced. Room publication applies the absolute route deadline inside the final issuer, preventing a second clock read from extending it by a millisecond.

## Retained history and migration

The retained original binding is `f466715e-908b-4c83-8684-9f22a9ab3e94`, binding epoch1. The old public relay record for that same identifier is an independently verified revoked epoch2. Do not replace either record, increment the binding merely to match the relay, reactivate the old pair, or delete/reinitialize any journal/head/lock.

The new desktop public namespace is `harmony-device-route-v1`; uncertain writes leave a persistent pending refusal marker. The phone uses `mobile-device-routes-v1.json` and a separate refusal lock, retaining `mobile-device-binding-v1.json`. The new relay journal is explicitly initialized empty and anchored to the exact last verified legacy journal digest. Startup verifies both chains before listening; a changed legacy anchor, missing/torn state, duplicate route/nonce, foreign binding, stale generation, changed signatures or unknown write refuses without repair or fallback.

Keep the existing legacy config's original six-field seed pair unchanged so its entire old chain reopens correctly. Make a separately reviewed config copy with `nativeOrigin: networkkit-v1` and a new `deviceRoutes` policy. A proposed new path is `/home/devin/harmony-relay/public-state/test-20261023/device-routes-rc2.7.jsonl`; initialization creates only that new journal, its head and lock. The exact legacy journal path and digest must be resolved from the retained approved config during future authorized preflight, not guessed from this guide. Keep ProtectHome read-only and the same narrowly approved directory. No service, directory permission, port or firewall change was performed in this stage.

Only one live route is allowed by the maintenance entry. Old tombstones remain retained separately from active capacity. Histories are bounded: the endpoint ledger admits at most 64 offers and is also limited by its file budget; the relay journal uses explicit maxRecords/maxBytes. Exhaustion refuses instead of deleting history. Automatic compaction and automatic window renewal are not implemented.

## Deployment and acceptance plan

These are future approved operations, not actions performed on real state during qualification. First approve original-material HAP signing, in-place desktop/phone updates with original data/configuration backups, and normal app restart. Keep rc2.5/rc2.6 archives. Phone cold launch must show the original binding, no automatic connection and no restored host consent.

Separately approve the exact existing relay code/config update, new journal path, temporary service duration and cleanup. The relay includes its pinned ws runtime; the five public tools are bundled with Node builtins only. Verify the existing Node version meets the candidate's engine requirement before use; do not install or upgrade a runtime implicitly. Keep the service stopped during maintenance so its exclusive public writers are released. Preserve the legacy journal/head as migration input; never run the old initializer over it.

The public operator CLI is `device-route-maintenance.mjs`. Its closed actions are `initialize`, `register`, `revoke-route`, `verify` and `revoke-device`, selected with `--config <reviewed-config>` and, except initialize, `--public <strict-public-document>`. Mutating actions display bounded public selection metadata and require a TTY plus the exact uppercase action followed by ` DEVICE ROUTES`. There is no force, repair, lock deletion, secret input, service start or remote endpoint. Every successful mutation is independently reopened before verified success is returned. A refused/unknown outcome requires inspection and readback, not a blind repeat.

After migration initialization, use `/harmony-device route-start` in the original desktop profile. On the original phone, verify the exact host, original binding/fingerprints and expiry, explicitly approve and sign the offer, then return the public reply to `/harmony-device route-confirm`. Register that complete dual-signed route through the reviewed public operator tool before starting the temporary relay. Directory output is public routing metadata, not proof of connectivity. Approve the phone's current host checkbox, then explicitly connect both endpoints. A manual desktop reconnect closes the prior transport and reuses only the still-valid window; it does not renew its deadline or reuse an old ticket.

The first physical acceptance should avoid model calls: verify fresh list, switch between two existing Sessions, sync the selected Session, reject stale selection/rich callbacks, and reconnect within the unchanged deadline. A second window must use a fresh route and reject the first after revoke/restart. Original HTML rendering and a form round trip still need physical ArkWeb acceptance. The phone's actual Origin was not captured or matched to the examined platform source; a different Origin must be diagnosed with bounded metadata, not admitted by relaxing the policy. Real task/model acceptance requires a separately disclosed provider, endpoint and budget.

## Cleanup and rollback

End every approved temporary test by stopping the phone's local window and the desktop transport, durably revoking the exact temporary route, independently verifying its tombstone, and stopping the service/restoring its original config and narrow write permission. Disconnect, expiry and service shutdown do not substitute for durable route revocation. Keep the original persistent device binding unless the user separately requests device revocation. Publish a genuine signed device tombstone with `revoke-device` only for that explicit operation.

Before code rollback, revoke and verify every new active route and stop the relay. Preserve all new route journals/heads, endpoint ledgers, pending refusal markers and the old epoch2 tombstone. Restore only backed-up package/code/config selections; never restore an older authorization snapshot over current state. Old rc2.5 does not understand the new route journal and must not be pointed at a fabricated active legacy pair. Rollback may leave mobile control unavailable; it must not revive the revoked legacy route or silently create another identity/binding.

## Qualification limits

The target source suite, strict types, Origin/public-history refusal tests, finite-ticket lifecycle and feedback filtering passed. Source integration composes real SessionController and encrypted loopback transport with fixed replay and SDK substitutes; it covers two windows, cold restore, durable route/device revocation, pending/append failure refusal and the absolute-deadline regression. The ordinary route command path is exercised without any model. Official API26 SDK compilation passed after a syntax-only ArkTS cleanup adjustment; warnings about device capabilities and exception handling remain. Detached archive/startup checks establish packaging compatibility only. No signed package, installed candidate, native identity operation, real relay or public model task is accepted by those results.

## Desktop credential compatibility

The rc2.8 desktop successor uses a fixed `route-` prefix plus the original desktop/profile/device SHA256 digest. DSH credential segments must start with a lowercase letter; a raw numeric-leading digest is invalid. An existing legal unprefixed key is read and updated in place without copying, merging or clearing replay and retirement history. Both names present, a changed selected namespace, corrupt data or a pending write refuse. This local addressing repair leaves wire formats, original binding, phone data and relay journals unchanged.

Command failures disclose only preparation stage and a closed identity/storage disposition. Arbitrary provider messages, causes and stacks are never displayed. Unknown operations or writes still require state inspection before repetition; diagnostics do not establish rollback.

## Desktop connection diagnostics

The rc2.9 desktop successor retains the rc2.7 phone and relay protocol. Connection errors identify binding/route lookup, profile-provider setup, transport policy, relay-provider setup, journal open, executor mount or relay mount. Identity, route-storage, journal and link failures use closed code lists; arbitrary messages and causes remain private. A cleanup-failed flag preserves the first failed operation and reports incomplete cleanup without claiming rollback. Journal create rejects existing receipts, reopen rejects missing or foreign ownership, and neither mode deletes history or changes the installed profile automatically.

Offline regressions prove the diagnostic classification and isolated journal recovery; they do not establish the cause of the last real connection failure. The installed desktop, phone and persistent device binding remain unchanged during candidate qualification.

## Desktop admission lifecycle successor

rc2.10 changes only desktop admission initialization/recovery; use the existing rc2.7 phone and relay. A device command configured with create resolves to the explicit create-or-reopen policy, rather than repeating strict creation for every connection. Empty uninitialized state may be initialized; ready state requires the same desktop/profile, valid row keys, matching row desktop ownership and the existing retention cap. Recovery does not rewrite a valid file. Explicit generic create still refuses existing state, while reopen refuses missing state. No fallback occurs after validation, IO, close or ownership errors.

The StorageDomain reservation remains exclusive within the Host; a simultaneous opener fails. This is the existing in-process ownership contract, not a new cross-process file lock. No actual admission file, credential, binding or revocation history is migrated or reset. Package rollback retains the v1 document; an old create-only device entry may refuse it again but must never delete it.

The real 2026-10-25 connection failed before relay mount with journal-open/journal-already-exists. Read-only inspection found a valid v1 ready domain with matching desktop/profile and zero admission rows, last written on 2026-10-24. Both endpoint windows and the public route were explicitly closed/revoked, with independent verification and restored stopped service. Candidate qualification is offline; native control remains unaccepted until a separately scoped physical test.
