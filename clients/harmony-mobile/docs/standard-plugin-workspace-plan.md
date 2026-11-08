# 鸿蒙端标准 DSH 插件兼容工作区规划

本规划面向手机端、桌面连接插件及插件作者。用户在电脑安装并启用一个标准 DSH 包后，应能在手机使用它提供的 Web 界面，在对应的桌面工作区完成操作。首批场景是新建任务时选择会话类型和主模型、调整 DevFlow 工作流与委派模型，以及填写会话内的富交互表单。当前进度与验证边界见[工作区实现](workspace-prototype.md)。

## 用户路径和兼容范围

手机原生首页保留配对、连接和已有会话入口。用户可以从当前会话打开“完整工作区”，也可以在完整工作区新建任务。两种入口都绑定具体的桌面、profile、工作区和 Session。切换前处理尚未发送的草稿，保留输入的归属，避免两个页面同时提交。回到原生页时从电脑重新读取状态。

| 同一个桌面安装包里有什么 | 手机预期行为 |
| --- | --- |
| 只提供 Host 工具、模型或工作流 | 在电脑原会话执行，手机沿用标准会话结果。 |
| 提供标准 Web 客户端入口并使用 DSH Slots、Remote、事件 | 在工作区载入原包的前端及其依赖，在原插槽展示，操作受该设备授权约束。作者无需添加手机声明。 |
| 使用浏览器兼容的前端，但布局依赖大屏或鼠标 | 先验证主要操作能否触达；壳层负责窄屏导航、键盘和返回。插件可在同一包中增加响应式样式。 |
| 前端依赖 Electron 的原生能力 | 按具体能力接入鸿蒙承载或显示插件已有的回退。富交互是首个需要原生承载的例子。 |

将“原包被发现”“原界面能交互”“操作在正确桌面会话生效”“在真机小屏可用”分别验收。仅加载设置页无法覆盖在消息、输入框或会话详情注册的贡献。

## dsh-Go 的三条界面路径

本节依据同一版 Android 客户端、Dart 客户端库及 Host 桥接的源码。链接固定在所查版本。以下属于静态核查，三种主机模式的实际设备表现仍需各自测量。

