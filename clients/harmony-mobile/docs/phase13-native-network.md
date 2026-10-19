# 第十三批：独立原生联网回放测试版

本批完成共享原生宿主、独立 INTERNET 测试版和可续接的原生验收工具。原生模拟器到真实 DSH 固定回放服务的联调尚未运行：宿主执行的重复模拟器协议确认经一次原文证据重试仍被自动审批拒绝，协议等待已取消。测试版未安装、HDC 转发未建立、原生验收服务未启动，30分钟转发计时未开始。此结论不能替代原生 HTTP、ArkWeb 或真机验收。

## 实现与权限范围

`NativeAppHost` 和 `bindNativeDocument` 统一承载默认离线版与回放测试版的 PhoneCore、语义投影、rich renderer、私有端口及退役流程。默认版仍为 `local.dsh.mobile.lab`，manifest 权限为空、native HTTP 关闭。独立版为 `local.dsh.mobile.netreplay`，由 `node scripts/native-network-prepare.mjs` 在 `.build/native-network-project` 中生成，只有 `ohos.permission.INTERNET`，无签名配置；由 `node scripts/build-native.mjs --network-test` 使用实装官方 API26 工具编译。

回放版的 HAP-owned bootstrap 只允许 `phase11-desktop`、`phase11-phone`、`phase11-session` 和 `http://127.0.0.1:18081/`，拒绝额外字段、任意 URL 和外部 Session。它复用 `ByteNetworkPhone → NativePortHttpBytePort → NativeHttpIo → NativeHttpStream`，不使用浏览器 fetch 或 MockDesktop。生成的富块仅得到已有 scoped SDK；测试模式和 native IO 不由富块选择。宿主实例以随机前缀分隔 transport commandId，稳定 task requestId 继续用于桌面 admission 去重。

`nativeReplayLab` 采用真实 Cordis/Gateway/SessionController/agent-loop/RichInline/JSONL/StorageDomain 服务和四个固定响应。新增端口策略仅允许127.0.0.1；固定端口另需显式 `approved-phase13` 测试 owner，非法端口在 listen 前拒绝。固定端口重开测试先创建真实合成任务 admission，再在原端口加载日志并重复同一 requestId，检查不再次 prompt 或消耗 replay。所有账户、模型密钥和上传入口均不参与此流程。

## 协议确认阻塞

读取本任务旧委托 `01a12a1f-f0c7-70da-a8a4-7d0f4ae1ff02`，找到两份协议披露及用户 `Sentinel_2483e7918a148191ad2869ab2583761f` 的原始回复“同意”。当前 HarmonyOS 软件协议源 SHA-256 为 `7902149b9287d93b2da7ce260f4b3ddf2bea3bc20b0835766dac768f1cadaf5a`；宿主两次显示的完整文本均与 phase11 的已披露文本一致。受限启动曾发送确认，但随后配置写入失败且无法访问既有 Hyper-V，未确认许可保存或模拟器启动。正式宿主确认被自动审批拒绝，附原文证据重试一次后再次拒绝，原因是审批将旧委托中的确认视为工具内容而非当前可信用户消息。两个宿主等待均输入 n 退出，没有绕过拒绝或接受新条款。

原有联网批准仍有效：独立测试变体、INTERNET、唯一的模拟器18081到宿主临时127.0.0.1端口的 HDC rport、最长30分钟、无论成败完整清理。它不批准新协议、LAN/公网、防火墙、虚拟网络修改、持久凭据、签名、真实模型或真实用户任务。父任务需先处理重复协议确认的审批阻塞，才能继续模拟器执行。

## 可续接验收

`native-network-tests/acceptance.spec.ts` 是单独手动原生验收 fixture，不纳入自动回归测试计数，但纳入 strict 和冻结输入。`node scripts/native-network-services.mjs D:/Temp/dsh-harmony-phase13-<唯一目录>` 只启动该 Vitest fixture；从 state.json 获取实际本机端口。控制文件只有 seq 和 status/reopen/close，需通过同目录临时文件加 rename 原子提交。合成 rich 表单预填固定值并提供固定任务按钮，避免触发未经批准的小艺输入法声明。

`scripts/native-network-lease.mjs` 尚未执行其激活与清理路径。它要求独占模拟器启动证明和测试服务状态，记录转发开始/30分钟截止时间，只建一条 rport，并提前45秒开始清理；删除精确 taskstring、请求服务关闭、卸载独立版和停止本任务模拟器，逐项保留结果。缺批准、错误目录或未启动模拟器的 marker 已覆盖拒绝测试。后续必须在宿主隐藏进程中运行该 owner，使计时不依赖 agent 继续回复；实际 installed hdc 的 taskstring、bundle 缺失报告、端口释放及保留其他转发仍须现场核验，不能将静态脚本视为清理成功。

| 验收层 | 本批结果 | 后续要求 |
| --- | --- | --- |
| 共享 TS / JSON admission / 固定端口重开 | 自动回归证据单独保存 | 不可替代 native IO |
| 默认离线 HAP / 独立 INTERNET HAP | 官方 API26 编译产物单独保存 | 两者均为 unsigned；本批未安装 |
| 原生 HTTP 私有字节流 | 未运行 | 模拟器经唯一 rport 连接实际 BFF |
| 原生提交、流式、rich action、取消、重连及服务重开 | 未运行 | create owner 三次 prompt、四次 replay；reopen owner零次重派发 |
| ArkWeb guest 隔离 | 本批未运行 | 原生截图/日志证明 CSP、父 DOM、任意 bridge/IO/命令拒绝 |
| 清理与范围 | 未激活任何测试网络资源，共享 HDC 保留 | 激活后在截止前清理并核验四项 |
| 支持的安装版 DSH、WAN、真机 | 未验证 | 分别批准并获取最终真实手机证据 |

原生演示不能宣称已完成手机控制真实桌面或任意 HTML/CSS/JS 的完整兼容。最终标准仍为手机发任务→获授权桌面实际执行→原 Session 流式及 rich 交互→断线不重执行，可信权限操作明确确认，手机和富块均不获得任意宿主执行桥。v12及更早封存文件保持原字节，本批以v13独立保存；无 commit、push、模型费用或已安装 DSH 变更。
