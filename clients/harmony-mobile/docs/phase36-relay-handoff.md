# Phase36：禁用 relay 与原生确认预览交付

本批仅在 `clients/harmony-mobile` 和 `D:\Temp` 开发、编译和打包。已安装 phase32 桌面插件保持未选中、row 禁用和 `enabled:false`；未安装或启用新包，未重启 DSH。服务器连接、部署、DNS、证书、手机签名/安装、真实配对、真实模型和用户会话读取均为零。

## 入口定位与工具

用户选择自有香港服务器，并授权子域名；模板使用 `dsh.devinho.me`。仅只读检查本机 `C:\Users\wpdev\.ssh\config` 的 `Host dhome`，得到 `HostName 8.210.203.110`、`User devin`；该条目未声明 Port。本批没有连接、解析 DNS、探测端口、访问控制台或读取私钥；现有服务/目录/TLS/443/loopback 17846 冲突尚未核查。别名只能定位目标，不能作为登录或部署授权。

复用官方 DevEco 26.0.0.851、SDK26.0.0.105/API26、Hvigor6.26.8；没有下载或安装。手机实际 API/型号尚未确认。NativeRelaySocket 的显式证书验证字段需要 API20+，未知版本拒绝激活；这不能证明设备支持，更不能假定 HarmonyOS7 已安装。新 HAP 权限仍为零，未签名、未安装或运行；保留 SDK 的 INTERNET/能力警告。

## 最小实现与验证层级

| 层 | 本批结果 | 尚不成立的验收 |
| --- | --- | --- |
| relay 包 | `ws8.21.3`、现有 WebServer exact upgrade、private `dsh` bundle，6个tgz条目逐字节核验 | 香港 runtime/安装/端口/TLS/负载与真实公网连接 |
| 路由/授权 | 独立一次性 room capabilities、scope 同身份绑定、到期/撤销/断线清理、发送与队列预算 | 真实 entropy/provisioning、公开入口限速和长期访问授权 |
| 共享 E2E | 原有 P256/HKDF/GCM async core，加 WSS/fake port owner、握手期限和双向清理 | 经审计的标准密码协议或生产安全认证 |
| 本地确认 | 完整双方 fingerprint、host/profile/device/Session/operations/TTL、签名 ticket 的实际期限，默认拒绝；public pin 在确认后激活 | 手机合成 UI 接真实 signer/ticket/grant，以及真实双方比对 |
| 自动化 | 51个内存/固定公有测试标量用例；4个实际 ETS 源码 SDK替身用例；98个 TS 模块 strict检查 | 原生网络/TLS、HUKS、背景/锁屏/真机和真实任务 |
| 原生编译 | API26 `CompileArkTS` 通过，独立 `local.dsh.mobile.pairingcheck` unsigned HAP | ArkWeb运行、设备安装、真实连接和安全保证 |

真实服务组合测试只通过源代码 Gateway/phase32 adapter 读取合成 metadata、receipt 和 follow；没有 task/model/upload。内存端到端用例验证两端互证、rich HTML/Unicode往返和 relay 捕获不含应用正文；不是桌面实际执行或手机验收。新命令和 reconnect 不自动派发/重试，执行回执仍归桌面 journal；该批不声明完整原生客户端或最终成功标准达成。

关键源码为 [relay](../relay-plugin/src/index.ts)、[WSS](../integration/wss-client.ts)、[加密连接](../integration/e2e-socket.ts)、[生命周期接线](../integration/device-relay-lifetime.ts) 与 [原生确认](../harmony/entry/src/main/ets/native/NativePairingConsent.ets)。新原生网络适配不由当前 app entry 构造，不向 rich guest 导出 signer、socket 或宿主桥。

独立只读审查发现并修复了关闭/撤销/外部记录更新期间的旧快照恢复、过期确认、关闭后 verifier 重建、不同 E2E 身份请求设备 proof、旧 room ticket 关闭后继 room、WS 尾随非法帧 error containment、拒绝 socket 遗留，以及原生 late connect/关闭结果遗漏。追加复核确认 verifier 的 revoke/sweep/close 已由 owner 调用。审查者未运行程序；见 [审查记录](../evidence/phase36-security-review.json)。内存负例覆盖竞态与生命周期；实际 ws Receiver 的非法尾随帧与公网入口限速尚未运行验证。

## 未执行的配置与批准清单

默认禁用 tgz 为 `D:\Temp\dsh-experimental-harmony-relay-0.0.0-phase36.1.tgz`；[artifact](../evidence/phase36-relay-artifact.json) 记录 hash/文件清单。依赖固定 ws8.21.3、WebServer0.2.1-alpha.2，Cordis/Schemastery/DSH peers 精确匹配本地已存在版本；没有 vendoring runtime 或 registry 安装。服务器是否已有兼容 runtime 尚未检查。专用最小 profile 只能经 `dsh --profile <经批准的新名字>` 启动；本批没有启动。profile [manifest](../deploy/phase36/profile.package.json) 的 bundles 为空，artifact 路径为占位；bundle 中 WebServer 和 relay 两行也均禁用，不能因启动模板而监听。

