# 标准插件工作区实现与离线验证

本实现推进[标准插件规划](standard-plugin-workspace-plan.md)中的同包工作区。原版 DSH Web 客户端从上游翻译插件包加载界面，以独立设备 Peer 通过标准 Gateway 读取并保存设置；资源、二进制和流通过有容量限制的 JSON 分块传输。原生设备协议已接入相同请求词汇，并在内存中继上验证真实 P-256 / AES-GCM 加密往返。离线测试使用临时 profile、固定测试密钥和合成数据；安装运行时副本、独立模拟器和真机结果见[交付审查](workspace-review.md)。

## 运行与证据

在手机项目目录执行。

```powershell
node scripts/check-workspace.mjs
node scripts/check-workspace.mjs --wire
node scripts/check-workspace.mjs --access
node scripts/check-workspace.mjs --creation
node scripts/check-workspace.mjs --devflow-candidate
node scripts/check-workspace.mjs --devflow-run
node scripts/check-workspace.mjs --graph
node scripts/check-workspace.mjs --panel
node scripts/check-workspace.mjs --panel-list
node scripts/build-workspace-rich.mjs
node scripts/check-workspace.mjs --rich-source
node scripts/check-workspace.mjs --rich
node scripts/check-workspace.mjs --rich-review
node scripts/check-workspace.mjs --devflow-review
node scripts/check-workspace.mjs --cache
node scripts/check-workspace-native.mjs
node scripts/check.mjs --integration
```

检查器为每轮创建独立的 `.build/workspace-*`，记录 Vitest 结果、失败诊断或 390 像素宽的截图，并将汇总写入独占命名的 `evidence/workspace-*.json`。被验证插件的清单、补丁及前后端产物记录 SHA-256，运行前后保持一致才判为通过。官方翻译插件保持原包。Harmony 浏览器面使用源码构建，测试中的被动 Host 仅用于激活该客户端；设备 Host 授权另由真实服务组合检查。

实际路径是翻译插件原配置页 → 标准 `settings/mutate` → 原 Host 设置 → 翻译插件 `cotTranslation/limits` 回读。保存目标语言后，测试核对桌面生效值，并验证界面在指定宽度未产生整页横向溢出。底层翻译服务没有发送文本，也没有模型请求。

[实际文档 Web 验证](../evidence/workspace-prototype-1793684700443.json)使用 HAP 中的同一份 document-start 脚本及 MessagePort 协议，在页面加载完成后绑定端口。通过现有 `uiWorkspace` 与 `uiSession` 服务交接 Session，不写客户端内部存储键；目录就绪前不会提前打开未知 Session。[传输测试](../evidence/workspace-wire-1793686050665.json)覆盖 300,000 字节二进制、250,000 字节流内容、双向顺序、容量、错序句柄、撤销及显式启动准备。[设备授权测试](../evidence/workspace-access-1793684699088.json)覆盖原签名票据、真实加密原生设备协议、独立授权、撤销后重授权、关闭再打开，以及原生会话目录继续可用。此测试显式读取已构建的标准 Session Controller wire 描述，记录指纹，并运行当前源码服务；Web 样例需要已有 Web 与标准插件产物。

原生“新建任务”支持类型、主模型和思考强度。选项来自当前桌面的 preset 与模型目录，明确选模使用已有 Session 版本比较操作并保留部署默认。旧桌面不支持选项查询时，页面明确提供按桌面默认创建。创建结果不明时，原弹层停止提交。关闭弹层后可刷新列表，查看目标项目中新出现的空白会话。页面保留不确定提示，候选行可能来自同时发生的其他创建。桌面服务回读已验证 preset、选模及零模型 turn。模拟器验收与测试数据限制见[交付审查](workspace-review.md)，回执丢失后的恢复验证见[验收记录](acceptance.md)。

