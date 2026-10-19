# 2026-10-14 真机准备只读结果

本轮只核对公开工具、工程签名配置、现有 HDC 连接状态、已安装桌面包和候选产物。服务器、桌面配置、设备信任、签名、密钥、安装和 provider 均未修改；未启动 DSH，模型和上传调用为零。机器记录见 [只读证据](../evidence/field-readiness-20261014.json)。已完成的 phase40.2 部署证据仍由 [更新记录](relay-update40.2.md) 持有，本轮没有再次连接服务器。

## 实际状态

| 项目 | 观察结果 | 能说明的范围 |
| --- | --- | --- |
| 官方工具 | 已安装 DevEco Studio 26.0.0.851、SDK 26.0.0.105/API26、Hvigor 6.26.8、HDC 3.2.0f；路径 `D:/Program Files/HuaWei/DevEco Studio` | 可复用现有编译工具；未安装新工具 |
| 工程签名 | 当前客户端及六个生成工程共七个 app 配置的 `signingConfigs` 均为空；客户端范围未发现 `.cer/.p7b/.p12/.jks`；标准 `C:/Users/wpdev/.ohos/config` 不存在 | 当前工程没有可复用的签名配置；未检查华为账号登录状态或其他私人项目，不推断那些位置是否有材料 |
| 设备 | 查询的是已存在的 `127.0.0.1:8710` HDC daemon；一个 TCP Offline、五个 UART Ready，没有 Connected 目标 | 未验证 Mate90 Pro Max 的实际 API、HUKS、TLS 或 ArkWeb；不等于证明手机未插线；未启动/reset daemon 或接受 USB 信任 |
| 已安装桌面 | `C:/Users/wpdev/.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-experimental-harmony-mobile` 为 `0.0.0-phase32.1`，29/29 文件与原包哈希一致；bundle 未选择，patch `disabled:true`、`enabled:false` | 安装状态与禁用状态已核对，未激活或重启 |
| 安装版公共依赖 | runtime 为 DSH `0.2.1-alpha.2`、host protocol 4、Node 24.21.0；候选 20 个 peer 均有相同版本，rich-inline 来自 desktop profile | 仅公开元数据兼容，未导入插件或运行已安装桌面；不能据此宣称执行兼容 |
| 固定 replay | 安装版未包含 `@deepseek-ai/dsh-llm-replay`；LLM 构建文件包含 replay-only 标记 | 标记不是行为验收；源代码中已有测试组合，尚无独立 profile 的产品入口 |

候选桌面包是 `D:/Temp/dsh-experimental-harmony-mobile-0.0.0-offline-product.2.tgz`，SHA-256 `1f2c07eb361c9490c44d07d7f4fa649588927a77cb209c30d63bc0c0e944f35e`。它仍为默认禁用的库和 profile bundle；安装本身不会产生 signer、原始 grant 或配对 provider。可以在将来的单独批准中做禁用更新，但第一次现场 replay 不需要替换日常桌面包。

当前手机产物 `D:/Temp/dsh-harmony-mobile-20261013-offline-product-compile-only-unsigned.hap` 的 SHA-256 为 `a33b7b4ea89d09cdd3e438a45a77b57f0f4ff3ccd4858627701d1aa8cb6e717c`，bundle 为 `local.dsh.mobile.offlineproduct`。它通过 API26 编译但没有签名、权限列表为空、连接默认关闭。新签名或 INTERNET 变体必然产生新的产物和哈希，不能用这份旧哈希替代新包验收。

`.2` 的运行时 JS 已内联 zod 4.4.3，没有 bare zod import；两份公共 `.d.ts` 仍从 `zod` 导入类型，manifest 正确声明了精确依赖 4.4.3。候选 staging 的 `require.resolve` 当前回到主仓 zod 4.4.3，旧安装插件的普通 Node 解析得到 profile zod 4.6.5，asar 内另有 4.6.6。现有无 source paths 的 NodeNext smoke 仍位于主仓内部，因而不能排除向上解析的依赖泄漏。最小补验是仓库之外的离线 consumer：仅候选 tar、声明依赖及 built peer 文件，验证运行时和类型解析，不安装到日常 profile、不改变共享 zod。当前没有证据表明 runtime 缺 zod，但也不能声称 detached 安装验收已通过。

