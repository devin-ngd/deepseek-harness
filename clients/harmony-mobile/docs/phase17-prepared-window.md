# 下一轮原生验收：已编译、未激活

本页是下一轮验收的准备与交接记录。缓存恢复和释放前断言已进入现有客户端回归；有限 BFF 故障 fixture、私有旧 mount 检查、按实际布局定位的连续驱动已准备。新 unsigned HAP 已由现有官方 API26 工具编译，详情见 [HAP 封存记录](../evidence/phase17-hap.json)。本阶段不安装应用、不启动模拟器、不创建转发，不取得新的原生执行资格；上轮授权已经使用并清理。

## 一个窗口的清单

预计整个窗口 10–15 分钟，其中连续驱动约 8–12 分钟，清理预留至少 3 分钟。驱动自身最多 20 分钟，并且不能超过原 lease 的清理时刻；lease 总上限固定 30 分钟。时间是估算，尚无这份连续脚本的原生计时证据。

| 顺序 | 检查点 | 预计时间 | 判定 |
|---|---|---|---|
| 0 | 新批准、文件许可核查、确认共享 IDE 状态、启动仅本任务实例、确认 API26 和独立应用初始缺失、准备四响应服务 | 转发前 2–4 分钟 | 不接受或取消许可问答；缺少任何条件就不开始窗口 |
| 1 | 单次 loopback 转发、安装封存 HAP、启动独立应用 | 1–2 分钟 | 一条映射、原始开始／截止时间、HAP SHA-256、实际 API 与 app PID |
| 2 | 固定任务与 fixture 自动表单提交 | 1 分钟 | 三条固定响应、两次 prompt、完成动作、实际 source-offload；原生截图 |
| 3 | 原生保存缓存→断开→只读恢复→重连 | 1 分钟 | 私有端口确认 native cache saved/restored；断开只读；恢复截图 |
| 4 | 第四条挂起响应与原生取消 | 1 分钟 | 实际 ready 标记；cancelled；总四条固定响应 |
| 5 | 同端口重开服务与旧 mount 请求 | 1–2 分钟 | 新 wire instance；PhoneCore 拒绝旧 snapshot 读取且 forwarded=0；原任务再次提交没有派发 |
| 6 | socket reset 与自动恢复 | 1 分钟 | 注入被消费、实际新 follow、原生继续非只读；任务／动作不重发 |
| 7 | 非法／截断 JSON、未知必读事件、游标缺口／冲突 | 2–3 分钟 | 每次独立重连；真实字节解析或语义投影降级；原生只读、原生截图、模型派发为零 |
| 8 | 四次 socket reset 耗尽读恢复预算 | 1 分钟 | 原生 `follow-recovery-exhausted`、只读；保留已接受的历史 |
| 9 | 精确移除映射、关服务、卸载独立应用、正常停止本任务模拟器 | 1–3 分钟 | 清理记录、监听关闭、共享 HDC 保留、许可摘要不变、原截止前完成 |

`phase17-native-driver.mjs` 默认只打印计划；此操作已经离线运行，没有 SDK 调用。`--execute` 拒绝缺失或上轮批准，要求新的 `approved-phase17` 准入、已启动且核实归属的实例、独立 bundle 初始缺失、新的未到期 lease、已核验封存 HAP。准入字符串不是安全授权，不能替代用户的新明确批准。驱动不创建或替换转发、不重起 lease；任何失败都会请求现有 lease owner 清理，并分别记录场景失败与资源清理结果。

## 每项测到什么

故障只在获取授权的真实合成 snapshot 之后改写有限 HTTP 字节；未知事件不追加到 Session 日志，unary 操作和真实任务不被改写。非法 JSON 检查 stream envelope parser；截断检查增量 NDJSON EOF；缺口／冲突检查 WireCursor；未知必读事件检查 Session 语义投影的只读降级。socket reset 检查真实 socket 中断，未来原生运行才检查 NetworkKit 到私有端口再到 PhoneCore 的错误归一和有界重读。

SDK 错误归一只将已核实的连接／收发／部分传输错误标为 transport-lost，超时标为 timeout；权限、证书、参数及未知错误停止，不重试任务或动作。依据是已安装 API26 声明和 [OpenHarmony 官方 HTTP 文档](https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-network-kit/js-apis-http.md)。当前 SDK 替身证明分类与每个 unary 仅一次调用；实际平台返回的具体错误码仍待下一轮。

旧 generation 检查通过 HAP 选定的进程内 observer 使用同一 PhoneCore；在真实 wire instance 改变后尝试读取旧 rich mount，并核对该 mount 没有发往 provider。结果只经现有私有 MessagePort 返回 native owner，guest 没有新方法、IO 或执行桥。它测的是移动 wire generation 对旧 rich lease 的拒绝；不等于已测 ArkWeb 旧 document 的迟到消息、private-port generation 或全部跨窗口竞态。

缓存检查必须经过 NativeCacheFile 的原生写入、fsync、读取、UTF-8 解码和 PhoneLibrary 的 owner/version/age 校验。当前 Node／Chrome 替身已证明缓存选择和只读状态；新 HAP 的实际文件行为、布局 id 的实际可见性和连续驱动仍未在模拟器执行。SDK 命令退出 0 但产生旧布局／错误文本时，驱动拒绝，不使用坐标猜测继续。

fixture 自动提交是合成页面触发的 form submit，并非人在手机上的触摸提交证据。只读场景的无派发计数证明故障没有自行发任务；它不能替代未来用户操作、恶意 guest 并发、原生权限确认或真机生命周期验证。

## “真实桌面”与真实服务

已测真实 SessionController 指生产源码的 Loader、SessionController、agent-loop、RichInline 和持久服务在隔离测试进程中实际执行；模型响应来自固定 replay，工作区和 Session 均为合成数据。它证明这些服务与移动协议的功能调用，并不证明已经连接用户正在运行的 DSH 桌面端。

真实桌面连接需要通过受支持的 `dsh` profile 与已安装桌面进程的路由、真实项目／会话归属、审批 mux、身份授权和任务执行链验证；当前 fixture BFF 与 phase11-desktop 标识不代表这条连接。现有已安装 DSH 不得擅自重启或覆盖。

真机需要另行批准签名、安装和手机权限，并核实手机型号／系统、ArkWeb 能力、前后台／进程退出／缓存恢复及实际交互。API26 模拟器和官方编译不能替代真机。WAN 需要单独设计并批准配对、长期密钥／撤销、TLS、出站 relay 或网络监听／防火墙／隧道，以及蜂窝网络下的恢复；本阶段均未激活。

验收完成前不宣称“手机发任务→用户桌面实际执行→手机富交互”的最终成功。当前继续等待新的原生窗口批准，独立成果是准备好的源码、离线回归、官方编译与封存证据；回退使用既有 v15 源码基线及其封存 HAP，不覆盖任何旧产物。源码采用 v15 基线、[增量包](../evidence/phase17-source-delta.json)与[收尾补充包](../evidence/phase17-source-supplement.json)，避免重新包含依赖；[编译输入覆盖记录](../evidence/phase17-compiled-inputs.json)仅保存与普通源码不同的十二份实际构建输入，用于核对封存 HAP。JSON 失败报告的格式整理不改变其失败结果。
