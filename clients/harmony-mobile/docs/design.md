# 实施路线与执行约束

主验收路径是 Mate90 Pro Max / HarmonyOS 7 在蜂窝网络发任务，桌面实际执行，手机看到流式消息和 rich 块，再把表单操作回到正确会话。当前所有例子均为固定合成场景，没有真实模型请求。API 12 只是容易维持的组件候选最低能力，不能从手机型号或 OS 名称推定设备 API；首版优先用户 OS7，不扩大旧系统适配范围。

原生 ArkUI 管理设备连接、项目/会话列表、composer、审批、取消、可信状态条和错误。ArkWeb 仅挂载当前需要交互的少量富块，离屏销毁和 remount，从桌面恢复 snapshot/draft；不每条消息永久驻留 WebView。HTML/CSS/JS 保留通用丰富度，布局支持窄屏、滚动表格、44 vp 触控、键盘和字体缩放。允许的 guest 能力是 scoped draft/action/status 等协议，不包括任意 shell、文件、RPC、网络、审批确认或 Electron IPC。

优先在现有 rich-inline `RichBlockController`、`RichRpc`、validation 和 guest SDK 上补平台 carrier。`NativeRichBridge` 的 partition 与 Desktop 发现方式需要改为显式 carrier 注入，Electron 与 ArkWeb 各自维护隔离资源，controller 保持草稿 flush/update barrier、render/data revision、重试和历史行为。新设备 adapter 只调用已有 session/workspace/richInline 服务，登记效果通过 ctx.effect/on；不修改 agent loop，不另建手机 ledger 权威。ArkTS 不完整兼容 TypeScript，因此原生层使用窄 DTO/controller 或生成资源，不能宣称 pureTS 模块已在 ArkTS 编译运行。

| 蜂窝网络方案 | 内容可见性 | 本项目选择 |
| --- | --- | --- |
| 桌面主动出站到 relay，两端 TLS，relay 解码业务 | relay 能看到任务、会话和 rich 内容；需要信任运营者和存储策略 | 不作为默认隐私保证；仅在用户明确接受该信任模型后使用。 |
| 桌面与手机主动出站，relay 只传端到端加密业务 envelope | relay 仍能看到连接、尺寸、时间、路由等元数据；内容仅设备端解密 | 优先设计方向。复用经维护的加密协议实现，设备身份/密钥固定和重放检测由原生层与桌面层持有，不能自写未审计 crypto。 |
| 用户既有安全网络上的可替换 direct transport | 信任既有 VPN/安全网；若仅 TLS 则需证书与服务身份校验 | 作为 adapter 选项，不能自行安装或配置 VPN。 |

WAN 是 MVP 必需。候选 relay 由桌面主动建立出站连接，避开 NAT 入站开放；手机也是主动出站连接。不得公开转发 DSH `/api` operator 通道。relay 路由只能绑定已授权设备与桌面，设置消息大小、队列长度、TTL、连接代数和背压；不无限离线排队高风险任务。无论 relay 是否在线，执行由桌面 Session 持久状态继续。手机回前台重新握手，校验 generation，恢复 snapshot/live baseline/history 与收据；未获确认的派发显示 unknown，先查询原 requestId，只有人工明确重发才进入新业务 intent。

配对协议计划包含：桌面可信 UI 生成短时 proposal → 手机原生层显示桌面指纹和授权范围 → 人工确认双方身份 → 接受时固定设备公钥和权限版本 → 每次请求绑定 device/desktop/session/requestId/operation/payload hash/expiry → 原生和桌面持有短期授权 → 桌面撤销立即拒绝后续请求并结束相关 mount/连接。未确认 proposal 不成为凭据。relay 不得通过连接身份替代端到端设备签名。后续协议可先用 fake-key fixtures 验证生命周期，真实密钥、长期 token、账户和配对均未生成。本批只有未激活设计，无已实现的真实鉴权或 E2EE。

rich mount 由可信 adapter 从已提交 message/block 生成，host 控制 scope 和 renderRevision。富页面不能选择 session、desktop、mount、授权或 endpoint。opaque iframe origin 常是 null，不能只检查 origin；需 actual source/frame/port、lease、revision、dense seq、packetId、字节限制、严格 method/payload allowlist。CSP/sandbox、网络/WebRTC/file/下载/窗口/导航/worker 禁止与死循环隔离必须在目标 ArkWeb 单独验收。验证完成前 native preview 保持 scripts off；不能让一次 Chrome 测试批准通用 ArkWeb 任意 JS。

输入变化先保留本地编辑，再通过 baseRevision CAS 保存；冲突保留本地数据并由可信 UI 提供对比/复制/重试，不能覆盖。提交前冻结最近输入、data revision 与 actionId；丢响应先 status 查询/原 intent 重试，不新建 ID。相同 ID 不同内容冲突。兼容 render 更新先 flush draft 再 remount；schema 改变须可信确认归档，旧 lease 失效。历史打开只重建内容和数据，不重跑 action；fork 只恢复允许的 publication facts，保持 readOnly，无父 action、draft 或 grant。取消是意图，完成晚到仍展示事实；真实外部效果不承诺 exactly-once。

失败按 owning layer 处理：parser 在变更前拒绝格式与范围；transport 只报告连接损失；projection 在 gap/conflicting duplicate 后停止受影响增量并请求完整 baseline；adapter 查询未确认派发；desktop Session/ledger 负责 durable admission 与外部结果。审批过期/断线不会变成批准。真实 stream decoder 必须复用 Typert codec；若后续采用 SSE，要验证跨 chunk UTF-8、CRLF、多行 data、游标和 backpressure，不能 JSON.parse 每个网络 chunk。

分期：P0 工程审计、pureTS mock、canonical guest runtime、原生源码和 fixture；P1 在独立 DSH profile 组合 replay provider 和设备 BFF，复用现有 snapshot/window/live streams，完成任务/取消/审批展示；P2 平台 carrier、trusted 原生审批及富块闭环，配对/撤销/有限离线恢复和未激活 relay 模拟；P3 经对应批准后获得官方工具、构建、模拟器、设备安装、配对和 WAN 环境；P4 在用户设备/蜂窝网络完成真实桌面链路。P1/P2 可先离线推进，工具与部署批准不阻塞这些独立工作。
