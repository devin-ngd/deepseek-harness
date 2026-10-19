# phase4 回环进程间传输

第四批选择 BFF：现有 SDK stdio 没有 rich methods 与 mid-turn cancel；实际 Typert Gateway 提供 unary dispatch 与 cancellation-aware wireStream。测试在真实 Loader/Session/Rich 上增加 Gateway 和受限 harmonyMobile Remote 服务，HTTP 只接受 `/mobile/command` 与 `/mobile/follow`。客户端不能指定 Gateway namespace/endpoint，operator `/api` 和带浏览器 Origin 的请求返回拒绝。注册层 Connection 仍为禁用网络 fixture，未启动 Web 产品 profile、标准 WebSocket mux、SDK 或已安装 DSH。

实际服务运行在 Vitest 测试进程，手机由另一个 Node test 进程模拟；`--test-isolation=none` 让记录的手机 PID 与被父进程等待的 child PID 一致。手机只通过 HTTP/NDJSON 获取任务和 action 结果。取消固定 hang 时，测试读取维护中的 replay ready 文件作为时间屏障；这个测试旁路没有暴露给手机 API。两个进程有不同 PID、单独环境，连接地址仅为 `127.0.0.1:0`，结束等待 child exit、流关闭、listener 关闭和 Context disposal。

NetworkPhone 的应用默认配置是 `{enabled:false}`，LoopbackBff 同样支持显式 disabled。启用需要解析明确 URL、超时、帧/读块上限和 in-flight 上限；loopback fixture 拒绝非 127.0.0.1、非 HTTP、凭据 URL、非根路径及重定向。HTTPS 分支仅提供未来配置结构，没有配对、身份或密钥实现，也未连接任何真实地址。fetch port 不继承 cookie；未来 native provider 必须由可信应用注入，ArkWeb 不能取得该配置或任意 request 方法。

NDJSON 按 UTF-8 bytes 增量拆包，只保留一个有界未完成帧，允许多帧合并；非法 UTF-8、空行、CRLF、超长和半帧 EOF 都拒绝。既有 Gateway stream envelope parser 从维护源码转译复用，内部 item 再按 dsh-mobile-wire/1 精确验证 owner、generation、cursor 和 bounded JSON。domain payload 保持 JsonValue，没有直接断言成 SessionFollowFrame/RichSnapshot；正式手机语义投影仍须复用域 decoder、历史窗口和 required event 行为。

桌面 follow journal 有明确条数、bytes 和 TTL 上限。当前 generation 的 retained suffix 可以续接；过期或截断前缀、旧 generation 触发完整 canonical snapshot reset，未来 cursor 拒绝。每个服务 owner 产生随机 generation 标识，防止 PID 复用被当作同一流；它不是认证凭据。snapshot 读取前捕获 transport cursor，再补送读取期间的事件。WireCursor 只验证运输顺序与路由，不能把 relay cursor 当成 durable seq 或 rich revision。

服务器逐帧等待 writable drain 后才继续消费 source；超时、abort 和写入失败释放监听。测试把 writeHighWaterMark 显式设为 1，实际跨进程响应产生 drain waits；无网络 fault injection 验证 stalled drain、timeout 和取消。请求 body 使用一个有界 buffer，避免保留大量 tiny-chunk 对象；TCP connection、active request 和手机 in-flight 均有独立上限。容量拒绝发生在 Gateway dispatch 前，不形成稍后自动执行的队列。

取消/超时只关闭运输等待或订阅，不自动取消已接受任务、不自动重发 task/action。手机用原 requestId 查收据，action 用原 actionId 查终态。valid remote refusal 表示传输仍收到已验证响应，与 transport-lost 分开；连接状态来自本地解码过程，不由 payload 设置。原生 ConnectionBadge 使用 locale 资源区分 fixture、connecting、connected replay 和 disconnected，当前仍默认 Fixture/Disabled，没有 native transport provider、INTERNET 权限或编译证据。

本批严格 TypeScript 检查覆盖 26 个实验/测试模块；9 个 Node wire 用例、3 个 native static 用例和 5 个 BFF/flow-control 用例通过。另一个手机 test 进程完成单一闭环场景，包含跨 scope/follow、未来 cursor、malformed JSON、容量拒绝、重复包、真实 chunk、action completion、跨 block 冲突、历史 remount、retained reconnect、旧 generation reset、timeout 和第四响应取消。主链恰好消费 4 个固定 replay 响应，realCalls、blockedCalls 和 upload extension calls 均为 0。

复现：在工程目录运行 `node scripts/check.mjs --integration`、`node scripts/assets.mjs`、`node --test tests/wire.test.mjs tests/native-source.test.mjs`、`node scripts/network-check.mjs`。最后命令同时是可演示的本地闭环：输出两个 PID、连接状态、action completed、有限回放次数和已关闭 listener。无网络子集是 `node scripts/network-check.mjs --offline-only`。Windows sandbox 实际出现 connect EACCES；保留诊断后通过正式审批，按原命令窄范围 host 提权通过，没有更改安全策略或防火墙。若后续审批被拒，只跑无网络子集，不能静默切换或扩大网络范围。

证据：[network](../evidence/phase4-network.json)、[Vitest](../evidence/phase4-vitest.json)、[手机输出](../evidence/phase4-phone-output.txt)、[sandbox 拒绝](../evidence/phase4-sandbox-phone-output.txt)。这些结果只证明本地进程间 BFF，尚不证明 ArkWeb renderer、HAP、WAN、手机蜂窝或真实模型。原有 Chrome fixture 没有在本批重跑；富块交互在这里通过 native-owned JSON intents 调用真实 RichInline，没有执行 guest HTML/CSS/JS。

蜂窝部署最少需要确认：① relay 放置位置、允许的费用及域名/TLS 来源；② 桌面要启用的 profile、时间窗及允许的 workspace/session/操作范围；③ 双方可信配对确认方式、撤销与持久设备身份的批准；④ 手机实际 OS build、官方工具安装、调试、签名、HAP 安装与 INTERNET 权限的批准。手机号和账户密钥不是本阶段输入。身份/TLS/E2EE 与 native provider 实现和评审完成后，才可激活桌面出站及手机蜂窝连接；公网监听、隧道、防火墙或收费资源均需对应批准。
