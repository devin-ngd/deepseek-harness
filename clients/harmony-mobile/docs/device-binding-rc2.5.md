# Device binding rc2.5 candidate reference

## Summary

2026-10-24 source and isolated qualification of one original phone bound to one DSH desktop instance, scoped to the current `desktop` profile. Subsequent explicit approval covered original-material signing and in-place installation only. Both rc2.5 packages are now installed; persistent device access remains unactivated, and both apps were left stopped. The old rc2.4 archive and original data/configuration are retained. See the [installation receipt](../evidence/device-binding-installation-rc2.5.json). This record supersedes the earlier device-core-only stage in tasks/acceptance.

## Contents

- [Behavior](#behavior)
- [Evidence and artifacts](#evidence-and-artifacts)
- [Remaining limits](#remaining-limits)
- [Deployment acceptance plan](#deployment-acceptance-plan)
- [Dev note](#dev-note)

## Behavior

A signed persistent device binding is separate from a signed connection ticket of at most 30 minutes. The original desktop/phone signers are reused; device mode has no identity-creation operation. Existing single-Session grants are not promoted. The new public storage namespace and phone file retain old records separately. CAS transitions leave a refusal marker after an unknown outcome; revocation produces a new signed tombstone and invalidates active tickets.

The directory comes from the real `SessionController.list`, includes visible existing/future Sessions and refreshes while connected. It is not a static Session whitelist. Capacity settings fail closed rather than silently granting/truncating scope. Other profiles and phone creation of Sessions are excluded. Every operation checks the original encrypted-channel object, current device record/epoch, ticket lifetime, profile and current Session visibility before dispatch and delivery.

`harmony-device` is a separate, default-disabled product entry: status, start, confirm, directory, connect, stop, revoke. Stop cancels a pending device offer and disconnects; it retains a confirmed binding. Revoke persists a tombstone; its public relay revocation result still requires separate operator acknowledgement. Command UI results are Session-addressed and filtered; unknown fields and secrets remain refused. The legacy `harmony-pair` challenge-only stop and unknown-persistence handling are also repaired.

Native navigation delegates to the shared device facade and canonical PhoneCore. Immutable desktop/profile/Session routes replace reliance on the desktop foreground Session. Selection retires old peers, subscriptions and rich callbacks; drafts are kept per selected Session. The original HTML renderer/guest SDK is reused through a two-method scoped rich port. HTML cannot select a Session, pair a device or obtain arbitrary Host APIs.

## Evidence and artifacts

The authoritative [candidate manifest](../evidence/device-binding-candidates-rc2.5.json) contains exact SHA256, source/input checks, independent paths and verification receipts. The desktop package is `D:/Temp/dsh-experimental-harmony-mobile-0.0.0-rc2.5.tgz`. The phone package is `D:/Temp/dsh-harmony-mobile-0.0.0-rc2.5-device-unsigned.hap`, bundle `local.dsh.mobile.offlineproduct`, versionCode 2. It is unsigned and default-disabled, with device-mode navigation selected only in this independent build. Source configuration and old artifacts are retained.

- [Protocol/lifecycle tests](../evidence/device-binding-core-1792817455196.json): 15 passed, fixed keys/storage; cold reuse, no legacy promotion, exact-channel proof, expiry, visibility, revocation/unknown writes and Session isolation.
- Real source integration: 6 passed in `.build/device-binding-final-kAh0dF/report.json`, then the delivered reproducible runner passed 6/6 again ([final runner receipt](../evidence/device-integration-1792817633115.json)). Normal command registration/start/confirm/stop/revoke, original identity retention, public CAS, 21 Session selections, future directory refresh, actual encrypted loopback carrier and canonical snapshots were exercised. Actual ETS device delegation was executed with substitute SDK ports, including original-key-only reading, one-use enrollment signing, independent public-file persistence and cold resume without connection.
- HTML integration used the existing HAP document and guest SDK in installed Chrome at 360/480 widths. A form was submitted over the encrypted carrier, fixed offline replay completed the rich action, duplicate invoke retained its receipt, and the old form was refused after selection changed. Three fixed replay responses, zero real model calls. This is not phone ArkWeb evidence.
- Legacy controls: 6 passed in `.build/device-binding-legacy-APMX29/report.json` after the native-owner changes. Earlier phase-one combined controls/refusals were 10 passed; these are distinct runs, not a claimed new 10-case regression.
- [Final strict types](../evidence/device-binding-final-typecheck.json): zero diagnostics across native shared composition, persistence, real profile and encrypted carrier/normal command adapters.
- [Packaged feedback](../evidence/command-feedback-package-0.0.0-rc2.5-1792817273187.json): 10 passed. Host and Client declarations have separate output trees; byte-integrity checks remain enabled.
- [Installed rc.2 public API package check](../evidence/rc2-controls-package-smoke-0.0.0-rc2.5.json) and [new device-entry disabled load](../evidence/device-package-entry-rc2.5.json) passed without opening the user profile or reading real credentials.
- [Final official SDK build](../evidence/native-build/2026-10-24T04-49-47-862Z.json): DevEco 26.0.0.851 / SDK 26.0.0.105 API26 / Hvigor6.26.8. ArkTS compilation, packing and native-JS import audit passed. 69 candidate inputs match current source; the two intentional differences are version/bundle metadata and independent disabled device-mode configuration. SDK warnings about API availability/exception handling remain; runtime acceptance is separate.

Executed development entry points include `node scripts/check-device-binding.mjs`, `node scripts/check-command-feedback.mjs`, package-mode API/feedback checks, and the installed official unsigned SDK build. `scripts/check-device-binding-integration.mjs` reproduces the focused source integration; `--legacy` selects the affected legacy controls. The integration depends on generated ProductCore/PairedCore and installed Chrome; no browser/SDK dependency was installed during qualification.

## Remaining limits

Binding is persistent; connection tickets, relay directory leases and transport rooms are finite. This first candidate requires an explicit reconnect after transport/ticket retirement, and the desktop entry may need stop/connect. Unattended reconnection/directory renewal is not claimed. Reconnecting uses the same binding and original identities. A revoked binding is deliberately not automatically replaced; a separate reviewed re-enrollment/history policy is still needed.

The standalone relay maintenance format accepts only public pair fields; this candidate does not provision, renew or revoke the production directory automatically. Remote service state was not rechecked after the prior SSH Permission denied; its last confirmed state was stopped. That access blocker remains for a future live deployment. No retry or alternative credential route was used.

Native HUKS/DPAPI, actual phone files/foreground lifecycle, real WSS/TLS, installed commands/UI, phone ArkWeb forms, physical disconnect/reconnect and real model task completion have not been accepted for device mode. Loopback, fixed replay, substitute SDK and compilation cannot establish those outcomes. No real identities, grants, bindings or tickets were created in this source-development round; no relay was started or modified.

## Deployment acceptance plan

Signing and in-place installation in step 1 have now completed under separate explicit approval. Startup and the remaining device-access/live acceptance steps below are pending:

1. Approve updating only the two reviewed candidates, original signing identity/material use and ordinary restart. Keep original package/data/HUKS/DPAPI and configuration backups; never uninstall/clear. The unsigned HAP needs the original approved signing workflow before installation. Preserve Codex/model selection and all unrelated user changes.
2. Approve persistent binding of the original phone to all current/future visible Sessions in this one desktop instance/profile, until revoked. Approve finite automatic original-key proofs per explicit connection and the exact public relay directory lease/maintenance scope separately. Resolve the existing SSH access blocker through its owner; do not retry a denial without new evidence.
3. Before any activation, verify original public fingerprints and current profile, prepare durable desktop/phone/relay revocation and rollback, and confirm the exact existing relay service/path/temporary permission scope. Do not create a new identity if originals are unavailable.
4. Through normal product UI, create/compare/sign/confirm one device offer; install only reviewed public directory fields; connect. Validate current and newly created desktop Sessions, fixed routing while desktop focus changes, independent drafts, old-subscription/HTML refusal on switch, foreground/background and finite-ticket reconnect without re-pairing. Test one device-revoke through desktop, phone local refusal and durable relay tombstone, then verify cleanup.
5. Actual model task/result and rich action completion require a separate named provider/model/endpoint and agreed request/token/cost budget. No current result promises a free subscription or real task acceptance. Do not submit a normal message merely to create a test Session.

## Dev note

Development-only candidates; no external publication, commit, install or activation. Candidate hashes, executed receipts and unverified boundaries are owned by the linked manifest. The old rc2.4 SHA256 remains `7a5475411c7fd90c6d003de73425cca30f9c1aa4b0521aac953239a86ede9734`.


## Approved installation follow-up (2026-10-24 05:39 UTC)

The [installation receipt](../evidence/device-binding-installation-rc2.5.json) records desktop rc2.5 via the official Desktop CLI, 88 installed files matching the candidate, unchanged runtime/isolation/supply-chain configuration, unchanged other manifest fields and unchanged unrelated lock entries. The phone is rc2.5/versionCode2, same original bundle and UID20020297, installed once with official HDC `install -r`, without uninstall or data clear. No identity was created/reset/exported. HUKS/DPAPI private state and post-install public fingerprints were not read or claimed revalidated.

The signed HAP is `D:/Temp/dsh-harmony-mobile-0.0.0-rc2.5-device-signed.hap`, SHA256 `6d67f397e0c31e32382409b71199c4a882d0878ade4df39ce4b1cb549b0b077f`. The original signing configuration/profile were unchanged; official verify-app/verify-profile passed and the original certificate chain matched. All 23 unsigned application entries matched the signed archive; the sole additional page bitmap matched SDK regeneration. No old PowerShell/pnpm exception was reused.

Startup was deliberately not attempted: the current desktop profile mounts the original isolated credential provider, whose initialization reads the restricted credential file; native device boot can restore a saved public binding if present. Existing phone device-binding state was not inspected. This round did not authorize reading that file or restoring real authorization. Configuration was preserved rather than changed to evade this boundary. Both apps remained stopped, with no new binding/grant/ticket, relay/SSH action or model call.

One read-only HDC transfer of the package manager's public installed `entry.hap` path failed (host exit0 plus an HDC error marker, no local artifact). Detailed error text was not retained, so the underlying cause is unknown. It was not retried and no alternative file-access route was used. Direct on-device archive hash equality remains unverified; this does not erase the confirmed successful signed in-place install and version/UID readback. Future work must distinguish this readback failure from the separate startup boundary and the previously unresolved SSH denial.
