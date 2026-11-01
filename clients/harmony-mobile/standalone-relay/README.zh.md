# 独立 Harmony 中继

[English](README.md) | 中文

用户选定的本 Node 中继不安装 DSH 运行时、Cordis、模型提供方、SessionController 或聊天数据库。Node HTTP 与受维护的 `ws@8.21.3` 挂载可选 DSH 适配器使用的同一 RelayRooms 和 RelayUpgrade。发布物包含构建好的 ESM、原样保留且已验证的官方 ws 文件/tarball，以及仅有两条目的 npm lock。服务器无需 npm 安装或生命周期脚本，不包含可选原生 peer。要求 Node ^22.19 或 >=24。本地 Windows/Node 测试不能证明 Linux 执行通过。

## 激活与信任

[rc2.21 候选](../docs/proxy-timeout-rc2.21.md)包含两条精确 WebSocket 路径的 660 秒 `proxy_read_timeout` 提案。静默控制连接必须覆盖 10 分钟房间及挑战签发时间，数据连接流量不会刷新控制代理的读取截止时间。房间到期和 60 秒数据空闲上限仍生效。共享升级限流使用 `burst=3 nodelay`，容纳同一来源双角色、双通道的四次快速请求；持续速率仍为每分钟五次。见[503 定位与候选](../docs/proxy-burst-mvp-20261030.md)。仅在取得部署批准后向旧站点合并已审阅指令，单独更新手机不会更新 nginx。

尚未激活的[首次使用维护工具](FIRST-USE-TOOLS.md)准备严格公开 JSON，并在显式本地决定后独占初始化现有公开日志/head。它们不启动/重载服务，也不添加 HTTP 注册路由。[完整本地首次使用接线](../docs/phase42-first-use-wiring.md)区分已实现代码与真实信任/单元/broker 批准及实体设备验收。

准备、预览和初始化要求所选端点提供严格的 `harmony-relay-endpoint-timers/1` 投影。提案签发 10 分钟房间，桌面和手机上限也为 10 分钟；更早的已签名路由截止时间仍限制每个房间。挑战保持 10 秒，端点挑战上限保持 15 秒。维护工具构建从当前桌面 device 和手机配置生成限制并记录哈希；已有安装需要在激活前同步设置。向工具传入 `--limits relay-endpoint-timers.json`；旧 argv 会被拒绝。[升级指南](../docs/upgrade-guide/v0.2.1-alpha.2/original-field-interaction/guide.md)说明消费者及普通本地确认的授权范围。

导入和 `node server.mjs --config config.disabled.json` 不创建监听端口、定时器或密钥。启用配置只绑定 127.0.0.1；示例保持 broker 禁用、房间表为空，因此所有加入都会失败。普通 HTTP 返回 404，包括注册/授权/管理路径。nginx 仅暴露精确的数据 `/harmony/relay/v1`（`dsh-relay-v1`）和控制 `/harmony/relay/control/v1`（`harmony-relay-control-v1`）upgrade。Host/子协议/头/角色不符、查询和 Cookie 都会失败。Origin 默认拒绝。显式 nativeOrigin networkkit-v1 仅允许带现有自定义路由头的手机请求使用规范 HTTPS Origin；浏览器 fetch 元数据仍被拒绝。它不改变 broker 证明、房间能力、固定 E2E 或桌面授权要求。见[离线兼容证据与激活限制](../docs/phase68-connection-diagnosis.md)。控制路径还拒绝 Authorization 头。被拒绝的 upgrade 准入统一发送空 403、Connection close 和 no-store 响应，然后销毁已刷新输出的连接流；不回显请求字段、身份、token 或房间状态。TCP 容量及 HTTP 解析器失败保留传输层拒绝；受维护的 ws 可能对自身握手语法错误返回 400。见[升级影响](../docs/upgrade-guide/v0.0.0-phase40.1/relay-upgrade-refusal/guide.md)。

显式启用的 broker 仅接受预先批准的公开配对注册：pairId、不同且规范的 desktop/phone P256 SPKI、路由 epoch、到期时间和撤销标记。初次注册要求现有原生指纹比对、桌面范围授权及对应操作者批准；服务器挑战或自签公钥不能注册任何一方。日常连接使用现有本地身份签名器，验证选定配对/角色/epoch/audience/指纹，并以独立的 `harmony-relay-control/1` 域签署新的有界 nonce。双方必须证明同一新轮次，之后才可获得短期房间回执。不使用永久共享 token。broker 路由 epoch 不授予 DSH 操作，也不替代桌面授权 epoch。

