# 原样富交互与双端时限验收

本记录限定当前离线后继交付。`.4` 运行包和公开维护工具 `.3` 已先封存，再以解压后的相同字节运行最终浏览器、独立目录和跨进程测试。9项源码测试与8项双进程恢复案例通过，真实模型调用为0；旧 `.3` 运行包、`.2` 工具、客户端15/60秒限制及已安装产品均未改变。当前证据不能建立 ArkWeb、实际手机 HUKS/TLS、Linux 持久化或真实手机到桌面执行资格。

## 原始交互

[固定响应](../integration/replay-host.ts)通过维护中的 `installLlmReplay` / `fromRequest` 从规范 `Interactive input` 提取实际 actionId。原发布仍为 `window.rich.bindForm(document.querySelector("form"))`，不选择替代 ID、不改 HTML/SDK 或页面 crypto。回放捕获只允许 ID 字符，不把任意模型输入拼入 JSON。

[原样浏览器测试](../scripts/field-original-browser-test.mjs)运行两次独立的受限 `dsh --profile harmony-mobile-replay`：A写入原始富表单后被终止，B重开同一 synthetic world。测试读取封存候选内由实际 ETS owner 生成的完整 HTML 字节，经父级私有 MessagePort 转送原始 rich 请求，再真实点击表单按钮。浏览器生成的 UUID `1d289e90-9fc7-467e-9dfb-3b41cf135af6` 与规范 `rich_inline_complete`、guest completed 状态及重复回执一致；重复转送相同请求字节未增加执行。A1+B3共4个固定响应，原任务仍只出现一次，后续历史状态和取消通过。360/480px检查无横向溢出，控件至少44px，opaque guest不能读取父级驱动，页面错误为空。

候选携带的 `product-rich-document.html` SHA256为 `6571c44ee64051efae59b2b4e22485d0a1dcb93244b91a2ff99ab19909fcf083`；共享 renderer/SDK资源 SHA256为 `61d9b65367570ab5fd89e02a7f73f7e6e1a12ce76352437454ad387453fcf3c4`。构建核对124个 renderer 输入及9个直接来源。ETS owner在构建时使用明确 SDK 替身取得其原始 HTML，执行浏览器为本机 Chrome；这不表示在 ArkWeb 执行，也不重建或替换手机已安装 HAP。

## 公开 relay 时限

[双端时限模块](../standalone-relay/src/endpoint-timers.ts)严格读取 `harmony-relay-endpoint-timers/1`：desktop/phone 各有 maxChallengeTtlMs、maxRoomTtlMs，必须为正整数且不超过计时器上限。生成文件只投影选定客户端配置的公开限值；来源哈希随候选保存。`prepareFirstUseRelayConfig`、`firstUseRelayPreview`、`initializeFirstUseRelay` 均要求显式 endpointTimers，先核对 issuance 不超过两端较小上限，再允许提案或信任写入。

[离线提案](../standalone-relay/config.first-use.proposal.json)使用10秒 challenge、30秒 room，服务容量上限也为30秒。手机 `product.config.json` 与桌面 `field.enabled.example.json` 均保持15/60秒，哈希与基线相同。维护命令必须传 `--limits relay-endpoint-timers.json`；缺失、未知字段、过长 challenge/room 或更严格的任一端限制均拒绝。时限文件不是凭据、签名或服务授权，不能自行启动中转或初始化真实信任。

本次新增公开时限文件及私有包参数/argv要求，已经[双语升级指南](upgrade-guide/v0.2.1-alpha.2/original-field-interaction/guide.md)确认。SessionEventMap、SESSION_FORMAT_VERSION、SQLite SCHEMA_VERSION、身份、grant、field world、admission receipt及relay journal/head格式不变，不读取或迁移真实持久数据。测试文件载体仅属于受限 synthetic fixture，不是手机公开传输协议。

## 已运行检查

