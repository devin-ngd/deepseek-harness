# Native page scroll repair candidate

The candidate is now installed; [actual device results and remaining scenarios](phase50-device-scroll-acceptance.md) own its current qualification.

The maintained [Index.ets](../harmony/entry/src/main/ets/pages/Index.ets) now owns a single vertical Scroll with a viewport-sized width/height and an intrinsic-height content Column. First-use forms, catalogue, transcript, rich surface, composer and task actions share that scroll. The former independent360vp form and100/200vp catalogue scroll viewports are removed. Native button groups wrap within the page width, and the UIContext uses KeyboardAvoidMode.RESIZE. Controls remain reachable by scrolling rather than requiring all sections to fit simultaneously; the composer is not pinned.

The [observed predecessor](phase48-first-device-opening.md) had a viewport-height Column with fixed section heights and a weighted List. On the1320×2848px phone, content ended at2754px while the composer began at2832px; no ancestor could scroll the whole page. The same allocation becomes more restrictive when the keyboard reduces the visible height. The fix changes container ownership and removes fixed native section viewports, rather than choosing another phone-specific height.

[Five source regressions](../tests/product-layout.test.mjs) pass using the installed official SDK's ETS parser. They reject the captured old page, a viewport-sized content Column, a nested catalogue scroll, disabled keyboard avoidance and nonwrapping button rows. A keyless golden fixture extracted from the installed candidate retains17 locale-owned buttons' enabled conditions and callbacks. The [source audit](../scripts/product-layout-audit.mjs) also runs in the maintained native build entry for product/first-use variants. These checks inspect source containment and preserve actions; they do not measure ArkUI pixels, synthesize a device keyboard or qualify touch/ArkWeb behavior.

| Scenario | Checked in this batch | Still required on the new device build |
|---|---|---|
| Existing1320×2848px portrait | Recorded clipped baseline; one viewport-relative root and intrinsic content verified | Scroll from first-use fields to composer/actions; confirm no clipping against actual safe areas |
| Narrow/short window and landscape | All five button groups have bounded width and FlexWrap.Wrap; no fixed native section height | Observe wrapping, minimum usable input widths and full-page reachability |
| Keyboard shown/hidden | Official SDK API/ArkTS compile and gate requiring RESIZE | Focus alias, challenge and composer, including multiline text; verify caret scrolling and restored viewport |
| Long public form/catalogue/transcript | Source keeps all controls under one scroll and preserves message keys/actions | Scroll lengthy content and verify responsiveness, focus and position retention |
| Rich document present | Rich component, guest runtime and permissions have identical source hashes | Verify native scrolling around ArkWeb and form focus/touch inside the rich document |

Official unsigned type checking and CompileArkTS completed successfully using SDK26.0.0.105/Hvigor6.26.8; [compile evidence](../evidence/native-build/2026-10-14T10-06-07-034Z.json) records the source hashes. An independent signed candidate reused the already approved debug materials, passed official verify-app, and exported a Profile byte-identical to the previously verified app/device Profile. [Signed build evidence](../evidence/phase49-signed-layout-build.json) confirms that only entry/src/main/ets/pages/Index.ets changed within AppScope/entry/src and that both old signed HAP copies and original signing configuration remain unchanged. [Candidate metadata](../evidence/phase49-candidate-metadata.json) retains bundle local.dsh.mobile.offlineproduct, version0.0.0/code1, debug, compatibleAPI12/targetAPI26 and only INTERNET.

| Deliverable | Bytes | SHA-256 |
|---|---:|---|
| D:/Temp/dsh-harmony-mobile-20261014-layout-fix-signed.hap | 5,319,160 | 2673dc063fb62abf03c0c8d7659ed1c6886f339365a9b99a65abbf377f366d92 |
| D:/Temp/dsh-harmony-mobile-20261014-layout-fix-unsigned.hap | 5,262,219 | d190b1b0a273a76efbf2a5e7bf5e790c05b7906a3761045bc4c7a45399297bf2 |

The signed candidate is1058bytes larger than the previous sealed HAP. There are no new permissions, locale strings, protocol or persistence fields, endpoint activation or provider changes. The previous signed hash50e91f2ad91eed14596dbc313a57d0dfba718a89c0e22fedfca2d08fa7a7c796 remains preserved. Current installation and device qualification are recorded in the device report linked above.

The complete owned-file formatter/link validator was run and failed on existing CRLF/raw evidence and retained historical document links, including sealed phase41/42 records and the original device layout JSON. Those predecessor bytes were preserved; this batch does not claim that full gate passed. Changed-source/document validation is recorded separately. No exhaustive suite was run for this local layout repair.