前轮“最小离线产品完成”指的是替身 SDK、真实源代码服务和固定 replay 的测试旅程，不是首次安装即可用的手机 APP。

## 需要先完成的软件

1. 将 `integration/source-composition.ts` 和 `integration/replay-host.ts` 的受控测试组合接入受支持的 `dsh` profile。现在没有注册好的 `harmony-mobile-replay` profile。必须在服务构建前检查 `DSH_SNAPSHOT=replay`、`DSH_SNAPSHOT_REPLAY_ONLY=1`、精确四个 response；只注册 `rich-inline-replay/rich-inline-fixed`，拒绝缺失 fixture、其他 provider、超预算请求和上传。公开 CLI 会在启动时读取 invoking-directory 和 DSH-home 的 `.env`，因此启动器必须在独立空目录运行并使用独立 home/agents root 和过滤后的继承环境；不能直接从主仓运行 `pnpm dsh` 并宣称没有加载根 `.env`。
2. 编写本地 composition plugin，创建独立合成 Session，接入实际 authorization/credentials/scope 和本地确认 answerer，并以同一个本地 authority 调用 `installDesktopPairingProvider`。其参数必须包含实际 `DeviceAuthorizationOwner`、Node WSS ports、原始 grant、桌面 signer 和受限 relay plan；仅在 JSON 中设置 enabled 无法提供这些依赖。现有 `.2` 导出 provider library，没有这个可执行的完整 composition。
3. 将原生可信 UI 的首次创建决定接入 `NativeDeviceKeys.create`，再接现有身份 exporter、公开指纹比较和 grant 确认。当前产品入口只消费已存在的 HUKS alias；没有首次创建调用。必须在真实 API/HUKS ECE 能力测量失败时停止，不选择软件密钥。私钥不进入 ArkWeb，不提供通用签名或宿主执行桥。

这些是代码接线工作，不能写成只缺用户凭据或批准。本轮没有修改上述代码；已收到后续本地修复范围，下一轮完成独立 profile 实物入口、首次 HUKS 创建的显式确认入口及 detached 依赖补验，只以替身、固定 replay 和官方编译验证，真实安装/签名/身份创建仍未授权。

## 最小现场 replay 配置提案

以下目录、profile、alias 和授权值均为待实现、待批准的具体提案，本轮未创建或启用。

| 部分 | 精确目标及限制 |
| --- | --- |
| 手机工程 | 源码 `clients/harmony-mobile/harmony`；隔离设备变体 `clients/harmony-mobile/.field/native-device-replay-project`；bundle `local.dsh.mobile.offlineproduct`；调试签名，仅这台手机。连接验收变体只申请 `ohos.permission.INTERNET`，不申请文件、联系人、定位、相机或通用宿主权限 |
| 手机身份 | alias `dsh-harmony-phone-replay-v1`；本地明确确认后创建 HUKS ECE ECC256/SHA256；只导出公钥和协议签名。先测实际 API，当前 owner 要求至少 API20；设备拒绝即停止。alias 删除需要单独明确操作，不因退出自动删除其他身份 |
| 桌面隔离 | process-scoped `DSH_HOME=D:/workspace/agents/deepseek-harness/clients/harmony-mobile/.field/dsh-home`、`DSH_AGENTS_HOME=D:/workspace/agents/deepseek-harness/clients/harmony-mobile/.field/agents-home`；profile `harmony-mobile-replay`，目录 `.field/dsh-home/profiles/harmony-mobile-replay`。使用公开 `dsh --profile harmony-mobile-replay` 入口，启动器需确保独立 invoking-directory 和环境；当前尚未有完成这些约束的实物入口，不得现在运行 |
| 读取与执行 | 合成 workspace `.field/harmony-mobile-replay/world`、合成 Session `harmony-mobile-field-replay-session`；不加载根 `.env`、用户 credential/home、私人 skill 或真实模型 provider；不注册 shell、browser、任意文件工具。任务由真实 SessionController/agent-loop/rich-inline 执行固定 replay，不派发用户真实任务 |
| 桌面身份 | 首轮采用经批准的内存 P256 signer；不读取现有私钥，不保存新私钥。测试进程结束即失去 signer，再开需要新的公开指纹比较与本地确认；不得静默复用或退回 operator/cookie |
| 原始 grant | 仅一个上述合成 Session、一个手机、30 分钟有效期；操作集合精确为 `task.submit/task.receipt/session.cancel/session.sync/rich.mount/rich.snapshot/rich.saveDraft/rich.invoke/rich.status/rich.dispose`。真实本地确认后提交公共 grant；冷启动再次确认，撤销或过期停止恢复；不给 approval response、general Gateway、shell 或任意会话权限 |
| relay | 使用已部署 `dsh.devinho.me`，不新增监听端口、域名、证书、隧道或防火墙规则。当前 broker 仍关闭，未有公共 pair/epoch 初始化；其启用属于之后的明确服务器批准 |

