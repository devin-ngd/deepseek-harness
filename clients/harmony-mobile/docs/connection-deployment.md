---
kind: reference
description: 当前连接候选的签装操作入口、一次性attempt、签名/验签/安装guard、界面与身份读取边界。
---

# 当前连接候选的签装入口

本入口只处理已审计的**[候选证据](../evidence/connection-candidate/2026-10-18T08-25-35-312Z-facc28ee.json)**：5,219,694字节unsigned HAP，SHA-256 `8671f7fdfcba320739e15d2e0fc0309faa176137f5d2a2dbbaddf3bc1c7ded02`。默认动作是只读`plan`；`prepare`、`preflight`、`sign`、`verify-existing`、`install`、`inspect`、`launch`、`layout`、`input-alias`、`existing-identity`、`read-identity`和`capture`各自只完成一个最小步骤。

**2026-10-18本轮已按用户选择暂停，未安装、未启动、未执行UI操作。** 52项合成测试及只读plan经受控验证通过后，已创建[唯一attempt](../evidence/connection-deployment/attempt.json)，原手机CMM-AL10/API26预检通过，官方签名器执行一次。官方verify-app、原证书链及verify-profile/profile哈希检查通过；随后Windows拒绝运行未签名的`scripts/phase59-hap-payload.ps1`（SecurityError / UnauthorizedAccess），因此应用载荷与SDK位图比较未通过，不能安装。[保留输出复核失败](../evidence/connection-deployment/connection-deployment-202610181322412-5e373b96-failure-verify-signed-1792329836260.json)记录payload检查exit1；独立诊断确认拒绝来自脚本执行策略。签名输出、attempt及claim保留，未修改执行策略、未重新签名、未改桌面或relay。恢复须先通过受信任的系统管理方式解决校验脚本执行权限，再仅验证既有输出；不能重跑prepare/sign或删除claim。

## 冻结入口

| 用途 | 命令 |
| --- | --- |
| 测试 | `node --test tests/connection-deployment.test.mjs` |
| 计划（默认，零副作用） | `node scripts/connection-deployment.mjs` |
| 创建唯一attempt | `node scripts/connection-deployment.mjs prepare` |
| 只读核对原手机/API26 | `node scripts/connection-deployment.mjs preflight` |
| 原签名材料签名一次并内联验签 | `node scripts/connection-deployment.mjs sign` |
| 只验证已保留签名输出，不重签 | `node scripts/connection-deployment.mjs verify-existing` |
| 一次`install -r`同bundle升级 | `node scripts/connection-deployment.mjs install` |
| 安装后只读核对metadata | `node scripts/connection-deployment.mjs inspect` |
| 启动应用（boot只读已有public trust） | `node scripts/connection-deployment.mjs launch` |
| 读取owned布局并拒绝交互 | `node scripts/connection-deployment.mjs layout` |
| 仅在空输入框填写原alias | `node scripts/connection-deployment.mjs input-alias` |
| 点击“查看已有设备公钥” | `node scripts/connection-deployment.mjs existing-identity` |
| 轮询读取原public identity | `node scripts/connection-deployment.mjs read-identity` |
| 真机截图 | `node scripts/connection-deployment.mjs capture` |

`package.json`对应`check:connection-deployment`和`test:connection-deployment`。`plan`不写文件、不启动Java、不调用HDC；其它命令均要求已有attempt。

## 授权来源和attempt

`prepare`把本次用户选项记录为`current-session-user-selection`（“核对并签装候选（Recommended）”），并明确记录`sentinelApproval=null`、`fabricatedToken=false`。它**不是**旧的Sentinel批准，也不是助手生成的approval token；此前的Sentinel证据、旧`approval.json`和旧attempt都不能解释为本轮新授权。

attempt固定为`evidence/connection-deployment/attempt.json`，由`prepare`以排他创建写入，绑定本次run label和`.build/<label>/`目录。只要它存在，`prepare`就拒绝重建；签名/安装只能消费同一个attempt，换run不能绕过已开始的签名或安装。attempt的每一步都先记录`started`再执行，结果未知时保持可见状态，不静默回滚、不删除attempt。

不可重放动作另有固定路径的原子claim：`evidence/connection-deployment/claims/<label>-<action>.claim`，由`flag:'wx'`在签名器、HDC安装或UI输入前创建；`launch`沿用固定的`<label>-launch-attempt.json`。claim永久保留，未知结果、进程退出或崩溃后都不删除，第二个进程只会收到`claim-exists`。恢复只允许只读命令：签名未知用`verify-existing`，安装未知用`inspect`，启动未知用`inspect`或`layout`；即使attempt仍显示`pending`，claim存在也按已开始处理。

