# 默认禁用的可安装桌面插件

本页是本地安装包与授权范围的参考。包为 `@deepseek-ai/dsh-experimental-harmony-mobile@0.0.0-phase32.1`，实际文件 `D:/Temp/dsh-experimental-harmony-mobile-0.0.0-phase32.1.tgz`，118646 字节，SHA-256 `33550473f3a46a0b541b7d7867691916c6f9ccfae288924ef36278feac2dae82`。它是具有 `dsh.bundle.patch` 的 ESM bundle，包含 29 个经 byte/hash 校验的文件，含声明与 MIT/Zod license；没有 bin、安装脚本、应用启动器、SDK/fixture runtime、Session 文件、密钥或凭据。包文件清单见 [artifact](../evidence/phase32-artifact.json)。

## 当前实现与限制

[插件](../desktop-plugin/src/index.ts)采用 Cordis Config、明确依赖注入、Context effect 和严格 Typert invocation codec；只发布 `harmonyDesktop/metadata`、`request`、`follow`。初始 `enabled=false` 不访问 Context、不创建服务/descriptor/storage。bundle 的 row 还具有 `disabled=true` 与 `config.enabled=false`，不能借安装自动激活。

[生产 ports](../desktop-plugin/src/ports.ts)直接调用同一 profile 的 SessionController/RichInline，receipt 只读检查原 inbox/Session 事件，不复制执行器或 rich ledger。生产和 synthetic adapter 共用抽出的 ScopedDesktopExecutor；原 RestrictedDesktopAdapter 的 synthetic-only guard 保留。profile wire 使用 `mode=desktop-profile`，不会将实际桌面派发标成 fixed-replay；旧 fixture 模式保持。手机当前 HAP/HTTPS provider 没有因此自动获得生产连接能力。

[admission](../desktop-plugin/src/admission.ts)只接受独立宿主 `harmonyAuthenticatedDevices` provider 对确切 Gateway Peer 对象的当前授权，检查 device/desktop/epoch/Session/operation/expiry/revocation。operator 即使被错误 provider 映射也拒绝；克隆 Peer、JSON id/cookie、不同 Session/epoch 都不能替代它。provider 负责先认证实际通道，插件不创建它、不产生设备密钥或持久 grant。现在没有已激活的配对或远程 carrier。

[窄 transport](../desktop-plugin/src/transport.ts)复用既有 Gateway，仅接受 metadata/request/follow 的确定字段；拒绝 caller-selected namespace、method、peer 或 cookie。真实设备 carrier 必须使用这个入口，并自行完成已批准的通道认证；不能把普通 operator `/api` 或完整 `$events` 给手机。本包不注册 HTTP/WebSocket listener、开放端口或修改网络安全设置。

[持久 journal](../desktop-plugin/src/journal.ts)使用既有 StorageDomain。`harmony_mobile_admission` 首个 v1 generation 声明 ready marker（desktop/profile id）和 admissions（device/desktop/Session/request id、规范化 intent、submitting/accepted）；这些数据不授予访问权限。没有既有 released generation、SessionEventMap 或 SQLite SCHEMA_VERSION 变更。未初始化/不同 owner 的 `reopen`、重复 `create`、无效记录均拒绝，不迁移、不 skip 或重建为可派发的空状态。`journalMode` 默认 reopen；第一次经批准激活才可明确 create。unknown outcome 保留原 record，仅凭原 canonical receipt 对账。

卸载/撤销先停止 followers、释放 mounts、撤回严格 descriptors、关闭 writer；不取消原桌面已接受工作，不删除 Session/journal。历史严格 endpoint 撤回后 Gateway 拒绝 SRC fallback。审批 list/response 和 catalogue/image capability 本包尚不支持并明确拒绝，桌面现有 approval answerer 不被接管；metadata 不宣称完整审批链或完整手机客户端。

## 实际验证

执行 `node scripts/check.mjs --integration`（strict TypeScript 6.0.3，84 模块），`node scripts/phase32-build.mjs`（93 个 source 输入），`node scripts/phase32-smoke.mjs`（built ESM、disabled Context 零访问、NodeNext 不使用 source aliases），以及 `node scripts/phase32-pack.mjs`（29 文件与 tarball 逐项匹配）。[built smoke](../evidence/phase32-built-smoke.json)使用临时只读 SDK junction，没有包管理安装。

`node scripts/phase32-test.mjs` 在显式隔离 synthetic profile 内通过 4 项实际 Gateway/生产 ports/admission/StorageDomain 测试。核心流程耗尽四个固定 replay，realCalls=0、uploads=0：原 task prompt 一次，丢失回执后对账、rich action 完成/重开重送、第四响应取消、foreign Session 无 turn、撤销清理与 descriptor 撤回。另通过 96 项相关内存回归。两类数量独立，不宣称当前完整 suite、已安装桌面或真机通过。[生产流程](../evidence/phase32-production-flow.json)与 [journal 恢复](../evidence/phase32-journal-recovery.json)记录其限定。

受管宿主 sandbox 的 realpath/junction EPERM 有原始证据；依仓库 AGENTS 原命令窄 host 重试，没有改变产品 sandbox 或接受条件。源码测试修复了注入访问、fixture spy 计数与 foreign Agent 断言，保留失败日志。更新内存 bundle 时曾覆盖旧生成 evidence，已从 v31 封存恢复原 bytes/hash，并把本次结果另存 phase32。旧 ZIP/HAP/main dirty 文件保留，未 commit/push。

## 兼容与安装批准

包声明精确 DSH peers `0.2.1-alpha.2`、Cordis `4.0.5-alpha.1`、Schemastery `3.18.5-alpha.1`；完整清单在 package manifest/artifact。source/prepared SDK 的静态、运行时和 NodeNext 检查通过，源码有既有 dirty 改动，不能从相同版本号推断用户实际安装 API。用户 installed `desktop-runtime.json`/shared package metadata、实际 profile 和缺失 peer 尚未读取或验证，安装前必须只读核实；不读取 Session、账户、cookie、凭据或含秘密的 profile 配置。

可向用户合并请求的步骤是：先核对明确安装目录中的公开 runtime metadata/版本和目标 `desktop` profile 的可脱敏 package inventory；仅在所有精确 peers 已由该安装提供且兼容时，经现有受支持 Plugin Manager 使用 `installBundle(该绝对 tgz 路径, {enabled:false, saveExact:true})` 安装该 hash。此动作尚未执行；代码中该选项让 bundle 不进入选中列表，没有启用 row。安装范围仅是这一私有 dependency、对应 package/cache/lockfile/manifest 记录与必要管理刷新；预先备份受影响管理文件，保持其他 rows、数据和应用资源。

若 peers 缺失/不兼容、需额外下载/安装依赖、升级、exemption、reload/restart 或未知结果，停止并报告，不能扩大这次批准。尤其 restart-required 不授权重启已安装 DSH。安装后只核对 package 名/版本/hash、bundle 未选中、row/服务/descriptor/storage/listener 未激活。回退通过同一管理通道撤回这个 package dependency 并恢复原管理文件；已经存在的 Session/admission 数据保留。

这次安装请求明确不包含启用、真实任务/用户 Session 读取、设备 provider/grant/配对/持久访问、监听/防火墙/TLS/隧道、签名账户/手机安装权限、模型/上传/付费/发布。下一项实际启用请求需把独立认证 carrier/provider、获批 Session/operation/期限/撤销、首次 journal create 和真实模型成本策略一并说明；审批闭环和真机验收仍另行完成。不需要再增加一个通用准备层或让安装批准兼任访问批准。
