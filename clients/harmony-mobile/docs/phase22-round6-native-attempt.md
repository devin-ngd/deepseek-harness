# 第六轮：原生时间诊断与前置阻塞

本参考对应用户批准的第六轮诊断复验。首次转发为 2026-10-12T10:36:44.450Z，原最大截止为 11:06:44.450Z；资源于 10:37:08.604Z 全部清理，实际窗口 24.154 秒，只有一条 tcp:18081 tcp:3741 loopback 映射，没有重开或重置。[汇总与原文件 hash](../evidence/phase22-round6-summary.json)保留本轮零通过、三 blocked 的实际结果。

## 实际执行与诊断

新的 API26 unsigned INTERNET-only HAP 官方编译通过，SDK 26.0.0.105、IDE 元数据 26.0.0.851、Hvigor/plugin 6.26.8，HAP SHA-256 为 18f28d8e46fbf80a08b7be81507adc347f7ec8de88cf1adb5769a8f6458bec49。[构建](../evidence/native-build/2026-10-12T09-50-25-874Z.json)和[封存 HAP](../evidence/phase22-hap.json)均有源码 hash，原 v17 HAP 没有覆盖。IDE 没有启动；正常 SDK 启动自有模拟器、纯文件许可核对、正常唤醒/无密码上滑、测试包安装和前台控件/私有文档就绪已确认。

初始 read.projects/read.sessions 接纳；进入 socket 场景前的 disconnect/reconnect reset 时，session.sync 被 request-expired-future-limit 拒绝。后两项按原隔离规则列为 blocked。未对三项执行注入：consumed/written/discarded 都为空，不能声称 socket 恢复或 cursor 错误判据已得到验证。[原生结果](../evidence/phase22-round6-native/native-driver-result.json)与[服务最终状态](../evidence/phase22-round6-native/service-final.json)完整保留。

PhoneCore 以 ArkWeb Date.now() 记录生成时间，ArkTS 在 requestInStream 前以 Date.now() 记录发送时间；桌面 carrier 记录 HTTP 接收时间，BFF 记录 parseCommand 的单次判定时间。全部采用 epoch milliseconds，按现有 commandId 关联；只记录时间、操作和有限测试故障字段，不记录请求内容或凭据，不增加公开线字段或 guest/native 执行方法。[五组完整配对](../evidence/phase22-round6-native/paired-timings.json)与[原生摘录](../evidence/phase22-round6-native/command-timing-excerpts.log)有生成/发送十条、桌面接收/判定十条，auditDropped=0。

| commandId 后缀 | 生成 | 发送 | 桌面接收 | 判定 | expiresAt | 判定剩余 | 拒绝 |
|---|---|---|---|---|---|---|---|
| 3 | 1791801415446 | 1791801415451 | 1791801415040 | 1791801415042 | 1791801475446 | 60404ms | future-limit |
| 4 | 1791801417107 | 1791801417112 | 1791801416730 | 1791801416732 | 1791801477107 | 60375ms | future-limit |
| 5 | 1791801422490 | 1791801422542 | 1791801422129 | 1791801422132 | 1791801482490 | 60358ms | future-limit |

三个包的 expiresAt - generatedAt 均为原 60000ms；生成到 native send 仅 5/5/52ms。发送必须先于桌面收到，而 native sentAt 分别高于桌面 receivedAt 411/382/413ms，确认两端时钟存在正向差异。单向传输与排队耗时仍未知，这些值是领先量下界，不能称为精确时钟偏移。判定剩余值超过桌面原 60000ms 上限，构成本轮拒绝的直接原因；不是等待 60 秒、秒/毫秒混淆、重用旧截止或固定 fault event.time。

本轮没有改 TTL、放宽未来上限、跳过到期拒绝、修改系统/模拟器时间或校准协议。诊断影响发送路径的耗时，不能用本轮值逐包反推第五轮旧日志；第五轮四通过、三失败仍原样保留。本轮只确认已复现的同类时钟风险。

## 清理与安全事实

[清理回执](../evidence/phase22-round6-native/forward-cleanup.json)确认精确映射删除、BFF 关闭及端口拒绝、独立 local.dsh.mobile.netreplay 卸载并缺失、自有模拟器停止及端口关闭，全部成功且未超截止。[最终 host 核对](../evidence/phase22-round6-native/final-host-check.json)无 IDE/模拟器，5555/16311/18081/3741 均未监听；此前共享 HDC 实际缺失，正常 SDK 启动自动产生的 loopback HDC PID33004 被保留，没有手动启动/停止共享 HDC。

许可仅纯文件 audit，开始/启动后/停止前/停止后 SHA-256 均为 4bc31a223ddc953bbddd05fed2f7d88b8f00fdf800de7647a0ea33eb4ccbefe4，mtime 均为 2026-10-12T02:57:25.618Z。未执行许可 CLI、输入接受/取消、改安全设置、创建持久凭据、公网/LAN 监听、上传或真实模型。BFF sourceMode=reopen，prompt/replay/realCalls/upload 全为零；没有重发前轮固定任务。

## 检查与续接限制

69 模块严格 TS、官方 API26 HAP 编译、36 项准备测试通过。本轮记录进入新增离线回归后，37 项相关 Node 测试通过；[日志](../evidence/phase22-after-native.tap)覆盖准确 404/375/358ms 超额拒绝。恢复执行后的 10 项固定服务回放通过，见[报告](../evidence/phase17-focused-2026-10-12T10-23-05.205Z/summary.json)。旧执行中断的 SIGTERM [回放报告](../evidence/phase17-focused-2026-10-12T09-48-46.565Z/summary.json)保留；通过旧构建回执核对产物，没有重复构建。原生结束后曾发生 exec-server transport disconnected，取得既有清理回执和文件后完成离线封存，没有重开窗口。

后续先在现有配置/协议内明确客户端请求寿命与桌面未来上限的关系。客户端 TTL 严格小于桌面上限可以留下有限时钟差余量，并缩短请求有效期，但它不能提供任意时钟偏差兼容或真实鉴权；必须明确允许偏差范围并继续拒绝超过上限/已过期的请求。本批仅分析，没有选择或改变这些配置，也没有添加时钟同步协议。第六轮已关闭，socket/cursor-gap/cursor-conflict 均需后续对应授权和新的原生证据；不在本批申请另一窗口。

所有修改仅在客户端目录，主仓其他任务的 dirty 文件及已安装 DSH 未改动。源码回退沿既有 v21 增量及前置源码链，只恢复本批列明的客户端文件；旧 ZIP/HAP、前轮 Session 数据和本轮原始证据不覆盖，不以回退复活批准窗口。
