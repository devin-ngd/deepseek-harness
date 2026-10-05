---
kind: upgrade-guide
description: "Rich-inline render diagnostics extend persisted action records and require an updated Desktop container."
---

# Upgrade rich-inline rendering and diagnostics together

English | [中文](guide.zh.md)

## Change

The experimental plugin installs default HTML authoring for substantive replies, including news and reports. New results use `rich-html` fenced JSON; existing publication tools and markers remain supported. Streaming previews are read-only and do not execute generated scripts. Long structured Markdown receives a labelled compatibility view, which does not count as authored interactive HTML. Live format failures receive at most one logged correction by default (`maxFormatRepairAttempts`, 0–2); that correction cannot execute tools or repeat business operations. History viewing never triggers it. Disable the plugin to retain the old message presentation. Its ledger accepts an internal `render` action alongside `submit` and `cancel`; older builds cannot read these records. Existing records remain readable by the new build.

Desktop's native `acquire` request adds optional `sdk` source, executed separately before authored JavaScript. Older containers reject this field. Generated content gains no additional capability.

Desktop also reads the current Client injections from its Host on each page boot over private process IPC. Rebuilding both processes prevents plugin replacement from leaving cached, removed module URLs behind on refresh. This does not change the public HTTP or generated-content bridge.

## Migration

1. Back up the profile's `rich_inline` storage files before upgrading. Keep this backup if a downgrade may be needed.
2. In the modified checkout, run `pnpm run build:lib` and `pnpm --filter @deepseek-ai/dsh-desktop run build`. Install the updated plugin `.tgz` through Desktop's plugin manager, keep its switch enabled, and restart with `pnpm run start:desktop`.
3. Ask naturally for a news report or animation. Confirm a read-only message preview while generating and a live block after completion. Runtime exceptions should produce a trusted repair status and a versioned replacement while drafts stay intact. No prompt reminder or additional rendering tool call is needed for the new format.
4. Complete-prompt presets receive a logged runtime-context format reminder. Ordinary sessions need no prompt changes. Set the plugin's `maxFormatRepairAttempts` to `0` if additional formatting requests are unwanted. A model still returning Markdown has failed HTML acceptance; its compatibility view preserves the answer.
5. To stop using the feature, disable its switch. To downgrade, restore the previous Desktop/plugin builds and the pre-upgrade ledger backup; retain a separate copy of newer records. Never delete or edit current records to satisfy an older parser.
