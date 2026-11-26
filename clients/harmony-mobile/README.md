---
kind: reference
description: Native Harmony client development, offline checks and current qualification.
---

# DSH Harmony mobile client lab

English | [中文](README.zh.md)

The [rc2.30 paired-device candidate](docs/paired-connection-rc2.30.md) connects saved personal devices automatically and retains the dark UI. The original phone, desktop plugin and persistent relay are updated; original-device automatic connection and the real Session list are verified without sending messages. Recovery after earlier cleanup failures and long-term renewal remain unverified. The following MVP result is historical.

The [original-device MVP passed](docs/mvp-rc227-a2-20261101.md) on installed desktop rc2.23 and phone rc2.27: the phone selected a real Session, received a new reply, stopped the next running generation and stayed connected across 181.8 seconds of observation. Exactly two phone messages were sent, without reinstalling or clearing pairing/data. Both endpoints stopped, the temporary route was revoked, relay/proxy bytes were restored and the original screen timeout was restored. Reply and cancellation confirmation still have noticeable waits; this finite test does not qualify long-term reliability. The temporary connection is now closed.

The following baseline describes 2026-10-18, when on-site deployment and activation were stopped. The [developer handoff](docs/HANDOFF-2026-10-18.md) records the installed historical phone and desktop packages, disabled activation, retained identities, unstarted grant window and remaining work. The then-installed original-certificate HAP was the historical default-disabled build, not that round's candidate. The separate [offline connection candidate](docs/connection-candidate.md) completed one official API26 unsigned compile: [candidate evidence](evidence/connection-candidate/2026-10-18T08-25-35-312Z-facc28ee.json) records exit0 over 70 input files and a 5,219,694-byte unsigned HAP with SHA-256 `8671f7fdfcba320739e15d2e0fc0309faa176137f5d2a2dbbaddf3bc1c7ded02`; the [build report](evidence/native-build/2026-10-18T08-25-38-344Z.json) and [log](evidence/native-build/2026-10-18T08-25-38-344Z.log) are retained. That candidate is unsigned, not installed, not paired and not device-API-confirmed; read-only re-verification is `node scripts/check-connection-candidate.mjs --audit=evidence/connection-candidate/2026-10-18T08-25-35-312Z-facc28ee.json`. Its native UI and HUKS evidence do not qualify a live link.

## Summary

Develop a native ArkUI phone client for desktop-owned DSH Sessions. ArkWeb renders scoped HTML/CSS/JS through the shared rich-inline guest SDK. Guests receive no Electron or arbitrary host execution bridge. Source configuration is disabled by default; tests use fixed replay, synthetic identities and isolated worlds.

The [phase76 single-window closeout](docs/phase76.2-field-closeout.md) records a successful original HUKS proof and grant9, followed by verified revocation10/active0 after automatic review blocked the exact six-field public-pair upload twice. No control/data authentication or task ran; the installed original-signature app and frozen candidate remain retained.

## Contents

- Architecture and scope
- Offline checks
- Qualification and safety

## Architecture and scope

The [normal-profile product entry](docs/normal-product-entry.md) supports local first-use enrollment for one existing Session and passes eight focused tests, including signed scope transfer, native public-record and desktop Session reload, streaming, durable deduplication and approval waits. Models and SDK signing remain test-injected. Its ESM inputs contain no replay fixture; the installed phone and live connection remain unqualified for this entry.

ArkUI owns selection, input, task state and cancellation. The native owner supplies lifecycle, storage, existing HUKS identity and NetworkKit/CryptoArchitectureKit ports. Shared TypeScript handles control, E2E, device proof, receipts and rich state; desktop Session/Rich services execute tasks. See [architecture](docs/design.md), [real services](docs/real-services.md), [native platform](docs/native-platform.md) and [protected storage](docs/phase52-protected-world.md).

Native chat shows the final text or mounted rich result by default. The rich result fills the available height between the fixed header and conversation controls. Scroll within the result to read longer content. Open the process disclosure to read the intermediate messages, including prose next to a Rich marker. Pull down at the top to load earlier messages. See [device qualification](docs/workspace-review.md#当前日常部署与真机边界).

In rendezvous mode, the phone uses local discovery, signed desktop address publication, and the saved pairing to connect. Each data connection requires a fresh encrypted handshake. See the [desktop setup](desktop-plugin/README.md) for WLAN and Tailnet route order, retry behavior, and desktop and relay requirements.

All client writes stay here. `source.json` is a read-only dependency locator. Preserve installed DSH, unrelated repository changes, old HAPs, manifests, public generations and receipts. Use existing dependencies and the approved API26 toolchain; new candidates remain separate from the frozen phase69 package.

## Offline checks

Run from this directory. These commands prepare test bundles and check actual source with synthetic SDK ports; they do not install or pair an application.

```powershell
node scripts/phase35-native-substitute.mjs
node scripts/phase73-transport-build.mjs
node scripts/phase73-port-build.mjs
node --test tests/phase35-native-crypto.test.mjs tests/phase73-agreement-vector.test.mjs tests/phase73-transport.test.mjs tests/phase73-diagnostic-lines.test.mjs tests/phase73-port-order.test.mjs
node scripts/product-check.mjs
pnpm run test:control
pnpm run test:route-restore
pnpm run test:session-json
```

`node scripts/phase73-integration.mjs --ordered` uses new synthetic worlds, a scrubbed environment and the existing four-response guard. Each invocation retains unique reports. Its loopback/browser fixtures cannot qualify real NetworkKit TLS, HUKS, ArkWeb or a phone. Record sandbox failures before the same check receives a narrow host escalation. The compiled connection candidate is re-verified without rebuilding by `node scripts/check-connection-candidate.mjs --audit=evidence/connection-candidate/2026-10-18T08-25-35-312Z-facc28ee.json`; [connection candidate](docs/connection-candidate.md) owns plan, compile and audit behavior. See [acceptance](docs/acceptance.md) and [tasks](docs/tasks.md).

## Qualification and safety

The repair selects documented `ECC256` agreement parameters and reports fixed handshake stages without payloads. RFC5903 vectors and Node/WebCrypto checks do not prove the physical first fault. Parameter, frame, deadline and HTTP503 failures have distinct offline evidence. No rate limit, Origin allowlist, certificate check or grant policy is widened.

Physical operations follow the [recorded approval and deployment status](docs/normal-controls-deployment.md). Preserve the original HUKS/DPAPI identities, revoked scopes and historical evidence. Do not delete locks, clear data, reset identities, replay old proofs or reuse scripts pinned to consumed grants. Changes outside the recorded target and scope require their own authorization.

Native compilation, SDK substitutes, browser fixtures and physical-device behavior are distinct evidence levels. The complete task/stream/ArkWeb/action/deduplication/reconnect/cancel journey remains unqualified until the approved physical run passes it.

The [local log self-check](docs/local-log-selfcheck-rc2.15.md) provides a fixed native logging probe; physical collection is qualified separately from compilation.

Native shared JavaScript imports the SDK text codecs and URL parser explicitly. The [standard-plugin review](docs/workspace-review.md) records the separate emulator application, installed-runtime replay, native encrypted carrier and their remaining qualification limits.

Foreground restoration waits for cleanup of the previous workspace and connection. The native page keeps its last successfully opened Session in memory and restores it if the same verified binding still admits the Session in the new directory. Access to the workspace on a replacement encrypted connection requires a fresh desktop grant.

While connected, closing the workspace refreshes the native Session list and reads the latest snapshot for the selected Session's mounted Rich form. Returning to the same Session preserves its native history subscription.
