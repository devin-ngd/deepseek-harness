---
kind: reference
description: 桌面最终提交的可访问性按钮定位、面板回读和两条消息准入验证。
---

# 桌面最终提交离线修复

桌面启动适配器只有在新观察中确认当前会话的面板状态为 `transport-started`、且没有待答确认框时，才报告提交已确认。[提交后核验的单次主机调用](mvp-postclick-offline-20261031.md)已接入，最新 211 项定向检查和原机验收限制见该文；[此前整合报告](../evidence/desktop-submission-offline-1793374248322-6e94e3a0.json)保留其 131 项离线和 12 项控制集成结果。[最新实机窗口](mvp-rc225-a3-20261031.md)仍未完成手机回复、停止和三分钟验收。

## 修复范围

[上轮实测](mvp-rc221-repeat-20261030.md)中，桌面点击调用返回后，同一个连接确认框仍存在，手机挑战随后关闭。离线反例复现了原适配器的错误判断：点击调用返回但画面仍为待确认时，启动结果的 reason 为 null。该例修复前失败，修复后返回 `action-outcome-unknown` 并完成正常双端停止；消息流程调用次数为 0。这项代码修复不证明上轮坐标点击失效的唯一原因，也不据此断言 DPI 故障。

[桌面适配器](../operations/connection-ui-adapters.mjs)使用当次观察中唯一、启用且文字匹配的可访问性按钮。调用方审查正常确认框中的 Allow，并返回 `elementIndex`、`elementText`；最终按钮文字必须匹配当前语言的 `submitAnswer`。传给 window2 的点击参数只有原 Window 与 `element_index`，不再接受坐标或截图坐标回退。正常停止同样使用新观察中的可访问性按钮。

[观察解析器](../operations/desktop-connection-observation.mjs)从当前面板的“经过过滤的公开结果”编辑控件读取 JSON，只接受配置中的 profileId 和 sessionId。历史消息里的 `transport-started`、缺少面板、旧 `route-ready`、重复面板、损坏 JSON、切换会话／窗口或仍在等待回答，都不能作为提交成功。调用方必须提供当前工具语言的角色名和界面文字；不猜测缺失语言配置，也不扫描其他会话。

## 提交与取消

两端最终动作仍由原[协调器](../operations/connection-ui-start.mjs)连续发出，在等待桌面点击返回或后续回读前，手机动作已经发出。桌面提交必须使用 `submitAndObserve` 端口，将一次点击和最多 `maxSubmitObservations` 次回读放在同一次主机调用内；间隔由主机执行器的 `pause(signal)` 持有，不重复点击，等待结束本身不能证明提交成功。适配器验证序列化回执后再次检查实际面板字段，不回退到旧分离请求。动作截止仍由协调器和同一单调时钟控制，主机子调用使用对应的原截止，不修改中继挑战期限、路由截止或收尾预留。

`submissionEvidence()` 分开返回点击状态、面板核验状态、回读次数和失败码。即使 click 为 acknowledged，verification 仍可能为 confirmation-pending、result-missing 或 not-started；这类结果不能进入消息流程。核验成功也只证明桌面提交状态，不证明手机 E2E、会话目录或持续连接。

回读期间取消或超时后，owner 先等待原始桌面点击、回读及观察间隔调用完成，再正常停止。清理截止时尚未完成仍报告 pending；调用方必须继续持有 owner 并等待 `settled()`，不能把取消、已请求停止或超时当成已经释放。另一端继续独立收尾，route 撤销与中继恢复仍由窗口 owner 负责。

## 接入两条消息

[统一入口](../operations/mvp-verified-start.mjs)调用协调器的 `start()`；只要 reason 非 null，就返回 messages 为 null，不调用消息端口。成功后才执行[消息流程](mvp-message-flow-20261030.md)。消息流程在原进程／窗口里有界等待已知“连接中”变为“已连接”，期间不导航、输入、发送或重连；如果变为未连接、对象变化、取消或到期，立即停止。

调用方先完成原对象、临时路由、语言及正常许可审查，再在同一工具调用内使用 `prepareAndStartVerifiedMvpMessages` 完成两端准备和提交，避免准备后等待模型下一轮调用而过期。同步工厂使用同一时钟创建新动作预算，并在返回前保存 connection owner。消息失败按原错误向上报告，不重发；成功后连接仍由调用方持有，以便独立观察至少三分钟。所有结果都必须执行 `stop()`、等待 `settled()`，并独立撤销 route、恢复中继；准备失败且工厂尚未调用时，caller 仍拥有并负责排空两端适配器。此入口不分配授权、发现设备或自动开窗口；旧 `.build` 手写坐标提交分支不可复用。

## 离线复验与限制

从 `clients/harmony-mobile` 执行：

```sh
node scripts/check-desktop-submission.mjs
```

该入口运行桌面提交、双端时序、取消／超时、消息输入、HDC 子进程替身、实际 ETS 条件和布局检查，再通过 `tsx/esm` 运行真实控制客户端与 broker 的内存集成。测试使用独立目录、合成 UI、虚拟时钟和固定测试密钥，没有手机或网络服务访问。零执行、失败、跳过、取消、子进程超时／信号、类型诊断或列出输入的摘要变化都不记为通过。

首次整合检查的行为测试已通过，类型检查暴露了新 JSDoc 声明问题和检查器 ES2022 标准库与既有 `Promise.withResolvers` 不匹配的问题；[失败记录](../evidence/desktop-submission-offline-1793357312872-953a92f7.json)保留。修正声明并按支持的 Node 22 能力使用 ES2024 检查后，最终报告零诊断，没有降低 strict 或跳过新模块。

实际可访问性按钮调用已有回执，但当前证据仍不能证明真实手机收到回复、停止成功或本轮持续连接。后续实机必须重新核对当前对象和语言，并使用本统一入口；已关闭窗口的批准和路由不能复用。本次只改主机验证流程，手机、桌面和中继产品载荷未改，无需为此重装或生成新 HAP。
