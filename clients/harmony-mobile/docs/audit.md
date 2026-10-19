# 接口审计

审计基线是 `lumina` 的 `9fa2f1f705`，包含官方 alpha.2 的合入。主工作区有五个已修改文件和一个新增测试：Web rich-native 测试、rich-inline 双语 README、两个离线回放测试，以及 persona cwd 迁移测试。本实验未写入主工作区，未操作另一个实现线程，未重启或覆盖已安装 DSH。审计读取根 AGENTS、架构、文档标准、错误处理、prose 标准及 defensive patterns；只读取相关工具位置和 memory_summary，没有读取账户密钥、手机号、签名资料或私人文件树。

| 现有接口 | 实际语义与证据 | 手机端处理 |
| --- | --- | --- |
| Web Connection | `packages/client/connection/src/index.ts`、`rpc.ts`：`/api` 以 RPC envelope 承载 unary，含 Host/Origin 检查和 operator peer。`browser-auth.ts` 创建浏览器 session secret/cookie 和进程 launch token。 | 不将 operator cookie、launch token 或 `/api` 管理通道直接暴露给手机。真实接入需要设备范围 admission adapter。 |
| Typert Gateway | `packages/api/gateway/src/index.ts`、`stream-protocol.ts`：unary 由 Connection 承载，WebSocket mux 路径是 `/api/remote.mux`，逻辑 stream 按 endpoint 分发；`$events/result` 返回 waterfall 结果。 | 复用已有 codec、流和服务调用；设备层只暴露明确方法，不允许任意 endpoint、配置或文件读写。 |
| 会话与项目 | `packages/api/session-controller/src/index.ts`、`types.ts`，`workspace-controller/src/types.ts`：list/create、prompt queue/steer、cancel、follow、page、control，以及 workspace baseline/delta。 | 首版绑定桌面和 session；原生列表和 composer 不执行脚本。创建会话与执行目录的授权范围应由桌面 adapter 限定。 |
| Prompt 去重 | `session-controller/src/commands.ts:330`、`602`：requestId 在 inbox/已记录 user-rpc 消息中查重，已存在直接返回 accepted。没有按内容 hash 返回冲突；附件路径异步 admission 还需要检查竞争窗口。 | 重试保留 requestId；新增设备 admission journal 要比较 payload hash、串行化同 key，并明确 unknown outcome。不能把现有 accepted 当成每任务完成收据或 exactly-once 外部效果。 |
| Durable follow | `session-controller/src/types.ts:495`、`560`：follow 重新发 opening snapshot，含 cursor、history records、projections，可选 assistant baseline。page 使用 throughSeq 和 beforeSeq；follow 请求本身没有 afterCursor 字段。 | 复用 opening snapshot 与分页恢复，不能假设已有 resume-after-cursor API。需要增量 relay 时由 adapter 持有自己的有限序列与快照过期语义。 |
| Assistant 增量 | `session-controller/src/assistant-stream.ts`、`types.ts:502`：attemptId、revision、dense chunk index，process-local。结束指向 durable assistant/message 或 assistant/attempt 的 seq。 | 重连替换 live baseline；完整 settlement 再进入 durable 展示。手机挂起不能取消桌面任务，也不能将临时 chunk 冒充日志事实。 |
| 审批与问题 | `packages/api/remotes/src/remote-events.ts`：approval/request、user-questions/request 是 agent-scoped waterfall；`$events` 持有当前 client generation 和 eventId，断线取消有独立 frame。 | 敏感批准只由可信原生 UI 产生。后续处理多端竞答、过期、撤销、重新连接，需要检查 pending 服务语义；不能由富块决定授权或自动 next。 |
| SDK | `packages/sdk/protocol/src/types.ts`、`transport.ts`、`client/README.md`：newline JSON-RPC stdio，SDK 启动 dsh profile。wire 只有 initialize、prompt、wait、cwd read/set、shutdown；事件通知是 durable event 和 whole-agent status。 | 不在手机启动 Node 子进程；SDK 无 mid-turn cancel，也未实现交互 request flow，不选作手机客户端的直连协议。 |
| rich-inline | `packages/experimental/rich-inline/src/shared/types.ts`、`host/index.ts`：lumina-rich/1、host 绑定 scope、fresh mount、render/data/draft revisions、conditional poll、CAS、动作原始 receipt/outbox、完成匹配及 history/fork readOnly。 | 继续由桌面持有 ledger、CAS、actionId 和模型输入记录。手机只接 scoped mount 和 snapshot；不复制 ledger 为第二个权威实现。 |
| guest SDK | `rich-inline/src/client/guest-sdk.ts`：pure bootstrap，window.richGuest transport，window.rich 提供 draft/save/submit/status/cancel，保存最后输入，staged update barrier 与 bounded repair 另有控制器责任。 | 从原源码生成复用。ArkWeb 需要新的平台 carrier；guest SDK 不能直接使用 Electron preload。 |
| Desktop carrier | `rich-inline/src/client/native.ts`、`controller.ts`、`apps/desktop/src/rich-guests.ts`：reserve/send/subscribe/release、partition、preload、独立 guest process 和能力拒绝。nativeRich 只从 dshDesktop 发现。普通 Web 默认文本降级。 | 先提取平台中立 carrier，保留 controller/validation/runtime；Electron partition、IPC 和进程隔离不能照搬或宣称 ArkWeb 已具备。 |

本批没有修改 DSH SessionEventMap、SDK API、持久化格式或已提交的 Session generation，无 persistence-type 变更需要 acknowledgement。后续若提取公开 carrier 或调整接口，必须同步所有 consumer、README/JSDoc 和即时 upgrade guide；若添加 Session 数据再按仓库的 persistence-type review 执行。
