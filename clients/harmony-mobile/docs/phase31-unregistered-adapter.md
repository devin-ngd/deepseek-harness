# 未注册的 profile 适配器

本页记录默认禁用的离线适配器和安装前的剩余工作。[源适配器](../integration/profile-inactive-adapter.ts)使用 phase30 的版本/设备 scope 检查、现有 RestrictedDesktopAdapter 和 admission journal；原 [MobileBff](../integration/mobile-bff.ts)与适配器共同调用抽出的 MobileBffCore。request/follow 的执行、reset/retained frame 和 expiry 报告没有第二份实现。这里没有包 manifest、`apply`/Remote Service 激活入口、安装器或已注册 Gateway 描述符。

## 当前接口

`resolveInactiveProfile({})` 明确得到 `enabled=false`。未启用的实例不读取 peer、不创建绑定、不挂 scope/listener、不调用服务，metadata 返回空 advertisement；request/follow 明确拒绝。开启只用于注入 synthetic-only 服务的内存测试，不能把 installed desktop 或 operator cookie 转为设备权限。

metadata 继承明确的 profile/generation 与协议/端口 revision，返回 detached 值；审批回应 capability 无条件剔除。要求该能力的消费者在构造时得到 capability-missing。`inactiveProfileCodec` 的 schema 与严格 Typert codec 描述符使用同一有界 JSON parser；未知 `dsh-mobile-profile-rpc` revision、额外字段、过大参数或错误字段类型拒绝。codec 尚未交给 Gateway registry。

每个 JSON request/follow 在原 admission journal claim 前检查当前 peer、设备/desktop/epoch、选定 Session 和 operation capability，拒绝 operator、撤销/过期 grant 和不同 generation。返回 stream frame 前再检查 scope。数据读取和原 rich 请求仍由已有 owner 校验；无 read capability 的操作明确拒绝，不增加任意 RPC、路径或宿主执行入口。

显式 attach 接受调用方已有的 Cordis Context 和 Agent identity，只创建其 scope/effect，不创建 DSH runtime。测试的 Agent 是 id-only fake handle；没有真实 Agent、Session audit 或 ApprovalService。listener 只发出只读 tool-name 观察，过滤 scope、取消和当前设备权限，并始终调用 `next()` 委托现有 answerer。观察回调异常和失去 scope 的次数保留在 diagnostics，不能转成 allowed-once。旧 mobile/rich 协议仍拒绝审批回应。

设备撤销或 owner effect disposal 关闭适配器，先停止 scoped listeners、关闭其 follow journal，再等待原 adapter 和 mount 清理；阻塞中的 follow 被唤醒。失败清理可以重试，已接受桌面工作不被 teardown 自动取消。每个 source 拥有独立的跟随 journal，桌面的原执行 owner 不因 source 重开而复制或重启。

## 离线证据

实际执行以下命令：

```sh
node scripts/check.mjs --integration
node scripts/phase31-build.mjs
node --test --test-reporter=tap tests/profile-inactive-adapter.test.mjs tests/profile-binding.test.mjs tests/link.test.mjs tests/security.test.mjs tests/wire.test.mjs tests/domain.test.mjs
```

严格 TypeScript 6.0.3 检查 77 个模块；source-plane bundle 35 个输入，不含模型 provider、凭据或 SDK 运行时代码。相关内存测试通过 96 项，含新适配器 13 项；它们使用测试自己的 Cordis scope/effect fiber，没有注册产品 profile/service。合成 [预期输出](../tests/fixtures/phase31-inactive-profile.expected.json)核对丢失回执→重开→原 receipt 对账、rich action 重送和取消：promptCalls=1、actionAdmissions=1、原 Session 正确，全部 mount/follow 清理。初始测试的遗漏 waterfall terminal next 和关闭旧 fixture journal 导致的失败保留，修复测试配置后通过；没有调整拒绝条件。