每个角色只通过未来获批 TLS 传输获得自己的一次性能力。数据加入要求双方都在；端点通过新的协商密钥与 nonce 计数器执行现有固定 ECDSA/ECDH/HKDF/AES-GCM 握手。房间到期、数据/控制丢失或有效角色替换会销毁旧房间，双方必须重新签署新轮次。即使没有新消息，端点租约也会在新挑战或到期时中止。控制连接丢失后，需要通过同一获批身份和新挑战显式建立新控制传输。共享原生 WS/HUKS 与桌面连接所有者已有接线，并通过合成 SDK/loopback 端口测试；生产 UI/本地信任组合、控制丢失后的退避、实际 HUKS/TLS 和手机行为仍未通过验收。

仅含公开数据的撤销提交使用 `PublicTrustStore`：有界追加日志和单独同步的公开摘要/代次 head。启用的 CLI broker 要求明确 `publicTrust` path/maxBytes/maxRecords，在监听前重新打开存储，绝不重建缺失状态或回退到配置允许项。首次公开注册是单独的本地所有者专用独占初始化；没有 CLI/HTTP 注册或撤销路由。实时拒绝先于清理与提交，并发提交串行，两个文件在确认前均同步。正常重启保留撤销标记；缺失、撕裂、损坏、不匹配、已锁定或写入结果未知的状态会拒绝启动，并保留拒绝锁。适用的目录同步必须执行，锁也不例外。实际初始化/激活路径仍需批准。

日志固定 audience/pair id/公钥/到期时间，只允许单调的撤销后继。独立 head 可检测单个文件截断到完整旧记录。若两个文件均恢复为匹配且可信的旧备份，没有独立可信锚点就无法检测，不得视为普通恢复。未知写入/同步失败会保留锁；不自动截断、修复、覆盖或删除陈旧锁。Windows 测试使用真实临时文件同步和 POSIX 目录同步替身；Linux 文件系统/断电验收仍待完成。消息、房间、token、授权和私钥都不能进入此存储。

## 服务器可见的信息

nginx 终止 TLS，可见外部 IP、HTTP/WS 头、公开 host/path、pair/room/role/capability、时序及长度。Node 可见代理 loopback 对端和转发元数据。控制 broker 可见获批长期公钥/指纹、pair id、路由 epoch、nonce、证明/签名，以及进程内存中的两个临时原始房间 token。RelayRooms 存储 token 摘要；broker/ShortPairingRooms 必须保留原始角色 token，直至回执/寿命清理。端点 E2E 不隐藏这些路由字段。

E2E 数据 hello 暴露角色/协议、临时公开 SPKI 和 nonce；应用帧头暴露 binding id、角色、序号和种类。桌面授权证明和 Session/任务/富 HTML/表单/草稿/动作正文经端点加密传输。中继没有私有身份或流量密钥，不解密或解析二进制正文。它本身无法强制确认获批二进制内容确为密文，仍依赖端点固定和正确密码实现。自定义 E2E 与原生集成还需验收。

应用不写入消息、房间、头、原始帧、磁盘队列或聊天历史。CLI 读取静态 JSON 与获批公开信任文件，失败时只报告 `relay failed`。公开 pin/epoch/撤销标记/摘要/锁文件一经显式初始化便会持久存在。JS GC 不保证擦除内存字节。TLS 密钥/证书仍需未来批准和持久化。现有 nginx/journal/审计/调试设置、swap、崩溃转储和 VM 捕获可能保留元数据或内存；拟议的日志/swap/core 限制尚未应用或验证。

## 部署与回滚

每次候选上传/启动、DNS/nginx/TLS 或身份变更都需要对应批准。服务器当前运行获批的 `0.0.0-phase40.1`，房间表为空且 broker 禁用；此 HTTP 拒绝候选仍在本地。目录 `/home/devin/harmony-relay`、服务 `harmony-relay.service`（User=devin、Restart=no）、loopback17846 和 nginx TLS 记录于[实际部署](../docs/relay-deployment-20261014.md)。保留既有站点/服务，不读取或复制其私钥。CLI SIGINT/SIGTERM 先拒绝新工作，再等待其拥有的 TCP/WS/定时器清理；清理错误保持可见。重启会丢失房间和全部临时能力。游标/命令/动作 id 属于桌面/客户端日志；中继既不执行任务，也不做任务去重。

获批部署前，仅记录新目录/服务/nginx 文件的冲突与备份。回滚停止 harmony-relay，在 `nginx -t` 后仅撤销获批的 nginx 新增项，保留公开撤销记录、既有站点和前代归档。删除 DNS/证书与撤销配对密钥是独立操作。[当前接线证据与剩余验收](../docs/phase40-product-wiring.md)区分合成源码 Profile/ETS、构建好的 ESM、API26 编译与 Linux、TLS、原生和手机执行。本包不建议用于生产激活。
