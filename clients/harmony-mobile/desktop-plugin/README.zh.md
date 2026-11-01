当前公开历史校验：[完整签名历史](../docs/phase75-complete-history.md)。续期预检在发出新挑战前，通过共享协议验证每条保留记录的签名和摘要；验证不会创建传输或授权。

当前首次使用范围：[显式后继候选](../docs/phase69-successor-candidate.md)。初次注册拒绝已有授权历史。过期延续在发出挑战前，预检原有耐久撤销标记、精确固定范围、保留的公开历史和新的配对命名空间；授权提交后若回执失败，会耐久撤销该授权。此预检不安装提供方。

当前 alpha.4 状态：[阶段 66](../docs/phase66-progress.md)。独立运行时和八项恢复用例通过；原有环境确认与新的真实注册仍待完成。

# 私有 Harmony 手机桌面 Bundle

[English](README.md) | 中文

最后核实的桌面运行版本为 rc2.12。rc2.16 控制面板是离线候选，构建与验证方式见[控制面板参考](../docs/control-panel-rc2.16.md)。安装和实机测试仍为独立操作。[交接](../docs/HANDOFF-2026-10-28.md)保留原配对和已关闭窗口的证据。

本包是默认禁用的实验性 Profile Bundle。安装与激活分别进行。通过受管桌面插件管理器安装时设置 `enabled: false`，保持该 Bundle 未选中。其自身条目也设置 `disabled: true` 和 `config.enabled: false`。导入或加载禁用插件不会打开日志、创建服务/描述符/Peer，也不会启动传输。

版本 `0.0.0-normal-controls.1` 仅面向已验证安装的 `0.2.1-alpha.4` Host、protocol4、Cordis `4.0.5-alpha.2` 和 Schemastery `3.18.5-alpha.2`。全部 29 个 peer 都固定为实际安装版本，不声明兼容旧版本。安装版 API 检查在临时 Profile 中加载实际公开 Host 模块，注册 `/harmony-pair`，并通过三个合成响应执行普通产品任务和富交互完成流程。它不重载正在运行的桌面，也不证明实体手机通过验收。本地产物路径和哈希见[产物记录](../evidence/normal-controls-artifacts.json)。

新增的 `@deepseek-ai/dsh-experimental-harmony-mobile/product` Cordis 入口绑定当前 Profile 中一个明确且已存在的 `sessionId`。`profileId` 必须等于 dsh 启动器的 `profileContext.name`。它使用该 Profile 的 SessionController、Agent、选模、工具、rich-inline 和审批应答器。禁用时不创建 Context、Session、模型提供方或配对授权，也不导入回放夹具。启用时，缺少或不存在的 Session 会在打开准入日志前被拒绝；元数据和每项操作都取设备授权与配置的 Profile、Session 的交集。省略 `sessionId` 时，通用包入口保留原来的授权范围行为。

同一入口还导出仅本地可用的 `createPairing` 和既有 `DesktopIdentitySigner`。本地所有者提供已选定的受保护签名器、配对限制和相同产品选项；`createPairing` 检查启动器 Profile 并查看持久化 Session，不恢复 Agent。返回的原有 `DesktopFirstUse` 发出单 Session 的签名要约、验证手机证明，并使用原有授权流程。显式确认后，`install` 提供现有设备/中继所有者，`productOptions(authority, journalMode)` 从已提交授权推导激活配置。这些库方法都不是 Remote 导出。桌面冷启动仍会拒绝存储的授权，直至本地确认；续期保留精确 Profile/Session，并要求原有过期历史和撤销标记。

默认禁用的 `/pairing` 入口在现有 Host 中注册可发现的 `/harmony-pair` 命令。[未应用的设置示例](pairing.enabled.example.json)提供公开部署限制。在选定的真实根会话中，`status` 报告当前 Profile/Session；`start <phone public identity JSON>` 在签名前请求本地审批，`confirm <signed phone reply JSON>` 使用原有授权问题。结果包含手机公开记录和中继配对字段。只有另行确认的 `connect` 才会在手机和获批中继就绪后启动出站传输；`stop` 撤销桌面授权并关闭其拥有的服务。`identity-create` 需要显式批准，且拒绝已有别名。这些命令不会创建另一运行时、调用模型或授权远程设备自行配对。加载该入口不会激活已保存授权。

手机原生已存范围管理器在列出或选择范围前停止当前连接。每个范围有独立公开记录和锁；旧文件及其完整签名历史保持不变。选择只打开预览，仍需显式比对与连接确认。保存新范围不能克隆旧范围或替换同范围的已撤销记录。源码命令/SDK 替身检查和官方编译不能证明安装版 Host 或手机执行通过，见[当前验收范围](../docs/normal-product-entry.md)。