## 签名、验签与安装guard

`sign`只接受已通过`preflight`的attempt。先取得固定`sign` claim，再记录`started`；启动官方签名器前重新比对候选HAP字节/SHA-256、官方JAR哈希`a434b674…cf616d`，以及`prepare`记录的配置、密钥库、profile、证书四项材料哈希。只调用官方`DecipherUtil`/`SigningOptionsV2`，口令和私钥只在进程内使用，attempt和证据不记录完整Java参数或原文输出。签名器只执行一次；失败或超时记为未知，后续`verify-existing`只做只读验证。

验签使用官方`verify-app`/`verify-profile`和`scripts/phase59-hap-payload.ps1`：使用官方JAR前也固定其哈希，原证书链必须是`83cccc2f…46bd9`，解出profile必须等于attempt在`prepare`时记录的profile哈希（不重新读取材料后自比），23个应用条目的名称、大小和SHA-256必须不变，唯一允许的新增是SDK再生成的`.pages.info`。`signedResult`只有在这些检查全部通过后才写`verified=true`；任一不符时`install`拒绝。

`install`要求`verified=true`、输入哈希等于当前候选、原证书链、payload一致、签名器执行一次，且attempt的`install`仍为`pending`。在任何HDC调用前取得固定`install` claim并记录`started`；带时间戳的install-attempt证据只是明细，不是互斥依据。成功条件是exit0且输出含`install bundle successfully`；失败或结果未知记为`unknown`并停止，后续同一attempt拒绝再次安装。没有卸载、清数据、权限扩大或材料重生成。

## 安装后证据边界

`inspect`只读核对bundle、versionName `0.0.0`、versionCode `1`和可选权限；它记录`installKnown`。**同一版本的metadata不能证明安装的是哪个精确产物**，因此报告把签名输出SHA-256、精确安装参数、成功回执和安装后metadata并列记录，不能把其中一项单独当作运行字节证明。`launch`只在安装已知成功且`inspect`通过时允许；安装未知时只能`inspect`，不能启动。

`launch`先写固定`launch-attempt` claim，再在`aa start`前记录`started`并置`sideEffects.launch=true`，然后只调用一次`aa start`并等待`pidof`出现。失败或超时记为`unknown`，之后只允许`inspect`和只读`layout`诊断，不再推荐或允许再次launch。启动的安全前提是手机端`MobileProductRuntime.boot`只读取并验证已有public trust，连接保持`disconnected`，不调用`connect`。布局检查要求owned窗口存在、无foreign overlay、连接状态文本为“未连接”或“连接已停止”，且“连接电脑”控件未启用；否则停止，不点击连接、不盲点坐标。

## 界面和原身份读取

`layout`每次从`uitest dumpLayout`重新读取，控件按type/text/hint/bounds唯一匹配；隐藏或歧义控件直接停止并要求人工处理。`input-alias`只在输入框为空时写入原alias`harmony-phase54-phone`；`existing-identity`只在alias已存在时点击“查看已有设备公钥”。两者都在`uiInput`前取得各自固定claim并记录`started`，失败记为`unknown`，不重复输入。`read-identity`轮询布局，直到出现唯一public identity JSON，然后要求字段恰为`credentialId`、`identityAlias`、`publicSpki`；`publicSpki`先按base64url解码，再对其字节自行计算SHA-256并与原公开指纹`p256-sha256-6dbd…fe9b99`比对，`credentialId`文本不能替代该计算。

这些操作只读取已有身份：不创建身份、不签配对挑战、不保存新范围、不连接relay、不改桌面profile、不调用真实模型。`capture`只保存真机截图。

## 合成测试

`tests/connection-deployment.test.mjs`只使用纯函数、临时目录中的claim子进程和注入的UI操作适配器，不启动Java、HDC、签名器或设备。覆盖固定哈希/字节、错误设备与API、错误证书链、额外或缺失权限、既有attempt、未知签名、安装不重放、签装guard、固定claim争用/二次拒绝/崩溃claim、两动作真实路径、nextCommands只读恢复、HDC命令allowlist、foreign overlay/隐藏控件、SPKI自行哈希负例和`plan`零写入。HDC和签名效果均未在测试中执行。本轮运行`node --test tests/connection-deployment.test.mjs`为52项通过，并运行`plan`零写入检查；候选未变，`tests/connection-candidate.test.mjs`的101项本轮未重跑。
