# 第四次原生窗口：部分通过，窗口已关闭

本页记录同一个已批准窗口的 API26 模拟器实证。四个完整检查点通过，socket 中断后的原生 HTTP 读取恢复有观察证据，但完整判据未通过，六个后续故障项未运行。整体结果为部分完成；[结构化结果及逐文件摘要](../evidence/phase18-round4-summary.json)保留三个驱动结果中的失败，不将服务 fixture 的通过解释为整套原生验收通过。

## 执行和清理

首次转发建立于 `2026-10-12T05:50:46.093Z`，原截止为 `06:20:46.093Z`，自动清理预留起点为 `06:17:46.093Z`。两次同窗恢复保留这些时间以及首个 driver 的 `06:11:45.476Z` 截止，没有重新计时。每次先确认前一映射和资源清理，再创建下一映射；累计三次映射，最多同时一个。最终清理完成于 `06:10:03.309Z`，窗口总历时 19 分 17.216 秒。

| 顺序 | 映射 | 结果 |
| --- | --- | --- |
| 初始 | `tcp:18081 tcp:19938` | 状态 acknowledgement 缺少 endpoint 字段，驱动失败；未派发任务，完成清理 |
| 恢复一 | `tcp:18081 tcp:60001` | 四项通过，随后私有控制文件 rename 被 Windows 拒绝；完成清理 |
| 恢复二 | `tcp:18081 tcp:19490` | 仅重开自有合成数据，没有重发任务；socket 项观察超时，完成清理 |

开始转发前，实际核对 API26、独立包 PID、private document ready 日志、前台 native 按钮以及未使用的固定 replay 服务。普通无密码锁屏经已批准的常规滑动进入主屏，没有认证尝试或安全设置修改。HAP 是此前封存的 unsigned v17，SHA-256 为 `f6ca9a68ea50936ed201723320859956cc88f1f90f33a74c9686ebee4d5a6a14`；本次没有重编译、覆盖旧 HAP 或启动 IDE。

三个结果均确认移除精确转发、关闭 BFF、卸载独立 `local.dsh.mobile.netreplay`、正常停止自有模拟器和关闭端口。原 `local.dsh.mobile.lab` 未被卸载。许可文件只读摘要与修改时间始终一致；未调用许可 CLI、发送许可输入或更改 developer mode。清理命令没有停止共享 HDC；[06:25 的后续只读主机快照](../evidence/phase18-final-host-check.json)未观察到原 PID67100，原因未核实，没有重启它。该快照中自有进程和端口均为空。

## 原生验收矩阵

| 项目 | 本次证据 | 判定 |
| --- | --- | --- |
| 固定任务、流式结果、富表单/action、source offload | 实际 ArkUI/ArkWeb → private port → NetworkKit → 隔离 DSH SessionController/agent loop/rich services，固定输入和数量 7 返回；[rich 截图](../evidence/phase18-round4-native/round4-resume1/rich-action.jpeg)及 create inspection | 检查点通过；表单由 fixture 自动提交 |
| 断开后只读缓存恢复 | native FS 保存/恢复成功日志、断开后的只读状态；[缓存截图](../evidence/phase18-round4-native/round4-resume1/cache-restored.jpeg) | 检查点通过；视觉完整性未验收 |
| 固定挂起任务取消 | 第四固定响应进入挂起，再经 native 按钮取消；native `cancelled` 状态 | 通过 |
| 服务重开、旧 rich 挂载拒绝、重复任务不重派发 | 同端口真实关闭/重开服务，wire instance 改变；native probe `passed:true, forwarded:0`；重开后 prompt/replay 为零；[重开截图](../evidence/phase18-round4-native/round4-resume1/service-reopened.jpeg) | 通过；不代表旧 ArkWeb document/private port 的并发竞态已验证 |
| socket reset 自动恢复 | 故障已消费，native 后续 HTTP200/协议 header 日志、最终 16 次 follow、新 prompt/replay 为零 | 仅传输恢复有证据；完整项未通过 |
| invalid/truncated JSON | 没有本次原生结果 | 未运行 |
| unknown required event | 没有本次原生结果 | 未运行 |
| cursor gap/conflict | 没有本次原生结果 | 未运行 |
| 读取恢复预算耗尽 | 没有本次原生结果 | 未运行 |

create 服务总计使用四个固定 replay 响应、三次 prompt；此处第三次是固定取消场景。两个 reopen 服务的新增 prompt/replay、所有服务的真实模型和上传均为零。最终服务 fixture 的一个测试通过，只确认其自身计数、关闭和断言，不覆盖表中缺失的 native 项。

## 未完成项与离线修复

socket 判据要求中断后新发一条 `readOnly=false,error=none` 的 native view 日志；相同 cursor 的恢复未产生新的语义消息，因此已有 HTTP 恢复证据不能满足这个判据。需补充能读取当前 native 状态的独立观察方法，不能把传输日志替换为完整 UI/恢复资格。驱动 reconciliation 还误把只有 counters 的 acknowledgement 当成带 `ready/url` 的状态，导致安全独立场景提前终止。

当前离线脚本合并同 sequence、同 instance 的已发布 readiness 与 acknowledgement，拒绝缺失字段、旧 generation 和非 loopback endpoint；失败项仍保留失败，不重复效果操作。恢复前的等待也被原清理预留时间和单调时钟限制。新增反例和现有守卫合计 [17 项定向测试通过](../evidence/phase18-policy-tests-after-window.tap)，三个可执行脚本及 policy 的语法检查通过。这些离线修复没有重新进行原生验证；本次窗口已经消费，不得复用来创建新的窗口。

人工查看三个截图后，缓存页的早期 rich 区域留白、底部按钮文字省略、完整表单滚动可达性和 IME 编辑仍缺验收。故障矩阵补齐前，也不能宣称 UI 已可供日常使用。此前 [197 项独立测试和 87 项 Chrome 测试](../evidence/regression-final-regression-final-Omgtjq/summary.json)属于 v17 准备阶段，没有为本次脚本修复重复整套运行，也不能替代 ArkWeb 实证。

当前只证明独立模拟器中的隔离合成 replay。用户已安装 DSH 的受支持 profile、真实桌面身份与审批 mux、用户 Session、真实模型、真人表单输入、真机、配对和 WAN/TLS/签名均未验收。后续可继续离线修复和设计；新的原生连接、真机安装或安全权限操作需要各自对应批准。旧 v17 HAP、ZIP、历史失败和原 Temp 证据保留；本次脚本/文档/证据通过独立源码增量封存，回退使用原 v15 base 与两个 v17 增量，不将本次编排修复应用到主仓其他代码。

回退和复现所需的依赖链、文件摘要见[本轮源码增量索引](../evidence/phase18-source-delta.json)。归档命令本身不激活原生资源；新增脚本只获得离线资格。
