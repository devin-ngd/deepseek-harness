---
kind: upgrade-guide
description: "Strict tool-result decoders must accept the approved plan and document data revision fields."
---

# Interactive tool results

English | [中文](guide.zh.md)

## Change

`exit_plan_mode` returns `{ approved: true, plan: string }` and includes that plan in its rendered confirmation. An approval carrying optional `reviewedPlan` uses the human-edited plan; ordinary approvals use the original argument. `custom` remains review feedback. `rich_inline_publish` also returns `dataRevision`; `rich_inline_update` uses render/data revisions to replace data without replacing page code. Integrations with strict result decoders must accept these fields.

## Migration

1. Update `exit_plan_mode` result decoders to accept `plan` and execute the returned plan. Continue sending the original `plan` argument.
2. Update `rich_inline_publish` result decoders to accept `dataRevision`. Use it with `renderRevision` for `rich_inline_update`.
3. Rebuild DSH before replacing the experimental plugin package: its HTML forms and live progress require the new Chat registry and question-content slot. Set the profile's `rich-inline.config.activePresets` to `[]` to enable every mode. The default `htmlQuestions` and `compactLiveProcess` settings are `true`.
4. Relaunch Desktop and verify that an edited plan appears in the recorded tool result and the next Agent request. [Package usage](../../../../packages/experimental/rich-inline/README.md) describes installation and configuration.
