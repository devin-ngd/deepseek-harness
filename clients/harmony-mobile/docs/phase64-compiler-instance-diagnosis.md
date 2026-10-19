# Client compiler instance diagnosis

The workspace Client failure is caused by mixing compiler installations during this task. The primary tsdown CLI executed a preset imported from the isolated checkout. Both installations contain tsdown 0.22.2 and Rolldown 1.1.1, with identical CLI bytes, but each loads a different native RolldownMagicString class. A changed chunk returned by the isolated preset is treated by the primary engine as a plain transform result and fails with Missing field code.

The unmodified packages/client/tsdown.client.ts preset has SHA-256 97e5a2e3097b7a13bd1335c52a94f0f7269f5361a6120da709ec815c243e621e, matching both the isolated base commit and the current primary source. A two-module dynamic-import fixture using that exact preset fails with the primary engine and passes with the isolated engine. No application source is needed to reproduce the error. A separate virtual-module matrix gives the same result:

| Engine installation | MagicString installation | Observed result |
| --- | --- | --- |
| Primary | Primary | Pass |
| Primary | Isolated | Missing field code |
| Isolated | Primary | Missing field code |
| Isolated | Isolated | Pass |

The correction is to execute the isolated checkout's own CLI, without putting the primary node_modules/.bin on its build PATH. No product source or dependency version changed in this phase. The isolated pnpm bin shims remain incomplete; explicit local CLI invocation is the verified procedure.

The full Client bundler passed with node node_modules/tsdown/dist/run.mjs --config-loader native --env.DSH_BUILD_FACE client from the isolated checkout. Web bundling passed with node node_modules/vite/bin/vite.js build from apps/web, using its declared Vite 6.4.3. The first supplemental Web attempt mistakenly selected root Vite 8.2.2 and failed on getWatchFiles; that log is retained. The corrected package command initially hit sandbox realpath EPERM and passed unchanged with host escalation. The final node node_modules/tsx/dist/cli.mjs scripts/build.ts --scope check passed both aggregates after the new artifact stages. Its first sandbox attempt reported type errors; a minimal filesystem probe confirmed realpath EPERM for Vitest declarations and linked workspace source files, and the unchanged command passed on the host. These are separate stage results; no new single root build:artifacts invocation is claimed.

The unsigned candidate remains D:/Temp/dsh-harmony-mobile-20261016-alpha4-unsigned.hap, 5268759 bytes, SHA-256 e44ef67753412e0486c37d994c451d10fddf224c1e4c22a07defb595ebcd3858. It was neither rebuilt nor signed or installed. Its native pipeline uses esbuild and official DevEco/Hvigor, so this workspace Rolldown failure does not alter its bytes or establish a native defect. Original key material, HUKS/DPAPI identity, grants, relay and installed desktop were not touched.

The phase63 source patch and original failure records remain unchanged. Approval for original-material signing and same-bundle in-place installation of this exact candidate is still pending. Real alpha.4 desktop profile execution, phone pairing, ArkWeb interaction and the final phone-to-desktop acceptance flow still require their own evidence. Passing Web and Node checks cannot establish those results.

Evidence: [summary](../evidence/phase64-summary.json), [virtual reproduction](../evidence/phase64-rolldown-repro.json), [actual unchanged preset](../evidence/phase64-preset-repro.json), [compiler instance handling](../evidence/phase64-rolldown-instance-check.json), [original failure](../evidence/phase64-original-client-error.log), [Client output](../evidence/phase64-client-local-cli.log), [Web output](../evidence/phase64-web-package-cli.log), and [final aggregate check](../evidence/phase64-build-check.log). The diagnostic scripts are local to this lab; the isolated checkout and frozen candidate remain the rollback points recorded in phase63.
