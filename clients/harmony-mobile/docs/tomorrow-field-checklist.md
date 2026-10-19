# 最小现场步骤与验收边界

2026-10-14 的轻量 relay TLS/空房间部署已实际完成，见[部署记录](relay-deployment-20261014.md)和[证据](../evidence/relay-deployment-20261014.json)。以下保留授权前的准备清单；身份、配对、桌面启用和手机现场步骤仍未执行。

## 授权前准备记录

本页仅准备下一次现场窗口。没有部署、安装、真实身份读取/创建或批准请求。已有离线源码和 HAP 封存不变；新增桌面包仅重打包现有实现及本地 provider，没有扩展功能。现场运行前分别确认下表的批准，缺一项就停在其对应步骤。

## 两个验收边界

“133 通过、1 排除”指共 134 项中 133 passed、1 skipped，不是把跳过项算入通过。跳过的是 `integration/phase35-crypto.spec.ts:101` 的 `actual verifier connects phase34 independent device scope over encrypted transcript and revocation aborts it without models`。它会无条件覆写已封存的 `evidence/phase36-crypto-scope.json`，所以新 runner 用名称匹配排除该写入者；没有因失败跳过，也没有排除任务、rich 或取消测试。旧用例只创建固定 P256 加密/授权上下文，不执行 SessionController 或模型任务。

新流程实际验证双方加密连接上的原始 grant 证明、精确 Peer/Session 范围和撤销。封存的 133 项计数当时没有重复旧用例特有的“加密 enrollment envelope 往返”断言；现在仅修改测试输出位置，以独立 runner 补跑该用例：1 passed，另外11项不在此次选择范围内。证据保存到独立 `.build/enrollment-regression-*/encrypted-enrollment-*/scope.json`；旧 Phase36/Phase40/产品证据与成果哈希均不变。见[补充单项回归](../evidence/enrollment-regression.json)。原完整套件的封存数字和名称过滤保留，补充结果单列；这仍不建立真实设备 enrollment 资格。

“合成桌面服务”指在隔离目录加载当前生产 SessionController、agent-loop、JSONL persistence、rich-inline、Gateway 和桌面插件源码；`prompt` spy 调用原方法，没有替换执行实现。替身是固定模型响应、拒绝外部 HTTP 的注册载体、内存凭据和手机 SDK。服务构造前硬性要求 replay 环境、唯一 provider/model 和四响应预算；真实 dispatch 被阻断，上传 prepare 会抛错，没有 fallback。

持久合成 Session 记录包含原任务一条、rich 回调一条、取消任务一条，三个 turn 的第三个以 `{kind:aborted, reason:{kind:user}}` 结束；`rich_inline_complete` tool/call 一次。测试故意发送两个同 action 的 invoke 包，返回同一 canonical receipt，只有一个语义 action/回调。完整运行已满足生产 SessionController 回归，因此补充仅运行 encryption/enrollment 单项，未重跑完整产品套件。详见 [边界与日志计数](../evidence/product-acceptance-boundaries.json) 和 [原用户流程](../evidence/product-user-flow.json)。

## 精确成果

| 用途 | 文件/版本 | 字节与 SHA-256 | 默认状态 |
| --- | --- | --- | --- |
| 独立 relay 部署包 | `D:/Temp/harmony-light-relay-0.0.0-phase40.1.zip`，版本 `0.0.0-phase40.1` | 102553；`a0d3c2cda36ff0efdbb2ec8a4af97b3421e4942b9531c910ec06f76e80e3f288` | disabled JSON 不创建 listener；example 仅 loopback，broker 未启用且无允许 pair |
| 当前桌面候选包 | `D:/Temp/dsh-experimental-harmony-mobile-0.0.0-offline-product.2.tgz`，`@deepseek-ai/dsh-experimental-harmony-mobile@0.0.0-offline-product.2` | 314130；`1f2c07eb361c9490c44d07d7f4fa649588927a77cb209c30d63bc0c0e944f35e` | 插件 row disabled、enabled/relayEnabled 默认 false；安装与启用分开 |
| 已安装旧桌面包 | `D:/Temp/dsh-experimental-harmony-mobile-0.0.0-phase32.1.tgz` | 118646；`33550473f3a46a0b541b7d7867691916c6f9ccfae288924ef36278feac2dae82` | 上次公开检查为未选中/禁用；未改动，不能代替新包 |
| 手机编译成果 | `D:/Temp/dsh-harmony-mobile-20261013-offline-product-compile-only-unsigned.hap`，bundle `local.dsh.mobile.offlineproduct`，versionName `0.0.0` / versionCode `1` | 5193817；`a33b7b4ea89d09cdd3e438a45a77b57f0f4ff3ccd4858627701d1aa8cb6e717c` | API26、未签名、权限空、host/alias 空、API 未确认、enabled false；不能直接用于联网现场 |
| 对应源码/回退 | `D:/Temp/dsh-harmony-client-20261013-offline-product-delta.zip` | 647191；`f3ab13929660da8076f2b6ff477609e3d9ed7192f3339c30cdc671ffe7d4115e` | 87 个精确 entries，相对 Phase40 增量并含前像 |

