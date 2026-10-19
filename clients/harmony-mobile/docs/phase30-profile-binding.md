# 窄 profile 的离线能力协商与绑定

本页是新离线库的接口参考。[能力解析](../src/profile-capabilities.ts)和[绑定](../src/profile-binding.ts)把明确的协议/端口 revision、当前设备 scope、选定 Session 和 canonical 服务调用分开；没有创建 Cordis Context、插件注册、监听、密钥或持久 grant。现有 `RestrictedDesktopAdapter` 仍负责命令 admission journal、unknown outcome 对账和 mobile/host mount 映射；新绑定不复制 rich ledger、SDK 或 Session 执行器。真实接入路线和批准范围仍见 [桌面接入计划](phase29-desktop-integration.md)。

## 版本与能力

`parseProfileAdvertisement` 接受有界 JSON，检查 `dsh-mobile-profile-capabilities/1` 的字段和协议 revision，忽略本消费者未知的 advertised capability。`resolveProfileCapabilities` 对 command、wire、richGuest 使用明确的精确匹配，对每个端口能力使用消费者要求的 revision；没有包版本推断、隐式默认、降级或 fallback。advertisement 不授予设备权限，也不证明已安装 DSH 的版本兼容。测试的 `fixture-ports/1` 仅是合成端口 revision。

缺少 metadata、协议不匹配、必需 capability 缺失或 revision 不匹配会抛出带 code/subject 的 `ProfileBindingError`。可选 capability 返回禁用原因，未请求的能力始终禁用；调用禁用端口会明确拒绝，审批列表不会被静默替换为 `[]`。`approval.respond` 还要求协商启用 `approval.list`，以保留展示当前请求的能力。

## 服务与身份

Session prompt/cancel/follow/receipt 和 rich mount/snapshot/saveDraft/invoke/status/dispose 直接使用已有 `DesktopServicePorts` 的 canonical 参数与返回值。[类型兼容断言](../integration/profile-port-contracts.ts)在严格编译中核对现有 SessionController 与 RichInline Service Definition；rich 的同步 dispose 由端口实现明确 await。新库没有 argv、任意 namespace/method、目录或宿主执行入口。

绑定只接受注入的 `synthetic-device` admission，明确拒绝 `operator`。每次操作比较 desktop/profile/generation/device/grantEpoch/Session、当前过期/撤销状态和该操作 capability；这些值从独立的 host admission reader 读取，advertisement、命令里的身份字段和 cookie 都不是权限来源。这里的 admission 是内存测试数据，不是认证实现或真实设备 grant。

读取和 follow 在返回数据/下一帧前复查 scope；失去权限时不继续交付，并关闭 source iterator。变更调用一旦交给原 owner 就可能已经提交，错误不能证明回滚，任务必须保留既有 receipt/journal 对账。rich mount 仅登记本绑定实际获得的 host mount，其他绑定不能使用同一 mount；返回 mount 时失去权限会释放它。清理失败会显式报告并保留所有权，以便 `release()` 重试。

消费者先关闭 adapter/followers 并等待在途操作，再调用 `release()`，最后释放 host 服务。release 停止新调用、尝试释放全部拥有的 mount，允许对失败释放重试；撤销授权不阻止释放原有 mount。release 不取消已接受的桌面任务，不注册或销毁外部 runtime。

## 审批端口与宿主缺口

`ProfileApprovalPorts` 要求 host 提供选定 Session 的 sanitized pending projection 和一次性 respond。ticket 是新的临时 `MobilePendingApprovalId`，携带 generation/revision/expiry/state，不冒充 durable `ApprovalRequestId` 或 rich action id。respond 只接受 canonical `allowed-once`/`rejected`；过期、撤销、重复、冲突和原 waterfall 的决定归宿主 owner。绑定另要求实际 native receiver 对象，拒绝克隆对象；这是同进程合成检查，不能证明跨设备认证或用户确认。

