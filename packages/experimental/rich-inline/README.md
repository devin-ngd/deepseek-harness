---
description: "Opt-in message-inline HTML, CSS and JavaScript with isolated Desktop guests and durable interaction receipts."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-rich-inline

English | [中文](README.zh.md)

## Summary

This optional profile layer adds arbitrary HTML fragments, CSS and JavaScript inside assistant messages. Desktop runs each block in an isolated native guest; Web shows its saved text fallback. Install the local package through Desktop's plugin manager and enable its switch. Default profiles do not include it. The Host owns drafts, attachments, action admission and outcomes; generated content cannot authorize tools.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

### Install into a profile

This checkout includes the required chat slot and Desktop container changes. Build and launch with `pnpm run dev:desktop`; subsequent launches can use `pnpm run start:desktop`. In **Plugins → Add plugin**, enter the absolute local `.tgz` path, finish installation and enable **@deepseek-ai/dsh-experimental-rich-inline**. Disabling the switch removes the layer and stops new rich interactions; saved conversation data remains. This package is unpublished: do not install it by name from a public registry.

After replacing an installed package, quit and relaunch Desktop completely. A page refresh or the plugin's Running indicator alone does not establish that the Host loaded its new module. In the next task's trajectory, verify the updated system prompt and `rich-inline:output-format` runtime context; the raw final answer should contain `rich-html` code. A Markdown compatibility notice means that answer did not use the new output contract.

Build the Host and Client halves before packing:

```powershell
pnpm run build:lib
pnpm --filter @deepseek-ai/dsh-experimental-rich-inline run bundle
pnpm --dir packages/experimental/rich-inline pack --pack-destination D:\Temp\dsh-rich-package
```

For a CLI-managed **Web** profile, the verified local install/removal path is:

```powershell
$env:DSH_HOME = 'D:\Temp\dsh-rich-profile'
node apps/cli/lib/bin.js plugin --profile web add 'D:\Temp\dsh-rich-package\deepseek-ai-dsh-experimental-rich-inline-0.2.1-alpha.2.tgz' --ignore-scripts --config.auto-install-peers=false
node apps/cli/lib/bin.js plugin --profile web remove '@deepseek-ai/dsh-experimental-rich-inline'
```

The CLI refuses to manage `desktop`: use the application plugin manager. `dsh.bundle.patch` activates [cordis.patch.yml](cordis.patch.yml), inserting the `rich-inline` row. An npm dependency alone does not enable it. Acceptance uses the source [overlay](../../../apps/web/tests/rich-inline.overlay.yml).

### What you get

By default, `activePresets: []` enables authoring throughout the profile. Set `activePresets: [lumina]` to require rich output only in sessions selecting that [declared mode](../../preset/agent-preset-registry/README.md). Other modes retain ordinary Markdown and coding tools, with no rich tools or formatting correction; saved rich blocks remain viewable. A Lumina declaration can use Standard's complete child plugin list so it retains the same coding capabilities.

`projectDefaults` selects a declared mode for fresh blank sessions in an exact project directory. It does not change resumed or started conversations, subdirectories, or a different explicitly selected mode. The new-session mode picker can override the project default before the first turn. Both fields belong in the `rich-inline` row's profile configuration; quit and relaunch Desktop after editing them:

```yaml
activePresets: [lumina]
projectDefaults:
  - path: /absolute/path/to/project
    preset: lumina
```

Project paths must exist; duplicate canonical directories fail activation. Empty `projectDefaults` adds no project default. Mode declarations and defaults are separate: an unknown or unusable preset is refused by the normal preset selection operation.

In enabled session modes, the plugin adds its [authoring contract](src/host/guidance.ts) after generic deliverable guidance and a logged runtime-context reminder, including existing sessions' next turn. Final answers default to HTML for everyday explanations, advice, summaries, instructions, code analysis and questions, even when short, as well as reports, comparisons and interactive interfaces. Simple answers use paragraphs, lists or code with built-in styles; `css` and `js` may be empty. Controls are optional and serve the content. Ask naturally; no tool reminder is needed. Brief acknowledgements without substantive information, short progress during execution and explicit text/source/file requests retain their requested presentation. Previously settled structured prose of at least 600 characters receives a labelled compatibility view without another model call; this is Markdown presentation, not model-authored interactive HTML. The original text remains accessible and persisted unchanged.

