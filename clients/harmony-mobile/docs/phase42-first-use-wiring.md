# 首用产品入口与验收

本文是隔离候选的首用参考。`first-use.2` 补齐桌面身份、导入手机公钥、双端证明、原始 grant、provider 装配及手机动态连接配置。它只支持固定 replay profile，不接入已安装的 DSH，也不接受用户已有 Session 或真实模型。

## 入口与归属

| 层 | 可执行入口 | 归属与限制 |
|---|---|---|
| 桌面 | 候选内 `node field-launch.mjs --home <绝对隔离目录>`；内部仍为 `dsh --profile harmony-mobile-replay` | `field.json` 严格解析；disabled 或没有本地 TTY 时，在读取凭据、装配服务或联网前拒绝。只有固定 Session，最多 30 分钟、一个手机、十项既有操作。 |
| 桌面身份 | `DesktopIdentitySigner.open/initialize`，由 field 本地终端调用 | 选定隔离 profile 的既有 credentials-local provider；OPEN 只读选定记录，CREATE 必须单独确认，不覆盖已有身份。真实创建本阶段没有执行。 |
| 首用证明与授权 | `DesktopFirstUse.issue/confirm/install` | 导入手机公开 JSON；桌面签名覆盖主机、双方公钥、挑战、Session、操作和 TTL；手机核验后签名一次；原始 Authorization 的本地确认成功后才安装既有 paired providers。 |
| 手机 | 原生“创建/读取身份→粘贴桌面挑战→核验与比较→签名→粘贴公有配对记录→批准主机→连接” | HUKS ECE 既有 signer；实际 API 至少 20；默认 disabled、空 alias，不创建 key、读取 trust 或联网。ArkWeb 仅有原来的 scoped rich 端口。 |
| 中继配置 | `node prepare-public-config.mjs --config config.first-use.proposal.json --pair <relay-pair.json> --state <绝对日志路径> --output <新配置路径>` | 只生成严格公有 JSON，独占新输出；无 journal、监听或服务启动。模板的空 pairs 无法直接启用服务。 |
| 中继公有状态 | `node initialize-public-trust.mjs --config <新配置路径> --pair <relay-pair.json>` | 显示前严格校验，仅输出双方指纹、主机、pair/epoch、路径和期限；未知字段拒绝。本地 TTY 比较后输入 `INITIALIZE PUBLIC TRUST` 才独占创建 journal/head；不启动或重载服务；不覆盖、不修复 lock。 |

相应实现位于 [field](../replay-profile/src/field.ts)、[身份 signer](../desktop-plugin/src/identity.ts)、[首用 owner](../desktop-plugin/src/first-use.ts)、[手机 owner](../harmony/entry/src/main/ets/product/NativeProductOwner.ets) 和 [公有状态工具](../standalone-relay/src/first-use.ts)。现有桌面应用不需要改写 Electron 桥；新功能复用 Gateway、SessionController、Authorization、paired relay 和 rich-inline owners。

TTY 仅是这个 field 终端及公有初始化工具的本地确认载体，不是鸿蒙规定或通用测试前提。默认便携 replay、合成身份完整旅程和公开 JSON 准备都自动运行，无需 TTY；测试通过既有本地 authority/AuthorizationInteraction 提供明确的固定 fixture 决定。配置 enabled 不代表真实身份授权。其他可信本地 UI 可以调用相同 owner，但不能把配置布尔值当作指纹、凭据存储或网络批准。

## 首次使用顺序

1. 获得针对这台手机的官方 debug signing 和安装批准后，使用完整原生工程生成已签 HAP。先检查 `local.dsh.mobile.offlineproduct` 是否已存在；没有覆盖/卸载批准时保留它。这里的 unsigned HAP 只证明 API26 编译，不证明可安装。
2. 原生界面选择 alias。首次创建必须单独确认；已有 alias 只导出公钥。传递界面提供的 `{identityAlias,publicSpki,credentialId}` 到隔离 home 的 `phone-public.json`，不传递密钥、账号或手机号。
3. 在独立候选目录和全新隔离 home 使用 `field.enabled.example.json` 的副本命名为 `field.json`，审阅 host、pairId、alias、期限和限额。创建真实桌面凭据前，单独批准其存储方式：credentials-local 是明文 provider 文件，POSIX owner mode 已检查，Windows ACL 从所选 home 继承，没有验证 DPAPI 或 ACL 防护。不要把密钥写入 public JSON、日志或配置模板。
4. 本地终端选择 OPEN 或单独确认 CREATE，然后明确 `IMPORT PHONE`。将输出的 `exchange/desktop-offer.json` 粘贴到手机。手机核验桌面签名及自己选定的 HUKS 公钥，显示双方指纹、主机、固定 Session、所有操作、挑战截止时间和申请 TTL；人工比较后才签名。公开响应放到 home 的 `phone-reply.json`，桌面确认 `READ PHONE PROOF`。
5. 原始 Authorization 显示相同范围。明确 `ALLOW FIXED REPLAY` 后得到 `phone-pair.json` 和只含公钥/epoch/期限的 `relay-pair.json`。拒绝或失效挑战不会创建 grant/provider。期限自本地授权提交起计算；手动交换太慢时停下，重新确认，不延长期限或自动重试。
6. 中继操作员审阅公开 pair、配置和路径，再使用上表两个独立工具。当前服务器 broker 仍关闭，没有公有 trust。拟选 `/home/devin/harmony-relay/public-state/replay-v1.jsonl` 及其 `.head/.lock`，还需针对该目录的 unit `ReadWritePaths` 和服务配置/重载批准；本地候选没有执行这些操作。公有初始化不能通过 HTTP 或手机请求触发。
7. 中继独立启用后，桌面明确 `CONNECT FIXED REPLAY` 才打开指定主机的出站 WSS。手机粘贴 `phone-pair.json`，比较指纹并批准这个主机，然后单独点“连接”。Socket 使用证书校验，不能跳过 TLS 或重定向到另一个 host。
8. 固定测试的一次普通任务产生表单；提交表单触发第二次桌面任务并完成第三个 replay；再发送一项任务并取消第四个响应。需要核对 canonical Session、原始 task receipt、rich action 状态及双方断线恢复，不能只看界面提示。桌面 Enter 关闭 owner；不会自动取消已接受任务。

