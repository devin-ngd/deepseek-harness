> 当前候选、最近一次真机结果及未验行为按功能对照，见[当前日常部署与真机边界](workspace-review.md#当前日常部署与真机边界)。下文保留各轮原始证据。

> 2026-11-12，rc2.91 真机下拉历史显示加载失败。用户授权的本机只读回放复现系统提示替换引用窗口外记录导致的投影异常；修复后越过原失败页并继续加载 27 页，随后触及 512 条事件的现有上限。45 项会话和历史测试通过。rc2.92 基于 rc2.91，88 项源码输入仅版本信息和产品核心变化，25 项 HAP 文件集合不变；官方 API 26 编译和原证书验签通过。原位安装后 UID 与配对保留，真机观察到原失败位置的消息，用户确认看到更早内容。按轮分页、加载反馈和离线缓存体验仍需改进。[构建](../evidence/native-build/2026-11-12T01-32-59-022Z.json) · [真机验证](../evidence/history-pagination-rc292-field.json)

> 最终桌面三包与 rc2.54 工作区核心在 API 26 模拟器通过 Brick 原包 9 项验收。七个包文件逐字节一致，主题开关生效，关闭重开读回设置，停用和启用即时移除及恢复设置项。停用后当前页面仍保留主题样式，与既有桌面对照一致。首轮在滚动后的无障碍树暂缺设置对话框时中止，驱动改为等待对话框重新出现后复验通过。使用一条固定回放，真实模型调用为零。原测试包已恢复，转发和临时测试私钥已清理。[Brick 配套验收](../evidence/workspace-rc254-release-brick-emulator-validation.json)

> rc2.57 工作区源码与最新桌面三包通过 Brick 0.2.1 原包的十项隔离 ArkWeb 检查，七个原包文件逐字节一致。停用时当前文档的开关消失，背景仍为 `#FAF8F3`。关闭工作区并重开后，新文档回到默认背景 `#FFF`，重新启用后恢复开关和主题。使用一条固定回放，真实模型调用为零。原测试包已恢复，转发和测试私钥已清理。[rc2.57 Brick 原包复验](../evidence/workspace-rc257-release-brick-emulator-validation.json)

> rc2.57 和当前桌面三包以 1 MiB 分块复验 Archive Manager 1.1.7。隔离 Host 运行的 30 个包文件与桌面留存清单逐字节一致。392 CSS px 下归档标题可见，页面无横向溢出。设备仍被拒绝调用旧版 `workspaceRegistry/favoriteSessions`，用户可在标准设置页恢复一条合成归档，Host 核对归档标记已移除。七项 ArkWeb 检查通过，使用一条固定回放，真实模型调用为零。原测试包已恢复。[rc2.57 Archive Manager 原包复验](../evidence/workspace-rc257-release-archive-manager-emulator-validation.json)

> 2026-11-07，日常桌面更新 Harmony、官方工作区控制器和公共设置三包，逐文件核对六个相关插件的 872 个文件。真机用原证书从 rc2.53 原位升级到 rc2.54，25 个载荷文件核对一致，保留应用 UID、原配对和数据。[桌面安装收据](../evidence/workspace-desktop-field-archive-compact-installed.json) · [真机安装收据](../handoff/deploy-rc235-20261104/phone-install-rc2-54.json)

> rc2.54 用原配对完成加密连接，标准 Web 打开后关闭回到原生聊天。同一进程断开并重连，旧授权请求被明确拒绝。用户重新授权后，标准 Web 重开，DevFlow 按包名直达并读到编排、模型及思考强度，关闭回到原生。全程零模型消息，手机已归还。桌面已正常重启，临时诊断配置已恢复。[打开及关闭](../evidence/workspace-phone-rc254-release-rc254field-open.json) · [重连与拒绝](../evidence/workspace-phone-rc254-release-rc254field-reconnect.json) · [重新授权后重开](../evidence/workspace-phone-rc254-release-rc254field-reopen.json) · [DevFlow 只读](../evidence/workspace-phone-rc254-release-rc254field-devflow.json)

> 真机写入离线预检核对原生新建、DevFlow、Rich／官方翻译和 Brick 四组隔离回放的构建、桌面归档与 Host 收据。独立包的六个工作区核心输入与 rc2.54 一致。已装应用的调试描述文件只匹配日常包名，独立包需要匹配的设备调试描述文件及新的回环证书。空白会话读回以既有合成 Session 验证普通与压缩日志，拒绝截断帧、旧会话、选错思考强度和已开始模型工作的记录。两项均为离线预检。[隔离回放预检](../evidence/workspace-rc254-isolated-field-replay-preflight.json) · [空白会话读回预检](../evidence/workspace-rc254-blank-session-audit-preflight.json)

> 经授权，rc2.54 真机沿用原配对，在原生页选中 `minimal`、DeepSeek Account 的 `DeepSeek-V4-Pro` 和 `high`，创建并打开一条空白会话。只读核对该新会话的持久化日志，确认任务类型、主模型和思考强度一致，用户消息、请求头和模型轮次均为零。新会话已保留，手机已归还。[真机空白新建](../evidence/workspace-phone-rc254-blank-session-verified.json)

> 按用户选择用日常 rc2.54 复验 DevFlow 会话设置。空白验收会话已用原配对打开，首次准备工作区时连接关闭。新加密握手完成后，工作区明确要求重新授权。手机已归还，验收会话日志和其他 13 条 DevFlow 设置的摘要一致，测试会话仍无覆盖，模型调用为零。隔离内存对照通过会话保存、重建后读回及恢复继承。[本轮现场记录](../evidence/workspace-phone-rc254-devflow-regrant-pending.json)

> 用户重新授权后，空白验收会话的标准 Web 入口和设备页的 DevFlow 直达入口均显示工作区加载失败。该次采集未捕获新的传输或工作区 RPC 错误，加载失败原因待复现。会话日志和其他 13 条 DevFlow 设置的摘要一致，验收会话仍无覆盖，模型调用为零。手机已返回原生页并归还。[重新授权后真机记录](../evidence/workspace-phone-rc254-devflow-after-regrant.json)

> 新增空白会话的 Chromium 对照通过。回环加密连接的设备元数据将合成目标标为 `blank: true`，标准 Web 显示同一会话 ID，关闭后按包名直达原包 DevFlow 并读取设置。五项检查通过，归档摘要一致。仍待在隔离 ArkWeb 复现现场失败。[空白会话 Chromium 对照](../evidence/workspace-access-devflow-1794061635638.json)

> 空白会话 ArkWeb 场景复用 rc2.54 产品核心和文档脚本，保留隔离 Host、标准包及回环加密通道。Host 预检成功发布零消息场景，并拒绝缺少 ArkWeb 验收的结果。API 26 未签名测试包构建通过。两次模拟器尝试均在应用启动前遇到锁屏，第二次在等待 90 秒后退出。点亮后电源状态为 `AWAKE`，`screenLocked` 仍为 `true`。两次均恢复原测试包并清理转发和测试私钥。[Host 预检](../.build/workspace-rc254-blank-host-preflight-4s6xddt6/result.json) · [首次模拟器结果](../.build/workspace-release-blank-creation-1vjwf68m/result.json) · [带解锁等待的重跑](../.build/workspace-release-blank-creation-e3t4c5dd/result.json)

> 解锁后的首次运行已显示空白会话和禁用的发送按钮，旧驱动把禁用控件排除在可见性检查之外，最终等待超时。修正后 rc2.54 在 API 26 ArkWeb 通过 12 项，覆盖空白会话打开和关闭、原连接重建、旧授权拒绝、重新授权、标准 Web 重开与 DevFlow 直达。没有用户消息、模型轮次或回放响应。原测试包已恢复，转发和测试私钥已清理。[修正前](../.build/workspace-release-blank-creation-oa6lk9zt/result.json) · [零消息整轮](../.build/workspace-release-blank-creation-hbhuce66/result.json)

> 工作区新增固定阶段诊断。Chromium 注入渲染器启动、导航、原生回复、脚本错误和 Promise 拒绝，回传阶段符合预期。原生替身检查首个失败、非法阶段拒绝和主文档响应／传输区分。Chromium 6 项、原生替身 72 项通过。rc2.55 与 rc2.54 对比只改工作区诊断相关的四个输入和版本名，其他 79 个输入逐字节一致，API 26 未签名编译通过。[Chromium](../evidence/workspace-access-devflow-1794063437250.json) · [原生替身](../evidence/workspace-native-1794063285501.json) · [输入核对](../evidence/workspace-load-diagnostics-rc255-stage.json) · [未签名 HAP](../evidence/native-build/2026-11-07T14-58-01-061Z.json)

> 现场采集器已能读取 rc2.55 的十种固定加载阶段。模拟器使用与 rc2.55 逐字节一致的诊断源码，在同一个 ArkWeb 应用进程内依次注入主文档传输失败和 HTTP 503，采集分别保留 `document-transfer` 和 `document-response`。模拟 HDC 核对拒绝伪造阶段、其他进程和含额外内容的行。原测试包已恢复。本轮没有采集真机，现场空白会话失败的根因仍待定位。[采集器离线预检](../evidence/workspace-field-diagnostics-rc255-preflight.json) · [ArkWeb 实测](../evidence/workspace-field-diagnostics-rc255-arkweb.json)

> rc2.56 处理 ArkWeb 控制器启动和消息端口交接的同步异常。SDK 替身复现异常逃出旧回调，并验证失败提示、端口清理、原目标重试及清理失败时拒绝重开。76 项原生和页面检查通过。API 26 产出未签名产品包，除三个 ETS 文件和版本号外，80 个编译输入与 rc2.55 一致。隔离 ArkWeb 用相同工作区实现和三份封存桌面包通过 16 项正常路径检查，覆盖新建任务、关闭工作区、重连后拒绝旧授权、重新授权重开、DevFlow 会话级保存读回及恢复继承。模型调用与回放响应均为零，原测试包已恢复。真机故障原因仍待核对。[rc2.56 构建与验收](../evidence/workspace-native-startup-rc256-verification.json)

> rc2.57 将应用启动阶段的 ArkWeb 配置和工作区脚本校验失败限制在工作区。SDK 替身复现两种异常，79 项原生和页面检查通过，API 26 未签名产品包通过编译。独立模拟器故意破坏测试包中的工作区脚本，仍通过加密握手并显示合成置顶会话历史。点击工作区后留在原生页面并记录 `native-init`，关闭错误提示后历史仍可读。隔离 Host 未新增会话，原历史帧逐字节一致，仅补写与正常对照相同的合成会话初始化记录。模型调用与回放响应均为零，原测试包已恢复。[rc2.57 构建与故障注入](../evidence/workspace-native-init-rc257-verification.json)

> rc2.57 未签名候选与最新桌面三包已封存为同一现场候选。离线预检核对原位升级的 25 个载荷文件，模拟设备覆盖错误旧版本、原证书或配置不符、应用未退出和安装后 UID 或版本不符。带完整脚本的 rc2.57 工作区源码搭配三份封存包通过 16 项隔离 ArkWeb 正常路径检查，包含空白会话重连、重新授权和 DevFlow 会话级设置。零模型调用，原测试包已恢复。日常桌面更新、签名和真机安装待具体授权。[双端候选与预检](../evidence/workspace-field-rc257-ready.json)

> rc2.57 和最新桌面三包在隔离 ArkWeb 以 1 MiB 分块通过 DevFlow 七项及 Rich 与官方翻译十五项。每个测试包的 13 个相关输入与封存手机候选逐字节一致。DevFlow 持久化记录确认父任务仍用 `main`、只读子任务用 `worker/high`。Rich 验证动作接受与结算、未决查询无重发及草稿重开恢复，官方翻译三个原包逐文件核对一致。两组各用四条固定回放，真实模型调用为零。模拟器原测试包已恢复，转发和测试私钥已清理。真机上的 Rich 提交仍需要独立回放包及匹配的调试描述文件。[rc2.57 插件行为复验](../evidence/workspace-rc257-latest-plugin-actions-emulator.json)

> rc2.57 和最新桌面三包在隔离 ArkWeb 以 1 MiB 分块通过新建任务的 13 项检查。原生页选择 `minimal`、`worker-model` 和 `high`，只新建一条会话，四条固定请求均使用所选模型和思考强度。磁盘日志读回选项和四个已完成轮次，桌面默认选项保持。同进程重连后旧授权被拒绝，重新授权可在标准 Web 打开同一会话并直达 DevFlow，关闭后原生草稿恢复。真实模型调用为零，原模拟器测试包已恢复。[rc2.57 新建任务执行复验](../evidence/workspace-rc257-native-selection-execution-emulator.json)

> rc2.57 配套桌面三包在隔离 profile 预演换包与回退。首次对照在锁文件重命名前失败时残留临时文件，修正后在换第一个包、重命名锁文件前和完成元数据替换后三个故障点都恢复了 2,907 个文件。原 profile、暂存包或备份锁文件改变时拒绝执行相应操作。另完成一次成功安装、备份回退和再安装，核对 2,916 个文件与七个依赖的实际入口。[桌面回退补验](../evidence/workspace-field-rc257-desktop-rollback-preflight.json)

> 按用户授权，在隔离 Host 打开置顶简报会话的本地副本。只改日志头的工作目录，400 个历史压缩帧与原始日志一致，共 789 条事件。使用含 rc2.55 诊断的隔离测试 HAP，原生聊天、标准 Web 历史和关闭后返回原生均通过。Host 收尾发现隔离环境多了一条空白会话，自动化整轮以失败结束。该空白会话只有三条策略事件，原简报日志和隔离副本的日志摘要均未变，真实模型调用为零。原测试包已恢复，临时副本、转发和测试私钥已清理。[置顶简报界面与 Host 结果](../evidence/workspace-pinned-read-rc255-emulator.json)

> 合成置顶会话对照确认，未声明外部导航时，标准客户端启动恢复会发送一次 `session/create`，Host 增加一条空白会话。Harmony 工作区声明由嵌入端负责初始导航后，同一客户端保留显式选择，显示置顶历史，创建请求和新增会话均为零。Chromium 6 项通过，包含 DevFlow 直达读回。浏览器夹具的并发流容量已对齐模拟器夹具的 32 条，产品容量保持原值。Workspace UI 修复在隔离源码副本中验证。[Chromium 对照](../evidence/workspace-access-devflow-1794066291873.json) · [标准客户端源码补丁](../.build/workspace-explicit-startup-xpd_rz1d/ui-workspace-startup.patch)

> 同一 Workspace UI 候选与 Harmony 工作区接入源码在 API 26 模拟器完成回归。合成置顶会话通过加密握手、原生历史、ArkWeb 标准历史和返回原生四项。Host 核对打开前后的会话 ID 列表完全一致，设备会话变更、模型调用和回放响应均为零。驱动与 Host 均以 0 退出，原模拟器测试包已恢复，转发和测试私钥已清理。[源码候选模拟器结果](../.build/workspace-release-pinned-read-j1vlsfh8/result.json)

> Workspace UI 与 Harmony 桌面配套归档已封存。独立 profile 通过安装和锁文件离线重装，逐一核对 318 个文件。隔离安装版 Host 加载归档中的工作区客户端与设备接入，在模拟器通过同一组合成置顶会话检查。打开前后的会话 ID 列表一致，模型调用和回放响应均为零，原模拟器测试包已恢复。日常桌面部署和真机复验待安排。[配套归档验证](../evidence/workspace-desktop-initial-selection-release-36547xt8/verification.json)

> 用修复后的 Workspace UI 与 Harmony 配套归档，在 Mate 90 Pro Max 模拟器复测同一置顶简报副本。原生聊天和标准 Web 均显示历史正文，关闭工作区后返回原生。驱动和隔离 Host 均以 0 退出，前后会话 ID 列表一致，原日志和隔离日志摘要一致。全程零模型调用、零回放响应。原测试包已恢复，临时副本、测试私钥和转发均已清理。日常桌面与真机待复验。[置顶简报修复后复验](../evidence/workspace-pinned-read-fixed-emulator.json)

> rc2.57 工作区源码搭配最新 Harmony、Workspace UI 和 DevFlow 三包，在同一 Mate 90 Pro Max 模拟器再次打开该置顶简报副本。原生聊天和 ArkWeb 标准工作区显示历史正文，关闭工作区后回到原生聊天。原始日志与之前的快照一致，400 个历史压缩帧与隔离副本的导入摘要一致。Host 前后会话 ID 相同，模型调用及回放响应为零。原测试包已恢复，临时副本、测试私钥和转发已清理。[rc2.57 置顶简报复验](../evidence/workspace-pinned-briefing-rc257-emulator.json)

> 同一置顶简报副本再次通过原生历史、ArkWeb 正文和关闭后返回。首轮原生历史可读，切到标准 Web 后遇到模拟器锁屏，未完成。重跑的界面驱动与隔离 Host 均以 0 退出，原始日志和 Host 会话列表一致，模型调用为零。汇总脚本因 Windows 长路径漏查临时副本，未取得该副本的收尾摘要。临时副本已清理，原测试包已恢复。[本轮置顶简报复验](../evidence/workspace-pinned-briefing-rc257-emulator-confirmed.json)

> 用置顶简报最新的 428 帧副本复测 rc2.57。首轮原生历史和标准 Web 正文均已显示，点击返回后未在验收时间内确认原生历史。复跑分别确认原生历史、标准 Web 正文、关闭后返回原生及 Web 视图移除，界面驱动与隔离 Host 均以 0 退出。原始日志与隔离副本的摘要各自保持一致，Host 会话列表一致，模型调用和回放响应均为零。原测试包已恢复，临时副本、回环转发和测试私钥已清理。首次返回超时原因未确定。[首轮记录](../evidence/workspace-pinned-briefing-rc257-emulator-final.json) · [复跑结果](../evidence/workspace-pinned-briefing-rc257-emulator-return-diagnostic.json)

> rc2.57 和同一桌面三包通过合成置顶长会话的冷进程首次打开和五次同进程重开。每次显示标准 Web 正文，关闭后返回原生历史并移除 Web。Host 会话列表一致，模型调用及回放响应为零，原模拟器测试包已恢复。计时和应用 PID 的 PSS 单独记录。[置顶长会话测量](workspace-measurement.md#rc257-置顶长会话冷启动与重开)

> rc2.58 关闭工作区时刷新原生会话列表，返回同一会话时保留历史订阅。用同一 400 帧合成置顶会话在隔离 ArkWeb 连续打开、关闭六轮，每次都显示标准 Web 正文并回到原生历史。全程只记录首次原生会话选择，Host 会话列表和导入历史保持一致，模型调用和回放响应均为零。未签名候选通过 API 26 编译，原模拟器测试包已恢复。此前实际简报的首次返回超时仍缺同期证据。[rc2.58 回归与构建记录](../evidence/workspace-rc258-pinned-retained-selection-emulator.json)

> rc2.58 未签名 HAP 与三个桌面包已封存。离线检查核对 25 个载荷文件，包名、版本码和编译后权限与 rc2.57 一致。签名前检查拒绝四种错误输入。以最近一次 rc2.54 安装收据为起点的模拟设备通过一次原位升级，覆盖 20 种安装前拒绝、3 种安装后元数据拒绝和 6 种载荷检查。签名与真机安装待授权。[rc2.58 离线安装预检](../evidence/workspace-field-rc258-install-preflight.json)

> rc2.58 与封存桌面三包在隔离 ArkWeb 通过 18 项正常流程检查。标准 Web 切换到第二条合成会话并显示预置正文，关闭后原生聊天显示同一正文，回到第一条会话后草稿仍在。类型、主模型和思考强度选择、同进程重连、旧授权拒绝、重新授权，以及 DevFlow 会话级设置保存、重开读回和恢复继承均通过。前两轮分别停在空白目标被侧栏隐藏和测试定位未匹配，保留失败记录。最终驱动与 Host 均以 0 退出，原测试包已恢复，模型调用和回放响应均为零。[rc2.58 配套候选与模拟器结果](../evidence/workspace-field-rc258-ready.json)

> rc2.58 和同一桌面三包通过三组固定回放，共 35 项。原生新建选择 `minimal`、`worker-model` 和 `high` 后只创建一条会话，四轮执行与磁盘日志一致，草稿未发出。DevFlow 保存、重开读回和 `worker/high` 只读委派通过，父任务仍用 `main`。Rich 动作接受与结算、未决状态查询无重发、草稿恢复和来宾隔离通过。官方翻译三个标准包的 33 个文件与原包一致，设置保存、原文和译文切换及重开读回通过，翻译请求由本地夹具回答。每组四条固定响应，真实模型调用为零，原模拟器测试包已恢复。[rc2.58 三组回放](../evidence/workspace-rc258-current-replay-suite.json)

> rc2.58 与桌面三包在 Mate 90 Pro Max 模拟器打开用户指定的置顶简报副本，覆盖 428 个历史压缩帧。原生聊天和标准 Web 均显示历史正文，关闭工作区后返回原生，富交互卡片仍可见。首轮脚本按 WebView 总数误判返回超时，第二轮驱动与 Host 均通过，汇总仍因前后数量不同而报错。验收改为检查标准工作区专用返回控件，最终整轮以 0 退出，前后会话清单、原日志及隔离日志均核对一致。全程零模型调用、零回放响应。原测试包已恢复，临时副本、转发和测试私钥已清理。[首轮记录](../evidence/workspace-pinned-briefing-rc258-emulator.json) · [界面通过记录](../evidence/workspace-pinned-briefing-rc258-emulator-rich-return.json) · [整轮复验](../evidence/workspace-pinned-briefing-rc258-emulator-verified.json)

> rc2.58 真机采集入口通过离线预检。隔离安装逐文件核对 Harmony、Workspace UI、DevFlow 及四个保留依赖，共 881 个文件。合成手机收据与桌面采集绑定同一版本、启动和验收会话，七组正向检查与 28 项拒绝均通过，包含错包、错会话、握手变化和配置漂移。恢复配置后核对原字节、包与配对夹具，重复恢复通过。日常桌面安装、手机签装和真机采集仍待获准后执行。[采集预检](../evidence/workspace-rc258-field-capture-preflight-20261108T000555793574Z.json) · [现场步骤](../handoff/deploy-rc235-20261104/HANDOFF.md#rc258-配套验收)

> rc2.58 桌面计划用隔离基线和 rc2.54 日常桌面留存的锁文件各生成一份候选。隔离候选解析后与离线冻结安装的清单及锁完全一致。留存日常基线有 12 个直接依赖，新增 Workspace UI 后为 13 个。三包归档引用按候选更新，Archive Manager 继续使用原注册表解析，只增加 Workspace UI peer。混用基线、锁漂移、错目标及旧快照仍被引用的五种输入均被拒绝。计划从脱离现场的文件生成，未访问实际 profile。[双基线计划验证](../evidence/workspace-rc258-desktop-plan-1794096975163.json)

> rc2.58 配套三包在新建隔离 profile 重跑原位替换。首包替换后、锁文件重命名前和元数据替换后三处故障均恢复 2,907 个原文件。成功替换后核对 2,916 个文件，其中七个目标及保留包的 881 个文件再次按候选清单校验。原 profile、暂存包或备份锁变化时拒绝对应操作，恢复后可再次安装。[配套桌面替换预检](../evidence/workspace-rc258-desktop-transition-preflight.json)

> rc2.58 桌面换包和回退入口在隔离 profile 通过 14 项检查。安装前核对 872 个旧包文件，安装后核对 881 个候选及保留包文件。三处执行失败均自动回退，旧目录移出后的中断可凭事务备份恢复。并行执行、备份损坏、保留包改动和配置漂移均在写入前被拒绝。合成配对、会话和无关插件文件核对内容及文件身份均一致。只执行了隔离入口，日常桌面和真机待获准后复验。[入口实测](../evidence/workspace-rc258-desktop-apply-20261108T003251620789Z.json)

> 获准更新后，日常桌面三包安装并核对 881 个文件。手机 rc2.58 使用原证书和原描述文件，官方验签及 25 个载荷文件校验通过。原位安装保留 UID 20020297，未卸载或清数据。原配对首次加密握手通过，选中置顶简报后原生页提示 `device-catalog-unavailable`，未见正文。手动重连也未成功，手机采到数据通道多次 HTTP 503，另有控制通道 503。工作区授权仍关闭，标准 Web 重开和 DevFlow 直达未执行。验收未发模型消息，手机已归还，桌面诊断配置已按摘要恢复并正常重启。[现场收尾](../evidence/workspace-phone-rc258-field-closeout-20261108.json)

> 现场首次加密连接在握手成功约 6.1 秒后关闭，HTTP 503 出现在后续升级请求。桌面现场配置允许 1 MiB 加密明文，原生历史窗口此前仍允许 4 MiB。在同样的桌面明文上限下，合成长会话复现了打开历史时断连。修复后，桌面按明文、加密帧及套接字容量裁剪快照，原生能读取最近 12 条消息并在原连接切回另一会话。加密帧单独受限的对照通过，高容量仍可一次读取 50 条。回环复现确认了长历史容量缺陷，现场首次断开的直接原因和线上 503 来源待复核。[修复前回环](../evidence/device-integration-1794101585469.json) · [修复后回环](../evidence/device-integration-1794101690917.json)

> 容量修复版桌面 Harmony 包配套 rc2.58，在 Mate 90 Pro Max 隔离模拟器用 1 MiB 桌面明文上限复验实际置顶简报的 429 帧只读副本。加密握手、原生正文、标准 Web 正文及关闭后返回原生四项通过，界面步骤共 49.5 秒。驱动和 Host 均以 0 退出，原日志、隔离日志及会话清单核对一致。模型调用、固定回放和外发尝试均为零。原模拟器包已恢复，临时副本、转发和测试私钥已清理。首次尝试停在新归档的基线校验，修正归档引用后整轮通过。日常桌面仍运行现场原包。[首次隔离尝试](../evidence/workspace-pinned-briefing-rc258-emulator-session-capacity.json) · [现场容量模拟器复验](../evidence/workspace-pinned-briefing-rc258-emulator-session-capacity-rc2-5472.json)

> 从留存的 rc2.58 日常安装收据及锁文件生成容量修复版单包更新计划，直接依赖仍为 13 个。在隔离 profile 使用现有事务入口，只替换 Harmony。三处注入故障均自动回退，包目录移出后的中断由事务备份恢复。正常安装、显式回退与再安装共七项通过，核对 881 个文件、六个保留包和合成会话及配对样本。日常 profile 和真机均未参与。[单包升级与回退](../evidence/workspace-rc258-capacity-desktop-promotion-20261108T015229899582Z.json)

> 获准只读核对 DHome。Nginx 的控制与数据路径按来源 IP 共用每分钟 5 次的升级限额，`burst=3 nodelay`，站点另有 4 个并发连接上限。配置文件修改时间早于两个 Nginx worker 的启动时间，两者均早于真机验收。中继仍在回环端口监听，自 11 月 6 日启动后未重启，现场时段无中继服务异常记录。站点访问日志关闭，错误日志写入 `/dev/null`。现场手机的 24 条升级 503 缺少逐笔服务端记录，无法确认是请求限流、并发上限还是其他响应来源。两端若共用来源 IP，空闲时一次正常握手就会用完四次快速升级额度，重复拨号能复现请求限流。线上配置和服务状态保持原样。[只读核对](../evidence/workspace-dhome-rc258-503-readonly-20261108.json) · [配置与 worker 时间](../evidence/workspace-dhome-rc258-nginx-generation-20261108.json) · [历史 Nginx 对照](../evidence/nginx-burst-real-20261030.json)

> 用经摘要校验的 Ubuntu Nginx 1.24.0 在本机回环重放同一请求和并发限额。四个普通请求后紧接的第五个请求记录为请求限流。四条 WebSocket 保持打开且请求额度恢复后，第五次升级记录为并发拒绝。合成上游直接返回的 503 记录为上游状态。诊断日志仅保留最终 503 的时间、标准化路径、响应码和三个类别字段，合成查询参数和请求头未进入日志。三个隔离进程均正常退出，线上启用待授权。[回环诊断验证](../evidence/workspace-rc258-nginx-503-diagnostic-20261108T020637528396Z.json)

> 获准后仅更新日常桌面的 Harmony 容量修复包，核对 881 个文件。真机沿用 rc2.58 与原配对，置顶简报在原生聊天读到正文，跨三个约九分钟的房间轮换后仍可读取。同一轮有三次 `workspace-grant-required`，均在旧授权对应的连接结束后收到。最后一次桌面确认授权比该连接关闭早约 16 秒。两次验收脚本也因握手代次变化在点击前停止。期间真机列表自动化有三次找不到置顶条目，用户手动打开后继续从当前正文验证。标准 Web 未取得有效授权下的正文结果，DevFlow 未进入。DHome 约 32 分钟的诊断窗口无 503，原配置已按摘要恢复。桌面诊断也已按原字节恢复。手机已归还，验收模型调用为零。[容量修复真机验收](../evidence/workspace-phone-rc258-capacity-field-20261108.json)

> 用本轮真机记录预检普通桌面模式下的简报验收入口。入口按手机加密握手和桌面授权回执时间选取当前授权，三个现场旧授权均被拒绝。实际手机回执中的两次握手与对应桌面时间相差不到一秒。缺失握手、关闭或更换连接、重复回执及会话不符均在点击前拒绝。合成子进程验证持续接收关闭事件和退出清理，合成界面按标准 Web 打开正文、关闭返回、直达 DevFlow 和只读模型配置的顺序通过。共 18 项，真机链路待获准后运行。[入口预检](../evidence/workspace-rc258-fresh-grant-preflight-20261108T030130826566Z.json)

> 桌面候选的工作区授权截止时间取配置时限、当前连接票据和中继房间租约的最早值。内存加密中继回归核对授权回执和状态的实际截止时间，在等待桌面确认时推进到房间到期，并确认旧卡片被拒绝。沿用原配对重连后，重新授权可打开工作区，旧资源句柄仍被拒绝。两组集成共七项通过，严格类型检查覆盖 249 个模块，桌面九个入口构建无类型诊断。使用合成身份和会话，真实模型调用为零。[授权命令回归](../evidence/workspace-device-command-1794107588160.json) · [访问回归](../evidence/workspace-access-1794107585160.json) · [桌面构建](../evidence/workspace-desktop-rc258-grant-deadline.json)

> 授权期限候选以现场容量修复包的留存归档为基线。隔离 profile 只替换 Harmony，核对 881 个文件、六个保留包及合成会话和配对样本。常规模式的三处故障回退、中断恢复、安装、显式回退和再安装均通过，配置内容与文件身份保持一致。原诊断模式也通过同一组七项检查。候选尚未装入日常桌面，真机工作区和 DevFlow 仍待复验。[封存候选](../evidence/workspace-desktop-grant-deadline-6t4ebpf_/candidate.json) · [常规模式预演](../evidence/workspace-rc258-grant-deadline-desktop-promotion-20261108T032637367510Z.json) · [诊断模式复验](../evidence/workspace-rc258-capacity-desktop-promotion-20261108T032637267753Z.json)

> 简报验收入口可按桌面命令日志中的关闭、启用回执及手机握手核对本轮授权，截止时间相同也可区分回执。离线预检共 29 项，覆盖实际 JSONL 与多帧 Zstandard 读取、末帧不完整拒绝、待落盘时复查、连接换代拦截，以及合成界面的标准 Web 打开、关闭返回和 DevFlow 只读。测试还核对授权期限候选与隔离安装证据。日常桌面和真机未参与。[入口复验](../evidence/workspace-rc258-fresh-grant-preflight-20261108T033637423050Z.json)

> `.build/review-rc258-workspace-attempt.py` 只读复核已有验收回执，将点击前握手变化、工作区授权拒绝、打开期间的传输中断和 ArkWeb 加载诊断分开记录。六份现场回执和八项合成对照通过。rc2.58 的三次点击都在准备阶段收到授权拒绝，另两次握手换代时未点击。rc2.54 的成功回执缺少加载诊断字段，复核保留这项缺口。原现场包和更新入口仍通过预检。[打开阶段回执复核](../evidence/workspace-rc258-open-attempt-review-20261108T043256059540Z.json)

> 隔离的安装版 Host 使用同一份封存 Harmony 归档完成两轮复验。设备命令轮通过状态、停止及 Client Modules 卸载和恢复。加密工作区轮先确认未授权请求被拒，随后使用归档中的授权服务核对截止时间等于当前连接期限，并验证标准 Web 资源摘要、关闭重开及 DevFlow 设置读回。四条固定回放完成主任务与只读委派，子任务为 `worker/high`。两轮 Host 均以 0 退出，真实模型调用和非回环外联尝试均为零。加密对端为 Node 测试端，模拟器和真机仍待同一候选复验。[命令复验](../evidence/workspace-installed-device-command-complete-1794109270829-probe-T9948p.json) · [加密工作区复验](../evidence/workspace-installed-workspace-trace-1794109451041-probe-zeCMUq.json)

> 常规模式单包入口完成五项离线预检。只读检查核对候选归档、两轮 Host 结果、验收脚本摘要和留存更新计划。错误的计划摘要、无效的回退摘要及诊断恢复参数均被拒绝。替身检查确认桌面仍运行时在选择日常 profile 前停止。实际安装和回退沿用已预演的事务，日常 profile 与真机未参与本轮。[安装入口预检](../evidence/workspace-rc258-grant-deadline-entry-preflight-20261108T034908333830Z.json)

> 容量修复版配套 rc2.58 在隔离 ArkWeb 使用 Archive Manager 1.1.7 原包。七项检查覆盖设置页、窄屏归档标题、旧版收藏接口拒绝、合成会话恢复和返回原生。Host 确认恢复生效，驱动和 Host 均以 0 退出。一条固定回放，真实模型调用为零。原测试包已恢复，转发及测试私钥已清理。[Archive Manager 原包复验](../evidence/workspace-rc258-capacity-archive-manager-emulator.json)

> 从空包名入口启动标准插件列表后，Chromium 在 390 CSS px 宽度发现并打开 Archive Manager 1.1.7 原包，进入归档设置并恢复一条合成会话。旧版收藏和归档元数据接口继续拒绝设备访问。同一组加密回环回归还验证重连重新授权后的 DevFlow 直达和设置读回，六项通过，原包摘要一致。此轮未在 ArkWeb 或真机执行。[标准插件列表回归](../evidence/workspace-access-archive-manager-1794110081662.json)

> 原生 SDK 替身先缓存一份合成插件资源，再切换加密连接代次。旧 Web 控制器和端口已释放，旧授权下的准备失败，两个视图都无法读取缓存。模拟重新授权后，同一会话和 DevFlow 目标可以重开并复用已校验的缓存字节。81 项检查通过，相关的六个源码和生成输入与 rc2.58 官方编译记录逐字节一致。此轮未执行 ArkWeb 或真机操作。[授权与缓存回归](../evidence/workspace-rc258-native-cache-grant-20261108T035948201675Z.json)

> 授权期限候选在安装版 Host 经同一加密连接验收 Rich 动作。首轮测试未接受释放接口省略 `value` 的成功回执，修正解析断言后整轮通过。一个动作从接受进入完成，另一动作保留未决状态。关闭工作区并重开后，新的 Rich 挂载读回原草稿和未决回执，查询没有追加模型请求。DevFlow 也用同一归档重新通过，两轮各四条固定回放，真实模型调用和外联尝试均为零。对端使用 Node P-256，未执行 ArkWeb 或真机操作。[首轮失败记录](../evidence/workspace-installed-workspace-trace-1794110656070-probe-MgVEdL.json) · [Rich 复验](../evidence/workspace-installed-workspace-trace-1794110822178-probe-q7TPBR.json) · [DevFlow 复验](../evidence/workspace-installed-workspace-trace-1794110808233-probe-ydlqUJ.json)

> 桌面「手机连接」面板显示上次工作区授权回执的本地截止时间。到期后提示用户查询状态，原回执仍可查阅。模拟时钟验证新回执覆盖旧定时器、面板到期不发命令、查询确认关闭后可重新授权，以及会话释放时清理定时器。构建后的组件通过中英文渲染检查，31 项通过，249 个模块通过严格类型检查。此界面改动在源码和隔离前端构建中，现有待验收归档的安装入口复核仍通过。[桌面面板回归](../evidence/control-panel-0.0.0-rc2.35-1794111291068.json)

> 独立 Chromium 在实际设置页完成限时授权，显示时间与合成 Host 的回执一致。推进浏览器时钟至截止时间后，出现查询提示，Host 命令计数保持不变。测试在 Host 停止授权，面板显式查询确认关闭后可再次授权。首轮脚本仍按旧版单选框操作，在确认卡片前停住。按当前 Rich 单选按钮复跑后，源码设置页与历史封存包的确认取消流程均通过，模型调用为零。[首轮记录](../evidence/control-panel-shell-settings-1794111560517.json) · [新版设置页](../evidence/control-panel-shell-settings-1794111694993.json) · [历史封存包](../evidence/control-panel-shell-recovery-1794111697537.json)

> 到期提示已封存为独立桌面候选。归档共 309 个文件，其中 301 个与授权期限候选逐字节一致，涵盖 Host 入口、依赖清单和标准 Web 工作区资源。其余八个文件是设置页构建产物、文档和构建记录，浏览器入口与 Chromium 验收用的文件一致。原授权期限候选的安装预检仍通过，现场计划沿用原归档。新版提示尚未装入日常桌面。[独立候选](../evidence/workspace-desktop-grant-panel-16lxi8xz/candidate.json)

> 授权期限候选已接入 rc2.58 空白会话的隔离 ArkWeb 验收入口。API 26 未签名测试 HAP 编译通过，与已通过 ArkWeb 的夹具相比仅更新测试 CA 和资产索引。隔离 Host 启动合成空白会话流程，发布回环 WSS 就绪状态，Harmony、Workspace UI 和 DevFlow 的 644 个清单文件与封存产物逐字节一致。错误收据摘要、错误前序包和非空白会话模式均在 Host 启动前被拒。预检主动结束无客户端的运行，Host 拒绝将它计作 ArkWeb 通过。零回放和真实模型调用，模拟器未在线。[隔离 Host 预检](../evidence/workspace-rc258-grant-deadline-arkweb-host-preflight-20261108T044718943948Z.json)

> 同一授权期限归档与 rc2.58 夹具在隔离 ArkWeb 通过 18 项。原生页选择任务类型、主模型和思考强度，仅新建一条空白会话。标准 Web 可切到已有正文的合成会话，关闭后回到同一原生会话，原会话草稿保留。同进程重连后旧授权被拒绝，重新授权可重开。DevFlow 直达、会话设置保存、重开读回和恢复继承均通过，全局及同名会话设置保持。驱动和 Host 均以 0 退出，零模型调用和回放响应，原测试包已恢复，转发和测试私钥已清理。[ArkWeb 整轮](../evidence/workspace-rc258-grant-deadline-arkweb-blank-20261108.json)

> 日常桌面已按授权备份并仅更新 Harmony 授权期限包，881 个文件通过核对，配置保持原字节，DSH 正常重开。真机 rc2.58 沿用原配对重连，原生简报正文可读。用户确认时授权剩余约 123 秒。手机握手日志已滚出，复验以新桌面回执、同一应用进程及 Host 的连接绑定授权为准。点击约 66 秒后未捕捉到正文，随后观察到标准 Web 的侧栏、全局面板和返回入口。后续界面已显示原生简报标题，未确认完整正文返回，DevFlow 未尝试。桌面新查询返回 `workspace-disabled`，手机已归还，模型消息为零。[现场收尾](../evidence/workspace-phone-rc258-grant-deadline-field-20261108.json)

> 用与现场包相同的 Workspace UI 浏览器入口，在加密回环 Chromium 的 390 CSS px 视口打开一条已有正文、末尾有 24 条合成命令回执的置顶会话。首次可见范围只有尾部，向上滚动后正文进入视口，设备启动没有创建会话。六项集成通过。验收助手记录 Web 外壳出现时间，在看见命令回执且授权有效时最多向历史方向滑动三次，仍单独判定正文和返回。六项替身检查通过。此结果复现首屏误判条件，现场正文和 ArkWeb 差异仍待核对。[视口对照](../evidence/workspace-rc258-briefing-viewport-20261108T052817083408Z.json)

> Mate 90 Pro Max 隔离模拟器用同一授权期限归档复现 24 条命令回执占据 ArkWeb 首屏。收起侧栏后，向历史方向滑动一次即看到指定正文，关闭 Web 回到同一条原生会话。后续重连、旧授权拒绝、重新授权、DevFlow 保存读回及恢复继承也通过。前两次分别停在迟到的预览说明和滑动落在展开侧栏内，已保留结果。最终驱动与 Host 均以 0 退出，零模型调用和回放响应，原测试包已恢复，转发和测试私钥已清理。此前真机未看到正文的原因仍待实测。[ArkWeb 命令尾部对照](../evidence/workspace-rc258-grant-deadline-arkweb-command-tail-20261108.json)

> 同一授权期限归档与 rc2.58 在隔离 ArkWeb 通过 Rich 和官方翻译的 15 项检查。Rich 动作接受后完成，查询未决状态不重发，重开保留草稿及未决回执，来宾不能访问工作区对象、父页存储或网络。官方翻译三包 33 个文件前后字节一致，设置保存、译文与原文切换及重开读回通过。另逐字节核对 Harmony、Workspace UI、DevFlow 和 Rich 共 821 个文件。四条固定回放和一次本地翻译响应，真实模型调用及外联为零。驱动与 Host 均以 0 退出，原测试包已恢复，转发和测试私钥已清理。[Rich 与官方翻译整轮](../evidence/workspace-rc258-grant-deadline-arkweb-rich-20261108.json)

> 同一授权期限归档与 rc2.58 在隔离 ArkWeb 通过 DevFlow 执行的七项检查。标准工具箱保存自动编排和 `worker/high`，关闭重开后读回一致。四条固定回放和持久化请求确认父任务仍用 `main`，只读子任务使用 `worker/high` 并完成。再次核对桌面四包 821 个文件。驱动与 Host 均以 0 退出，真实模型调用和外联为零，原测试包已恢复，转发和测试私钥已清理。[DevFlow 执行整轮](../evidence/workspace-rc258-grant-deadline-arkweb-devflow-20261108.json)

> 同一授权期限归档与 rc2.58 在隔离 ArkWeb 通过原生新建执行的 13 项检查。仅创建一条 `minimal` 会话，四次实际 Host 请求和磁盘会话日志均核对了 `worker-model/high`，桌面默认选项保持。标准 Web 打开和关闭、草稿恢复、同进程重连拒绝旧授权、重新授权重开及 DevFlow 直达均通过。桌面四包 821 个文件与封存一致，四条固定回放，真实模型调用和外联为零。原测试包已恢复，转发和测试私钥已清理。[原生新建执行整轮](../evidence/workspace-rc258-grant-deadline-arkweb-creation-20261108.json)

> rc2.58 与现场同一授权期限归档在隔离 ArkWeb 通过两个标准原包的 17 项检查。Brick 0.2.1 核对发布 SHA-512 和七个包文件，主题开关、重开读回和设置项启停通过。停用后同一文档仍保留配色，重开恢复默认。Archive Manager 1.1.7 的 30 个文件与桌面原包一致，窄屏设置、标准会话恢复和拒绝旧收藏接口通过。每轮使用一条固定回放，真实模型调用和外联为零。两轮均恢复原测试包，清理转发和测试私钥。[第三方原包整轮](../evidence/workspace-rc258-grant-deadline-arkweb-thirdparty-20261108.json)

> 真机验收脚本可在确认原生简报和桌面已停用或已到期的回执后，等候最多 120 秒。仅收到启动等待后产生且仍有效的新启用回执，并重新确认同一手机进程及简报正文时，才打开标准 Web。八项离线检查覆盖过期、旧序号、等待前发起及超时回执。实际操作仍需真机现场和用户批准。[授权等待对照](../evidence/workspace-rc258-await-allow-offline-20261108T064108194645Z.json)

> 隔离 ArkWeb 保存的界面树中，同一段合成正文在 Web 里是 `genericContainer`，返回原生后是 `Text`。真机验收脚本改为在内存比对可见正文，保留节点类型和视口校验，返回时再核对简报标题。六项离线检查拒绝无关、视口外及缺少原生对照的文本。此前真机没有确认正文的原因仍未确定。[正文识别对照](../evidence/workspace-rc258-briefing-identity-offline-20261108T065231125329Z.json)

> 获准的 rc2.58 真机窗口再次确认置顶简报原生正文。脚本等候新授权回执 120 秒后退出，简报会话最新工作区回执仍为禁用。未点击 Web 或 DevFlow，手机已归还，模型消息为零。[本轮真机记录](../evidence/workspace-phone-rc258-armed-grant-field-20261108.json)

> 用户随后提交新授权。rc2.58 真机约 13 秒显示置顶简报的标准 Web 外壳及命令回执，滑动一次后仍未匹配到简报正文。关闭后回到同一条原生简报。同一授权下从手机设置按包名直达 DevFlow，约 34 秒显示编排、模型和思考强度，关闭后返回同一原生简报。手机已归还。该轮未保存插件设置，模型消息为零。离线对照确认先前脚本只在命令回执仍在首屏时继续滑动，新逻辑允许回执离开视口后在三次上限内查找正文，真机仍待复验。[真机结果](../evidence/workspace-phone-rc258-capped-grant-grantfield1108c.json) · [滑动对照](../evidence/workspace-rc258-briefing-tail-offline-20261108T070305961171Z.json)

> 桌面关闭助手未取得停止回执，已在本轮授权到期后结束。简报会话最后一条回执仍是本轮授权，记录的期限已到。[收尾记录](../evidence/workspace-phone-rc258-field-readonly-closeout-20261108.json)

> 隔离加密回归从一个控制会话批准工作区，再经标准 `session/follow` 读取另一条合成会话的既有正文。目标会话事件保持一致。停止工作区后重开被拒绝，原生连接仍可读取设备元数据。授权命令、工作区访问和桌面中继的源码摘要与现场封存包的构建输入一致。现场验收脚本已支持只从既有控制会话读取新回执，六项隔离检查核对错会话、重复日志及续跑拒绝。真机仍待复验。[分离授权与阅读的对照](../evidence/workspace-rc258-separate-approval-session-20261108T071627696074Z.json)

> rc2.58 真机使用控制会话的新授权，约 11.5 秒打开置顶简报的标准 Web 外壳。三次滑动后仍未匹配正文，主动关闭后回到同一原生简报。该轮只测简报，模型消息为零。随后的离线检查发现，真机验收脚本用原生滚动区域定位滑动，模拟器则用 ArkWeb 本身的区域和不同参数。脚本已对齐模拟器的手势，七项离线检查覆盖实际 ArkWeb 界面树、视口边界和授权失效。现场原因仍待确定。[控制会话真机结果](../evidence/workspace-phone-rc258-capped-grant-grantctrl1108d.json) · [ArkWeb 视口对照](../evidence/workspace-rc258-web-viewport-gesture-offline-20261108T073146208259Z.json)

> 本次验收脚本读取了控制会话的回执，简报会话在窗口内也出现启用回执。两个回执记录同一截止时间，收尾时均已到期。手机已归还。[控制会话现场收尾](../evidence/workspace-phone-rc258-control-session-field-closeout-20261108.json)

> 同一授权期限归档在隔离 ArkWeb 复现带粗体和列表的中文合成简报，末尾有 24 条命令回执。首屏可见回执，按 ArkWeb 实际区域滑动一次后显示正文，关闭后回到对应原生会话。用同一组界面树重放真机验收逻辑，确认首屏不会误判为正文，滑动参数与模拟器实际命令一致，授权失效时不会滑动。22 项通过，原测试包及转发已恢复，真实模型调用为零。置顶简报仍待真机复验。[中文正文与手势对照](../evidence/workspace-rc258-arkweb-markdown-handoff-20261108T074534322235Z.json)

> 用户随后借出真机复验。手机已解锁且 DSH 进程在运行，正常切回应用后，两种界面树模式均能读到 DSH 控件，仍未确认当前页是简报原生正文。验收停在授权前，未点击 Web，手机已归还，模型消息为零。[真机就绪核对](../evidence/workspace-phone-rc258-briefing-geometry-preflight-20261108.json)

> 隔离 ArkWeb 补验从原生置顶简报首次打开标准 Web。期间未在 Web 侧栏另选会话。首屏显示命令回执，按 ArkWeb 区域滑动一次后核对到同一段中文 Markdown，关闭后返回同一条原生简报。用该轮界面树验证真机脚本的正文匹配、滑动参数和授权过期拦截。后续 DevFlow 已保存并读回，但未找到恢复继承控件，整轮退出码为 1。模拟器原包与转发已恢复，真实模型调用为零。[首开简报阶段结果](../evidence/workspace-rc258-arkweb-briefing-first-open-20261108T080941120664Z.json)

> rc2.58 真机首次核对时显示已连接，但原生页没有简报标题和消息。从原生列表按置顶会话标识重开后读到正文。点开标准 Web 约 18 秒后出现外壳和尾部回执。按 ArkWeb 实际区域滑动三次仍未匹配正文。控制和数据连接在授权截止时关闭，点击后约 52 秒捕捉到工作区错误，未确认关闭返回。手机已归还，模型消息为零。[本轮真机结果](../evidence/workspace-phone-rc258-capped-grant-briefing1108e.json)

> rc2.58 配合相同桌面归档在隔离 Mate 90 Pro Max 模拟器复验。用 ArkWeb 会话滚动区滑动一次，确认从尾部回执到中文简报正文的视口变化，关闭后返回原生。新建任务选型、选模和思考强度，以及重连后授权重开均通过。DevFlow 保存、重开读回、恢复继承均由 Host 核对持久化结果，全局与同名会话配置保持。整轮 22 个验收字段符合预期，两端退出码均为 0，恢复了原测试包并撤销转发，模型调用为零。[ArkWeb 整轮结果](../evidence/workspace-rc258-arkweb-scoped-briefing-devflow-20261108T082449384541Z.json)

> 真机验收脚本改用 ArkWeb 会话滚动区，在内存比较滑动前后的视口，只保存计数。简报专项点击前要求至少剩余 85 秒授权，用于正文和返回验证。离线对照覆盖无变化、区域不唯一、正文在视口外及授权不足。上一轮真机点击时只剩约 51 秒，改后的手势及正文仍待真机复验。[真机脚本离线核对](../evidence/workspace-rc258-briefing-scroll-viewport-preflight-20261108T082207606191Z.json)

> 合成加密回环复现前后台重建时丢失原生会话选择。旧实现取得新目录后选中项为空。rc2.59 候选由页面在内存记住最后一次成功打开的会话。重建后在同一配对下读到原会话与正文，聊天页在选中项为空时不显示工作区入口。三个加密回环用例、163 个离线页面与流程用例、集成类型检查和官方 ArkTS 编译通过。候选未签名或安装，本轮未运行模拟器、真机或日常桌面，真实模型调用为零。[前台会话恢复核对](../evidence/workspace-rc259-foreground-selection-20261108T083724749768Z.json)

> Mate 90 Pro Max 隔离应用使用 rc2.59 的同字节产品核心、Ability 与生命周期代码，接入合成配对和回环 Host。Home 后确认旧连接清理，同一进程回前台后直接恢复原生简报标题与正文。旧授权被拒绝，新授权后在标准 Web 读到同一段正文并关闭返回。原生新建任务选型、主模型和思考强度，以及 DevFlow 保存、读回、恢复继承一并通过。24 个验收字段符合预期，两端退出码均为 0，原测试包与转发已恢复，真实模型调用为零。[前后台 ArkWeb 验收](../evidence/workspace-rc259-arkweb-foreground-briefing-20261108T085034453517Z.json)

> rc2.59 未签名真机包与 rc2.58 的应用及模块元数据只差版本名。隔离包沿用 rc2.58 的 `PairedCore.js`。rc2.59 真机包另带中继回调第三个参数用于传递房间截止时间，当前手机端回调只使用第一个绑定参数。真机候选尚未签装。[归档差异与范围](../evidence/workspace-rc259-arkweb-foreground-briefing-20261108T085034453517Z.json)

> rc2.59 原位升级离线预演已绑定未签名候选、rc2.58 原机安装回执及同一桌面归档。验收 25 个载荷条目、4 个签名前拒绝项、25 个安装前拒绝项、3 个安装后元数据反例。真机脚本重放隔离界面树，只有同进程、新加密连接和相同简报正文同时成立才进入新授权等待。未签名候选不能作为已装版本启动验收。本轮未读取真机或日常桌面，模型调用为零。[签装预演](../evidence/workspace-field-rc259-install-preflight.json) · [前台验收预演](../evidence/workspace-field-rc259-foreground-preflight.json)

> 获准后用原证书签装 rc2.59，官方验签和 25 个载荷条目通过。真机从 rc2.58 原位升级，UID 保持 20020297，原配对可读简报。回前台时在同一进程观测到新加密握手，原生简报正文一致。控制会话新授权有效，标准 Web 约 42 秒显示尾部回执。三次滑动中两次确认视口变化，约 66 秒的观察窗口内仍未匹配正文。关闭后返回同一条原生简报，授权在观察结束时仍有效。手机已归还，桌面包沿用原版本，模型消息为零。[rc2.59 真机验收](../evidence/workspace-phone-rc259-briefing-field-20261108.json)

> 使用 rc2.59 同字节产品核心和 `PairedCore.js`，在隔离 ArkWeb 复验 Rich 动作、官方翻译原包和 DevFlow 工作流。Rich 动作接受后完成，未决查询未重发，重开后读回草稿和回执。官方翻译设置保存、原文切换和恢复通过，33 个原包文件逐字节核对。DevFlow 保存重开后读回一致，持久化记录确认父任务用 `main`，只读子任务用 `worker/high` 并完成。两轮 22 项通过，各消耗四条固定回放，原测试包和转发已恢复，真实模型调用为零。[rc2.59 插件回放](../evidence/workspace-rc259-arkweb-plugin-actions-20261108T092748832526Z.json)

> rc2.59 同字节产品核心和 `PairedCore.js` 的隔离 ArkWeb 分页用例通过。置顶合成简报之后有 27 轮对话和 24 条授权回执。标准 Web 首屏显示尾部回执，正文在点击「加载更早」后可见。共滑动 16 次，关闭后核对同一条原生会话。首次尝试因模拟器应用主线程无响应终止，第二次走通分页和返回，后续组合流程触及 420 秒上限。拆分后的独立流程约 159 秒通过，模型调用和新增会话均为零。已恢复原测试包，转发列表为空，临时私钥已删除。现场简报的分页位置仍待真机核对。[分页验收](../evidence/workspace-rc259-arkweb-paged-briefing-20261108.json)

> rc2.59 分页真机入口已通过离线预演。使用封存的 ArkWeb 界面树，实测真机界面解析器只在会话滚动区存在唯一可点的「加载更早」时发出一次点击，正文匹配后核对返回原生的同一段文本。开页和正文查找的等待预算分别为 65 秒和 95 秒，过期或替换的控制会话回执会阻止后续 Web 手势。13 项分页及关闭对照与 29 项授权回归通过。本轮为离线预演，尚未借用真机或读取日常桌面。[预演回执](../evidence/workspace-field-rc259-paged-grant-preflight-20261108.json)

> rc2.59 真机使用原配对和控制会话新授权打开置顶简报的标准 Web。脚本找到并点击一次「加载更早」，21 次滑动中 4 次确认视口变化，95 秒正文查找窗口内未匹配到原生简报的参考正文。记录确认了分页点击，分页内容是否实际加载仍待核对。关闭后同进程返回同一段原生正文，控制会话授权在结束时仍有效。手机已归还，模型消息为零。[真机分页复验](../evidence/workspace-phone-rc259-paged-grant-paged1108e.json)

> 隔离 P-256 回环用 60 轮对话与 24 条尾部回执验证了标准 `session/follow` 和两次 `session/page`。简报正文仅在第二个更早页出现，三个页面拼接的事件序号与 Host 日志一致。真机验收脚本据此可在识别出不同页首后再请求，最多三页。旧页首重复、缺少可读页首和授权失效均阻止再次点击。用封存 ArkWeb 界面树与合成多页过渡通过十项对照，真机上的分页结果待复验。[多页验收预演](../evidence/workspace-rc259-deep-history-preflight-20261108.json)

> rc2.59 真机沿用原配对和控制会话的新授权运行多页验收。标准 Web 打开后点了一次「加载更早」，看到禁用的「加载中…」按钮，随后再次看到相同的可见页首，因此未重复点击。19 次滑动中 6 次确认视口变化，正文查找超时。退出后在同进程回到同一段原生正文，授权仍有效，记录中没有工作区 RPC 失败。现有记录无法判断分页请求收到的是成功响应、Gateway 错误还是未推进游标的页面。手机已归还，模型消息为零。[真机多页验收](../evidence/workspace-phone-rc259-deep-history-deep1108a.json)

> 隔离 Chromium 通过 P-256 回环打开同结构的合成置顶简报。用滚轮到达页首，两次「加载更早」各发出一次 `session/page`，旧阅读锚点的偏差均在 3 CSS px 内。正文在第二次之后可见，页面未创建会话，真实模型调用为零。首轮直接写入滚动位置后锚点偏移，改用滚轮并等待绘制后通过位置断言；隔离 Host 补齐计数服务后六项检查全部通过。此对照使用 Chromium，现场分页响应仍未记录。[标准 Web 分页对照](../evidence/workspace-rc259-paged-briefing-ui-20261108.json)

> 桌面 `traceRequests` 增加标准分页响应分类。P-256 回环确认两页推进、HTTP 200 内的 Gateway 参数拒绝和响应超限各有独立记录。传输对照覆盖无进展、权限拒绝与诊断回调异常，原响应仍逐字节转发。日志不含会话 ID、正文或事件序号值。重建的封存前版设备入口逐字节一致，候选只更换诊断相关输入，包内 304 个文件保持原字节。桌面九入口构建、六项加密集成和十二项传输检查通过。[分页诊断与封存桌面包](../evidence/workspace-page-diagnostic-20261108.json)

> 同一诊断包在两个独立安装版 profile 完成开关对照，每轮核对包内 311 个文件。开启时，两次标准分页和一次 Gateway 参数拒绝均有诊断与发送阶段记录。关闭时，同样的分页、错误和重开读回通过，工作区诊断为零行。两轮实际模型调用及外部出站请求均为零。另用隔离副本预演换包、回退和中途故障恢复，七项通过，候选安装后核对 883 个文件。日常桌面和真机验收待安排。[安装版开关对照](../evidence/workspace-page-diagnostic-installed-20261108.json) · [换包与回退预演](../evidence/workspace-rc258-page-diagnostic-desktop-promotion-20261108T121540296482Z.json)

> 现场入口绑定了上述单包事务和原证书 rc2.59 安装回执。日志只保留加密阶段、分页结果与该分页请求的发送阶段。用封存安装版日志验证分页序号关联，并验证拒绝断线、换代、截断、超容量和回执不匹配。九项现场入口对照及十项已有界面树回归通过，均在离线预演中执行。[现场入口预演](../evidence/workspace-page-diagnostic-field-preflight-20261108.json)

> 获准后临时更新桌面 Harmony 单包，沿用 rc2.59 和原配对复验。首轮等待授权超时。第二轮把稍后收到的授权与新加密连接核对，随后捕获同连接上的一次分页。Host 返回 HTTP 200，游标推进，响应 1,616,552 字节、325 条记录，仍有更早历史。Host 到达 `socket-submitted`，记录未覆盖手机分块读完或 Web 应用页面。真机看到加载后仍是同一可见页首，正文查找超时，关闭后回到同一段原生正文。零模型消息。桌面恢复原包和配置，881 个文件与原记录一致，已正常重开。安装回执的跨盘重命名失败后，逐项复核回退并完成双份回执归档。[现场分页与回退](../evidence/workspace-page-diagnostic-field-result-20261108.json)

> 隔离 Chromium 沿用产品分块和加密包容量，经 P-256 回环读完 1,615,350 字节的合成更早页，两块分别为 1,048,576 和 566,774 字节。标准 Web 应用了两次分页结果，保持旧阅读锚点，第二页的简报正文进入视口。六项集成通过，新增会话和真实模型调用均为零。[同体积分页对照](../evidence/workspace-field-sized-briefing-browser-20261108.json)

> API 26 隔离 ArkWeb 使用同字节 rc2.59 工作区核心，经 P-256 加密 WSS 读取 1,610,496 字节的合成更早页。Host 确认两块分别为 1,048,576 和 561,920 字节，ArkWeb 显示简报正文，关闭后回到同一原生会话。首轮脚本在加载时提前读取界面树，补上视口和加载状态检查后复验通过。新增会话、回放、模型调用和外联尝试均为零，原模拟器测试包已恢复。实际简报通过公网中继的收包和显示仍待真机核对。[ArkWeb 同体积分页](../evidence/workspace-field-sized-briefing-arkweb-20261108.json)

> 桌面分块诊断使用中继挂载内的分页序号，记录各块的准备和本地套接字提交阶段、字节偏移与长度。源码回环把 1,615,350 字节分页的两个分块关联到原请求，标准 Web 仍能显示简报正文。单包候选在复制的安装版 Host 两个独立 profile 验证，开启时三条分页响应各有一块提交记录，关闭时诊断为零行。两个 profile 均通过工作区重开检查，真实模型调用和外联尝试均为零。真机接收和渲染仍需手机端证据。[分块诊断与安装版复验](../evidence/workspace-page-chunk-trace-installed-20261108.json)

> 分块诊断的现场入口绑定原证书 rc2.59 的安装回执及新桌面单包。隔离换包、回退和中断恢复七项通过，换包后核对 883 个文件。采集预演用封存安装版日志与大页回环日志，区分无分块记录、部分提交和完整提交，拒绝偏移错误、重复记录、连接换代及捕获溢出。现场入口十项和既有多页界面十项均通过，等待现场授权。[现场入口预演](../evidence/workspace-page-chunk-trace-field-preflight-20261108.json)

> 真机 rc2.59 沿用原配对和控制会话新授权，从置顶简报原生页打开标准 Web。加密连接和授权在采集结束时仍有效。工作区在 `renderer-boot` 阶段失败，未出现标准 Web 会话视口，也未发出分页请求。退出后回到原生界面，同段简报正文未匹配。本轮验收零模型消息，桌面恢复原包、配置和锁文件，核对 881 个文件并重开可见窗口。分页分块仍待真机验收。[现场渲染启动结果](../evidence/workspace-page-chunk-trace-field-result-20261108.json)

> rc2.61 在 `renderer-boot` 失败时汇总本次启动的加载、缓存命中、HTTP 错误、资源传输或响应异常、缓存异常和排队拒绝，并计数其中的插件资源失败。日志只含计数，工作区重开会重置。83 项原生替身测试通过。API 26 未签名包的 84 个编译输入中，只有版本和 `NativeWorkspaceOwner.ets` 与 rc2.60 不同。隔离 ArkWeb 用同字节承载层和合成页面触发一次插件脚本 404，记录 HTTP 错误与插件资源错误各一次，关闭后恢复原测试包。真实简报启动失败原因仍待真机取证。[rc2.61 启动资源诊断](../evidence/workspace-rc261-boot-assets-validation-20261108.json)

> rc2.61 原位升级入口在离线预演中拦截了 25 项不符合安装条件的输入，并验证 3 项安装后元数据检查和 6 项载荷对照。简报采集入口沿用已恢复的桌面包，要求本轮授权期间保持同一手机进程和加密连接，仅保留本次 Web 打开时间段内的结构化启动计数。8 项离线检查通过。rc2.61 待原证书签装和真机复验。[升级预检](../evidence/workspace-field-rc261-install-preflight.json) · [简报采集预检](../evidence/workspace-field-rc261-capture-preflight.json)

> 用构建后的标准 Web 启动页和模块加载器，在隔离 Chromium 接入 rc2.61 文档脚本及原生 SDK 替身。正常插件挂载进入就绪。插件脚本返回 404 时，HTTP 错误和插件资源错误各记录四次，包含标准加载器的回退请求。插件脚本全部返回 200、激活抛错时，错误计数均为零。两个故障都触发 `renderer-boot`。现场计数为零时仍需检查脚本注册和插件激活。[启动故障对照](../evidence/workspace-standard-boot-failure-differential-20261108.json)

> 用户批准后，rc2.61 使用原证书签名，官方验签及 25 个载荷条目核对通过。应用正常退出后执行原位安装，UID 20020297 未变。首次连接采到 5 次升级 HTTP 503，四次在数据通道。正常重开后设置页显示已配对及已连接电脑，打开置顶简报能读到原生正文。标准 Web 两个入口分别因缺少同进程握手标记和可核验的授权基线停在点击前，未取得启动计数或正文。沿用原桌面包，验收零模型消息。[连接采集](../evidence/workspace-phone-rc261-connection-20261108.json) · [严格采集](../evidence/workspace-phone-rc261-boot-assets-boot261a.json) · [限时回执采集](../evidence/workspace-phone-rc261-boot-assets-boot261b.json)

> rc2.62 修复清单声明非空时仍接受 200 空响应的问题。新增对照在旧实现收到 200，修复后收到 502，后续正确字节可读取和缓存，真实空文件照常可用。84 项原生替身测试与官方未签名构建通过。该构建与 rc2.61 的 84 个编译输入相比，只变更缓存源码和版本。rc2.62 产品包尚未签装。[SDK 替身](../evidence/workspace-native-1794149101505.json) · [构建回执](../evidence/native-build/2026-11-08T14-45-22-222Z.json)

> 隔离 API 26 ArkWeb 使用主仓提交的工作区所有者、缓存和 Web 脚本复验空响应。两个合法空样式加载成功，非空清单资源的首次空响应被拒绝，随后收到的正确样式生效。同一资源第三次读取成功，测试提供方共收到两次请求。可选资源故障未阻止页面就绪，关闭后回到原生测试页。原隔离包已恢复，转发表为空，真机及日常桌面未参与，零模型调用。[ArkWeb 空响应复验](../evidence/workspace-arkweb-empty-manifest-rc262-20261108.json)

> DevFlow 会话设置对账读取当前配套隔离 ArkWeb 留下的两个持久化动作和最终会话配置。保存是修订 0→1，恢复继承是 1→2，最终覆盖为空。九项离线检查使用重建的测试基线，拒绝其他会话或全局设置变化、错目标和只有意图记录的未决动作。真机写入和恢复仍待验。[持久化对账](../evidence/workspace-rc258-devflow-session-durable-audit-20261108T072806663467Z.json)

> rc2.59 的 DevFlow 现场对账已绑定先前获准创建的空白会话回执。保存前按完整 ID 选择会话，使用隔离 ArkWeb 的同名选项布局核对，缺失、重复、裁剪和标题冒用 ID 的选项均拒绝。对账分别核对保存、重开读回和恢复，要求两条完成回执、其他设置保持原字节、原类型及模型选项恢复。22 项离线检查使用真实隔离动作记录、最终配置和空白会话日志，重建了保存前及保存后的配置快照，临时类型切换记录为合成数据。现场能否直接选中 `minimal` 及真机写入仍待复验。[DevFlow 现场预检](../evidence/workspace-field-rc259-devflow-checkpoints-preflight-20261108.json)

> 工作区响应修复覆盖 204、205、304 和 `HEAD`。旧客户端收到 205 会抛出异常，修复后 11 项传输检查通过。隔离 Chromium 通过生成后的工作区脚本保留合成 205 的状态、响应头和空正文，工作区载体对 403 和 404 的 `HEAD` 传输零字节，官方翻译原包流程通过。桌面九入口和 rc2.60 未签名 HAP 编译通过，HAP 内脚本与 Chromium 使用的文件逐字节一致。[响应兼容验收](../evidence/workspace-response-bodies-validation-20261108.json)

> rc2.60 同字节工作区脚本在 API 26 隔离 ArkWeb 通过五项检查。使用源码编译的工作区访问实现，经加密 WSS 打开合成置顶会话，页面核对 205、403 和 404 的状态、响应头及 `null` 正文。Host 记录一次 205 读取，owner 处理器调用为零。关闭标准 Web 返回原生会话。模型调用、回放和外联尝试均为零，原测试包已恢复，转发和测试私钥已清理。日常桌面和真机仍待验证。[ArkWeb 响应回归](../evidence/workspace-rc260-arkweb-response-bodies-20261108.json)

> Rich 回执丢失对照在 Chromium 和原生 SDK 替身上运行。第一个动作正常接受并完成。第二个动作由 Host 持久化并返回接受回执，夹具随后丢弃回执。关闭并新建工作区和 Rich 视图后，草稿读回一致，按原动作 ID 先查询到 `running`，再查询到 `outcome_unknown`。整轮共两次提交、两次查询、两个持久化动作和四条固定回放，真实模型调用为零。首轮复用了旧文档消息桥，因编号冲突未完成重开。分开文档与传输后复验通过。[文档桥回执丢失回归](../evidence/workspace-rich-receipt-loss-reopen-20261108.json)

> P-256 加密回环在 Host 已持久化 Rich 动作、正在加密接受回执时断开数据 WebSocket。旧绑定失效，沿用配对完成新握手，重新授权后恢复草稿，并按原动作 ID 读到相同的 `outcome_unknown` 状态和账本序号。状态查询未触发执行，显式重送原动作 ID 读回接受回执，Host 只分发一次。六项集成检查通过，使用四条固定回放，真实模型调用为零。真机上的 Rich 提交仍待验收。[加密回执丢失回归](../evidence/workspace-rich-encrypted-receipt-loss-20261108.json)

> 同一测试夹具另用加密设备 RPC 复验标准 Rich 包启动。模拟目录显示 313 项，实际只持久化一条合成会话。标准工作区就绪并挂载 Rich，消耗一条固定回放，真实模型调用为零。[加密启动复验](../evidence/workspace-rich-1794136033602.json)

> 对同一合成长会话的标准 Web 首开和重开补采原生及桌面阶段。主文档响应到 ArkWeb 端口交接为 20.8 秒和 4.8 秒，桌面处理并提交回复的时间区间并集为 1.7 秒和 1.4 秒。两次均显示原生和 Web 历史，关闭后回到原生，原测试包已恢复。[启动分段测量](workspace-measurement.md#rc257-标准-web-启动分段)

> 隔离 Host 将分块改为 rc2.57 原生支持的 1 MiB 后，同一合成长会话的标准 Web 首开、重开和关闭均通过。首开读取请求从 71 次降到 58 次，模型调用为零，原测试包已恢复。[分块对照](workspace-measurement.md#512-kib-与-1-mib-的-host-分块对照)

> 在相同的 1 MiB 隔离场景补采原生资源。首次打开 8 个资源均走加密调用，同进程重开 8 个均命中缓存。两次都显示正文，关闭返回原生，零模型调用，原测试包已恢复。[原生资源计时](workspace-measurement.md#1-mib-下的原生资源计时)

> 隔离对照将原生资源槽由四个增至八个。首开原生资源排队从 6.5 秒降至零，正文显示耗时从 25.5 秒变为 27.3 秒。八槽的首次打开、重开和关闭均通过，零模型调用，原测试包已恢复。[并发对照](workspace-measurement.md#四个与八个资源并发槽)

> 隔离候选让缓存校验与 ArkWeb 响应复用正文解码。SDK 替身对照确认两次降为一次，候选 36 项通过。实际 ArkWeb 首开、重开与返回均通过，零模型调用，原测试包已恢复。[单次解码对照](workspace-measurement.md#缓存校验与-arkweb-响应复用解码结果)

> 同一桌面归档搭配 rc2.54 核心在隔离 ArkWeb 通过空白会话 12 项检查。原生选择任务类型、主模型与思考强度后恰好创建一条会话。重连拒绝旧授权，重新授权后标准 Web 重开，DevFlow 直达后可回到原生草稿。桌面默认模型保持原值，模型调用与回放响应均为零。独立 profile 另完成原六包组合升级、离线回退和再升级，共核对 881 个文件，五个其他插件和合成配对、会话、配置的字节一致。模拟器恢复原测试包。[空白会话和回退复验](../evidence/workspace-desktop-initial-selection-release-36547xt8/blank-and-rollback-verification.json)

> 同一配套归档搭配 rc2.54 核心在隔离 ArkWeb 通过 DevFlow 7 项、Rich 与官方翻译 15 项。DevFlow 保存模型档案并在重开后读回，Host 确认只读委派的子任务使用 `worker/high`，父任务仍为 `main`。Rich 核对接受后完成、未决动作查询不重发、关闭重开与前后台草稿恢复。官方翻译原包通过设置保存读回和原文／译文切换。两轮各四条固定回放，真实模型调用为零，原测试包已恢复。DevFlow 首轮因页标题滚出可访问区域而误报，复跑改用可见配置控件确认面板。[插件行为复验](../evidence/workspace-desktop-initial-selection-release-36547xt8/plugin-actions-verification.json)

> 原封存 DevFlow 会默认选中第一条会话。将显式目标选择的源码修复封为同名同版本标准候选，归档差异限于客户端脚本、源映射与 README，Host 入口逐字节一致。隔离 ArkWeb 通过 16 项检查，两条同名合成会话按 ID 区分，选定后可保存、关闭重开读回并恢复继承。Host 核对同名会话和全局配置均未变，模型和回放为零。测试 profile 临时允许 `minimal`，以复用原生新建任务。三包组合在独立 profile 通过升级、离线回退与再升级，核对 881 个文件。[会话设置与安装复验](../evidence/workspace-devflow-target-release-gsjs1c63/verification.json)

> 同一三包组合搭配 rc2.54 工作区核心，通过 DevFlow 工作流 7 项、Rich 与官方翻译 15 项隔离 ArkWeb 检查。Host 核对 DevFlow 只读子任务的持久化请求使用 `worker/high`，父任务使用 `main`。Rich 的动作结算、未决查询、草稿和前后台恢复通过。官方翻译的原包通过设置读回和原文切换，三个相关包逐文件核对一致。两轮各用四条固定回放，真实模型调用为零，模拟器已恢复原测试包。[当前三包插件行为复验](../evidence/workspace-devflow-target-release-gsjs1c63/plugin-actions-verification.json)

> 三包安装预演先在隔离 profile 离线生成锁文件，现有模块布局保持一致。锁文件只替换三个归档，并为 Harmony 和 Archive Manager 增加 Workspace UI 的 peer 引用。保留的 71 条包记录和 70 条解析快照一致。五种锁文件篡改被拒绝。故意破坏隔离安装中的 DevFlow 客户端文件后，完整性检查拒绝该安装，随后离线回退、再升级并通过 881 个文件核对。锁文件中的相对路径绑定隔离 profile，日常部署需从获准的日常基线重新生成。[桌面锁文件预检](../evidence/workspace-devflow-target-release-gsjs1c63/desktop-lock-preflight.json)

> 同一三包组合在隔离 ArkWeb 通过 Archive Manager 1.1.7 的七项检查。原包 30 个文件与先前标准安装一致，392 CSS px 下归档标题可见且页面无横向溢出。旧版收藏请求仍按权限拒绝，标准归档页恢复一条授权范围内的合成会话，Host 确认归档列表清空。使用一条固定回放，真实模型调用为零，原模拟器包已恢复。首轮界面驱动误收 Host 的 DevFlow 归档参数，分离参数后复跑通过。[当前三包归档复验](../evidence/workspace-devflow-target-release-gsjs1c63/archive-compat-verification.json)

> 三包原位替换在独立 profile 预演。只移动三个目标目录并更新五个 pnpm 元数据文件。Archive Manager 的 peer 记录随 Workspace UI 更新，其安装目录身份和文件字节保持一致。分别在首个包替换后和元数据写完后注入异常，两次回退均恢复 2,907 个文件的原始摘要。成功替换后核对 2,916 个文件，七个直接依赖的 pnpm 清单与离线安装副本一致，Node 解析到原位替换后的实际入口。[原位替换与回退预演](../evidence/workspace-devflow-target-release-gsjs1c63/desktop-promotion-verification.json)

> 2026-11-06，真机从 rc2.48 原位升级到 rc2.52。原证书与 profile 验签通过，25 个载荷文件逐项一致，UID 保留，设备页仍显示已配对。手机控制 WebSocket 在 HTTP 升级前重复报 `code=200 http=0`，电脑能解析中继域名，两次无凭证探测均未建立 TCP。尚未到工作区授权与页面复测。桌面授权为 `workspace-disabled`，手机应用已正常退出并归还，模型调用为零。[rc2.52 现场记录](../evidence/workspace-phone-rc252-field-20261106.json)

> 中继恢复后，已装 rc2.52 沿用原配对完成控制和数据 WebSocket 升级及加密握手，原生列表显示 15 个会话。手机锁屏后原进程显示配对配置不可用，正常退出再打开后原生列表恢复。三次工作区打开均在 `prepare` 返回 `unknown-outcome`，同期桌面查询为 `workspace-disabled`。其中一次重新授权后记录到新一轮加密握手，其他授权失效时点缺少同期传输日志。日常桌面入口摘要与 rc2.48 安装收据相同。手机正常退出并已归还，标准 Web 与 DevFlow 尚待真机验收。[恢复后真机记录](../evidence/workspace-phone-rc252-relay-restored-field-20261106.json)

> rc2.53 将后台清理和前台恢复按事件顺序执行。SDK 替身在旧源码复现前台回调早于清理，修复后 11 项错误路径及 68 项工作区检查通过。官方 API 26 编译通过，独立模拟器同进程回前台保留草稿，旧 ArkWeb 退出，工作区可重开和关闭，测试包已恢复。签名前检查拒绝旧产品包和模拟器包，假设备覆盖 rc2.52 原位升级和 19 项安装前拒绝。[生命周期验证](../evidence/workspace-rc253-foreground-validation.json) · [签装预检](../evidence/workspace-field-rc253-install-preflight.json)

> 配套桌面 Harmony 插件已通过离线冻结安装，Harmony、Rich 与 DevFlow 的 812 个文件核对一致，桌面已正常重启。手机用原证书从 rc2.52 原位升到 rc2.53，25 个载荷文件相符，UID 保留并以原配对读到原生会话。安装初验在原生新建页选中 `minimal` 后取消，具体模型与思考强度待复测。初验结束时手机已正常退出，模型调用为零。[rc2.53 安装与初验](../evidence/workspace-phone-rc253-field-20261106.json)

> rc2.53 真机经原配对和公网中继打开标准 Web，关闭后回到原生聊天。手机退到后台再切回，同一进程完成新加密握手，桌面确认旧授权失效。用户重新授权后，标准 Web 重开，手机设置按包名直达 DevFlow 并显示实际配置。验收全程只读 DevFlow，模型调用为零。手机已归还，桌面确认 `workspace-disabled`。[rc2.53 真机复验](../evidence/workspace-phone-rc253-regrant-devflow-20261106.json)

> 桌面恢复回归使用实际 Host 命令、内存凭据、合成配对和传输替身。首次连接在 Host 成功后丢失回执，面板保持锁定。成功停止后，查询配对状态重新开放连接，第二次连接复用原配对和身份。27 项设备集成和 27 项构建面板检查通过，桌面九个入口构建通过。安装版仍待复验。[设备集成](../evidence/device-integration-1793942638048.json) · [构建面板](../evidence/control-panel-0.0.0-rc2.35-1793942336041.json) · [桌面构建](../evidence/workspace-desktop-build.json)

> 工作区命令回归复现了本地停止成功后，旧确认仍能授权。修复后，停止连接或工作区会先取消并收尾未决授权。绑定读取中的授权也在发出前取消，旧访问被拒绝，新的明确确认仍可生效。本轮使用隔离 Host 和合成配对。[修复前](../evidence/workspace-device-command-1793942922538.json) · [修复后](../evidence/workspace-device-command-1793943084710.json)

> 桌面恢复候选以 rc2.53 真机验收时安装的桌面归档为基线，309 个文件中只有 12 个变化。包清单、配置补丁和标准 Web 资源的字节一致，Host 和面板入口与已验证构建一致。临时 profile 使用 pnpm 12.6.0 完成离线升级、回退和再升级。回退还原原锁文件，移开临时依赖目录后按新锁离线冻结重装成功。逐项核对 Harmony、Rich 与 DevFlow 共 812 个文件以及合成配对、会话和配置。[封存候选](../evidence/workspace-desktop-panel-recovery-candidate.json) · [离线预演](../evidence/workspace-plugin-install-1793943673753.json)

> 封存的桌面恢复归档与 rc2.53 工作区核心通过 API 26 独立模拟器三轮共 31 项检查。原生新建选中任务类型、主模型和思考强度，标准 Web 显示同一会话，按包名打开 DevFlow 后回到原生草稿。DevFlow 配置保存、重开读回及只读委派通过，Rich 动作回执、未决查询与来宾隔离通过，官方翻译原包的语言设置和原文、译文切换通过。三轮使用回环 WSS、测试 CA、合成身份及各四条固定回放，真实模型调用为零。原测试包已恢复，临时转发和证书私钥已清理。新桌面包的日常安装与真机复验待安排。[rc2.53 配套验收](../evidence/workspace-native-wss-panel-recovery-validation.json)

> 桌面切换预检在新建隔离 profile 使用两份封存归档的实际路径。仅替换 Harmony 引用的清单和锁与 pnpm 12.6.0 生成的结果逐字节一致。更新中断留下新清单和旧锁时，冻结安装拒绝继续，812 个插件文件未变。恢复原清单和锁后冻结安装成功，随后冻结升级和回退也通过，原清单、锁、合成配对及会话均保留。跨盘绝对引用在合成路径上验证往返。预检使用已有本地缓存并禁用脚本，日常 profile 和真机仍待现场复核。[冻结切换预检](../evidence/workspace-desktop-panel-recovery-frozen-preflight.json)

> 标准 Web 设置页加载首个封存恢复包后，复现了工作区停止后确认卡片消失、面板仍锁住再次授权的问题。面板按工作区和连接记录不确定状态。明确关闭的工作区停止回执解除工作区锁，连接锁须由本地连接停止解除。29 项面板检查、严格类型检查和九个桌面入口构建通过。[旧包整页复现](../evidence/control-panel-shell-recovery-1793947088228.json) · [面板检查](../evidence/control-panel-0.0.0-rc2.35-1793947303122.json)

> 修复包在标准 Web 设置页通过原配对恢复、未决确认取消、停止授权后解锁、重新确认授权和仅停止工作区的整轮复验。测试使用合成身份和传输替身。修复包相对首个恢复候选有七个文件变化，Host 入口和 156 个工作区 Web 壳文件逐字节一致。修复包使用实际封存路径通过冻结升级、回退和中断恢复。[修复包](../evidence/workspace-desktop-panel-recovery-workspace-stop-candidate.json) · [设置页回归](../evidence/control-panel-shell-recovery-1793947512600.json) · [冻结切换预检](../evidence/workspace-desktop-panel-recovery-workspace-stop-frozen-preflight.json)

> 同一修复包与 rc2.53 工作区核心通过 API 26 独立模拟器三轮 31 项检查，逐轮核对桌面归档、Host 入口和客户端文件摘要。原生新建和标准 Web 往返通过，DevFlow 保存配置并以 `worker/high` 完成只读委派，Rich 动作回执、草稿恢复及来宾隔离通过，未经手机适配的官方翻译原包通过保存和切换检查。测试使用回环 WSS、合成身份和十二条固定回放，真实模型调用为零。原测试包已恢复，临时转发和证书私钥已清理。新桌面包的日常安装及真机复验仍待现场窗口。[修复包与 rc2.53 模拟器验收](../evidence/workspace-native-wss-panel-recovery-workspace-stop-validation.json)

> 修复包在独立 profile 用三份归档的绝对路径通过冻结升级和回退。冷缓存因缺少完整包元数据被 pnpm 拒绝。合成回环镜像补齐元数据后关闭，升级及回退保留供应链校验并在离线模式完成。故意改动测试安装副本中的客户端文件后，逐文件核对拒绝继续。回退恢复原清单、锁及 812 个插件文件，合成配对和会话字节一致。实际安装在同一盘的隔离 profile 执行，日常跨盘 profile 待核对。[绝对路径锁与回退](../evidence/workspace-desktop-panel-recovery-workspace-stop-absolute-lock.json)

> 用户批准后，先在日常安装副本验证实际清单、跨盘锁和三包。完整重装因缓存缺少传递依赖被拒绝。保留现有依赖，仅替换标准 Harmony 归档和对应锁记录，副本的离线冻结校验、升级与回退通过。日常桌面正常退出后备份并完成同样切换，重启后读回两个入口摘要，Rich、DevFlow 和 profile 配置核对一致。设置页返回 `stopped` 后查询到 `bound` 及 `savedConnectionReady: true`，「连接」恢复可用并返回 `transport-started`。本条仅记录桌面回执，真机握手另验。[安装记录](../evidence/workspace-desktop-field-workspace-stop-installed.json) · [桌面重连记录](../evidence/workspace-desktop-field-workspace-stop-reconnect.json)

> 日常桌面切换后，现有 rc2.53 真机沿用原配对完成加密握手并打开原生聊天。桌面确认临时授权生效后，手机进入工作区外壳，但标准 Web 未渲染。手机记录两组共八个请求超时，涉及资源、插件清单、Rich 外观和面板清单。故障时段缺少对应的 Host 收发日志，无法判定超时发生在哪一端。DevFlow 未执行，返回原生未确认。手机已归还，桌面授权已关闭，模型调用为零。[真机工作区复验](../evidence/workspace-phone-rc253-workspace-stop-field-20261106.json)

> 桌面诊断候选在 `workspace.traceRequests` 显式启用后将阶段与耗时写入 Host 标准输出。隔离加密回环的四项测试通过。挂起加密时最后一条记录为 `sending`，释放后出现 `socket-submitted`。在结果就绪后撤销授权时记录拒绝，手机没有收到原结果。关闭诊断时无相关输出。候选构建包含九个入口，归档的 309 个文件逐一校验。日常桌面尚未部署诊断包，故障原因仍待双端同一时段的日志确认。[加密回环](../evidence/workspace-access-devflow-1793954164712.json) · [归档和 stdout 证据](../evidence/workspace-desktop-trace-stdout-candidate.json)

> 封存诊断归档在复制的安装版 Host 和隔离 profile 中运行，使用进程内加密中继和合成 Node P-256 对端。子进程 stdout 采集到 102 条脱敏记录。人工注入的拒绝记录为 `workspace-denied`，另一条请求在约十秒后收到对端的超时取消。标准 Web 文档和脚本摘要核对通过，关闭重开后通过 DevFlow 原包读回自动编排，四条固定回放确认只读委派使用 `worker/high`，真实模型调用为零。Host 正常退出。本轮验到资源和接口，手机渲染、公网中继及日常桌面采集仍待现场核对。[安装版 Host 隔离复验](../evidence/workspace-installed-workspace-trace-1793955235034-probe-cg6Gqh.json)

> 日常桌面诊断包与原配对 rc2.53 采集到同一打开操作的双端日志。授权生效后，Host 接收的 13 个请求均在 902 毫秒以内将响应交给本地套接字，随后加密通道关闭。手机同一进程报告数据 WebSocket `code=200 http=0` 和关闭，随后与 Host 完成新握手。手机日志未记录 RPC 超时，标准 Web 未见渲染，返回原生未确认，DevFlow 未执行。中继关闭原因未采到。手机已归还，临时授权已关闭，桌面已按原配置重启，诊断归档保留且日志开关关闭。模型调用为零。[真机双端记录](../evidence/workspace-phone-rc253-field-stdout-bgerqie3.json)

> 独立中继新增默认关闭的 `roomDiagnostics`。回环覆盖普通断线、WebSocket 消息大小和分段上限、控制帧上限，确认每次仅写一条固定原因，关闭诊断时不输出。中继回归 102 项通过，1 项在本轮跳过。独立 CLI 构建通过停用配置和无效开关两项预检。[中继回归](../evidence/phase39-vitest.json) · [构建预检](../evidence/workspace-relay-room-diagnostic-build-1793957088876.json)

> 同一中继候选在本机 Ubuntu 的 Node 24.13.0 上通过锁恢复、日志重开和未知写入拒绝。合成配对在诊断开启和关闭两种配置下各启动一次，回环 HTTP 均返回 404。每次正常关闭均释放两把锁，四份日志和头文件的摘要与启动前一致。[Linux 隔离验证](../evidence/workspace-relay-room-diagnostic-linux.json)

> 本机 Ubuntu 用原始 rc2.30 归档、诊断候选和回退后的原始归档依次启动同一组合成状态。三个阶段均对有效配对的控制升级返回 101，对已撤销配对返回空 403。每次关闭后两把锁均已释放，四份日志和头文件逐字节一致。诊断归档包含已验证的 `server.mjs` 和 19 个与原始 rc2.30 字节一致的 `ws` 文件。线上锁恢复 v2 的实际二进制及 systemd 启动参数仍待核对。[回退演练](../evidence/workspace-relay-room-diagnostic-rollback.json) · [候选归档摘要](../evidence/workspace-relay-room-diagnostic-release.json)

> 使用随中继固定的 `ws@8.21.3` 接收器重放同一条 932359 字节合成消息。单帧按 16 KiB 读入时完整接收，按 4 KiB 读入时第 129 批触发分段上限。同一消息改用 64 KiB 分帧后，在 4 KiB 读入条件下完整接收。公网中继未更新。真机请求的实际帧大小、读取分段和中继关闭原因仍待采集。[分段对照](../evidence/workspace-relay-receiver-parts-1793957086746.json)

> 隔离加密工作区通过真实回环 WebSocket 比较两种发送方式。接收器按不超过 4 KiB 的分段读入时，932353 字节的单帧响应触发 `ws-parts-limit`，加密连接失效。测试端改用 64 KiB 续帧后，工作区完整读回 715000 字节的合成字段。两个用例均使用实际 Host 和 P-256／AES-GCM，读取分段由测试控制，模型调用为零。[初次加密回环对照](../evidence/workspace-relay-parts-encrypted-1793958664982.json)

> 桌面正式发送函数 `dialApprovedWss` 接入续帧后通过同一加密对照。该测试把连接映射到回环，实际发送函数与 `ws` 帧解析均参与。旧发送方式仍触发 `ws-parts-limit`，候选完整读回合成工作区内容。桌面九个入口构建通过，类型诊断为零。候选归档逐项核对 309 个文件，其中八个有变化。公网与真机待验。[候选加密对照](../evidence/workspace-relay-parts-encrypted-1793959014788.json) · [桌面归档收据](../evidence/workspace-desktop-wss-fragments-candidate.json)

> 同一续帧归档在安装版 Host 副本中完成标准 Web 资源摘要检查、关闭后重开、DevFlow 配置读回和只读委派。使用进程内加密中继，四条固定回放确认子任务使用 `worker/high`，真实模型调用为零。首轮触发两分钟的验收总时限，复跑仅放宽验收总时限，产品请求配置沿用原值，Host 在约一分钟内正常退出。[隔离 Host 复验](../evidence/workspace-installed-wss-fragments-workspace-trace-1793959637323-probe-azZjk7.json) · [首轮超时](../evidence/workspace-installed-wss-fragments-workspace-trace-1793959511414-probe-57CuZE.json)

> 本机 TLS 1.3 回环直接加载旧版与续帧版封存归档的 `lib/device.js`。测试只追加发送函数的导出并将连接地址映射到回环，仍校验证书。按不超过 4 KiB 读入时，旧包在第 129 次读取触发 `ws-parts-limit`，新包完整送达同一条 932353 字节消息。不受信任的证书被拒绝，临时私钥已清理。测试发送合成二进制负载，公网和真机待验。[封存归档 TLS 对照](../evidence/workspace-packaged-wss-tls-1793960825145.json)

> 续帧归档在私有 `desktop` profile 用 pnpm 12.6.0 完成离线升级、回退、再升级和按锁重装。回退恢复原锁文件，再升级重现候选锁。逐项核对 Harmony、Rich 和 DevFlow 共 812 个文件，合成配对、会话与配置均逐字节一致。[离线安装与回退](../evidence/workspace-plugin-install-wss-fragments-1793961006540.json)

> 续帧归档已按授权安装到日常桌面并正常重开，三套插件 812 个文件与配置通过校验。rc2.53 用原配对完成握手和原生聊天，桌面确认临时授权生效。35 秒内未见标准 Web 渲染，手机同进程记录 `close` 和 `prepare` 超时。DevFlow 未执行，未采到同期中继关闭原因。手机已归还，临时授权已关闭，模型调用为零。[安装收据](../evidence/workspace-desktop-field-wss-fragments-installed.json) · [真机收尾](../evidence/workspace-phone-rc253-wss-fragments-field-closeout.json)

> 后续现场窗口核对了日常桌面安装的续帧归档入口，用户反馈已提交限时授权。原手机的 USB 调试连接持续离线，验收在访问应用前退出，标准 Web 和 DevFlow 均未执行。手机已归还。[USB 离线记录](../evidence/workspace-phone-rc253-usb-offline-retest-20261107.json)

> 此前一轮的两次 USB 预检均报告原真机离线。Windows 保留 13 条华为 USB 历史记录，当时枚举到的现有接口为零。验收在访问手机应用前停止，用户已收到归还通知。桌面 Allow 由用户确认提交，授权生效状态未核实。[主机 USB 枚举记录](../evidence/workspace-phone-rc253-usb-host-enumeration-20261107.json)

> USB 恢复后，核对日常续帧包的两个入口和原真机 rc2.53。同一进程完成标准 Web 打开与关闭、原配对重新握手、旧授权拒绝、重新授权后重开，以及按包名直达 DevFlow 并只读设置。每次关闭均返回原生，验收模型调用为零，手机已归还。桌面临时授权关闭待确认。[真机闭环](../evidence/workspace-phone-rc253-fragments-regrant-devflow-20261107.json)

> 用户后续反馈已提交 Allow。HDC 未识别到原手机 USB 目标，本次验收在访问应用前停止。手机已归还，已请用户关闭限时授权，关闭结果待确认。[本轮 USB 预检](../evidence/workspace-phone-rc253-usb-target-missing-20261107.json)

> 现场入口先于限时授权核对原手机 USB。预检只向现有 HDC 发目标列表请求，拒绝离线、目标摘要不符、多台 USB 在线、状态未知和 HDC 失败。设备操作入口再次核对目标，脱敏结果不含序列号。14 项替身 CLI 检查和 35 项既有离线现场流程对照通过。真机连接仍需在新窗口实查。[USB 预检结果](../evidence/workspace-phone-usb-preflight-20261107.json) · [现场顺序](../handoff/deploy-rc235-20261104/HANDOFF.md)

> 续帧候选的首轮 API 26 模拟器测试在锁屏时停止，界面检查执行零项。`aa start` 退出码为 0，但报告锁屏错误 `10106102`，UITest 返回空布局。启动器补充文本回执与空布局检查，四项离线对照通过。[锁屏中止记录](../evidence/workspace-native-wss-fragments-screen-lock.json)

> 解锁后，用与日常桌面相同的续帧归档复跑独立模拟器。七项检查通过，覆盖原生 WSS、标准 Web 渲染、标准 DevFlow 保存和重开读回、只读委派与关闭工作区。持久化子任务请求使用 `worker/high`。模拟器端使用回环 WSS，隔离 Host 端使用进程内中继。四条固定回放，真实模型调用为零。原验收包已恢复，转发表为空，测试证书私钥已清理。[模拟器复验](../evidence/workspace-native-wss-fragments-validation.json)

> 三端时间对照用上次真机收据和合成中继日志预检。采集工具核对手机证据摘要和进程连续性，拒绝未知中继字段，区分无同期记录、单条候选和多条候选。单条候选仅表示时间吻合。中继记录没有房间标识，三端时钟偏移也未实测。[采集预检](../evidence/workspace-relay-timeline-preflight.json)

> 启动超时对照以打开按钮的点击时间为起点，即使手机没有断线或重连记录，也能列出同期的手机超时、Host 请求阶段和中继关闭候选。旧工作区关闭失败时，同一连接上的重开会复用关闭错误，因而 `close` 和 `prepare` 两条超时不能单独证明新准备请求已发出。离线预检用保留的真机 Host 日志及合成手机超时、中继记录通过 11 项，当前原生 SDK 替身通过 68 项。三端时钟偏移和中继房间身份仍需现场证据。[对照预检](../evidence/workspace-startup-timeout-correlation-preflight.json) · [原生 SDK 替身](../evidence/workspace-native-1793980294290.json)

> 工作区请求通过设备验票后，Host 在分派前检查请求是否已取消、连接是否仍有效。加密回环在验票返回前送达关闭请求的取消帧。修复前，原资源句柄失效。修复后，原句柄仍可读，正常关闭、断线重连与重新授权也通过。桌面九入口构建通过，封存候选逐文件核对 309 项，唯一改变的运行入口是 `lib/device.js`。候选待部署，真机超时原因仍待同期日志确认。[修复前对照](../evidence/workspace-access-1793980586789.json) · [修复后回归](../evidence/workspace-access-1793980653789.json) · [桌面候选](../evidence/workspace-desktop-close-cancellation-candidate.json)

> 封存候选在隔离安装版 Host 通过关闭取消验证。原资源句柄仍可读，Host 在 `received` 阶段记录取消。标准 Web 壳和资源摘要校验通过，正常关闭重开后读回 DevFlow 设置，`worker/high` 只读委派使用四条固定回放。隔离 profile 的升级、回退、再升级和按锁离线重装均通过，三包 812 个文件及合成配对、会话和配置已核对。该轮使用进程内加密中继。[隔离 Host 复验](../evidence/workspace-installed-workspace-trace-1793981118023-probe-3BWfUP.json) · [离线安装与回退](../evidence/workspace-plugin-install-close-cancellation-1793981127308.json)

> 同一封存桌面包另经独立封存中继复验。桌面与合成设备的控制、数据通道共四条连接均使用 TLS 1.3，桌面从封存入口调用原 WSS 客户端，测试只映射回环地址和测试 CA。715000 字节启动字段完整读回，关闭取消后原资源句柄仍可读。正常关闭重开后读回 DevFlow 设置，`worker/high` 只读委派使用四条固定回放，真实模型调用为零。此轮使用 Node 设备测试端和本地 TLS 前置，公网中继与真机仍待验。[独立中继对照](../evidence/workspace-installed-workspace-trace-1793984782240-probe-sJ5hVq.json)

> 关闭取消候选的现场预检以日常桌面当前清单、锁文件和模块元数据为基线。在私有副本和私有 pnpm store 完成冻结升级与回退，每阶段核对三包 812 个文件。临时诊断配置在内存中生成，移除新增行后可逐字节恢复。现场执行前须重新核对基线摘要。[现场预检](../evidence/workspace-desktop-close-cancellation-field-preflight.json)

> 现场切换工具在私有 profile 演练了备份、冻结替换和诊断恢复。写安装收据失败时，原包、锁文件、pnpm 工作区元数据和配置均回到原摘要。正常安装后，恢复操作保留新包和新锁，逐字节还原原配置，并拒绝覆盖诊断期间的配置编辑。[切换演练](../evidence/workspace-desktop-close-cancellation-cutover-rehearsal-verified.json)

> 真机验收工具把原生聊天准备、标准 Web 打开和 DevFlow 直达绑定到同一份封存候选与 Host 采集启动收据。`prepare` 只准备会话，须在桌面确认限时授权后执行 `open`。`devflow` 要求同次标准 Web 打开和返回均已确认。打开失败后仍保存时间窗及可归属的脱敏日志，诊断不可用或进程更换分别记录。离线预检通过 13 项，包含拒绝错包、旧采集及不确定返回。[采集工具预检](../evidence/workspace-phone-close-cancellation-capture-preflight-verified.json)

> 真机整轮采集依次记录原生准备、首次打开并关闭标准 Web、停止连接并重连、重新授权后重开，以及 DevFlow 直达。重连须看到手机控制和数据通道新升级、手机加密认证与同一桌面诊断进程的新握手，还须在用户重新授权前看到手机明确拒绝工作区。之后由用户在桌面确认限时授权，再执行重开。脚本按摘要关联前序记录，拒绝跨进程、跳步和换握手。后续步骤依据同一桌面握手记录确认连接连续，手机旧握手日志可以从缓冲区滚出。35 项离线检查使用合成界面和已封存脱敏日志，本轮未访问真机或日常桌面。[整轮采集预检](../evidence/workspace-phone-close-cancellation-lifecycle-preflight-20261107.json)

> 同一关闭取消候选与 rc2.53 原生核心通过 API 26 独立模拟器的九项检查。原生新建选择 `minimal`、`worker-model` 与 `high`，只创建一个会话，四条固定回放均使用所选模型和思考强度。标准 Web 显示同一会话，按 `dsh-devflow` 直达多模型工具箱，两次返回原生均恢复原草稿。模拟器端用 TLS 1.3 回环 WSS，Host 端用进程内中继，真实模型调用为零。原验收包已恢复，转发和测试证书私钥已清理。[模拟器复验](../evidence/workspace-native-wss-close-cancellation-creation-validation.json)

> 同一封存桌面包与 API 26 模拟器再经独立封存中继完成九项检查。桌面和原生 NetworkKit 的控制、数据通道共四条 TLS 1.3 回环连接。原生新建选模、标准 Web 显示同一会话、DevFlow 直达和两次草稿恢复均通过。首轮中断于 HDC 布局文件传输，复跑改用设备 shell 读取布局。四条固定回放，真实模型调用为零。原验收包已恢复，临时转发和测试证书私钥已清理。公网中继和真机仍待复验。[原生与独立中继验收](../evidence/workspace-native-wss-close-cancellation-standalone-validation.json)

> 同一封存桌面包与独立中继完成 12 项原生复验。标准 Web 关闭后，模拟器从原生设备页停止连接并在同一进程重新完成加密认证。隔离桌面撤销旧授权，新连接首次打开工作区被明确拒绝。重新授权后，标准 Web 重开同一会话，按包名直达 DevFlow，返回后恢复原草稿。两轮连接共八条 TLS 1.3 回环连接，仅消耗四条固定回放。原验收包已恢复，临时转发和测试证书私钥已清理。[重连与重新授权验收](../evidence/workspace-native-wss-close-cancellation-standalone-regrant-final-validation.json)

> 隔离桌面在鸿蒙 ArkWeb 的 DevFlow 面板仍打开时撤销授权。保存和重新读取均转为禁用，桌面读回的配置及版本一致。手机返回同一原生会话后仍能读到回复和草稿，重开工作区明确提示需要授权。桌面重新授权后，原进程与原加密连接直达 DevFlow 并读到配置。14 项原生检查通过，仅一次设备认证、四条 TLS 1.3 回环连接及四条固定回放，真实模型调用为零。另一路加密回环绕过界面发送标准 DevFlow 读写请求，Host 均以 `workspace-closed` 拒绝，授权恢复后读回原设置。前两轮分别等待已禁用的保存按钮和屏外的重新读取按钮，最终按控件分别定位。[初轮界面对照](../evidence/workspace-native-desktop-revoked-first-ui-20261107.json) · [屏外控件对照](../evidence/workspace-native-desktop-revoked-clipped-controls-20261107.json) · [原生整轮](../evidence/workspace-native-wss-close-cancellation-standalone-workspace-revoked-regrant-validation.json) · [加密请求对照](../evidence/workspace-access-devflow-1794007739387.json)

> 同一组合复验 13 项，新增验证从原生入口输入不存在的包名。ArkWeb 显示标准插件列表，关闭后返回同一会话并恢复原草稿，随后按有效包名直达 DevFlow。两次握手共八条 TLS 1.3 回环连接，四条固定回放，真实模型调用为零。原验收包和先前的夹具指针已恢复，临时转发和测试证书私钥已清理。停用和卸载操作未纳入本轮。[缺失包复验](../evidence/workspace-native-wss-close-cancellation-standalone-regrant-missing-panel-validation.json)

> 同一候选在独立模拟器补验官方翻译与 Rich 15 项、DevFlow 七项。三个官方原包 33 个文件前后逐字节一致，语言保存、重开读回与原文／译文切换通过。Rich 动作回执、未决状态查询、草稿恢复、来宾隔离和前后台往返通过。DevFlow 保存并读回模型档案，以 `worker/high` 完成只读委派。首轮驱动读取过早，后续界面快照已显示目标文本。改为等待文本可见后，完整复跑通过。两轮均用 TLS 1.3 回环 WSS、Host 端进程内中继及各四条固定回放，真实模型调用为零。原验收包已恢复，转发和测试证书私钥已清理。[首轮记录](../evidence/workspace-installed-native-cipher-official-1793982436514-probe-8SeRYz.json) · [两轮复验](../evidence/workspace-native-wss-close-cancellation-plugins-validation.json)

> 同一封存桌面包、独立封存中继与 API 26 模拟器完成 DevFlow 七项、官方翻译与 Rich 15 项。DevFlow 关闭重开后读回配置，持久化请求确认父任务使用 `main`，只读子任务使用 `worker/high`。官方三个原包的 33 个文件逐字节一致，语言保存、重开读回和原文／译文切换通过。Rich 动作回执、未决状态、草稿恢复、来宾隔离和前后台重开通过。两轮各四条 TLS 1.3 回环连接和四条固定回放，真实模型调用为零。原验收包已恢复，转发和测试证书私钥已清理。[独立中继插件复验](../evidence/workspace-native-wss-close-cancellation-standalone-plugins-validation.json)

> 独立中继首轮继承短测试的 8 帧控制上限，前台重开时中继记录 `control-frame-limit`，97 毫秒后手机数据套接字关闭。夹具改用仓库配置示例的 64 帧。另一轮插件目录已在 DOM 渲染，UITest 到时仍只返回空的 Web 控件节点。驱动在重开前改为确认旧 Web 容器移除，整轮复跑通过。两项对照均来自回环模拟器，真机历史断线的原因仍待同期日志核对。[控制帧记录](../evidence/workspace-native-wss-standalone-plugins-control-cap.json) · [控件树记录](../evidence/workspace-native-wss-standalone-plugins-accessibility.json)

> 交付预检逐项核对桌面候选和旧包安装收据、rc2.53 签名前后载荷、三轮独立中继的测试 HAP 及工作区核心编译摘要。检查同时绑定离线换包计划、回退演练和真机采集脚本。四项反例被拒绝，包括桌面包或中继摘要不符、缺少重新授权后的重开、混用日常 profile。现场基线和公网行为须在获准后重新核对。[交付预检](../evidence/workspace-close-cancellation-readiness-20261106T184730040656Z.json)

> 源码复核比对桌面归档的 309 个文件、10 个运行入口和 86 项独立源码输入。手机侧比对 rc2.53 官方编译记录的 84 项输入，以及三个生成包沿用的 159 项源码输入。过期源码摘要、错误归档清单和错误手机编译摘要均被拒绝。[源码复核记录](../evidence/workspace-close-cancellation-current-sources-20261107.json)

> 封存桌面候选和独立中继验证标准插件路由权限。两个合成接口对隔离桌面的 owner 均返回 200，经加密工作区的设备 Peer 分别收到 404／`unregistered` 和 403／`owner-only`，错误体与响应头完整。设备请求未进入两个处理器，同一连接随后完成标准 DevFlow RPC 和重开读回。使用 Node 合成对端、四条 TLS 1.3 回环连接和四条固定回放，真实模型调用为零。[加密路由对照](../evidence/workspace-installed-workspace-trace-1793991172381-probe-b4VKer.json)

> 隔离 Host 在标准会话改名路径上额外登记一个桌面 WebServer 处理器。浏览器入口命中该处理器。设备载体即使附带同一隔离 Host 签发的 owner Cookie，仍按设备 Peer 走 Gateway，只修改获准会话，另一会话的事件记录保持一致。旧 WebServer 前缀和 owner 专用 Fetch 路由继续返回 404 和 403，两个处理器均未收到设备请求。随后在 Chromium 通过官方翻译原包设置检查，模型调用为零。[同路径权限对照](../evidence/workspace-prototype-1794146000358.json)

> Chromium 用工作区文档脚本请求两个合成路由。桌面前缀路由和 owner 专用 Fetch 对照均返回 200，设备分别收到结构化 404 和 403，两个受限处理器均未执行。文档事件带路径与拒绝原因，查询参数未进入事件。随后可在同一页面保存原包翻译设置。原包字节一致，真实模型调用为零。[Chromium 路由权限对照](../evidence/workspace-prototype-1794086330988.json)

> 安装版副本用封存 DevFlow 验证项目与会话设置。测试策略先允许全局操作及 A 的会话，设备目标列表仅显示 A。B 的两次读取、两次保存均被拒，桌面读回确认 B 未变化。加入 B 后可读写其项目和会话设置，保存 B 不改变已保存的 A 设置或全局设置。此轮为 Gateway 权限对照，未使用加密传输，模型调用为零。[A/B 权限对照](../evidence/workspace-installed-composition-1793993315370-probe-AX9P1t.json)

> 同一 DevFlow 包接入封存桌面候选和独立中继后，现有工作区授权可访问后来新增的可见项目。新项目的配置保存并在工作区重开后读回，全局设置版本保持不变。实际回放产生的子代理会话未列入设备目录或 DevFlow 目标，两种设置范围的读取和保存均被拒。首轮因测试夹具误用解析结果而退出，修正后完整通过。四条 TLS 1.3 回环连接、四条固定回放，真实模型调用为零。[夹具失败](../evidence/workspace-installed-workspace-trace-1793993343799-probe-XeCjDm.json) · [加密授权复验](../evidence/workspace-installed-workspace-trace-1793993484595-probe-NeoOrK.json)

> 同一加密复验新增 DevFlow 双端设置冲突。设备读到项目设置后，桌面 owner 先保存。设备用旧版本保存收到 `DEVFLOW_SETTINGS_CONFLICT`，桌面读回确认值和版本均保留。设备重新读取后保存成功，关闭重开后读回该值。此轮使用 Node 合成设备、独立封存中继、四条 TLS 1.3 回环连接和四条固定回放，真实模型调用为零。[双端保存冲突](../evidence/workspace-installed-workspace-trace-1793997167242-probe-Y5Iego.json)

> API 26 模拟器用相同封存包触发 DevFlow 全局设置冲突。首轮显示了带错误码的完整提示，驱动只匹配正文，未进入重新读取。修正后确认冲突与重新读取均保留模型档案草稿，重存和只读委派通过。隔离中继在控制通道升级约 300 秒后关闭房间，最后一次重开未通过。延长本地测试房间期限后，重开时可见三个表单控件，磁盘记录为第 3 版，配置档案使用 `worker/high`。该轮驱动仍等待屏外标题，未执行重开后的档案字段核对。[提示对照](../evidence/workspace-devflow-conflict-arkweb-first-20261107.json) · [关闭记录](../evidence/workspace-devflow-conflict-arkweb-room-timeout-20261107.json) · [重开控件](../evidence/workspace-devflow-conflict-arkweb-reopen-control-20261107.json)

> API 26 模拟器整轮 14 项通过。桌面先保存第 1 版，手机显示冲突且保留档案草稿，重新读取后重存，桌面确认最后保存的是第 3 版。工作区关闭重开后，驱动以可见设置控件确认面板，展开高级配置读回原档案。`worker/high` 只读委派使用四条固定回放，真实模型调用为零。独立回环中继使用 TLS 1.3，测试应用已恢复，临时转发及证书私钥已清理。[ArkWeb 冲突恢复整轮](../evidence/workspace-native-wss-close-cancellation-standalone-devflow-conflict-reopened-validation.json)

> 独立发布的 `dsh-theme-brick` 0.2.1 使用同一份 npm 原包通过桌面 Chromium 和鸿蒙 API 26 ArkWeb 验收。两端通用设置的开关均将浅色背景从 `#FAF8F3` 切换至 `#FFF`。桌面刷新和 ArkWeb 关闭重开均保留关闭状态，重新开启恢复原色。ArkWeb 最后清除测试创建的本地设置，恢复模拟器原应用，清理转发和临时证书私钥。模拟器通过七项检查，经四条 TLS 1.3 回环连接使用一条固定回放，桌面无需回放，两端真实模型调用为零。早期驱动的取色位置和被裁剪的开关触点已校正。[桌面验收](../evidence/workspace-standard-profile-1794001658573.json) · [ArkWeb 验收](../evidence/workspace-native-wss-close-cancellation-standalone-brick-touch-validation.json) · [触点对照](../evidence/workspace-brick-arkweb-clipped-switch-20261107.json)

> Brick 的启停验收使用同一份原包和标准插件管理器。桌面确认模块图移除并恢复插件，Chromium 和 ArkWeb 都在原文档看到设置项消失并恢复。本轮 ArkWeb 通过九项检查，原模拟器应用已恢复，回环转发和临时证书私钥已清理。首轮 ArkWeb 将主题清理作为同一断言，因停用后背景未恢复而失败。桌面也复现残留，后续验收分别记录设置项同步与主题清理。两端真实模型调用为零。[首轮失败](../evidence/workspace-installed-native-cipher-devflow-1794003882021-probe-1OddfH.json) · [桌面对照](../evidence/workspace-standard-profile-1794004063547.json) · [ArkWeb 整轮](../evidence/workspace-native-wss-close-cancellation-standalone-brick-graph-compare-validation.json) · [清理原因](workspace-review.md#标准-cli-安装与第三方发布物)

> 用加密回环和合成会话对照官方 `workspace/archiveSession`、`workspace/unarchiveSession`。原 Host 允许操作可见会话并拒绝直接操作隐藏子会话，但两种成功响应都会带出已归档隐藏会话的 ID。隔离候选复用工作区订阅的会话可见性判断，设备响应只含可见 ID，桌面 owner 仍收到完整归档集合。5 项集成、36 项 Host 单测和两份严格类型检查通过，原 DevFlow 包在两个版本均可直达。候选留在隔离环境。Archive Manager 发布包、永久删除及真机界面仍待验收。[对照记录](../evidence/workspace-archive-scope-filter-validation-20261107.json) · [源码补丁](../evidence/workspace-archive-scope-filter-20261107.patch)

> 安装版桌面副本用两个独立 profile 复验归档权限。候选只替换工作区包的 `lib/index.js`，其余 20 个文件逐字节相同。旧版两种成功响应均返回隐藏子会话 ID，候选的两种响应均过滤该 ID。双端对照都通过可见会话归档与恢复、隐藏会话写入拒绝、桌面 owner 读回完整集合，以及 DevFlow `worker/high` 委派和关闭重开。每组消耗四条固定回放，实际模型调用为零。设备端使用 Node 加密测试载体。[安装版对照](../evidence/workspace-installed-archive-scope-validation-20261107.json)

> 从日常桌面只读复制 Archive Manager 1.1.7 的 30 个包文件，以本地归档经标准 CLI 安装到隔离 profile，安装后逐字节一致。Host 插件启动并进入客户端模块图。旧 Harmony 授权通过该包自有元数据接口返回隐藏子会话 ID，也接受批量永久删除请求。批量探针只指定不存在的合成 ID，删除 0 项。封存 Harmony 候选将该包旧版 `workspaceRegistry` 接口留给桌面 owner。回环实测设备元数据、单条与批量删除、旧恢复接口均拒绝，桌面 owner 元数据仍可读，更新路由在设备上返回 404。官方归档与恢复使用独立的工作区 Host 修复，DevFlow 的四条固定回放和标准 Web 重开通过。原包界面和真机仍待验收，双端修复尚未部署。[原包权限对照](../evidence/workspace-archive-manager-installed-boundary-validation-20261107.json)

> 标准 CLI 在隔离 profile 一次安装 Harmony 和官方工作区两个修复包。官方工作区包作为普通依赖安装，沿用原有 Host 加载项。以各自的锁文件离线回滚和恢复均成功，逐字节核对五个包、合成配对、合成会话和配置补丁。恢复后的 Host 确认加载了与加密回环相同的两个入口，归档和恢复响应按设备可见性过滤，桌面 owner 仍收到完整集合。真实模型调用为零，日常 profile 和真机尚未应用这组修复。[组合安装、回滚与 Host 验收](../evidence/workspace-archive-boundary-delivery-validation-20261107.json)

> 加密回环 Chromium 测试复用标准 CLI 安装的 Archive Manager 1.1.7，30 个文件逐字节一致。按包名打开标准插件详情，从全局设置进入原包的归档页。旧版元数据请求被拒绝，原包在页内显示收藏接口的权限错误。归档行标题在 390 CSS px 下实测宽度为 0，同一文档扩大到 900 CSS px 后为 74.23 px，可选中合成会话并经标准 `workspace/unarchiveSession` 恢复，Host 和页面均确认。5 项集成通过。本轮未覆盖 ArkWeb 和真机。[宽窄对照与恢复记录](../evidence/workspace-access-archive-manager-1794025388731.json)

> 公共设置页的隔离候选在窄屏将导航移到内容上方。按官方客户端构建预设生成候选，Host 入口保留原字节。以同一 Archive Manager 原包复跑，390 与 900 CSS px 下归档行标题均为 74.23 px，390 CSS px 下用原包界面选中并恢复合成会话，Host 确认。旧版接口仍按原权限规则拒绝，标准 Web 重开与 DevFlow 直达继续通过。5 项集成通过。首轮候选因隔离依赖解析失败而未打开页面。[源码补丁](../evidence/workspace-settings-compact-20261107.patch) · [隔离启动失败](../evidence/workspace-access-archive-manager-1794025704994.json) · [候选复验](../evidence/workspace-access-archive-manager-1794025826471.json)

> API 26 模拟器用原生 ArkWeb、TLS 1.3 回环和封存 Harmony 权限候选运行 Archive Manager 1.1.7，原包 30 个文件与 Chromium 验收一致。392 CSS px 下归档行标题约 39 px，页面无横向溢出。UITest 观察到旧版收藏接口的拒绝提示，经标准界面选中并恢复一条合成会话，Host 确认归档列表清空。七项检查通过，使用一条固定回放，真实模型调用为零。三次未通过分别停在系统启动拒绝、横向手势未命中和权限提示超出可视区。每次均恢复原测试应用并清空转发表。最终已清理临时测试私钥，真机和日常桌面仍待验证。[模拟器验收与失败记录](../evidence/workspace-native-archive-manager-compact-validation-20261107.json)

> 三份归档修复候选已共同封存。标准 `dsh plugin add` 在隔离 `web` profile 完成安装、按锁离线回滚与恢复。恢复后的 Host 加载与 ArkWeb 验收一致的三个入口，归档响应按设备可见性过滤，桌面 owner 保留完整集合。以同三份归档在隔离 `desktop` profile 用 pnpm 12.6.0 复验安装、离线回滚与恢复，逐项核对六个包、配置、合成配对和会话。离线对照使用预热的隔离存储，真实模型调用为零。日常桌面依赖存储和修复后的真机仍待验。[三包与两种安装证据](../evidence/workspace-desktop-archive-compact-release-20261107/release.json)

> 桌面更新预检从隔离 `desktop` 基线和三份封存归档离线生成候选锁，生成阶段没有创建依赖目录。锁只修改三个直接依赖，间接新增为已验证的 `dsh-deque` 和 `dsh-native-command`。校验拒绝五种偏差，覆盖锁设置、无关直接依赖、解析来源、归档摘要和候选依赖图。候选在已有依赖的隔离 profile 上按锁安装，六个包共 872 个文件校验通过。注入公共设置入口摘要不符后，校验拒绝并按原锁离线回退，原四包的 842 个文件、清单、锁、配置、合成配对和会话均与更新前一致。实际日常 profile 仍需按自身版本、配置、锁和依赖存储生成并核对候选锁。[预检、反例和回滚收据](../evidence/workspace-desktop-lock-preflight-1794035386534.json)

> 三包切换与收据写入已在隔离 profile 联动演练。候选按锁离线安装并核对 872 个包文件、合成本地插件及临时诊断配置后，才发布演练收据。设置入口摘要不符和收据路径已占用两种故障均恢复了原四包、三个 pnpm 布局文件、清单、锁、配置、本地插件和合成数据，既有收据内容保持原字节。使用实际隔离安装核对了最终三包入口，现场采集器拒绝演练收据。日常安装须以获准后的实际 profile 和收据为准。[三包切换预演](../evidence/workspace-desktop-lock-preflight-1794038319289.json)

> 同一组封存的 Harmony、官方工作区与公共设置包通过三轮 API 26 ArkWeb 补验，共 31 项。原生选择 `minimal` 任务类型、`worker-model` 主模型和 `high` 思考强度后创建会话，四条固定回放均使用所选模型与强度。DevFlow 保存 `worker/high` 并完成只读委派，关闭重开后读回同一设置。Rich 验证动作回执、状态查询不重放、草稿恢复和前后台切换。官方翻译的 33 个文件保持原字节，设置、会话译文切换和重开通过。三轮均用 rc2.53 产品工作区核心、TLS 1.3 回环与固定回放，真实模型调用为零。原模拟器测试包已恢复，转发和临时测试私钥已清理。三包尚待日常桌面安装和真机复验。[三轮收据](../evidence/workspace-native-release-compatibility-validation-20261107.json)

> 原生新建回执丢失后，旧页面会隐藏桌面目录中已出现的空白会话。rc2.54 在当前页面生命周期内保留提交前的目录记录，允许重连后刷新并查看目标项目中新出现的空白会话。旧空白会话及其他项目的空白会话仍按原规则显示。37 项页面与布局检查、两项隔离 Host 创建检查及官方 API 26 编译通过。与 rc2.53 的 84 项原生编译输入相比，仅版本、原生页面和界面文案变化。[回归与未签名构建](../evidence/workspace-creation-recovery-rc254-validation.json)

> rc2.54 原生恢复在 API 26 模拟器通过六项检查。隔离 Host 用最终三包持久化唯一的空白会话及所选模型，再在成功回执发出前关闭连接。手机在同一进程第二次完成加密握手，刷新并打开与 Host 记录相同的会话。Host 只收到一次创建请求，真实模型调用与固定回放均为零。首个测试包因旧夹具缺少重连入口而编译失败，复验使用此前通过重连验收的夹具。原模拟器测试包已恢复，转发和临时测试私钥已清理。rc2.54 产品候选尚待真机签装与复验。[模拟器收据](../evidence/workspace-creation-recovery-rc254-emulator-validation.json)

> rc2.54 原生页面与最终三包通过 13 项 API 26 模拟器检查。`minimal` 新建只产生一个会话，四条固定回放均使用所选的 `worker-model/high`，桌面默认模型保持原值。标准 Web 打开同一会话，关闭后保留原生草稿。原进程加密重连后拒绝旧授权，重新授权后重开同一会话并按包名直达 DevFlow。真实模型调用为零。原测试包已恢复，转发和测试私钥已清理，日常桌面和真机复验待授权。[正常链路复验](../evidence/workspace-rc254-release-regrant-emulator-validation.json)

> 最终桌面三包与 rc2.54 工作区核心通过 12 项 API 26 模拟器慢链路检查。隔离 Host 加载 313 个磁盘合成会话，独立 WSS 的数据通道两个方向各注入 680 毫秒延迟，测试中继租约为 540 秒。一次完整复跑从原生打开到报告就绪为 71.3 秒。Rich 回执、未知结果查询、草稿恢复、标准 Web 关闭重开和切回前台均通过，四条固定回放，真实模型调用为零。首轮因执行环境中断止于 Rich 检查。原测试包已恢复，转发和临时私钥已清理。[慢链路复验](../evidence/workspace-rc254-release-slow-link-emulator-validation.json)

> rc2.54 的签名前预检核对产品包名、版本和封存摘要，拒绝 rc2.53 产品包、模拟器包、改动过的产品包及被修改的候选证明。假设备只接受已配对 rc2.53 的原位升级，覆盖 20 项安装前拒绝和三项安装后元数据拒绝。六项载荷对照包含实际未签名包的 25 个文件及合成签后载荷。合成配对、会话和身份标记保持原字节，rc2.52 和 rc2.53 的安装保护回归通过。真实签名材料、签装和现场数据保留须在获准后验证。[离线签装预检](../evidence/workspace-field-rc254-install-preflight.json)

> 现场采集器可按封存三包和 rc2.54 核对本轮验收。采集要求三个已装入口与封存包一致，并将标准 Web 打开、重连、重开、DevFlow 直达与 Rich 只读观察绑定到同一份桌面启动和手机签装收据。Rich 阶段用已打开的原生来宾页和约定标记核对展示，自动化输入为零，收据只记录匹配结果。以隔离安装入口、合成现场收据和实际模拟器 Rich 来宾布局完成 50 项离线检查。日常桌面和真机尚未运行这条采集路径，Rich 动作提交与回执仍以隔离回放为证据。[采集预检](../evidence/workspace-phone-rc254-release-capture-preflight-20261107T081632775869Z.json)

> 最终三包的诊断配置恢复通过 11 项离线检查。使用隔离安装的三包入口、实际备份配置与合成现场收据，验证恢复原字节、重复执行、CRLF 保留，以及拒绝包入口或配置漂移。以退出检查替身模拟 DSH 运行或在暂存期间重启。日常桌面的正常退出、授权关闭与配置恢复留待现场验收。[收尾预检](../evidence/workspace-release-trace-restore-preflight-20261107T084443679392Z.json)

> 封存三包的锁计划可从脱离 profile 的清单和锁快照生成。同盘输出与 pnpm 演练的清单和锁内容一致，冻结离线安装后核对 872 个包文件。合成跨盘快照保留额外插件和传递依赖，沿用目标锁中的 Rich 归档路径，并核对候选依赖可达的 71 条锁记录。八类偏差均被拒绝，含 Rich 指向不同归档、依赖摘要变化和旧 Harmony 仍被其他包引用。跨盘日常安装待现场验证。[锁计划验证](../evidence/workspace-desktop-release-plan-1794041659057.json)

> 最终三包安装收据要求当前清单、锁和六个插件的 872 个文件与计划及封存清单一致。实际隔离 pnpm 目录及其副本通过 10 项收据检查，包含 Windows 长路径、非入口文件差异、缺失或额外文件、跨 profile 计划及收据冲突。桌面退出检查使用替身。更新后的手机采集 50 项和诊断恢复 11 项预检也通过，日常桌面和真机待现场验收。[收据预检](../evidence/workspace-desktop-release-receipt-preflight-20261107T090325531954Z.json) · [采集复验](../evidence/workspace-phone-rc254-release-capture-preflight-20261107T090254380946Z.json) · [诊断恢复复验](../evidence/workspace-release-trace-restore-preflight-20261107T090256419746Z.json)

> 归档可见性和窄屏设置源码已在隔离 checkout 应用，相关运行源码与封存包的构建输入一致。三组双语配对与升级指南检查通过，整合补丁包含 13 个文件，已通过当前 `lumina` 的应用预检。[源码集成核对](../evidence/workspace-core-lumina-integration-20261107.json)

> 恢复隔离 checkout 的包级依赖链接后，工作区控制器和通用设置的 12 个测试文件均取得通过结果，两轮按文件合计 159 项。最后重跑的两个 Client 组装文件通过 19 项，覆盖设置注册、连接恢复和卸载清理。合入补丁摘要与集成预检一致，设置布局仍以封存包的 390 CSS 像素和 ArkWeb 验收为证据。[两包回归](../evidence/workspace-core-lumina-package-tests-20261107.json)

> 隔离 checkout 的工作区控制器和通用设置通过 Host 与 Client 类型编译，并用仓库的 tsdown 配置生成两个包的 Host 和浏览器入口。Typert 完成 31 个包的声明生成。产物检查核对两份浏览器加载描述符、归档范围过滤和窄屏 CSS。重建入口摘要与现场封存归档不同，真机候选继续使用已完成 ArkWeb 验收的封存版本。[两包构建](../evidence/workspace-core-lumina-build-20261107.json)

> 标准格式的合成插件在客户端激活时抛错，API 26 ArkWeb 的冷启动失败。原生页面显示失败提示，返回同一会话后原生回复和未发送草稿均保留。隔离桌面通过标准插件管理器停用该包并确认模块图更新，手机随后重开同一会话的标准 Web，按包名直达 DevFlow，返回时再次读到原草稿。最终 12 项检查通过，两端均正常退出，原模拟器应用已恢复，回环转发和临时证书私钥已清理。四条固定回放都使用所选主模型和思考强度，真实模型调用为零。首轮的桌面校验缺少合成包文件清单，第二轮的测试驱动在桌面完成停用前结束，均单独记录。[首轮文件校验失败](../evidence/workspace-native-plugin-boot-fault-inventory-failure-20261107.json) · [第二轮确认时序](../evidence/workspace-native-plugin-boot-fault-acknowledgement-20261107.json) · [整轮复验](../evidence/workspace-native-wss-close-cancellation-standalone-plugin-boot-fault-recovery-validation.json)

> `node scripts/check-workspace.mjs --access-devflow` 在同一隔离用例中验证工作区关闭、数据通道中断、新 P-256 握手、旧句柄拒绝和重新授权。新连接授权前可读原生元数据，工作区返回 `workspace-grant-required`。授权后，Chromium 通过回环加密通道打开标准 Web，关闭后按包名直达 DevFlow，读取实际设置。DevFlow 原包 326 个文件已核对，文档启动脚本与 rc2.53 产品包一致。此轮使用 Chromium 和合成设备身份。[组合验证](../evidence/workspace-access-devflow-1793942651360.json)

> Rich 回归在实际回环 WebSocket 上断开数据通道，再用同一合成配对重新握手。新连接在授权前拒绝读取旧动作；授权后重新挂载原表单，读回同一草稿、动作状态和账本序号。查询不重发，显式重试同一动作 ID 返回原接收回执。会话仅记录一次该动作，四条固定回放全部消耗，真实模型调用为零。此轮调用标准 Rich API，经 Node 加密设备载体执行。[断线恢复回归](../evidence/workspace-access-1794009624957.json)

> 真机 rc2.48 已通过原配对重连、原生历史、新建页选模，以及授权后的标准 Web 和现有 Rich 内容展示。返回时工作区关闭请求报加密失败。手机恢复连接并重新获准后，DevFlow 直达仍未挂载页面。手机已归还，桌面显示授权已关闭。[现场结果](../evidence/workspace-phone-rc248-granted-closeout.json)

> rc2.51 修复了 Host 关闭失败后换连接仍无法重开的问题。28 项源码测试通过，API 26 独立模拟器用合成连接验证按包名重开一个 ArkWeb 并保留原生草稿，原模拟器包已恢复。产品候选未签装，现场重开和 DevFlow 仍待复测。[rc2.51 验证](../evidence/workspace-close-recovery-rc251-validation.json)

> rc2.52 修复原生消息端口关闭失败后仍能重开的缺口。SDK 替身复现了 Host 确认关闭和旧连接已替换两种情况，修复后 68 项源码测试通过。API 26 模拟器用实际 ArkWeb 复测本地清理成功、旧 Host 关闭失败后的合成重连，按包名重开和草稿恢复通过，原测试包已恢复。产品包已编译，真机签装和生产中继复验待安排。[rc2.52 回归证据](../evidence/workspace-rc252-native-port-close-validation.json)

> rc2.52 产品 HAP 的离线签名前检查通过，拒绝旧产品包和独立模拟器包。假设备预演 rc2.48 原位升级，覆盖 19 项安装前拒绝和五项载荷检查。产品包仍为未签名候选。[签装预检](../evidence/workspace-field-rc252-install-validation.json)

> rc2.52 工作区核心与修复撤销时序的桌面归档通过九项 API 26 原生模拟器检查。选定任务类型、主模型和思考强度后创建一个会话，四条固定回放均使用所选配置。标准 Web 显示同一会话，原生入口直达 DevFlow，两次返回都保留原生草稿。使用回环 TLS 1.3，真实模型调用为零。原测试包已恢复，测试私钥、转发和监听端口已清理。[rc2.52 配套验收](../evidence/workspace-native-wss-rc252-revocation-creation-validation.json)

> 同一双端候选补齐 DevFlow 的七项检查。自动编排和模型档案保存后可重开恢复，父任务仍用 `main`，持久化的只读子请求使用 `worker/high`。[rc2.52 DevFlow 整轮](../evidence/workspace-native-wss-rc252-revocation-devflow-validation.json)

> 同一双端候选补齐 Rich 和官方翻译的十五项检查。Rich 的接受与完成回执、未决动作查询、草稿恢复及来宾隔离通过。三个官方包的 33 个文件与原包一致，日语设置、原文与译文切换和重开恢复通过。两轮各用四条固定回放，真实模型调用为零，原测试包已恢复，临时私钥、转发和监听端口已清理。[rc2.52 Rich 与官方原包](../evidence/workspace-native-wss-rc252-revocation-rich-validation.json)

> 加密回环对照在 Host 处理关闭后暂扣回执并断开数据套接字。旧绑定与凭证失效，测试释放旧 RPC 时，待确认关闭以 `closed` 拒绝。沿用配对建立新绑定后，原生查询可用，工作区需重新授权。获准后标准接口恢复，旧资源句柄仍被拒绝。四项授权集成测试通过。该故障由测试注入，真机首次加密关闭失败的触发条件仍待确认。[关闭回执丢失对照](../evidence/workspace-access-1793895515932.json)

> 回环对照还覆盖手机加密关闭请求期间断线。旧绑定退出后，仍在等待的加密返回 `E2EError('closed')`，记录为 `encrypted-failure`，套接字没有发出关闭帧。rc2.48 与 rc2.52 的加密发送源码相同，均使用这一诊断映射。真机收据只有类别，缺少同期套接字与加密事件，触发原因仍待确认。[发送阶段对照](../evidence/workspace-close-encryption-diagnostic-validation.json)

> rc2.51 工作区核心与现场同一份桌面 Harmony 归档的配套验收通过。API 26 模拟器通过原生回环 WSS 进入标准 DevFlow 面板，保存后重开并恢复配置。四条固定回放完成只读委派，持久化子请求使用 `worker/high`，真实模型调用为零。独立模拟器原包和转发状态已恢复。[rc2.51 配套验收](../evidence/workspace-native-wss-rc251-field-desktop-validation.json)

> 现场采集器按同一进程记录工作区 RPC、套接字和加密阶段。旧真机日志、模拟器日志和 12 条伪造或无关记录验证通过，采集期间进程变化会拒绝写入，HDC 失败与超时均省略原始输出。首次关闭失败的具体原因仍待现场复测。[现场诊断预检](../evidence/workspace-field-diagnostics-validation.json)

> 桌面授权撤销回归在路由复核期间暂停已准备好的资源响应。旧源码在撤销后仍发送资源块，修复后返回结果未确认，同一连接的原生查询继续可用。四项回环加密测试、十项传输测试和九个桌面入口构建通过。标准安装包基于 rc2.49 配套归档封存，309 个文件中八个变化。[桌面候选](../evidence/workspace-desktop-revocation-candidate.json)

> 封存桌面入口的回环对照复现了同一时序。两份归档的实际 `lib/device.js` 都经过摘要核对，测试只额外导出两个所有者。旧包在撤销后返回暂扣的资源块，新包通过全部四项检查，包括拒绝旧响应、原生查询可用及重连后重新授权。[归档撤销对照](../evidence/workspace-desktop-revocation-archive-validation.json)

> 新桌面包在独立 profile 完成离线升级、回退和重新安装。三份插件的 812 个文件逐一校验通过，回退恢复原锁文件，合成配对、会话和配置保留。[桌面切换预演](../evidence/workspace-plugin-install-1793884857867.json)

> 桌面切换预检按旧归档路径、版本及摘要核对清单和锁文件，仅更新 Harmony 引用。生成的升级与回退锁文件均与 pnpm 12.6.0 在独立 profile 生成的字节一致，六种输入漂移被拒。两份锁文件分别通过离线冻结安装和三包 812 个文件核对。跨盘绝对路径另做了合成往返检查，实际日常 profile 仍须在获准后复核。[冻结锁预检](../evidence/workspace-desktop-revocation-frozen-preflight.json)

> 修复授权撤销的新桌面包与 rc2.51 工作区核心通过七项原生模拟器组合检查。独立运行时用回环 TLS 1.3 完成签名握手和标准工作区往返。原包 DevFlow 保存设置、重开后恢复，四条固定回放的持久化子请求为 `worker/high`。真实模型调用为零，测试包、证书和转发状态已恢复。此轮验证正常路径，撤销时序由回环集成测试覆盖，真机仍待复测。[新桌面包与 rc2.51 配套验收](../evidence/workspace-native-wss-rc251-revocation-validation.json)

> 同一新桌面包与 rc2.51 工作区核心通过 Rich 和官方翻译的十五项原生模拟器检查。三个官方包共 33 个文件与原包对照一致，日语设置保存、原文与译文切换及重开恢复通过。Rich 动作接受与完成分开记录，查询未确认动作没有重发，草稿重开恢复，前后台切换清理 Web。来宾访问工作区、父页存储和测试网络被拒。使用回环 TLS 1.3、一次固定翻译和四条固定模型回放，真实模型调用为零。原测试包和证书已恢复，临时转发及私钥已清理。[Rich 与官方原包配套验收](../evidence/workspace-native-wss-rc251-revocation-rich-validation.json)

> 新桌面包与 rc2.51 原生新建页通过九项模拟器检查。在原生页选择 `minimal`、`worker-model` 和 `high` 后只创建一个会话，创建本身不触发模型。Host 核对四条固定回放均使用所选配置，桌面默认模型保持原值。标准 Web 显示同一会话，原生入口可直达标准 DevFlow 面板，两次返回均保留原会话和草稿。回环 WSS 使用 TLS 1.3，真实模型调用为零。原测试包和证书已恢复，转发及临时私钥已清理。[原生新建与插件面板往返](../evidence/workspace-native-wss-rc251-revocation-creation-validation.json)

> rc2.49 隔离验收覆盖无工作区授权与有效授权。无授权时原生提示可见、草稿保留、固定错误码入日志。授权后同一测试 HAP 搭配封存桌面包，可完成标准 Web、DevFlow 和两次原生返回。两轮均无真实模型调用，手机产品包已编译，尚未签装。[双端候选与对照](../evidence/workspace-grant-rc249-validation.json)

> NetworkKit WSS 隔离对照使用回环服务和应用沙箱测试 CA。不受信任时在 TLS 阶段被拒，受信任时控制和数据通道完成 TLS 1.3 及文本和 512 KiB 二进制往返。此轮覆盖合成帧的原生套接字与证书校验。[WSS 原生对照](../evidence/workspace-native-wss-proof/validation.json)

> 原生 WSS 联合验收已通过签名握手、选模、四次固定回放、ArkWeb 标准工作区、DevFlow 面板和草稿恢复。手机走本地 WSS，桌面走同一中继的内存端口。两条 TLS 1.3 连接与两条反向转发均已清理，模拟器原验收包已恢复。[联合验收](../evidence/workspace-native-wss-full-proof/validation.json)

> Rich 原生 WSS 验收通过 12 项检查，覆盖动作回执、未决动作查询、草稿恢复、来宾隔离和 WebView 的前后台切换。使用 API 26 独立模拟器、封存 Rich 包、应用沙箱测试 CA 和合成软件身份。共四条固定回放，真实模型调用为零。原测试包已恢复。[Rich 原生 WSS 验收](../evidence/workspace-native-wss-rich-proof/validation.json)

> 官方翻译插件与 Rich 在同一原生 WSS 模拟器整轮通过 15 项检查。安装版副本的三个官方包共 33 个文件与此前清单一致，运行前后逐字节相同。验收覆盖目标语言保存、会话译文和原文切换、面板重开恢复。翻译使用一次回环回放，模型使用四条固定回放。临时监听和转发已清理，原测试包已恢复。[官方原包验收](../evidence/workspace-native-wss-official-proof/validation.json)

> 官方翻译原包通过 Chromium 工作区图更新回归。桌面关闭插件后工作区移除设置面板，重新启用后恢复面板和已保存的日语设置。另核对同一工作区可以加载 Client Modules 的新版本。测试使用隔离 profile，真实模型调用为零。[插件启停与图更新](../evidence/workspace-graph-1793884061413.json)

> 隔离 Chromium 补验了三次资源换代。停用官方翻译、替换导航包的客户端构建及从临时 profile 移除导航包后，新清单均排除旧资源批次，原生缓存用同一清单淘汰已缓存字节。重新启用翻译可读回日语设置，移除导航包后翻译仍可用。测试走真实插件管理器和工作区通道，使用受控包移除进程及原生缓存 SDK 替身。首轮宿主运行未接管包管理命令，返回失败，修正临时 profile 的命令配置后通过。[失败记录](../evidence/workspace-graph-1793992617317.json) · [资源换代复验](../evidence/workspace-graph-1793992745942.json)

> DevFlow 原生 WSS 整轮通过七项检查。用同一个 `0.3.0-alpha.3` 标准包保存自动编排及模型档案，重开面板读回档案，实际工作流完成只读委派。Host 核对父模型 `main`、子模型和思考强度 `worker/high`，并读回持久化子请求。四条固定回放，真实模型调用为零。原测试包已恢复。[DevFlow 原生 WSS 验收](../evidence/workspace-native-wss-devflow-proof/validation.json)

> 同一独立模拟器的普通 ArkWeb 输入框通过 HDC 点击后，记录到输入法成功绑定和 1060 px 键盘高度。换回封存桌面候选和独立加密中继复跑 DevFlow 时，实际名称字段在 39 次布局采样中完整可见并已聚焦，键盘高度均为 0。整轮停在输入前，尚未验证键盘展开后的编辑、保存与返回。原测试包已恢复，回环转发和临时证书私钥已清理。[输入路径对照](../evidence/workspace-keyboard-input-path-20261107.json) · [DevFlow 键盘复跑](../evidence/workspace-devflow-keyboard-standalone-20261107.json)

> 同进程对照取得了 DevFlow 输入法附着失败及另外两个输入框附着成功的日志。此轮只消耗一条基线回放，设置和选模未变，真实模型调用为零，原测试包已恢复，转发及临时私钥已清理。[对照范围](workspace-review.md#隔离环境结果) · [原始结果](../evidence/workspace-native-wss-close-cancellation-standalone-attach-validation.json)

> API 26 独立模拟器经封存桌面包及独立加密中继通过 DevFlow 键盘整轮，共 10 项。首次名称字段附着返回 `errcode=80`，测试驱动收起并重开标准高级设置，再点同一字段，键盘展开到 1060 px。中文 BMP、退格、Back 保留草稿、聊天输入及发送按钮避让、设置保存和重开读回均通过。只读子任务使用 `worker/high`，父任务仍使用 `main`。四条固定回放，真实模型调用为零。首次附着仍可能失败，重聚焦仅为测试中的界面操作。[DevFlow 键盘整轮](../evidence/workspace-native-wss-close-cancellation-standalone-keyboard-refocus-validation.json)

> rc2.57 在 API 26 隔离模拟器通过 DevFlow 系统表情输入和工作流八项检查。首轮切到原生输入框后，名称字段移出键盘上方的可见区域。复跑在缩小的 Web 区域滚动到该字段并重新聚焦，从小艺键盘点选 🙂，收起键盘后保存，重开读回同一模型档案名称。隔离 Host 的设置文件保存了 `U+1F642`，只读子任务的持久化请求使用 `worker/high`，父任务仍使用 `main`。四条固定回放，真实模型调用为零，原测试包已恢复。[DevFlow 系统表情验收](../evidence/workspace-rc257-devflow-system-ime-arkweb.json)

> 在 API 26 模拟器的无 Host 对照包中，直接点选小艺输入法的 Emoji 键。普通 ArkWeb 输入框读到 `U+1F642`，ArkUI 输入框读到 `U+1F972`，两次键盘高度均为 1060 px。首次尝试在选择前到达验收时限，两轮均恢复原测试包。另一轮在 Chromium 用原 Rich 包和原生端口替身填入带 `U+1F642` 的草稿，关闭后从 Host 逐字读回。三项测试通过，使用四条固定回放，真实模型调用为零。[系统键盘点选](../evidence/workspace-emoji-ime-control-retry-rc249.json) · [Rich 草稿读回](../evidence/workspace-rich-1794087743333.json)

> rc2.57 与当前桌面三包通过 16 项隔离 ArkWeb 检查。在 Rich 原包表单中从小艺输入法点选 `🙂`，关闭并重开后仍读到 `U+1F642`，隔离 Host 的持久草稿也逐字一致。首轮已保存草稿，测试房间约 300 秒到期，界面重开中断。复跑沿用夹具已有的 540 秒房间预算，四条固定回放完成，真实模型调用为零，原模拟器测试包已恢复。[rc2.57 Rich 系统表情验收](../evidence/workspace-rc257-rich-system-ime-arkweb.json)

> 真机离线预检复核了 rc2.48 封存件和 rc2.49 双端候选摘要，确认产品 HAP 与模拟器 HAP 的应用标识不同。旧采集器漏掉 rc2.49 的授权拒绝记录，修正后从实际模拟器日志读到 `prepare / workspace-grant-required`，排除了四条伪造记录。rc2.48 的 12 项安装拒绝与五项载荷检查通过。真机复测仍使用已装 rc2.48。[现场离线预检](../evidence/workspace-field-rc249-preflight.json)

> rc2.49 配套桌面归档在独立 profile 完成切换、回退到 rc2.48 和再切换。两份归档的包版本、清单和文件名一致，pnpm 12.6.0 按各自的 `file:` 路径选择正确内容。每次核对 Harmony、Rich、DevFlow 共 812 个文件，回退恢复原锁文件，配置及合成配对、会话字节一致。三次切换均离线完成。[桌面切换预演](../evidence/workspace-plugin-install-1793878902760.json)

> rc2.49 签名前检查接受封存产品 HAP，拒绝独立模拟器 HAP 和 rc2.48 签名包。假设备验证安装只接受原 UID、已配对的 rc2.48 快照、空草稿、应用进程已退出及原证书和原 profile 验签收据。19 项反例在安装调用前被拒，五项载荷对照通过。此轮未访问签名材料、未签装。[签装保护预检](../evidence/workspace-field-rc249-install-validation.json)

> 隔离补充验收（2026-11-04）：加密大块、Rich 结算屏障和实际 ArkWeb 空资源／失败隔离通过，旧解码逻辑反例被拒绝并已恢复修复版；该阶段没有访问真机；后续日常分块修正及现场结果见当前部署。证据与范围见[隔离补充验收](workspace-review.md#隔离补充验收)。

> 独立模拟器补充验收（2026-11-05）：实际 API 26 ArkWeb、原生加密 SDK 与安装版 Host 副本，在补齐目录和 313 个磁盘会话两种条件下分别通过 Rich 整轮 11 项检查。每轮使用固定四响应，真实模型调用为零。修复的旧接收上限只影响测试 HAP 准备，现场 API 失败尚未复现。证据与范围见[隔离补充验收](workspace-review.md#隔离补充验收)。

> 固定延迟对照（2026-11-05）：313 个磁盘会话与加密数据帧 1.36 秒固定往返延迟同时施加，Rich 11 项通过。对齐日常桌面的加密及工作区请求容量后重跑同样通过，首次就绪约 82 秒。各轮固定四响应，真实模型调用为零。现场 API 失败待定位。[隔离补充验收](workspace-review.md#隔离补充验收)

> 独立 WSS 慢链路首轮使用封存桌面包、rc2.53 工作区核心及 313 个磁盘合成会话，在桌面数据通道两个方向各注入 680 毫秒延迟。API 26 ArkWeb 已渲染标准对话和 Rich 卡片，原生从打开到就绪为 76.3 秒。驱动在就绪后检查时缺少握手标记，后续 Rich 动作未执行。模拟器原测试包已恢复，转发表为空。[首轮结果](../evidence/workspace-native-wss-standalone-disk-latency-first-attempt-20261107.json)

> 将握手采集提前后，300 秒租约对照确认标准 Web 在原生打开后 75.0 秒就绪，Rich 动作回执、未确认状态查询、草稿恢复和工作区关闭重开等 11 项通过。最后一次前台重开时，独立中继在数据首帧后 300.051 秒记录桌面数据通道结束，随后 ArkWeb 启动失败。四条固定回放全部消耗，真实模型调用为零。此轮使用测试中继的 300 秒租约，公网故障原因待现场采集。[租约对照](../evidence/workspace-native-wss-standalone-disk-latency-300s-lease-20261107.json)

> 540 秒租约对照沿用同一封存桌面包、rc2.53 工作区核心、313 个磁盘会话和双向各 680 毫秒延迟。标准 Web 在原生打开后 75.5 秒就绪。数据首帧后约 318 秒正常收尾，12 项通过，包括 Rich 动作、草稿恢复、标准 Web 重开和前后台往返。四条 TLS 1.3 连接和四条固定回放均已核对，真实模型调用为零。运行期间目录条目峰值为 314，区别于启动时的 313 个磁盘会话。模拟器原测试包已恢复，转发表为空，临时私钥已清理。租约变化仅用于隔离中继。[完整对照](../evidence/workspace-native-wss-close-cancellation-standalone-disk-latency-extended-lease-validation.json)

> 同一工作区 Peer 的目录读取合并回归使用三条标准 API 请求。旧实现第一轮尚未结束时已启动三次扫描。新实现此时只有一次，整轮四次扫描。第一轮开始后新建的两个 Session 均通过后到请求的实际 Gateway 授权。加密回环与 DevFlow 直达各五项通过。桌面九入口构建无类型诊断，候选归档逐项核对 309 个文件。[基线反例](../evidence/workspace-access-1794011796600.json) · [回归](../evidence/workspace-access-1794012230789.json) · [DevFlow](../evidence/workspace-access-devflow-1794012024166.json) · [封存桌面包](../evidence/workspace-desktop-scope-batching-candidate.json)

> 目录读取候选复跑相同的 API 26、rc2.53 工作区核心、313 个磁盘会话、独立 WSS 双向各 680 毫秒延迟和 540 秒测试租约，12 项通过。每个桌面包各测一轮，工作区首开由 75.5 秒变为 83.4 秒，目录扫描由 261 次变为 271 次，扫描累计耗时由 60.0 秒变为 26.7 秒。累计耗时包含等待时间，单轮对照未证实页面提速。候选继续留在隔离环境，模拟器原包已恢复。[指标对照](../evidence/workspace-scope-batching-slow-link-compare-20261107.json)

> 源码集成测试用内存中继将测试时钟推进到 1 秒房间租约到期，旧加密通道在桌面授权期限前失效。实际桌面插件自动重连，测试手机通过同一配对主动重连并读取原生元数据。工作区在重新授权前返回 `workspace-grant-required`，再次 Allow 后可读取标准启动配置和资源清单，旧通道的资源句柄仍被拒绝。双端合成配对未变，模型调用为零。手机应用自动重连和公网中继未包含在本轮。[租约到期集成验证](../evidence/workspace-device-command-1794014012370.json)

> rc2.41 诊断候选（2026-11-05）：原生诊断与私密字段隐藏在 SDK 替身上通过 58 项，API 26 编译通过。诊断 HAP 未签装，现场错误原因仍待收集。[诊断候选记录](../evidence/workspace-diagnostic-rc241-validation.json)

> rc2.42 就绪修复（2026-11-05）：实际 ArkWeb 在 Host 拒绝与单次请求超时后均显示失败，固定日志可区分两种情况。移除故障后正常重开，原生在标准渲染器挂载后显示已就绪。独立测试包随后通过标准 DevFlow 设置和 worker/high 委派整轮。未签名产品包编译通过，真机验收待授权。[候选与回归记录](workspace-review.md#隔离补充验收)

> rc2.42 官方原包对照（2026-11-05）：同一原生测试包通过官方推理翻译设置、设置落盘、原文和译文切换及 Rich 交互，共 14 项。三包 33 个自身文件与安装版副本逐字节相符，使用固定本地翻译和模型回放。[验收记录](../evidence/workspace-native-official-boot-validation.json)

> rc2.45 握手与同包回归（2026-11-05）：修复通道摘要以 `-` 或 `_` 开头时的握手失败，15 项加密测试通过。独立模拟器通过官方翻译和 Rich 的 14 项检查，三个原包 33 个文件前后逐字节一致。手机候选保持未签名，完整桌面归档已核对，真机验收待授权。[模拟器与手机候选](../evidence/workspace-native-official-current-validation.json)及[完整桌面候选](../evidence/workspace-desktop-complete-validation.json)

> 完整桌面归档验收（2026-11-05）：标准 CLI 在私有 profile 安装 Harmony、Rich 和 DevFlow，812 个包文件与归档逐字节一致。相同桌面归档中的中继实现经隔离模拟器通过官方翻译和 Rich 的 14 项检查。[标准安装](../evidence/workspace-plugin-install-1793866234580.json)及[打包中继整轮](../evidence/workspace-native-official-packaged-validation.json)

> 工作区命令验收（2026-11-05）：无桌面身份的私有安装运行时通过已启用命令的状态查询、停止及依赖恢复后的再次查询。新版完整归档通过标准 CLI 安装与三包 812 个文件逐字节核对，真实模型调用为零。真机工作区启动及生产连接待验。[打包命令与边界](workspace-review.md#隔离补充验收)

> 中继传输回归使用回环控制和数据 WebSocket。断开数据通道并重建桌面工作区授权对象后，原配对可读取原生连接元数据，标准工作区在再次授权前被拒。授权后两个 Cordis API 恢复，旧资源句柄仍不可用。四项源码集成测试通过，使用 Node 测试端和合成身份。[中继与授权回归](../evidence/workspace-access-1793884014015.json)

> 工作区启动恢复（2026-11-05）：rc2.48 的独立 API 26 模拟器测试使用合成连接切换，确认准备取消后原生草稿保留且没有清理误报，新连接可打开单一 ArkWeb，返回后草稿仍在。52 项源码检查通过，产品包未签名。现场失败及生产连接待真机复验。[模拟器与产品候选](../evidence/workspace-startup-recovery-rc248-validation.json)

> rc2.48 标准插件整轮（2026-11-05）：官方翻译与 Rich 共 14 项、DevFlow 共 5 项通过，Host 核对 `main` 父模型和 `worker/high` 只读委派。两轮共八条固定回放，真实模型调用为零。签装预检已核对双端候选摘要并拒绝模拟器包，真机和日常桌面待授权。[整轮与预检](../evidence/workspace-standard-rc248-validation.json)

> rc2.48 原生新建与插件直达（2026-11-05）：原生选择 `minimal`、`worker-model/high`，四次固定回放均使用所选配置，桌面默认模型保持原值。标准 Web 和按包名打开的 DevFlow 面板都通过，返回原生保留新会话的回复和草稿。八项模拟器检查通过，真实模型调用为零。[原生整轮](../evidence/creation-cipher-workspace-rc2-48-validation.json)

> rc2.48 桌面替换预演（2026-11-05）：私有桌面 profile 以 pnpm 12.6.0 离线升级、回退、再升级同版本 Harmony 包，回退恢复原锁文件。Rich、DevFlow、配置和合成数据逐字节一致。现场部署待授权。[替换记录](../evidence/workspace-plugin-install-1793871348697.json)

> rc2.45 DevFlow 整轮（2026-11-05）：同一模拟器 HAP 通过标准设置保存、重开和只读委派，Host 验证 `main` 父模型、`worker/high` 子模型及持久化配置。四次固定回放，真实模型调用为零。[DevFlow 验收](../evidence/workspace-native-boot-current-validation.json)

> 命令认领验收（2026-11-05）：标准 Web 实际输入框与测试处理器、真实 Harmony 源码处理器的隔离检查均通过，固定回放消耗零次；日常桌面预检没有取得终态返回，不能计为通过，后续只读复核输入框为空。提交功能保持禁用，真机没有再操作。证据与范围见[标准命令认领与提交防护](workspace-review.md#标准命令认领与提交防护)。

> 提交候选（2026-11-05）：12 项提交条件与 7 项参数模式离线检查通过，浏览器适配器为替身；候选未覆盖活动脚本，没有真实提交、浏览器或手机访问。结果未知时不重试或清理。见[候选范围](workspace-review.md#离线提交候选)。

> 原生插件目标（2026-11-05）：本地导航专项及新入口到封存 DevFlow 标准设置面板的隔离整轮均通过，覆盖保存、重开和原生聊天草稿保留；Host 配置从 `direct` 变为 `auto`，原模型和会话保留，模型调用为零。本轮使用 HTTP loopback，不代替加密中继或真机验收；新增入口尚未部署真机。源码、API 26 构建与证据见[原生插件目标与重试](workspace-review.md#原生插件目标与重试)。

> 安装版副本补验（2026-11-05）：同一原生入口与三份标准封存包在独立安装版 profile 通过设置保存、重开和聊天草稿保留，模型轮次为零；首次预览说明导致的失败已保留并补齐驱动。新 Host 进程也读回已保存 `auto`、原唯一会话及 `main` 主模型，设置字节未变，临时清单已恢复。应用、转发和 Host 均已清理，真机及日常桌面未操作；范围与封存见[原生插件目标与重试](workspace-review.md#原生插件目标与重试)。

> rc2.42 加密直达（2026-11-05）：独立 Mate 90 Pro Max 模拟器通过设备及工作区授权，直接打开标准 DevFlow 并保存、重开设置和保留聊天草稿。原会话与模型选择保留，模型调用为零。工作区打开前的 `unknown-outcome` 已定位到原生会话订阅 ID 冲突。[整轮封存](../evidence/workspace-native-plugin-cipher-validation.json)

> rc2.43 会话订阅修复（2026-11-05）：加密配对回归通过连续选择、切换与重连，独立模拟器整轮通过 DevFlow 打开、保存、重开及草稿保留，未再观察到订阅冲突或原生通用错误。API 26 正常产品包和模拟器包使用同一修复核心，正常产品包保持未签名。真机、HUKS 与生产 WSS 待验。[修复后整轮与产品候选](../evidence/workspace-native-plugin-follow-validation.json)

> rc2.39 产品候选（2026-11-05）：正常手机 bundle 的 API 26 构建、与 rc2.38 的差异核对、原材料签名及官方 app／profile 验签通过；签名前后 25 项原始载荷逐字节一致。候选尚未安装，真机状态仍以上次 rc2.38 收据为准；没有访问真机或日常桌面。见[签名候选与边界](workspace-review.md#rc239-签名候选)。

> 原生加密新增证据（2026-11-04）：DevFlow 与 Rich 均通过实际鸿蒙加密 API、设备票据和独立工作区授权的四响应整轮；固定软件测试身份与 HTTP loopback 帧载体不覆盖 HUKS／WSS。该阶段原生 URL 修复的默认禁用候选只提供离线构建证据；当前日常安装另见本页首段，[结果与限制](workspace-review.md#原生加密载体验收)。

> 原生选模执行（2026-11-04）：新建 minimal 会话后，原生输入框的四次实际请求均使用所选 worker-model/high，逐条回复及生成结束通过，默认模型未变；双端结果、持久化配置与测试 HAP 已封存，未授予全局工作区权限。固定软件密钥／HTTP loopback 不替代生产连接，见[结果与失败记录](workspace-review.md#原生新建与选模执行)。

> rc2.44 新建与工作区往返（2026-11-05）：原生选择 `minimal`、`worker-model/high` 并完成四次固定回放后，标准 Web 显示同一新会话的回复。返回原生聊天恢复回复和草稿，Rich 恢复不再触发错误提示。正常 API 26 产品包保持未签名，真机待验。[整轮及产品候选](../evidence/creation-cipher-workspace-current-validation.json)

> 标准命令依赖（2026-11-04）：rc2.34 私人 npm 候选修复工作区命令和本地所有者的 `clientModules` 注入；源码授权／撤销、命令快照及构建入口对照通过。同一归档在安装运行时副本也通过注册、依赖卸载／恢复及无 Web 依赖的原生命令检查，模型调用 0。该阶段只覆盖隔离命令；当前日常插件的加载冲突与生产连接限制见本页首段及[结果与限制](workspace-review.md#标准设备命令与工作区依赖)。

> 键盘对照（2026-11-04，进行中）：输入法初始化后已有原生与 DevFlow 的 1060 px 键盘及名称输入局部成功，完整五轮仍未通过。无 Host 的本地原生／Web 对照在默认与 MULTIPLE／FAST_MODE 设置下也复现失败，保留错误码 80；生产进程设置未变。用户随后在模拟器人工对照，原生输入与 Web 输入均能正常弹出键盘；这是人工观察，不是自动化整轮结果，也未确定错误码 80 与零高度的根因。见[诊断及已排除项](workspace-review.md#隔离环境结果)。

> 标准原包新增证据（2026-11-04）：安装版原官方推理翻译三包在同一原生加密应用通过设置、译文／原文组件与重开验收，33 个自身文件未改动；使用固定本地翻译端点与四响应模型回放。[结果与限制](workspace-review.md#未改动的官方标准插件)。第三方固定发布物的标准安装、宿主加载与 `/api` 后端不可达结果见[标准 CLI 安装与第三方发布物](workspace-review.md#标准-cli-安装与第三方发布物)；其手机界面与生产连接仍未验收。

> 当前模拟器接入（2026-11-02）：dsh-emulator 独立配对；长时间跟随、房间到期续接、桌面重启恢复、跨重连草稿、模拟器新建及消息已通过实际验证。桌面 rc2.33 与模拟器已整合 4 MiB 历史容量和设置入口，旧“MVP体验”历史／富内容、切换后消息、原生停止及再次自然续接通过；原真机配对和数据保留，真机未更新。真实模型停止确认仍可能等待几十秒，后台和完整富内容操作未验收。见[整合结果与边界](../evidence/mobile-coordinated-20261102.json)、[933 秒稳定性验证](../evidence/emulator-stability-20261102.json)和[恢复命令](../emulator-dev/README.zh.md)。

> 当前验收（2026-11-02 会话列表管理）：[rc2.32 结果](session-list-manage-rc2.32.md)：编译与 21/21、47/47、33/34 检查通过，真机新建／置顶／归档／取消归档／搜索／折叠逐项通过并有桌面持久化证据；零模型消息。锁屏断连、/device 命令缺失、“运行中”筛选真机未点及两个遗留空会话保留记录。下文为阶段历史。

> 历史验收（2026-11-01 会话误报）：[rc2.31 结果](session-catalog-ready-rc2.31.md)包含一项时序回归、一项本地加密往返、API26 编译，以及原机主体验会话首次和重复打开通过；旧会话往返失败和最新聚合类型检查的依赖错误保留，未发送消息。下文为阶段历史。

> 历史验收（2026-11-01 自动连接）：[rc2.30 原机结果](paired-connection-rc2.30.md)通过原签名原位安装、原 UID 保留、双端更新、常驻中继启用，以及手机启动自动连接和真实会话列表。未自动发送消息，当前连接保持。初次清理失败及满期限房间拒绝均已记录；后台恢复、房间续接和长期稳定性尚未验收。下文为阶段历史。

> 历史验收（2026-11-01 深色界面改版）：[改版验证](ui-redesign-20261101.md)通过：布局审计、页面与连接页测试、消息流程 141 项、桌面提交 223+12 项、路由恢复 17 项及官方 API26 编译。原手机假数据预览覆盖列表、流式跟随、停止、错误（停在会话底部时横幅仍在顶栏下可见）、只读和设置页；rc2.29 原签名原位安装后冷启动为已配对、未连接，UID 与配对文件保留。真实桌面连接、真实回复和 rich 区块尚未验收，假数据结果不能代替。

> 历史验收（2026-11-01 rc2.27 MVP）：[本轮原机三项通过](mvp-rc227-a2-20261101.md)：真实会话内手机新回复、生成中停止及 181.8 秒连续连接，严格两条文本、一次停止，无重发或重连。桌面 rc2.23／手机 rc2.27 未重装，原 UID、配对和数据保留；双端、临时路由、中继、代理及屏幕超时已核验收尾。回复与取消确认仍有等待，长期稳定性和此前断连的唯一根因未确认。下文为阶段历史。

> 当前验收（2026-10-30 UI 适配器）：[桌面与手机适配器](connection-ui-adapters-20261030.md)已接入启动协调逻辑，完成双端连续提交、各阶段取消、迟到调用、超时及 pending／failed 收尾的离线回归；正常产品确认和原对象核对保留，等待原调用完成后才执行独立停止验证。本轮未操作已安装应用、HDC、原配对、数据或中继，没有重开窗口；实际 UI 与持续连接仍未验收。

> 当前验收（2026-10-30 实机窗口）：[本轮唯一连接](rc216-window-20261030.md)已执行并关闭，首次明确失败为 control-handshake/timeout，目录 0，未重连或调用模型。手机已完成挑战/身份校验、原签名及发送，未观察到房间回执；双端启动至少错开 21.797 秒，超过中继 10 秒挑战期限，属已知操作干扰，不能认定唯一产品根因。原配对保留，双端停止、route 独立撤销、中继配置恢复、5 个 reader 退出及输入核空均通过。本轮授权已消耗；先离线验证启动时序，再决定新窗口。

> 本地准备验收（2026-10-30）：[本地只读核对](../evidence/rc216-offline-preflight-20261030.json)通过：桌面实际 rc2.16，device 与 feedback 运行，108 个安装文件匹配候选；原手机 rc2.16、原 UID、同一进程，已配对未连接、连接禁用，候选哈希未变。仅恢复已授权的 HDC 查询，没有连接、配置修改或重装。连接观察回归 4/4 通过；[下一轮限时验收范围](rc216-next-window.md)已准备，原中继当前状态尚未核对，窗口未获新授权。

> 安装验收（2026-10-29）：[rc2.16 授权安装和离线核对](rc216-installation-20261029.md)通过：桌面插件 rc2.16，device 与 feedback 运行；手机原证书原位安装 rc2.16，UID、绑定和历史文件大小保持，两端冷启动正常。桌面 status 返回 bound，手机已配对、未连接且连接按钮禁用。没有重配、连接、新路由窗口或模型任务；稳定连接、取消和重连仍未实机验收。

> 历史验收（2026-10-28）：用户确认[已安装 `.2`](installer-repaint-20261028.md)正常启动，安装载荷完整性和授权后的隔离原生启动已通过。安装器权限持久处理的源码、原生回归、10 项目录事务（含真实权限拒绝）及 14 项单元测试通过；未生成包含该改动的新整包。原 profile／配对恢复及 rc2.16 激活未单独核验，旧[原生六项场景](native-electron-rc2.16.md)属于临时副本。Harmony 桌面插件最后核验 rc2.12、手机 rc2.15，旧窗口见[主交接](HANDOFF-2026-10-28.md)。未访问原配对、未重配、未改手机／中继或开启实机窗口，稳定握手及手机交互仍未验收。下文保留阶段历史。

rc2.14 真机条件恢复通过，原身份、绑定及4项已结束历史保留；正常退出重开直接显示已配对、未连接。桌面和中转未操作，联网控制及强制终止/断电未验。[当前证据与限制](storage-lock-recovery-rc2.14.md)。

rc2.13 启动诊断离线验证通过：固定区分 binding-read、identity-init、route-history-restore；仅显示启动前文件存在、大小及锁状态，不输出路径或配对内容。原绑定已验签但连接历史恢复失败时保留“已配对”，所有后续操作仍拒绝。启动回归14项、现有隔离集成23项、连接诊断26项、页面9项、终态观察4项及严格类型检查通过，官方API26编译和23项HAP CRC通过。未签名候选尚未安装，真机启动原因、原配对可读取性与实际连接仍未验证；不会自动清锁或重新配对。见[封存证据](../evidence/startup-diagnostics-rc2.13.json)。

当前 Host 的 /harmony-pair 和原生独立范围选择已完成源码接入；新增4项含旧历史克隆及撤销重放拒绝均通过。断线轮为11/12，既有用例超时，不记为全通过；此前12项与187模块结果不重复跑。官方复编和源码一致性见[本轮验证](../evidence/normal-product-controls-validation.json)。没有真实 HUKS、授权、模型、部署或真机执行；撤销10/活动0保持不变。[接入步骤与30分钟生命周期限制](normal-product-entry.md)仍需区分代码验证和实际可用性。

原超时用例已按原20秒限制单独通过，见[单例结果](../evidence/normal-product-timeout-recheck.json)。新唯一版本0.0.0-normal-controls.1已完成29个精确peer及会话局部测试注入，5项行为检查、190模块strict和实际alpha.4模块合成闭环通过；[插件包消费检查](../evidence/normal-controls-package-smoke.json)用4个打包入口验证新会话、普通产品任务与rich完成，模型/网络均0。[当前产物](../evidence/normal-controls-artifacts.json)包括未签名HAP；[首次真机清单](first-device-acceptance.md)仅余明确安装、配置、授权及实机步骤，未执行部署。

Phase76唯一grant9窗口已用并关闭：12:38:54.132 UTC提交，原定13:08:54.132到期，12:40:19.905前撤销10并关闭资源。HUKS新证明验签成功；六公开字段上传经同一调用一次证据重试仍被审批拒绝，未上传/认证/派发任务，回放和真实模型均0。本地/中继/手机收尾核验完成，不重开窗口。见[单窗口收尾](phase76.2-field-closeout.md)。

Phase76现场：2026-10-17 12:12:42.055 UTC原签名保留数据安装成功，安装后原HUKS及完整7匹配。HUKS挑战签名被自动审批拒绝，附确切转交批准证据的同一调用重试仍拒绝；未签名、未提交grant9、未开始认证/任务，回放/真实模型/上传均0。原owner收尾，本地配置和Session原哈希恢复/保留，中继/nginx原状态复核，手机12:23:36.109 UTC正常退出PID空，最终撤销8/活动0。见[现场收尾](phase76-field-closeout.md)。

Phase76完整候选仅离线：原HAP复用，新增148文件桌面闭包及批准门控操作器；强制手机就绪先于有限桌面重试。47项操作器、闭包原控制器15项、控制/HTTP/FIFO共21项及82项memory/history通过；strict180模块，独立dsh四响应/23流帧/rich状态/取消通过。没有手机、SSH、签装、上传或新grant。详见[完整候选](phase76-complete-candidate.md)。

Phase76仅离线诊断：原broker/控制器复现桌面重连预算先耗尽而手机晚到的顺序缺陷，调整为手机配对先就绪；另以官方AsyncCallback定义和原封存代码复现message错误无data时的TypeError并修复。15项新控制/诊断、4项HTTP拒绝、78项memory/history及178模块strict通过。新增固定阶段和有界错误码，不认定phase75现场唯一根因；独立SDK候选与证据见[控制诊断](phase76-control-diagnosis.md)。未接触手机、SSH、签装、上传或新grant，撤销8证据保留。

Phase75 已完成批准的原签名原位安装、原 HUKS 核对、最终 grant7 完整历史保存和实机离线读回，以及六字段中继上传。手机 control 在升级和首帧后认证超时，未派发任务；流式、ArkWeb、去重、重连和取消未通过。唯一 grant7 于08:28:04.538 UTC提交，08:33:38.882 UTC撤销至8；原服务/nginx/public配置恢复复核、手机正常退出及活动0已确认。127项修复与操作测试通过，完整事实和原始回执索引见[实机收尾](phase75-field-closeout.md)。

Phase75 离线实现、56项签名历史合成回归、strict 和官方API26编译证据见[完整历史恢复](phase75-complete-history.md)与[完整操作候选](phase75-operation-candidate.md)。实际手机历史验证已通过；其余端到端路径以本次实机收尾为准。

Phase74.7已于06:34:29 UTC原签名原位安装73.1，安装后完整v2、原HUKS指纹及正常退出验证通过。唯一grant5于06:46:14.002 UTC提交，原定07:16:14.002 UTC到期；公开pair上传被自动审批拒绝两次后，06:48:26.257 UTC确认撤销至6，活动0、手机PID为空、原service/nginx和public配置恢复核验通过。未连接、未派发任务，回放0、真实模型0；完整结果和保留继承链见[实机收尾](../evidence/phase74.7-field-closeout.json)。90项操作修复测试及此前合成owner/SDK/strict证据保留；实际任务、流式、ArkWeb、去重、重连和取消仍未完成。06:55只读核对确认手机最后读回仍为grant3，桌面撤销6匹配的是未导入的grant5；精确载荷、拒绝原文和离线继承前提见[后续计划](phase74-refusal-and-history-plan.md)，本轮未执行任何现场动作。

当前离线资格见[第73阶段](phase73-data-channel-repair.md)：21项参数/字节/帧检查、9项HTTP/容量检查、174模块strict、修改TS实现lint、官方API26 unsigned编译及67项固定回放集成通过。尚未签名、安装、部署或新建grant。第72阶段真实端到端仍未通过；epoch4撤销历史保留，手机私有trust/锁未读回。以下旧检查点保留为历史，不能替代真机验收。

# 当前离线产品验收

当前资格见[第60阶段](phase60-installed-hdc-disconnection.md)：已批准的同 bundle 原位安装成功，原 HUKS 公钥与既有指纹完全一致；原生挑战预览已出现，但完整确认未完成，未触发新包上的 HUKS 签署。实际主机 HDC 后续返回 [Empty]，原手机 USB 接口未枚举，手机退出状态不可查询；桌面进程0、grant0、无计时。视口手势修正通过4项测试，尚未在掉线后的设备执行。完整真机闭环未通过。

[第54阶段真实首用](phase54-real-first-use-blocker.md)记录本次批准后的实际状态：手机在线并执行一次原生创建确认，但旧存在查询遇到缺失别名即抛错；未成功创建手机身份。电脑测试DPAPI身份保存/重开通过，grant为0，测试进程已退出，中继未激活。源码修复与unsigned API26编译通过，更新安装尚未获批；真实HUKS签名、TLS、ArkWeb、回执去重/恢复/取消全部未验。

[原样页面与双端时限](phase53-original-field-interaction.md)记录当前 `.4` 后继资格：9项源码交互/拒绝测试通过，封存解压字节的原始 SDK 表单真实点击、8项跨进程恢复、独立目录启动与公开工具冒烟通过。Windows/Chrome/SDK替身与固定回放不建立 ArkWeb、HUKS、Linux 持久化或真实手机链路资格；真机布局仍以[第50阶段](phase50-device-scroll-acceptance.md)为准。

[有限用户流程、实际层级与剩余现场验收](offline-product-acceptance.md) 是当前记录；[封存记录](../evidence/product-final-seal.json) 核对源码增量、回退前像和对应 unsigned HAP。下列前代记录仅保留各次证据资格，不建立本次手机或安装状态。

# 验收矩阵

第八轮[实际原生结果](phase26-round8-native-attempt.md)为零通过、一 blocked：初始 follow 已接纳且 ArkTS 交付 76009 字节，但 v25 私有诊断触发 native-port-failed，socket/reset-snapshot 未注入。窗口 14 分 13.635 秒内清理，许可与共享 HDC 保留。源码/SDK 替身已复现诊断误拒合法 -1，不作为原生恢复通过；第七轮结果不追溯改判。

当前[Socket 离线追踪](phase25-socket-offline-trace.md)新增可复查的 Session 重建、原生定位修复、分层诊断与 v25 编译。其源码 BFF/SDK 替身检查不能提高第七轮资格；v25 尚未安装或原生执行。

| v25 准备层级 | 实际证据 | 仍缺证据 |
| --- | --- | --- |
| 保存 Session/共享投影 | 原样 live 探针重建；真实 BFF 的 socket 后读取闭环，零新派发 | 原机逐帧接收与接纳 |
| 原生代码/诊断 | 官方 API26 ArkTS/HAP 编译，实际 `.ets` SDK 替身回归 | 新 native ListScroller 定位、完整可见文字与 task 观测 |
| 权限/资源 | 未安装、未转发、未启动；许可与共享 HDC 未改 | 专项新窗口批准后原生复验；真实桌面/WAN/真机仍未验收 |

当前第七轮[原生矩阵](phase24-round7-native-attempt.md)为两通过、一失败、零 blocked；同窗 socket 补验也失败。只有相同 v23 unsigned HAP 在 API26 隔离模拟器上的证据获得本轮资格；真实桌面、WAN 与真机未验收。

| 第七轮场景 | 当前结果 | 证据与限制 |
| --- | --- | --- |
| cursor-gap | passed | 精确原生日志 error、readOnly=true、disconnected，固定任务提交禁用；零新派发 |
| cursor-conflict | passed | 精确原生日志 error、readOnly=true、disconnected，固定任务提交禁用；零新派发 |
| socket 自动读取恢复 | failed，补验仍 failed | reset-snapshot 写出、连接恢复、rows=7；原样唯一探针 Text/originalText 未观察到，限定滚动未解决 |
| 时钟与清理 | 本场景证据完整 | 49 条命令 wire TTL=53000、接纳剩余期小于 60000、trusted、零 expiry；原窗口 16 分 26.997 秒内全部清理，许可不变 |

[有界时钟修复](phase23-command-lifetime.md)的离线测试和 v23 官方构建仍独立保留；本轮未重建 HAP，未增加公开字段、到期宽限或生产授时。第六轮[零通过三 blocked](phase22-round6-native-attempt.md)、第五轮[四通过三失败](phase20-round5-native-attempt.md)保持原值，不追溯改判。

[过期离线审计](phase21-expiry-review.md)通过严格 TS、62 项相关测试与 10 项真实服务固定回放，覆盖有效/刚过期/偏差/恢复新请求/旧请求拒绝及故障未写出时不得计为写出。原生过期分支仍未知；本批未编译或运行 ArkTS/HAP、未连接真实桌面或真机，旧 HAP 原字节保留。

上述证据仅对应第二十一批。第二十二批新增官方 API26 ArkTS/HAP 编译、69 模块严格 TS、37 项相关 Node 测试、10 项真实服务离线回放及实际模拟器时间配对；只确认本轮 future-limit，未改变第五轮每个原命令的未知分支，也未提升三项原生功能资格。

第十二批见 [私有 HTTP 字节接口与批准事实](phase12-private-http.md)、[汇总](../evidence/phase12-summary.json) 和 [HAP](../evidence/phase12-hap.json)。151 项独立测试/87 项 Chrome 断言及官方 API26 编译通过；当前新增证据是 Node MessageChannel + SDK 替身 + 真实服务固定回放，不是原生 HTTP/模拟器连接。下表的第十一批原生本地执行及 201 拒绝仍只对应封存 v11，不能提升 v12 的执行资格。

| 封存第十二批层级 | 实际证据 | 仍缺证据 |
| --- | --- | --- |
| 私有 HTTP 字节接口 | Node MessageChannel + 编译 .ets SDK 替身，9 项生命周期/失败测试；真实服务回放、任务/rich/取消/重开去重；134 Node+9 source+8 BFF=151 独立测试、87 Chrome 断言 | 模拟器的实际私有 HTTP port 与 SDK 网络执行 |
| 原生构建 | 官方 API26 CompileArkTS/assembleHap；47 项输入哈希一致，789635 字节 unsigned HAP | 本批未安装/执行，原生 BFF、已安装桌面 profile、真机 |
| 网络范围 | INTERNET/system_grant、HDC rport 方向/删除及上游 loopback 源码只读核实；manifest、原生端点和权限保持关闭 | 独立测试变体与临时反向转发批准、实际地址与回退验证 |

| 封存第十一批层级 | 实际证据 | 仍缺证据 |
| --- | --- | --- |
| 真实DSH字节测试链 | 实际SessionController/RichInline/JSONL/StorageDomain/Gateway；Node SDK替身、独立phone PID；四响应、重连/取消/持久重开零再派发 | 原生SDK实际成功HTTP、原生私有HTTP port执行、已安装桌面profile |
| 原生API26 HAP | 官方ArkTS编译、unsigned HAP；本地MockDesktop与固定guest子集 | 原生到真实BFF，最低兼容API、真机 |
| 原生网络拒绝 | permissions为空，实际SDK返回stream-permission-denied；不创建转发或激活网络 | INTERNET及具体测试通道批准后重新验收status/headers/流/关闭 |
| 隔离与切换 | 固定guest的父DOM/桥/popup/CSP/network/file/shell/伪造IO与任务负例；A缓存及退役发布核对 | 完整恶意source/port、WebRTC/download、强杀/崩溃/IME、WAN/审批 |

封存第十批证据见 [官方模拟器原生验收](phase10-native-emulator.md)、[汇总](../evidence/phase10-summary.json) 和 [完整回归](../evidence/regression-final-regression-final-EZhVW6/summary.json)。134独立测试/79Chrome断言通过；官方API26 unsigned HAP已实际安装/运行，本地ESM/port、合成流式任务、rich action与正常native cache子集通过。IME、HTTP/完整隔离、真实桌面和真机不在已验资格内。

| 封存第十批层级 | 实际通过 | 未验收 |
| --- | --- | --- |
| 原生构建/安装 | 官方ArkTS/HAP；隔离API26实例安装/Ability启动；最终744145字节unsigned HAP | signing、真机安装、最低兼容API |
| ArkUI/ArkWeb合成闭环 | hashed本地ESM/private port ready；任务running→completed；rich表单/图表与action completed且connected | 真实桌面profile、native重复派发/持久远端恢复、native代码/schema重挂载 |
| 原生缓存/生命周期 | app-owned FS正常保存恢复、重开/重装只读恢复、跨Session拒绝；前后台仅本地重载 | 原生IO失败、renderer崩溃/强杀、键盘/旋转/IME、HTTP |
| 安全与最终设备 | 无INTERNET/签名权限，生产provider关闭；Node/Chrome安全回归 | native恶意guest/CSP/source/port、手机/WAN/最终桌面执行证据 |

以下阶段表保留历史采集时的资格，不能用于判断当前构建或安装状态。

| 封存第八批范围 | 实际验证 | 未完成层 |
| --- | --- | --- |
| 官方工具链 | 实装DevEco26.0.0.851、SDK26.0.0.105/API26、Hvigor/plugin6.26.8，复用本地组件 | GUI首启与导入观察、具体手机build/API |
| ArkTS及HAP | 官方CompileArkTS/assembleHap成功；34项输入哈希一致；397062字节unsigned HAP包含modules.abc | 签名、安装、执行与性能不由编译确认 |
| 完整回归 | 95 Node + 9 source replay + 7 BFF =111独立用例；55Chrome断言；真实模型/上传零 | native JS容器、HTTP/cache/port、支持profile、WAN |
| 原生UI及ArkWeb | 已编译ArkUI列表/输入/审批展示和scripts-off rawfile资源 | GUIpreview/模拟器未运行；端口/CSP/IME/触摸/生命周期未实测 |
| 模拟器及真机 | 官方CLI可查询；未发现已有实例或已下载镜像 | 未创建/启动模拟器、未启用调试/权限/安装；真机未验证 |

以下分批记录保留各批当时的验证范围。[第七批汇总](../evidence/phase7-summary.json) 与 [交接矩阵](phase7-handoff.md) 为封存历史，不表示当前仍未编译。用例连续性见 [统一回归](regression.md)。

| 第七批收敛范围 | 验证证据 | 剩余层 |
| --- | --- | --- |
| 默认关闭真实连接 | 全部 Node 库存含 6 项新安全用例；生成受信入口排除合成身份与 fetch transport | native 身份验证、批准后的真实 provider |
| 本地审批预检 | exact binding、当前 scope/epoch、revision/expiry、幂等本地选择与伪来源拒绝；无 IO、无任务派发 | 桌面审批 endpoint、native gesture 与 ArkWeb 隔离实测 |
| 原生接口交接 | 运行容器、网络流、cache、port、lifecycle 精确 SDK 待办；未知版本保持 null | 官方 SDK 声明与 unsigned 最小模块编译，当前未编译 ArkTS |
| 最终一致回归 | 当前库存、strict、source/BFF、旧和共享 Chrome 同一轮日志与源码 hash；v1–v6 历史 hash/用例保留 | 支持 profile、ArkWeb、WAN、真机资格 |

| 第六批范围 | 已验证层及结果 | 剩余层 |
| --- | --- | --- |
| 全阶段连续性 | v1–v5代码与每条测试注册均仍存在；无退休、无跳过；完整当前库存当轮通过 | 后续改动后重新使用统一入口，不能相加阶段子集 |
| 项目/Session分页 | 真实合成WorkspaceRegistry/SessionController，经实际Gateway/临时loopback；过滤scope、不可变cursor、路径剥离 | 原生网络与真实桌面profile/账号权限 |
| 历史与列表 | 真实Session.page补到100条；durable/wire cursor不回退；Chrome20行key/scroll anchor保持 | 无限历史语义窗口、已编译ArkUI列表/键盘生命周期 |
| 缓存 | Node文件持久恢复源事件/草稿、去掉lease/hint；未知/损坏/超限拒绝；恢复只读到远端核对 | ArkTS应用目录读写、存储保护、多端草稿冲突UI |
| 图片 | 固定1×1PNG通过真实AttachmentStore；限时scope handle、chunk/byte/dim/pixel上限、释放/revoke/不可交付清理 | 真机native decode及app-owned缓存、真实附件授权 |
| 富消息一致性 | Chrome360/480/1080同一content hash/SDK；表单、图表、code、focus/draft、revision/remount、history/readOnly与一次执行；截图实际查看 | ArkWeb端口、CSP、隔离、IME、触摸、辅助功能实测 |
| 工具准备 | 相关PATH和四个IDE目录preflight；unsigned生成拒绝未确认工具；官方来源/版本再核实和first build停点清单 | 官方DevEco/SDK批准安装或复用、debug signing/安装/调试各自批准 |

第五批见 [事件域与手机视图](domain-and-view.md) 和 `evidence/phase5-summary.json`。真实 BFF 数据进入共享语义模型和 Chrome 富块视图：原版 guest SDK 保存真实草稿并完成固定 action；360/480px 图表/表单/局部代码滚动、历史 remount、正确 scope 伪审批拒绝和版本/hash fallback 已验证。native provider 默认 Disabled，ArkTS/HAP/ArkWeb/设备未验证；下方前四批记录作为历史证据保留。

第二批证据见 [link-core](link-core.md) 和 `evidence/phase2-summary.json`：当批 42 个不同 Node 用例及 15 个 Chrome 断言通过。第三批新增 admission journal 与 [真实服务组合](real-services.md)：生产 Session/Rich/存储插件已在隔离源码测试进程中组合；远程传输和原生仍未验证。分批结果分别保存，`evidence/summary.json` 只表示第一批 Temp 工程历史。

本表区分已自动检查、仅源码、计划验证与授权阻塞。Task/action fixtures 和 Chrome sandbox 结果仅对应本实验；不能代替真实桌面模型链路、ArkTS 编译、ArkWeb 隔离或真机。

第四批 [回环 BFF](network-transport.md) 已验证不同 PID 间的实际 HTTP/NDJSON、Gateway dispatch、流、背压、重连和有限 replay。尚未启动产品 Web Connection/标准 mux/SDK，尚未实现域语义投影或 native provider；这批运输用例不能提升原生/WAN/真机行的资格。

| 目标 | 首批证据 | 尚需验证 |
| --- | --- | --- |
| 发任务与收据丢失 | 真实 Session prompt、并发 duplicate、写入确认丢失只读恢复、改 payload 冲突；独立持久 journal | 支持的 DSH profile/SDK、持久生产收据、OS 强杀与进程并发。 |
| 正确会话与桌面归属 | 两个 synthetic session 分离；跨 desktop/session projection 拒绝 | 真实项目权限、session archive/delete、挂起、续接、子会话。 |
| 流式与重连 | 真实 follow 的 chunk/event 到手机投影；同一 cursor 磁盘重开；mock gap/duplicate、原子 baseline 和 live settlement | 真实 Typert wire decode/window/pages、未知 required event、WAN/ArkWeb lifecycle。 |
| 富表单与最近输入 | canonical guest SDK fake-DOM 单测和 Chrome 真浏览器 fixture，draft/action/status 回 mock gate，保存最后输入 | ArkWeb form、IME、软键盘、日期/selection/table、native accessibility、完整 PTC 场景。 |
| action 去重与完成 | 真实 rich-inline outbox、完成工具、原值进入请求；remount/磁盘重开保留 receipt；Session 范围 actionId 冲突 | 真实取消 action、lateAfterCancel/outcome_unknown、完整平台 guest 提交。 |
| 草稿同步 | draft CAS 拒绝 stale/schema conflict 后保留旧状态；remount 保留编辑 | 手机/桌面并发、离线本地草稿、冲突 UI、存储失败、真实 process-loss 恢复。 |
| revision 与更新 | 独立 data/render revision；旧 guest scope/revision 拒绝；guest 旧 snapshot 不降级 | pendingManifest、schema-change archive 确认、flush 失败 barrier、死循环 guest teardown。 |
| 历史与 fork | mock reopen 不重执行；readOnly inherited 无 actions/files/drafts | DSH session prefix、真实 publication hash/projection/fork 历史恢复。 |
| guest 权限 | canonical wire parser、source object、lease/revision/seq/size/allowlist；shell/approval/session selector 拒绝。Chrome 检查 parent DOM 拒绝、无 dshDesktop bridge、CSP 禁止原生 form 网络提交 | 真实 ArkWeb CSP/sandbox、opaque frame source/port、file/net/WebRTC/window/download/worker 拒绝、性能隔离。 |
| 原生 UI | ArkTS/ArkUI 源码：列表、输入、取消、状态和审批展示；资源 copy locale-owned | 尚未编译。真实敏感审批、能力目录、回前台生命周期、少量 WebView 策略。 |
| WAN/蜂窝 | 未激活 relay/E2EE/撤销/断线方案 | 必须实际蜂窝网络与桌面出站通道；NAT、TLS/身份、授权范围、撤销、重放、drop/duplicate/延迟/TTL。 |
| HAP/模拟器/设备 | 无构建或安装证据 | 先批准官方工具与设备动作，真实 SDK 构建、Hypium/Instrument 和手机证据。 |

最终验收至少包括：手机通过蜂窝网络发任务 → 已授权桌面实际执行 → 手机实时和富块交互 → 回传原 session 与原 actionId → 断线/前后台/重复包不重复执行 → 不确定外部结果显式显示 → 权限动作由可信控件确认 → 手机与生成内容都没有任意宿主执行桥。最终真机证据无法由 mock、Chrome 或模拟器替代。

运行结果和截图保存于 `../evidence/`；各批 summary 与真实服务报告记录实际执行层级，source hashes 由 `.build/source-hashes.json` 与生成资源记录。默认未生成任何真实访问凭据；测试里的标识、数据和结果是公开可复现 fixtures。

Chrome fixture 的 15 项断言覆盖两种宽度的实际表单完成、无横向溢出、44px 控件、parent DOM 拒绝、无 Desktop bridge、form-action 网络拒绝、history reopen 不重派发，以及无脚本错误。两张截图已人工视觉检查：控件、状态和固定图完整可见。iframe 的 allow-forms 只让 submit 事件进入 SDK，CSP form-action none 继续禁止原生网络提交；这一组合必须在 ArkWeb 重新验证。首次浏览器测试未允许 submit 事件，失败诊断保留在 browser-failure.json，最终结果以 browser-results.json 为准。

Current offline observation evidence and its native limits are recorded in [phase27](phase27-diagnostic-isolation.md). The eighth-window failure remains a failed native attempt. The separately approved [ninth round](phase28-round9-native-socket.md) qualifies only the native API26 emulator socket recovery case.

Current per-version qualification and the smallest next regressions are owned by [the v29 cumulative matrix](phase29-acceptance-matrix.md). Historical native passes from different HAPs are not a current all-pass result.

The [phase30 narrow profile library](phase30-profile-binding.md) has offline capability negotiation and typed synthetic bindings. It is not registered in a product profile or included in the v27 HAP; the 83 related memory cases and 27 final binding cases do not establish installed desktop, native or device approval acceptance.

The [phase31 source adapter](phase31-unregistered-adapter.md) adds 13 memory cases and a 96-case focused regression using shared BFF Core and test-owned Cordis scopes. It has no registered product service, real approval settlement or native/installed-desktop qualification.

The [phase32 installable bundle](phase32-installable-plugin.md) passes 4 actual in-process production Gateway/replay cases, 96 memory cases, built ESM/NodeNext and tar entry checks. Its default-disabled installation has not happened; user installed compatibility, authenticated carrier, original approval settlement and device acceptance remain unqualified.
# Phase33 安装兼容核验

用户自行安装的包已通过只读文件/版本核验，managed bundle 未选中，未启用。14 个关键宿主/rich-inline 构建文件与本地 prepared build 相同；当前结果限于安装与静态接口兼容，不能替代激活、手机远控、真实审批或真机验收。参见 [只读核验](phase33-installed-verification.md)。
# Phase34 认证范围

新的未激活 owner/carrier 通过现有 authorization/credentials/scope seams 和 17 个离线用例，真实 Gateway 只跑合成读取与订阅。当前没有真实签名验证器、enrollment ticket、加密/channel-binding 实现或原生密钥存储；不能认定安全配对已完成，也未将新代码安装/启用。参见 [设计与验证](phase34-device-authorization.md)。
# Phase35 验收分层

共享 E2E state 的 12 个 library 算法/owner用例、7 个 ETS SDK 替身用例与三个 ETS adapter 的实际 API26 编译通过，来源和限制见 [离线加密方案](phase35-offline-crypto-relay.md)。没有实际 native key IO、真实手机/签名/配对、WSS/香港服务器或安装启用验收；自定义协议仍需安全审查，现有 phase32 安装保持完整。

# Phase36 验收分层

默认禁用 relay、共享 WSS/E2E 和原生确认预览已完成本批离线测试及 API26 unsigned 编译；独立只读安全审查与追加复核已完成。真实 signer/UI、HUKS/native TLS、服务器部署和真机仍阻塞；[交付与集中批准清单](phase36-relay-handoff.md) 是当前状态入口。

# Phase37 验收分层

首次配对完整合成流程通过41条测试（14条新增、27条旧 relay/crypto 回归），103模块 strict TS，独立 API26 CompileArkTS 与 unsigned/permission-free HAP；一条会写旧封存 evidence 的用例有意排除。原生确认/已有 key signer 的实际 ETS 使用 SDK 替身，完整手机 owner 仍为纯 TS 离线运行；不等同 HUKS、TLS、ArkWeb、真机或实际桌面派发。dhome 只读检查已批准并完成，没有部署。当前层级、官方签名字段与对应实装阻塞见 [Phase37](phase37-first-pairing.md)。

# Phase38 独立轻量中转

18条实际本地loopback/配置/生命周期新用例及41条旧relay/E2E/native-owner回归通过；旧封存evidence写入用例1条有意排除。4条实际ESM部署包smoke、109模块strict TS及独立只读安全复核完成。只有Node+ws，默认空room拒绝全部join；包文件在运行前后hash一致，不等于OS/proxy不落盘保证。Linux/TLS/生产issuer/手机/API/签名和ArkWeb仍待验，旧DSH服务器安装方案暂停；见 [轻量交接](phase38-light-relay.md)。

# Phase39 短room控制面

93项合成回归（34新场景+59前代）、5项打包ESM、122模块strict TS通过；双端新签名、实际loopback E2E/换room/旧密文拒绝、原只读grant/新binding复用、撤销与全资源fault cleanup，独立源码复核完成。仅固定公开测试keys和memory公开状态。CLI无持久revocation writer；未编译新ArkTS、未接实际桌面/真机、未部署Linux/TLS。详见 [本批证据与限制](phase39-room-control.md)。

## 2026-10-14 read-only field readiness

The preceding offline-product completion qualifies the synthetic fixed-replay test journey, not a first-install usable phone app. Current signing, HDC, installed package and zod observations are recorded in [field readiness](field-readiness-20261014.md). No device, server, installed profile, key, signature or model was activated. The independent source replay profile and explicit native first-key creation entry remain code prerequisites; detached package dependency acceptance is also pending.

## Phase41 first-use qualification

[First-use report](phase41-first-use.md) records the native blank/default-disabled initialization path, 2 SDK-substitute tests and complete loopback/fixed-replay journey, 145 strict source modules, a 37-package external consumer including missing-zod refusal, an external public dsh profile journey including unsafe-mode/missing-fixture refusals, and the latest INTERNET-only unsigned API26 compile. No real HUKS, signing/install, current desktop or broker activation occurred. Production pairing composition and real-device acceptance remain separate.

## Phase42 local first-use wiring

[Implemented first-use entries](phase42-first-use-wiring.md) now own desktop public-key import, the existing identity signer, original Authorization grant, both paired providers, native offer verification/signing and exact saved-record/host approval, plus public relay preparation/initialization. Five synthetic tests pass, including the complete four-response journey and actual CredentialsLocal fixture reopen; strict TypeScript covers155modules. Detached profile tests retain4replay/1original dispatch/23liveframes and default/noTTY refusal; detached public tools preserve existing output and refuse unattended initialization. API26 compiles the complete unsigned native project with INTERNET only. Chrome/SDK/loopback are distinct evidence; no real keys/provider/broker/current desktop/phone were activated, and Linux durability/TLS/ArkWeb/phone acceptance remain open.

## Phase46 signed debug package

[Signed HAP readiness](phase46-signed-hap.md) records a successful official Hvigor debug signing build and SDK26 signature verification, bundle/version/API/INTERNET-only metadata, and an extracted debug Profile with exactly one device matching the connected CMM-AL10/API26 phone. Existing DevEco-generated signing materials were reused with only the independent product binding added. The sealed unsigned HAP is unchanged. The target-only installed-bundle query returned a generic error and cannot prove absence; installation approval and conflict review remain pending. No phone app execution, HUKS ECE acceptance, E2E identity/provider activation, relay change or installed DSH modification occurred.

## Phase47 approved installation preflight

Installation and first opening were approved at2026-10-14T09:28:10Z with replacement and uninstall excluded. [Preflight evidence](phase47-installation-preflight.md) records default/user0/user100 target-only query failures, both host and remote exit0, unavailable structured `ohos-bm`, no target-filtered log result, and unchanged approved HAP hash. Official command help exposes no refusal-to-replace option, and OpenHarmony documentation/source defaults to replacement. The target's installed state remains unknown, so installation and UI opening were not attempted. A reliable absence check or verified official refusal-to-replace operation remains required.

## Phase48 actual signed-device opening

[Actual device report](phase48-first-device-opening.md) records the user's expanded approval allowing a possible in-place update, exact approved HAP hash/size verification, successful official installation, installed version0.0.0/code1, and successful EntryAbility launch on the CMM-AL10/API26. App-scoped unmerged native layout confirms a focused/visible pages/Index window with unpaired/disconnected/default-disabled first-use text. The same owned PID remains running through09:46:11Z and an accepted own-PID error/fatal query is empty. The composer/action row is clipped by native layout overflow and needs repair. ArkWeb rich rendering, HUKS identity creation, pairing, TLS/relay and phone-to-desktop execution remain unverified; none was initiated.

## Phase49 maintained native scroll candidate

[Scroll repair evidence and device matrix](phase49-native-scroll-repair.md) record one viewport-relative Scroll with intrinsic content, wrapped native buttons and keyboard RESIZE in the maintained page. Five official-ETS-parser regressions pass, including rejection of the old clipped page and preservation of17 locale-owned action callbacks/guards. Official SDK26 type checking/CompileArkTS and independent signed-HAP verification pass; only Index.ets changes in packaged public app sources, with the previous signed HAP/configuration preserved. The candidate has unchanged bundle/version/API/INTERNET-only permissions and a new signed hash. It is not installed or device-qualified; keyboard, narrow/landscape, long-content and rich-touch checks remain pending. The full file validator has existing historical evidence/link failures; those records are preserved and that gate is not claimed successful.

## Phase50 installed scroll and keyboard acceptance

[Actual phone results](phase50-device-scroll-acceptance.md) qualify the approved hash2673dc063fb62abf03c0c8d7659ed1c6886f339365a9b99a65abbf377f366d92 for portrait first-use page scrolling, complete bottom composer/actions,512-character local input,2623→1590px keyboard resize, keyboard-open composer/action reachability and2623px restoration. Synthetic drafts were verified empty afterward; no button or privileged operation was invoked. A retained ImsaKit listener-null message occurred during keyboard dismissal without observed app exit. Narrow/rotated/large-font layouts, multiline focus, long selected-session history and ArkWeb interaction remain unverified; identities, pairing and desktop execution remain inactive.

## Phase51 desktop implementation gaps

[Read-only source/test audit and bounded plan](phase51-desktop-storage-restart-audit.md) confirm plaintext privatePkcs8 in CredentialsLocal and an explicit Windows owner-only-check skip. Metadata from one existing synthetic fixture shows inherited Users read and AuthenticatedUsers Modify permissions; no real credential content or real-profile ACL was inspected. Durable admission/reconciliation and core cold Session services exist, while the field entry still creates a fresh world/Session/journal each time and lacks stable reopen. Existing tests establish in-process recovery components and synthetic credential reopen, not a two-process field task restart. Protected storage and recovery wiring remain engineering work; the audit reran no tests and changed no implementation, phone, credentials, ACL or service state.

## Phase52 protected desktop world

[Protected storage and recovery evidence](phase52-protected-world.md) covers actual Windows CurrentUser DPAPI on fixed public fixture keys,13 focused tests,eight independent-process crash/reopen cases,rich action continuation with A1+B3 responses,and the complete SDK-substitute/loopback/browser flow. Canonical durability precedes accepted receipts; uncertain claims are retained without re-dispatch. The /2 identity and enabled config plus /1 world marker have explicit persistence acknowledgements and a bilingual upgrade guide. A default-disabled detached .3 candidate is reviewable; no installed app,real identity,ACL,relay or phone was changed. In-flight/exhausted replay activation,real desktop integration and phone HUKS/TLS/ArkWeb acceptance remain outside this evidence.

## Phase53 original field interaction

[Sealed successor evidence](phase53-original-field-interaction.md) establishes default bindForm's random SDK actionId completing exactly once through canonical replay input, using the unchanged candidate HTML after process A is killed and process B reopens the same world. All final browser, detached and eight crash/reopen tests use identical .4 archive entries. Public maintenance .3 validates explicit endpoint limits before preparation, preview or initialization;10/30second issuer settings fit unchanged15/60second clients. Ordinary TTY/native confirmations may be operated by an agent after specific human authorization; their existing controls remain required. No real identity, grant, service, phone or installed app was activated or changed.

## normal-controls approved deployment

The [developer handoff](HANDOFF-2026-10-18.md) qualifies the original-certificate phone upgrade, original HUKS public identity retention, native scope-management control and desktop package installation. The bundle and temporary entries remain disabled; the current HAP also uses the default disabled connection configuration. Installed alpha.4 public services pass a separate synthetic isolation check. The user has stopped further development/deployment; no new grant, pair upload or relay change occurred. Phone-to-desktop execution, streaming and ArkWeb interaction remain unverified.
# 第56阶段：真机解析阶段拒绝

[本轮证据](phase56-native-parser-refusal.md)确认获批诊断版已原位安装、原HUKS/DPAPI身份复用成功；公开挑战和固定{}均记录parse-offer/SyntaxError，未到签名、grant或网络连接。根本原因仍未知。细分解析候选通过10项回归、9项输出/拒绝对比、严格TS、4项参数拒绝及官方API26 unsigned编译，未签名安装。隔离桌面和手机均退出，grant始终为0，中继状态不变。
# 第57阶段：共享原生SDK绑定修复

[本轮证据](phase57-native-util-binding.md)确认诊断版安装与原身份复用通过；真机在共享UTF-8编码处抛错，编译后的错误util模块绑定已确认。修复候选及实际产物检查通过，22项替身/单元、9项合成流程、9项新旧对比及官方API26编译通过；未安装修复版，真实闭环未通过。手机/隔离进程均关闭，grant始终0，中继原状。

## 离线连接候选（2026-10-18续接）

[离线连接候选](connection-candidate.md)按显式`--host/--alias/--api`完成一次官方API26 unsigned编译：[候选证据](../evidence/connection-candidate/2026-10-18T08-25-35-312Z-facc28ee.json)记录exit0、70个输入文件、5,219,694字节unsigned HAP（SHA-256 `8671f7fdfcba320739e15d2e0fc0309faa176137f5d2a2dbbaddf3bc1c7ded02`）；[官方构建报告](../evidence/native-build/2026-10-18T08-25-38-344Z.json)与[构建日志](../evidence/native-build/2026-10-18T08-25-38-344Z.log)保留。`--audit`已对该真实产物做只读复核并通过，未重新编译。

该候选不是已安装包：手机上的原证书HAP仍是历史默认禁用构建，未签装、未配对、未做真机API确认（`deviceApiConfirmed=false`）。审计现在重新计算保留候选的完整源输入集并与报告清单严格比较；源文件修改、删除和新增的拒绝测试只使用各自临时目录并在结束后清理。此处只建立离线编译与只读审计资格，不构成安装、现场或真实链路验收。

[当前连接候选签装入口](connection-deployment.md)的52项合成测试及只读plan经受控验证通过。随后在用户明确签装授权内确认原手机CMM-AL10/API26并签名一次；官方应用验签、原证书链与profile检查通过，Windows因脚本执行策略拒绝未签名的PowerShell载荷校验脚本，完整payload验证未完成。用户选择暂停；[唯一attempt](../evidence/connection-deployment/attempt.json)与签名输出保留，安装/启动/UI/本轮HUKS公开指纹核验均未执行，未改桌面或relay，未调用真实模型。不得重签或绕过执行策略；恢复前须由受信任的系统管理操作解决脚本执行权限，再只验证既有输出。

## rc.2 对齐（2026-10-22）

当前候选、针对性验证及现场阻塞统一见[rc.2 手机桌面插件对齐](rc2-alignment.md)。源码与打包入口验证通过不等于部署或真机验收；旧授权不复用。

Harmony 命令结果显示修复的当前状态、独立版本证据和人工验收边界见 [rc.2 对齐记录](rc2-alignment.md#2026-10-23-命令结果显示修复)。

## 公开配对维护准备（2026-10-24）

公开登记与显式撤销工具已独立打包，Windows 和 Linux 定向测试均为 9/9，Linux 使用真实文件及目录 fsync；过期固定公开样本的 TTY 撤销、严格重读及原服务器库兼容性验证通过。单目录临时写权限已安装、自检并撤回，最终服务停止、原启动配置与只读权限恢复，真实配对日志未创建；独立测试配置保持禁用。完整证据及回执采集限制见[维护准备记录](../evidence/public-maintenance-preparation-20261024.json)。本轮未创建 grant、未开启授权窗口、未读取凭据库、未生成身份或调用模型；真实配对、连接和功能验收仍待当前会话 status 与手机前台复核后进行。

## 2026-10-24 设备绑定源码阶段

结果显示过滤按字段位置接受 enrollment ticket；`stop` 可取消未确认挑战，授权结果不明或持久撤销失败仍拒绝清理。显示源构建 9/9、严格客户端类型检查通过；命令及授权隔离测试 10/10，原记录见 `D:/Temp/harmony-binding-tests-4Weemp/report-v3.json`。

新增设备绑定协议、桌面生命周期、原手机签名客户端和原生会话状态核心。持久策略仅允许 desktop profile 的动态可见会话；短票据绑定原加密通道对象，逐请求及结果交付前重新验证撤销、到期和当前可见性。旧单会话记录不解析为设备登记。固定密钥/模拟存储及通道测试 15/15，四个新核心模块严格类型检查零诊断；Node 与无外部运行时依赖的中立 JS 构建通过。可复验入口为 `node scripts/check-device-binding.mjs`，本轮证据为 [核心资格记录](../evidence/device-binding-core-1792812714703.json)。

这些核心尚未接入正常 CLI、既有 WSS/relay carrier 或 ETS 页面，不能据此声称设备级产品完成或真机可用。设备级持久存储及真实 SessionController/Gateway 适配已应用；[真实服务阶段证据](../evidence/device-binding-real-services-20261024-stage.json)记录 3 项隔离测试通过。profile 适配草稿已修正官方 title projection 与 Peer disposal 用法后接入，不再是未应用草稿。桌面新 carrier、手机加密桥、按视图相关的 RPC 和复用原 MobileProduct/PhoneCore/rich owner 的适配已写入，六个集成模块严格类型检查零诊断；加密 carrier 全链路测试、正常命令入口、ETS 委派与完整候选仍待完成。`D:/Temp/harmony-native-device-product-20261024.ts` 为未应用的 native facade 草稿，未通过集成验证。未生成新版可安装插件或 HAP，未安装、启动 relay、访问真实身份库、创建真实绑定/grant/票据或调用模型；当前安装保持 rc2.4。

## Device binding candidate closeout (2026-10-24)

The source-only stage is now superseded by the [rc2.5 candidate reference](device-binding-rc2.5.md) and [exact artifact/evidence manifest](../evidence/device-binding-candidates-rc2.5.json). Device integration 6/6, affected legacy controls 6/6, protocol lifecycle 15/15, packaged feedback 10/10, strict type diagnostics 0, packaged rc.2 public API and official unsigned SDK compile passed. The independent candidates remain uninstalled; persistent device access, original signing material, real relay/WSS/ArkWeb and model task acceptance remain pending explicit approval and physical validation. Manual finite-ticket reconnect and the prior SSH access blocker are documented.

## rc2.5 approved in-place installation (2026-10-24)

Both rc2.5 packages are installed. Original signing verification/payload comparison passed; desktop 88-file integrity, unrelated dependencies/configuration and phone bundle/UID preservation are confirmed. Both apps remain stopped under the no-restricted-vault-read/no-authorization-restoration boundary. Public phone archive readback failed with no retained detailed error and was not retried; direct on-device hash remains unverified. No new identity, binding/grant/ticket, relay/SSH action or model call. See the [installation receipt](../evidence/device-binding-installation-rc2.5.json) and [precise limits](device-binding-rc2.5.md#approved-installation-follow-up-2026-10-24-0539-utc).

## Offline connection recovery candidate (2026-10-24)

See the [rc2.6 recovery reference](connection-recovery-rc2.6.md) for the current source behavior and exact qualification limits. Targeted regressions 21/21, integration 7/7, strict types and official API26 SDK compilation pass. All transport tests are loopback/replay or SDK-substituted; native HUKS/ArkWeb, actual relay interoperability and phone reconnect are not accepted by these results. Existing installation and pairing are unchanged; no live test window was opened.

## Retained-route feasibility review (2026-10-24)

The [current-source feasibility review](connection-feasibility-rc2.6.md) qualifies 18 Origin admission and 10 public-state tests, including durable refusal of stale or higher active epochs after revocation. Actual connection remains blocked by legacy Origin handling and the missing independent relay-route lifecycle. Two successive windows preserving the same persistent device binding, old-route replay refusal and physical NetworkKit headers remain unaccepted. The sealed rc2.6 artifacts are partial repairs, not a ready live-connection release.

## rc2.7 independent route qualification (2026-10-24)

The [final offline manifest](../evidence/device-route-candidates-rc2.7.json) records four version-matched candidates, all source/dependency hashes and preserved old archive hashes. The [portable reference](device-route-rc2.7.md) specifies the original binding epoch1, retained revoked epoch2 legacy anchor, new dual-signed route journal, exact networkkit-v1 admission boundary, explicit cleanup and rollback without authority restoration.

Passed on current source: integration 11/11, binding/ticket lifecycle 15/15, selected Origin admission 18 and legacy public revocation 10, ordinary controls 5/5, packaged feedback 11/11, packaged public API, zero strict type diagnostics and official API26 SDK compilation. The absolute room expiry regression fails before the issuer cap and passes after it; three consecutive focused encrypted loopback runs also passed. Detached archived relay/tools import and disabled startup, strict public proposal preparation, exclusive output preservation, no-TTY initialization refusal, and nine exact admission cases passed. No room was issued by the detached smoke. The SDK cleanup syntax adjustment retains both transport/storage failure reporting; original compile failure and repaired build receipts remain preserved.

These results qualify source, archive contents and host/SDK-substituted behavior. They do not qualify a signed or installed rc2.7, actual NetworkKit Origin, native key lifecycle, ArkWeb form return, public relay interoperability, Linux durability or daily operation. No current remote service was inspected and no live connection/authorization window was opened. Physical acceptance and the separately approved deployment/cleanup steps remain mandatory before declaring basic mobile control usable.

## rc2.7 approved in-place update completed (2026-10-24)

Both original endpoints are now rc2.7. The [installation and passive startup receipt](../evidence/device-route-installation-rc2.7-complete.json) records original-material official signature/profile verification, exact 23-entry application payload parity, phone UID20020297 preservation, official desktop CLI exit0 and 93 matching installed files. Other manifest/lock entries and runtime/isolation/supply-chain configuration remain unchanged; the Host descriptor and rich-inline remain rc.2.

After a verified complete desktop exit, the normal fresh app showed rc2.7 in its plugin detail, the new route command hint and an actually executed public `harmony-device status` result of desktop/bound. The actual phone showed paired/disconnected with connection/send controls disabled. No re-enrollment, route, ticket, relay operation, model call or private-state export was performed. The earlier screen-lock/window-readiness blockers are resolved. Physical relay/NetworkKit/ArkWeb/control acceptance is still pending separate migration and finite-window approval; no remote status was rechecked in this update.

## rc2.9 desktop diagnostic qualification

The independent rc2.9 desktop candidate adds safe connection phases and fixed journal/link categories, preserving the first exception when ordered cleanup also fails. Qualification uses isolated Host services and fixed identities only: device integration 19/19, shared legacy entry 6/6, controls 5/5, feedback source/package 11/11 each, strict types and five packaged public API entries pass. Real connection acceptance remains blocked by the previously unclassified activation error; public service logs show normal start/stop without a handshake diagnostic. No installed package, live recovery configuration, device binding, relay history or public connection window changes in this source qualification.

### 2026-10-25 rc2.10 admission lifecycle qualification

Read-only inspection of the actual admission domain found 226 bytes, v1 ready, matching original desktop and desktop profile, zero admission rows, and unchanged SHA256 43bcf279ae80b672787d729b1582ca9370c8a5183feb62c285ac726ce7378504. Official unit parsing and strict domain header/row validation passed without opening a writer. The live file and real binding remain unchanged. New isolated regressions first failed on the old implementation; results and final candidate hashes are retained with the rc2.10 qualification evidence. This phase does not install or verify physical connectivity.

rc2.10 final offline result: device integration 23/23, shared legacy 6/6, controls 5/5, feedback source/package 11/11 each, strict types zero diagnostics, and all five packaged installed-Host public API entries passed. The same current command regression fails on the backed-up rc2.9 sources with journal-open/journal-already-exists, then passes on the repair. The independent desktop archive is `D:/Temp/dsh-experimental-harmony-mobile-0.0.0-rc2.10.tgz`, SHA256 `360e03c9cf202c5c001384feb8b0e1f9c25f106126d30133fd0ac29074b6ce65`; complete evidence is `evidence/admission-lifecycle-rc2.10.json`. Phone/relay rc2.7 need no protocol update. No installation or new live test was performed.

### 2026-10-25 rc2.11 phone connection diagnostics (offline only)

Phone diagnostics now use closed stage/category codes for original identity reads, route validation, native channel acquisition, control/E2E handshake, tickets and the first catalogue. Actual NativePorts forward allowlisted content-free facts; earlier failure evidence survives cleanup errors. Uncertain cleanup remains fail-closed. Exceptions, causes, keys, credentials, tickets and protocol payloads never enter the diagnostic UI. Existing identity/signature, host consent, scope, expiry and revocation checks remain in force.

Qualification: isolated fault regressions 17/17 including actual ETS owners with fixed-key SDK substitutes; device integration 23/23 with synthetic Sessions/loopback; lifecycle 15/15; page permission/layout 9/9; strict types zero diagnostics; official API26 compile and native import audit pass. A memory overlay of the backed-up shared sources fails 12 new diagnostic assertions, demonstrating missing diagnostics/error masking rather than the live connection cause. Two initial SDK builds rejected the catch syntax; the final supported Error cast preserves the exception and compiles. The unsigned HAP contains 23 unique CRC-checked entries and only the existing INTERNET permission.

Candidate: `D:/Temp/dsh-harmony-mobile-0.0.0-rc2.11-device-diagnostics-unsigned.hap`, SHA256 `b67ccee1029da27a75e8e67a1be129dca14dc353fb497ba063a5027021a2b189`. Full evidence: [phone-diagnostics-rc2.11.json](../evidence/phone-diagnostics-rc2.11.json). No signing, installation, public network test, relay access or actual identity/binding/log/permission change occurred. Desktop rc2.10 and relay rc2.7 need no protocol change. Physical HUKS/NetworkKit, displayed diagnostics and connectivity remain unverified.

Earlier test cleanup is still incomplete locally: the route was durably revoked and remote service/permissions restored, but desktop `harmony-device stop` awaits foreground recovery. No activation/input retry occurred during this offline work. Do not describe the earlier test as fully cleaned locally or connectivity as fixed.

### 2026-10-26 rc2.11 phone in-place deployment

Original-material official signing, verify-app, verify-profile, original certificate-chain pin and exact 23-entry application payload parity passed. Signed archive `D:/Temp/dsh-harmony-mobile-0.0.0-rc2.11-device-signed.hap`, SHA256 `12124fa41986e5baa8989a9bb9b6c500f85b5c926d1380735ea90d09837e6341`. The original phone was CMM-AL10/API26; official HDC replace install updated rc2.7 to rc2.11 with UID20020297 unchanged. No uninstall, data clear, new permission, new identity or pairing action occurred. Existing HDC was normally started at its original loopback address using unchanged existing key-file metadata; no trust/key reset or new trust acceptance occurred.

Normal app startup and two fresh owned-layout observations in one process/window show paired/disconnected, with connect/send disabled. This confirms public paired state survived the update; private binding storage and the installed HAP were not read back. No desktop, relay, route/ticket or model operation was performed. Earlier local stop was separately confirmed by the user before this deployment; it was not replayed. Full [installation evidence](../evidence/phone-diagnostics-installation-rc2.11.json) and [passive phone evidence](../evidence/device-binding-passive-phone-rc2.11.json) are retained. Physical network/basic-control and actual failure-diagnostic display remain unverified; signing/install success is not a connectivity fix.

## rc2.12 lifecycle candidate

Offline lifecycle qualification separates explicit local stop, ticket expiry and unexpected established-channel loss. First protocol failure survives teardown; only resource-release failures set cleanup-failed. Desktop status observes the mounted carrier's terminal state. The read-only connection observation helper waits for a real terminal state and reports an inconclusive observation timeout separately. This candidate does not establish the physical disconnect cause and has not been installed or tested on the public relay. Existing device binding and authorization history remain unchanged.

## Local log self-check

The [local-only diagnostic probe](local-log-selfcheck-rc2.15.md) has matching native/page regressions, strict types, official compilation and original-certificate signed payload checks. Original-phone in-place installation and paired/disconnected startup verification passed. The single approved no-network probe now has physical output-to-filtered-collection proof: exactly one fixed record from the same App PID, the page acknowledgement, and an exited owned reader. Pairing and public storage-size metadata are unchanged. Earlier empty isolated-client checks are superseded as host USB evidence. Real control-handshake and network functionality remain unverified.

## rc2.33 history capacity candidate

History/queue checks, native diagnostics, current-source types, normal-profile ESM output and the official API26 unsigned build pass. The candidate raises history to 4 MiB with coordinated transport budgets and canonical-window fallback. The coordinated desktop and local emulator deployment reopened the old “MVP体验” history with rich content and returned to another Session without a cleanup error. Physical-phone history, memory/latency and the original phone cleanup report remain pending; the physical phone and public relay were not changed. See [capacity and verification](history-capacity-rc2.33.md).

> 桌面手机控制入口（2026-11-02）：已整合并安装到桌面 rc2.33，输入框上方常驻面板已实际移除，入口位于“设置 → 内置插件 → 手机连接”。需要确认的操作关闭设置并保留正常确认界面。25 项面板、16 项浏览器及完整 Web 设置外壳通过；安装版 Windows 设置页因本轮窗口输入未完成导航，尚未逐项点击验收。见[统一安装与验证](../evidence/mobile-coordinated-20261102.json)。原真机配对和数据未修改。