| 检查 | 结果及证据 | 可证明的层级 |
|---|---|---|
| `node scripts/product-check.mjs` | strict TypeScript，166模块通过 | 源码类型 |
| `node scripts/field-interaction-test.mjs` | [9/9](../evidence/phase53-interaction-vitest.json)，包含完整首用交互、拒绝与双端时限4项 | 真实 DSH 服务组合、loopback、Chrome与SDK替身 |
| `node scripts/build-replay-profile.mjs --field-interaction` |1086源码输入，6个复制运行依赖组；[封存逐文件记录](../evidence/phase53-sealed-candidates.json) | Windows x64闭合ESM候选 |
| `node scripts/field-original-browser-test.mjs --candidate D:/Temp/harmony-field-sealed-RQCFlR/candidate` | [原始点击/恢复/去重通过](../evidence/phase53-original-browser.json) | 封存HTML、Chrome与固定回放 |
| `node scripts/field-interaction-restart-test.mjs --candidate D:/Temp/harmony-field-sealed-RQCFlR/candidate` | [8/8](../evidence/phase53-field-restart.json)，含真实写入阻塞、持久化失败、竞争锁及rich重开 | 两个独立Windows进程、合成world |
| `node scripts/detached-field-interaction-test.mjs --candidate D:/Temp/harmony-field-sealed-RQCFlR/candidate` | [4固定响应、23流式帧](../evidence/phase53-detached-profile.json)；缺fixture/live argv/旧配置/无TTY拒绝 | 仓库外副本，模型环境被移除 |
| `node scripts/build-first-use-relay-tools.mjs` 及 `node scripts/field-relay-tools-test.mjs --tools D:/Temp/harmony-field-sealed-RQCFlR/tools` | [公开提案、独占输出、缺limits/不兼容limits/无TTY拒绝通过](../evidence/phase53-relay-tools.json) | Windows构建工具；未初始化信任、未监听 |
| `node scripts/field-interaction-record-pair.mjs` | 维护中的section-hash helper核对双语指南 | 私有包文档配对 |
| `node scripts/seal-field-interaction.mjs --runtime` / `--source` | [交付记录](../evidence/phase53-deliverables.json)，测试入口哈希、解压逐文件字节、前代与客户端限值核对 | 明确列出的源码/证据与回退前像 |

沙箱曾阻止 Node realpath，实际 EPERM [证据](../evidence/phase53-original-browser-sandbox.json)保留；最终同一受限离线命令使用窄主机重试通过，无自动审批拒绝。初次新驱动曾误把 Playwright DOM 参数当 actionId，修正测试驱动后通过；失败记录原样保留。未运行真实模型、全仓测试、官方 ArkTS/HAP编译、签名、安装、手机命令、SSH或服务操作。旧全量文件检查存在历史证据/链接失败，本次只声明所列源码/文档格式和链接检查，不改写历史材料。

## 交付、回退与确认范围

| 交付 | 大小 | SHA256 |
|---|---|---|
| `D:/Temp/dsh-harmony-replay-profile-0.0.0-first-use.4.zip` |2648175字节| `d3177c0a27a8f32a02aa4ca153fa5f7c0017633fe44ab3ba33df963cb480fe88` |
| `D:/Temp/dsh-harmony-public-first-use-tools-20261014.3.zip` |176360字节| `b3d9262aca7e73a7a88f2ff4b71d8a05cbc449db95536ffb4ea78c24acf88f96` |
| `D:/Temp/dsh-harmony-original-field-interaction-20261014-delta.zip` |见交付记录|见交付记录|

源码增量以第52阶段 companion为前提，包含明确文件清单、哈希及18个修改前像；不是完整项目备份。回退源码先比较后继哈希，再只恢复清单中的前像，并移除本次明确新增源码。保留所有已初始化身份、world、receipt、unknown记录及公开撤销状态；退回旧代码不代表可用旧格式读取新数据。旧封存包不覆盖、不删除、不重建，未改动主仓用户的两个dirty文件。

更正确认要求：TTY或原生产品确认本身不强制用户亲手操作。用户明确授权具体身份、绑定、限时grant或服务操作后，代理可以在该范围内输入普通确认；现有控件、精确确认词和TTY要求保持不变，不能改配置绕过。密码/私钥传输、必须本人完成的登录或明确策略交接仍分别处理。本次离线修复授权不包含真实身份创建、信任初始化、服务启动或手机权限。

下一次真实首用需先取得准确范围：既有手机 HUKS身份与 Windows受保护本地 alias的创建/存储、指纹绑定和30分钟原始grant；指定中转公开journal/head/锁目录、窄ReadWritePaths、配置及短时stop/start；随后按原有确认进行现场验证。现有签名HAP可复用，无须为了本次Node候选重新签名或安装。实际HUKS编码/签名互通、TLS/E2E、ArkWeb隔离、Linux目录同步/断电及手机发任务→桌面执行→正确会话富交互→重连不重执行，仍需真实证据。

无需扩大权限即可继续的工程包括：日常桌面/项目接入、手机冷启动pending intent持久化、过期/撤销重配与跨端撤销、审批回复、多富块和附件呈现。通用未完成/耗尽回放自动恢复仍拒绝；当前跨进程成功仅覆盖列出的固定回放状态。
