# 受限手机链路

工程只增加独立客户端目录，未改变 DSH 包或已安装应用。`desktop-adapter.ts` 对齐真实 `SessionController` 和 `RichInline` 的公开类型；合成脚本用 `host-fixture.ts`，实际服务测试用 [真实 replay ports](real-services.md)。`relay.ts` 没有网络代码；`phone.ts` 保存 canonical 原始帧和回执；`relay-guest.ts` 使用相同的 guest packet parser、原 rich-inline validators 与 SDK。Chrome 页面使用直接 mock carrier；guest 经中继的验证在 Node fake DOM 完成，不能把两者合并说成浏览器中继闭环。

| 方法 | 原有服务调用 | 手机侧限制 |
| --- | --- | --- |
| task.submit / task.receipt | prompt({requestId,sessionId,mode:'queue',content:[text]},signal) / 只读 receipt seam | 原生选择 session；相同 requestId 不同内容拒绝；跨设备同 ID 拒绝；未知结果只查证。 |
| session.cancel | cancel({sessionId}) | 取消当前会话回合；不宣称按 prompt 独立取消。 |
| session.sync | follow({address:{kind:'session',sessionId},assistantStream:true},signal) | 取完整 opening 后 abort/return；没有向 upstream 塞 afterCursor。 |
| rich.mount / snapshot / dispose | 同名 canonical rich methods | 每设备/epoch 新 mount，映射 host mount，不向生成代码暴露 host ID 或 Session endpoint。 |
| rich.saveDraft / invoke / status | canonical parsers 后转发同名方法 | 草稿、数据 revision 与 action ledger 仍由原服务拥有；本 adapter 不另建 rich ledger。 |
| approval.list | 独立 display port | 仅展示 pending/expired/cancelled；没有 approval.answer。 |

信封使用 `dsh-mobile-lab/2`，包含 desktopId、deviceId、grantEpoch、commandId、expiresAt、operation 和 payload，字段严格精确匹配。可信 mock peer 的身份与 JSON 信封一致才路由；这不是已认证连接。fixture grant 为进程内记录，不含手机号、账户、钥匙或持久 token。真实配对、签名、加密、授权 UI、持久凭据存储和撤销日志均未实现，未来必须经对应批准与评审。

任务 journal 是显式依赖，按 session/requestId 保存规范化内容指纹、desktop/device 归属及 submitting/accepted；未知结果对手机呈现 unknown。容量满时拒绝新 admission，不能为了腾空间遗忘未知请求。transport command 相同 ID/内容共享同一 Promise；不同内容冲突；过期缓存可回收。Host prompt 报错或接受确认写入失败都保持 unknown，只有 findPromptReceipt 的 accepted 证据可提升状态，absent 不自动重发。真实 inbox/日志读取、写入先于派发和磁盘 Context 重开见 [真实服务联调](real-services.md)；该实验不保证任意外部效果 exactly-once。

中继按 Session 保留带独立 relaySeq 的有界事件队列，丢弃过期/超容量前缀后返回 resync-needed。桌面离线拒绝命令，没有重连自动排出的执行队列。手机同步在读取 opening 前记录 relay cursor，快照读期间的新事件继续补送；opening cursor 与 relay cursor、live revision 是三个独立值。原始 durable gap、冲突重复帧、live attempt/index/revision 错误停止增量。回前台重新取 canonical snapshot/assistant baseline，设备后台不请求音频、定位或其它保活权限，不取消桌面执行。该原始帧镜像尚未完成真实 Typert wire decode、DSH semantic projection、历史分页、删除/压缩事件、投影内存窗口和真实 network response parser。

Guest gate 绑定实际 source/port 对象、public mount、renderRevision、packetId、dense seq 与 byte/packet cap。生成内容只能 draft.save/action.invoke/action.status；diagnostics 只记录，不触发 repair prompt 或批准。异步写入串行，相同 packet 重试共享结果；schema/草稿冲突由 canonical owner 返回。SDK 未复制。真实平台 carrier 注入、更新 flush barrier 和 pendingManifest 仍待原 DSH controller 扩展；ArkWeb 保持 scripts off，不能从 Node 单测推导隔离保证。

撤销先使 fixture grant 无效、关闭手机 generation、abort 尚在 admission/follow 的请求，释放所有相关 host mount；已受理任务与富块 action 不回滚。mount 获取过程中撤销或关机，晚到的 mount 也释放；响应超限的不可达 mount 释放。显式 maxMountedBlocks 计入并发获取，transport 缓存过期不会解除 mount 上限。清理失败对调用方可见，失败资源保留归属以便后续 close 重试。所有清理完成后才结束测试，没有后台 listener 或用户任务。当前 grant 过期会拒绝访问，自动租约清理/后台 expiry 调度仍须由后续真实生命周期 owner 实现。

复现：依次执行 `node scripts/check.mjs`、`node --test tests/link.test.mjs`、`node scripts/demo-link.mjs`。演示输出 `evidence/link-demo.json`：固定任务/富块各受理一次，原 session 接收完成值，撤销后 host mounts 和 active follows 为零，真实模型与 listener 均为零。`phase2-summary.json` 记录当前检查层级；第一批历史证据与当前检查分开保留。

真实 Session/Rich/存储已在 source Loader 测试中验证；支持的 `dsh` profile、SDK/BFF 传输、审批生命周期与 typed wire codec 继续列于 [续接任务](tasks.md)。DevEco/SDK 构建、HAP、签名/安装、ArkWeb 和真机，以及真实配对/relay/TLS/E2EE/持久凭据仍是独立未验收层；不得因用户暂不在电脑旁而默认激活。
