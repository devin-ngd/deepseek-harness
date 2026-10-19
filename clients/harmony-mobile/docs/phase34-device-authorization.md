# 独立设备授权与离线 carrier

本批交付可测试的 [设备授权 owner](../integration/device-auth.ts) 和[窄 carrier](../integration/device-auth-carrier.ts)，尚未注册为真实 profile 插件，也未更新或启用用户已安装的 phase32 包。实际用户配对未开始；没有生成真实设备凭据、读取用户凭据/Session、建立持久访问、打开监听或重启 DSH。[17 个用例](../evidence/phase34-vitest.json)只使用 MemoryCredentials、合成身份、固定 fake proof 和短期测试时钟；[Gateway 证据](../evidence/phase34-auth-gateway.json)的模型、replay、上传、真实任务及监听均为零。

## 现有框架与兼容依据

Connection 的 `BrowserAuth` 将通过浏览器 cookie/token 验证的请求统一映射为 `connection.operator`，它不是设备授权框架；手机不经过这一流程，不取得 operator cookie，不连接通用 `/api` 或 `$events`。复用现有 `authorization` 的确认/取消与提交观察、`credentials` 的独占修改/更新事件、`createScope` 的注册和销毁。已读取实际定制 shell `0.2.1-alpha.2.20261012.1` 的三个公开库，均与本地 prepared build 字节一致，版本都是 `0.2.1-alpha.2`；见[框架兼容](../evidence/phase34-framework-compatibility.json)。这些框架没有提供手机专用签名、加密 carrier 或 Harmony 密钥存储实现。

## 首次配对与凭据生命周期

设备首先提出公开的 device/credential id 和持有密钥的证明；注册 flow 的入口只接受桌面可信控制器持有的对象能力，不能由手机 JSON、cookie 或 operator 名称代替。未来真实 proof provider 必须验证新鲜 enrollment 证明、固定桌面/profile audience 与公钥指纹。桌面可信界面再明确展示 Session 列表、操作列表及期限，默认选择拒绝；取消、关闭或拒绝不会提交 grant，也不产生 Peer。手机不能自选扩大权限、批准自身配对或恢复过期授权。

授权流程只在明确允许后通过现有 `AuthorizationSession.commit` 写入自己的 `harmony-device/device-<公共定位哈希>` 记录。哈希只定位 desktop/profile/device 三元组，不是密钥或 bearer token。记录含协议、公开 credential id、Session/operation 列表、epoch、期限和 revoked；没有私钥、operator cookie、模型 key 或签名原文。此处是首个私有 `dsh-mobile-device-auth/1` payload generation，未改动 released Session 数据、公共 CredentialRecord union 或 SQLite schema；未知/无效 payload 拒绝，不能当作空记录覆盖。当前仅写测试内存；真实后端写入须另行授权。

所有期限、容量与 proof 字节限制均显式传入，没有生产随机数、时钟、真实 store 或 listener 默认值。单次确认的总授权期限固定；重连不能延长它。进程重开时所有已记录 grant 都不自动激活，必须再次由桌面明确确认。首期建议单个明确 Session、短期只读 `task.receipt/session.sync`；提交任务、取消及 rich 操作属于逐项显式授权，`approval.list/respond` 不可加入 grant。

## 握手、重连与撤销

carrier 对已确认设备发出限量、限时、一次使用的 challenge，绑定 desktop/profile/device/credential、当前 epoch 和加密连接的 channel binding id。响应只允许 `challengeId/signature`，多余 cookie、peer 或 endpoint 字段拒绝。同一 challenge 必须回到发行它的确切 host transport 对象；相同外观或相同 id 的另一个对象也不能复用证明。单次 proof 在异步验证前消费，验证后和清理后再次检查权限、epoch、连接与期限；旧证明、已撤销 proof 和过期 challenge 都不能创建晚到 Peer。

