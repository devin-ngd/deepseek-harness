# 有界请求寿命与跨设备时钟差

本参考定义客户端实验的时钟预算、失败处理和离线证据，不激活真实桌面、配对或原生复验。第六轮[future-limit 记录](phase22-round6-native-attempt.md)保持三 blocked；原窗口已关闭，本批没有启动模拟器、安装、转发或请求另一个窗口。所有写入留在客户端目录，已安装 DSH 与主仓其他任务文件保持原样。

## 方案选择

| 方案 | 接纳与安全含义 | 当前选择 |
|---|---|---|
| 给 future-limit/到期判定加宽限 | 扩大桌面允许的绝对剩余期，或让字面已过期请求通过 | 不采用；原两个拒绝保留 |
| 显式偏差预算、缩短发送期、单调计时 | 对配置范围内的偏差保留有限余量，不能替代授时或鉴权 | 采用，不增加公开消息字段 |
| 校准到桌面时间 | 需要明确服务器身份、往返不确定度、陈旧校准与服务代际绑定 | 未实施；需要单独审查协议和信任来源 |
| 服务器授时/签发寿命 | 可把时限放在服务器权威时钟上，仍需请求令牌、重放规则和授时绑定 | 未实施；当前 expiresAt 包没有这些字段 |

现有 MobileCommand 只有 commandId/grantEpoch/expiresAt，没有 issuedAt、授时挑战或寿命令牌。HTTP Date 也不是当前已审查的鉴权或校准机制。本批保留 dsh-mobile-lab/2、dsh-mobile-wire/1 的现有字段与 request-expired 错误码，不创建账户、配对或持久访问凭据。新增 commandClock 仅是 HAP 私有配置，所有自有解析器与消费者一起更新；不是已发布 SDK/HTTP 协议升级。

## 配置与不变量

[harmony/native-policy.json](../harmony/native-policy.json)的名义 ttlMs=60000，maxPeerSkewMs=5000，maxWallDriftMs=1000。resolveCommandLifetime 计算安全预算为 peer skew + 两端各自 wall/单调差，即 7000ms；实际发送期限为 generatedAt + 53000ms。预算必须非负且总和严格小于名义寿命，否则加载失败，不隐式截断或回退。部署值可在已有 HAP 配置里调整，仍需符合对应桌面配置；本批服务器最大剩余期保持原 60000ms。

在发包时两端 wall-clock 差不超过 S、每端逻辑 epoch 与其 wall 的差不超过 D 的条件下，客户端逻辑 epoch 最多领先桌面逻辑 epoch S+2D。发送有效期 T-S-2D 使接纳时剩余期不超过 T；网络/排队只能减少剩余期。负偏差或长延迟可以更早到期，仍拒绝，不补偿、更新旧 expiresAt 或自动重发 mutation。配置预算是前提，不是远端身份或时钟差的测量证明；任意大偏差不在兼容承诺内，超未来上限/已过期仍失败。

[CommandEpochClock](../src/command-clock.ts)在所属 app/桌面进程创建时采样 epoch wall 与单调时间，后续按单调 elapsed 推进。小幅 wall 修正不延长期限、不会让已过期包重新有效。偏差超过配置、单调倒退或无效系统读数会永久标记该 owner 不可信，后续均以既有 request-expired 停止接纳；恢复 wall 不清除失败。NativeAppHost 在 reconnect/cache reload 的既有实例内保留该时钟；桌面 source owner 在 Cordis 服务代际重开时保留同一 clockAuthority，不能用服务重开刷新锚点。

parseCommand 仍一次采样，严格要求 0 < expiresAt - desktopEpoch <= 60000；命令缓存、grant 与 follow journal 采用同一桌面时钟，不因 wall 回拨延长其进程内寿命。expiry 是命令接纳期限，不是已接纳桌面任务的运行时限。已接纳任务继续按既有取消/审批/任务生命周期运行，丢回复不代表回滚；PhoneCore 仍不自动重试任务、动作或取消。