At a live turn's stop boundary, the plugin checks complete publications, unique keys and surrounding prose. A substantive text-only answer (at least 160 characters) or invalid `rich-html` publication receives at most one logged formatting correction (`maxFormatRepairAttempts`, 0–2, default 1). Correction uses the existing result, hides tool schemas and denies tool execution, so it cannot repeat business operations. Short conversation, explicit text/source requests and already-updated blocks are exempt. History viewing, mounting and refreshing never trigger this correction. A model that still refuses the format retains its original answer with a compatibility notice; it has not passed HTML acceptance.

New results use `rich-html` fenced JSON with `key`, `html`, `css`, `js`, `fallbackText`, `stateSchemaVersion` and optional `values`. Keys are unique within one message. The plugin renders the code; the Agent does not run a browser or publish a screenshot. Only a settled, uninterrupted assistant message can commit it. The Host rereads that persisted message before allocating state and enabling scripts. `rich_inline_publish` and its markers remain available for updates and repair; the same `blockId` updates the original message.

Streaming previews decode HTML/CSS in a separate read-only native guest, without generated JS or the business SDK. Updates coalesce at most once per 34 ms. Completed sibling fragments keep their DOM; unfinished-tail parsing is bounded to 32 KiB, so a large unfinished section may remain partly hidden until final commit. Cancellation or invalid JSON retains source without publishing a block. Trusted controls terminate previews. Final commit releases the preview and mounts the validated document. Conditional polling covers drafts, actions, files, repair and staged code; unchanged state transfers no manifest. The renderer has no fixed component catalog.

<a id="copy-parts-of-a-block"></a>
### Copy parts of a block

Desktop reveals a small copy icon when a marked region is hovered or its action receives keyboard focus. Touch layouts keep a compact action visible. Copying is local and does not send an Agent request. Ordinary selection and keyboard copying remain available; selected text and images also have native context-menu actions. Streaming previews have no copy controls.

Mark each reusable section with `data-rich-copy`: a review finding includes its title, location, explanation and suggested fix, while a prompt or rewritten passage contains only the desired output. A `pre` element gets its own action automatically. Text copying preserves code indentation and rendered paragraph breaks, omitting controls and hidden content. Mark decorations or line numbers with `data-rich-copy-ignore`; `data-rich-copy="off"` disables actions in that subtree. Nested regions use the innermost hovered action. Leave room at the upper right; do not generate clipboard scripts or duplicate buttons.

