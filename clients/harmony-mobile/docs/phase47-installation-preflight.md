# Installation preflight stopped before device mutation

This preflight records the earlier no-replacement authorization. The later expanded installation approval and actual device result are recorded in [first device opening](phase48-first-device-opening.md); this preflight is no longer an installation blocker.

The user approved installation of the exact signed HAP and its first UI opening at2026-10-14T09:28:10Z (`Sentinel_e268f40d2fd88191a6c75fbafff2a022`). This approval excludes replacement and uninstall of an existing application, identity creation, pairing and desktop execution. The approved file was rechecked: 5,318,102bytes, SHA-256 `50e91f2ad91eed14596dbc313a57d0dfba718a89c0e22fedfca2d08fa7a7c796`; the same single USB phone remains Connected. Installation was not attempted because the preflight cannot establish absence of the target bundle or guarantee refusal to replace it.

| Read-only check | Actual result |
|---|---|
| Device `bm dump -h` | `-n` selects one bundle; `-u` supports the current user or user0 |
| Target query, default user / user0 / user100 | Each returns `error: failed to get information and the parameters may be wrong.`; HDC process exit0 |
| Target query with remote exit capture | The same error; remote `bm` exit0 |
| Official structured `ohos-bm` target query | Tool inaccessible or not found on this phone |
| Device-filtered core logs for the exact target bundle | No retained matching lines; combined exit/tail options were later found incompatible, so this is not accepted log-query evidence |
| Device `bm install -h` and host `hdc -h` | Replace option documented; no exposed first-install-only or refuse-replacement option |

[Official bm documentation](https://raw.githubusercontent.com/openharmony/docs/master/en/application-dev/tools/bm-tool.md) identifies user100 as the initial system account and user0 as shared; a third-party application cannot be installed for user0. Dump defaults to the current active user, and specifying another nonzero account can fall back to the current active user. The three queries therefore do not prove absence across other accounts.

The same documentation states that installation defaults to overwriting. [Official bm implementation](https://raw.githubusercontent.com/openharmony/bundlemanager_bundle_tool/master/frameworks/src/bundle_command.cpp) initializes `RunAsInstallCommand` with `InstallFlag::REPLACE_EXISTING`; selecting `-r` retains that flag. Its dump path converts an empty service result into the generic failure message, while [the executable entry](https://raw.githubusercontent.com/openharmony/bundlemanager_bundle_tool/master/frameworks/src/main.cpp) exits0. These sources explain why omitting `-r` and checking exit0 cannot provide a refusal-to-replace guarantee. They are OpenHarmony primary sources, not proof that every internal implementation on this commercial HarmonyOS phone is identical; the observed command help provides no stronger guarantee.

The remaining prerequisite is a reliable, target-only absence check or a verified official operation that atomically refuses any existing bundle. Do not substitute `hdc install` without `-r`, a generic query error, or a zero exit code for that prerequisite. No broader application inventory, user data, installation, uninstall, launch, HUKS identity, relay or installed DSH operation was performed. The existing installation and first-opening authorization remains available once this prerequisite is satisfied.

Evidence: [command help and scoped queries](../evidence/phase47-bundle-query.json), [actual remote exit status and structured-tool availability](../evidence/phase47-specific-status.json), [target-filtered errors and exact HAP hash](../evidence/phase47-own-query-errors.json). Device identifiers remain masked.
