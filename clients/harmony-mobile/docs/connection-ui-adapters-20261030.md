---
kind: reference
description: 桌面和手机 UI 适配器的准备、双端提交、取消、超时收尾及离线验证范围。
---

# 双端 UI 启动适配器

桌面和手机 UI 适配器已接入[启动协调器](../operations/connection-ui-start.mjs)。最新[桌面提交修复](desktop-submission-offline-20261030.md)完成可访问性按钮定位、当前面板回读及两消息入口的离线验证。本轮没有打开已安装应用、调用原 HDC、读取原配对、操作中继或重开窗口。原候选保持；上次实机握手未通过的结论不变。

## UI 接入与准备

[桌面适配器](../operations/connection-ui-adapters.mjs)接收现有 Computer Use window2 客户端和实际选中的原 DSH Window，使用 `get_window_state` 与 `click`，不启动应用或通过内部接口执行命令。调用方在 `node_repl` 中选择当前窗口、按工具要求观察并审查同一 Session 的正常连接确认框，先选好 Allow。`review` 对当前画面返回 `elementIndex` 和 `elementText`；适配器核对唯一、启用且文字匹配的按钮，最终文字还须匹配当前语言的 `submitAnswer`，不自动选择许可或退回坐标。不能伪造 Window、用旧索引或跳过观察审查。

[手机适配器](../operations/connection-ui-adapters.mjs)通过[有界 HDC 端口](../operations/connection-hdc-port.mjs)操作原应用正常 UI。调用方先核对原目标、进程和窗口，并分配本轮唯一的 `/data/local/tmp/*.json` 布局路径。适配器检查目标引用、PID、原 bundle、页面、窗口和外来覆盖层；仅在已配对、未连接、原主机可见、主机许可已勾选且唯一连接按钮启用时准备最终点击。它不勾选许可，不输入 route、配对信息或消息，也不安装、重启应用或清除数据。

两端构造均不执行 IO；`prepare()` 只采集和审查，不连接。准备只能执行一次，有效期从画面采集时开始，包含审查耗时；取消、过期、对象改变或审查失败均不能复用该实例。手机布局只在内存解析，每次采集均等待确切临时布局路径移除；不保存完整界面、日志或原始错误。

## 双端提交与取消

调用方先完成正常产品准备及采集／停止／独立撤销准备，再等待两端 `prepare()` 完成，创建 `createUiConnectionStart` 并调用一次 `start()`。协调器复用[prepareConnectionStart](../operations/prepared-connection-start.mjs)，在等待任何动作确认之前连续发出两端最终动作；两者之间不重新采集界面或处理许可。动作间隔、动作确认截止和清理报告截止均显式传入，使用同一单调时钟，调用间隔必须严格小于现有挑战期限。

使用当前桌面适配器时，`start()` 成功要求桌面点击返回后的新面板结果属于原 profile／Session、状态为 `transport-started` 且没有待答确认框；最多读取 `maxSubmitObservations` 个新画面，失败立即收尾，不重复点击。`submissionEvidence()` 将点击回执与面板核验分开。该结果不代表手机拨号、握手或持续连接成功；消息只通过[统一入口](../operations/mvp-verified-start.mjs)继续，并等待手机明确已连接。调用方仍持有生命周期取消信号；双端确认之后取消也会停止本地连接。提交前取消不会连接，首端提交中取消会阻止第二端提交；已经发出的动作结果未知时不重试，也不认为取消撤回了动作。

`stop()` 请求正常本地停止并返回当前清理结果；重复调用不会重复 UI 操作。`settled()` 仅等待已经请求的停止完成，未请求停止时拒绝，不隐式触发 UI 动作。调用方在开始停止后保留 owner 和驱动，直到 `settled()` 完成；不得把它们提前销毁或据一次回读重放连接。

## 超时与收尾

动作确认超时会取消两端准备并开始本地停止。桌面工具没有 AbortSignal 接口，因此停止必须先等待其原始点击调用结束，再采集新画面、正常关闭待答确认或点击“停止本地连接”，最后独立观察无待答确认、原绑定保留及停止状态。每个关闭／停止动作都有新画面和新审查，动作次数有上限，不用旧截图再次点击。

手机 HDC 调用在取消、命令超时或输出超限时请求终止子进程，等待真实 `close` 后才结算结果；即使晚到退出码为 0，已取消的调用也不会算成功。随后以独立清理调用重新检查原 PID／窗口，正常点击 `product-route-stop`，再次检查仍已配对、未连接、连接按钮禁用。清理调用不继承已经取消的提交信号。

到清理报告截止时仍有调用未结束，结果保持 `pending`，owner 继续持有并等待原工作；不能报告已停止、已释放或安全重试。无法确认原对象或停止结果时为 `failed`，另一端仍继续收尾。HDC 子进程若不响应终止、桌面工具一直不返回或人工审查未结束，仍可能长期 pending；本实现没有强制终止桌面工具的保证。

这里的收尾只覆盖双端本地 UI。中继停止、route 持久撤销、独立重读及配置恢复仍由获批窗口 owner 按[原收尾要求](rc216-next-window.md#收尾验收)执行；`stopped` 不代表中继已经撤销。新窗口必须有新的具体授权与当前对象核对，不能复用旧 claim、route 或批准。

## 离线证据

在 `clients/harmony-mobile` 执行 `pnpm run test:connection-start`。定向回归覆盖原错峰矩阵、协调器、UI 适配器及 HDC 端口；默认单元入口也包含新用例。源码控制集成通过显式 tsx ESM 子进程运行，外层包装检查不重复计为行为用例。

[UI 回归](../tests/connection-ui-start.test.mjs)使用合成 window2 与 HDC 命令响应，覆盖双端提交、提交前／提交中／成功后的取消、迟到失败、动作超时、清理 pending／failed、窗口和进程变化、未勾选许可、外来覆盖层、过期观察与迟到审查。[HDC 回归](../tests/connection-hdc-port.test.mjs)使用实例子进程替身和虚拟时钟，验证精确参数、无 shell、UTF-8 分块、取消／超时等待 close、输出上限及失败不重放。

[控制集成](../integration/connection-stagger.test.mjs)还把适配器正常点击映射到当前真实控制客户端和中继：桌面确认调用尚未返回时双端已经取得同一房间，生命周期取消后两端 socket 和房间信号关闭。[本轮证据](../evidence/connection-ui-adapters-20261030.json)记录最终命令、计数、类型检查、文档检查及产物哈希。

以上证明本地代码及注入驱动的离线行为；不证明当前 UI 坐标、人工审查、工具延迟、HUKS、TLS、真实 E2E 或连续保持 3 分钟。没有新增签名、安装或候选包构建。