新建与工作区往返专项用 `node scripts/prepare-creation-native-review.mjs --cipher` 准备实际 Index 测试工程，构建目标为 `.build/native-controls-creation-cipher-review`。在独立模拟器原位安装测试 HAP 后，以 `node scripts/prepare-workspace-installed-probe.mjs --combined=native-cipher-creation-workspace` 启动本轮 Host，再运行 `node scripts/accept-workspace-emulator.mjs`。驱动核对四次原生回放后的最后一条回复出现在标准 Web，再核对返回原生会话后的回复、草稿和错误提示。使用 `scripts/qualify-creation-cipher.mjs` 按顺序传入 Host、模拟器构建、模拟器安装和正常产品构建四份回执，核对产品源码及两包的共享输入。

原生工作区入口、返回聊天及草稿保留已接源码。原生 owner 先显式 bootstrap 并校验壳层清单，再启动页面；同一连接关闭后重开可建立新的工作区代次。虚拟 HTTPS 来源按原桌面公钥指纹分区。资源下载使用独立并发和有限排队，工作区 RPC 与原生目录请求各保留容量。Host 在实际读取前按 `wire.maxBodyBytes` 预留容量，有限排队等待已返回资源被读取或释放；[九项传输检查](../evidence/workspace-wire-1793693619415.json)包括并发读取、排队取消和插件事件清理。

电脑端缺少有效工作区授权时，在创建工作区 Peer 前拒绝请求。已配对手机收到 `workspace-grant-required` 后留在原生聊天，保留草稿和富内容，并提示在电脑端「设置 → 插件 → 手机连接」确认授权。启动超时使用单独提示。工作区启动日志记录固定阶段和错误类别。

原生静态缓存使用本进程内的有限 LRU，不写入持久存储。每次打开都先重新确认授权，读取壳层与标准 Client Modules 初始批量脚本的长度和 SHA-256 清单；生成清单时插件图变化会拒绝本次准备。桌面身份变化时清空缓存，同一桌面仅保留新清单仍确认的相同内容。配置为 `core.workspace.cache.maxEntries/maxBytes`，预算按保存的响应 JSON 字节计算。启动 HTML、API 返回不缓存；插件使用原来的带版本 URL，不增加手机专用打包格式。进程重启仍是冷启动。[缓存与限速回归](../evidence/workspace-prototype-1793701524870.json)执行实际 ETS 缓存、标准客户端及原翻译插件，替身 SDK 下热打开复用了 8 个资源；原始数据及测量范围见[测量记录](workspace-measurement.md)。

原生工作区与 rich Web 使用多渲染进程模式、各自的原生 token 和 `FAST_MODE` Web 销毁。关闭时撤销端口、移除所属 Web 并等待控制器 `UNATTACHED`，再释放桌面工作区；未确认卸载会保留清理失败。异常渲染退出不能代替卸载确认，也不对共享进程调用终止。重试创建新 Web，旧控件的回调不能影响替代控件；正常卸载回调不撤销后继启动，后台关闭则明确使在途启动失效。[54 项原生源码检查](../evidence/workspace-native-1793715061648.json)覆盖这些路径和缓存。实际模拟器证据与进程保证的限制见[交付审查](workspace-review.md)。

