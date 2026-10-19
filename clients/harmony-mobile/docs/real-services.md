# 真实服务固定回放联调

本批在独立客户端目录内，用 Vitest 源码测试进程启动真实 Cordis Loader，组合生产 SessionController、RichInline、agent-loop、Session JSONL、StorageDomain/JSON 及其必需服务。`integration/cordis.yml` 仅声明被这些服务要求的提供者；注册层的 `disabled-carrier.ts` 提供 RPC/fetch 注册清理与临时 OperatorPeer，拒绝所有网络请求，不打开 socket。手机和 relay 仍是内存对象。这是实际服务组合测试，尚未启动受支持的 `dsh` 应用 profile、SDK 进程或已安装桌面。

测试入口只继承系统执行路径和测试临时目录，不继承模型/账户环境变量。显式 replay 模式与 `DSH_SNAPSHOT_REPLAY_ONLY=1` 必须在构造服务前存在；缺失任一项会拒绝。原有 `prepareOfflineSnapshot` 验证已提交的四响应 fixture；`installLlmReplay(offline:true)` 与真实 LlmRuntime 的有限计数和 dispatch guard 保留。此测试没有 SDK，因而不使用 SDK 专用入口的 `sdkReplay` 声明。没有安装真实 provider、上传 Session 日志的插件或凭据插件；request extension 的 spy 同时验证调用数为零。

四个固定响应槽依次为：包含两个 rich-html 表单的流式文本、`rich_inline_complete` 调用、完成确认文本、等待取消的 hang。最后一个槽通过真实 SessionController.cancel 取消；不增加第五个模型响应。主链先验证四次完整消费、零真实调用、零被阻断调用，再故意请求第五次，验证它在 request extension 前拒绝且计数器报告 blockedCalls=1。只读重开使用独立的四槽 replay owner，但不调用模型；零次消费必须触发原 exact-count 检查的不足拒绝。这两个负例都有显式断言，不能当作主链的干净消费结果。

`RestrictedDesktopAdapter` 只转发现有 canonical prompt/cancel/follow 和 rich 方法；draft、action outbox、completion correlation 及状态由真实 RichInline ledger 持有。手机提交的 actionId 和最后输入确实进入实际模型请求，完成工具确实改变 ledger。真实 actionId 的唯一范围是整个 Session：在另一个 block 重用同一 actionId 返回 ACTION_ID_CONFLICT；跨 Session 的 message mount 拒绝。历史 dispose/remount、上下文重开后查询和重发原 action 都保留原 receipt，不重新 prompt。

新增 `AdmissionJournal` 是显式适配器依赖。claim 先持久写入 session/requestId、desktop/device、规范请求指纹和 submitting，再调用 prompt；写入失败时不派发。只有新 claim 允许调用 prompt。accepted 记录只表示桌面受理；submitting 记录在重建后只查询 inbox/持久 user/message 证据，查不到就保持 unknown。接受后日志确认写入失败同样保持 unknown，不把失败变成可重试派发。真实测试观察到 inbox 已取出、user/message 尚未可见的短暂回执空档；等原任务落盘后只读查询才转为 accepted。

持久实现复用 DSH StorageDomain 的写队列与 JSON backend 原子发布，独立 domain 名为 harmony_mobile_lab，版本为 1；没有改变 DSH 已发布 Session 类型或代际。所有表记录在读取时严格校验，并核对 key 与记录身份。记录到达上限拒绝新任务，不删除未知 intent。恢复模式要求文件存在；缺失、损坏、非法状态、错误 key 和不兼容版本均拒绝启动并保留原文件。MemoryAdmissionJournal 仅供合成用例。每个存储实例只有一个写 owner；尚不支持并发多进程写入、有效旧文件回滚检测或生产端持久 admission 收据服务。

phone checkpoint 只保存已验证的 durable seq 和所有者，不保存凭据或 live attempt。因为 upstream follow 不接受 afterCursor，恢复仍获取完整 canonical opening；relaySeq、live revision 和 durable seq 不能混用。测试关闭旧服务 owner、重建新 Context、读取相同 JSON/JSONL，恢复相同游标、原 action 终态和未确认 intent，并确认 prompt 调用为零。这个逻辑重启没有模拟 OS 强杀、断电或文件系统掉电保证，也没有资格替代最终真机验收。

本批严格 TypeScript 检查通过，43 个 Node 用例和 9 个真实服务/故障拒绝用例通过；原有 15 项 Chrome 断言沿用第二批证据，本批没有重跑。执行命令是 `node scripts/check.mjs --integration`、`node scripts/assets.mjs`、README 所列的五个 Node 测试文件和 `node scripts/integration-check.mjs`。真实服务测试需要已记录的 Windows 沙箱 realpath EPERM 窄范围 host 提权；标准 Node 测试无需提权。`integration-check.mjs` 只调用现有 Vitest 测试入口，没有应用 bin、裸 Node 应用启动或 SDK argv 通道。

证据分别是 [主链计数与流式](../evidence/phase3-link.json)、[重开](../evidence/phase3-reopen.json)、[第五次拒绝](../evidence/phase3-guard.json)、[Vitest 报告](../evidence/phase3-vitest.json)、实际 [Session JSONL](../evidence/phase3-session.v4.jsonl)、[Rich ledger](../evidence/phase3-rich-ledger.json) 和 [mobile journal](../evidence/phase3-mobile-journal.json)。日志仅含本批固定合成场景。

下一独立批次可继续做 typed wire codec、手机语义投影、draft/revision/历史窗口与未激活的配对协议设计。真正启用桌面 profile addon、持久设备身份、WAN/TLS/E2EE、DevEco/SDK 安装、签名、HAP 安装或设备权限，仍分别等待对应授权。审批目前只有 display seam；本批实际 composition 不包含真实审批 provider。原生 ArkTS 仍未编译，guest renderer 未经 ArkWeb 验证。