没有执行真实 SessionController/ApprovalService/Gateway 的运行时组合、HTTP/监听、真实任务、模型/上传、SDK、HAP/模拟器、已安装桌面或真机测试。严格类型兼容与内存 scope 证据不能替代那些层的验收。原 MobileBff 的 Gateway 集成回归仍需在后续受控的 synthetic profile 中核对；本阶段仅验证共享 Core。

## 最小可安装插件：一次完整批次

下一批应直接产出一个私有、默认禁用的桌面插件包、打包 hash、安装前兼容报告和回退清单，不再增加新的通用准备层。必要代码只有以下三组，均可先写完并离线验证：

1. **正式 plugin/Service 包装和产物。** 增加 Cordis Config/依赖注入、`ctx.effect()` 生命周期和现有 Typert Remote descriptor/严格参数及结果 codec；复用 Core，封装 metadata/request/follow。按 packaged desktop 的 shared package 规则处理 Cordis/DSH 依赖，提供 ESM 构建与 NodeNext consumer smoke、默认 disabled profile row、版本和 SHA。当前 source delta 不是该安装包。修改 `packages/` 时先使用独立 checkout，并遵守仓库架构/发布规则。
2. **生产服务和 admission 接入。** 把 canonical SessionController/RichInline/Workspace、receipt evidence、持久 admission writer 和具备撤销的设备授权接口连到同一个 desktop profile。生产 factory 必须独立实现并通过拒绝用例；不能删除 synthetic-only guard、把 MockDeviceRegistry 改名字，或复用 operator cookie/完整 `$events`。缺少经批准的设备 admission provider 时保持默认拒绝请求。安装默认禁用包无需生成密钥、配对或打开网络；真正激活这些能力是另一项批准。
3. **必要的整合验收。** 在独立 synthetic profile 中通过现有 Gateway/服务验证 wrapper 的 codec、reload/dispose、同 requestId/actionId 对账和能力拒绝，补对应 Session-driven keyless replay。实际审批闭环可继续列为 unavailable：完整支持它还需要原 Agent/pending-event/取消信号、单次 waterfall settlement、决定时 grant 复核和可信原生确认路由；当前只读 observer 不能替代。

这批产物完成后才形成具体安装请求。无需为安装一个默认禁用包先开放远程网络或建立长期访问；不支持的能力必须继续在 metadata 中缺席或禁用。

## 安装授权草案

现在还没有可安装包，不能提交执行性安装批准。[授权草案](../evidence/phase31-installation-scope.json)的状态为 not-ready，包/版本/hash/目标配置差异尚待产物和公开 runtime metadata 核实。正式请求必须同时给出：

- 本地包的实际名称、版本、绝对路径、SHA、依赖/来源和安装兼容报告；仅核对公开 `desktop-runtime.json`/shared package metadata，不读取 Session、账户、cookie、凭据或 profile 中可能含秘密的配置值。
- 目标为用户明确选定的已安装桌面 profile；由受支持的 Plugin Manager/CLI 安装精确产物，只新增该插件的 disabled row。列出实际会写的插件/cache/profile 文件和逐项回退；保留其他 rows、会话数据与原应用资源。
- 明确是否只需 reload，还是工具返回 restart-required；重新启动已安装 DSH 必须另列理由、时间和具体批准，不能借安装批准自动重启。先前 emulator/HDC 授权不适用。
- 该安装请求不包含 enable、真实任务/Session 读取、设备 grant/配对/持久凭据、网络监听/防火墙/隧道/TLS、签名账户、手机安装/权限、上架、付费、模型或上传。每项实际激活再给出对应范围、期限、撤销及证据。

目前实际 installed release、profile rows、安装路径和 activation provider 都未读取或验证，不能用源码 alpha.2 或已有 HAP 猜测它们。后续首次实际执行仍需“手机→同一桌面 owner→流式/rich→正确 Session 且幂等”的受控证据和最终真机证据。
