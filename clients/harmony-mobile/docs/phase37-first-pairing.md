# Phase37：首次配对合成闭环与实装准备

当前完成手机确认、桌面确认、短期 room、加密 enrollment、最小只读 grant、连接 proof 和撤销清理的完整合成流程。复用 phase34 的 authorization/credentials/scope、phase35 的共享加密 runtime 和 phase36 relay/lifetime；没有新增公开签名接口、host 执行桥或线上配对服务。原生签名与确认 owner 的实际 ETS 源码参与 SDK 替身测试，真实 HUKS、原生 TLS 和按钮执行尚待设备验收。

## 已实现与验证

| 层 | 实际成果 | 验证范围 |
| --- | --- | --- |
| 共享消息 | `src/pairing-protocol.ts` 集中 enrollment/device proof 字节顺序与严格只读 grant parser | 保持既有签名 tuple；消费者同步更新；已发布 Session 数据未修改 |
| 手机 owner | `src/phone-pairing.ts` 先预留确认状态，要求 exact native receipt，再绑定一次已认证通道 | 双端完整指纹、身份、Session、operations、grant TTL 和 ticket 到期时间；拒绝重放、异身份、过期和写/审批 scope |
| 原生 UI/signer | `NativePairingPresenter.ets` 管按钮、比较、撤回和到期；`NativeExistingIdentitySigner.ets` 仅导出已有 key 的 public bytes 并签署经本地 owner 选择的消息 | 未创建、导入或删除任何真实 key；SDK 替身固定公开 scalar6；真实 SPKI/DER 兼容性未知 |
| 短期 room | `integration/short-room.ts` 通过既有 relay provider 发布 digest，取消/到期清理，失败保留待清理状态，room id 不复用 | 固定公开测试 capabilities，仅内存；不生成或保存真实访问凭据；没有远程 create-room 路由 |
| 首次配对组合 | `integration/offline-first-pairing.ts` 在自身新建的 memory Context 中组合上述 owner | 默认 disabled；必须同时指定 synthetic-memory-only 与 replay-only 环境；没有 live profile/provider/网络选项 |

完整流程在原生确认前拒绝 connect，确认后才允许 E2E 签名；双方确认后仅授予 `phase37-synthetic-session` 的 `session.sync/task.receipt`。默认桌面拒绝，审批回复入口拒绝；撤销或 room 到期会停止 lease、加密 owner 和 fake socket，不重连、不重签、不取消已接受任务。只读 grant 不包含 task.submit/cancel 或 rich 写操作，所以此成果不等于手机任务执行和富块交互最终验收。

已执行 `node scripts/phase37-native-fixture.mjs`、`node scripts/phase37-test.mjs` 与 `node scripts/phase37-check.mjs`：14 条首次配对用例、16 条 relay 回归、11 条加密回归通过，共41条；另1条旧加密用例会写入封存的 phase36 evidence，故有意排除，其 enrollment→scope 行为由新的完整流程覆盖。103 个 TypeScript 模块 strict 检查通过。日志与 JSON 分别在 `evidence/phase37-tests.log`、`evidence/phase37-vitest.json`。测试监听、真实模型、用户 Session、真实配对、上传和设备执行均为零。

独立原生编译目标 `.build/native-pairing-flow-project` 使用 `local.dsh.mobile.pairingflowcheck`，没有 INTERNET 权限或 signingConfigs，原 app entry 未切换。它已实际编译 NativeExistingIdentitySigner、NativePairingPresenter、NativeRelaySocket 与合成确认页；PhonePairingOwner/完整 E2E 流程的当前执行证据来自 TypeScript/SDK 替身，不代表这些代码已在手机或 ArkWeb 执行。官方 API26 `CompileArkTS` 通过，报告为 `evidence/native-build/2026-10-13T10-50-42-370Z.json`；HAP 2,074,707 字节，SHA256 `9a2e0fa04fac4aa6eecba74b6661143dcba19c1f297d58bc0867ee679da84696`。SDK 提醒网络 API 需 INTERNET 权限、crypto/HUKS 系统能力并非所有设备具备；本次不申请权限或运行这些 API，也不沿用 phase36 成功记录。

## dhome 只读检查结果