| 路径 | 源码中的实现 | 对标准包的意义 |
| --- | --- | --- |
| Flutter 原生呈现 | `DshClient` 通过标准 Session RPC、mux 流和事件驱动聊天；普通工具结果有通用详情，部分设置可从标准 schema 生成表单。插件还可以通过 `dsh-go/view` 提供专用工具卡，或经 Host 的 `dshGo` 扩展提供实时面板、状态条和动作。 | 普通工具和已有标准数据自带基础呈现。专用卡片或面板需要相应的插件贡献。[Dart 客户端](https://github.com/ccch1mneyyy/dsh-Go/tree/0ccd26ab475a8477d148dc62b43a0b8267e56aa8/packages/dsh_client/lib/src) · [工具结果](https://github.com/ccch1mneyyy/dsh-Go/blob/0ccd26ab475a8477d148dc62b43a0b8267e56aa8/app/lib/ui/chat/widgets/tool_row.dart) · [专用桥接](https://github.com/ccch1mneyyy/dsh-Go/tree/0ccd26ab475a8477d148dc62b43a0b8267e56aa8/runtime/bridge/dsh-go-bridge/lib/native) |
| 原生页面中的 Web 插件区域（island） | 客户端读取 Host 的 Web 启动图，桥接可补充槽位与包的归属。按槽位、会话、Host 类型和 WebView 预算选择原生组件、嵌入 Web 区域或完整网页入口。嵌入时实际启动官方 Web 页面，注入脚本定位已渲染的槽位，突出显示目标组件。 | 已注册到可识别槽位的第三方 Web 插件可以保持原包。缺少可靠归属、目标槽位不受支持或承载不可用时，局部嵌入能力下降。[插件清单](https://github.com/ccch1mneyyy/dsh-Go/blob/0ccd26ab475a8477d148dc62b43a0b8267e56aa8/packages/dsh_client/lib/src/client_inventory_api.dart) · [选择策略](https://github.com/ccch1mneyyy/dsh-Go/tree/0ccd26ab475a8477d148dc62b43a0b8267e56aa8/app/lib/plugins/seams) · [WebView 挂载](https://github.com/ccch1mneyyy/dsh-Go/blob/0ccd26ab475a8477d148dc62b43a0b8267e56aa8/app/lib/ui/plugins/islands/island_handle.dart) |
| 完整 Web 工作区 | WebView 加载所选 Host 提供的 `dsh web` 根页面；原生转 Web 时传入 sessionId，导航脚本写入 Web 客户端的当前会话键，必要时重新加载；返回原生时同步最终选中会话。 | 未专门适配手机的 Web 插件随 Host 的客户端图装载，依赖和插槽由真实 Web 客户端提供。具体插件的操作及布局仍需验证。[Web 入口与切换](https://github.com/ccch1mneyyy/dsh-Go/tree/0ccd26ab475a8477d148dc62b43a0b8267e56aa8/app/lib/ui/web) · [会话导航](https://github.com/ccch1mneyyy/dsh-Go/blob/0ccd26ab475a8477d148dc62b43a0b8267e56aa8/app/assets/web/dsh_web_open.js) |

同一款 App 的连接方式决定了上述能力。本机引擎提供回环 HTTP 地址和启动 token；SSH 在手机回环端口和远端 DSH 端口之间转发，再由网页完成登录。两者有页面地址，才具备打开完整 Web 的前提。局部嵌入另有可用性与路由防护检查。DSH Remote 使用不同的 RPC/流承载，可以继续原生会话，源码对完整网页和 island 均禁用。专用桥接的清单、取视图及动作 HTTP 路径也受连接方式限制。鸿蒙当前的公网中继更接近最后一种情况，增加标准工作区承载是独立的工程工作。[SSH 转发](https://github.com/ccch1mneyyy/dsh-Go/blob/0ccd26ab475a8477d148dc62b43a0b8267e56aa8/app/lib/remote/ssh/ssh_link.dart) · [嵌入条件](https://github.com/ccch1mneyyy/dsh-Go/blob/0ccd26ab475a8477d148dc62b43a0b8267e56aa8/app/lib/ui/plugins/islands/island_gate.dart) · [扩展传输](https://github.com/ccch1mneyyy/dsh-Go/blob/0ccd26ab475a8477d148dc62b43a0b8267e56aa8/packages/dsh_client/lib/src/dsh_go_api.dart)

## 工作区入口的选择

在 ArkUI 中把表单和状态卡逐个实现，可以较快交付自己的插件，代价是第三方插件自定义的 React 组件、状态和插槽无法从标准包自动翻译出来。让原包在完整 Web 客户端里执行，才能保留作者提供的行为。直接在手机转发电脑登录后的整个网页最接近普通浏览器，但会引入该页面的所有者身份、启动数据和 HTTP 路由，与现有配对范围不同。

建议先增加可选的标准工作区，共用原生连接，并允许从当前会话进入和返回。这个入口同时覆盖消息卡、输入区贡献和插件设置。下一步借鉴 island，从原生聊天直接打开 DevFlow 设置或运行详情，优先共用一个按需创建的受信工作区，控制页面与订阅数。两条入口使用同一套 Web 资源、设备权限与 Session。原生快捷操作在同一桌面 Session 上生效。只有真机证明完整工作区能支撑日常任务，才决定其在主界面中的优先级。

复用 dsh-Go 的选中会话交接和按需呈现策略。由于我们维护 DSH 分支，建议由工作区接受显式导航目标（桌面、profile、Session，以及可选的插件和槽位），在正确 Session 的依赖和插槽就绪后呈现并应答。第三方包继续使用标准注册方式。对同一槽位多个贡献者、切换时插件卸载、插件从面板发起弹窗或导航这些情况分别验证；若无法保持交互完整，进入该会话的完整工作区。直接注入 CSS 裁剪页面和写入浏览器内部存储键只适合做对照实验；它们容易受 DOM 结构和启动时序影响。[DSH 插槽实现](../../../packages/client/ui-renderer/src/client/scoped-slots.tsx)

## 鸿蒙工作区的组成

1. **桌面是版本和数据来源。** 复用 Client Modules 提供的启用图、版本化资源和依赖关系，以及标准 Web 启动、Cordis 服务、React Slots 和会话状态。手机读取这台电脑实际启用的包，主机更新、停用或卸载插件后刷新图。原型覆盖启动内核、样式、延迟加载资源和插件图。缓存按原桌面身份分区，profile 固定为 desktop；每次打开取得新鲜授权与资源摘要清单。同一桌面仅复用新清单仍确认的相同内容，其他资源重新读取；当前图在生成清单时变化会拒绝本次启动。[模块加载](../../../docs/subsystems/client-modules.md) · [Web 客户端](../../../docs/subsystems/web-client.md)
2. **工作区通过配对设备连接桌面。** 原生层持有设备身份、路由和通道生命周期。复用 DSH 的 `loadBundle`、`rpc.call`、`rpc.open` 等接入点，将桌面注册的服务接到配对链路。覆盖单次请求、流与上行、事件、取消、断线后的新一代连接。文件和二进制响应另行验证。现有 Worker 承载可作为启动顺序的参考；它的 `ownsHost: true` 假设只适用于页面拥有自己的 Host。[连接接口](../../../packages/client/connection/src/client/index.ts) · [Worker 启动](../../../packages/experimental/webworker-runtime/src/client/index.ts)
3. **为工作区单独授权。** 现有已配对设备的授权包括有限的会话和富交互操作，列表管理在另一条经过校验的设备入口上。桌面应明确授予新的工作区访问范围，绑定设备、profile、有效期与撤销状态。通过实际手机 Peer 构造启动权限快照，沿标准 Gateway 检查每次调用和事件。普通 Web 首页注入 owner 快照，原样代理会给手机呈现错误的权限。插件与工作区共享前端环境，按设备与资源约束操作，界面隐藏和插件自报身份均不能授权。[现有设备授权](../desktop-plugin/src/device-binding.ts) · [Web 启动权限](../../../packages/api/remote-access/src/index.ts) · [资源解析](../../../packages/api/gateway/src/access.ts)
4. **区分受信工作区和会话富内容。** 工作区加载已配对桌面启用的标准插件。模型生成的 HTML/CSS/JS 仍由独立的 ArkWeb guest 展示，仅拥有当前块和版本对应的草稿、动作及状态接口。统一 rich-inline 的视图挂载与释放接口，桌面实现维护 Electron guest，鸿蒙实现复用现有原生 owner。单独模拟 `dshDesktop.rich` 无法实现当前直接创建的 Electron `<webview>`。导航、切换 Session 或退后台时回收 guest 的端口。[桌面挂载点](../../../packages/experimental/rich-inline/src/client/RichMessage.tsx) · [鸿蒙富内容 owner](../harmony/entry/src/main/ets/product/NativeProductRichOwner.ets)

## 两个先决验证

**启动工作区所需的实际权限。** 用隔离的桌面 profile 记录从启动到新建会话、打开插件设置、订阅运行状态所需的 RPC、事件和资源。逐项验证普通设备身份何时可用、何时被拒绝，以及撤销后是否终止既有读取。当前精确 Fetch 路由对非 owner 返回 403，回答交互式 waterfall 也只允许 owner；允许某个 RPC 不会顺带开放这些能力。对标准插件新增方法，统一依据 Host 注册的操作和资源授予作用域；对无法可靠区分会话与全局影响的方法，保留不支持或单独授权的结果。若目标插件的主要操作必须取得整机 owner 权限，先评审是否增加可撤销的受信远程工作区模式，再决定覆盖范围。[设备入口](../desktop-plugin/src/device-binding-relay.ts) · [Remote 访问范围](../../../packages/api/remote-access/README.md)

**旧版 HTTP 路由。** `WebServer.register` 只登记路径、匹配方式和 Node 处理器，无法从登记项取得设备权限或资源范围。相同路径可以在桌面 HTTP 入口命中独立处理器，在手机工作区命中受设备权限约束的 Gateway。直接把路径加入转发表无法保留这种区分。[WebServer 路由定义](../../../packages/host/webserver/src/index.ts) · [标准共享处理器](../../../packages/client/connection/src/rpc-host.ts)

第三方包继续使用同一标准安装包。新增旧路由兼容时，由桌面注册经审阅的适配器，明确当前处理器、方法和资源范围，并随插件卸载或路由替换撤销授权。按处理器实际行为验证读写范围，GET 也可能写入或读取全局数据。工作区里的插件共享浏览器文档，同一设备工作区的脚本都能调用已授权接口，前端自报包名不能隔离调用方。依赖 owner 身份或无法确认范围的操作由桌面处理。[路由验收](acceptance.md)

DevFlow 的设置区分全局、项目和会话，响应也包含可用目标及其项目路径。隔离测试分别授予 A 与 A/B 两种范围，核对目标过滤、越权拒绝及实际写入对象。产品的限时工作区授权覆盖桌面的可见项目和顶层会话。独立加密中继复验确认新增项目可用、子代理会话请求被拒。第三方接口缺少可靠资源声明时，仍须如实呈现所需权限。[验收范围与证据](acceptance.md)

**公网连接上的资源和交互成本。** 在回放和限速条件下记录冷启动传输字节、首次可操作耗时、热缓存命中、一次选模或表单提交的往返，以及断线到恢复可操作所需时间。通过分块、取消和有限并发传送较大的资源，观察消息和取消请求是否被资源下载阻塞。以当前原生会话在相同网络下的测量作对照，随后在鸿蒙真机复核前后台切换、键盘遮挡、内存和草稿恢复，再决定默认入口。

## 首批插件与验收顺序

| 阶段 | 实施范围 | 进入下一阶段所需证据 |
| --- | --- | --- |
| 1. 最小完整工作区 | 在隔离桌面 profile 和测试客户端组合标准启动图、资源获取及设备身份。可选一个已知可工作的本地页面作为对照，然后走候选设备传输。 | 一个未做移动适配的标准插件在原插槽出现，使用自己的 Remote 并完成一次有可观察结果的操作。停用、升级、重连及撤销结果正确。手机无插件名称专用分支，同一 HAP 能看到新增插件。 |
| 2. 新建任务与 DevFlow | 新建页选择桌面提供的项目、会话类型、主模型和思考强度。DevFlow 使用原设置和面板；检查 direct/auto、编排预设、用途模型的继承和覆盖。应用会话范围的选择后再发送首条任务。用原生入口定向打开同一 Web 面板，验证 island 体验。 | 在电脑读取同一个 Session 的实际 preset、主模型和委派模型。配置保存失败时保留可恢复的空白会话，断线重连不重复创建任务。验证桌面同时修改设置时的冲突处理、切换后另一会话的数据隔离、弹窗和软键盘，以及无法内嵌时返回完整工作区。 |
| 3. 富交互承载 | 使用同一插件包按平台选择 rich 容器，复用现有 guest SDK、草稿和动作回执。 | 在指定鸿蒙真机完成填写、切换、重连、一次动作和结果回读。切换会话后旧块无法继续写，生成的页面无法访问工作区 RPC。 |
| 4. 决定默认入口 | 用正常启动的工作区验证官方或第三方原包，与原生聊天并行比较一轮完整任务。 | 在同一个原包上记录桌面与手机结果、版本、行为差异和真机体验。通过后再决定将哪些高频操作迁入工作区。 |

第 1 阶段可选仓内随上游提供的[可选翻译 Bundle](../../../packages/experimental/cot-translation-bundle/cordis.patch.yml)作对照。它的 Web 端有自己的 Remote、设置事件和消息插槽，可用隔离的合成内容与测试提供方驱动。最终应另选一个独立作者发布且未经修改的标准包，以发现两个自研插件和同仓示例都覆盖不到的依赖。

通用的新建任务入口可与第 1 阶段并行交付。原生页向电脑取实际可用的会话类型、模型和思考强度，提交明确选择，读回已创建的 Session 和生效配置。旧桌面缺少相应能力时显示“按桌面默认创建”，避免把未获支持的选择显示为已生效。这项能力与 DevFlow 解耦，用户可以先在手机选择合适的桌面会话类型。

第 2 阶段须明确选模的影响范围。现有标准选模会保存部署默认，针对“仅本任务”的新建流程可由 Host 使用已有的会话级按版本选模，并读回实际结果。DevFlow 的主模型、编排预设和委派用途模型在界面上分别呈现，六种用途可以继承会话模型或引用各自档案。普通 Web 工作区沿用同一 DSH 产品语义，避免手机在传输层暗中改写标准插件请求。[会话命令](../../../packages/api/session-controller/src/commands.ts)

首个交付物是隔离环境中的兼容原型及差异记录。现有 ArkUI 入口在原型期间承担日常会话；工作区失败可返回同一会话。设备授权、真机交互、弱网指标与第三方同包运行都需取得各自实测结果，才能把对应项目列为已支持。
