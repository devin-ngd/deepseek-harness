# 原生故障验收驱动：离线根因与剩余方案

本次只审查已有日志、源码和测试驱动，没有启动 HDC、模拟器、安装或转发，也没有请求新的原生批准。产品源码、HAP、模型调用防护和历史结果保留；[第四次窗口](phase18-round4-native-attempt.md)仍是四项通过、socket 完整项失败、六项未运行。当前修复只获得离线资格，证据汇总见[审查结果](../evidence/phase19-offline-review.json)。

## 为什么 socket 超时后六项没有运行

| 分类 | 已核对的原因 | 结论 |
| --- | --- | --- |
| 事件语义预期错误 | [PhoneCore.follow](../src/phone-core.ts)只在 `model.accept(item)` 接纳数据时 yield；[NativeAppHost](../src/native-app-host.ts)据此发布 view。正常空续读段只有 end，不产生 view。 | 自动恢复不保证新发 `readOnly=false,error=none` 日志；不能把缺日志直接解释为产品恢复失败。 |
| 驱动退出错误 | 实际 acknowledgement 只有计数和 mode，缺少 `ready/url`；已发布 state 的 ready 为 true。旧 reconciliation 使用 `state.ready` 后得到假值，`step` 随即 throw 到全局 finally。 | socket 的一个观察超时使串行后六项根本未进入。不是原窗口时间耗尽。 |
| 驱动基础设施错误 | 恢复一的私有控制文件 rename 报 EPERM，普通 Error 同样直接退出串行程序。 | 原始失败保留；控制写入沿用同 sequence 的有限文件 rename 重试，不重发任务、action 或取消。 |
| 驱动隔离与汇总错误 | follow 的 `maxFailures` 在同一 core 生命周期累计；此前 socket 已消耗一次。旧代码继续失败项后还可能只写 `passed:false` 却退出为零。 | 四次失败预算场景必须先创建新 core；所有失败/blocked 汇总必须令总结果失败。 |
| 另一项预期错误 | [流解析器](../../../packages/api/gateway/src/stream-protocol.ts)把 JSON SyntaxError 包装成普通 Error；[ByteNetworkPhone](../src/network-phone.ts)因此返回 `invalid-frame`。新的精确断言首先失败，随后按源码修正。 | `invalid-json` 注入的准确错误码是 `invalid-frame`，没有放宽成任意错误。失败的离线报告保留。 |

原始 native 日志中，最后一次 view 是设备时间 `14:09:02.529`；故障在 `06:09:03.733Z` 被 armed。随后 `14:09:05.893` 的 SDK 报 `2300018`，之后出现新的 HTTP200/协议 header，最终有 16 次 follow，新增 prompt/replay 均为零。`06:09:52.652Z` 是观察超时，早于 driver 的 `06:11:45.476Z` 截止。上述事实证明读取重新开始，不能证明新的数据已经被 native 语义层接纳。

[NativeHttpIo](../harmony/entry/src/main/ets/native/NativeHttpIo.ets)在请求失败时清空尚未消费的队列；[NativeByteStream](../harmony/entry/src/main/ets/native/NativeByteStream.ets)把 `2300018` 映射为 transport-lost。故障 fixture 尝试发送过完整 reset，不能断言服务从未发送语义数据。该 reset 没有形成新 view，具体最后一块字节的回调时序没有证据；丢弃未完成 snapshot 是与源码一致的解释，并非已证明的逐回调重放。恢复后的空段不发 view 是明确的共享语义。连接文字保留最近接纳的状态，也不能单独证明当前链路健康。

当前没有证据确认产品恢复缺陷，也没有完整 native socket 恢复通过证据。缓存留白、IME 和视觉问题继续保持独立未验收状态，本次未修复产品功能。

## 最小测试修复

每个读故障前都执行同一隔离步骤：核对 reopen 模式和零派发；正常 disconnect 并确认；清除未消费的 fixture 注入但保留 consumed/discarded 和总上限；reconnect 创建新 core；确认合法 snapshot 的新 native view。隔离不关闭/重开 BFF、不重置总窗口，也不提交 task/action/cancel。确认隔离后，上一项失败仍保留，下一项继续；隔离、权限或原时限无法确认时，剩余项逐项记 blocked。

socket 正验保留自动恢复条件，并在后续自动 follow 注入只读合成探针。探针保留原 durable records 和 cursor，利用已有 assistantStream 字段携带唯一文字；不写 Session 日志、不调用模型、也不手动 reconnect 来替代自动恢复。只有 fresh native view 与真实 ArkUI Text 值同时接纳该唯一文字，且 source 仍零派发，才能通过。只有 HTTP200、旧 view 或无关 rich 查询造成的 view 更新均不足。这个新探针尚未经过原生执行；列表节点是否在当前 viewport 中可见不等于视觉验收。