用户追加批准仅限正常 SSH 凭据使用和相关系统/proxy/端口/部署元数据只读检查。3 次非交互 SSH 已完成，未请求密码或新 host trust，未使用 sudo、上传、读取凭据内容、部署、安装或修改系统。[结构化证据](../evidence/phase37-dhome-readonly.json) 是筛选工具输出的转录，脚本 hash 一并保留；初次沙箱拒绝 SSH 网络连接后，原命令通过窄 host escalation 执行。

Ubuntu24.04.4/x86_64、Node22.22.2 可用；`dsh` 不在当前 PATH，不能据此断言系统未安装 DSH。nginx1.24 正在运行，TCP80/443 监听 IPv4/IPv6；UDP443 与候选17846 没有可见 listener。现有 devinho.me/www.devinho.me 站点代理到 loopback8080/3000，另有 usage.devinho.me 站点。只读 selected server_name 字段未见 dsh.devinho.me，不构成全配置或 DNS 无冲突证明。只记录证书/私钥路径；stat 权限拒绝后未继续读取，证书 SAN/有效期仍未知。

候选独立目录 `/home/devin/dsh-harmony-relay` 不存在且未创建。下一次部署审批需要具体的 user-owned 目录、隔离 DSH_HOME/profile、runtime/package 精确版本与 hash、resource/log 限额、启动/停止方式，以及独立 nginx vhost diff。建议复用现有443，新增 `dsh.devinho.me` 的 SNI/WSS 路径到 loopback17846；保护现有两个站点和8080/3000服务。DNS/TLS覆盖及续期、nginx权限和 service start 都需对应审批，当前没有部署操作。phase36 relay tgz 可继续复用，其内容不因本次源码更新变化。

## 手机实装还差哪些信息与授权

unsigned HAP 不是可直接安装的交付。只需用户提供或确认实际手机型号、HarmonyOS/API 版本、愿意进行 USB 调试/设备信任与测试安装，以及采用自动调试签名还是已持有并在本地 IDE 配置的合法材料。不要发送手机号、账号密码、keystore/private key/password、证书文件或设备标识给 agent。候选测试 bundle 是 `local.dsh.mobile.pairingflowcheck`；签名、安装和卸载授权应明确该 bundle，不覆盖用户应用。

已安装官方 DevEco26.0.0.851 静态 UI 提供 `Signing`、`Automatically generate signature`、`Add Signing Config`、`Profile file(*.p7b)`；未登录时显示需先登录。用户可在本地 IDE 登录并选择自动调试签名，或通过 Add Signing Config 本地选择已有合法签名材料；当前未查看登录状态，未点击、生成证书或签名。[官方安装版 schema](../evidence/phase37-signing-schema.json) 要求 material 的 `storeFile/storePassword/keyAlias/keyPassword/signAlg/profile/certpath`，算法为 `SHA256withECDSA`，这些仅为字段名。密码和文件应由用户留在 IDE；不要写进本仓库或聊天。产品类型需匹配 HarmonyOS，不能用 OpenHarmony 示例签名冒充商业手机授权。

[华为官方签名指南](https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-signing) 的在线正文此前超时，因此当前明确依赖已安装官方 UI/schema，仅核实本地字段与入口，不声称已验证该用户的账号、设备/profile绑定或整个在线流程。需要真实 key 生命周期、HUKS public/signature 格式、native TLS、双端指纹人工比较与实际 ArkWeb isolation 证据后，才可批准 synthetic-only 首次真实配对；首次仍只读 Session，不运行模型。

## 冻结、回退与下一步

当前只是离线源码组合与 compile-only checkpoint；已安装 phase32 desktop bundle 未改，phase36 relay tgz、ZIP、HAP和旧 evidence 均保留。源代码 delta 包包含新增文件清单、旧文件原件与精确 hash，`rollback/` 仅恢复本次改动的原件，移除本次新增文件；不得删除旧代 Session、历史 artifacts、用户或其他任务更改。

下一步已收敛为对应批准后的实装：确定服务器隔离 runtime/profile与 nginx/TLS diff；用户本地完成手机签名/设备信任；逐项取得 HUKS/native TLS 与 ArkWeb 真机证据，再激活短期 room 和 synthetic read-only pairing。没有未批准的长期 key、访问凭据、监听或权限变更，也不会因用户未回复自动扩大范围。
