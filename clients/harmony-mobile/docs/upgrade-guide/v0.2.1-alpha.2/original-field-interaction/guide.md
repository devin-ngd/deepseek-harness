---
kind: upgrade-guide
description: Public relay maintenance requires endpoint timer limits and fixed replay completes the actual SDK action.
---

# Original field interaction

## Change

The successor fixed replay resolves the completion actionId from the canonical Interactive input using the maintained replay placeholder mechanism. The authored HTML, bindForm script and shared guest SDK retain their ordinary randomly generated action identity. Tests no longer replace the form script or select a second identity for the browser interaction. Existing identity, Session, world and relay-journal formats remain unchanged.

Public first-use preparation, preview and initialization require an explicit endpointTimers argument. The maintenance commands require --limits with harmony-relay-endpoint-timers/1, projected from the selected desktop and phone relay policies. Issuance longer than either endpoint accepts refuses before proposal output or public-state initialization. The source server proposal uses10-second challenges and30-second rooms; endpoint caps remain15seconds and60seconds.

## Migration

1. Preserve the sealed .3 runtime and .2 maintenance tools. Build and review their successors without enabling either deployment.
2. Pass the candidate's relay-endpoint-timers.json to both prepare-public-config.mjs and initialize-public-trust.mjs using --limits. Update same-process consumers to pass the same explicit limits; older argv refuses.
3. Keep desktop and phone policies unchanged. Regenerate the timer projection when an actual endpoint configuration changes, verify its source hashes, and recheck relay compatibility.
4. Validate the sealed candidate's original page with an actual browser click and use its observed SDK actionId for completion and duplicate evidence. Browser execution does not establish ArkWeb acceptance.
5. Retain every prior credentials, Session, receipt and public-revocation record. No deployment, identity migration, new grant or service activation follows from this source change.

## Local confirmation

TTY and native confirmation controls remain enforced. After the human authorizes the exact identity, binding, bounded grant and service action, an agent may operate ordinary product confirmations within that authorization. The UI control alone does not require the human to press it personally. Password/private-key transfer, account login or another mandatory handoff remains separately constrained. No real identity or deployment action is authorized by this guide.
