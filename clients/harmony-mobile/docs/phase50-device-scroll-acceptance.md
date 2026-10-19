# Layout update installed and checked on the phone

The user approved the exact layout-fix signed HAP at2026-10-14T10:59Z (`Sentinel_02b7fc6eaca48191bcc703bcd4ba0337`). Its5,319,160bytes/SHA-256 `2673dc063fb62abf03c0c8d7659ed1c6886f339365a9b99a65abbf377f366d92`, official signature and unchanged app/device Profile were rechecked. Official HDC completed the in-place update and EntryAbility launched successfully on the same CMM-AL10/API26 phone. The installed bundle remains local.dsh.mobile.offlineproduct, version0.0.0/code1. No uninstall or app-data clearing occurred.

App-scoped, unmerged UITest layouts and harmless native input events establish these results:

| Scenario | Actual device result |
|---|---|
| Portrait page scrolling | Top title/status and bottom composer/actions reached in both directions through the long first-use page |
| Original bottom clipping | Composer [54,2396][1266,2531] and actions [54,2565][1266,2700] are fully inside [0,131][1320,2754] |
| Input and keyboard avoidance |512-character synthetic local draft entered; viewport height shrinks2623→1590px and the focused composer remains fully visible |
| Buttons with keyboard open | After scrolling, composer [54,1363][1266,1498] and actions [54,1532][1266,1667] fit inside the keyboard viewport ending at1721px |
| Keyboard dismissal | Viewport restores to2623px; return to the top succeeds |
| Test input cleanup | Both synthetic drafts cleared with verified native Ctrl+A/Delete; final composer is empty |
| Current-width buttons | Action group fully contained; send remains disabled and no button was clicked |

The initial diagnostic started while the page was scrolled below its header, so a header-based state guard stopped before input. Returning to the top resolved that diagnostic issue without reinstalling. The first empty-string input command did not clear the synthetic draft; that result is retained, and separate verified cleanup removed it. [Keyboard-open actions](../evidence/phase50-keyboard-actions.json) confirm the final empty draft and restored viewport. No test text was submitted.

The owned app remained running during acceptance. Its retained log contains an ImsaKit NotifyPanelStatusInfo message reporting a null listener while hiding the keyboard; no app exit or corresponding functional failure was observed. This log is retained rather than described as an error-free run. Narrow/short-window wrapping, rotation, large font, a long selected-session transcript, native multiline-field focus and actual ArkWeb form/touch behavior remain unverified. The current app is unpaired/disconnected; those remaining scenes were not activated by creating identities or desktop connections, and global device settings were not changed.

Evidence: [exact installation](../evidence/phase50-installation.json), [installed version and launch](../evidence/phase50-launch.json), [scroll/512-character input/keyboard round trip](../evidence/phase50-device-layout-resumed.json), [verified cleanup](../evidence/phase50-fixture-cleanup.json), [keyboard-open composer and actions](../evidence/phase50-keyboard-actions.json). Each trace links its app-only layout projections with pixel bounds. Inputs are recorded as length/synthetic markers; screenshots and unrelated app inventories were not collected. Phone identifiers remain masked. No identity creation, pairing, desktop connection, relay activation or real model call was initiated.