[typed fixture](../src/profile-binding-fixture.ts)只在内存模拟 pending owner：相同决定的并发重送返回原 receipt，决定计数仍为一；不同决定、旧 revision、取消、过期和未知 ticket 拒绝。它没有 Agent、`approval/asked`/`approval/decided` Session audit、Gateway pending event 或真实 waterfall。旧 `approval.list` 的展示映射和 `NativeApprovalReview` 的 local-review-only 语义保持；旧 mobile command 和 rich/native guest 协议仍拒绝审批响应。

真实宿主仍需以下支持：

1. 同 profile 插件产生当前 runtime/service/codec 的能力 metadata，明确 profile generation 与 mobile relay generation 的映射，缺失服务时停止对应功能。核对实际安装 release/插件版本，不把 dirty 源码兼容结果当安装兼容。
2. 由经批准的设备通道建立独立 admission，限定 Session/operation/epoch，并在审批决定的实际 admission/settlement 时再次核对当前 grant；不把 operator Peer/cookie 或完整 `$events` 转给手机。当前 Connection 默认 operator admission 不能直接用于该设备通道。
3. 用 `ctx.on()`/`ctx.effect()` 的 scoped `approval/request` listener，把临时 ticket 绑定原 Agent、pending event、取消信号和 generation。未拥有 Session 或无响应能力时调用 `next()` 委托现有 answerer；有权认领时，只一次性决定原 waterfall，让 ApprovalService 继续拥有 durable audit。超时、断线、撤销和 teardown 需要明确的 fail-closed 生命周期与清理规则。当前 event payload 没有 durable request id，Gateway 的 pending map 也不是本库可直接复用的公开端口。
4. 从可信原生 UI 建立独立确认入口和当前 ticket/revision 展示，经过有界 JSON 验证、实际通道鉴权和宿主授权。rich guest、凭据问题和任意 host RPC 不进入该入口；同进程对象身份不能替代这一过程。

下一最小离线接入步骤是在客户端 `integration/` 增加未注册的 capability producer/Remote codec 和 scoped approval listener 适配器，用 fake scoped Agent/answerer 测试 `next()`、取消、一次性决定、旧 generation 与 teardown，并继续复用本绑定和现有 MobileBff。该步骤不需要安装插件、真实 Session、listener、配对或设备密钥。安装版本核验和真正 profile 激活仍需单独的兼容证据及相应批准。

## 执行证据

本阶段运行 `node scripts/check.mjs --integration`，严格 TypeScript 6.0.3 检查 76 个 lab/integration 模块，包括两项 canonical 服务类型断言。五份相关纯内存测试通过 83 项；修复 type-only 断言的语法后再执行新绑定测试，通过 27/27。初始类型错误及首轮测试日志保留，没有算作最终编译通过。

合成闭环通过 [owner-local 预期输出](../tests/fixtures/phase30-profile-binding.expected.json)：丢失 prompt reply 后，同 requestId 通过原 journal/receipt 对账，promptCalls=1；重复 rich action 的 receipt 相同、admittedActions=1；取消仍回到原 Session，adapter 和 binding 清理后的 mount/follow 为零。没有重录模型/产品 Session 输出，现有产品路由和 HAP 未引用新库。

可在源码目录重现这两条离线命令，不调用 SDK、真实模型或网络：

```sh
node scripts/check.mjs --integration
node --test --test-reporter=tap tests/profile-binding.test.mjs tests/link.test.mjs tests/security.test.mjs tests/wire.test.mjs tests/domain.test.mjs
```

完整测试、ArkTS/HAP 构建、ArkWeb/模拟器、已安装桌面、WAN 和真机本阶段均未执行。[阶段检查](../evidence/phase30-checks.json)记录实际命令和限定；旧 [v29 验收矩阵](phase29-acceptance-matrix.md)的原生证据不会提升为本新库的产品验收。