建议公网仅 `wss://dsh.devinho.me/harmony/relay/v1`、TCP443：手机和电脑均出站连接，不为电脑新增入站/LAN端口。现有受维护 TLS proxy + 被验证的证书链转发到服务器独立 loopback17846；[nginx模板](../deploy/phase36/relay.nginx.conf.template) 只是候选，不代表服务器使用 nginx。先检查已存在入口再决定复用或新增。TLS 验证、禁止 redirects、禁 compression、独立 E2E pin 均不可降级。证书来源/续期/路径待用户选定，不读取或生成 private key；DNS A记录/TLS签发/443/安全组/防火墙/服务变更均需批准。

公开 proxy 限制连接和升级请求；插件同时限制每连接 ping/pong，但没有经过公网负载测试。join token 仅在内存以 Authorization header 传输，room/role 在 header，不在 URL/cookie 中；relay 只存 SHA256 digest，不自动生成、持久化或分发 token。未配套被批准的 local provisioner，空 relay 将拒绝全部 join，因此该包可安装核验但不能直接形成可用配对服务。不得为绕过这一阻塞加入匿名/固定 token、TOFU 或远程 create-grant 路由。

以下内容应一次列成具体 diff/目标，由父任务集中获取批准后再逐步执行；本批没有发出许可请求或以等待代替批准。

1. 允许连接 `dhome` 做只读 public runtime、服务/443、DNS/TLS及目标目录 inventory；确认实际 SSH端口/连接方式，不访问或输出私钥/password/token。
2. 在核验后指定新 profile 名称、安装目录、准确 artifact hash 和依赖来源，仅安装并保持禁用；不覆盖或重启用户已安装 DSH。
3. 明确 DNS、TLS证书来源/续期、proxy/path/loopback端口、服务账户与文件 diff、security group/firewall、日志保留和资源限额；只部署列明变更，不扩大端口或长期授权。
4. 手机确认实际 API、测试 bundle、官方签名方案、账户登录/开发者模式/USB调试/设备信任、安装/卸载和 INTERNET权限；对应操作由用户确认，不自动签名生成证书。
5. 先完成 HUKS 公钥/签名编码、native TLS/connect/close及锁屏行为证据，再确认真实 signer/key 的生成/存储/删除策略和双方完整指纹。自定义 E2E仍需专门安全评估；源码审查不是密码协议认证。
6. 审核仅短期内存 room provisioning；批准新的 synthetic Session/工作目录、明确 operations 和 TTL，然后分别启用。首轮仅 `session.sync/task.receipt`；task.submit/cancel/rich写入/审批及持久访问另行确认。不能触及真实历史或调用模型。

## 官方签名候选与用户步骤

本机官方 IDE 静态 UI 确认存在 `Automatically generate signature`、`Add Signing Config` 和未登录无法自动生成的提示，来源及 hash 在 [signing source](../evidence/phase36-signing-source.json)。华为 [应用签名指南](https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-signing) 的在线正文此次超时；不把具体设备/账户流程当作已核实，更不以 OpenHarmony 示例证书冒充商业 HarmonyOS 手机签名。

最小候选 A 是用户在 DevEco 的当前独立测试项目 Signing 入口选择自动调试签名；账户登录、设备关联、证书/profile生成、设备信任和安装都由用户操作，真实条件以当前官方页面及 IDE 提示为准。候选 B 是用户已有合法调试签名材料，在 Add Signing Config 中本地配置，并核对 bundle/device/有效期；不要求用户发送文件、password或私钥。现在两种都未选定/执行，HAP 保持 unsigned；上架、付费、企业分发和长期证书管理均不在本批范围。

## 接口更新与回退

仅客户端实验源码接口更新：DeviceProofVerifier 增加确认和生命周期方法，enrollment 返回签名 ticket 期限；DeviceTransportBinding 要求已验证 remoteCredentialId；confirmation copy 接收全部身份/scope字段。所有本地消费者和 owner-local prompt fixture 同步更新。已发布 Session数据、事件、schema版本、两SDK和已安装 phase32包未变。按 upgrade-guide skill 的 internal pre-stable exemption，不创建发布升级指南。

源码 delta ZIP 和 unsigned HAP 的 hash 在 [最终封存](../evidence/phase36-final-seal.json)。源码回退使用 delta 的 `rollback/` 原样恢复变更前文件，再移除清单中的新增文件；不删除旧阶段生成物、已安装插件/profile、主仓用户改动或其他任务文件。若以后部署，仅停止新服务/撤销新 route 与短期 room/grant；native key/证书删除须另获批准。当前没有部署状态需要回退。
