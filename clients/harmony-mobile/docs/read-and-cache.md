# 分页、消息视口、缓存与图片

`ReadServicePorts` 在现有 service 上补齐完整读能力。source 适配使用 WorkspaceRegistry.list、SessionController.list/page 和 AttachmentStore.readImage；它没有独立 Session 索引或 rich ledger。上游 workspace baseline 和当前 Session list 是整批列表，mobile adapter 先按设备的 Session grant 过滤并剥离目录、成员列表等宿主数据，再创建有条数、字节、数量和 TTL 上限的不可变列表快照。手机 project/session cursor 只引用这一快照，并绑定 device、epoch、kind、scope 和 page size；旧 cursor 过期后须重新读取，不拼接不同快照。

历史使用上游 SessionPage 的 `throughSeq/beforeSeq/maxMessages`，手机验证 envelope、Session、版本、连续 seq 和不可变交叠后原子地向前补页。它不回退 follow cursor、wire generation 或 task execution owner，不把历史再提交成任务。未来 Session 格式、required event 和 gap 保留原视图并报告。当前语义日志有显式 maxEvents/maxBytes；达到上限返回 `domain-window-full`，尚不支持无限历史或静默裁掉重建所需事实。

共享 `MessageWindow` 以持久 message id 保留位置和行内 offset，读旧内容时新消息不会强制跳到底部；尾部跟随和 anchor 丢失分别显式返回。Chrome 实际复用节点、恢复 scrollTop 并限制20个显示节点。ArkUI 源码用同一模型生成的20行视口、List 和稳定 key，尚无已编译的 List 生命周期/IME/滚动 adapter。新 fixture 包含100条历史、离线只读及尺寸占位，不能据此宣称原生分页按钮已联网。

`PhoneLibrary.save/restore` 保存带 schema、owner、epoch 和 age 的 app-owned cache，内容为 canonical 源事件、rich snapshot/draft 和去掉 continuation 的列表。它排除网络 hint、mount、任务重试队列、图片字节、凭据和读 token。恢复先验证 byte/version/scope/age，再原子提交为 disconnected/readOnly；接到新的合法远端 opening 后才解除缓存只读。未发送草稿能展示，但离线变更与桌面 CAS 冲突的合并 UI 尚未实现。缓存损坏、超限、不可访问和过期保持当前视图；storage 写失败由 native owner 明确显示，不能声称已落盘。Node 用独占 pending 文件和 rename 验证真实本地文件恢复，ArkTS app sandbox 文件实现仍待 SDK。

图片入口只接受 native 从已显示的持久消息选择的 Session/message/seq/attachment id。source 再读 canonical page 确认引用，不接受文件路径或任意 URL。图片原始媒体类型、尺寸、bytes 必须来自 AttachmentStore；取得有 device/epoch/Session/TTL 约束的临时 handle 前检查 bytes、宽高和 decoded pixels 上限。读取按 offset/chunk cap 返回字节，单 handle 只从源加载一次；手机检查连续 offset、total、精确 chunk 长度和 base64，再给 native UI data URL。HTML 没有这些方法或 handle。

手机无论成功或失败均显式 close 图片 handle；解码不支持也先释放收到的 handle。失效图片保留 canonical 尺寸并显示有限错误 key；原始 provider 文本或路径不会进入 UI。revoke/close 和无法交付的新增响应释放资源，分页/handle 并发申请先预留容量，token 碰撞拒绝，未解码图片内存与本地显示缓存也有数量上限。当前有一张1×1固定 PNG 通过真实合成 AttachmentStore/Gateway，另一条 Chrome fixture 专门展示到期占位；没有访问用户图片。

所有 deployment-varying 上限由显式 ReadLimits/DomainLimits 和 native 配置提供。未来启用真实设备需要独立审核 pairing/auth/revoke 和 encrypted app cache 存储；本次 grant/epoch 都是 fixture，新增只读 capability 也默认缺省拒绝。产品 Session 格式、SQLite schema 和 rich SDK 协议未改变。