Use `data-rich-copy="image"` on an `img` or its `figure` to copy an inline PNG, JPEG or WebP as image pixels. Failed copies show a localized message and leave the content available for retry. [Desktop's native clipboard limits](../../../apps/desktop/README.md#message-rich-guests) apply.

### Task progress, questions and editable plans

In enabled modes, `compactLiveProcess: true` (default) shows one expandable live task row with the latest settled public progress text and tool counts. Existing process rows retain their parents and remain searchable; reasoning stays inside the process disclosure and Trajectory. The streaming response and final document remain visible. Interrupted, failed and interleaved-input turns retain their open presentation; Verbose retains all process rows. Disable the plugin or set `compactLiveProcess: false` to restore ordinary live rendering.

`htmlQuestions: true` (default) presents trusted HTML forms on Desktop and Web through the original question channel. Forms support single and multiple choices, text, explicit skips and session-scoped browser draft recovery. Plan review keeps canonical Markdown in an editable field with a preview: submit it unchanged or edit and approve it; return feedback with Keep planning. The submitted `reviewedPlan` becomes the `plan` returned by `exit_plan_mode`. Closing uses the existing question dismissal operation. Generated document scripts cannot settle these requests. Set `htmlQuestions: false` to use the ordinary question composer.

For an ongoing document, publish its code once and render values with `window.rich.onState`. `rich_inline_update` takes `blockId`, `expectedRenderRevision`, `expectedDataRevision`, complete `values` and readable `fallbackText`; it rejects stale writers and replaces confirmed state without replacing code, remounting the guest or changing unsent drafts. Use `rich_inline_publish` for code replacement. The update result supplies the new `dataRevision`; submitted interactions also carry render/data revisions. Ordinary progress does not require a new publication or a business action ID.

### Built-in dark appearance

The default `theme: cyber` with `accent: auto` installs the same base CSS in every native preview and final block, including historical blocks on reopening. [Appearance settings](src/shared/theme.ts) come from the Host profile, so the model guidance and Client agree. Semantic headings, lists, tables, code, details and controls receive consistent spacing, contrast and focus indicators even when `css` is empty. The outer chat theme does not change.

Choose a theme on this bundle's Plugins page details, in the Interactive content theme section. Each tile previews its palette. A choice is saved to the `rich-inline` row's profile `config` without restarting the Host. Open blocks save their drafts and reload with the new sheet; a block whose draft cannot be saved keeps its old look and input. Without that page, set the same fields in the profile layer and quit and relaunch Desktop; defaults need no configuration:

```yaml
theme: cyber
accent: auto
```

`theme` accepts `cyber`, `aurora`, `neon`, `terminal`, `ember`, `dark` (graphite) or `none`. `accent: auto` keeps each theme's own accent pair; `blue`, `violet` or `teal` replace it. Every sheet is dark and declares the same `--rich-*` tokens and classes, so authored CSS follows a switch:

| Theme | Character | Background, text, auto accent pair |
| --- | --- | --- |
| `cyber` | Deep-space console: faint top grid, corner brackets, monospace labels, gradient plain-text `h1` | #070b14, #d6e2f3, #3dd0ff + #8b7bff |
| `aurora` | Polar night: soft green and violet light bands, rounded translucent cards, pill tabs | #071318, #d5e7e6, #4ee3b0 + #a77bff |
| `neon` | Synthwave: magenta horizon glow, vertical grid, glowing title, monospace labels | #0d0718, #e6dcf5, #ff4fd8 + #36e4ff |
| `terminal` | Phosphor screen: monospace body, scanlines, square corners, flat cards | #050a06, #c6e8cc, #3dff7a + #2ee6d6 |
| `ember` | Warm charcoal with amber-to-rose light | #110b08, #ece0d6, #ff9a3d + #ff5e7a |
| `dark` | Calm graphite, one soft accent, almost no glow | #121317, #e3e5ea, #7aaaff + #b49cff |

Accent overrides use #3dd0ff/#8b7bff, #b28dff/#4cc2ff or #2ee8c6/#4d9bff in the glowing themes and #7aaaff, #b49cff or #5cd4c0 in graphite. Under every theme and accent, body text has at least 7:1 contrast; muted text, accent text and filled-button text have at least 4.5:1; input borders have at least 3:1. Body text never glows. `theme: none` disables the base CSS and its authoring instructions while retaining rich output.

Each block is one card: a slim trusted header with the mark, title, status and tools sits on the block background above a hairline, followed by the content without a second frame. `rich-answer` is an unframed wrapper. The header, notices and disclosures read the same palette, so the block appears as one surface under either chat theme. Glowing themes tint the border and add a top edge light that pulses while a preview streams; reduced-motion preferences stop the pulse. Generated CSS loads after the theme and can make local token or rule overrides; base element rules use zero specificity, so any authored selector wins. Fixed colors in older authored CSS keep their precedence; regenerate that result to adopt the full styling convention.

The prompt asks for a concise answer first, moderate headings, restrained decoration, readable contrast and useful interactions. It recommends a structure for the content instead of turning every response into a dashboard:

| Common answer | Reusable styling |
| --- | --- |
| Explanation or analysis | `rich-answer`, `rich-lead`, `rich-section`, `rich-muted` |
| Comparison or searchable list | `rich-table-wrap`, `rich-list`, `rich-tabs`, `rich-badge` |
| Procedure or checklist | `rich-steps` on an ordered list |
| Research or news | Sections, native `details`, `rich-sources` |
| Data summary or chart | `rich-grid`, `rich-card`, `rich-value`, theme chart colors |
| Form or interactive tool | `rich-form`, `rich-actions`, `rich-primary`, labelled controls |
| Code or debugging | Semantic `pre`/`code`, `rich-callout`, `rich-warning` |
| Animation or demonstration | A custom scene with theme colors and local motion controls |

These classes are optional; arbitrary HTML/CSS/JS still works. Responsive grids collapse on narrow widths, wide tables scroll inside their wrapper, and the base sheet respects reduced-motion preferences. [Four runnable examples](examples/theme.ts) demonstrate answers, comparisons, a local form and a filtered bar chart. Consumers can import `RICH_CYBER_CSS`, `RICH_DARK_CSS` or `richThemeCss()` from `@deepseek-ai/dsh-experimental-rich-inline/theme`; the plugin already injects the sheet, so model answers should not duplicate it.

Example assistant output (the message UI renders the object):

````text
```rich-html
{"key":"hello","html":"<section class='rich-answer'><h2>Hello</h2><button>Count</button><output>0</output></section>","css":"","js":"let n=0;document.querySelector('button').onclick=()=>document.querySelector('output').textContent=String(++n)","fallbackText":"Hello: local counter","stateSchemaVersion":1}
```
````

The guest's `window.rich` exposes state, draft saving, submission, status and cancellation. For named form controls:

```js
rich.bindForm(document.querySelector('form'));
rich.onState(snapshot => {
  document.querySelector('output').textContent =
    snapshot.actions.at(-1)?.state || 'Ready';
});
```

Local interaction need not call the model. A submitted input enters a normal Agent turn; an accepted receipt confirms durable admission, not completion. The Agent uses `rich_inline_complete` for a known result and `rich_inline_progress` for progress. File selection belongs to the trusted toolbar. Submission includes the block's current authorized file references by default. [examples/content.ts](examples/content.ts) supplies authoring examples, not supported-type limits.

The Agent authors complete code and returns the publication or legacy marker; the plugin owns rendering. Exceptions and unhandled rejections send scoped diagnostics for code repair. Each revision is reported once, with at most two automatic repair prompts per block lifetime (`maxAutoRepairAttempts`, 0–5); reload does not replenish this budget. Repairs use `expectedRenderRevision` to reject stale replacements, keep the input schema, and omit `values` to preserve confirmed data. Compatible repaired code activates after drafts are saved; schema changes still require trusted confirmation. A failed draft save keeps its guest and requires explicit update after resolving input. Closing stops automatic activation, without withdrawing an already queued Agent turn.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

| File | Responsibility |
| --- | --- |
| [cordis.patch.yml](cordis.patch.yml) | Explicit profile insertion, without default-profile changes. |
| [src/host/index.ts](src/host/index.ts) | Ownership, draft CAS, grants, durable outbox and outcome reconciliation. |
| [src/host/tools.ts](src/host/tools.ts) | Publication and causally matched completion/progress. |
| [src/shared/types.ts](src/shared/types.ts) | `lumina-rich/1` snapshots, receipts and input. |
| [src/client/controller.ts](src/client/controller.ts) | Native lifetime, update barrier and recovery. |
| [src/client/guest-sdk.ts](src/client/guest-sdk.ts) | Latest form input, saving and retry lifecycle. |
| [Desktop rich-guests.ts](../../../apps/desktop/src/rich-guests.ts) | Process isolation, denied capabilities and termination. |

One authoritative record per Session atomically saves draft, original receipt and outbox. Dispatch uses a stable Session request ID and existing persistence. Identical action retries return the original receipt; changed content under the same action ID conflicts. Completion requires the owning Session's successful tool result and matching turn. Admission, completion and external effects remain separate facts.

Remote mount operations declare the Session they access. Every request after mounting carries `sessionId` and `mountId`; the Host rejects a Session that differs from the mount's recorded owner. The trusted Client supplies the Session after reading a guest packet, so generated scripts cannot select it. Non-owner calls require a Session binding for the exact `richInline/<method>` action; global access does not grant Session access. Update Host and Client together and refresh old pages; see the [RPC migration](../../../docs/upgrade-guide/v0.2.1-alpha.4/rich-inline-session-requests/guide.md). The package declares `engines.dsh` as `>=0.2.1-alpha.4 <0.2.1-alpha.5`; complete native interaction still requires the Desktop integration listed below.

The optional Host-owned `ctx.richAuthoringPolicy.excludes(agent)` excludes exact Agent instances from authoring guidance and tools before preset selection. Without this service, authoring follows `activePresets`; it does not change viewing or saved publications.

Replacement is staged while mounted or dirty. The trusted update button flushes current input before retiring the old lease. Compatible schemas preserve edits; incompatible schemas require trusted archive confirmation. Archived drafts are readable and copyable outside generated content. Temporary DOM state stays local unless saved explicitly. History does not replay actions. A Session fork restores only publication facts from its inherited prefix, with no parent actions, drafts or grants; inherited blocks are read-only. Restoration preserves separate render and data revisions in current results; older revision-only results use that revision for both counters.

Each block has a fresh nonpersistent partition and separate native process. `sandbox`, `contextIsolation` and `webSecurity` stay enabled, with Node disabled. The preload exposes bounded JSON transport; main binds packets to the actual owner and lease. Network, WebRTC, navigation, windows, downloads, permissions, guest file picking and drag/drop are denied. A looping guest can be closed and reloaded while chat stays responsive. DOM, inline CSS, data images/media and the separate `js` field are supported. HTML event attributes, external dependencies, workers and dynamic evaluation are restricted.

Defaults: 2 MiB publication, 128 KiB input, 10 MiB/file, 128 blocks and 2,000 actions/Session. Native SDK reserve is 64 KiB; restored Host-to-guest snapshots allow 16 MiB. UTF-8 limits apply before mutation. Failed saves retain editable local input with a trusted warning: copy or correct it before refreshing. Oversized restored state retains complete durable data and shows text. Packet flooding visibly terminates its guest. Polling defaults to one second, configurable from 250–60,000 ms.

Verification commands (use new result directories):

```powershell
node apps/desktop/tests/check-rich-native-build.mjs 'D:\Temp\rich-static-new'
pnpm exec vitest run apps/desktop/tests/rich-native-lifecycle.spec.ts apps/desktop/tests/rich-guests.spec.ts packages/experimental/rich-inline/tests packages/client/ui-chat/tests --maxWorkers 2
node apps/desktop/tests/run-rich-native.mjs 'D:\Temp\rich-native-new'
$env:DSH_RICH_EVIDENCE_DIR = 'D:\Temp\rich-chat-new'
pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/rich-inline-native.e2e.ts
$env:DSH_TEST_CHROMIUM_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/rich-inline.e2e.ts
```

The real Electron fixture checks hostile behavior and process settings. The native chat test uses real Loader, Host, Session and Client with a deterministic model, verifying publish → input → Agent → update without paid calls. Acceptance requires exit 0, complete launch status, passing assertions and inspected screenshots. Process survival or CSP configuration alone is insufficient.

</details>

-----

## Usage and immutable source references

<a id="usage-source"></a>

The trusted `richInline.taskUsage(sessionId)` reads the Session without waking an Agent. `deriveRichTaskUsage(inspections)` combines task Sessions and deduplicates each Session ID and settlement sequence; inherited fork events remain billed to their original Session. Assistant message usage takes precedence over its embedded stream; otherwise the last usage chunk supplies the sample, including failed or cancelled attempts. Uncached input, cache read, cache write, output and reasoning have separate reported subtotals and missing counts. Reasoning is an output subset. Missing prices, total tokens and quality scores remain unknown; the API does not estimate them.

Before a subsequent admitted step, complete settled `rich-html` sources of at least `sourceOffloadMinBytes` bytes (default 4096) receive durable `rich-inline/source-offload` decisions. Successful `rich_inline_publish` and `rich_inline_update` calls above that limit receive `rich-inline/tool-offload` decisions after their correlated successful result. Only model-request messages receive short references; full source, original tool arguments and audit streams remain unchanged for native presentation, mount recovery, history and forks. Interrupted messages, duplicate keys, adapter replay state and failed or unsettled calls retain their original model input.

Each tool reference identifies one publication or confirmed full-state replacement by source hash and render/data revisions. It exposes only fields present in that original call; omitted publication values remain unavailable. References never read live drafts. Read the latest successful replacement reference for its confirmed values. Read-only forks copy successful state replacements up to the fork point, preserving the code and render revision and keeping drafts and grants empty; stale or failed updates are omitted.

`rich_inline_read` reads `html`, `css`, `js`, `fallbackText` or JSON `values` from a reference declared in the calling Agent's Session, including inherited immutable sources. This read tool remains available outside `activePresets`; authoring tools retain their mode restrictions. Offsets and lengths count JavaScript string units; `sourceReadMaxChars` bounds each read (default 8192). Responses include the original SHA-256, total length and continuation offset. Reading never mounts code, accesses files, grants authority or replays actions. Source positions, hashes, block identities and revision counters are validated during replay. Another projection cannot overwrite the selected occurrence. Sessions containing these decisions require the plugin interpreter even after reopening; see the [upgrade guide](../../../docs/upgrade-guide/v0.2.1-alpha.2/rich-inline-source-offload/guide.md).

<a id="further-exploration"></a>
## Further Exploration

See [Desktop](../../../apps/desktop/README.md), [chat](../../client/ui-chat/README.md), [plugin manager](../../boot/plugin-manager/README.md) and [Session persistence](../../session/session-persistence/README.md). Existing Harness permission checks and the Agent loop retain authority over model tools.

-----

<a id="model-experience"></a>
## Model Experience

### Interaction tools

#### What the model sees

The installed row registers a global authoring section and publication, completion and progress schemas. Submitted JSON enters a logged user message marked `inputTrust: "untrusted-rich-ui"`; interface content supplies data, not authorization. Render diagnostics use `inputTrust: "untrusted-render-diagnostic"`, separate from business actions. Publication returns a short marker, not runtime success. HTML and scripts appear in ordinary tool arguments and history.

#### Token effect

Successful rendering, polling, saving and local interaction do not call a model. Submission and bounded render repair queue normal model turns. The authoring section and tools add prompt tokens; large content adds history tokens. This package does not select an account or provider.

#### KV Cache effect

Interactions append existing Session events rather than rewriting old messages or replacing the Agent loop. Enabling tools changes the effective schema set under existing request-header rules. The authoring section is the same for every theme; a theme switch changes only the per-turn runtime context that names the active appearance.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Native qualification covers Windows Electron 44; other operating systems and signed installers are unverified here. The complete Agent chain uses a deterministic substitute, not a real-model call. Web deliberately shows text without executing JavaScript.

- Rendered signals establish SDK liveness, not visual correctness or security acceptance. Feedback covers script exceptions and rejections; layout mistakes require user feedback. A model can disregard instructions; deterministic acceptance does not establish real-model adherence. Complete-prompt presets still receive the logged runtime-context format reminder. Read the [upgrade guide](../../../docs/upgrade-guide/v0.2.0-rc.2/rich-inline-render-feedback/guide.md) before downgrading a ledger containing render reports.

- The bridge permits submission and cancellation, not arbitrary tools or network access. Running cancellation records intent; late known results remain visible. Unknown external outcomes require verification before a new business action. There is no claim of exactly-once external effects. Executable replacements remount instead of patching a live input DOM. Archive recovery is manual copying; each block keeps the latest 16 drafts. Draft saving is asynchronous; wait for durable save before refreshing. Legacy report links remain under the native navigation policy; the original-text view opens sources through trusted chat controls.

- JSON `single` rewrites the ledger unit; Session flush can wait for unrelated writes. Large deployments should evaluate the existing SQLite backend. Unsupported inherited publication history falls back to text instead of borrowing another Session's state.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
