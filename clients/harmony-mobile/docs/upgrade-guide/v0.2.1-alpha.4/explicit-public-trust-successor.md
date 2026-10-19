---
kind: upgrade-guide
description: Explicit continuation of expired mobile public pairing records with preserved identities, history and revocation epochs.
---

# Explicit mobile public trust continuation

## Change

The candidate reads `harmony-product-public-trust/1` and `/2`. An expired record blocks automatic activation but remains available for explicit continuation. A new `/2` document contains the next acknowledgement, every prior record and receipt, a digest of the retained document, the durable desktop revocation epoch, and an original desktop P256 signature. Local revocation remains terminal. Corrupt storage and unknown writes remain blocked.

Initial desktop enrollment refuses an existing grant record. Continuation requires the original expired phone record, matching original identities and exact Session/operations, a durable desktop tombstone, a different relay pair identifier, new phone proof and fresh desktop authorization. The new grant epoch follows the retained revoked epoch. The relay pair uses its own namespace and journal; neither the old pair nor grant is restored. Storage capacity is configured by `publicTrustMaxBytes`; full history must fit before a challenge is issued.

## Migration

Preserve the original app data, HUKS alias, protected desktop identity, public records, Session and admission history. Review the unsigned candidate, complete file manifests, permission list and pending approvals in [phase69](../../phase69-successor-candidate.md). Signing, installation, relay changes and the new bounded authorization each require their corresponding approval; preparation does not activate them.

After approval, export the retained public document, select `renewal.previousPublicPath` in the isolated field profile, and use a new pair identifier and new relay journal. Compare both original fingerprints, exact Session, operations, new epoch and deadline on both devices. Save the signed successor through the native confirmation flow before explicitly connecting. An expired, revoked or failed operation never silently recreates keys or clears data.

The `/2` file is forward-only: an old `/1` HAP cannot read it. Before installation, the prior signed HAP and inactive relay files are preserved for artifact rollback. After migration, revoke the new desktop grant, stop both transports, retain the `/2` file and all journals, and keep an older HAP disconnected. Do not overwrite `/2` with `/1`, delete histories, downgrade epochs or reactivate the original grant. This private client format changes no released DSH Session or SQLite schema.