新桌面候选包共 47 个逐 entry 核对的文件；built ESM、provider 默认无 IO、缺本地 owner 的启用拒绝、无 source paths 的 NodeNext consumer 通过，未安装。它新增导出已实现的 `paired-provider`/`relay-lifecycle`，并声明所需 scope/credentials/authorization peers 与 zod 类型依赖；精确清单在 [artifact](../evidence/product-desktop-artifact-v2.json) 和 [built smoke](../evidence/product-desktop-smoke.json)。本地 `.1` 是 peer 声明未齐的打包草稿，不是本清单候选；保留原字节，不使用或覆盖。

## 批准分别覆盖什么

| 批准项 | 明确目标和变化 |
| --- | --- |
| DNS | 确认域名/zone/目标 IP 和操作权限。包内 `dsh.devinho.me` 只是提案；不据此推断控制权。所有 host/audience/pin 使用同一获批值 |
| 服务和网络 | 确认目标服务器、`/home/devin/harmony-relay`、专用 public state、service 文件、loopback 17846、nginx additions/reload 和外部 443；保留现有服务及站点。提案未应用 |
| TLS | 单独批准新证书/CA challenge、账户和私钥保存位置或明确指定已有证书使用；不得读取/复制未获批旧私钥，不跳过证书验证 |
| 身份/授权 | 分别批准桌面选定 signer、手机 HUKS alias 的使用/首次建立、双方指纹核对、relay public pin/epoch/expiry 初始化以及原桌面 Session/operation scoped grant；不创建长期共享 bearer |
| 桌面更新/启动 | 单独批准新包安装且保持 disabled；核对精确 peers/已安装 runtime，再批准专用安全 profile/provider 的启用或所需重启。不能直接重启/覆盖用户正在运行的 DSH |
| 手机签名/安装 | 单独批准 Huawei/DevEco 签名账户、证书及安装，确认手机实际 API/HUKS 支持和必要 INTERNET 权限。联网配置/权限/签名改变 HAP 字节，须另编译并记录新 hash，不能沿用上表 hash 声称联网成果 |

## 最小现场顺序

1. 在各项批准之前，只可核对本地 artifact hash、默认配置和源码；下一现场窗口只读取相关公共版本/工具/能力，不枚举用户文件、会话、账户或凭据。Mate90 Pro Max/HarmonyOS7 不等于已测得 API26 或 HUKS ECE 支持。
2. 先准备独立、强制四响应 replay 的受支持 `dsh` profile 和隔离合成 Session。构造前打开真实 dispatch 硬阻断，禁上传、禁真实 provider/凭据和额外工具；检查唯一 fixture route 和四响应预算。不能仅更换默认模型名或依赖“固定测试提示词”。目前只在源码隔离运行中验证了此保护，真实安装 profile 的等价启动尚未验收；缺少这个可审核 profile 就停止，不能试发任务到用户常用 profile。
3. 获桌面更新批准后，核对当前安装的公开 peer/runtime metadata，安装新 `.2` 包时保持 disabled/unselected。准备原 grant owner、现有 signer 和精确本地 authority 的 same-process provider composition；当前包提供库接口，安装它不会生成该装配或配对。缺少选定 signer/原 owner 的可审核装配就停止；JSON id 或 `enabled:true` 不能替代。
4. 获身份批准后在两端核对完整公钥指纹、audience、Session/operation 范围和 expiry；通过本地 owner 初始化 public state，保留 tombstone/锁和独立可信回滚记录。没有 HTTP/CLI 自助 enrollment/revoke，不能手写 journal/head 绕过初始化。冷启动原 grant 必须重新本地确认。
5. 获服务/DNS/TLS批准后，上传并核对 relay ZIP，单独目录解包；先用 `config.disabled.json` 验证无 listener，再配置获批 host 与已初始化 `publicTrust`，启用 broker。Node 需 ^22.19 或 >=24。仅 loopback 17846、两个确切 WS path/subprotocol；检查 `nginx -t` 后才应用专用 additions，其他请求应 404。提案 service 的只读路径策略未对实际 public journal 写入资格化，须确认最窄的获批写目录；不得删除旧锁、修复坏记录或从旧允许副本恢复。
6. 获手机批准后测量实际 API/HUKS 和必要 ArkWeb 能力，生成独立联网且签名的测试 HAP，记录 hash/权限/config 差异后安装。连接仍由原生按钮和显式配对决定触发，后台关闭，前台不自动拨号。核对 TLS 验证开启；guest 不可访问身份、task、任意 URL 或宿主执行桥。
7. 仅对第2步的合成 Session 发一个固定任务，记录原 task id、Session id、replay 消耗、实时文本和 rich mount。提交一个固定表单，回传原 Session，并重复同 action id 核对 canonical receipt；故意断开控制连接后，核对新房间/新 proof、cursor 恢复和原 task 只执行一次。发第四响应的固定挂起任务，显式取消；检查 user-aborted 和四响应完全消耗、真实模型/上传为零。分别验证本地 tombstone 重开拒绝、桌面原 grant 撤销和退出资源关闭。
8. 保存手机实际 ArkUI/ArkWeb/HUKS/TLS/前后台及桌面持久日志证据。失败/未知结果立即停止依赖步骤，保留 Session/receipt/public revocation 文件，不自动重发、放宽验证或重建身份。撤回只停新服务/provider、恢复获批 nginx additions 与新客户端变更；原授权、证书/DNS删除和身份撤销各自另行处理。

现场才可确认 Linux 文件/目录同步、断电耐久、TLS/代理和手机 API/布局/IME/ArkWeb 端口隔离。以上步骤未执行，现有合成与 Chrome 结果不代表真机等价。今晚不请求批准，不启用包、服务器或手机。
