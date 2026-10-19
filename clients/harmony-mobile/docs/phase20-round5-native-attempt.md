# 第五次原生窗口：七项已执行，四项通过

本次按第五次明确批准，在既有 API26 自有模拟器、原 unsigned INTERNET 测试版和隔离合成 reopen BFF 上执行补验。七项均实际执行，四项通过、三项失败、零项未运行；失败后隔离继续，没有改判或放宽判据。整体仍未通过。[结构化结果与原始文件摘要](../evidence/phase20-round5-summary.json)保留准备失败、首次入口 blocked 和最终逐项结果；窗口已关闭，不重新打开。

## 时间与清理

首次转发为 `2026-10-12T08:22:46.868Z`，原总截止 `08:52:46.868Z`，清理预留从 `08:49:46.868Z` 起；首个 driver 截止 `08:43:14.084Z`。最终清理完成 `08:36:58.840Z`，总历时 14 分 11.972 秒，早于全部截止。两次映射按顺序替换，最多同时一条；第二次沿用首次时间与 driver anchor，没有重新计时。

| 准备或尝试 | 实际结果 |
| --- | --- |
| 初次准备 | 服务剩余寿命不足原 23 分钟要求，前置拒绝；从未建立转发。`08:15:08.421Z` 全部清理。 |
| 首次映射 `tcp:18081 tcp:47371` | driver 入场时 ready 记录已超过原 60 秒要求，七项均 blocked，尚未执行。`08:23:18.999Z` 全部清理。 |
| 同窗映射 `tcp:18081 tcp:19517` | 就绪、开转发、进入 driver 在同一进程顺序完成，保留原截止；七项全部执行，最终四通过三失败。 |

两个前置守卫保持原值。自有实例经实际 PID/命令行/5555 归属核对，普通无密码锁屏正常滑动，private document 和前台 native 控件确认后才转发。IDE 始终关闭；原 `local.dsh.mobile.lab` 保留，只安装并卸载独立 `local.dsh.mobile.netreplay`。映射、BFF、独立包和自有模拟器均已清理。[宿主只读核对](../evidence/phase20-final-host-check.json)确认指定端口为空、无模拟器/IDE、共享 HDC PID67100 仍运行。

许可只进行文件检查，没有许可 CLI、许可输入或安全配置变更。全部开始/停止前后 SHA-256 为 `4bc31a223ddc953bbddd05fed2f7d88b8f00fdf800de7647a0ea33eb4ccbefe4`，修改时间仍为 `2026-10-12T02:57:25.618Z`。原 HAP 摘要仍为 `f6ca9a68ea50936ed201723320859956cc88f1f90f33a74c9686ebee4d5a6a14`，本次未重编译或覆盖。

## 逐项实际矩阵

每项先 disconnect、清除未消费注入但保留总预算，再 reconnect 创建新 core，确认合法快照和 reopen 零派发状态。七项都进入 execute；真实模型、上传、prompt 和新增 replay 全为零。之前四个完成检查点仅核对记录，没有重发其固定工作。

| 项目 | 实际判定 | 实证 |
| --- | --- | --- |
| socket 自动恢复正验 | 失败 | socket 注入已 consumed，但等待后续自动读取计数时超时，`reset-snapshot` 唯一文字探针未被消费，不能声称数据接纳通过。原生出现 request-expired。 |
| invalid-json | 通过 | 新 native view 为 disconnected/readOnly/invalid-frame；原生固定提交按钮 disabled，source 零派发。[截图](../evidence/phase20-round5-native/round5-resume1/invalid-json.jpeg)。 |
| truncated-json | 通过 | 新 native view 为 disconnected/readOnly/truncated-frame；提交 disabled，source 零派发。[截图](../evidence/phase20-round5-native/round5-resume1/truncated-json.jpeg)。 |
| unknown-required | 通过 | 指定注入已消费，新 native view 曾 connected/readOnly/error=none；提交 disabled，source 零派发。[截图](../evidence/phase20-round5-native/round5-resume1/unknown-required.jpeg)。 |
| cursor-gap | 失败 | 指定注入已消费，但没有命中 cursor-gap 判据，观察超时；原生实际为 request-expired。 |
| cursor-conflict | 失败 | 指定注入已消费，但没有命中 cursor-conflict 判据，观察超时；原生实际为 request-expired。 |
| 恢复预算耗尽 | 通过 | 新 core 的四次 transport-reset 均 consumed，最终 native view 为 disconnected/readOnly/follow-recovery-exhausted，提交 disabled、零派发。[截图](../evidence/phase20-round5-native/round5-resume1/recovery-budget.jpeg)。期间额外出现 native-rich-failed，亦保留。 |

四项通过仅覆盖外显错误/只读/原生控件及零派发判据；HAP 的 view 不含 cursor/notices，内部原子游标和 notice 子项不能改记为直接 native 通过。服务 fixture 最终一个测试通过只确认它自身的计数与关闭，不代表整个原生矩阵通过。截图中历史 rich 区域仍留白，视觉、滚动与真人 IME 没有新增资格。

## 三项失败的当前证据

七项没有因为 socket 失败被跳过，驱动准确返回非零并在 finally 清理。三个超时场景的 native 日志有 request-expired；这是本次真实结果，不能换成期望错误码来判通过。客户端 HAP 的 command TTL 为 60000ms，adapter 的最大 TTL 也是 60000ms；[JSON admission](../src/link-protocol.ts)同时拒绝已过期和超出未来上限的 expiresAt，因此单凭 request-expired 不能区分迟到与两端时钟偏差。当前证据没有保存每个原命令 expiresAt 和服务接纳时间，尚不能确认根因；本次未修改时钟、TTL、安全守卫或协议。

下一步先离线核对实际 expiry 判断和三项源路径，补充不派发任务的精确诊断及必要回归，保持真实模型防护。任何新的原生执行必须另有对应批准；本报告不请求新窗口。原 [离线驱动审查](phase19-offline-driver-review.md)的安全隔离与失败保留已经实际生效，尚未证明的 socket/cursor 两项目标继续失败保留。

所有原 Temp 数据、历史 ZIP/HAP 和失败记录保留；[本次源码增量与回退索引](../evidence/phase20-source-delta.json)在既有 v19 依赖链之后保存本次授权入口和实证，不覆盖主仓其他修改，不提交或推送。
