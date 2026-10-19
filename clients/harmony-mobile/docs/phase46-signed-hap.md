# Signed debug HAP readiness

The approved debug signing build completed with the user's existing DevEco-generated materials. Only the independent signing project's default product binding was added; keys, certificate and Profile were not regenerated. Official Hvigor completed successfully, and official SDK26 `hap-sign-tool verify-app` returned exit code0. The signed deliverable is ready for a separate installation decision.

| Item | Verified value |
|---|---|
| HAP | `D:/Temp/dsh-harmony-mobile-20261014-first-use-wiring-signed.hap` |
| Bytes | 5,318,102 |
| SHA-256 | `50e91f2ad91eed14596dbc313a57d0dfba718a89c0e22fedfca2d08fa7a7c796` |
| Bundle / version | `local.dsh.mobile.offlineproduct`, `0.0.0`, code1 |
| Mode / SDK | debug / official SDK26.0.0.105 |
| API | compatible12, target26; HAP module encodings50000012 and260000026 |
| Permissions | Only `ohos.permission.INTERNET` |
| Device binding | Debug Profile binds exactly one device, matching the currently Connected USB HUAWEI CMM-AL10, API26 |
| Existing installation | Target-only `bm dump -n local.dsh.mobile.offlineproduct -u 0` returned a generic error; absence of an installed bundle is not proven |

[Build evidence](../evidence/phase46-signed-build.json) records the official build, source hash comparison and existing signing-material use. [Readiness evidence](../evidence/phase46-signed-readiness.json) records the delivered file, HAP metadata, verified extracted Profile binding and preserved unsigned hash. Evidence excludes passwords, private key contents, developer account names and raw device identifiers. The signing project and private signing configuration are not deliverables.

Signing authorization was granted at2026-10-14T08:04:17Z. Current installation authorization and its outstanding safety prerequisite are recorded in the [installation preflight](phase47-installation-preflight.md). Any existing-bundle or signature conflict must be reported before replacement or uninstall; signing authorization does not authorize either operation. The [signing handoff](phase43-signing-handoff.md) defines the remaining identity decisions.

The previous unsigned HAP remains unchanged with SHA-256 `bef84845149b9c8ee28a51d8fdeca651b0ea1ac3f98f5a0da0c61471c835d8bd`. No installation, phone app execution, E2E identity creation, desktop provider activation, relay change or installed DSH modification occurred. Official compilation and signature verification do not establish actual ArkWeb, HUKS ECE, native TLS or phone-to-desktop acceptance.
