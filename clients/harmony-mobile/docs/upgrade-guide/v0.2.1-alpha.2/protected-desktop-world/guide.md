---
kind: upgrade-guide
description: Desktop field identities require Windows user protection and enabled field configuration requires explicit stable storage.
---

# Protected desktop field storage

## Change

DesktopIdentitySigner requires an explicitly selected protection provider and accepts harmony-desktop-identity/2 encrypted owner records. The previous harmony-desktop-identity/1 plaintext payload is preserved and refused, with no automatic migration or plaintext fallback. Enabled field.json uses harmony-replay-field/2, identityProtectionTimeoutMs, and an explicit world with path, mode, maxAdmissionRecords and lockWaitMs. Disabled version1 and version2 configurations remain inert and accepted. No released Session, grant or relay-journal generation changes.

Field create refuses every existing world directory. Reopen requires the exact ready harmony-field-world/1 owner, original Session and admission journal; it never creates replacement history. A local process lock covers inspection through teardown. Fixed replay resumes only a completed, unexhausted response position; an unfinished turn or exhausted four-response scenario refuses activation and preserves its data. Accepted task receipts now require canonical Session durability before the separate admission record is accepted. Enabled desktop plugins must provide and inject SessionPersistence, including its declared package peer.

## Migration

1. Keep the previous credentials file unchanged. Do not rename its format field or replace its privatePkcs8 field with base64-labelled data.
2. Review replay-profile/field.enabled.example.json and select the bounded Windows protection deadline and a new absolute world path. Choose create once; choose reopen with the same world, desktop id, identity alias, assets and isolated --home thereafter. Preserve the home credentials file and world together. Do not enable the profile during source-only qualification.
3. A separately approved new real identity must use a new alias and the Windows current-user provider. Existing plaintext aliases cannot be opened or overwritten by this version; no real migration tool is supplied.
4. Confirm with synthetic protection/reopen/refusal tests and a candidate build before any installation or activation. Windows DPAPI protects private bytes at rest for its user context; same-user compromise and Windows ACL enforcement are separate concerns.
5. Previous random worlds lack the new owner marker and cannot be adopted by renaming fields. Preserve them, their receipts and public revocations. No data adoption, in-flight model recovery or exhausted-scenario reset tool is supplied.