独立且默认禁用的 `/test-session` 入口用于一个新建的普通根 Session，该 Session 必须显式选择其非默认预设；`/product` 和 `/pairing` 均不导入它。应用[未应用的测试设置](test-session.enabled.example.json)后，在本地普通根会话中运行 `/harmony-test new`。它在该会话工作目录创建一个使用测试预设的新 Session；重复命令返回同一 SessionId。打开该 Session，运行 `/harmony-test status` 查看精确路由、期限和响应数。适配器最多允许三个固定响应（表单、完成工具调用、完成文本），且只允许 `rich_inline_complete`；不执行提供方 IO、上传或回退。模型准备和原生工具呈现仅作用于该 Agent。其他 Session 保持其提供方、默认值和工具呈现，不安装全局离线策略。非空 rich-inline `activePresets` 列表必须已包含该测试预设，并保留所有原有项。缺少富交互创作能力会在消耗响应前拒绝。

只有在测试入口激活后新建的空白 Session 可以绑定；已有或恢复的 Session，以及第二个测试 Session 都会被拒绝。无效提交也会消耗本次尝试的响应名额。到期、预算耗尽、取消选择预设或卸载入口均不能选择真实提供方。卸载仅取消合成 Agent，并保留 Agent 所有的拒绝监听器，直至该 Agent 销毁；重新打开其持久化测试预设不能重置响应预算。将该 Session 保留为测试历史，后续运行另行创建获批测试 Session。[五项合成行为检查](../evidence/normal-controls-tests.json)包含已使用的独立提供方、冷重载、重复 id、缺失创作能力、到期和显式新建 Session 去重；[首台设备清单](../docs/first-device-acceptance.md)负责实际部署步骤。

以下产品条目示例尚未应用。仅此条目不能注册手机。`journalMode: reopen` 保留已有回执；首次创建是另一项显式本地激活决定。源码首次使用流程现已支持普通 Session；安装中的冻结手机/插件尚未替换，也未就此验收。见[集成证据与最小部署工作](../docs/normal-product-entry.md)。

```yaml
- id: harmony-mobile-product
  name: '@deepseek-ai/dsh-experimental-harmony-mobile/product'
  disabled: true
  config:
    enabled: false
    desktopId: OWNER_SELECTED_DESKTOP
    profileId: EXACT_DSH_PROFILE_NAME
    sessionId: EXISTING_AUTHORIZED_SESSION
    relayEnabled: false
    journalMode: reopen
```

启用时需要现有 Connection、Gateway/Typert、SessionController、SessionPersistence、RichInline、Agent registry、WorkspaceRegistry、StorageDomain 服务，以及独立的 `harmonyAuthenticatedDevices` 提供方。该提供方必须先认证通道，再解析精确 Peer 对象，限制 Session/操作/epoch/到期时间，并负责撤销。操作者身份、复制的 Cookie、JSON id、未知或克隆的 Peer 均不能授权该服务。本包不创建设备凭据、配对或持久授权。

仅 Host 使用的准入和窄范围传输导出是库，不是 Remote 方法。固定的 `harmonyDesktop` 元数据/请求/跟随分发器不会给予手机通用 Gateway/操作者访问。可选 `relayEnabled` 默认 false，且在打开存储前要求本地 `harmonyRelayLifecycle` 提供方。PairedDesktopRelay 仅在插件挂载时打开端口，复用控制/E2E 运行时，验证原设备证明，将每个请求/跟随者绑定到精确加密代次和已认证 Peer。配置的到期 watchdog 与插件 effect 关闭订阅、密钥和出站套接字，保留已受理桌面工作和回执历史。具体 Node 端口验证 TLS、主机和身份，拒绝重定向/压缩，只生成房间内临时密钥协商材料；必须由本地提供既有签名器。本包不注册监听端口、不改防火墙/TLS 设置，也不启动应用。

规范 Session 与富交互所有者继续负责执行、耐久 Session 事件、CAS 和动作台账。独立 StorageDomain `harmony_mobile_admission` v1 在派发前存储命令回执 id/指纹，以及绑定 desktop/profile id 的 ready 标记；其中没有访问凭据或授权。`journalMode` 默认为 `reopen`，拒绝缺失、未初始化或不同所有者。获批的首次激活必须显式选择 `create`；它拒绝已有初始化，不覆盖回执。无效记录令整个打开操作失败，不会跳过或回退迁移。此新存储代次不改变任何已发布 Session 或 SQLite schema。

状态不可读或缺少回执证据时，不会自动重新派发。卸载会关闭跟随者/挂载和写入器，但保留不确定回执记录，不取消已受理桌面任务。激活后移除包/Bundle 时，应保留准入域和 Session 数据，直至另行审查；删除回执历史不是回滚。