## 重放与进程限制

同一 commandId 的 fingerprint/cache、持久 task admission journal、rich action ledger、draft CAS 和 grantEpoch 规则不变。过期包在取缓存/派发前继续拒绝；同一任务 intent 的 adapter 替换回放只读取原接纳证据，不再次 prompt。新读取/重连使用新 commandId 和新有限截止，不更新原 mutation 包。

这些规则没有把当前 mock 变成生产防重放协议。完整桌面进程重启会产生新的单调锚点，不能仅凭 expiresAt 证明旧包真实年龄；未实现的真实配对需审查既有 grantEpoch 的跨进程失效/更新、持久拒绝证据或服务器寿命签发。当前持久任务/动作去重保留，但未宣称所有操作都有跨进程一次性保证。本批不创建该凭据或修改公开协议；真实连接仍默认拒绝。大偏差、休眠后大幅 wall/单调差或不可信时钟须停止依赖操作，不自动校正系统时间或重新激活权限。

## 离线验证与原生准备

[检查记录](../evidence/phase23-checks.json)、[时钟安全摘要](../evidence/phase23-clock-review.json)、[最终 HAP](../evidence/phase23-hap.json)和[未激活的三项复验清单](../evidence/phase23-revalidation-plan.json)是本批交付；源码增量需沿 v22 及前置链恢复。

70 模块 strict TS 通过。54 项核心回归覆盖正负 5s 偏差、0/1/400/12000/30000ms 延迟、两端最大漂移时恰好 60000ms、加 1ms 的未来拒绝、刚过期、捕获的第六轮三个包、wall 正负修正/大跳变、单调倒退、粘性失败、fresh recovery/reopen 与旧包拒绝、持久 intent 去重。53 项 HAP 资源/SDK 替身检查通过；两组有重叠，不合计为独立测试数。实际源码 BFF 的 13 项固定回放包含 ±5000ms 下 socket 自动读取恢复、准确 cursor-conflict 拒绝，以及既有 cursor-gap/JSON/required-event、代际重开与零真实派发；额外源服务重开+wall 回拨用例证明过期取消没有复活。

首次资源/SDK 替身检查有七项失败：重生成 runtime 后，旧 SDK 替身资源索引与旧 fixture source hash 清单仍引用旧字节。执行已有 assets 和 native-adapter-build 生成器后相同检查通过，保留失败 TAP，未修改拒绝判据或正常化规则。新增 source 服务重开用例首次因空 domain 尚未写出 journal 文件而失败，随后用既有 saveCheckpoint API 写入合成水印；缺失恢复仍拒绝，未产生 prompt/模型调用。更新生成资产后重新准备最终 staged HAP 并编译；此构建和 SDK 替身均不能替代 ArkWeb/真机证据。

当前准备只支持后续另行获批的三项复验：使用新封存 HAP、相同 source clock owner、按 generated/ArkTS sent/received/checked/expiry/fault-taken/fault-written 关联；检查命令 wire TTL=53000、桌面 cap=60000 与 clock status=trusted。仍须原生唯一 reset-snapshot 文字证明 socket 数据接纳，gap/conflict 须准确错误/只读/禁用提交且零新派发。不得复用第六轮批准、重置窗口、凭离线结果改判原生通过，或自动恢复已失效的时钟。

回退只恢复本批客户端文件与对应源文件生成物；[修改前 hash](../evidence/phase23-before-hashes.json)、v22 源码增量及之前链保留，旧 Session/ZIP/HAP/原生失败记录不覆盖。调用新的配置解析器时必须一起带上 commandClock，旧私有配置不能混用新代码。上游参考限于现有单调 idle/lifecycle 策略和相对 OAuth 过期时长，未找到可直接复用的受信跨设备授时实现；未改上游包或 agent-loop。
