---
kind: upgrade-guide
description: "Rich Inline and Safe External Research use new package names in profile dependencies and plugin entries."
---

# Experimental plugin package names

English | [中文](guide.zh.md)

## Change

`@deepseek-ai/dsh-experimental-rich-inline` is now `@deepseek-ai/dsh-rich-inline`, and `@deepseek-ai/dsh-experimental-safe-external-research` is now `@deepseek-ai/dsh-safe-external-research`. Rich Inline keeps its `rich-inline` entry ID and stored interaction data. Existing installations retain their old packages until their profiles are migrated; installing the new Rich Inline bundle alongside an enabled old one can activate both.

## Migration

1. In Desktop, use **Manage dsh Command…** to identify the command backed by the installed Desktop runtime; a separately installed CLI cannot manage the reserved Desktop profile. Fully quit Desktop, including its tray process. Back up the complete profile directory, including `package.json`, `pnpm-lock.yaml`, `cordis.patch.yml`, and any local package tarballs; also back up home or invocation patches that refer to either old name. Record bundle order, enabled state, and the exact old package sources for rollback.
2. Obtain compatible new package artifacts. Using the Desktop command, run `dsh plugin --profile desktop remove <old-package-name>` for each installed old package, then `dsh plugin --profile desktop add <new-package-spec>` for its replacement; use the new local tarball path for a locally packed Rich Inline. Do not run Desktop during this sequence. If the command refuses Desktop profile management, stop and use a Desktop release that supports it. Other profiles require the same operations with their own profile name.
3. In the profile's `package.json`, restore `dsh.profile.bundles` order and enabled state, substituting the new Rich Inline name for the old one only if it was selected. Installation automatically enables a new bundle. In profile, home, and invocation patches, replace each old package name in plugin `name` fields with its new name; preserve `id: rich-inline`, configuration, and disabled state. Update imports and dependency declarations in custom packages as well.
4. Restart Desktop and confirm Rich Inline has one selected bundle if previously enabled, or none if previously disabled; when enabled, verify its existing configuration and use it in a new Session. For Safe External Research, confirm its configured entry loads with the intended provider, model, source restrictions, and worker tools. If verification fails, fully quit Desktop and restore the backed-up profile and patches together with the old package source; do not delete Sessions or plugin data.