原生设置页的“插件设置”复用同一工作区；可选包名留空时打开标准插件列表，填写时定位对应包。界面只接收至多 256 个字符，打开前去除两端空白，不主动弹出键盘；工作区重试保留目标包与当前 Session，普通工作区入口重新打开时不继承插件目标。[列表入口](../evidence/workspace-panel-1793694973991.json)与[按包名定向配置页](../evidence/workspace-panel-1793694721113.json)分别提供标准 Web 证据，当前原生界面专项见[原生插件目标与重试](workspace-review.md#原生插件目标与重试)。包名通过公开启动参数交给既有 `pluginNavigation`，没有插件名称专用分支；原生聊天草稿和 Session 归属保留。打开 Session 会同步发布目录变化，导航消费者在本次选择完成前不会让重入回调提前消费插件目标。

DevFlow 原包的界面可以加载，但其 v2 Remote 自身要求精确 owner browserPeer，标准设备授权仍会被拒绝。隔离候选使用现有 `remoteAccess.decide/allows`，要求方法的全局权限和目标 Session 权限，并过滤返回的目标列表；没有手机专用 Remote，也未改原客户端。六项实际 Gateway 测试覆盖无权限、其他 Session、伪造 Peer、owner 保留和读取中撤销。[候选原界面验证](../evidence/workspace-devflow-candidate-1793694983825.json)通过全局 auto、模型档案、代码用途模型与 high 思考强度、会话 direct、主模型不变，以及桌面并发修改后的冲突拒绝和草稿保留。源码候选位于 `.build/workspace-devflow-checkout`，没有替换日常插件仓库或安装包。仅限 owner 的其他插件也需要声明并实现相应的标准远程权限，手机承载层不能自动绕过这一要求。

[DevFlow 执行回放](../evidence/workspace-devflow-run-1793697050529.json)通过原界面配置和标准 `/api/session/prompt`：direct 回合不暴露委派工具，auto 回合完成 code/readonly 子任务，子任务使用 `worker/high`，父任务仍为 `main`；持久化的子任务请求头也记录相同模型和思考强度。场景严格消费四条固定响应，真实模型调用为零，没有代码执行或文件修改。

## 同包富交互承载

富交互候选在原包中增加可选的 native view 承载方法；桌面仍使用原 `webview`，Host 产物保持原字节。手机工作区卡片通过这一通用方法显示打开按钮，用户点击后由原生所有者启动另一份禁止网络、文件、存储及权限请求的 Web。生成内容位于不含 `allow-same-origin` 的独立 frame，运行原包 `guestSdk`，没有工作区 API 端口。此能力通过同一安装包选择承载，不引入手机专用插件格式。

返回先请求原 SDK 保存草稿并确认完成，确认失败时保留输入与页面，用户可明确放弃后退出。后台或工作区强制关闭退役全部 guest 端口并等待渲染退出。标准控制器处理完成后才确认一条上行消息，生成页面的待确认数量和字节均受原生配置限制；生成页面不能伪造 `native.*` 控制消息。[同包链路检查](../evidence/workspace-rich-1793700514411.json)执行实际 HAP 文档脚本、ETS 所有者、标准 Rich 控制器、原 Host 和原 SDK，验证最后一次输入保存到正确的 Host 草稿、动作接受回执与完成状态分离、未结算动作保持 `outcome_unknown` 且查询不重发，以及队列超限后的清理。场景由四条固定回放生成表单并执行两个动作，真实模型调用为零。渲染端由 Chromium 替代 ArkWeb，因此不构成鸿蒙网络隔离或设备交互验收。

Rich 和 DevFlow 的[源码候选清单](../handoff/standard-plugin-workspace/source-candidates-3WTmmr/manifest.json)（Rich `0.2.1-rc.2.harmony.1` 10 个文件，DevFlow `0.3.0-alpha.3` 7 个文件）保留 Git 基点、原始 blob 与候选文件 SHA-256，位于临时构建目录之外。较早的[含 Connection 的清单](../handoff/standard-plugin-workspace/source-candidates-Mj0CfY/manifest.json)仅作历史：Connection 候选已作废，手机端对 `navigator.onLine` 误报的处理改在工作区壳层。候选已合回原仓库（DevFlow 在 `dsh_plugins`，Rich 在主仓 `lumina` 并镜像到 `dsh_plugins` 的 Rich 工作区），源码仅本地提交，尚未推送或发布；私人封装已按授权安装到日常 profile，见[合回原仓库与真机检查](workspace-review.md#合回原仓库与真机检查)。

[三包基线审阅包](../handoff/standard-plugin-workspace/review-qLSwu7/manifest.json)包含 Harmony `0.0.0-rc2.35`、Rich、DevFlow 三个标准 npm 格式 `.tgz` 候选及默认关闭的 [API26 未签名产品 HAP](../evidence/native-build/2026-11-04T03-51-33-501Z.json)（SHA-256 `3472d68320357639efe70801c511c8b5935d65b42c6fb3dc381dcb263e273e77`）。较早的[四包审阅包](../handoff/standard-plugin-workspace/review-ZMiIAK/manifest.json)作为历史保留。包内依赖的 `workspace:` 范围按实际本地包版本展开，归档解包后逐文件摘要一致；桌面候选携带固定的标准 Web 壳层和工作区配置示例。版本保留源码版本，属于私人审阅物。安装运行时副本和独立测试 HAP 的有限验收见[交付审查](workspace-review.md)，不等同于真机验收；日常包后续修复和安装记录见[当前部署](workspace-review.md#当前日常部署与真机边界)。

[历史审阅归档](../handoff/standard-plugin-workspace/review-R7Lrf7/manifest.json)解包后的 [Rich 动作回归](../evidence/workspace-rich-1793701236047.json)与 [DevFlow 工作流回归](../evidence/workspace-devflow-run-1793701324945.json)分别通过，均严格四条离线响应。记录关联对应 `.tgz` 的 SHA-256 和完整文件清单，依赖 junction 只存在于临时测试目录。[加密恢复回归](../evidence/workspace-access-1793701391927.json)另验证关闭并重建原生与桌面连接后取得新证明，旧资源句柄不能在新工作区读取，原生目录仍可用；底层 socket 仍是内存替身。当前候选的后续验收见[交付审查](workspace-review.md)。

## 身份和清理

`WorkspaceChannel` 是 Host 侧承载适配器。调用方提供独立授权的 Peer、撤销信号和重新校验函数，配置允许的 HTTPS 虚拟来源、请求和响应容量。它按原设备身份将 API 请求交给 Connection 的共享 Fetch 处理器，将订阅交给标准 Gateway 的流处理器，将插件资源交给 Client Modules。启动表通过标准 `webserver/index-inject` 事件收集，访问快照替换成设备自己的快照；该事件不依赖 HTTP 服务，桌面 IPC profile 无需为工作区另开监听端口。

共享处理器对没有注册的 `/api/` 路径返回 404 `not found`，对 owner 专用 Fetch 路由返回 403 `forbidden`。`WorkspaceChannel` 为这两种完整匹配的响应保留状态码，加 `x-dsh-workspace-route` 头，并在允许正文时返回 `workspace-route-unavailable` JSON。功能自己的错误主体原样透传。`HEAD` 只传状态和响应头，204、205、304 的 Fetch 响应正文为 `null`。`ctx.webServer.register` 前缀路由由桌面 Web Server 服务。壳层 `window.fetch` 收到诊断头时输出 `console.warn` 并派发 `harmony:workspace:route-unavailable` 事件。`integration/workspace.spec.ts` 核对两种拒绝原因及无正文响应。

标准客户端的 Connection 读取 `navigator.onLine` 并监听 `online`／`offline`；模拟器 ArkWeb 在原生通道可达时误报离线。工作区壳层（`src/workspace-document.ts`）把 `navigator.onLine` 覆盖为“载体已初始化且未停止”，在 capture 阶段拦截可信（`isTrusted`）的平台事件，并在载体初始化完成和关闭时自行派发事件，因此 Connection 不需要修改。`integration/workspace-rich.spec.ts` 的第三个测试用 Chromium 的 `setOffline` 制造平台事件，验证载体状态而非平台状态决定结果；对照运行为[负例失败](../evidence/workspace-rich-1793760108120.json)和[正例通过](../evidence/workspace-rich-1793760223341.json)。真机行为没有验证。

测试给设备显式授予本轮已注册的全局操作和一个 Session 的操作。它验证另一个 Session 的修改被 Gateway 拒绝、外部来源被拒绝、超大请求被拒绝、owner Peer 被构造器拒绝，以及撤销发生在资源读取过程中时迟到资源被丢弃。请求被桌面接收后再失去授权，调用方仍需把未确认的写入视为结果未知，不能自动重放。

标准客户端启动依赖 `$events` 的就绪帧，因此工作区 Peer 开启事件参与。Gateway 对非 owner 继续禁止回答 waterfall；原手机有限操作 Peer 的 `interactions: none` 不复用为完整客户端。Web 样例给一个 Session 授权；产品的可选 `DeviceWorkspaceAccess` 使用独立的 `harmony-workspace` 身份，只在桌面本地确认后授予有限时间的 profile 范围标准 API、全局配置及可见 Session/项目权限。新增 Session 和标准插件的方法在请求前刷新。它不能承诺把第三方插件的全局返回值自动裁剪为单个会话。

同一工作区 Peer 的目录读取按顺序执行。读取开始前已等候的检查共用结果，读取开始后才到的检查使用下一轮结果。每轮读取前后校验工作区授权和加密连接，标准 API 和插件图继续按各自的入口刷新权限。

工作区部署配置默认缺省，设备注册后仍需单独授权。`/harmony-device workspace-status` 与 `/harmony-device workspace-stop` 只操作内存授权。`/harmony-device workspace-allow` 在可能打开桌面身份前，先请求本地确认并说明全局配置和路径的访问范围。授权不持久化，Host 重启或到期后需重新允许。原生端只转发严格解析的工作区消息，独立跟踪并取消待处理请求；模型生成的 rich guest 仍只有原 scoped rich 端口。桌面插件设置页已接三个显式按钮，[26 项面板检查](../evidence/control-panel-0.0.0-rc2.33-1793685007384.json)通过；安装版设置入口和交互验收尚待完成。

原生启动等待原连接完成工作区准备。连接断开或替换时取消准备并保留原生页，过期的启动结果不能挂载 Web。已打开的工作区在渲染器关闭后回到原生列表。

## 尚需接入

- 浏览器原型的资源拦截由测试驱动提供；独立模拟器另已使用实际 ArkWeb 端口执行标准客户端，详见[交付审查](workspace-review.md)。加密验证使用真实 native device core、broker、房间与加密实现，底层 socket 为内存实现；加密原生载体和公网中继尚未验收。
- 标准 HMR 浏览器面经现有工作区流接收 Client Modules 的原 graph/rebuilt 帧，事件队列有字节上限，超限或撤销时释放两个订阅。[插件图检查](../evidence/workspace-graph-1793694985806.json)验证原翻译插件停用后配置消失、启用后恢复并保留设置，以及隔离导航插件产物变更后的实际重载与撤销收尾。失败 reader 的原始终止不会被重复取消误判为清理失败。
- 精确 Fetch 路由及交互式 waterfall 保持标准 Gateway 对非 owner 的限制，文件和审批操作需要各自验证。
- DevFlow 执行、Rich 动作回执和限速诊断已有离线结果；独立模拟器的页面与后台恢复已有双端结果。独立第三方固定发布物 `@michengai/dsh-skills-manager` 1.2.11 已完成标准 CLI 安装和宿主加载，但其 webServer 前缀路由对设备 Peer 返回 404，手机界面未验（见[交付审查](workspace-review.md#标准-cli-安装与第三方发布物)）；小屏与完整键盘、公网恢复及内存仍待验收。

公开第三方候选仍须审查固定发布物和当前 API。[Token Usage 的 manifest](https://github.com/samecorner/dsh-token-usage/blob/main/package.json)使用较旧的 DSH `0.1.0-rc.6` 开发依赖；[Balance Pill](https://github.com/azkbzxf/dsh-account-balance-pill)作者称已验证客户端 `0.2.1-rc.2`，但尚未取得固定版本和完整入口正文。本轮只有公开只读研究，采用无历史研究代理的行为约束，没有强制工具隔离；没有执行第三方包，也不将作者说明当作兼容验收。

另一个标准 Web 候选 dsh-nested-followups 的[研究记录](../evidence/workspace-thirdparty-candidate-20261104.json)保留可变清单、声明版本与访问限制。研究工具未取得 npm 固定版本或不可变提交正文，缺少发布物指纹和入口副作用审查；尚未安装或执行，不计为第三方兼容通过。

仓库 host/client `build:check` 及 Markdown 换行、相对链接、桌面 README 双语配对检查已通过。完整 `doc-sync` 尚未运行成功：直接调用缺少 pnpm 生命周期的 `npm_execpath`，本机 pnpm 包装器另有版本选择限制。以上检查不替代完整文档门禁。

## 空正文与资源失败

原生工作区通过 `DSH_WORKSPACE_LOAD stage=...` 记录当前文档的首个失败阶段。主文档 HTTP 失败与传输失败分别记录 `document-response`、`document-transfer`。文档端区分渲染器启动、导航、原生回复、脚本错误和未处理 Promise 拒绝。端口只接收预定义阶段值，日志仅包含阶段。关闭及重试由原生所有者处理。

ArkWeb 控制器启动和消息端口交接的同步异常分别记录 `controller-attach` 和 `port-bind`。原生所有者关闭尚未移交的端口并移除失败的 Web 组件。界面保留失败和重试入口，已确认清理后可按原会话和插件目标重开。原生清理未确认时仍拒绝重开。

应用启动时，渲染隔离配置或工作区脚本校验失败会记录 `native-init`。原生会话仍可打开。用户点工作区时在原生页面看到错误提示，应用在请求 Host 工作区之前拒绝该次打开。

现场采集的 `workspaceLoadFailures` 保留当前应用进程最近 64 条受认可的加载阶段和日志时间。它和 RPC 失败、连接事件分别记录。采集前后进程变化时拒绝写出结果，原始 HiLog 不写入验收记录。

标准 Web 启动的隔离诊断使用 `node scripts/check-workspace.mjs --rich-admission`：同一标准 Rich／DevFlow 包经实际 `DeviceWorkspaceAccess` 授权提供方启动，目录补足为 313 条合成可见会话，载体显式模拟 1.36 秒往返，单次普通请求仍受 10 秒预算约束。该模式使用 Chromium 和测试端口，不访问真机或日常 profile，也不模拟 313 个真实会话文件的扫描或验证生产 HUKS／WSS；结果应按目录、磁盘、浏览器和通信层分别解读。

启动状态对照使用 `node scripts/prepare-workspace-native-review.mjs --cipher-diagnostic` 准备独立测试工程，编译目标为 `.build/native-controls-cipher-diagnostic-boot-review`。将已核对的测试包装到独立模拟器后，用 `node scripts/prepare-workspace-installed-probe.mjs --combined=native-cipher-rich --rpc-diagnostics` 启动隔离 Host，再运行 `node scripts/accept-workspace-emulator.mjs`。驱动验证 Rich 外观请求被拒绝、超时和取消，以及去掉故障后的正常重开。[对照记录](../evidence/workspace-native-rpc-diagnostics-validation.json)

使用同一测试包回归正常 DevFlow 流程时，隔离 Host 的参数改为 `--combined=native-cipher-devflow --boot-review`。驱动保存模型与思考强度，重开同一会话，核对只读委派的实际路由和持久化请求。[DevFlow 原生回归](../evidence/workspace-native-boot-review-validation.json)

官方推理翻译原包的对照使用 `--combined=native-cipher-official --boot-review`。隔离 Host 从安装版副本加载三个原包，连接本地固定翻译端点。驱动验证设置保存、会话内原文和译文切换、设置重开及 Rich 共存。[官方原包回归](../evidence/workspace-native-official-boot-validation.json)

当前候选回归在准备测试工程时使用 `--cipher-diagnostic --exact-product-core`，封存时向 `node scripts/qualify-workspace-official.mjs --boot-review` 依次传入 Host、模拟器构建、模拟器安装和正常产品构建回执。封存核对两包的产品核心、Rich 所有者、原生加密实现与 Web 桥，并核对三份官方包原文件。[当前候选回归](../evidence/workspace-native-official-current-validation.json)

完整桌面候选用 `node scripts/seal-workspace-desktop-candidate.mjs` 封存，并以 `node scripts/check-workspace-plugin-install.mjs --complete-desktop` 核对私有 profile 的标准 CLI 安装。打包中继复验在 `--combined=native-cipher-official --boot-review` 后加 `--packaged-desktop`，仍使用同一模拟器 HAP 和封存命令。归档中的设备入口保留原字节，隔离夹具只在副本追加命名导出。[打包中继整轮](../evidence/workspace-native-official-packaged-validation.json)

同一 HAP 的 DevFlow 回归完成后，使用 `node scripts/qualify-workspace-cipher.mjs --boot-review --build=<构建回执> --install=<安装回执> <Host回执>` 封存。当前候选保留实际 Host 夹具、界面树和只读委派配置回读。[当前 DevFlow 回归](../evidence/workspace-native-boot-current-validation.json)

需要同时验证加密 RPC 时用 `--rich-admission-cipher`。实际 ArkWeb 对照用 `node scripts/prepare-workspace-installed-probe.mjs --combined=native-cipher-rich --admission` 启动隔离 Host，再运行 `node scripts/accept-workspace-emulator.mjs`。先从当前产品配置重建原生测试工程，构建并核对安装到独立模拟器的 `workspacecheck` HAP。验收驱动按目标创建并回收自己拥有的反向转发。`--admission-disk` 用预先写入隔离目录的 312 个仅含头部的 JSONL 和一个固定回放 Session 代替补齐目录。`--admission-disk-latency` 在同样的磁盘负载上给加密数据帧每方向增加 680 毫秒固定延迟，沿用应用原有的 10 秒单次请求时限。`--admission-disk-field` 进一步对齐日常桌面已知的加密及工作区请求容量。磁盘模式用于 Rich 对照。[交付审查](workspace-review.md#隔离补充验收)

标准资源返回 200 且正文为空时，原生所有者使用空 `ArrayBuffer` 回答，缓存跳过该资源。若清单声明该资源非空，长度校验会拒绝空响应。单个资源请求失败只让该响应返回 502；根文档失败仍把工作区标记失败。关闭和切换代际继续取消原请求。ETS 所有者替身覆盖真实空资源、错误空响应、后续正确响应进入缓存、可选资源失败后继续就绪与根文档失败。[原生替身回归](../evidence/workspace-native-1794149101505.json)

分块上限同时受协议、Base64 编码后加密明文容量和请求容量约束。1 MiB 明文上限下，1 MiB 原始分块会在加载时被拒绝；512 KiB 分块的标准命令注册、授权与撤销已通过[隔离整轮](../evidence/workspace-device-command-1793804694036.json)，无效配置反例同轮被拒绝。手机接收上限可以大于桌面实际发送上限；不为提速放宽加密或握手限制。日常配置已使用 512 KiB，现场启动失败见[当前部署](workspace-review.md#当前日常部署与真机边界)。

原生资源专项由 `scripts/prepare-workspace-native-review.mjs --resources` 生成独立 `native-controls-resource-review`，API 26 构建后由 `scripts/accept-workspace-resources.py` 读取明确的构建收据进行验收。提供方只返回本地静态资源，不使用 HTTP、设备身份或模型；ArkWeb 的样式表实际加载事件和原生所有者状态分别受检。正／反例 HAP、构建输入、UI 树、截图及恢复记录见[隔离补充验收](workspace-review.md#隔离补充验收)。

命令输入兼容检查使用 `scripts/check-workspace.mjs --command-claim`，在标准 Web 实际输入框核对命令目录、不可编辑认领标记和卸载后的命令错误；`--device-command-ui` 接入真实 Harmony 源码处理器，使用同树隔离的 profile 与内存凭据。两种隔离场景与日常无提交脚本的范围见[标准命令认领与提交防护](workspace-review.md#标准命令认领与提交防护)。

提交候选的离线检查仅提取 PowerShell 防护函数并替换浏览器适配器，覆盖命令标记、参数、焦点、忙碌与结果未知分支；后续真实认领预检通过后，指定脚本已启用显式受限提交；范围见[当前部署](workspace-review.md#当前日常部署与真机边界)，离线检查本身不授予任何现场权限。

原生插件目标专项使用 `node scripts/prepare-creation-native-review.mjs --plugin-target` 准备独立的实际 Index，再以 `node scripts/build-native.mjs --project=.build/native-controls-plugin-review` 编译。将本次构建输出的 `evidence` 路径作为 `python -X utf8 scripts/accept-workspace-plugin-target.py --build` 的参数；驱动仅允许明确的模拟器地址和独立应用，核对 HAP 摘要后原位安装，结束时停止测试应用。它使用本地展示页，不启动标准 Host 或模型。

真实标准面板专项改用 `--plugin-target-host` 准备及 `.build/native-controls-plugin-host-review` 构建。启动 `node scripts/check-workspace.mjs --emulator-plugin-target` 后，等待本次 `workspace-emulator-active.json` 发布，再给上述 Python 驱动加 `--host` 并传入本次构建回执。Host 仅监听随机分配的 loopback 端口，原生驱动只创建并移除该端口对应的模拟器反向转发；它保存与重开标准 DevFlow 设置、检查原生草稿，Host 核对生效配置和零模型轮次。四响应回放预算保留但不消耗。该模式使用标准 HTTP 载体，结果与限制见[原生插件目标与重试](workspace-review.md#原生插件目标与重试)。

同一测试 HAP 可用 `node scripts/prepare-workspace-installed-probe.mjs --combined=native-plugin-target` 验证已复制安装运行时，仍等本次活动记录后执行相同原生驱动。它只创建独立 profile，按标准 `dsh` 入口启动；标准包前后指纹、Host 配置与零模型轮次受检。驱动会识别安装版首次预览说明，仅在该对话框选择“继续”。该检查已执行通过，不证明日常 profile 或生产设备连接，详见[安装版副本结果](workspace-review.md#原生插件目标与重试)。

加密专项使用 `node scripts/prepare-creation-native-review.mjs --plugin-target-cipher` 和 `node scripts/build-native.mjs --project=.build/native-controls-plugin-cipher-review`。运行 `node scripts/prepare-workspace-installed-probe.mjs --combined=native-cipher-plugin-target` 后，等本次活动记录发布，再运行 `python -X utf8 scripts/accept-workspace-plugin-target.py --cipher --build <构建回执>`。两端退出后，以 `node scripts/qualify-workspace-cipher.mjs --plugin-target --build=<构建回执> <Host回执>` 封存。该模式核对 rc2.42 的原生页面和工作区源码指纹，经独立测试凭据和加密帧访问安装版副本。驱动核对会话、标准设置、原生草稿、应用停止和转发移除。[已执行结果](workspace-review.md#原生插件目标与重试)

验证 rc2.43 时先用 `node scripts/prepare-device-native.mjs --version 0.0.0-rc2.43` 准备正常产品候选，再以 `node scripts/build-native.mjs --project=.build/native-controls-device-rc2-43` 编译。准备加密模拟器专项时加 `--product-core-from=evidence/device-native-project-rc2.43.json`，封存时加 `--device-build=<产品构建回执>`。封存核对两包的核心字节、Host 诊断与原生界面，拒绝订阅失败或 `unknown-outcome`。两个安装包均随回执保存。[rc2.43 证据](../evidence/workspace-native-plugin-follow-validation.json)

进程重启专项复用上述已退出 Host 的独立 home 和存储，仅把临时验收 bundle 替换为只读设置／会话检查器，再经 `dsh` profile 启动。结束后恢复包清单原字节，核对设置文件未变及新进程退出；所读编排配置、会话、主模型和零模型轮次见[已执行结果](workspace-review.md#原生插件目标与重试)。该检查没有重新打开原生应用。

正常手机候选由 `node scripts/prepare-device-native.mjs --version 0.0.0-rc2.39` 在独占目录捕获原生与共享源码快照，再由 `node scripts/build-native.mjs --project=.build/native-controls-device-rc2-39` 编译。准备命令拒绝覆盖已有目录；需要重建时先核对既有 manifest，不删除或复用未知输入。它不替换产品提供方、不签名或安装，产物与边界见[rc2.39 候选](workspace-review.md#rc239-未签名产品候选)。

签名采用既有 `handoff/deploy-rc235-20261104/sign.mjs`，只使用已批准的原材料与明确的候选输入；已有输出会拒绝覆盖。官方 app／profile 验签、原 profile 和证书链匹配后，`payload.py rc2-39` 核对原始文件集合，并额外执行解压字节与 SHA-256 比较。签名日志仅记录公开摘要，不复制 keystore、密码或验出的 profile 明文；[rc2.39 已执行结果](workspace-review.md#rc239-签名候选)不需要再次签名。`phone.py` 会枚举设备，仅可在用户提供的手机窗口运行；本次现场已结束，不再访问手机。