成功握手使用 `createScope(ctx, peer)` 创建独立设备 Peer；JSON 中的 id 不决定身份。只有同一设备的最新连接存活，并发握手串行替换旧连接。窄 channel 复用 phase32 的 metadata/request/follow dispatcher，不暴露 Gateway、任意 namespace/method、其他 Remotes 或宿主执行 bridge。断线立即中止 lease/订阅并释放 mounts；已接受桌面任务继续归原 Session/Agent。重连取得新 proof/Peer后沿原 admission journal 查回执、重建 follow和 rich mount，不能将断线当成未执行或自动重发；本批 Gateway 只验证读取/订阅，任务/rich 幂等证据仍来自 phase32。

撤销先同步删除当前 admission、消费 pending challenges、abort 所有 lease，再尝试每个清理订阅、Peer disposal 与 grant tombstone 写入。与已进入提交的授权写入串行，最终记录保持 revoked，不允许晚到 commit 恢复 admission。写失败或清理失败仍拒绝连接并报告失败，不能自动恢复、删旧记录或重建为空状态。外部修改自己的 credential record 也先拒绝当前 Peer，不因新记录内容而自动授予访问。当前 `current` 每次检查期限；未来主动 carrier 必须注册可配置的 expiry watchdog，空闲订阅到期也须及时关闭。本模块没有创建 timer 或网络监听。

## 已验证与尚未实现

| 内容 | 本批证据 |
| --- | --- |
| 明确选择 scope、取消/拒绝、错误 enrollment | 已有授权 seam + 内存测试；本地人工提示使用 owner-local keyless fixture |
| challenge 重放、跨 audience/连接、UTF-8 proof 限长、期限与容量 | fake verifier 测试通过 |
| 并发重连、撤销与 proof/commit 竞争、存储失败、清理失败、冷启动拒绝 | 测试通过；所有清理订阅与 Peer disposal 都尝试 |
| 真实 Gateway / phase32 服务的 metadata、receipt、follow及越权/审批/cookie 拒绝 | 合成 Session；任务、replay、模型及上传零 |
| 签名算法、安全 entropy、真实 enrollment ticket、传输加密与 channel binding | 未实现；目前只有必需的注入接口，不能用于真实配对 |
| Harmony secure key storage、真实 signer、relay/证书、手机权限及安装 | 未执行；不能据 Web/Node 测试宣称 ArkWeb/真机通过 |
| 已安装 phase32 包与真实桌面服务启用 | 未改动；新增 owner/carrier 尚未打入包 |

公开 verifier 错误映射为稳定 `verifier-failed`，不把提交的 proof 放进 message/cause。首次测试纠正了 flow 选择拒绝的取消方式、metadata 的实际 `sessions` 字段、未提交任务的 `unknown` 回执及审批列表的 `read-disabled`；初始日志保留，未放宽拒绝条件。严格类型检查、17 个选定用例和本实验格式/链接检查分别记录，不声称重跑全仓或手机验证。

## 最少决策与后续批准

尚需两个部署决策：连接路径及 relay 所在位置/归属；首次允许的明确 Session、操作和短期时长。当前代码与传输位置无关，不需要用户立即回复这两个问题才能继续离线 signer/enrollment/channel-binding 适配设计，也不默认采用托管服务或长期后台授权。

下一步独立代码工作是核实 Harmony 官方密钥/签名与网络 API，离线实现真正的 proof verifier、fresh enrollment challenge、加密 transport binding、expiry watchdog，以及原生客户端密钥生命周期；仍使用固定测试材料，默认不注册到真实 profile。做完这些之后才准备具体新包 hash、配置文件 diff、public endpoint/证书来源、single Session/operation/expiry 清单与撤销/失败测试证据。

下一次实际接入授权可以合并“在明确 desktop profile 安装经核验的新包并保持禁用、按列明短期 scope 首次配对、明确 signer/storage 初始化及启用”，但只有精确产物、配置、权限和回退已经完成才可请求；目前不具备这一批准包，不能仅启用 phase32 替代认证。若接入需要 listener、LAN/public route、firewall、relay/tunnel、TLS key/certificate 或长期访问，须分别把实际目标与影响纳入同次明确批准，否则停止；重启定制宿主、真实模型/上传/付费和手机签名/安装不隐含其中。