将来 broker 初始化的最小服务器写入提案为 `/home/devin/harmony-relay/public-state/replay-v1.jsonl` 及其 `.head/.lock`，只保存 pair 公钥、路由 epoch 和撤销记录；需要显式调用 `PublicTrustStore.initialize` 后才允许 broker。当前 unit 的 `ProtectHome=read-only` 需要一个精确到该目录的 `ReadWritePaths` 例外。这是安全设置及持久信任状态变更，本轮没有执行，也不包含在下面的首次手机批准中。测试结束应先明确撤销 pair 并保留 tombstone/receipt，不能通过删除历史作回退。

原始 grant 30 分钟到期会拒绝 DSH 访问；relay 的公共 pair 记录不因此自动删除。须分别验证原始 grant 到期、broker pair 撤销及进程资源释放，不能混为一个到期保证。

## 最小手机连接说明与后续签名操作

当前不提出真机启用批准：独立 profile 与首次 HUKS 创建入口仍缺代码。完成这些修复后，才能围绕具体新产物、单设备签名、包名、必要权限、公共指纹、原始 grant 和回退提出对应批准。真实签名、安装、身份创建和 broker 激活仍未授权。

最小用户动作是使用可传数据的 USB 线连接并解锁手机，按该设备实际开发者设置启用调试，在手机出现本电脑的调试授权弹窗时自行检查和确认。这里不假设 HarmonyOS7 的具体设置菜单，也不要求无线调试、root 或永久信任。连接后只读选择唯一 Connected 目标，若存在歧义先停；不自动接受弹窗。

DevEco 的官方流程支持“未关联注册应用”的自动签名：连接目标设备，在 `File > Project Structure > Project > Signing Configs` 中操作；未登录时由用户 Sign In。它会生成 `.p12/.csr/.cer/.p7b`，因此属于需要批准的真实签名和证书操作；首轮不注册新上架应用，不启用其他开放能力。签名后只记录 `.cer` 的公开指纹/有效期和 bundle/设备范围，不输出私钥、密码或完整设备标识。[华为官方自动签名说明](https://developer.huawei.com/consumer/cn/doc/doccenter-deveco-studio/ide-signing-auto)

单独的默认关闭包签名/安装只能取得实际安装、API、ArkUI 和离线页面证据，不足以称为可用手机客户端。完整配对/HUKS/联网/rich 回传仍需完成上述代码接线，并获得有确切 provider、公共指纹、合成 Session、30 分钟 grant 和服务器公共状态的激活批准。首轮仍为固定 replay，真实模型和上传次数必须为零；这里不对未来签名账户费用作未核实的承诺。

## 本轮验证与回退

执行了既有 HDC daemon 的脱敏只读查询、相关七个工程签名配置计数、标准签名目录存在检查、旧桌面包 29 文件哈希核对、asar/profile 公共 package 元数据检查，以及 `.2` 桌面 tgz、unsigned HAP、phase40.2 relay ZIP 的 SHA-256 复核。未运行行为测试、编译、DSH 或模型；此前测试不能充当本轮真机证据。

只新增本报告及公开准备证据，并在 acceptance/tasks 追加入口；原产物、历史证据、主仓脏文件、安装版和服务器保持原状。本轮回退只需移除这次新增准备记录及其追加入口，不涉及任何设备、服务或凭据回退。