## 持久数据与恢复

新增 `harmony-desktop-identity/1` 是 credentials provider 内的独立 owner payload：公有 SPKI 和私有 PKCS8 只保存在明确选定的凭据文件。没有改动 Session event、Session 格式版本、SQLite schema、原始 grant 或 relay journal/head 格式；所有 committed generations 保留。

持久类型变更确认：serializer/parser 归 `DesktopIdentitySigner` 的严格记录 schema 所有，现有 CredentialsLocal 只负责原子文件写入。OPEN 对缺失、未知格式、错误曲线、私钥/公钥不一致或关闭状态明确拒绝；CREATE 对任何已有记录拒绝，没有旧格式回退、覆盖或降级。这是新 owner 记录，不替换任何已发布 Session/grant/journal generation。

手机保存既有 public trust 格式。冷启动继续 disabled；“读取已保存记录”只在原生决定后读取 app-private 公有文件，重新比较和批准 host，exact-record resume 不覆盖旧文件、不自动连接。撤销后的 tombstone 不能恢复连接，也不删除 HUKS identity。桌面冷启动需要新的本地 enrollment/grant 确认，并创建新的隔离 replay world；本候选没有提供桌面进程跨重启的任务恢复，也不能重新初始化旧 relay journal。需要新配对代际时，另行审阅新 pair/path；保留原撤销文件。

## 证据与限制

完整合成旅程用实际源码 Gateway/Authorization/SessionController/rich owners、实际 ETS owner 的明确 SDK 替身、真实临时 loopback WS 和 Chrome 执行 HAP 内未修改的富块文档。首次无挂载的 clear 保留初始空 iframe，避免多余空文档导航影响随后挂载；安全 sandbox/CSP、guest SDK 和请求范围不变。固定结果包括原任务一次派发、四次 replay、rich 表单提交及重复回执、控制链路重新证明、历史状态、取消、冷启动读取公有记录、撤销和清理，见 [完整旅程](../evidence/phase42-first-use-user-flow.json)。

Chrome 的 360/480 布局结果不能作为 ArkWeb 验收。SDK 替身的 HUKS 签名不能作为真实密钥证据。Windows 公有状态测试使用真实文件同步和明确的 directory-sync 替身；Linux目录同步/掉电验收尚未完成。实际手机 API/HUKS ECE、TLS、ArkUI 可操作性、ArkWeb 隔离、正式中继及桌面出站 WSS 均需后续实测。

本阶段只创建固定 fixture 身份和临时合成数据：真实身份创建/读取为零，真实 grant/provider/pair 配置激活为零，外部服务器改动为零。独立候选和 preimages 提供回退；仅回退列出的 client 文件，保留 receipts、撤销状态和已封存前代。最终真机成功标准仍是“手机发任务→桌面实际执行→手机流式/rich交互→正确 Session 与幂等回执”，合成通过不能替代它。

实际运行：`node scripts/build-product-core.mjs --first-use-wiring`、`node scripts/product-native-substitute.mjs`、`node scripts/first-use-wiring-test.mjs`（5/5）、`node scripts/product-check.mjs`（155 模块）、`node scripts/build-replay-profile.mjs --first-use-wiring`、`node scripts/detached-first-use-wiring-test.mjs`、`node scripts/build-first-use-relay-tools.mjs`、`node scripts/detached-first-use-relay-tools-test.mjs`、`node scripts/prepare-first-use-native.mjs --first-use-wiring`、`node scripts/build-native.mjs --first-use-wiring` 和 `node scripts/first-use-record-pair.mjs`。API26 unsigned HAP 为 5,262,630 字节，SHA-256 `bef84845149b9c8ee28a51d8fdeca651b0ea1ac3f98f5a0da0c61471c835d8bd`；[编译记录](../evidence/native-build/2026-10-14T06-48-07-600Z.json) 不含签名、模拟器或真机成功声明。已通过的行为检查没有为封存重复执行。
