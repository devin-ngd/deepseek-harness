# 第二轮原生回放结果与离线修复

本页是限定原生回放的验收记录。已安装官方 API26 模拟器实际运行独立 unsigned `local.dsh.mobile.netreplay`，通过 ArkWeb 私有 MessagePort、原生 NetworkKit 和单条临时 HDC 转发访问真实 DSH 源码服务的四响应合成回放。本轮部分通过；缓存恢复失败和验收脚本退出失败均保留。没有真机、已安装桌面连接、真实配对或 WAN 资格。

## 实际验收

| 操作 | 结果与证据 |
|---|---|
| 固定任务与流式消息 | 原生客户端提交 `phase13-task`，真实 SessionController/agent-loop 使用第一条固定响应，页面呈现富表单和图表；[原生截图](../evidence/phase16-native-run3/native-screen.jpeg) |
| 富交互与 source-offload | ArkWeb 提交 `Final mobile input`／`7`；实际会话记录 `rich-inline/source-offload`，调用 `rich_inline_complete` 后动作完成、dataRevision=2、draftRevision=1；真实模型与上传均为零 |
| 重复任务／动作 | 首轮同一任务重发与同时提交同一 actionId 后，只消耗原定三条响应；仅一份 action ledger。第二轮任务重发的 prompt/replay 均为零。两个动作 Promise 都显示结算的原生证据未采集 |
| 挂起取消 | 第四条固定挂起响应就绪后点击原生取消；app 日志出现 `running → cancel_requested → cancelled`，四条响应全部使用、三次 prompt |
| 分段与重连 | 原生 HTTP 每十秒正常结束 follow 后继续下一段。显式断开、服务重开和显式重连恢复同一会话与富表单；[恢复截图](../evidence/phase16-native-run3/reconnected.jpeg)。异常网络断开自动恢复及预算耗尽未做原生注入 |
| 草稿与动作重开 | 服务持久状态保存提交的草稿、确认值、完成动作及两份任务 admission；新 wire instance 下重开服务没有新模型调用。未验证未提交草稿、并发 CAS 冲突 UI 或旧 mount 请求的原生拒绝 |
| Guest 隔离 | [实际 ArkWeb 探针截图](../evidence/phase16-native-run3/after-action.jpeg) 显示 parent DOM／popup／Worker／WebSocket／fetch／file／shell RPC 被阻断、宿主执行桥不存在；未覆盖 WebRTC、下载及长期资源隔离 |
| 保存、断开、恢复缓存 | 原生失败：`native-operation-failed`。断开清掉了 PhoneLibrary，恢复命令因此没有所选会话。此结果保留，修复后的源码尚未重新在模拟器执行 |
| 验收进程退出 | 退出码 1：服务释放后访问已被移除的 `ctx.llm`。资源关闭成功与测试失败分别记录；不得将该次 Vitest 记为通过 |

完整结构化结果、文件 SHA-256、固定派发记录及未验证项见 [原生摘要](../evidence/phase16-native-run3-summary.json)。原始 app 日志、服务失败日志、会话检查、持久状态和截图归档在 `evidence/phase16-native-run3/`；内容仅属于公开固定 fixture。模拟器截图命令产生的锁屏图没有作为 app 验收证据。

## 限时资源与许可

转发首次建立于 `2026-10-12T03:09:52.909Z`，原截止时间为 `03:39:52.909Z`。清理完成于 `03:29:40.292Z`，总时长 19 分 47.383 秒；没有续期或替换映射。唯一映射为 `tcp:18081 tcp:37526`，合成 BFF 仅监听主机 `127.0.0.1`。

[清理记录](../evidence/phase16-native-run3/forward-cleanup.json) 确认精确映射移除、映射表为空、BFF 关闭并拒绝 TCP、独立应用卸载与缺失、本任务模拟器正常停止且端口 5555 关闭。另行只读核验 PID27416 已退出，共享 HDC PID67100 保留。用户保存退出的 DevEco IDE 未重开，已安装 DSH 和主仓原有 dirty 文件未操作。

本轮只读取许可文件元数据与指定字段，未调用 `-license`、未回答或取消许可问答、未复制原始许可文件或写入标记。前后 SHA-256 均为 `4bc31a223ddc953bbddd05fed2f7d88b8f00fdf800de7647a0ea33eb4ccbefe4`，修改时间均为 `2026-10-12T02:57:25.618Z`，两字段保持 agree。

## 已修复与续接

`NativeAppHost` 在断开后保留所选会话的只读显示及缓存读取，释放 transport 和 rich mount；任务提交被拒绝。切换会话或关闭时丢弃该选择，另一会话无法读取旧缓存。新增离线用例覆盖保存→断开→恢复、无重新连接、禁止提交、跨会话拒绝和关闭后拒绝。验收脚本的最终 LLM 断言移到释放服务之前，原失败日志保持原样。

已运行 `check.mjs --integration`（61 模块 strict）、`assets.mjs`、`native-runtime-assets.mjs`、`native-adapter-build.mjs` 和 `node --test tests/native-runtime.test.mjs tests/native-network-lease.test.mjs`（[29 项通过](../evidence/phase16-postrun-tests.tap)）。`native-runtime-browser.mjs` 在重新生成所消费的 ESM 资源后通过 [32 项 Chrome／SDK 替身断言](../evidence/phase16-postrun-browser.json)，包括断开后缓存恢复；第一次浏览器启动遇到沙箱 crashpad IPC 失败，原样主机重试，Chrome 沙箱保持启用。首次主机回归消费了旧资源并失败，其记录也保留。新增 lease 用例拒绝已存在的计时文件，不能重新起算窗口。这些修复的验证层是纯 TS／SDK 替身；当前 HAP 封存件没有被覆盖，也不包含修复后的重新编译或原生执行证据。没有重跑完整 178 项回归或仓库全套检查。

本轮授权窗口已结束；再次原生联网、安装或真机运行需要新的对应批准。可独立续接故障注入 fixture、缓存失败的可读报告、旧 generation 验证和未提交草稿同步测试。真实配对、长期凭据、开放端口、证书、签名、手机权限、真机安装和实际桌面任务仍需单独批准。回退依据为未修改的 v15 源码 ZIP、v15 offline HAP 和本轮 netreplay HAP。