已认证元数据包含按原有授权过滤的项目/Session 目录，不含宿主路径。每个新认证 Peer 都有新的 wire 实例，服务元数据描述挂载的插件代次。审批列表/应答和图片扩展不可用，并明确拒绝。原桌面审批仍由既有应答器负责。Profile 帧携带 `mode: desktop-profile`；当前手机传输/设备验收另行进行。当前源码验收范围及剩余构建阻塞记录于阶段 62；既有签名运行时封存产物保留原兼容声明。

`installDesktopPairingProvider` 是本地库，要求精确的同进程授权来源和既有授权所有者/连接方案。它通过受所有权管理的 Context 贡献注册两个必需提供方服务，在另行启用的插件挂载前不拨号。其可选显式恢复策略仅在原授权仍本地有效时重建有限控制代次；普通连接退役保留授权，实际撤销则停止恢复。它不会重新派发命令或创建监听端口。冷启动授权仍需本地确认。

`DesktopIdentitySigner` 打开一个明确选定的 credentials-local 身份，提供现有 P256 签名接口。`DesktopFirstUse` 导入手机公钥、签署严格首次使用要约、提交原有本地 Authorization 授权，并仅在本地批准后安装两个既有提供方。受支持的隔离现场 Profile 负责终端决定和已验证的出站 WSS；签名器、授权及 Host 方法都不会交给富交互 guest。其 identity /2 所有者数据要求显式 Windows 当前用户 DPAPI 保护；保留并拒绝旧明文记录。规范 Session 耐久写入先于已受理准入回执，证据不可用时提交中的记录保持未知。创建真实持久身份仍需另行批准。见[受保护存储、稳定环境与验收](../docs/phase52-protected-world.md)。

当前源码的合成 Gateway/插件测试与使用 SDK 替身的实际 ETS 所有者执行完整固定回放产品流程，包含任务/流/富交互表单、重复回执、控制恢复、取消和撤销。实际安装的 Profile/身份材料、原生 HUKS/TLS、已签名手机及真实用户桌面执行仍未验证。不提供新的安装脚本、二进制或持久密钥材料；已安装用户 Bundle 保持禁用且未变。见[当前证据与剩余验收](../docs/offline-product-acceptance.md)。

## Harmony 命令反馈

被动反馈组件在原 retained Session 中显示经过审查的公开结果和安全错误；缺少 Session 时不会发送替代通知。rc2.16 候选另加固定 Session 控制面板，使用正式命令 API，保留 Host 校验和正常确认。它只在明确操作时调用有限白名单命令，挂载不会授予权限。没有 retained Session 时面板不显示，也不创建 Session。见[验收与限制](../docs/control-panel-rc2.16.md)和[早期反馈验收](../docs/rc2-alignment.md)。

## 设备路由窗口

`harmony-device` 将原有持久设备绑定与双方签名的限时路由分开保存。`route-start`、手机批准和签署、`route-confirm` 共同准备一个窗口；`directory` 返回对应公开路由，中转公开登记仍须单独批准。`connect` 和 `reconnect` 要求当前路由有效，签发绑定到新通道的证明，不延长截止时间。`stop` 关闭本地窗口并保留设备绑定；中转撤销仍须持久化并验证。持久化结果不明时拒绝操作。离线验证期间不安装源码和候选。参见[迁移、清理与回退参考](../docs/device-route-rc2.7.md)。

rc2.8 桌面候选使用字母前缀的路由凭据 ID，在原位保留合法的无前缀历史。重复命名空间和待决写入会被拒绝；构建不会迁移真实授权。安全命令错误仅显示固定的准备与存储状态。手机和中转线协议继续兼容 rc2.7。

rc2.9 诊断候选显示固定的连接阶段、身份／存储／journal／链路拒绝类别和清理失败标记。顺序清理保留首个异常，不显示任意异常文本、堆栈、密钥材料或提供方输出。journal 新建／重开仍须明确选择；诊断不会修改真实恢复策略，也不证明原生连接成功。

rc2.10 桌面后继版修正设备连接的 admission 日志生命周期，不改变 rc2.7 手机或中转协议。设备入口的 `journalMode: create` 允许首次初始化，但每次激活明确解析为 `create-or-reopen`：只初始化空且未初始化的域；已有 v1 ready 域必须匹配原 desktop/profile、逐条验证并保留全部回执。设备入口的 `reopen` 仍拒绝缺失状态。通用适配器保留严格 `create` 和 `reopen`；错误后均不隐式切换模式重试。

不同归属、损坏或版本不匹配、非法记录身份及域占用会在挂载通信通道前拒绝。原域独占机制及串行写入保持不变。关闭失败保留首个错误并报告清理不完整，不允许另开写入者。没有删除、修复、迁移文件或更改授权。候选测试不代表真机连通。
