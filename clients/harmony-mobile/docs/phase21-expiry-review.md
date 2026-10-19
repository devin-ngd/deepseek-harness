# request-expired 离线审计

本参考只说明第五次窗口三个失败的离线诊断与最小修复。[原生矩阵](phase20-round5-native-attempt.md)仍为四通过、三失败；窗口已关闭，当前工作没有原生执行授权。所有源码写入留在客户端目录，已安装 DSH、主仓 dirty 文件、SDK、许可、系统时间和安全设置均未改动。

## 结论与证据限制

旧日志有六条 request-expired，但没有原命令 expiresAt 或桌面接纳时刻，不能确定实际命中了“已到期”还是“超出未来上限”。249 次 HDC 日志输出的最小最新日志滞后为 31ms；驱动记录的是命令完成时间，包含读取耗时，这个数不能证明两端时钟一致或量化偏差。[审计 JSON](../evidence/phase21-expiry-review.json)保留原文件 hash、时序样本和[原生日志摘录](../evidence/phase21-expiry/native-expiry-excerpts.log)。

客户端使用 Date.now() + 60000ms，桌面 adapter 使用 Date.now() 且最大未来 TTL 同为 60000ms。离线边界测试确认客户端时钟领先 1ms 即可能触发 future-limit；这是已确认的代码风险，不能直接称为第五次失败的根因。本批保留两个 60000ms 配置，未提高 TTL、放宽过期拒绝或引入时钟校准协议。

[PhoneCore](../src/phone-core.ts)在每次分段和恢复时重新生成 commandId/截止时刻；重开服务仍使用新读取，旧 mutation 命令继续拒绝。native 私有 HTTP 层传递既有序列化包，不重发任务。固定 fault event.time 只存在于接纳后的合成帧，不生成 expiresAt；驱动轮询的 Date.now() 只关联私有控制文件。未发现 60 秒驱动等待复用同一读取命令的路径。

## 最小修复

[parseCommand](../src/link-protocol.ts)只采样一次桌面时钟，按 0 < expiresAt - checkedAt <= maxCommandTtlMs 接纳。此前两次读取可能在时钟跳变时产生不同判断；本批消除该问题，但没有旧日志证据表明第五次由此触发。CommandExpiryError 的线错误码仍为 request-expired。

[MobileBff](../integration/mobile-bff.ts)仅在可信桌面端保存 elapsed/future-limit 计数和最近一次 expiresAt/checkedAt/maxCommandTtlMs。私有 service state/final report 包含该诊断；没有请求内容、身份、密钥或凭据，也不加入手机/guest 的线错误 details。报告只保留最近一次数值，内存不随请求增长。

[故障夹具](../integration/native-follow-faults.ts)中的 consumed 仍表示取走一次注入，发生于命令接纳之前。新增 written 只在 bounded carrier write 完成后记录；过期命令可以 consumed=1、written=0。written 也不能证明手机接收或语义接纳。驱动按 written 等待，再用原生日志和唯一快照文字验证手机结果；总故障预算、清理期限与失败退出规则保持原值。

## 本批验证

| 层次 | 结果 | 证据 |
|---|---|---|
| 共享 TS 与 integration 编译 | 68 模块通过 | [编译日志](../evidence/phase21-compile.log) |
| 相关 Node 测试 | 62 通过、0 失败 | [测试日志](../evidence/phase21-focused.log) |
| Gateway/Session/Rich 实际源码离线回放 | 10 通过、0 失败 | [host 回放报告](../evidence/phase17-focused-2026-10-12T09-25-57.991Z/summary.json) |
| ArkTS/HAP 编译、ArkWeb 原生执行 | 本批未执行 | 原 v17 HAP hash 未变 |
| 真实桌面、真机、配对/WAN/签名 | 未执行 | 原有阻塞保留 |

Node 覆盖有效 TTL、截止相等/刚过期、未来上限、正负时钟偏差、秒/毫秒单位、单次采样、恢复/重开新截止、旧命令拒绝及过期后停止重试。离线 BFF 两种拒绝分支均证明：保留 request-expired、记录数值诊断、已取走故障未写出、下一新请求仍进入 cursor 校验、旧请求继续拒绝、零新增 prompt/真实模型。五种 byte/semantic fault 和 socket 恢复/服务重开回归继续通过；原先固定四响应仍仅在其原有合成场景内消费。

首次严格检查发现 Context 声明合并和一个测试参数缺少类型，已修复后编译通过。首次离线 BFF 测试有 8 项在 D:\Temp 自有合成 workspace 的 realpath 被沙箱 EPERM 阻止、2 项纯 fixture 通过，尚未进入行为断言；[失败报告](../evidence/phase17-focused-2026-10-12T09-25-01.755Z/summary.json)保留。按仓库指令原样执行同一命令的最窄 host 重试后 10 项通过；未改 fixture 路径或取消产品检查。

实际运行命令为 node scripts/check.mjs --integration；node --test tests/command-expiry.test.mjs tests/follow-recovery.test.mjs tests/link.test.mjs tests/native-fault-runner.test.mjs tests/native-window-policy.test.mjs tests/native-acceptance-driver.test.mjs tests/native-network-lease.test.mjs；node scripts/phase17-focused.mjs；node --check scripts/phase17-native-driver.mjs；node --check scripts/phase21-expiry-review.mjs；node scripts/phase21-expiry-review.mjs。没有重复全套测试或运行 SDK/HDC。

## 续接与回退

第五次窗口消耗完毕；本批不请求新的原生批准。后续若另有执行授权，只续接 socket、cursor-gap、cursor-conflict，保留原四项通过和三项失败的历史结果。每项先确认 sourceMode=reopen、零 dispatch、旧期限守卫与精确归属，再记录 fault consumed/written 和 commandExpiry 前后值；命中 request-expired 时不得把故障取走计数解释为送达。socket 必须通过唯一 reset-snapshot 文字的原生接纳，gap/conflict 必须命中准确原生错误和只读判据。

[修改前 hash](../evidence/phase21-before-hashes.json)和 .build/phase21-before 保留本批修改前的 11 个文件；封存 v20 及之前源码链、旧原生日志、ZIP/HAP 都未覆盖。回退仅恢复本批列明的客户端文件，移除本批新源码文件；保留新增证据与其他任务写入。不能用回退恢复原生资源或原批准窗口。
