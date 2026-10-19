# 第十五批：共享投影与有界读取恢复

本批补齐 phase14 的 source-offload 投影缺口及有界流恢复。执行范围为纯 TS、固定回放服务、临时 loopback 测试和已有官方工具链编译；没有建立转发、安装联网变体、启用配对或连接已安装的用户 DSH。原生 HTTP、ArkWeb 和真机验收仍沿用 [phase14 的限定证据](phase14-native-network-execution.md)。

主客户端目录为 `clients/harmony-mobile`。上游改动位于独立 detached checkout `D:\Temp\dsh-harmony-upstream-v15-20261011`；[源码定位](../projection-source.json) 和 [14 文件补丁](../evidence/phase15-upstream.patch) 记录来源，`source.json` 保持原样。补丁未应用到主仓，未提交或推送。主仓 dirty 文件和封存 v14 ZIP／HAP 保留原字节。

## 共享实现

`rich-inline/message-projections` 提供 Host 使用的同一组严格解释器，校验原始源码位置、UTF-8 SHA-256、唯一 authored key、块标识，以及工具调用与成功结果的因果关联。Host 仍使用 Node SHA-256；客户端使用仓库已有的 `@noble/hashes` 2.4.0。`SurfaceManager` 保持替换和消息投影的唯一实现，手机显示原始 authored 内容及持久消息标识，不显示模型用的源码占位符。没有复制 guest SDK，没有引入 Electron 特权桥，也没有改变 Session 事件格式。

完整历史中的合法 source/tool offload 可以交互。首次读取的窗口缺少早期原始目标时，保留可读历史并标记只读；补齐规范 backwards page 后重新校验。未知 required 事件、尚未支持的 image/offload、无效哈希、错误关联或损坏数据继续拒绝或只读退化。恢复缓存始终先只读，远端完整 reset 验证后才开放写操作。

## 有界恢复

Carrier 在显式 `followSegmentMs` 内结束一次读取，使用现有 stream `end` 帧。PhoneCore 的显式 `FollowPolicy` 只监督 `session.sync`：每段使用新的命令 ID／到期时间和最后已验证的恢复游标。恢复次数、段数与等待均有限；不会重试 task.submit、rich.invoke 或桌面 cancel。重复事件不推进游标，乱序／冲突／截断停止读取并保持已验证历史只读。取消 foreground 等待正常结束，不触发桌面取消；用户发出的 cancel 仍走原有独立操作。

服务重开返回新的 instance 和规范完整 reset。旧 rich 挂载不能向新代次发送请求；旧 guest 路由的 teardown 只撤销本地记录，远端旧服务资源由其服务生命周期负责。原生宿主随后申请新挂载，恢复持久草稿和 action 状态。

## 验收矩阵

| 场景 | 已取得证据 | 仍需验证的层 |
|---|---|---|
| v14 source-offload 首次读取与完整恢复 | 真实旧日志、原始 rich 引用、缓存恢复、完整 reset；合法历史可交互 | v15 ArkWeb 实际运行 |
| 部分历史与缺失原始目标 | 只读退化、补页后严格投影；伪造／重复目标不消费游标 | ArkUI 历史翻页操作 |
| 工具源码投影 | 隔离 Host 与浏览器使用同一解释器；关联／哈希损坏拒绝 | 原生 tool-publication 交互 |
| clean segment、断线、去重、乱序、截断 | 有界单元用例及真实 BFF 分段读取；预算耗尽只读 | NetworkKit 超时／后台恢复 |
| 草稿、action、取消、服务重开 | 实际 DSH 服务消费恰好四个固定响应；原始回执、草稿及 completed action 恢复，重开后 0 派发 | 原生重开、去重及取消完整闭环 |
| rich 隔离与 native 权限 | 既有安全回归、87 项 Chrome 断言；旧代次挂载不转发 | v15 ArkWeb 恶意 rich／导航／端口攻击 |
| ArkTS／HAP | [本批构建及封存摘要](../evidence/phase15-summary.json) | 安装、模拟器执行和真机 |

[完整回归](../evidence/regression-final-regression-final-S0u7A7/summary.json) 通过 154 Node + 12 source replay + 12 BFF = 178 个独立注册用例，3 个 embedded child 用例已包含在 BFF 父用例中；没有丢失历史用例。Chrome 断言为 15 + 15 + 25 + 32 = 87。全部使用合成会话，真实模型和上传均为 0，loopback 监听均关闭。[真实服务摘要](../evidence/phase15-services.json) 记录了 source offload、草稿 CAS、幂等 action、第四响应取消、持久重开和旧挂载拒绝。

上游持久化检查报告 65 roots 与 15 条历史记录一致，`changes: []`，生成目录只更新声明位置，不新增 acknowledgement 或版本。JSDoc 收集器对本批及当前基线均返回 0 项；Markdown 链接、段落换行、文档预算、tsconfig aliases 和 README 中英配对检查通过。完整 `doc-sync` 未完成：CLI help 的 `acp --help` 子进程超时后停止执行，不能据局部检查声称整个文档聚合通过。

文档检查中的 pnpm 自动 pre-run 同步曾把 24 个现有 workspace 依赖链接指向隔离 checkout；已逐项恢复并重新扫描确认剩余 0 个。没有删除依赖目录或升级版本。后续在这种共享依赖布局中禁用 `autoInstallOnRuns`，或直接调用已有运行时；不再使用会自动同步依赖的默认 `pnpm run`。相关副作用及检查结果保存在本批摘要。

## 下一次原生批准的最小范围

当前不申请、不启用下一次联网验证。准备好新版独立 unsigned 测试 HAP 并重新核对 source hashes 后，需要父任务另行取得一次至多 30 分钟的批准：仅已有 API26 Phone 模拟器、独立 `local.dsh.mobile.netreplay` 应用的 INTERNET 权限、一个 emulator `127.0.0.1:18081` 到测试进程临时 loopback 端口的 HDC 转发，以及原有固定四响应服务。到期前保留清理余量，撤销转发、关闭服务、卸载独立测试包、停止本次拥有的模拟器并复查；不停止共享 HDC，不覆盖既有离线 lab 或已安装 DSH。

待跑顺序为 rich action 后 source-offload 保持可交互 → 两段 clean follow 连续恢复 → 相同任务 ID 不重执行 → 第四响应真实取消 → 服务重开后的回执／草稿／action 恢复与旧 lease 拒绝 → 未知 required／截断和恶意 rich 的只读／隔离检查。若许可窗口不足，先清理并报告，不能自行续期。真机安装、签名、账号和权限仍需单独批准；模拟器或 Web 成功不能替代真机证据。

## 回退和复现

客户端回归入口仍为 `node scripts/regression.mjs`，构建为 `node scripts/build-native.mjs`。源码补丁定位的 checkout 必须保留；迁移机器时在相同基线的独立 checkout 应用补丁，显式更新 `projection-source.json` 的 checkout，复查输入哈希后再构建。不能把补丁直接覆盖到 dirty 主仓。封存 v14 可用于回退；v15 的 ZIP／HAP 地址和 SHA-256 见本批摘要及 archive-v15 manifest。
