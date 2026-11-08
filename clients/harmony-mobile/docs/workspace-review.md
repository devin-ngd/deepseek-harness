# 标准插件工作区交付前审查

本页记录标准插件工作区的实现、隔离验收和日常部署。当前候选与最近一次真机结果按功能列在[当前日常部署与真机边界](#当前日常部署与真机边界)。

## 实现与包

原生聊天保留，类型、主模型与思考强度从桌面目录取得，新建任务使用会话级版本比较选模。插件设置与完整工作区复用标准 Web 客户端、Client Modules 和 Gateway。桌面加载同一个标准 npm 包后提供其客户端，不要求第三方提供 Harmony 包。

受信工作区共享标准插件的前端环境；它使用可撤销的设备 Peer，并经原有加密连接访问桌面。模型生成的富交互页面由另一份原生 Web 所有者展示，只有原 scoped guest SDK。DevFlow 候选增加标准 Remote 授权，Rich 候选增加可选视图承载；原包仍可用于桌面，Rich Host 产物保持原字节。

[三包基线审阅物](../handoff/standard-plugin-workspace/review-qLSwu7/manifest.json)记录 Harmony `0.0.0-rc2.35`、Rich `0.2.1-rc.2.harmony.1`、DevFlow `0.3.0-alpha.3` 三个 npm 格式 `.tgz`、未签名产品 HAP 与文件摘要，不再包含 Connection 候选：手机端的 `navigator.onLine` 误报改由 Harmony 工作区壳层处理，Connection 使用 DSH 核心包原样。早先的[四包验收基线](../handoff/standard-plugin-workspace/review-ZMiIAK/manifest.json)（Harmony rc2.33、Rich、DevFlow、Connection）和[Harmony rc2.34 命令修复候选](../handoff/standard-plugin-workspace/desktop-command-DN6ORk/manifest.json)作为历史证据保留，未被覆盖；引用它们的 `qualify-workspace-device-command.mjs` 与 `qualify-workspace-installed-device-command.mjs` 仍断言 rc2.34 候选，不应在当前审阅物之后重跑。归档内 `workspace:` 依赖按本地真实版本展开，解包逐文件核对；桌面包带标准 Web 壳层，工作区配置示例需要填入最终安装目录。私人候选未发布，日常安装已按授权替换，后续修复归档与安装证据见[当前日常部署与真机边界](#当前日常部署与真机边界)。独立模拟器使用另一个仅测试 HAP。[实现及行为证据](workspace-prototype.md) · [测量范围](workspace-measurement.md)

[原审阅物验证](../handoff/standard-plugin-workspace/review-R7Lrf7/validation.json)保留先前六组离线结果：原生所有权、分块与流、加密重连、归档 Rich 动作、归档 DevFlow 工作流及缓存测量。它描述原版本，不包含 Connection 可用状态、Web 销毁与页面切换修复，不能替代当前模拟器验收。

## 审查范围与结论

检查从 `/harmony-device` 的标准命令入口进入独立工作区授权、设备传输、Gateway、Client Modules、原生页面及 Rich guest，沿请求、订阅、取消、清理和晚到回调检查所有权。Cordis 专项只覆盖入口可达的插件和 helper；原生 Web 单独按 SDK 与其所有者检查。实际 ArkWeb 的 Rich 动作、草稿与返回已有通过记录，当前封存包的 DevFlow 配置与委派也已验收。

| 检查点 | 当前结果与限制 |
| --- | --- |
| 授权对象 | 独立本地确认绑定原设备、票据、连接与期限，最长 30 分钟；伪造 Peer 不继承授权。原生有限连接不自动获得工作区权限。 |
| 授权范围 | 工作区可访问该 desktop profile 的全局标准方法、可见 Session/项目及新增标准插件。它不是单会话裁剪器；确认文本明确包括全局设置和路径。owner 专用 Fetch、审批和 waterfall 继续受标准 Gateway 限制。 |
| 副作用与回执 | 创建、设置保存和 rich 动作使用原操作；丢失写入响应保持结果未知。Rich 接受回执与完成状态分开，状态查询不创建第二个动作。 |
| 流与容量 | 二进制、流和双向上行使用有界分块，Host 在读取前预留响应容量；排队取消及 graph/rebuilt 订阅有清理证据。原生目录与工作区分别保留容量。 |
| Web 所有权 | 关闭先撤销端口，以 `FAST_MODE` 移除所属 Web 并等待控制器 `UNATTACHED`，再释放 Host 工作区；不以异常退出回调代替卸载确认，不终止共享进程。重试建立新控件，正常卸载不撤销后继启动，旧回调失效；后台停止使未完成启动失效。token 与多进程模式不构成每个 Web 独占一个 OS 进程的保证。 |
| 缓存 | 每次打开先取得新鲜授权与 SHA-256 清单，只复用同一桌面仍确认的资源；不缓存 HTML/API，容量按响应 JSON 计算，不写持久存储。 |
| 标准包覆盖 | 手机复用桌面的标准 Web 客户端、Client Modules 和设备 Peer 可访问的 Gateway 接口。官方翻译原包、Rich 与 DevFlow 的实际运行证据见[当前覆盖](#当前日常部署与真机边界)。Electron 专用界面、仅 owner 的接口和桌面 webServer 前缀路由仍受各自限制。 |

标准工作区包含 `navigator.onLine` 壳层处理和不可用路由的结构化错误。软键盘真机复验、长期内存和最新候选的公网恢复仍待验证。较早的四包记录使用过 Connection 候选，仅作历史。局部文档检查的范围与完整 `doc-sync` 的工具链限制见[实现说明](workspace-prototype.md)。

## 批准的隔离范围

只读核对实际桌面安装版本、包入口与可用模拟器，不读取账号或凭据内容。安装运行时副本使用独立测试 profile；模拟器分别接源码合成 Host 与安装运行时副本，固定四响应回放和本地 loopback。两种环境分别记录结果，不把源码 Host 的运行外推为安装版全部插件已通过。模拟器采用独立应用数据，验证原生任务选项、标准插件设置、Rich 输入与动作、返回、重开、键盘和后台清理。日常 profile、已有配对与真机数据不参与此阶段。

用户已明确批准“安装环境核对与隔离模拟器验收”，并手动启动 Mate 90 Pro Max。应用 ID 为 `local.dsh.mobile.workspacecheck`，只更新该合成测试应用；原 `local.dsh.mobile.offlineproduct`、日常 profile、原配对和真机不参与。[手机项目规则](../AGENTS.md)对真实设备、公网、真实模型和日常安装的限制继续有效。

## 隔离环境结果

### 标准设备命令与工作区依赖

工作区启用时，设备命令及其本地所有者均显式依赖 `clientModules`；仅原生连接不需要该服务。真实 Cordis 同级服务提供方复现了缺少注入时的 `cannot get property "clientModules" without inject`，修复后通过标准 `/harmony-device` 命令完成拒绝授权、允许授权、非 owner 清单读取和撤销现有工作区，绑定记录保持不变。[命令验证归档](../evidence/workspace-device-command-validation.json)包括源代码前后对照、实际持久化 Session 命令快照，以及新旧构建入口的依赖卸载对照；祖先节点提供服务的早期通过记录单独标明，不能作为同级依赖覆盖。

rc2.34 私人 npm 候选 SHA-256 为 `1895031e81ea79ba8872d36241edccc4cf33b72d4d29c037493b0c18f613c2de`。源码行为测试使用内存凭据和公开测试密钥保护器，模型调用为 0；构建入口检查覆盖命令注册与依赖卸载，不读取身份或打开连接。绑定执行、DPAPI、HUKS 与 WSS 仍是独立验收项。

[安装运行时入口验证](../evidence/workspace-installed-device-command-validation.json)进一步使用实际运行时副本的 Cordis 4.0.5 与真实服务，在私人 profile 内加载同一 rc2.34 归档。Client Modules 由可撤销的同级提供方供给；命令注册、依赖移除后的卸载、依赖恢复后的重新注册，以及无 Web 依赖的原生命令注册均通过。原封存 rc2.33 包在相同检查中出现预期的卸载失败。两份持久化合成 Session 均无命令执行、模型轮次或模型请求头；四响应预算消耗为 0，两组 CLI 进程均已取得终态。

新旧 Harmony 归档均为 309 个文件，7 个变更限于设备命令、对应源码、构建元数据、版本及说明；标准 Web 壳与客户端资源逐文件保持原字节。手机页面沿用此前各项证据的载体及授权范围；本轮没有执行生产设备命令、日常激活或新的模拟器操作。240 个 lab／integration 模块严格类型检查通过，封存器也已验证拒绝源码指纹过期的旧通过记录。

### 原生新建与选模执行

[双端选模执行结果](../evidence/creation-cipher-work-validation.json)使用实际 `Index.ets`、原生设备加密 facade 和安装运行时副本：从桌面真实预设目录选择 `minimal`，从离线提供方目录选择 `worker-model/high`，创建一个新会话。创建和打开不派发模型；新会话无错误加载后，由原生聊天输入框发送四条固定消息，逐条显示回复并结束生成。四次实际模型请求均属于该会话，provider／model／reasoningEffort 与选择一致；会话头部、选模事件、四个完成轮次和持久化请求配置同时核对，桌面默认模型配置未变，真实模型调用为 0。

rc2.43 在同一隔离安装运行时通过此原生整轮。测试 HAP 内的 `ProductCore.js` 与正常 rc2.43 候选逐字节一致，原位安装保留测试应用 UID。Host 核对四次固定回放使用新会话选择的 `worker-model/high`，工作区授权关闭，真实模型调用为零。[当前选模验收](../evidence/creation-cipher-work-current-validation.json)

工作区往返专项在原生新建同样的会话后打开真实标准 Web。rc2.43 已在 Web 显示同一会话的回复，返回时原生回复和草稿仍在，但原生 Rich 恢复会在控制器尚未挂载时尝试加载文档，触发通用错误提示。定向 SDK 替身用例复现了未挂载时的加载。rc2.44 根据实际挂载状态恢复，新的 Web 由挂载回调启动。25 项工作区和原生 Rich 检查通过。[rc2.43 往返失败](../evidence/workspace-installed-native-cipher-creation-workspace-1793863458758-probe-eRLgFN.json)

rc2.44 隔离整轮通过六项检查，包括从原生会话进入标准 Web 查看第四条回复，返回后恢复原生回复和未提交草稿，且无错误提示。Host 核对四次 `worker-model/high` 回放及持久化配置，真实模型调用为零。与 rc2.43 相比，84 个产品构建输入仅有版本号和 `NativeProductRichOwner.ets` 两项变化。测试包与正常未签名产品包的四个关键输入逐字节一致，模拟器应用停止、临时转发移除。真机 HUKS、生产 WSS 及真机工作区待验。[整轮及产品候选](../evidence/creation-cipher-workspace-current-validation.json)

这一轮没有授予全局标准工作区权限。168 份封存文件关联四个标准包、50 份实际原生布局、会话文件和未签名测试 HAP `931649a92dcb92518877f30c582d3e98410ed9315c6246e7757a483bbb1db9fd`；测试副本仅替换页面的 product 提供方，生产页面保持原字节。身份为公开固定软件密钥，帧载体为 HTTP loopback；未覆盖原 HUKS、WSS／TLS、真机或日常激活。[先前零调用用例](../evidence/creation-cipher-validation.json)只证明创建和选项持久化，会话读取与发送由本轮结果补足。

[五轮诊断记录](../handoff/standard-plugin-workspace/review-ZMiIAK/native-creation-work-83hit7/diagnostics/manifest.json)保留未通过的双端终态、对应 UI 驱动及实际加载的测试代码：Back 返回列表、测试 profile 未挂载桌面执行服务、载体漏声明 `harmonyDesktop` 依赖，以及将复用的 `request/header` 误计为每轮一条的断言。正式设备命令的装配方式用于独立 profile，临时异常记录钩子已移除；最终核对四次实际请求和持久化配置，不把配置记录数当作调用次数。两端成功轮均以 0 退出，映射已清空，独立应用已停止，用户启动的模拟器保留运行。

### 未改动的官方标准插件

[官方原包对照](../evidence/workspace-official-validation.json)在同一原生加密测试应用中通过：安装版随附的 `@deepseek-ai/dsh-experimental-cot-translation-bundle`、客户端与 translator 均为 `0.2.1-rc.2`，三包 33 个自身文件在运行前后字节一致。工作区实际选中运行时副本中的标准 `lib/client.js`，本轮未为这些包添加手机入口或修改组件；依赖目录边不包含在这 33 个文件内，也未独立核对 npm 发行归档。

手机通过标准插件目录保存 Google／`ja`，展开执行过程、分析和思考后显示固定译文，完成原文／译文切换，重开设置仍读到 `ja`；Host 同时核对接受的配置。本地翻译端点恰好收到一次固定合成原文，未访问公网翻译服务。同一运行还通过 Rich 动作、精确草稿、重开及后台恢复，模型回放四次、真实模型调用 0。183 份封存文件包含标准包、实际原生布局、双端结果和测试源码；HAP 复用已核验的原生加密测试版本。[持久化补充](../evidence/workspace-official-closeout.json)另保存独立 profile 的 Google／`ja` 配置、会话内可忽略的 translator 请求／结果，以及持有最终 Rich 草稿的存储文件。

此前五轮停在目录折叠、字段可访问名称和执行过程展开层级，[失败记录](../handoff/standard-plugin-workspace/review-ZMiIAK/official-plugin-DxKoll/diagnostics/manifest.json)保留各轮终态、最后布局和对应驱动指纹，未计入通过。标准原包对照证明了该插件的设置和会话内容组件可以经通用工作区运行；第三方发布物、owner 专用操作、完整键盘、内存与生产连接仍在剩余验收范围中。两端本轮进程均以 0 退出，翻译端点已关闭、映射清空、独立应用停止；日常 profile、原配对和真机保持不动。

### 标准 CLI 安装与第三方发布物

此前的安装版组合把封存包放入运行时副本。本轮改为在私人 home 的 `web` profile 中运行 `dsh plugin add`（离线、`--ignore-scripts`、本地 registry 镜像，镜像的传递依赖来自运行时副本和 pnpm store），一次安装四个封存归档。[四包安装](../evidence/workspace-plugin-install-1793755914955.json)通过，镜像请求中只有 `/not-a-package`（故意的未知包拒绝检查）和 `/pnpm` 两个 404，没有安装错误；[启动探针](../evidence/workspace-standard-profile-1793756015216.json)用 `dsh --profile web` 启动该 profile，核对四个客户端路径、SDK 对等包文件哈希，并取回三批 Client Modules 共 11,581,997 字节，均为 200，模型调用 0。

四份失败的安装记录保留：只装一个包的两份（[`1793749520319`](../evidence/workspace-plugin-install-1793749520319.json) 只记录泛化的加包失败，[`1793749880146`](../evidence/workspace-plugin-install-1793749880146.json) 为 `@deepseek-ai/cordis` 的 404），四包阶段的两份（[`1793751467724`](../evidence/workspace-plugin-install-1793751467724.json) 为 `@types/unist` 的 404，[`1793751635767`](../evidence/workspace-plugin-install-1793751635767.json) 为 `ERR_PNPM_NO_MATCHING_VERSION`，`escape-string-regexp` 4.0.0 与 5.0.0 同时被需要）。原因是旧镜像未提供部分传递依赖，且对每个包名只提供 `require.resolve` 命中的一个版本。镜像现在枚举 `.pnpm` 中的全部版本，并能对运行时副本中版本不同的包（如 `fflate` 0.8.3，运行时为 0.8.2）按精确版本补供。较早的[探针超时记录](../evidence/workspace-standard-profile-1793750802981.json)出现在只安装一个包的阶段，未单独做根因分析，之后同一探针在四包和五包环境通过，按未通过保留。这个镜像没有单独的回归测试，由安装检查端到端覆盖。复现命令：`node scripts/check-workspace-plugin-install.mjs --all`（现为当前审阅物的三包；该记录当时为四包）或 `--third-party`（另加第三方），再运行 `node scripts/probe-workspace-standard-profile.mjs evidence/<安装记录>.json`。

上述四包／五包记录使用过 Connection 候选。它没有 `dsh.bundle`，CLI 只把它作为普通依赖安装，Host 侧的 Connection 仍是运行时副本里的 DSH 核心包，只有客户端被替换，且与核心包版本相同、字节不同。该候选已作废：`navigator.onLine` 的处理改在 Harmony 工作区壳层完成（见后文），当前封存和安装检查不再含 Connection 包，`qualify-workspace-emulator.mjs`、`qualify-workspace-installed*.mjs` 等脚本改为断言清单中没有它，且运行中 `connectionPackageOverridden` 为 false。

三包基线审阅物 `review-qLSwu7` 的隔离重跑如下。[三包加第三方的标准 CLI 安装](../evidence/workspace-plugin-install-1793764620839.json)通过：Harmony rc2.35（SHA-256 `bee850ba197a8cc5eec4396fbf355b4635b21fd07ad22c45264b04e16b90f2cd`）、Rich `0.2.1-rc.2.harmony.1`、DevFlow `0.3.0-alpha.3` 与 skills-manager 1.2.11 全部由同一条 `dsh plugin add` 装入私人 `web` profile；skills-manager 49 个文件改动 0 个，镜像错误 0。[启动探针](../evidence/workspace-standard-profile-1793764679089.json)通过：三个标准客户端路径位于 profile 内，三批 Client Modules 共 11,795,689 字节，外联拒绝 0，模型调用 0。同一时段的[先行一次安装](../evidence/workspace-plugin-install-1793764523051.json)虽然标记通过，但安装脚本当时仍从旧指针读取 Harmony，实际装入 rc2.34；脚本已改为从当前审阅物读取全部归档，该记录不计作 rc2.35 的验证。探针脚本的归档数量断言同步改为三个（带第三方为四个）。该轮记录时的版本关系：Harmony 候选 `0.0.0-rc2.35`（日常 rc2.33）、DevFlow `0.3.0-alpha.3`（日常 alpha.2）、Rich `0.2.1-rc.2.harmony.1`（日常 `0.2.1-rc.2`）当时都不同，Harmony 的 Rich peer 范围为 `>=0.2.1-rc.2 <0.2.1-rc.3`；日常安装已完成替换，Rich 与 DevFlow 的源码候选已合回原仓库并在本地提交，见[合回原仓库与真机检查](#合回原仓库与真机检查)。

第三方固定发布物选用 `@michengai/dsh-skills-manager` 1.2.11（Apache-2.0，peer 范围含 `0.2.1-rc.2`，唯一依赖 `fflate` 0.8.3）。包文件来自日常 profile 已安装目录的只读复制（49 个文件），重新打包为 SHA-256 `346bc89e7ead4a62a582ee9742cd0c1c7f784f608bcc57fff56c52c4791ffe02` 的归档，再经同一标准 CLI 作为第五个包安装。日常 profile 的 lockfile 中该版本的 registry integrity 只作记录，复制的是已解包目录，没有用它重算归档哈希；安装后 49 个文件逐个核对，改动 0 个。[五包安装](../evidence/workspace-plugin-install-1793756563596.json)和[启动探针](../evidence/workspace-standard-profile-1793757389051.json)通过：入口 `skills-manager` 为 ACTIVE，客户端路径指向 profile 内 `lib/client.js`，三批 Client Modules 共 11,795,808 字节，模型调用 0。日常 profile 只读，没有被修改。

审查该包发现，它的客户端挂载时会请求 `/api/michengai/dsh-skills-manager/update`，宿主处理器随后访问 `registry.npmjs.org`；POST 更新会启动 `dsh plugin add`，目录发现还会访问 skills.sh 与 ClawHub 并读取各 agent 主目录。因此探针进程带有[外联拦截预加载](../integration/workspace-outbound-guard.mjs)：拒绝并记录所有非回环 `fetch` 与 socket。本地对照确认它会拒绝并记录这两类连接，该对照没有封存。探针启动期间拒绝记录为 0，因为没有浏览器挂载客户端，更新检查未触发；这只证明启动与加载阶段无外联，不覆盖界面运行。

同一探针还核对该包后端的可达性。`/api/dsh-skills-manager/*` 由 `ctx.webServer.register` 注册为 Node 前缀路由；工作区载体把 `/api/` 请求交给 `createSharedFetchHandler('/api')`，它只服务 Connection 注册的精确 Fetch 路由（仅限 owner）和 Typert RPC。探针用设备 Peer 请求 `/api/dsh-skills-manager/sidebar-entry`，得到 404；同一路径在本机 loopback 使用浏览器 owner cookie，返回 200 和 `{"ok":true,"data":{"enabled":false}}`。结论：该包的客户端可由工作区加载并注册设置分区，但它自己的 REST 后端不能经现有手机载体使用，其手机界面功能预计不完整。这个结论来自后端请求，没有在手机界面实测，因此第三方手机界面验收仍未完成。DevFlow、Rich 与官方翻译走 Typert／Gateway，不受此限制。

从 npm 获取的 `@samecorner/dsh-client-ui-token-usage` 0.1.3 和 `dsh-tab-complete` 0.1.1 原包均通过发布 SHA-512 校验，各核对六个文件。token-usage 的 `conversation.view` 入口依赖 `conversationEvents` 和 `conversationViews` 两个旧服务。`0.2.1-rc.2` 安装版的对应注册点位于 `uiConversation`，token-usage 停在静态检查。tab-complete 原包已通过隔离标准 CLI 安装，六个文件一致，Host 入口激活，客户端进入模块图且所在批次返回 200。它的按键处理仅接受 `textarea`，安装版标准输入框渲染的是 `contenteditable` div，原包无法接管该输入框的 Tab。该包的浏览器交互未执行。[固定发布物核对](../evidence/workspace-thirdparty-release-admission-20261107.json) · [Tab 原包安装](../evidence/workspace-plugin-install-1793999805181.json) · [模块图](../evidence/workspace-standard-profile-1793999843362.json)

`dsh-chat-index-rail` 0.1.1 的 npm 原包在隔离标准 CLI 安装后，六个文件逐字节一致，Host 入口激活，标准 Web 模块批次返回 200。Chromium 使用同一安装版 `0.2.1-rc.2`，通过合成会话行的点击处理打开会话。插件读取 `useSession` 旧快照中的 `chat.nodes`，在 `conversation.session.header.utilities` 插槽触发错误。标准页面隔离了该插槽的错误，合成问题仍可见，索引按钮为零。浏览器启用 Chromium 沙箱，页面 HTTP 和 WebSocket 限于当前回环 Host，实际使用一条固定回放，真实模型调用为零。前两轮分别停在测试回放计数错误和临时弹层拦截点击。此包在桌面已复现接口不兼容，未进入鸿蒙验收。[固定发布物](../evidence/workspace-thirdparty-chat-index-rail-release-20261107.json) · [标准安装](../evidence/workspace-plugin-install-1794000029202.json) · [会话渲染对照](../evidence/workspace-standard-profile-1794000616515.json)

`dsh-theme-brick` 0.2.1 的 npm 原包经发布 SHA-512 和隔离标准 CLI 验证，安装后七个文件逐字节一致。标准桌面 Web 的通用设置显示 Brick 开关，启用时浅色背景变量为 `#FAF8F3`，关闭后为 `#FFF`。刷新保留关闭状态，重新开启恢复原色。Chromium 启用了沙箱，页面 HTTP 和 WebSocket 限于本轮回环 Host，无外联尝试或模型调用。验收通过实际按钮继续临时 profile 的预览说明，颜色从主题实际写入的 `body` 读取。[原包核对](../evidence/workspace-thirdparty-theme-brick-release-20261107.json) · [标准安装](../evidence/workspace-plugin-install-1794000962401.json) · [桌面 Web 验收](../evidence/workspace-standard-profile-1794001658573.json)

通过标准插件管理器停用 Brick 时，桌面 Chromium 和鸿蒙 ArkWeb 都在同一 Web 文档移除设置开关，重新启用后恢复。停用期间两端背景变量仍为 `#FAF8F3`。Brick 从普通 `function apply` 返回主题清理函数。安装版 Cordis 的最小对照执行普通函数通过 `ctx.effect` 登记的清理及箭头函数返回的清理，普通函数返回的清理未执行。插件的主题副作用应随 `ctx.effect` 注册，工作区复用原包。[桌面启停对照](../evidence/workspace-standard-profile-1794004063547.json) · [ArkWeb 启停对照](../evidence/workspace-native-wss-close-cancellation-standalone-brick-graph-compare-validation.json) · [Cordis 清理对照](../evidence/workspace-brick-cordis-apply-cleanup-20261107.json)

标准 Web 的冷启动要求客户端条目全部激活。独立模拟器的启动失败对照验证了原生聊天回退，以及桌面停用故障包后重新进入标准 Web 和 DevFlow。该场景使用合成故障插件和回环中继。[启动恢复验收](acceptance.md)

`skills-manager` 的 webServer 路由可以安装、更新和删除技能并启动 `dsh plugin add`。向设备 Peer 原样转发这类路由会暴露 owner 级操作。设备访问需要按插件显式授权并展示权限。`@michengai/dsh-archive-manager` 1.1.7 的日常安装文件已通过标准 CLI 隔离安装和 Host 启动。归档和恢复使用官方工作区接口，插件的旧 `workspaceRegistry` 接口还包含全局元数据、搜索和批量删除。Harmony 候选仅将这些旧接口留给桌面 owner，原包仍进入标准客户端模块图。API 26 ArkWeb 已用原包打开窄屏设置页、验证旧接口拒绝并恢复一条合成会话。真机待验。[原包权限对照](../evidence/workspace-archive-manager-installed-boundary-validation-20261107.json) · [ArkWeb 验收](../evidence/workspace-native-archive-manager-compact-validation-20261107.json)

按用户决定，本轮保留这条权限边界。`WorkspaceChannel` 对共享处理器的固定响应（404 `not found`、403 `forbidden`）保留状态码和拒绝原因，允许正文时返回结构化 JSON。`HEAD` 保留 `x-dsh-workspace-route` 响应头。功能自有的错误体按原样透传。壳层内的 `window.fetch` 收到诊断头时输出 `console.warn`，并派发 `harmony:workspace:route-unavailable` 事件，手机上的提示由插件界面处理。`skills-manager` 探针只验证了共享处理器的原始 404，手机界面按约定暂缓。

封存桌面候选和独立中继已补验完整加密请求。隔离 Host 注册合成 Web Server 前缀和 owner 专用 Fetch 路由，桌面 owner 请求均返回 200。合成设备使用工作区授权请求同一路径，分别收到 404／`unregistered` 和 403／`owner-only`，错误 JSON 与响应头均完整，两个处理器的设备调用次数为零。随后同一连接完成标准 DevFlow RPC、只读委派和重开读回。此轮使用 Node 合成对端、TLS 1.3 回环和四条固定回放。[加密路由对照](../evidence/workspace-installed-workspace-trace-1793991172381-probe-b4VKer.json)

### 原生加密载体验收

[原生加密结果](../evidence/workspace-cipher-validation.json)封存了在同一安装版副本与四个标准包上通过的 Rich 和 DevFlow 整轮：实际 `NativeDeviceProductFacade`、鸿蒙 SDK ECDSA／临时 ECDH／HKDF／AES-GCM、独立设备票据和工作区授权共同承载标准页面。Rich 完成动作、草稿、重开及后台恢复；DevFlow 保存 worker/high、完成只读委派并核对父模型和持久化子请求。每组四次固定响应、真实模型调用 0，Host 分别记录传入 25,666,665 和 26,140,303 字节，测试错误 0；明文 `/native` 旁路和错误测试 token 均返回 403。测试仅使用公开固定软件身份及 HTTP loopback 帧载体，未读取 HUKS 或原配对；不构成生产 WSS／TLS、公网、真机、完整键盘或性能资格。

这条原生路径复现了 `URL is not defined`：原 HTTP 替身在 Node 中执行了资源清单解析，未覆盖手机共享 JS 的 URL 依赖。共享模块现显式使用 `@ohos.url` 的 SDK 解析器，编译输出的默认模块绑定单独校验；移除浏览器全局 URL 的资源清单回归与导入检查 10 项、原生所有者 54 项通过。实际测试 HAP 为 `5cbab6ba5ba8244462a6517b7d92bc918828de7c949b7c3798f083fe04f6c705`；另已构建并封存包含修复的[默认禁用产品候选](../evidence/workspace-cipher-product-candidate.json)，未签名、未安装或激活。原审阅清单保持原字节，新候选通过单独记录交接。

测试准备同时修正了提前创建挑战、跨主机时钟下测试发行期限恰等于客户端上限，以及测试入口漏声明 `workspaceRegistry` 依赖；这些改动不放宽产品期限或授权。八份失败运行、挑战阶段原生日志及 URL 失败保留在[诊断归档](../handoff/standard-plugin-workspace/review-ZMiIAK/native-cipher-TP2rvr/diagnostics/manifest.json)，不能计作整轮通过。成功轮读取日志时早期握手行已轮转，归档明确列出实际保留的日志事实；整轮结果关联确切 HAP、87 份原生构建输入、设备鉴权后的加密请求和双端终态。两个 Host 与两个驱动均正常退出，临时映射已清空、测试应用已停止；用户启动的模拟器保留运行。

### 安装版与先前 HTTP 替身

实际安装版为 `0.2.1-rc.2.20261028.2`。公开运行时按文件 SHA-256 复制到独立目录，再由实际安装的 Node 载体通过 `dsh --profile workspace-review` 启动独立 home。模型目录、四种预设、Client Modules 和会话版本比较选模[探测通过](../evidence/workspace-installed-probe-1793706966530.json)，真实模型调用为 0；未读取日常账号、凭据或会话。

安装版副本在两个独立 profile 中加载当前封存的全部四包。[DevFlow 后端组合](../evidence/workspace-installed-devflow-1793721660143-probe-ehI7bT.json)通过直接模式、worker/high 只读委派、父模型保持 main 与持久化子请求检查；[Rich 后端组合](../evidence/workspace-installed-rich-1793721663315-probe-jwwUhD.json)通过接受后完成、未决查询不重发和精确草稿重开。两组均使用非 owner Gateway，明确拒绝另一份已存在但未授权的合成 Session；候选 Connection 确实被选中，三个标准客户端批次共提供 11,581,997 字节。每组恰好四次离线响应，真实模型调用为 0。这些运行不执行前端 JavaScript，不能替代安装版组合的手机页面验收。

安装版首轮组合因测试插件缺少 `connection` 注入而[失败](../evidence/workspace-installed-probe-1793720798783.json)；该依赖已显式声明，后续独立重跑才计入通过。模拟器源码 Host 与安装版副本复用同一份本地 HTTP 载体测试 helper；封存包、生产设备授权与加密连接实现保持原样。

[安装版后端指纹汇总](../handoff/standard-plugin-workspace/review-ZMiIAK/installed-backend/validation.json)重新核对公开运行时的 17,257 个文件、四个归档及两组实际解包文件，并关联独立 home、dsh profile 启动记录和有限回放结果。它只确认后端服务、授权与标准批量资源提供，不把原清单中尚未完成的日常激活或真机范围改写为通过。

[安装版 DevFlow 原生页面](../evidence/workspace-installed-native-devflow-1793722708044-probe-GbrmD3.json)与[安装版 Rich 原生页面](../evidence/workspace-installed-native-rich-1793722972605-probe-dLfDhS.json)在另外两个独立 profile 中通过。手机实际执行封存标准客户端：DevFlow 保存 worker/high 并显示只读委派完成，父模型及持久化子请求与配置一致；Rich 完成输入、接受与完成状态、未决查询不重发、精确草稿恢复、返回、工作区重开与后台恢复。父页面、存储和 loopback fetch 探针被拒绝，Host guest 探针请求为 0。每组四次离线响应，真实模型调用为 0。

[安装版原生指纹汇总](../handoff/standard-plugin-workspace/review-ZMiIAK/installed-native/validation.json)关联上述双端结果、四个归档、实际解包文件、已核对的运行时副本、HTTP 测试 helper 源码及测试 HAP，并单独保存同指纹测试 HAP。标准 Web 壳层来自封存 Harmony 包的 `workspace-shell`；载体 helper 仍以源码 WorkspaceChannel／Wire／Shell 接安装版服务，不能据此声称封装后的生产设备命令或加密原生连接已激活。234 个 lab／integration 模块的严格类型检查通过。两组测试进程均正常退出，临时映射已移除，独立测试应用已停止；模拟器保留运行。

[Rich 键盘运行](../evidence/workspace-installed-native-rich-1793724307306-probe-i1C0z3.json)另使用增加只读窗口观察的独立测试 HAP，核对实际键盘高度 1060 px、输入框和提交按钮位于键盘上方、中文 BMP 输入、原生退格，以及 Back 只收起键盘而保留 Rich 与草稿。随后五轮重新打开均回到可输入会话，关闭均移除 Web，响应总数保持四次。耗时、PSS 原始样本与未确认的内存增长见[测量范围](workspace-measurement.md)。

[输入对照](../evidence/workspace-keyboard-input-control-20261104.json)保留补充平面表情在 UITest text／剪贴板路径变成两个问号的失败；设备侧 UTF-8 脚本字节完整，系统输入法的剪贴板提示和 Rich 字段都显示问号。该失败轮仅消耗一次响应，不计为完整通过。中文 BMP 的后续成功不证明表情或全部输入法组合已验收。

[加密载体键盘轮](../evidence/workspace-cipher-keyboard-diagnostic.json)使用独立 HAP `08af9ba2acf250d5c8499d9778f8b238eaacea3ae2352d3f632737b6532d4ab8`，标准 DevFlow 名称字段经普通鼠标和原生触摸获得焦点后，键盘高度仍为 0，驱动在输入前失败；196 份构建输入、布局和双端结果按原字节保留。该轮没有完成设置输入、保存或委派，不计为完整键盘通过。

[原生输入框对照](../evidence/workspace-keyboard-native-control.json)使用测试 HAP `9bc63321746aa68d88d6806c2c72fc07b6417b7560b447b52ea73c79e3a12239`，仅在测试页增加普通 ArkUI `TextInput`。用户完成输入法初始化后，[后续对照及五轮失败归档](../evidence/workspace-keyboard-postinit-diagnostics.json)记录了原生键盘高度 1060 px，以及 DevFlow 名称字段的键盘避让、中文 BMP、退格、Back 保留草稿和设置保存。整轮仍未通过：前两轮分别停在滑动定位和禁用发送按钮的几何检查，后三轮停在键盘展开等待。驱动已缩短滑动、区分显示与启用状态，并用 `origBounds` 拒绝裁切目标；[真实布局对照](../evidence/workspace-keyboard-target-control-20261104.json)核对了后两条判断。普通鼠标点击完整可见的字段仍出现零键盘高度，不能将定位修复当作键盘问题已解决。

[无 Host 输入基线](../evidence/workspace-keyboard-baseline-comparison-20261104.json)另用普通本地 HTML 与 ArkUI 输入框比较。两个独立冷启动分别采用 MULTIPLE／FAST_MODE 和 Web 默认设置，原生构建输入仅相差这两条模式调用；均在没有插件、Host、模型、网络映射或 UITest 轮询的点击阶段复现 Web 键盘附着失败，默认变体保留 `errcode=80`。两者也记录到原生输入框聚焦但键盘高度为 0。它们证明复现不依赖标准工作区，尚不能确定系统、SDK 或应用的唯一原因；先前 1060 px 成功记录继续保留。只读系统列表确认当前项为小艺输入法，未改变输入法、隐私、权限或进程模式的生产配置。

[公开错误码研究](../evidence/workspace-keyboard-error80-research-20261104.json)只提供线索：所读 OpenHarmony master 的内部枚举将 80 对应输入法启动超时，但该隐式枚举未与当前镜像版本匹配，不能视为部署环境根因。研究只发送公开错误字符串，未外发项目或日志；结构校验不构成安全或兼容性认证。用户随后在默认设置的本地对照页人工比较，原生输入与 Web 输入均能正常弹出键盘。这与自动点击阶段的零高度和错误码 80 不一致，提示失败可能与 UITest 点击路径或当次输入法状态有关，但这只是推断，没有据此确认根因。人工观察没有记录键盘高度、输入法状态或使用的 HAP，单独保留。

同一无 Host 对照包在独立模拟器的三个冷启动中比较两种点击方式。经电脑窗口分别点击原生输入框和普通 ArkWeb 输入框，均获得焦点，键盘高度为 0。等待普通 ArkWeb 输入框进入设备可访问树后，经 HDC 点击，记录到输入法绑定成功及 1060 px 键盘高度。首次 HDC 尝试因页面尚未就绪在点击前停止。结果说明两条路径在当轮表现不同，输入法状态与点击方式的因果关系仍待确认。测试包已恢复。[输入路径对照](../evidence/workspace-keyboard-input-path-20261107.json)

随后在同一测试应用进程按 DevFlow、同一个 ArkWeb 的普通 HTML 输入框、同窗口原生输入框的顺序，用 HDC 点击并采集输入法日志。DevFlow 与普通 HTML 都发出 `isShowKeyboard=1` 的附着请求，DevFlow 收到 `errcode=80`，后两个输入框均绑定成功并展开到 1060 px。换序后，普通 HTML 首次请求收到同一错误，随后 DevFlow 和原生输入框均绑定成功并展开到 1060 px。两轮均使用相同的输入控件代码。现象跟随首个附着请求，当前证据支持输入法状态或请求时序的影响，未确认系统内部成因。[DevFlow 先点](../evidence/workspace-native-wss-close-cancellation-standalone-attach-validation.json) · [普通 HTML 先点](../evidence/workspace-native-wss-close-cancellation-standalone-attach-plain-first-validation.json)

[第三方来源核对](../evidence/workspace-thirdparty-research-20261104.json)仍为部分结果：[作者 README](https://github.com/sluminositys/dsh-nested-followups)宣传 `0.2.3` 并以 DSH `0.2.1-rc.5` 为目标，工具返回的[缓存清单](https://github.com/sluminositys/dsh-nested-followups/blob/main/package.json)却声明 `0.2.2`、标准 Web 客户端 `lib/client.js`，以及未覆盖本轮桌面版本的旧 DSH peer 范围。这些可变页面的抓取时间不同，不能代表固定 npm 发布物或建立 rc.2 兼容性；未下载、安装或执行该包。研究使用无聊天历史的 worker，工具权限未独立隔离；返回的结构与来源引用已校验，但这不构成安全或兼容性认证。

[键盘阶段进度归档](../handoff/standard-plugin-workspace/review-ZMiIAK/keyboard-progress/manifest.json)明确标为 `partial`：保存已通过的 Rich 双端结果、测试 HAP、源码、11 份应用 PSS，以及没有通过的原生运行。DevFlow 普通鼠标路径曾实际观察到表单和会话编辑器的键盘展开，DOM 为可编辑 INPUT／DIV，未调用测试页的 requestFocus／onActive；但完整运行随后遇到 UITest 布局读取超时，其他轮仍有未确认的键盘等待失败。这些结果不计作完整键盘通过。后续须保持单一 UITest 调用者，并区分实际输入行为、窗口捕获与自动点击的差异。

测试 Host 替换 `live.json` 时的 Windows `EPERM` 另有[失败补充](../handoff/standard-plugin-workspace/review-ZMiIAK/keyboard-progress/status-failure-supplement.json)。[Windows 对照](../evidence/workspace-live-windows-20261104.json)验证持有不允许删除共享的读句柄时，旧替换失败而不可变快照可继续发布；普通 Get-Content 对照未复现阻止替换，实际持有者仍未知。当前测试状态按变化写入完整的新文件，不覆盖已发布快照；测试载体关闭也先取消该载体的待处理请求。这些只改变测试工具，封存四包及生产所有者未变。236 个 lab／integration 模块严格类型检查通过；本阶段结束时所有已知测试句柄已终止、临时映射为空、独立应用已停止，用户启动的模拟器保留。

模拟器 ArkWeb 在原生通道可达时报告 `navigator.onLine=false`，原 Connection 因此暂停 `$events`，任务目录无法就绪；测试中单次 online 事件使目录和目标会话恢复。最初的候选是给 Connection 增加 `ClientTransportHooks.availability`（[旧源码负对照](../evidence/workspace-connection-1793708595042.json)失败，[24 项连接检查](../evidence/workspace-connection-1793708615838.json)通过），现已作废。当前做法只在 Harmony 工作区壳层（`src/workspace-document.ts`）处理：把 `navigator.onLine` 覆盖为“载体已初始化且未停止”，在 capture 阶段用 `stopImmediatePropagation` 拦截可信（`isTrusted`）的 `online`／`offline` 事件，并在初始化完成和关闭时由壳层自行派发事件。Connection、Peer 权限与 generation 就绪条件不变。

Chromium 负对照（[失败](../evidence/workspace-rich-1793760108120.json)）与正对照（[通过](../evidence/workspace-rich-1793760223341.json)）显示该覆盖由载体状态驱动；`integration/workspace-rich.spec.ts` 新增第三个测试固定这一行为。壳层在新版本重新封存前的模拟器首轮验收曾在 Rich 表单重开处失败，根因是驱动的点击几何：入口点击区被输入框内边距遮住，只剩约 46 px，点击落在输入框上。修正驱动后（可点区不足 120 px 时先滚动）13 项原生检查通过（[旧测试 HAP](../evidence/workspace-installed-native-cipher-official-1793763319583-probe-3FhKZu.json)）。新版本重建测试 HAP（SHA-256 `52bf566d12eeb45e8eea0122f8f0393518f0f34af11f96b5c96f64f37f5ddd18`，含 `window.fetch` 路由提示）后，[同一整轮在三个标准包上重做](../evidence/workspace-installed-native-cipher-official-1793765082204-probe-aUymTx.json)，13 项全部通过：官方设置保存与恢复、自动工作区就绪、guest 无工作区对象、接受后完成、未决查询不重发、精确草稿恢复、Web 移除、重开及前后台。加密帧为 1,303 发出／1,201 收到（29,042,343 字节），回放四次，真实模型调用 0，`connectionPackageOverridden` 与日常 profile 使用均为 false。

这仍是模拟器结论。真机 ArkWeb 是否同样误报 `navigator.onLine=false` 没有验证；壳层覆盖使该值只取决于载体状态，不依赖系统判断，但真机上的实际表现需要签名 HAP 才能观察；签名与原位安装已完成，当前失败和剩余验收见[当前日常部署与真机边界](#当前日常部署与真机边界)。

模拟器测试最初为每个逻辑流保留一个 HTTP 长请求，Rich 和关闭操作出现排队。当前替身使用有界请求结果、短轮询及明确取消，Host 关闭由替身所有者处理；标准生产加密通道未按此测试现象修改。用户自行完成了系统输入法初始化。Rich 表单显示 `undefined:undefined`，生成页没有工作区或 Desktop 对象。

[Rich 原生验收](../evidence/workspace-emulator-1793714604552.json)在 Mate 90 Pro Max 模拟器的独立应用中通过：原生 UITest 输入精确替换字段，接受后完成、未决状态与查询不重发、最后草稿 `native-final-draft`、重开恢复、Rich 返回、整个 Web 关闭、再次打开及后台恢复。Host 同时核对四次回放、耐久草稿与动作状态；真实模型调用为 0。该轮 HAP 为 `a3fc37c58fb8220ea07d714a2e1a88a9f60cff0cdaf54fb54367c9f9f9774eff`，不覆盖后续页面切换修复或完整软键盘遮挡。

从当前会话直接切到插件列表时，旧组件正常卸载曾撤销后继启动。[负对照](../evidence/workspace-native-1793715042627.json)复现该问题，[54 项修复检查](../evidence/workspace-native-1793715061648.json)通过；新的卸载回调仅退役仍打开的当前文档。SDK 的 [FAST_MODE](https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-arkweb/arkts-apis-webview-e.md)销毁 Web 的 JS 与渲染上下文，控制器卸载只确认组件分离，不能据此声称特定 renderer PID 已退出。

[当前封存 DevFlow 原生验收](../evidence/workspace-emulator-1793717042076.json)通过：手机标准插件列表进入原设置页，创建 `Native delegate` 档案、选择离线 worker 模型、将编码用途设为 `high`，保存并回到原会话发起一次委派。手机显示编码只读运行完成；Host 核对父模型仍为 main、唯一子模型为 worker/high，以及持久化 `request/header` 中的配置。编辑阶段没有模型调用，整轮四次回放且真实模型调用为 0，最终 Web 已移除。该轮独立测试 HAP 为 `ace01c4c1e23cd1a92c9d85e0d5de37919388d1ad803193b1b3f50baaa3fa126`；日常安装未激活。

[当前封存 Rich 原生验收](../evidence/workspace-emulator-1793717969031.json)使用同一测试 HAP 通过完整输入、两类动作终态、查询不重发、精确草稿恢复、Rich 返回、工作区关闭／重开和后台恢复。生成页实际拒绝父页面访问、localStorage 与 loopback fetch 探针；Host 收到该 guest 探针请求的数量为 0。此结果覆盖这些探针和功能路径，不是所有 ArkWeb 安全能力或 OS 进程隔离的证明。

[模拟器验证汇总](../handoff/standard-plugin-workspace/review-ZMiIAK/emulator-validation.json)逐项核对两个完整运行、封存包清单、实际加载产物、54 项原生源码指纹与测试 HAP。Connection Host 字节与安装运行时副本一致。当前默认关闭产品 HAP 的 SHA-256 为 `9ce5a2c5e328f3cdbf8063f26968ee8b6969d2cd6ef32edd7cce0aa1039af44d`，它与模拟器测试 HAP 分开封存；没有签名、日常激活或真机更新。

[原生新建页验收](../evidence/session-creation-1793719173197.json)使用实际 `Index.ets` 界面，在独立应用中选择合成目录里的 Devin 类型、worker-model 主模型和 high 思考强度，只点击一次创建，打开新会话后返回列表。Host 通过实际 `deviceProfileSessionPorts`、预设目录和会话级选模服务核对选择，默认配置未变，模型轮次及真实模型调用均为 0。测试副本只替换 product 数据提供方，不执行原配对、密钥或加密设备连接，不能据此外推原 NativeDeviceProductOwner 的完整链路。

[新建页指纹汇总](../handoff/standard-plugin-workspace/review-ZMiIAK/native-creation/validation.json)核对测试副本移除一条 fixture 导入并还原构造器后与原生页面逐字一致；原页面 SHA-256 为 `b9fdae8b24f28ff53705f24af9166c4785af0eacf6a7e6125dcca3a4f764b2ca`。该测试 HAP 为 `ed24f27ecfe8c38b587eb2e09781f236b357c3102b77877fda57534b8ad0074a`，单独封存，未覆盖或替换前述 Rich／DevFlow 测试 HAP。232 个 lab／integration 模块的严格类型检查和 API26 编译通过；新建页完成了先前模拟器汇总中的原生选项待办，其余限制保持有效。

验收以明确的原生结果为准。[首轮驱动报告](../evidence/workspace-rich-1793707744191.json)虽然记录驱动退出成功，但其 `observed.finish.passed` 为 false，不构成原生验收通过；后续驱动已要求该字段明确为 true。所有测试仅使用合成会话、固定四响应回放和 loopback，不能外推真实加密手机连接、真机性能或公网恢复。

[DevFlow 探索运行](../evidence/workspace-emulator-1793715838187.json)在手机完成保存、worker 路由与只读委派，但中途更新过候选，外层文件指纹检查正确拒绝整轮通过。自动化驱动还保留了视口外保存提示、贡献晚于会话输入框就绪，以及滚动目标定位失败；这些运行均未计作当前候选通过。

Rich 探针轮次保留了[测试状态 JSON 并发读取失败](../evidence/workspace-emulator-1793717297214.json)和[大卡片点击落入浮动输入栏后的重开超时](../evidence/workspace-emulator-1793717601317.json)。状态与结束结果现在完整写入后原子发布；点击使用页签和输入栏之间未被遮挡的区域。完整重跑通过后才计入上述汇总。

Chromium 侧 Rich 主测试的 `outcome_unknown` 间歇失败已定位为测试同步问题，见[结算诊断](../evidence/workspace-rich-settlement-diagnosis-rc238.json)。原断言从接受回执开始只等待 15 秒，包含前一轮尚未完成的收尾、当前工具执行与本轮收尾；四份旧失败记录中，从排队到本轮结束已耗时 14.171–14.644 秒，两份新诊断在断言结束时本轮还没有结束，Host 账本正确保持 `running`。测试现从对应输入已认领开始等待整个 Agent 区间空闲，并用屏障确认未决动作在轮次结束前保持 `running`、释放后才变为 `outcome_unknown`；状态查询不重发。当前 Rich 单独加载及[DevFlow／Rich 同时加载](../evidence/workspace-rich-1793807898231.json)的三项 Chromium 检查分别通过，各使用四次固定回放，Rich Host SHA-256 保持 `395b2efd41a14fa92f5acc9dc11437ac95d4c7c4c2165c640a8da5f8e3359a62`，没有增加断言超时。旧失败、临时观察跟踪和后续通过分别保留；较早网络状态用例使用另一份生成脚本，其失败不归因于本次动作结算时序。

## 合回原仓库与真机检查

用户在 2026-11-04 确认 Rich 与 DevFlow 测试没有问题，同意合回原仓库；同时接受 skills-manager 手机界面暂不支持（技能可在电脑端安装），并授权真机验证。这一步只做本地提交，没有推送。

| 项目 | 原仓库提交 | 说明 |
| --- | --- | --- |
| DevFlow `0.3.0-alpha.3` | `dsh_plugins` `5d321d0` | 工具箱远程操作接入标准 Remote 授权。候选新增的测试把 Host 连接类型带进工具箱类型检查，造成 `ConnectionHandle` 转换 TS2352（基线 HEAD 上不存在）；合并时新增 `tests/tsconfig.toolbox-access.json`，工具箱程序排除该测试，`typecheck:toolbox` 串联两个程序。单元 265 项、client 36 项、`run-toolbox` 组合检查通过，host／client／toolbox／toolbox-access 类型检查为 0 个错误。 |
| Rich 客户端承载层 | 主仓 `lumina` 的客户端承载层 | 提交内容与候选只有门禁要求的差异：README 承载层段落移入实现细节（摘要字数上限），`RichGuest.tsx` 补接口和 JSDoc 并拆行，`native.ts` JSDoc 拆行，两个测试的订阅替身改为 `(packet) => { void listener(packet) }` 以满足 oxlint。不含私人封装的 `harmony.1` 版本后缀。rich-inline 18 个测试文件 167 项、oxlint 0 错误、客户端类型检查，以及 UI 文案、导出 JSDoc、README 摘要等文档门禁通过。 |
| Rich 镜像 | `dsh_plugins` `040112f` | 把同样 10 个文件放入 `dsh-rich-inline/workspace`，在 `source-manifest.json` 新增 `RichGuest.tsx` 并登记对应的主仓兼容提交。`check` 报告 `filesToSync` 为空，`doctor` 确认 67 个受管文件一致，管理工具 3 项测试通过。 |

主仓级门禁中，`verify-no-unknown-casts`（`clients/harmony-mobile/standalone-relay/src/route-maintenance.ts`）和 `verify-translation-pairing`（`clients/harmony-mobile/README.i18n.yaml` 及 handoff 快照副本）失败，来自 harmony-mobile 既有的未提交实验改动，与这两个包无关，没有处理。`controller.ts` 出现一条 oxlint 未使用的 disable 指令警告（基线指令因本改动不再触发），只是警告。Harmony 的 rc2.35 与 harmony-mobile 其余改动仍未提交。

## 当前日常部署与真机边界

日常桌面使用 Harmony 授权期限修复包，Workspace UI 和 DevFlow 沿用 rc2.58 配套包。临时分块诊断结束后恢复了该安装、配置和锁文件，核对 881 个文件。真机已用原证书从 rc2.59 原位升至 rc2.61，保留原配对与应用数据。最新源码含非空静态资源的空响应校验，rc2.62 官方未签名构建和 84 项原生替身检查通过。

| 功能 | 已验证 | 现场待验 |
| --- | --- | --- |
| 原生连接、聊天和新建任务 | 真机 rc2.61 连接恢复后读到置顶简报原生正文。原生类型、主模型与思考强度有真机空白会话读回和隔离回放证据。 | 本轮数据通道升级出现 HTTP 503，正常重开后恢复，503 来源仍待关联服务端记录。 |
| 标准 Web、关闭和重开 | 隔离 ArkWeb 用现场容量读取近 1.61 MB 的更早页，显示简报正文并关闭返回。较早真机版本通过非空会话标准 Web。 | rc2.59 的置顶简报在 `renderer-boot` 失败。rc2.61 两次采集分别缺少同进程握手标记和可核验的授权基线，均未点击 Web。当前真机简报正文、主动关闭返回与再授权重开仍待验。 |
| DevFlow 和富交互 | 独立 ArkWeb 验到 DevFlow 直达、会话设置保存与重开读回、恢复继承，以及固定回放下的 Rich 动作回执与草稿恢复。较早真机有 DevFlow 只读证据。 | 真机空白会话 DevFlow 保存、读回和恢复，以及 Rich 动作仍待验。 |
| 第三方及官方标准包 | 隔离运行验证了官方翻译、Brick 和 Archive Manager 的标准原包。 | 当前真机上的原包行为、输入法及持续运行仍待验。 |

现场版本、失败阶段和本地验收记录见[验收记录](acceptance.md)。本轮没有发送模型消息。

此前容量修复版与 rc2.58 真机用原配对读到置顶简报正文，三次自动续接通过。连接轮换后收到三次旧授权拒绝，标准 Web 未显示正文，DevFlow 未进入。该轮 DHome 诊断窗口无 503，线上和桌面配置已恢复。[容量修复真机记录](../evidence/workspace-phone-rc258-capacity-field-20261108.json)

回环复现了桌面历史窗口超过 1 MiB 加密明文容量时断连。容量修复版配套 rc2.58 在隔离模拟器用现场容量读到实际置顶简报副本的原生和标准 Web 正文，关闭后返回原生。前次真机首次断开及后续 503 的确切原因仍待核对。[加密回归](../evidence/device-integration-1794101690917.json) · [置顶简报现场容量复验](../evidence/workspace-pinned-briefing-rc258-emulator-session-capacity-rc2-5472.json)

2026-11-06，手机从 rc2.48 原位升级到 rc2.52，使用原证书及 profile，25 个载荷文件通过核对，UID 及已配对状态保留。手机多次拨号停在控制 WebSocket 升级前。电脑解析到中继域名，两次无凭证探测均未建立 TCP。当时日常桌面使用 rc2.48 对应的 Harmony 包。[rc2.52 现场记录](../evidence/workspace-phone-rc252-field-20261106.json) · [当时的桌面安装](../evidence/workspace-desktop-field-rc248-installed.json)

归还手机后的首轮桌面复核中，Mihomo 将中继请求发往「普通」组，所选节点的上游拨号超时。DHome 恢复后已在备份的基础上将 `DOMAIN-SUFFIX,devinho.me,DIRECT` 加为线上订阅首条。桌面按现用订阅地址取回 HTTP 200 并核对该规则，Clash Verge 的缓存及运行时配置文件仍未出现该规则。[代理拨号日志对照](../evidence/workspace-phone-rc252-relay-proxy-outbound-20261106.json) · [直连发布记录](../evidence/workspace-phone-rc252-devinho-direct-published-20261106.json)

DHome 本机 Nginx 的中继控制请求起初返回 502，端口 17846 未监听。两份状态日志的独占锁均早于本次开机，日志摘要链和交叉锚点吻合。经授权停止服务并核对文件无人持有后，归档两把锁并启动原服务。中继在回环端口恢复监听，配置和四个状态文件字节一致。源站与桌面公网探测均收到预期的无凭证空 403。[中继恢复记录](../evidence/workspace-phone-rc252-dhome-relay-recovered-20261106.json)

中继恢复后，rc2.52 真机用原配对完成加密握手并读取原生会话。锁屏后原进程曾报告配对配置不可用，正常重开后恢复。该轮用 rc2.48 对应的桌面插件验收，三次打开工作区均止于 `prepare / unknown-outcome`。随后桌面查询均为 `workspace-disabled`。第二次确认授权之后记录到新的加密握手，其他失效时点缺少同期传输证据。[恢复后真机记录](../evidence/workspace-phone-rc252-relay-restored-field-20261106.json)

rc2.53 在原生 Ability 等上一轮工作区和连接完成清理后才恢复前台。与封存 rc2.52 相比，产品包的输入变化限于两个原生生命周期文件和版本名。SDK 替身在旧实现复现顺序颠倒，API 26 模拟器已验证同进程移除旧 ArkWeb、草稿保留和工作区重开。[生命周期验证](../evidence/workspace-rc253-foreground-validation.json)

rc2.53 原位安装时，日常桌面使用该版本的配套 Harmony 归档，原 Rich、DevFlow 和 profile 配置的校验一致。手机原 UID 和原配对保留，原生列表显示 15 个会话。真机新建页显示类型和模型入口，预览选择 `minimal` 后取消。[rc2.53 安装与初验](../evidence/workspace-phone-rc253-field-20261106.json)

组合隔离验证在回环 WebSocket 上复用原合成配对，数据通道中断后重新完成加密握手。新连接在重新授权前保留原生元数据访问并拒绝工作区，授权后使用 rc2.53 的文档启动脚本在 Chromium 重开标准 Web，再直接进入原包 DevFlow 并读取设置。[组合验证](../evidence/workspace-access-devflow-1793940407257.json)

停止授权后面板仍锁定的问题已修复，隔离桌面设置页和冻结安装预检通过。该修复包与 rc2.53 工作区核心通过三轮原生模拟器验收，逐轮核对归档和入口摘要。工作区核心与 rc2.53 产品包一致，测试版使用回环 WSS、测试 CA、合成身份及固定回放。日常桌面安装版设置页在停止授权后恢复了原配对连接按钮，Host 返回传输已启动。[修复包与 rc2.53 模拟器验收](../evidence/workspace-native-wss-panel-recovery-workspace-stop-validation.json) · [桌面安装与重连](../evidence/workspace-desktop-field-workspace-stop-reconnect.json)

上一次真机双端采集使用面板修复的诊断归档。现场采集后桌面原配置逐字节恢复，工作区临时授权关闭。[诊断归档安装](../evidence/workspace-desktop-field-workspace-trace-installed.json) · [现场采集及收尾](../evidence/workspace-phone-rc253-field-stdout-bgerqie3.json)

日常桌面已按授权安装封存的续帧 Harmony 包并正常重开，三套插件的 812 个文件和原配置通过核对。新旧归档的 TLS 回环对照中，旧包触发 `ws-parts-limit`，新包完整送达。隔离安装版 Host 的标准 Web 重开与 DevFlow 配置读回通过，离线安装回退已核对。[桌面安装](../evidence/workspace-desktop-field-wss-fragments-installed.json) · [候选与隔离验收](acceptance.md)

同一续帧归档在 API 26 独立模拟器通过七项检查。ArkWeb 渲染标准 Web，标准 DevFlow 配置保存并在重开后读回，`worker/high` 只读委派完成。该轮使用模拟器端的回环 WSS、隔离 Host 端的进程内中继和四条固定回放。[模拟器复验](../evidence/workspace-native-wss-fragments-validation.json)

封存的关闭取消候选修复了在 Host 验票期间已取消的关闭请求仍会执行的问题。该桌面包与 rc2.53 工作区核心完成三轮独立中继模拟器复验，共 34 项。后续目录读取合并候选已单独封存。日常桌面入口摘要仍匹配续帧包。此前真机因 USB 离线中止，最近一轮恢复 USB 后通过标准 Web 和 DevFlow 直达。换包及新版真机复验待具体授权。[关闭取消交付预检](../evidence/workspace-close-cancellation-readiness-20261106T184730040656Z.json) · [目录读取候选](../evidence/workspace-desktop-scope-batching-candidate.json) · [最新真机验收](../evidence/workspace-phone-rc253-fragments-regrant-devflow-20261107.json)

最终桌面三包与 rc2.54 原生页面配套的 13 项模拟器正常链路检查已通过。DevFlow 写入与委派、Rich 和官方翻译的隔离整轮使用同一组桌面包与 rc2.53 工作区核心，rc2.54 的工作区核心和文档脚本与其字节一致。[rc2.54 正常链路](../evidence/workspace-rc254-release-regrant-emulator-validation.json) · [三包功能复验](../evidence/workspace-native-release-compatibility-validation-20261107.json)

| 功能 | 当前候选的隔离证据 | 最近一次真机结果及待验项 |
| --- | --- | --- |
| 原生聊天与新建 | rc2.58 与授权期限归档只创建一条会话，四轮固定回放和磁盘日志均核对了所选类型、主模型和思考强度。标准 Web 同会话及跨会话返回保留各自草稿。创建回执丢失时，重连刷新后可打开 Host 已创建的同一空白会话。[原生新建执行](../evidence/workspace-rc258-grant-deadline-arkweb-creation-20261108.json) · [跨会话返回](../evidence/workspace-rc258-grant-deadline-arkweb-blank-20261108.json) · [回执丢失验收](../evidence/workspace-creation-recovery-rc254-emulator-validation.json) | rc2.54 用原配对选中 `minimal`、`DeepSeek-V4-Pro` 和 `high`，只创建一条空白会话。持久化日志读回一致，零模型事件。用所选配置发送消息由隔离回放覆盖。[真机空白新建](../evidence/workspace-phone-rc254-blank-session-verified.json) |
| 限时授权与加密工作区 | rc2.54 与最终三包通过关闭、重连、授权前拒绝、授权后重开和按包名直达 DevFlow。桌面主动撤销另有隔离证据，面板打开时撤销使读写禁用，原连接可重新授权。[原生重连与重新授权](../evidence/workspace-rc254-release-regrant-emulator-validation.json) · [桌面主动撤销](../evidence/workspace-native-wss-close-cancellation-standalone-workspace-revoked-regrant-validation.json) | rc2.54 同一进程完成标准 Web 打开、关闭、原配对加密重连、旧授权拒绝及重新授权后重开。两次标准 Web 约 25.3 和 14.1 秒显示。[首次打开](../evidence/workspace-phone-rc254-release-rc254field-open.json) · [重连与拒绝](../evidence/workspace-phone-rc254-release-rc254field-reconnect.json) · [重新授权后重开](../evidence/workspace-phone-rc254-release-rc254field-reopen.json) |
| DevFlow | rc2.58 与授权期限归档保存自动编排和模型档案，重开读回。父任务使用 `main`，只读子任务使用 `worker/high`，持久化请求与执行一致。[ArkWeb 执行](../evidence/workspace-rc258-grant-deadline-arkweb-devflow-20261108.json) | rc2.58 重新授权后按包名直达多模型工具箱，约 34 秒显示，读到编排、模型和思考强度，关闭后回到同一原生简报。配置保存和委派仍只有隔离证据。[真机只读验收](../evidence/workspace-phone-rc258-capped-grant-grantfield1108c.json) |
| Rich | rc2.58 与授权期限归档通过动作回执、未决状态查询、草稿恢复、来宾隔离和前后台切换。[ArkWeb 动作](../evidence/workspace-rc258-grant-deadline-arkweb-rich-20261108.json) | rc2.48 打开原会话中的现有 Rich 内容。动作提交、状态查询和草稿恢复仅有隔离证据。 |
| 无手机适配的标准插件 | rc2.58 与授权期限归档在隔离 ArkWeb 验证官方翻译原包设置与原译文切换、Brick 0.2.1 主题开关和启停，以及 Archive Manager 1.1.7 的窄屏设置和合成会话恢复。Archive Manager 的旧收藏接口仍拒绝设备访问。[官方翻译](../evidence/workspace-rc258-grant-deadline-arkweb-rich-20261108.json) · [第三方原包整轮](../evidence/workspace-rc258-grant-deadline-arkweb-thirdparty-20261108.json) | 三个原包的手机行为仍待真机验证。第三方 `skills-manager` 的安装和 Host 加载已核对，依赖桌面 webServer 前缀路由，手机界面按已定范围暂缓。[第三方兼容范围](#标准-cli-安装与第三方发布物) |

既有非空会话通过标准 Web 和 DevFlow 只读验收。随后在专用空白会话重新授权，标准 Web 与设备页的 DevFlow 直达均停在加载失败页。手机已归还，空白会话日志摘要一致，设置仍为继承，模型调用为零。空白会话打开、DevFlow 保存读回和 Rich 真机动作仍待验收。[空白会话现场记录](../evidence/workspace-phone-rc254-devflow-after-regrant.json)

既有非空会话验收结束后，诊断 Host 正常退出，连接的内存授权结束。临时诊断配置已逐字节恢复，桌面窗口已重开。[诊断 Host 退出收据](../evidence/workspace-trace-live-gq3dc794/close.json)

### 既有现场与隔离记录

源码测试复现了旧 Host 关闭请求失败后，后续打开继续收到同一次失败。rc2.51 在完成原生清理并建立新连接后可重开。同一连接或原生渲染器清理失败仍拒绝。28 项源码测试通过。独立 API 26 模拟器用本地页面夹具，经合成连接替换打开按包名定位的单个 ArkWeb，并在关闭后恢复草稿。DevFlow 原包的隔离验收另见上文。[源码、构建与模拟器](../evidence/workspace-close-recovery-rc251-validation.json)

rc2.52 将消息端口关闭失败也纳入原生清理失败。SDK 替身覆盖 Host 已确认关闭和旧连接已替换两种情况，均阻断后续重开。与 rc2.51 相比，产品构建输入仅变更工作区所有者和版本元数据。API 26 模拟器复测了原生清理成功后，旧 Host 关闭失败时合成重连、按包名重开和草稿恢复。真机的加密关闭失败原因仍待确认。[rc2.52 回归证据](../evidence/workspace-rc252-native-port-close-validation.json)

回环加密故障对照在 Host 已执行关闭、尚未发出回执时断开数据套接字。旧设备绑定和凭证失效，释放旧 RPC 后关闭请求拒绝。用原配对建立新绑定后可读原生数据，工作区经重新授权恢复标准接口，旧资源句柄继续被拒绝。对照使用实际 P-256 加密和本机 WebSocket，ArkWeb 重开与真机结果分别见上述记录。[关闭回执丢失对照](../evidence/workspace-access-1793895515932.json)

另一处故障注入在手机加密关闭请求期间断开数据通道。旧绑定退出后，加密返回 `E2EError('closed')`，日志类别为 `encrypted-failure`，关闭帧未发出。rc2.48 封存源码显示，Host 显式返回的错误会归类为 `unknown-outcome`。真机已有收据能将首次失败归到手机加密错误，仍缺少确认触发原因所需的同进程传输事件。[发送阶段对照](../evidence/workspace-close-encryption-diagnostic-validation.json)

2026-11-05 现场将 CMM-AL10／API 26 手机从 rc2.40 原位升级到 rc2.48，使用原证书及 profile，官方验签和 25 个原始载荷文件的 SHA-256 校验通过。versionCode 2、UID 20020297 和原配对保留，未卸载或清数据。日常桌面备份后离线替换配套 Harmony 归档并正常重启。Harmony 的 309 个文件与候选一致，Rich 的 177 个文件、DevFlow 的 326 个文件及桌面配置与更新前一致。pnpm 报告 peer 依赖警告，正常启动后手机已连回桌面。[双端现场收据](../evidence/workspace-phone-rc248-closeout.json)

rc2.48 首次现场验证原 HUKS 重连、原生聊天和新建页选项后，尝试打开工作区。该次临时授权未确认生效，打开操作留在原生聊天并提示“操作未确认完成”，日志未捕获工作区 RPC 或 Rich 启动失败。随后另一次现场在明确授权后打开了标准 Web 和现有 Rich，见本节覆盖表。[首次现场结果](../evidence/workspace-phone-rc248-closeout.json)

rc2.49 的隔离对照确认，旧加密 RPC 会把缺少工作区授权归为 `unknown-outcome`。新实现只在没有有效授权时返回 `workspace-grant-required`，授权前及撤销后拒绝，授权后同一连接可打开。4 项加密 WebSocket 集成与 63 项 SDK 替身检查通过。API 26 模拟器原生页显示授权提示，保留草稿并记录固定错误码。另一轮使用同一 HAP 和封存桌面归档，在授权后完成四次固定回放、标准 Web 与 DevFlow 面板往返，两次返回都保留草稿。[rc2.49 双端候选与对照](../evidence/workspace-grant-rc249-validation.json)

API 26 独立模拟器补验了原生 NetworkKit WSS。rc2.49 适配器的测试副本只增加回环端口和应用沙箱 CA 参数。省略测试 CA 时，服务端记录 `unknown CA`，手机记录 `code=200 http=0`，没有 WebSocket 升级。使用测试 CA 时，控制和数据通道均协商 TLS 1.3，按各自的子协议升级。两者发送的 Origin 都是 `https://127.0.0.1`，不含端口，符合中继的 NetworkKit Origin 格式。控制文本和 512 KiB 二进制帧往返逐字节一致。两条连接、临时转发及监听器已关闭，独立模拟器已恢复原验收包。该轮覆盖合成帧的套接字和证书校验。[WSS 原生对照与日志](../evidence/workspace-native-wss-proof/validation.json)

API 26 模拟器联合验收使用实际控制和数据升级适配器、签名中继及当时的封存桌面包。两条连接使用本地 TLS 1.3，原生日志确认对端签名验证，旧 HTTP 帧入口返回 403。原生新建任务、所选模型的四次固定回放、标准 Web 同会话显示、DevFlow 按包名直达和草稿恢复均通过。桌面侧使用内存端口，手机使用应用沙箱测试 CA 和合成软件身份。[联合验收与清理记录](../evidence/workspace-native-wss-full-proof/validation.json)

Rich 专项沿用原生 WSS 和封存桌面包。在独立 API 26 模拟器的测试页面中，rc2.49 的工作区核心、Rich 宿主和两份 Web 桥脚本与产品候选逐字节一致。实际 ArkWeb 表单收到完成回执，查询未决动作后回放计数保持为四，重开恢复草稿和未决状态。来宾无法访问父页、存储和网络，前后台切换释放并重建 WebView。十二项检查通过，真实模型调用为零，两条转发与监听器已清理，原测试包已恢复。真机现场复测仍待进行。[Rich 原生 WSS 验收与清理记录](../evidence/workspace-native-wss-rich-proof/validation.json)

官方翻译原包在同一套原生 WSS 测试链路上通过设置与会话贡献验收。API 26 模拟器通过 ArkWeb 标准面板把目标语言保存为日语，实际会话显示译文、原文及再次切换后的译文，重开面板读回日语。官方 bundle、客户端和 translator 的 33 个文件与安装版对照一致，运行前后摘要一致。整轮包含 Rich，15 项界面检查通过，记录一次合成翻译请求和四条固定模型回放，真实模型调用为零。手机端使用沙箱 CA 与合成身份，桌面使用回环翻译端点和中继内存端口。真机生产连接仍待现场验收。[官方原包布局、Host 收据和清理记录](../evidence/workspace-native-wss-official-proof/validation.json)

DevFlow 整轮使用同一套原生 WSS 测试链路及 `0.3.0-alpha.3` 标准归档，归档摘要与 rc2.48 整轮一致。模拟器从直接模式切到自动编排，保存 `Native delegate` 模型档案，完成只读委派，重开面板读回档案。Host 核对父任务继续使用 `main`，子任务实际路由与持久化请求均为 `workspace-replay/worker`、`high`。七项检查通过，消费四条固定回放，真实模型调用为零。两条转发及监听器已释放，模拟器已恢复原测试包。[DevFlow 工作流及清理记录](../evidence/workspace-native-wss-devflow-proof/validation.json)

### rc2.40 前次现场

[rc2.40 现场封存](../evidence/workspace-phone-rc240-closeout.json)关联安装、验签、配置备份、失败截图、日志和会话审计。

该轮桌面使用标准 Rich `0.2.1-rc.2.harmony.1`、DevFlow `0.3.0-alpha.3` 和 Harmony rc2.35 fix3。fix3 增加设备请求失败诊断，309 项安装文件核对通过，其他包版本和 profile 包清单保持原值。[安装收据](../handoff/deploy-rc235-20261104/desktop-fix3-installed.json)保留备份位置。Desktop 将子进程 stderr 保存在自身内存中，父进程日志无法独立确认请求结果。

日常配置 `maxChunkBytes` 已由 1048576 改为 524288，配置文件先备份再局部修改，原有 1 MiB 加密明文、握手和中继上限不变。正常重启后，实际命令目录出现 Harmony 命令，手机连接恢复。较早的[容量失败](../evidence/workspace-device-capacity-rc238.json)能解释命令未注册，不能据此证明更早的所有连接失败都是同一原因。

真机 CMM-AL10／API 26 先后原位安装 rc2.39、rc2.40；versionCode 2、UID 20020297、原配对和 HUKS 身份保留，未卸载、清数据或重配。rc2.40 复用原材料，官方 app／profile 验签和载荷核对通过；相对 rc2.39，82 项原生输入文件相同，只变化版本元数据与工作区控制台诊断。原生调试接口仍关闭。[安装收据](../handoff/deploy-rc235-20261104/phone-install-rc2-40.json)与[签名收据](../handoff/deploy-rc235-20261104/sign-journal-rc2-40.json)分别记录安装和验签事实。

现场观察到原 HUKS 签名验证、对端证明、加密连接及原生历史读取成功。标准 Web 实际到达插件启动页，随后显示 `@deepseek-ai/dsh-experimental-rich-inline: failed`；控制台同时记录 `dynamicCordisRunner/inventory` 与 `dynamicCordisRunner/syncInspectManifest` 的工作区请求失败。具体 API 失败原因尚未确定，不能归因为网速、授权过期或硬件差异；本次没有取得 Rich、DevFlow、新建任务完整选模和工作区性能通过结论。锁屏期间已有进程还曾停在 `identity-init/unavailable`，正常退出后重开恢复，锁屏与该失败之间的因果关系仍未验证。

工作区授权绑定当前本地所有者：手机重新连接或所有者替换后，即使原 30 分钟到期时间未到，状态也可能已变为禁用，必须重新核对。连接变化还会关闭当前 Web 页面。现场结束时，标准 `workspace-stop` 返回 `workspace-disabled`，手机通过“断开并退出”正常结束，进程为空；没有撤销原配对。

[命令防护检查](../evidence/workspace-command-submit-rc239.json)包含 13 项提交条件、7 项参数模式和 6 项目录解析。指定的 `.build/desktop-update-rc235/dsh-command.ps1` 已在真实目录认领预检后启用显式 `-Submit`，仅允许四条既定命令；每次提交前两次核对不可编辑命令标记、精确参数和焦点，按键后未知结果不重试。`agent-browser get text` 对标记和参数之间的换行按空白统一后比较，目录解析兼容 `[selected, ref=...]`。禁止使用 `fill`。按键成功仍需核对实际标准命令结果。

较早[误调用审计](../evidence/workspace-command-incident-rc238.json)保留：锚点会话第 3 个模型轮次在 2026-11-04 22:51:51–22:52:47 完成，点击停止不能记为取消成功，该违规轮次不能计入离线验收。本次按完整 Zstandard 帧重读持久化会话，仍只有 3 个 `turn/start`，2026-11-05 00:00 UTC 后没有新模型轮次或用户消息。锚点兼作命令与工作区授权会话，保留，不删除或归档。

后续隔离对照覆盖了标准 API、连接重建后重新授权和工作区生命周期，合成数据未复现这一轮的真机 Rich 启动故障。当前候选及其余现场待验项见[日常部署与真机边界](#当前日常部署与真机边界)。

rc2.45 现场准备已核对封存产品 HAP 和配套完整桌面包摘要，签名前离线入口拒绝模拟器 HAP。原位更新脚本只允许从 rc2.40 进入该候选，要求原证书与原 profile、逐项载荷摘要、原 UID 和已配对的更新前快照。12 个拒绝用例均在假设备安装调用之前停止。日志采集现在识别 rc2.45，并仅解析应用原生固定诊断行，模拟的 Web 控制台伪造行被排除。此次无签名或真机操作。[离线预检](../evidence/workspace-field-rc245-preflight.json)及[下一次真机操作顺序](../handoff/deploy-rc235-20261104/HANDOFF.md)

rc2.48 的桌面原位替换预演使用私有 `desktop` profile，从现场封存的 fix3 归档装起。安装版 CLI 拒绝直接管理该 profile。首次直接使用 pnpm 的冷安装因缺少 DSH 的 `autoInstallPeers: false` 配置而超时。补齐标准 profile 配置后，pnpm 12.6.0 在同一 profile 离线完成升级、回退和再升级。Harmony 版本与包清单一致，`lib/device.js` 随归档正确切换，回退恢复原锁文件字节。三包 812 个文件、profile 配置、合成配对与会话文件均逐项核对。更新和回退采用各自的归档路径，pnpm 生成锁文件。测试未启动 Host，日常 profile 与真机待现场操作。[CLI 拒绝](../evidence/workspace-plugin-install-1793871083527.json)、[初始化超时](../evidence/workspace-plugin-install-1793871230201.json)及[离线替换预演](../evidence/workspace-plugin-install-1793871348697.json)

## 隔离补充验收

2026-11-05 的 `--rich-admission` 补充检查接入实际设备授权提供方、313 条合成可见会话和 1.36 秒往返延迟，保留 10 秒单次普通请求预算；[三项检查通过](../evidence/workspace-rich-1793850080657.json)。标准 Web 与同包 Rich 成功启动，没有出现现场相同的 API 失败日志；记录 134 次载体请求、64 次目录扫描，只使用四响应预算中的 1 个固定响应，没有真实模型调用。目录包含一个测试 Session，其余行是合成授权目录，不是 313 个真实会话文件，也没有执行 ArkWeb 或生产加密载体。该结果缩小了排查范围，不构成真机修复或磁盘扫描性能结论。

`--rich-admission-cipher` 保留同一延迟和目录条件，改走实际设备票据、原生 RPC 和 P-256／AES-GCM 内存载体。[三项检查通过](../evidence/workspace-rich-1793850715687.json)，标准 Web 与 Rich 启动，现场同类 API 失败为零。初始夹具错误和逐个新建空会话的准备超时保留在[诊断实验记录](../evidence/workspace-admission-rc240-closeout.json)，未形成产品复现。

独立 Mate 90 Pro Max 模拟器的[原生加密验收](../evidence/workspace-native-admission-validation.json)以实际 API 26 ArkWeb、原生加密 SDK、复制的安装版 Host 及同一标准包通过 11 项检查。覆盖 Rich 动作结算、未决状态查询、精确草稿恢复、重开及前后台切换；只消费 4 条固定回放，真实模型调用为零。模拟器仍使用补齐的 313 条目录、合成软件密钥和 HTTP loopback 帧载体，未验证 HUKS、公网 WSS/TLS 或真实历史体量。测试应用已停止，移除了本轮创建的反向转发。安装版运行时描述与抽查的五个关键包入口[逐字节相符](../evidence/workspace-current-runtime-match-rc240.json)，不代表日常 profile 的插件和数据相同。

模拟器准备阶段曾把旧生成的 64 KiB 接收上限和 512 KiB Host 分块混用，实际失败于资源转移校验，尚未到标准 Web 启动。准备脚本改为从当前产品配置重新生成原生配置并校验容量；[前后产物对照](../evidence/native-projection-refresh-comparison.json)显示共享 JS 产物不变。现场 rc2.40 已使用 1 MiB 接收上限，这个准备错误与现场 Rich API 失败分开记录。

同一测试 HAP 的[磁盘目录对照](../evidence/workspace-native-admission-disk-validation.json)在 Host 启动前写入 312 个仅含头部的合成 JSONL 文件，实际读取 313 个会话，包含一个固定回放会话，没有补齐目录。启动期间标准 Web 新建了一个会话，峰值为 314。11 项 Rich 验收和两项载体拒绝检查通过，未记录现场同类 API 失败；模型调用为零，测试应用与反向转发已清理。整轮 296 次目录读取的累计等待 97.3 秒，单次最长 1.55 秒；等待可重叠，累计值不表示打开页面的时间。早一轮[失败](../evidence/workspace-installed-native-cipher-rich-1793855011121-probe-bQvAJ0.json)是夹具拒绝正常的目录行数变化，不算现场复现。该对照覆盖文件数量和文件读取，未覆盖真实历史大小及公网时延叠加。

[磁盘和固定延迟对照](../evidence/workspace-native-admission-disk-latency-validation.json)沿用同一 HAP 和 313 个会话，在加密数据通道两个方向各加入 680 毫秒延迟，实际延迟交付 583 帧至 Host、534 帧至手机端。应用单次请求时限仍为 10 秒。Rich 全部 11 项通过，使用四条固定回放，真实模型调用为零。首次就绪约 85 秒，无额外延迟的一次对照约 42 秒。本轮共读取目录 251 次，单次最长约 1.28 秒。验收驱动已停止独立应用并移除其反向转发。早一轮[中断](../evidence/workspace-installed-native-cipher-rich-1793855924683-probe-o4vWfv.json)发生于关闭中的控件仍禁用时，驱动随后改为等待按钮恢复再继续。

固定延迟对照的合成文件只含头部，HTTP loopback 给数据帧施加固定延迟。第一轮的 Host 加密明文上限为 5 MiB。[桌面容量对照](../evidence/workspace-native-admission-disk-field-validation.json)根据已核对的部署备份改用 1 MiB 明文、2 MiB 帧、4 MiB 队列及 1 MiB 工作区请求上限，手机端明文上限仍为 5 MiB。313 个磁盘会话和同一延迟下，Rich 整轮 11 项再次通过。首次就绪约 82 秒，双向最大实测加密帧分别为手机至 Host 5,503 字节、Host 至手机 932,369 字节。全程四条固定回放，真实模型调用为零。现场 API 失败仍待定位。

[rc2.41 未签名诊断候选](../evidence/workspace-diagnostic-rc241-validation.json)增加 `DSH_WORKSPACE_RPC`，以固定标签记录 Rich 外观、Cordis 清单、检查清单同步及其他载体操作的失败类别。手机端可区分单次请求超时、Host 错误应答、本地待处理上限和连接代际不匹配。日志只包含固定操作和类别，私密异常原样向原调用方传播。SDK 替身 58 项通过，API 26 已编译。相对 rc2.40，构建输入只变更版本元数据、原生端口所有者和共享 ProductCore。候选仍未签装，实际真机日志待采集。届时先收集一轮工作区打开的 `DSH_WORKSPACE_RPC` 和 `DSH_WORKSPACE_CONSOLE`，与桌面同一时间段的 `Device workspace failed` 对照。

[原生就绪误报](../evidence/workspace-boot-false-ready.json)在故障注入后同时显示手机已就绪和标准 Web 插件启动失败。修复保留会话目录就绪时的导航，原生状态等标准渲染器替换启动页才发布就绪。启动页显示失败报告时，原生状态同步进入失败。独立 ArkWeb 的[对照验收](../evidence/workspace-native-rpc-diagnostics-validation.json)在同一 Rich 外观请求上分别注入 Host 拒绝和超时，两次都显示失败并记录不同标签。超时后 Host 收到取消，已等待约 9.94 秒。去掉故障后，第三次打开显示已就绪且出现 Rich 入口。全程一条固定回放，真实模型调用为零，独立应用和反向转发已清理。

[rc2.42 未签名候选](../evidence/workspace-boot-rc242-validation.json)包含诊断和就绪修复，API 26 编译通过，标准 Web 桥脚本与模拟器通过的脚本逐字节一致。并行编译期间的[中断轮](../evidence/workspace-installed-native-cipher-rich-1793858552171-probe-0QRChz.json)因模拟器应用主线程长时间无响应终止，未到故障注入点。无并行编译的重跑通过，堆栈不足以确定中断根因。用户暂不提供真机，原始现场 API 失败仍待定位。

[DevFlow 浏览器回归](../evidence/workspace-devflow-run-1793859141079.json)使用封存标准包和修复后的 Web 桥脚本，收到一次就绪和零次失败。全局 `auto`、会话 `direct`、worker/high 委派及主模型不变均通过。共消费四条固定回放，真实模型调用为零。

[DevFlow 原生回归](../evidence/workspace-native-boot-review-validation.json)沿用同一个测试 HAP 和封存标准包，在实际 ArkWeb、鸿蒙原生加密与安装版 Host 副本上完成直接模式基线、设置保存、会话重开、worker/high 只读委派和 Web 关闭。Host 核对主模型仍为 `main`，已持久化的子任务请求为 `worker` 和 `high`。使用四条固定回放，真实模型调用为零，测试应用及反向转发已清理。该轮使用独立模拟器、公开合成软件身份和 HTTP loopback。

[官方原包原生回归](../evidence/workspace-native-official-boot-validation.json)继续使用同一测试 HAP。安装版副本中的官方推理翻译 bundle、客户端和 translator 三包共 33 个自身文件逐字节相符。标准设置保存 Google／`ja`，原文和译文切换、重开设置及 Rich 动作、草稿恢复和前后台切换共 14 项通过。隔离 Host 的配置文件保留了 Google／`ja`，本地翻译端点收到一次固定请求。模型回放四次，真实模型调用为零，测试应用及反向转发已清理。该结果覆盖此官方原包及本地回放。

rc2.44 的官方原包复验曾在加载插件前失败，模拟器记录 ECDH 已导出共享密钥，随后收到 `key-invalid`。固定握手用例独立复现摘要首字符为 `-`、`_` 时的相同错误。rc2.45 在两端将这两个首字符对应的通道 ID 加 `b-` 前缀，字母和数字开头的 ID 保持原字节。15 项加密测试通过。要消除此失败需更新两端。真机此前的 API 错误仍待现场定位。[模拟器握手日志](../evidence/workspace-rc244-handshake-failure.log)及[加密测试](../evidence/phase35-vitest.json)

桌面完整候选沿用已验包的版本与安装清单，保留 156 个标准 Web 壳文件的原字节。309 个归档文件中变更 7 个，包括五个重建入口、已有诊断对应的源码和构建记录。此前 115 文件的构建归档缺少 Web 壳，交付使用完整候选并按摘要区分。[完整桌面候选](../evidence/workspace-desktop-complete-validation.json)

完整候选与原 Rich、DevFlow 归档经标准 `dsh plugin add` 装入私有 `web` profile，安装后三包 812 个自身文件均与归档一致。独立模拟器使用相同的桌面归档和 rc2.45 测试 HAP，官方翻译与 Rich 的 14 项检查全部通过。隔离 Host 先加载原 `lib/device.js` 并执行默认禁用入口，再以只追加命名导出的一份副本实例化该归档里的中继类。封存拒绝副本摘要不符的反例。[标准安装](../evidence/workspace-plugin-install-1793866234580.json)及[打包中继整轮](../evidence/workspace-native-official-packaged-validation.json)

工作区查询和停止只操作现有内存授权，拒绝授权无需打开身份。源码回归在修复前记录了一次合成身份解密，修复后确认授权前解密为零，授权后的资源读取及撤销通过。[修复前](../evidence/workspace-device-command-1793866711449.json)及[修复后](../evidence/workspace-device-command-1793866755048.json)

[新版完整桌面候选](../evidence/workspace-desktop-command-complete-validation.json)沿用相同 309 文件清单，保留 156 个 Web 壳文件，标准 CLI 安装后三包 812 个文件与归档一致。私有运行时使用归档原 `lib/device.js`、已启用的设备命令与合成 Session，无桌面身份时查询、停止以及 Client Modules 恢复后再次查询均返回未启用，仅原生配置拒绝工作区命令。真实模型调用为零。该测试使用手动连接模式及隔离服务树，实际 DPAPI、自动连接、生产 WSS 与真机仍待验。[新版标准安装](../evidence/workspace-plugin-install-1793866963248.json)及[打包命令检查](../evidence/workspace-installed-device-command-complete-1793867041837-probe-lhUzT5.json)

rc2.45 复验完成设备授权、标准 Web 启动、官方翻译设置与原文切换、Rich 动作回执、未决状态和草稿恢复及前后台切换，共 14 项。安装版副本中的三个官方包共 33 个文件前后逐字节一致。隔离 Host 使用修复后的通道源码，模拟器与未签名产品候选的产品核心、原生加密实现和 Web 桥逐字节一致。使用一次固定本地翻译及四次模型回放，真实模型调用为零。证据覆盖独立模拟器的加密帧载体，真机 HUKS 和生产 WSS 待验。[rc2.45 官方原包与 Rich 整轮](../evidence/workspace-native-official-current-validation.json)

同一 rc2.45 模拟器 HAP 在另一个隔离 Host 通过 DevFlow 五项检查。标准面板保存模型和思考强度，关闭后重开原会话，完成只读委派。Host 核对父模型 `main`、子模型 `worker/high` 及已持久化的请求配置。仅四次固定回放，真实模型调用为零。应用和 Host 已退出，临时转发已移除。[rc2.45 DevFlow 整轮](../evidence/workspace-native-boot-current-validation.json)

[补充证据清单](../evidence/workspace-offline-rc238-closeout.json)封存加密大块、Rich 结算及实际 ArkWeb 资源检查，不替代真机标准工作区。241 个 lab／integration 模块的 strict TypeScript 6.0.3 检查为 0 错误；本阶段没有访问真机、日常 profile 或真实模型。

加密资源检查沿实际 `NativeDeviceCore`、设备票据、独立工作区授权及 P-256／AES-GCM 内存载体，传入 715,000 字节固定数据；512 KiB 分块读取两次，最大序列化块 699,086 字节，低于原有 1 MiB 明文上限。重连后旧资源句柄继续被拒绝，相关四项检查通过（[结果](../evidence/workspace-access-1793806201386.json)）。这是字节与容量验证，没有测量公网往返或手机加载速度，也没有把日常配置改为该值。

同一工作区回归现走独立中继的实际 loopback WebSocket。两代连接各通过双方的控制与数据升级，手机测试端发送 NetworkKit 对应的 Origin。715,000 字节仍由两块读回。主动断开手机数据 socket 后，重连完成新的加密证明，原资源句柄被拒绝。现场曾报错的 `dynamicCordisRunner/inventory` 和 `dynamicCordisRunner/syncInspectManifest` 在断线前及重连后均从真实 Host 处理器取得成功响应。四项检查通过。测试使用合成签名和 Node WebSocket，覆盖中继、加密和标准 RPC；真机的 NetworkKit、HUKS、TLS 代理及 ArkWeb 启动仍待复验，现场原因未确定。[真实中继回归](../evidence/workspace-access-1793867544156.json)

原生工作区在准备期间也随原连接失效。原生富内容收尾时若已断线，启动停止；工作区准备时若连接被替换，旧请求被取消，晚到结果不挂载页面，原生聊天和草稿保留。当前连接的准备失败仍向原入口报告。源码两项回归在修改前复现，修改后三组共 51 项检查通过。首次 rc2.46 构建因 ArkTS 不允许抛出未收窄的异常失败，修正后 rc2.47 以官方工具链构建未签名 HAP。与 rc2.45 的 84 项构建输入比较，仅应用版本和 `Index.ets` 变化。rc2.40 的现场启动原因仍待确认。[回归与构建证据](../evidence/workspace-startup-recovery-rc247.json)

rc2.47 页面在独立模拟器取消了旧启动并保留草稿，但原生页仍报错。工作区所有者把准备请求的预期拒绝也计入了清理失败。rc2.48 由启动调用方处理准备结果，关闭仍等待请求退出，并保留渲染器与 Host 关闭错误。刷新 SDK 替身后 52 项检查通过。API 26 模拟器以合成连接切换复验，通过旧请求取消、原生草稿保留、新连接只挂载一个 ArkWeb 及返回聊天四步。测试 HAP 与产品 HAP 的原生页面仅替换测试提供方，工作区所有者和文档桥逐字节一致。模拟器测试应用已退出，UID 保持。产品 HAP 未签名，生产链路和真机待验。[前后对照与候选](../evidence/workspace-startup-recovery-rc248-validation.json)

rc2.48 的标准插件整轮使用同一模拟器 HAP 和新版完整桌面归档。官方翻译与 Rich 通过 14 项，DevFlow 通过 5 项。Host 核对 `main` 父模型、`worker/high` 只读委派及持久化请求。每轮使用四条固定回放，真实模型调用为零。模拟器包的工作区所有者、文档桥、产品核心与未签名产品包逐字节一致，归档中继仅在测试副本追加导出。首轮预检误要求重新生成原生代码，接受已验证快照后整轮完成。两个隔离 Host 和测试应用均已退出，各自的反向转发已清理。生产 WSS、原 HUKS 身份与现场启动失败仍待真机核验。[整轮及双端摘要](../evidence/workspace-standard-rc248-validation.json)

rc2.48 原生新建整轮使用同一完整桌面归档及独立模拟器 HAP，原生页面只替换测试提供方。选择 `minimal` 和 `worker-model/high` 后创建一个会话，Host 逐条核对四次固定回放及持久化请求中的模型与思考强度，桌面默认模型未变。新会话的回复在标准 Web 中显示，返回后草稿保留。随后从原生设置输入 `dsh-devflow` 打开标准面板，关闭后仍恢复原会话的回复和草稿。八项界面检查通过，真实模型调用为零。隔离 Host 与测试应用已退出，反向转发已移除。[原生新建与插件直达整轮](../evidence/creation-cipher-workspace-rc2-48-validation.json)

独立 Mate 90 Pro Max 模拟器应用 `local.dsh.mobile.workspacecheck` 使用原样的 `NativeWorkspaceOwner.ets` 和 `NativeWorkspaceCache.ets`，两者与真机 rc2.38 构建输入的 SHA-256 相同。API 26 真实 ArkWeb 验证两个清单内零字节 CSS 均触发加载成功、可选 CSS 失败后工作区仍为 `ready`，根文档失败仍为 `failed`；[首次完整通过](../evidence/workspace-resource-arkweb-1793807145855773800.json)包含原生 UI 树与截图。该应用使用本地合成资源提供方，未连接 Host 或中继，没有模型消息，不构成标准插件整轮验收。

反例只在隔离编译目录恢复空正文调用解码器的条件，两份构建的应用输入只差 `NativeWorkspaceCache.ets`。相同 ArkWeb 场景中，两个空 CSS 均失败，页面为 `RESOURCE_PROBE_FAIL`，符合[预期拒绝](../evidence/workspace-resource-arkweb-1793807304444419600.json)；恢复修复版原始 HAP 后，[整轮再次通过](../evidence/workspace-resource-arkweb-1793807423598942100.json)。模拟器应用 UID 20020064 保留，测试应用已停止，模拟器继续运行。前期未声明清单类型的编译失败、首帧 UI 尚未出现和截图扩展名错误均作为测试工具诊断保留，没有计为通过。

## 标准命令认领与提交防护

[真实标准 Web 输入框检查](../evidence/workspace-command-claim-1793809078316.json)使用隔离合成会话和同名测试命令处理器：命令缺失时只检查草稿、不提交；选择实际目录项后，输入框内出现 `data-composer-command="harmony-device"` 且不可编辑的命令标记，参数与完整文本一致，提交后只执行一次命令；已认领命令被卸载后，提交仍按命令报错并保留草稿，不回落到模型。持久化记录为一次 `command/run`、一次 `command/done`、零 `turn/start`，固定回放消耗零次。该检查验证标准输入框和命令分派，不等于实际 Harmony 设备后端、真机或加密通道验收。

[真实 Harmony 源码处理器检查](../evidence/workspace-device-command-ui-1793810824692.json)在同一标准 Web 服务树中隔离 profile 与内存凭据，使用公开合成身份，保留正常命令注册和调用上下文。1 MiB 分块／1 MiB 明文配置在注册前拒绝；512 KiB 配置通过实际界面执行 `status`、`workspace-status` 和 `workspace-stop`，分别返回未绑定、工作区未启用和工作区未启用。三次命令均完成，零模型轮次，卸载后已认领命令仍报命令错误而不回落到模型；合成身份记录未变。该场景没有建立设备绑定或有效工作区授权，不代表活动授权撤销、安装版桌面、DPAPI、加密中继或真机验收。

指定桌面脚本仍禁止普通提交，只有 `-PrepareOnly` 可用：选择唯一标准目录项、核对命令标记和参数后清空自身草稿；没有 Enter 或 `fill`。七组纯函数检查覆盖缺失／错误认领、多输入框、多标记与参数变化，普通调用和不支持的命令在浏览器操作前拒绝，静态插入 Enter 的反例可被检测。检查与脚本指纹见[防护记录](../evidence/workspace-command-preflight-guard-rc238.json)。加入真实处理器场景后，strict TypeScript 6.0.3 检查为 243 模块、0 诊断；当前源码、报告和较早测试搭建失败统一见[真实处理器证据](../evidence/workspace-device-command-ui-closeout-rc238.json)。

日常桌面进行过一次临时草稿预检，未取得终态返回且保存日志为空，不能记为预检通过；未盲目重试。之后只读复核唯一主页面中有一个空输入框，没有继续输入或提交。该观察不证明前一过程的具体分支。阶段记录见[命令认领汇总](../evidence/workspace-command-claim-closeout-rc238.json)；没有操作真机、修改日常配置或重启桌面，手机继续由用户使用。

## 离线提交候选

`handoff/deploy-rc235-20261104/dsh-command-submit-candidate.ps1` 是未启用的旁置候选：默认拒绝执行，预检和提交模式互斥；提交前两次核对实际命令标记与完整参数，并复核输入焦点。只尝试一次 Enter，按键调用失败时报告结果未知，不重试或清理可能已提交的草稿；即使按键调用正常返回，也将命令执行结果标为未观察。

[离线防护结果](../evidence/workspace-command-submit-offline.json)覆盖 12 项提交条件与 7 项参数模式，包括命令标记丢失、参数变化、多输入框、焦点丢失、中英文忙碌状态和按键结果未知。测试只提取候选的参数与防护函数，浏览器适配器由本地替身提供；没有连接浏览器、日常 profile 或手机，也没有模型调用。它不验证真实 CLI 时序、命令执行结果或现场提交，不能取代上一节的标准 Web 检查与下一次真实目录预检。

该离线阶段的活动脚本为禁止提交版，SHA-256 `f4bbd6d3f9d76834afc0a8384868ac62fad9b2bf0f7ef398f968dfcaf64b0c06`；候选当时没有覆盖它；后续启用见[当前部署](#当前日常部署与真机边界)。候选、测试、结果及该阶段文档见[防护封存](../evidence/workspace-command-submit-closeout.json)。手机继续由用户使用，日常配置和桌面进程保持未操作。

## 原生插件目标与重试

原生设置页的可选插件包名复用既有 `workspaceDocumentInit.plugin` 和标准 `pluginNavigation.openBundle`，不维护另一份插件目录，也不要求插件作者提供手机包。留空打开标准列表，指定包名则传给同一工作区；失败重试使用该工作区保留的目标和当前 Session，普通工作区入口不继承目标。字段在已连接、设备模式和工作区可用时显示，受操作忙碌状态约束。

[57 项 SDK 替身检查](../evidence/workspace-native-1793812068289.json)覆盖真实 ETS 所有者、失败后按包名重试和新工作区不继承目标，原生按钮动作快照同步更新。[API 26 构建](../evidence/native-build/2026-11-04T17-04-31-885Z.json)及[独立模拟器专项](../evidence/workspace-plugin-target-native-1793811946950987700.json)通过：实际 `Index.ets`、`NativeWorkspaceOwner.ets` 和 document-start 桥把指定包名与 Session 交给本地展示页，受控页面失败后重试保留两者，空目标和普通工作区目标分别正确。测试应用 `local.dsh.mobile.workspacecheck` UID 20020064 不变且已停止；输入提示已在实际截图检查并缩短，避免截断“留空显示插件列表”。

上述本地资源专项没有运行真实标准插件、Host、绑定、加密中继或模型；较早编译和驱动失败、源码与未签名测试 HAP 见[本地专项封存](../evidence/workspace-plugin-target-closeout.json)。

[标准插件整轮](../evidence/workspace-emulator-1793813894135.json)使用同一实际 Index，通过独立的原生 HTTP loopback 提供方连接隔离源码 Host，加载封存的 `dsh-devflow` 0.3.0-alpha.3 和 Rich 0.2.1-rc.2.harmony.1 标准包。原生输入真实包名后打开标准 DevFlow 设置，保存并重新打开，再返回原生聊天；[原生驱动结果](../evidence/workspace-plugin-target-native-1793813893258953700.json)确认四项操作完成及聊天草稿保留。Host 核对配置由 `direct` 变为 `auto`、会话级模型选择不变、仅有原会话、零 `user/message` 与 `turn/start`；固定四响应预算消耗零次，实际模型调用为零。

重开截图显示“编排：启用”，初始截图为“关闭”，两份实际截图均已查看。UITest 对 HTML 选项均返回未选中，不能据此自动核对所选值；此项采用截图检查与 Host `settingsGet` 结果共同验证，并保留该自动化限制。该源码 Host 场景只验证页面重开，安装版副本的进程重启验证见下文；包文件前后摘要、API 26 [构建](../evidence/native-build/2026-11-04T17-15-24-005Z.json)、截图和驱动诊断统一见[标准插件整轮封存](../evidence/workspace-plugin-host-closeout.json)。

本轮 HTTP loopback 不是生产加密中继或设备授权整轮；独立测试应用 UID 20020064 不变且已停止，临时端口转发已移除，Host 已结束。新增原生入口仍未进入真机 rc2.38，没有访问真机、修改或重启日常桌面。该路径的生产连接与真机验收继续待办。

[安装版副本专项](../evidence/workspace-installed-native-plugin-target-1793817585995-workspace-plugin-target-t2o8pG.json)使用已复制的安装运行时和独立 `workspace-review` profile，通过同一原生 Index 和 HTTP loopback 打开相同三份封存包。原生四项操作通过，Host 核对 DevFlow 全局 `direct` → `auto`、原模型选择不变、仅一个会话、零消息及模型轮次。初始和重开截图分别显示“关闭”与“启用”，均已查看；UITest 仍不暴露所选选项，因此继续结合 Host 配置回读。测试应用 UID 20020064 不变且已停止，转发已移除，Host 正常退出；没有操作日常桌面或真机。

首轮停在安装版“预览版说明”弹窗，没有进入设置，未计通过；驱动现在只在明确识别该对话框时选择其“继续”按钮。记录同时保留两次临时类型检查搭建失败，最终采用既有 `node scripts/check.mjs --integration`，243 个模块严格检查通过；改动的 TypeScript 文件通过 90 条 oxlint 规则，MJS 语法与 Python 编译检查通过。运行时文件、标准包、源码、原生构建、截图、失败与后续通过统一见[安装版副本封存](../evidence/workspace-plugin-installed-closeout.json)，复核 17,257 份运行时文件及三包清单中的全部文件。此结果不覆盖安装版日常设置页、生产加密中继或真机表现。

[进程重启检查](../evidence/workspace-plugin-installed-restart-1793818139010.json)在上述 Host 正常退出后，复用同一隔离 profile、存储和标准 DevFlow 包启动新进程。通过原服务读回全局编排 `auto`、配置 revision 1、原唯一 Session 和 `main` 主模型；没有消息、模型轮次或回放调用。设置文件字节未变，临时 profile 包清单恢复并核对原摘要，新 Host 正常退出。检查不启动模拟器或真机，也不读写日常 profile；临时夹具生成失败与后续成功一并见[重启证据封存](../evidence/workspace-plugin-installed-restart-closeout.json)。

rc2.42 加密专项复用封存的 `Index.ets`、工作区所有者、产品核心和 Web 桥。独立 Mate 90 Pro Max 模拟器以测试凭据完成设备授权和独立工作区授权，经 P-256／AES-GCM 加密通道从原生设置直达标准 `dsh-devflow`。打开、保存、重开与保留原生草稿均通过。Host 读回编排 `direct` → `auto`、原会话及模型选择，用户消息、回放和模型调用均为零。首次运行因夹具的空会话未选中而停在原生列表。后续通过实际设备接口选中该会话，测试应用 UID 保持不变，应用、临时转发与 Host 均已关闭。载体为 loopback HTTP 上的加密帧，HUKS、生产 WSS 与真机待验。[API 26 构建](../evidence/native-build/2026-11-05T06-40-40-093Z.json)及[整轮封存](../evidence/workspace-native-plugin-cipher-validation.json)

封存的界面在打开工作区前显示 `unknown-outcome`。带中继诊断的复验记录了两次原生会话 `follow` 的 `id-conflict`。同一会话重开时，Host 复用原 Peer 的命令缓存，手机新建的会话订阅从相同前缀和序号生成命令 ID。四次选择的回归用例在旧核心只观察到一个不同的 ID。rc2.43 为每个加密连接中的每次会话选择分配独立前缀，保留用户提交请求的去重语义，四次选择产生四个不同的 ID。[旧核心回归](../evidence/device-integration-1793862052261.json)与[修复后回归](../evidence/device-integration-1793862121609.json)

rc2.43 的产品包和模拟器包通过 API 26 编译并复用字节相同的 `ProductCore.js`。隔离整轮再次通过设备授权、标准 DevFlow 直达、保存、重开和原生草稿恢复，Host 诊断无 `id-conflict`，封存的界面无 `unknown-outcome`，模型调用为零。正常产品包已封存，仍为未签名候选。rc2.40 真机工作区失败与本次订阅冲突的关系待真机证据确认。[修复后整轮与产品候选](../evidence/workspace-native-plugin-follow-validation.json)

## rc2.39 未签名产品候选

正常手机 bundle `local.dsh.mobile.offlineproduct` 的 rc2.39 候选使用当前真实 Index、原生工作区所有者和产品提供方，没有模拟器提供方替换。[API 26 产品构建](../evidence/native-build/2026-11-04T17-46-31-641Z.json)通过，编译输入稳定，`ProductCore.js` 与 `PairedCore.js` 的原生 util／URL 默认导入核对通过。候选与已签装 rc2.38 的产品核心、配对核心、富交互脚本和设备配置逐字节一致；原生工程只差版本号、Index、工作区目标读取方法和两条界面文案，其余 80 个原生工程文件相同。

[载荷比较](../evidence/device-native-rc239-payload.json)以 rc2.38 已验签输入及安装收据为基线：HAP 文件集合仍为 25 项，20 项逐字节不变，变化位于版本元数据、资源表、编译模块和源码映射。新增文案使启动背景颜色的编译资源编号变化；两版 SDK 资源映射均指向同名、同源码的颜色，除版本与这一已核对编号外，模块描述相同。权限仍只有 INTERNET。未签名 HAP SHA-256 为 `6d016994da6091f0547c7e579f378033fe56f0b9a7d3f1d481fc068dc5525e64`；产物、原始输入快照、差异及相关验收链接见[候选封存](../evidence/device-native-rc239-candidate.json)。

未签名构建阶段没有使用签名材料、安装或启动候选，也没有访问真机或日常 profile；此构建不构成手机验收。部署 helper 仅将已知安装前版本加入 rc2.38，版本码与 UID 校验保留；[离线 AST 核对](../evidence/device-native-rc239-install-preparation.json)没有导入或执行该 helper。它在启动时会枚举设备，手机由用户使用期间仍不得运行。独立签名产物见下节，现场步骤仍按[当前日常部署与真机边界](#当前日常部署与真机边界)协调。

## rc2.39 签名候选

[离线签名记录](../handoff/deploy-rc235-20261104/sign-journal-rc2-39.json)以已封存未签名 HAP 为输入，复用原 DevEco 签名材料；官方 `verify-app`、`verify-profile` 和原 profile 字节匹配均通过。证书链 SHA-256 仍为 `83cccc2f34814563cc606e36f8e78b67273a33265fcc2cd56843627d30d46bd9`，没有再生成材料或保留原始 signer 输出。签名 HAP 为 7,483,840 字节，SHA-256 `0c390816b5cdc599a3c870f119a3eac00e4d497ca6e55b3d7d4eaba15a25c0d4`。

[签后载荷核对](../evidence/device-native-rc239-signed-payload.json)确认全部 25 项原始文件解压后逐字节和 SHA-256 相同，签后仅多出官方 SDK 生成的 `.pages.info`；bundle、版本和版本码仍是 `local.dsh.mobile.offlineproduct`、rc2.39、2。原始构建、签名与验签结果、受控比较及产物摘要统一见[签名候选封存](../evidence/device-native-rc239-signed-candidate.json)。本阶段没有安装、启动手机应用、访问真机或日常 profile；已询问用户下一次手机可用窗口，未把等待或签名完成记作设备验收。