[隔离 runner](../scripts/native-window-policy.mjs)返回全部 passed/failed/blocked；失败场景不自动重跑，也不会被后续恢复改判为通过。[驱动](../scripts/phase17-native-driver.mjs)汇总七项并在任何失败/blocked/缺证时退出非零；缺少计数时报告 null，不能虚报零。时限和清理预留保持原值，经过所有安全前提后，clock、场景与日志错误都进入全局 finally；日志写入失败不阻止清理请求和独立关闭核对。

## 剩余六项的真实观测条件

各项共同条件为：独立新 core、指定注入确实 consumed、匹配本项 baseline 之后的新 native 日志、只读 submit 按钮 disabled、source 的 prompt/replay/真实模型/上传均为零。不能用上一次 disconnect 的只读状态代替本项结果。

| 项目 | 必须观察到的 native 结果 | 语义及证据要求 |
| --- | --- | --- |
| invalid-json | `disconnected, readOnly=true, error=invalid-frame`，submit disabled | 非 JSON 完整行不能接纳或读取重试；共享核心保留 reset 的末个合法 cursor。 |
| truncated-json | `disconnected, readOnly=true, error=truncated-frame`，submit disabled | EOF 残留半行必须拒绝，不能误记 transport-lost 后继续；末个合法 cursor 保留。 |
| unknown-required | 新 view 曾为 `connected, readOnly=true, error=none`，submit disabled | 这是必要事件不支持导致的语义只读，不要求解析失败；共享核心应含 required-event-unsupported notice。本 one-shot fixture 的后续 cursor-ahead 可作为次级注入结果记录。 |
| cursor-gap | `disconnected, readOnly=true, error=cursor-gap`，submit disabled | 跳过的 relay cursor 不能被消费；保留 reset 的末个合法 cursor。 |
| cursor-conflict | `disconnected, readOnly=true, error=cursor-conflict`，submit disabled | 第一条合法 ignorable 项已被接纳，预期 cursor 是 baseline+1；冲突项不能再推进，不能错误要求回到 baseline。 |
| read-recovery-budget-exhaustion | 新 core 中恰有四次 socket 注入 consumed；`disconnected, readOnly=true, error=follow-recovery-exhausted`，submit disabled | 四次 timeout/transport-lost 累计耗尽该 core 的配置预算；不得带入前一场景的计数，不重派发任何桌面工作。 |

当前 HAP 的 view 不含 cursor 和 notices；精确 cursor/notice 已由共享 TS 核心的离线断言验证，不能将它们写成直接 native 观测。后续 native 表中可以确认外显错误、只读及零派发，内部 cursor 子项仍须注明证据层级。每项保存 native PID 日志、控制 sequence/consumed/计数、原生按钮属性、截图及最终关闭结果；socket 另存唯一探针的实际 native Text 值。

## 执行顺序与当前证据

1. 本阶段保持资源关闭。仅可用 `node scripts/phase17-native-driver.mjs` 查看 inactive 计划，不能复用已消费的 phase18 批准。
2. 未来取得独立明确批准后，按原前置核对准备同一个有截止和清理预留的窗口；使用既有合成 Session 的 reopen 状态及原 sealed HAP，验证四个已完成检查点的记录，不再次派发它们。
3. 顺序执行 socket 正验及表中六项。每项先隔离，独立失败继续，重置不明或权限/时限问题停止效果操作并为全部余项记录 blocked。禁止为完成矩阵延长窗口、增加映射并发或循环请求新窗口。
4. 全局 finally 完成精确清理后，逐项发布 passed/failed/blocked 和原始失败，整体只有全项证据齐全且清理确认才为通过。新的 native 执行、真实桌面和真机资格仍未获得，本报告没有请求新批准。

[22 项调度与守卫测试](../evidence/phase19-offline-runner.tap)、[8 项恢复语义测试](../evidence/phase19-follow-semantics.tap)、[8 项固定 replay/BFF 测试](../evidence/phase17-focused-2026-10-12T07-13-45.113Z/summary.json)通过，strict 检查覆盖 68 个模块。较早的 sandbox realpath EPERM 和准确错误码断言失败仍保留，没有覆盖或计入通过；host 重试只运行固定 replay 测试，没有更改产品沙箱。没有重跑此前 197/87 的完整客户端回归，也没有新的 ArkTS 编译或原生验收。

回退基准为原封存的 v18 源码增量及其依赖链。本次只改测试驱动、fixture 与测试，新增审查文档和证据；产品源码、HAP、主仓其他修改及模型防护均未修改。精确文件摘要与回退链保存在[本轮源码增量索引](../evidence/phase19-source-delta.json)。
