> 当前真机和桌面部署、现场结果与待验边界见[日常部署与真机边界](workspace-review.md#当前日常部署与真机边界)。

- [x] 原生聊天历史分页异常修复已随 rc2.92 原位安装，原配对真机越过原失败页。[验证边界](acceptance.md)
- [x] 桌面启用按轮分页，rc2.95 真机核对在线传输、缓存命中、断线重开简报及离线翻页。[部署与真机结果](../evidence/history-pagination-rc295-field.json)
- [ ] 真机核对离线冷启动和加载时延。

- [x] 双端原位更新 rc2.48 及配套 Harmony 包，复验原配对、原生聊天及新建页任务类型、主模型和思考强度。取消新建，手机正常退出并归还用户。[现场收据](../evidence/workspace-phone-rc248-closeout.json)
- [x] 保留加密通道的工作区授权拒绝类别，原生显示授权指引并保留草稿。rc2.49 通过加密对照、实际模拟器拒绝和授权整轮，封存手机未签名包及桌面归档。[双端候选与对照](../evidence/workspace-grant-rc249-validation.json)
- [x] 用 API 26 模拟器的 NetworkKit WSS 补测证书拒绝、TLS 1.3、控制文本和 512 KiB 二进制往返。验证实际 Origin 格式，恢复原测试包并清理转发。[WSS 原生对照](../evidence/workspace-native-wss-proof/validation.json)
- [x] 用同一原生 WSS 连接完成签名握手、选模回放、标准 Web 和 DevFlow 面板往返。校验旧 HTTP 帧入口拒绝、两次返回草稿恢复、测试包还原及两条转发清理。[联合验收](../evidence/workspace-native-wss-full-proof/validation.json)
- [x] 用原生 WSS 和封存 Rich 包验收表单回执、未决动作查询、草稿恢复和前后台切换。核对四条固定回放、真实模型调用为零、两条转发清理及原测试包恢复。[Rich 原生 WSS 验收](../evidence/workspace-native-wss-rich-proof/validation.json)
- [x] 用原生 WSS 验收无手机适配的官方翻译插件。通过标准面板保存并恢复目标语言，在会话内切换译文和原文，逐文件核对安装版三个包的 33 个文件。[官方原包验收](../evidence/workspace-native-wss-official-proof/validation.json)
- [x] 用原生 WSS 验收标准 DevFlow 的配置保存、面板重开和只读委派。Host 核对父任务继续使用 `main`，子任务请求和持久化记录均为 `worker/high`。[DevFlow 原生 WSS 验收](../evidence/workspace-native-wss-devflow-proof/validation.json)
- [x] 核对已装 rc2.48 对应封存件与 rc2.49 双端候选，修正现场采集漏掉的授权错误。用实际模拟器日志和四条伪造对照验证采集规则，旧版安装保护与载荷检查继续通过。[现场离线预检](../evidence/workspace-field-rc249-preflight.json)
- [x] 在独立桌面 profile 预演 rc2.48 与 rc2.49 同名、同版本 Harmony 归档的离线升级、回退和再升级。逐次核对三包 812 个文件，回退恢复原锁文件，配置及合成数据一致。[桌面切换预演](../evidence/workspace-plugin-install-1793878902760.json)
- [x] 为 rc2.49 候选接入封存摘要、原签名材料和原位升级校验。离线签名前检查拒绝错包，假设备覆盖 19 项安装前拒绝及五项载荷校验。[签装保护预检](../evidence/workspace-field-rc249-install-validation.json)
- [x] 在真机 rc2.48 确认限时授权、标准 Web 启动和现有 Rich 内容展示。返回时记录加密关闭失败，结束后桌面确认授权已关闭。[现场结果](../evidence/workspace-phone-rc248-granted-closeout.json)
- [x] 修复旧连接的 Host 关闭失败阻塞新连接重开。同一连接或原生渲染器清理失败仍拒绝。28 项源码测试、API 26 构建及独立模拟器重开检查通过。[rc2.51 验证](../evidence/workspace-close-recovery-rc251-validation.json)
- [x] 将原生消息端口关闭失败纳入重开阻断。两种故障路径完成 SDK 替身回归，API 26 实际 ArkWeb 合成重连复测通过，封存未签名产品包。[rc2.52 回归证据](../evidence/workspace-rc252-native-port-close-validation.json)
- [x] 用封存的 rc2.51 产品包预演从 rc2.48 原位升级。签名前检查拒绝错包，假设备覆盖 19 项安装前拒绝和五项载荷校验。[rc2.51 签装预检](../evidence/workspace-field-rc251-install-validation.json)
- [x] 核对 rc2.52 产品 HAP 的包名、版本和封存摘要。签名前检查拒绝旧产品包和独立模拟器包，假设备覆盖原位安装、19 项拒绝及五项载荷校验。[rc2.52 签装预检](../evidence/workspace-field-rc252-install-validation.json)
- [x] 用 rc2.52 工作区核心和修复撤销时序的桌面归档复测原生新建、选模、标准 Web、DevFlow 直达与草稿往返。九项原生模拟器检查通过。[rc2.52 配套验收](../evidence/workspace-native-wss-rc252-revocation-creation-validation.json)
- [x] 用同一双端候选复测 DevFlow 配置持久化、Rich 动作与来宾隔离、官方翻译原包。两轮共 22 项原生模拟器检查通过。[DevFlow 整轮](../evidence/workspace-native-wss-rc252-revocation-devflow-validation.json) · [Rich 与官方原包](../evidence/workspace-native-wss-rc252-revocation-rich-validation.json)
- [x] 在回环加密数据通道注入工作区关闭回执丢失。核对旧凭证失效、新绑定重新授权、标准接口恢复和旧资源句柄拒绝。[授权集成对照](../evidence/workspace-access-1793895515932.json)
- [x] 在同一路径验证 Rich 断线后重新授权、草稿和未确认动作恢复，以及相同动作 ID 的幂等回执。[Rich 断线恢复](../evidence/workspace-access-1794009624957.json)
- [x] 在关闭请求加密期间断开回环数据通道，复现 `encrypted-failure` 并确认没有发出关闭帧。核对 rc2.48 与 rc2.52 的封存加密输入及诊断映射。[发送阶段对照](../evidence/workspace-close-encryption-diagnostic-validation.json)
- [x] 验证 rc2.51 工作区核心可复用与现场同版的桌面归档。[rc2.51 配套验收](acceptance.md)
- [x] 为下一次关闭失败复测预检工作区与加密通道的同进程诊断采集。[现场诊断预检](acceptance.md)
- [x] 修复撤销授权后仍可交付已准备工作区响应的间隔，完成离线回归和标准桌面包封存。[桌面授权撤销回归](acceptance.md)
- [x] 用两份封存桌面包做撤销时序对照，核对旧包可复现及新包拒绝。[归档撤销对照](acceptance.md)
- [x] 用封存的新桌面包与 rc2.51 工作区核心通过原生模拟器 DevFlow 配套验收。[双端配套验收](acceptance.md)
- [x] 用同一双端候选补齐 Rich 动作、草稿和隔离，以及官方翻译原包的原生模拟器验收。[Rich 与官方原包](acceptance.md)
- [x] 用同一双端候选验收原生新建的类型、主模型和思考强度，以及标准 Web 和 DevFlow 往返。[原生新建与面板往返](acceptance.md)
- [x] 在独立 profile 验证只切换 Harmony 的清单、锁文件及冻结安装回退，现场更新仍需授权。[冻结锁预检](acceptance.md)
- [x] 真机原位安装 rc2.52，原证书及 25 个载荷文件通过校验，UID 保留且设备页显示已配对。手机正常退出后归还。[rc2.52 现场记录](../evidence/workspace-phone-rc252-field-20261106.json)
- [x] 中继恢复后，用已安装 rc2.52 核对原配对、双 WebSocket 升级、加密握手及原生列表。[恢复后真机记录](../evidence/workspace-phone-rc252-relay-restored-field-20261106.json)
- [x] 复现旧后台清理晚于前台恢复，修复 Ability 事件顺序。rc2.53 通过 API 26 构建和同进程 ArkWeb 往返，原测试包已恢复。[生命周期验证](../evidence/workspace-rc253-foreground-validation.json)
- [x] 封存未签名 rc2.53，验证仅接受指定 HAP 和已配对 rc2.52 的原位升级，旧 rc2.52 安装保护回归通过。[签装预检](../evidence/workspace-field-rc253-install-preflight.json)
- [x] 日常桌面更新配套 Harmony 归档并重启，手机保留原 UID 原位升到 rc2.53，原配对可读取原生会话。[rc2.53 现场记录](../evidence/workspace-phone-rc253-field-20261106.json)
- [x] 在同一隔离用例验证加密重连、重新授权后重开标准 Web，并按包名打开原包 DevFlow 读取设置。Chromium 使用与 rc2.53 相同的文档启动脚本。[组合验证](../evidence/workspace-access-devflow-1793940407257.json)
- [x] 用已装 rc2.53 双端完成真机标准 Web 打开、关闭、前后台重连、重新授权和重开。原生入口按包名直达 DevFlow，多模型工具箱显示现用编排、预设、模型和思考强度。验收后桌面授权关闭，手机已归还。[rc2.53 真机复验](../evidence/workspace-phone-rc253-regrant-devflow-20261106.json)
- [x] 在隔离 Host 复现配对有效但面板无法连接。丢失连接回执后，面板仍锁定变更。成功停止、查询配对状态后恢复原连接，配对和身份字节一致。[命令回归](../evidence/device-integration-1793942299944.json) · [构建面板](../evidence/control-panel-0.0.0-rc2.35-1793942336041.json)
- [x] 阻止停止后的旧确认创建工作区授权。隔离回归覆盖停止连接、停止工作区、授权过程中暂停绑定读取，以及随后重新确认。[工作区命令回归](../evidence/workspace-device-command-1793943084710.json)
- [x] 用 rc2.53 配套桌面归档封存恢复候选，核对 12 项文件变化。在临时 profile 完成升级、回退、再升级和离线冻结重装，逐项核对三包与合成数据。[封存候选](../evidence/workspace-desktop-panel-recovery-candidate.json) · [离线预演](../evidence/workspace-plugin-install-1793943673753.json)
- [x] 用封存桌面恢复候选与 rc2.53 工作区核心复测原生新建、选模、标准 Web、DevFlow 保存与委派、Rich 动作和官方翻译原包。API 26 独立模拟器三轮共 31 项检查通过，原测试包已恢复。[rc2.53 配套验收](../evidence/workspace-native-wss-panel-recovery-validation.json)
- [x] 用两份封存归档的实际路径核对 Harmony 专用冻结锁。隔离 profile 通过中断拒绝、原状态恢复、冻结升级与回退。跨盘路径用合成锁验证。[冻结切换预检](../evidence/workspace-desktop-panel-recovery-frozen-preflight.json)
- [x] 修复工作区确认取消后桌面面板一直锁定。封存包的标准 Web 设置页通过原配对重连、工作区停止后重新授权及保留连接；隔离冻结升级、回退和中断恢复通过。[设置页回归](../evidence/control-panel-shell-recovery-1793947512600.json) · [冻结切换预检](../evidence/workspace-desktop-panel-recovery-workspace-stop-frozen-preflight.json)
- [x] 用工作区停止修复包和 rc2.53 工作区核心复验原生新建、标准 Web、DevFlow、Rich 和官方翻译原包。API 26 模拟器三轮共 31 项通过，按轮核对桌面归档、Host 与客户端入口摘要，恢复原测试包并清理转发及测试私钥。[修复包模拟器验收](../evidence/workspace-native-wss-panel-recovery-workspace-stop-validation.json)
- [x] 在隔离 profile 用绝对归档路径验证完整包元数据前置条件、冻结升级和安装后文件校验失败的回退。镜像关闭后执行离线升级与回退，原清单、锁和三包逐文件恢复。[绝对路径锁与回退](../evidence/workspace-desktop-panel-recovery-workspace-stop-absolute-lock.json)
- [x] 经授权备份日常桌面，保留已安装依赖并仅切换 Harmony 归档与对应锁记录。离线冻结校验、三包 812 个文件校验及重启后入口核对通过。设置页停止后从原配对恢复「连接」，Host 返回 `transport-started`。[桌面安装与重连](../evidence/workspace-desktop-field-workspace-stop-reconnect.json)
- [x] 用现有 rc2.53 真机和原配对确认桌面修复包的加密握手、原生聊天及限时授权。[真机工作区复验](../evidence/workspace-phone-rc253-workspace-stop-field-20261106.json)
- [x] 构建桌面可选工作区诊断。隔离回环区分结果就绪、等待加密、套接字发送调用返回及撤销后拒绝，并验证从 stdout 采集脱敏记录。[诊断包](../evidence/workspace-desktop-trace-stdout-candidate.json)
- [x] 在复制的安装版 Host 中运行封存诊断包。实际 stdout 区分拒绝与超时取消，标准 Web 资源和 DevFlow 配置在关闭重开后可读。[隔离复验](../evidence/workspace-installed-workspace-trace-1793955235034-probe-cg6Gqh.json)
- [x] 采集一次真机工作区打开的双端日志。Host 已将全部 13 个响应交给套接字，手机同一进程记录数据通道关闭后重新握手。[真机双端记录](../evidence/workspace-phone-rc253-field-stdout-bgerqie3.json)
- [x] 在隔离中继区分套接字断开、资源上限和房间到期等关闭原因，封存默认关闭的脱敏诊断。用实际 WebSocket 接收器验证同一条合成消息在不同读取和分帧条件下的结果。[中继构建预检](../evidence/workspace-relay-room-diagnostic-build-1793957088876.json) · [分段对照](../evidence/workspace-relay-receiver-parts-1793957086746.json)
- [x] 在本机 Ubuntu 演练原始 rc2.30、诊断候选和回退，验证已撤销配对仍被拒绝，锁能正常释放，状态文件摘要一致。[回退演练](../evidence/workspace-relay-room-diagnostic-rollback.json)
- [x] 桌面 WSS 数据发送接入续帧，保留整条消息大小和队列预算。正式发送函数通过 4 KiB 加密回环，封存桌面候选。[候选加密对照](../evidence/workspace-relay-parts-encrypted-1793959014788.json) · [候选归档](../evidence/workspace-desktop-wss-fragments-candidate.json)
- [x] 用封存续帧候选在隔离安装版 Host 复验标准 Web 资源、工作区重开、DevFlow 配置读回与只读委派。[隔离 Host 复验](../evidence/workspace-installed-wss-fragments-workspace-trace-1793959637323-probe-azZjk7.json)
- [x] 用封存旧包和续帧候选进行 TLS 1.3 回环对照。在 4 KiB 读入条件下重现旧包断线并确认新包完整送达同一条消息。[封存归档 TLS 对照](../evidence/workspace-packaged-wss-tls-1793960825145.json)
- [x] 用封存旧包和续帧候选在私有桌面 profile 验证升级、回退、再升级与按锁离线重装，核对三包 812 个文件和合成数据。[离线安装与回退](../evidence/workspace-plugin-install-wss-fragments-1793961006540.json)
- [x] 按授权更新日常桌面 Harmony 并重开，用原配对 rc2.53 确认加密握手、原生聊天和限时授权。标准 Web 未在时限内渲染，手机记录两条超时。手机已归还，授权已关闭。[真机收尾](../evidence/workspace-phone-rc253-wss-fragments-field-closeout.json)
- [x] 用封存续帧归档复验 API 26 独立模拟器。标准 Web、DevFlow 配置保存和重开、只读委派及关闭通过，七项检查均通过。原验收应用已恢复，回环转发和测试证书私钥已清理。[模拟器复验](../evidence/workspace-native-wss-fragments-validation.json)
- [x] 补齐没有断线或重连记录时的启动超时对照，按一次点击窗口提取原生超时、Host 启动请求阶段和中继关闭候选。历史 Host 日志及合成输入通过 11 项对照。[启动超时预检](../evidence/workspace-startup-timeout-correlation-preflight.json)
- [x] 修复 Host 验票期间已取消的工作区关闭仍会执行的问题。隔离加密回环确认原资源句柄仍可读，并通过正常关闭、断线重连和重新授权回归。[回环回归](../evidence/workspace-access-1793980653789.json)
- [x] 用封存关闭取消候选复验隔离安装版 Host，确认工作区关闭重开和 DevFlow 配置读回。独立 profile 的离线升级、回退和按锁重装通过。[隔离 Host](../evidence/workspace-installed-workspace-trace-1793981118023-probe-3BWfUP.json) · [离线安装与回退](../evidence/workspace-plugin-install-close-cancellation-1793981127308.json)
- [x] 用同一桌面候选与独立封存中继完成四条 TLS 1.3 回环连接，验证大启动正文、关闭取消、重开和 DevFlow 配置读回。[独立中继对照](../evidence/workspace-installed-workspace-trace-1793984782240-probe-sJ5hVq.json)
- [x] 只读核对日常桌面现有包，使用当前锁文件的私有副本演练关闭取消候选的冻结升级与回退，并核对临时诊断开关的字节还原。[现场预检](../evidence/workspace-desktop-close-cancellation-field-preflight.json)
- [x] 演练关闭取消候选的现场切换流程，验证收据写入失败时完整回退，并验证正常恢复诊断配置及拒绝覆盖后来编辑。[切换演练](../evidence/workspace-desktop-close-cancellation-cutover-rehearsal-verified.json)
- [x] 将新候选的真机打开、返回和 DevFlow 直达与 Host 采集收据关联。用合成输入验证超时留证、进程更换拒绝、日志不可用和只读面板，共 13 项。[采集工具预检](../evidence/workspace-phone-close-cancellation-capture-preflight-verified.json)
- [x] 补齐真机整轮采集的重连、授权前拒绝和授权后重开。核对同一桌面采集的握手记录和手机同进程的新通道日志，35 项离线对照通过。[整轮采集预检](../evidence/workspace-phone-close-cancellation-lifecycle-preflight-20261107.json)
- [x] 将原真机 USB 预检移到限时授权前。替身 CLI 覆盖原机离线但模拟器在线、其他 USB 设备在线、目标歧义及 HDC 失败，设备操作入口再次核对。[USB 预检](../evidence/workspace-phone-usb-preflight-20261107.json)
- [x] 用同一关闭取消候选与 rc2.53 原生核心完成 API 26 模拟器新建选模、标准 Web 往返和按包名直达 DevFlow。九项通过，原验收包已恢复。[模拟器复验](../evidence/workspace-native-wss-close-cancellation-creation-validation.json)
- [x] 将 API 26 模拟器和封存桌面包接入同一独立封存中继，经四条 TLS 1.3 回环连接复验新建选模、标准 Web 和 DevFlow 直达。九项通过。[原生与独立中继验收](../evidence/workspace-native-wss-close-cancellation-standalone-validation.json)
- [x] 用同一组合关闭标准 Web，在同一原生进程停止连接并重连，确认授权前拒绝、授权后重开同一会话及 DevFlow 直达。12 项通过。[重连与重新授权验收](../evidence/workspace-native-wss-close-cancellation-standalone-regrant-final-validation.json)
- [x] 在 API 26 模拟器与独立 WSS 中继叠加 313 个磁盘会话和双向各 680 毫秒延迟。记录 300 秒租约边界的前台重开失败，隔离 540 秒对照 12 项通过。[慢链路及租约对照](../evidence/workspace-native-wss-close-cancellation-standalone-disk-latency-extended-lease-validation.json)
- [x] 合并同一工作区等待的会话目录扫描。回归确认后到请求读取新建会话，隔离加密重连和 DevFlow 直达通过，桌面候选已封存。[目录读取回归](../evidence/workspace-access-1794012230789.json) · [桌面归档](../evidence/workspace-desktop-scope-batching-candidate.json)
- [x] 用目录读取候选复跑 313 个磁盘会话和独立 WSS 慢链路。12 项通过，累计扫描耗时下降，单轮首开时间和扫描次数均未下降，候选继续留在隔离环境。[慢链路指标对照](../evidence/workspace-scope-batching-slow-link-compare-20261107.json)
- [x] 在 DevFlow 面板仍打开时从桌面撤销授权，验收界面禁用读写、原生草稿保留和原连接重新授权。加密回环另证实直接发出的标准读写请求被拒绝。[原生复验](../evidence/workspace-native-wss-close-cancellation-standalone-workspace-revoked-regrant-validation.json) · [请求对照](../evidence/workspace-access-devflow-1794007739387.json)
- [x] 在重连与重新授权场景补验缺失包名回到标准插件列表、关闭后恢复草稿，以及随后按有效包名直达 DevFlow。13 项通过。[缺失包复验](../evidence/workspace-native-wss-close-cancellation-standalone-regrant-missing-panel-validation.json)
- [x] 在隔离浏览器与原生缓存 SDK 替身中验证停用、客户端构建更新、临时 profile 移除插件后的清单更新及缓存淘汰。[资源换代复验](../evidence/workspace-graph-1793992745942.json)
- [x] 用同一候选完成官方翻译原包、Rich 和 DevFlow 配置整轮模拟器复验。修正驱动的输入状态等待后，22 项通过，原验收包已恢复。[插件模拟器复验](../evidence/workspace-native-wss-close-cancellation-plugins-validation.json)
- [x] 用独立封存中继和 API 26 模拟器复验 DevFlow、官方翻译原包和 Rich，共 22 项。中继夹具读入仓库示例控制帧上限，驱动确认关闭后再重开。[独立中继插件复验](../evidence/workspace-native-wss-close-cancellation-standalone-plugins-validation.json)
- [x] 核对封存桌面候选、rc2.53 签装记录、三轮独立中继结果和现场工具摘要，确认错包、错中继、缺失重开及日常 profile 参与均不能计作隔离通过。[交付预检](../evidence/workspace-close-cancellation-readiness-20261106T184730040656Z.json)
- [x] 逐项核对封存桌面归档、运行入口及当前源码，以及 rc2.53 原生编译输入、生成包与当前源码。复核脚本可在现场切换前离线重跑。[源码复核](../evidence/workspace-close-cancellation-current-sources-20261107.json)
- [x] 用封存桌面包和独立中继验证标准插件路由权限。设备加密请求保留 404／403 结构化拒绝，两个合成 owner 处理器均未执行，标准 DevFlow RPC 随后仍可用。[加密路由对照](../evidence/workspace-installed-workspace-trace-1793991172381-probe-b4VKer.json)
- [x] 从 Chromium 的实际工作区文档验证两类受限路由的状态、事件和零处理器执行，并在同一页面保存官方翻译设置。[Chromium 路由权限对照](../evidence/workspace-prototype-1794086330988.json)
- [x] 用安装版副本的标准 Gateway 验证 DevFlow 对 A/B 两个合成项目的目标过滤、授权前读写拒绝及授权后配置隔离。[A/B 权限对照](../evidence/workspace-installed-composition-1793993315370-probe-AX9P1t.json)
- [x] 用封存桌面包和独立中继复验 DevFlow 实际工作区授权。新增可见项目的设置保存和重开读回通过，子代理会话的项目及会话设置请求被拒。[加密授权复验](../evidence/workspace-installed-workspace-trace-1793993484595-probe-NeoOrK.json)
- [ ] 获准后只读核对线上锁恢复 v2 的二进制、服务参数及状态路径。在真机窗口内临时启用诊断，采集后正常关闭并恢复原服务。锁未释放或状态异常时停止切换并保留现场。[中继恢复规则](../standalone-relay/RECOVERY.md)
- [x] 用日常续帧包和原真机 rc2.53 复验标准 Web 打开、关闭、原配对重连、重新授权后重开及 DevFlow 直达。只读检查配置，手机已归还。[真机闭环](../evidence/workspace-phone-rc253-fragments-regrant-devflow-20261107.json)
- [x] 在内存中继触发房间到期，验证桌面插件自动重连、测试手机沿用配对主动重连，以及工作区重新授权和旧资源句柄拒绝。[租约到期集成验证](../evidence/workspace-device-command-1794014012370.json)
- [ ] 定位此前工作区打开时数据通道关闭的发起方和原因。最近真机闭环通过，此前超时仍缺同期 Host 与公网中继证据。[此前双端记录](../evidence/workspace-phone-rc253-field-stdout-bgerqie3.json)

- [x] 在真实 P-256／AES-GCM 内存设备通道以 512 KiB 分块读取 715,000 字节，两次读取完成，最大序列化块低于 1 MiB。日常配置使用 512 KiB，真机打开与重开分别见[当前日常部署与真机边界](workspace-review.md#当前日常部署与真机边界)。
- [x] 在独立 API 26 模拟器实际 ArkWeb 验证清单内空 CSS、可选资源失败隔离及根文档失败；只恢复旧空正文逻辑的反例被拒绝，恢复修复版后再次通过。测试应用已停止，证据见[隔离补充验收](workspace-review.md#隔离补充验收)。
- [x] 修复空正文缓存／响应与单资源失败隔离，完成 56 项原生所有者替身检查、API 26 构建、原证书验签和 rc2.38 原位安装；不计为真机页面通过。
- [x] 用实际安装插件复现 1 MiB 分块超出加密明文容量，在隔离命令整轮验证 512 KiB，并保留拒绝无效配置的反例。
- [x] 用标准 Web 实际输入框验证命令认领、缺失命令不提交和卸载后不回落到模型；接入真实 Harmony 源码处理器完成三次无绑定状态命令和分块配置拒绝对照。该阶段桌面脚本禁止提交；后续真实认领预检和受限提交已启用，见[认领与防护](workspace-review.md#标准命令认领与提交防护)。
- [x] 补齐原生可选插件包名入口及重试目标保留；57 项 SDK 替身、API 26 编译和独立模拟器本地导航专项通过；后续已随 rc2.39／rc2.40 部署，真机入口交互未验，见[范围与证据](workspace-review.md#原生插件目标与重试)。
- [x] 新原生包名入口到封存 DevFlow 标准设置面板的隔离整轮通过：保存、重开和原生聊天草稿保留，Host 核对 `direct` → `auto`、原模型不变、一个会话及零模型轮次；本轮为 HTTP loopback，未部署真机。
- [x] 在安装版运行时副本和独立 profile 复验新原生入口：标准 DevFlow 设置保存、重开和原生草稿保留均通过；正常处理预览说明，零模型轮次并完成清理，见[当前证据](workspace-review.md#原生插件目标与重试)。
- [x] 在新 Host 进程从同一隔离存储读回编排 `auto`、原唯一 Session 及 `main` 主模型；设置文件字节未变、模型调用零次，临时清单已恢复，见[重启记录](workspace-review.md#原生插件目标与重试)。
- [x] 用 rc2.42 原生界面和加密工作区授权完成标准 DevFlow 直达、保存、重开及原生草稿保留。全程零模型调用，工作区打开前的原生错误已保存，真机路径待验。[整轮封存](../evidence/workspace-native-plugin-cipher-validation.json)
- [x] 修复同一原生会话重开的订阅命令 ID 冲突，配对回归及 rc2.43 模拟器加密直达整轮通过，产品未签名候选已封存，真机待验。[修复后整轮与产品候选](../evidence/workspace-native-plugin-follow-validation.json)
- [x] 修复两种通道摘要首字符引发的加密握手失败，15 项固定加密检查及 rc2.45 官方翻译与 Rich 整轮通过，封存手机未签名包与桌面候选。[验收记录](../evidence/workspace-native-official-current-validation.json)
- [x] 使用同一 rc2.45 测试 HAP 复验 DevFlow 设置保存、重开与只读委派，Host 核对 `main`、`worker/high` 和持久化请求，真机待验。[验收记录](../evidence/workspace-native-boot-current-validation.json)
- [x] 补齐完整桌面归档并以标准 CLI 安装，核对三包 812 个文件。相同归档里的中继实现通过 rc2.45 模拟器官方翻译与 Rich 整轮。[打包中继验收](../evidence/workspace-native-official-packaged-validation.json)
- [x] 修复查询、停止和拒绝工作区授权时的桌面身份初始化，封存新版完整桌面包。私有安装运行时通过命令回读及依赖恢复检查，标准 CLI 安装三包共 812 个文件与归档一致。[新版打包命令验收](../evidence/workspace-installed-device-command-complete-1793867041837-probe-lhUzT5.json)
- [x] 经独立中继的真实 loopback WebSocket 验证两块资源读取、数据连接中断后重连及旧句柄拒绝。真机曾失败的 Cordis 目录与检查清单同步 API 在断线前、重连后均通过；现场失败仍待真机复验。[真实中继回归](../evidence/workspace-access-1793867544156.json)
- [x] 将 rc2.45 产品 HAP 与完整桌面候选纳入现场准备。离线验证产品包摘要、错包拒绝、12 个原位安装拒绝条件及定向诊断采集。真机签装与启动待验。[部署预检](../evidence/workspace-field-rc245-preflight.json)
- [x] 修复工作区准备时断线仍挂载旧页面的问题。rc2.47 模拟器复现关闭流程误报清理失败，rc2.48 修复后通过 52 项源码检查和 ArkUI／ArkWeb 专项，保留聊天草稿并可在新连接重开。产品包未签名，真机待验。[前后对照与候选](../evidence/workspace-startup-recovery-rc248-validation.json)
- [x] rc2.48 和新版完整桌面归档通过官方翻译、Rich 与 DevFlow 的隔离模拟器整轮，原位更新脚本离线预检通过。[整轮与预检](../evidence/workspace-standard-rc248-validation.json)
- [x] rc2.48 复验原生新建选择、四次 `worker-model/high` 回放、标准 Web 和 DevFlow 面板直达，往返恢复原会话与草稿，真机待验。[原生新建整轮](../evidence/creation-cipher-workspace-rc2-48-validation.json)
- [x] 私有桌面 profile 离线预演同版本 Harmony 归档的升级、回退及再升级，核对锁文件、三包和合成数据。[桌面替换预演](../evidence/workspace-plugin-install-1793871348697.json)
- [x] 正常手机 rc2.39 未签名产品候选构建与封存；核心、配对和设备配置与 rc2.38 不变，新增界面与版本差异已核对，后续已签装 rc2.39／rc2.40，见[候选记录](workspace-review.md#rc239-未签名产品候选)。
- [x] 复用原材料签名 rc2.39 候选，官方 app／profile 验签通过；25 项原始载荷解压后逐字节及 SHA-256 一致，只增加 SDK 的 `.pages.info`，后续已原位安装，见[签名候选](workspace-review.md#rc239-签名候选)。
- [x] 完成提交候选防护检查，后续扩充为 13 项防护、7 项参数模式和 6 项目录解析；真实命令已受限启用，见[离线提交候选](workspace-review.md#离线提交候选)。
- [x] 修正日常桌面分块、重启并确认真实命令认领、原 HUKS 签名和加密连接恢复；标准 Web 启动失败日志已封存，现场结束时撤销工作区授权并正常退出手机端。
- [x] 修正隔离模拟器 HAP 使用陈旧接收上限的问题，封存实际 ArkWeb 和原生加密的 Rich 11 项验收；Host 发送 512 KiB，模拟器接收上限 1 MiB，见[补充证据](workspace-review.md#隔离补充验收)。
- [x] 用 313 个磁盘会话替换补齐目录重跑独立模拟器；Rich 整轮通过，记录目录读取次数及单次最长等待。合成文件只含头部，未复现现场 API 失败，见[补充证据](workspace-review.md#隔离补充验收)。
- [x] 独立模拟器在 313 个磁盘会话和加密数据帧 1.36 秒固定往返延迟下通过 Rich 整轮 11 项，首次就绪约 85 秒，见[补充证据](workspace-review.md#隔离补充验收)。
- [x] 在相同磁盘与延迟条件下对齐日常桌面已知的加密及工作区请求容量，Rich 11 项再次通过，见[补充证据](workspace-review.md#隔离补充验收)。
- [x] 增加只含固定操作与失败类别的原生诊断，完成 SDK 替身 58 项和 rc2.41 未签名 API 26 候选编译，见[补充证据](workspace-review.md#隔离补充验收)。
- [x] 修正标准 Web 插件启动失败时原生误报已就绪。独立 ArkWeb 验证 Host 拒绝、超时取消及正常重开，编译包含诊断和修复的 rc2.42 未签名候选，见[补充证据](workspace-review.md#隔离补充验收)。
- [x] 用与 rc2.42 相同的 Web 桥完成 DevFlow 的原生加密整轮，核对设置保存、worker/high 委派及持久化子任务请求，见[补充证据](workspace-review.md#隔离补充验收)。
- [x] 用同一 Web 桥验证未改动的官方推理翻译原包，核对设置落盘、原文和译文切换及同一运行中的 Rich 交互，见[补充证据](workspace-review.md#隔离补充验收)。
- [ ] 用现场同一进程的套接字、加密与工作区记录核对早期标准 API 和 Rich 启动失败是否复发。合成会话与固定时延未复现原故障，rc2.52 的 Rich 整轮已通过独立模拟器。[当前现场与隔离结果](workspace-review.md#当前日常部署与真机边界)

- [x] 在 Mate 90 Pro Max 独立应用验收标准 DevFlow 设置、原生输入、worker/high 编码只读委派和页面关闭，Host 核对持久化子模型请求；固定四响应，真实模型调用 0。
- [x] 在当前封存候选复核 Rich 动作、精确草稿恢复、返回、重开和后台；父页面、存储与网络探针被拒绝，Host 探针请求 0，双端结果与文件指纹已关联。
- [x] 修复载体可达而浏览器离线时暂停连接、正常 Web 卸载撤销后继页面启动，以及 Web 销毁错误等待异常退出的问题。离线问题现由 Harmony 工作区壳层处理（覆盖 `navigator.onLine` 并拦截可信 online／offline 事件，Connection 不再有候选）；Chromium 负／正对照与三包新 HAP 的模拟器 13 项整轮通过，真机未验证。
- [x] 在实际原生 Index 新建任务页使用测试数据提供方接合成 Host，完成预设、主模型和思考强度选择；Host 核对一次创建、会话级选模、默认配置未变与零模型轮次，测试 HAP 和源码指纹已封存。
- [x] 在安装运行时副本中加载较早的四包基线（含已作废的 Connection 候选），完成 DevFlow 和 Rich 后端四响应回放、非 owner 授权范围及实际标准资源提供检查；不外推前端执行。
- [x] 在安装运行时副本上完成 DevFlow 和 Rich 手机标准页面验收；使用封存包的标准 Web 壳层，双端结果、实际包文件、测试 HAP 和 HTTP helper 指纹已关联。
- [x] 完成 Rich 中文 BMP 输入、原生退格、Back 收键盘及五轮打开关闭诊断；原始 PSS 与失败轮单独封存，不据此认定内存长期有界。
- [x] 用 Windows 实际读句柄对照验证不可变状态快照，消除测试状态文件替换需求；不把测试工具失败计作产品验收。
- [x] 在实际鸿蒙加密 API、设备票据与独立授权上完成安装版副本的 Rich 四响应整轮；修复原生共享 JS 缺少 URL 解析器的问题，保留固定测试身份、HTTP 帧载体和 WSS／HUKS 未验收边界。
- [x] 在同一原生加密载体完成 DevFlow 标准设置、worker/high 只读委派及持久化核对；两组整轮与当时的默认禁用未签名产品候选分别封存；当前日常部署见本页首段。
- [x] 修复标准设备命令及本地所有者缺少 `clientModules` 注入的问题；源码、持久化命令快照和新旧构建入口对照通过。rc2.34 同一归档也在安装运行时副本通过注册、依赖卸载／恢复及原生命令检查，标准 Web 资源原字节保留；生产绑定／连接命令执行仍待验收。
- [x] 使用安装版原官方推理翻译三包完成标准设置、会话组件、原文／译文切换及设置重开，33 个自身文件前后字节一致；同轮 Rich 四响应回放与 Host 配置核对通过，固定翻译端点仅回放一次，无公网调用。
- [x] 原生新建页在真实安装版预设目录选择 minimal、worker-model/high，经原生设备加密载体完成四次输入、回复和生成结束；Host 核对四次实际选模请求、会话持久化与默认配置未变，未授予全局工作区权限，见[选模执行证据](workspace-review.md#原生新建与选模执行)。
- [x] 验证原生新建到标准 Web 的同会话往返。rc2.44 修复返回时原生 Rich 控制器恢复过早的问题，六项模拟器检查通过，未签名产品候选已封存。[整轮及产品候选](../evidence/creation-cipher-workspace-current-validation.json)
- [x] 在私人 home 的 `web` profile 经标准 `dsh plugin add` 离线安装封存归档（较早四个含已作废的 Connection 候选，当前审阅物为 Harmony rc2.35、Rich、DevFlow 三个，另含第三方归档的单独运行），并由 `dsh --profile web` 启动探针核对客户端路径、SDK 对等包哈希、三批 Client Modules 全部返回 200，真实模型调用 0。修复依赖镜像只给每个包名一个版本导致的 `ERR_PNPM_NO_MATCHING_VERSION`；安装脚本改为从当前审阅物读取全部归档。见[标准 CLI 安装与第三方发布物](workspace-review.md#标准-cli-安装与第三方发布物)。
- [x] 固定第三方 `@michengai/dsh-skills-manager` 1.2.11 经标准 CLI 安装，49 个文件前后字节一致，宿主入口激活，探针启动期间无外联尝试（未挂载浏览器客户端，其更新检查未触发）；同一路由对 owner 本机返回 200，对共享处理器的设备 Peer 请求返回 404，说明其自有 `/api` 后端不能经现有工作区载体使用。用户已接受这条边界：载体把 404／403 改写为 `workspace-route-unavailable`（带 `unregistered`／`owner-only` 原因和 `x-dsh-workspace-route` 头），壳层 `window.fetch` 输出警告并派发事件；壳层没有自己的提示界面，探针也没有经载体复测。
- [x] 用 npm 原始归档核对 `dsh-tab-complete` 和 `dsh-chat-index-rail` 的标准安装与 Web 模块图，并在隔离 Chromium 定位聊天索引的旧会话接口错误。[第三方发布物对照](workspace-review.md#标准-cli-安装与第三方发布物)
- [x] 用 `dsh-theme-brick` 的同一份 npm 原包完成桌面 Web 与鸿蒙 API 26 模拟器的主题开关和状态读回验收。[验收证据](acceptance.md)
- [x] 用标准插件管理器停用并恢复 Brick 原包。桌面和 ArkWeb 同页移除并恢复设置项，两端均复现停用后背景残留并定位到原包清理注册。[验收证据](acceptance.md)
- [x] 在原生 Index 验证标准插件冷启动故障。返回后保留回复和草稿，桌面停用故障包后重开标准 Web 并直达 DevFlow。[验收证据](../evidence/workspace-native-wss-close-cancellation-standalone-plugin-boot-fault-recovery-validation.json)
- [x] 完成 DevFlow 独立模拟器键盘整轮。两种点击顺序均记录首次附着失败、后续附着成功。标准面板重新聚焦后验证中文 BMP、退格、返回保留草稿、设置保存、聊天避让和只读委派，共 10 项。[换序对照](../evidence/workspace-native-wss-close-cancellation-standalone-attach-plain-first-validation.json) · [DevFlow 键盘整轮](../evidence/workspace-native-wss-close-cancellation-standalone-keyboard-refocus-validation.json)
- [x] 在隔离模拟器的普通 ArkUI／ArkWeb 控件上点选系统表情，另在 Chromium 验证原 Rich 包的表情草稿往返。[系统键盘点选](../evidence/workspace-emoji-ime-control-retry-rc249.json) · [Rich 草稿读回](../evidence/workspace-rich-1794087743333.json)
- [x] 用 rc2.57 的实际 ArkWeb Rich 表单从系统输入法点选补充平面表情，关闭重开读回并核对 Host 持久草稿。[rc2.57 Rich 系统表情验收](../evidence/workspace-rc257-rich-system-ime-arkweb.json)
- [x] 用 rc2.57 在 DevFlow 模型档案名称中点选系统表情，验证保存、重开读回和该档案的只读委派。[rc2.57 DevFlow 系统表情验收](../evidence/workspace-rc257-devflow-system-ime-arkweb.json)
- [x] 验证 DevFlow 双端保存冲突。API 26 模拟器标准面板显示冲突并保留草稿，重新读取后保存，关闭重开后读回模型档案。[验收证据](acceptance.md)
- [x] 验证官方工作区归档与恢复的授权范围。在隔离源码和加密回环中确认候选过滤隐藏会话 ID，保留桌面 owner 的完整归档集合。[验收对照](../evidence/workspace-archive-scope-filter-validation-20261107.json)
- [x] 在安装版桌面副本用独立 profile 对照原 Host 与归档候选。候选只替换工作区包的 Host 入口，归档授权检查、标准 Web 资源和 DevFlow `worker/high` 委派通过。[安装版验收](../evidence/workspace-installed-archive-scope-validation-20261107.json)
- [x] 用日常桌面 1.1.7 的原文件通过标准 CLI 安装并启动 Archive Manager，复现元数据与批量删除授权缺口。封存 Harmony 候选通过原包的加密权限对照。[原包对照](../evidence/workspace-archive-manager-installed-boundary-validation-20261107.json)
- [x] 在隔离 profile 验证两个归档修复包的标准 CLI 组合安装、按锁离线回滚与恢复，以及恢复后的 Host 权限行为。[桌面组合候选验收](../evidence/workspace-archive-boundary-delivery-validation-20261107.json)
- [x] 在回环 Chromium 以 Archive Manager 原包验证插件详情、全局设置入口、旧接口拒绝和宽屏恢复。390 CSS px 下归档行标题宽度为 0。[宽窄对照](../evidence/workspace-access-archive-manager-1794025388731.json)
- [x] 在隔离候选和回环 Chromium 中验证公共设置页窄屏布局，Archive Manager 原包在 390 CSS px 下可选中并恢复合成会话。[候选复验](../evidence/workspace-access-archive-manager-1794025826471.json)
- [x] 在 API 26 ArkWeb 验证公共设置页窄屏布局、Archive Manager 原包列表和恢复交互，以及旧版接口拒绝。[模拟器验收](../evidence/workspace-native-archive-manager-compact-validation-20261107.json)
- [x] 封存 Harmony、官方工作区与公共设置三份候选。隔离 Web Host 加载核对通过，私有 desktop profile 的 pnpm 安装、按锁离线回滚与恢复通过。[组合交付](../evidence/workspace-desktop-archive-compact-release-20261107/release.json)
- [x] 对封存三包演练桌面锁文件预检及安装校验失败回退。五类依赖偏差均拒绝，注入设置入口摘要错误后按原锁恢复隔离基线。[预检收据](../evidence/workspace-desktop-lock-preflight-1794035386534.json)
- [x] 在隔离 profile 演练最终三包切换和收据发布。入口校验及收据冲突均触发原依赖目录和配置恢复，合成本地插件保留。通过路径生成演练收据并核对现场入口摘要。[切换预演](../evidence/workspace-desktop-lock-preflight-1794038319289.json)
- [x] 用同一组封存三包和 rc2.53 工作区核心复验原生新建、DevFlow 保存与委派、Rich 和官方翻译。API 26 ArkWeb 三轮共 31 项通过，原测试包已恢复，临时转发和测试私钥已清理。[兼容性复验](../evidence/workspace-native-release-compatibility-validation-20261107.json)
- [x] 修复原生创建回执丢失时刷新列表仍隐藏可能已创建的空白会话。rc2.54 通过 API 26 模拟器重连、刷新及原会话打开检查，Host 仅收到一次创建请求。产品候选未签名，真机待验。[源码与构建](../evidence/workspace-creation-recovery-rc254-validation.json) · [模拟器复验](../evidence/workspace-creation-recovery-rc254-emulator-validation.json)
- [x] 用 rc2.54 原生页面和最终三包完成正常链路的 13 项 ArkWeb 与加密验收。核对新建选模、标准 Web 关闭、重连拒绝旧授权、重新授权后重开及 DevFlow 直达。[正常链路复验](../evidence/workspace-rc254-release-regrant-emulator-validation.json)
- [x] 用最终三包和 rc2.54 工作区核心复验慢链路下的标准 Web、Rich 和重开，共 12 项通过。[慢链路复验](../evidence/workspace-rc254-release-slow-link-emulator-validation.json)
- [x] 完成 rc2.54 离线签装预检。候选限定原配对 rc2.53 原位升级，假设备验证安装前拒绝、安装后 UID 和版本核对，以及 25 个产品载荷文件的字节比较。[签装预检](../evidence/workspace-field-rc254-install-preflight.json)
- [x] 让现场采集器核对最终三包与 rc2.54 的实际安装和启动收据，并接入零自动化输入的 Rich 展示观察。使用隔离安装、合成收据及模拟器来宾布局通过 50 项检查。[采集预检](../evidence/workspace-phone-rc254-release-capture-preflight-20261107T081632775869Z.json)
- [x] 补齐最终桌面三包的临时诊断配置恢复。隔离副本验证字节恢复、重复执行、入口与配置漂移拒绝，共 11 项。[收尾预检](../evidence/workspace-release-trace-restore-preflight-20261107T084443679392Z.json)
- [x] 从独立备份生成封存三包的锁计划。隔离同盘冻结安装核对 872 个文件，合成跨盘验证 Rich 路径、无关依赖保留及八类偏差拒绝。[锁计划验证](../evidence/workspace-desktop-release-plan-1794041659057.json)
- [x] 将封存三包的安装收据和现场采集绑定到实际清单、锁及六个插件的全部文件。隔离安装核对 872 个文件，覆盖 Windows 长路径与非入口文件差异。[收据预检](../evidence/workspace-desktop-release-receipt-preflight-20261107T090325531954Z.json)
- [x] 在隔离 checkout 应用官方工作区归档响应和公共设置窄屏修复，补齐双语文档与归档接口升级说明。38 项 Host 测试通过，13 文件合入补丁通过当前 `lumina` 应用预检。[源码集成核对](../evidence/workspace-core-lumina-integration-20261107.json)
- [x] 恢复隔离 checkout 中两包及 Client 组装所需的依赖链接。12 个测试文件均通过，两轮按文件合计 159 项。[两包回归](../evidence/workspace-core-lumina-package-tests-20261107.json)
- [x] 用仓库构建配置重建隔离 checkout 的工作区控制器和通用设置。Host 与 Client 类型编译、Typert 生成、两包打包和入口核对通过。[两包构建](../evidence/workspace-core-lumina-build-20261107.json)
- [x] 将 13 文件补丁合入本地 `lumina`，更新日常桌面三包，并用原证书从 rc2.53 原位升级真机到 rc2.54。[合入补丁](../evidence/workspace-core-lumina-integration-20261107.patch) · [桌面安装](../evidence/workspace-desktop-field-archive-compact-installed.json) · [真机安装](../handoff/deploy-rc235-20261104/phone-install-rc2-54.json)
- [x] 在 rc2.54 真机复验标准 Web 打开及关闭、原配对重连、旧授权拒绝、重新授权后重开和 DevFlow 直达。DevFlow 只读，模型调用为零，手机已归还。[最新现场记录](acceptance.md)
- [x] 用最终桌面三包和 rc2.54 工作区核心复验第三方 Brick 原包。模拟器通过主题开关、关闭重开读回和设置项动态启停，恢复原测试包。[Brick 配套验收](../evidence/workspace-rc254-release-brick-emulator-validation.json)
- [x] 核对四组独立回放的核心文件、Host 收据和包身份。复用合成空白会话验证从持久化日志读回任务类型、模型、思考强度及零模型事件。[回放预检](../evidence/workspace-rc254-isolated-field-replay-preflight.json) · [读回预检](../evidence/workspace-rc254-blank-session-audit-preflight.json)
- [x] rc2.54 真机沿用原配对选择任务类型、主模型和思考强度，创建且保留一条空白会话。读回持久化选择，模型事件为零。[真机空白新建](../evidence/workspace-phone-rc254-blank-session-verified.json)
- [x] 在隔离 Chromium 对照中验证无消息的新会话可打开。通过原生设备元数据确认目标为空白会话，核对标准 Web 展示的会话 ID，再关闭并直达标准 DevFlow 读取设置。[隔离对照](../evidence/workspace-access-devflow-1794061635638.json)
- [x] 在隔离 ArkWeb 执行零消息回归，覆盖空白会话的标准 Web 打开、重连、重新授权和 DevFlow 直达。[模拟器整轮](../.build/workspace-release-blank-creation-hbhuce66/result.json)
- [ ] 复验 rc2.54 真机重新授权后空白会话的标准 Web 与 DevFlow 直达失败。固定阶段日志的未签名诊断候选已构建。[真机记录](../evidence/workspace-phone-rc254-devflow-after-regrant.json) · [诊断候选](../evidence/native-build/2026-11-07T14-58-01-061Z.json)
- [x] 补齐 rc2.55 加载阶段的现场采集。在同一隔离 ArkWeb 应用进程验证主文档传输失败与 HTTP 503 分开记录，原测试包已恢复。[诊断链验收](../evidence/workspace-field-diagnostics-rc255-arkweb.json)
- [x] 修复工作区控制器启动和消息端口交接异常，保留失败提示和原目标重试。rc2.56 未签名构建通过，最新三包组合完成 16 项隔离 ArkWeb 正常路径复验。[候选构建与验收](../evidence/workspace-native-startup-rc256-verification.json)
- [x] 隔离应用启动时的工作区配置和脚本校验故障。rc2.57 未签名构建通过，模拟器破坏测试脚本后仍可进入原生历史。[候选构建与故障注入](../evidence/workspace-native-init-rc257-verification.json)
- [x] 封存 rc2.57 原位升级候选并核对最新桌面三包。离线预检校验 25 个产品载荷文件，模拟设备只允许从 rc2.54 按原 UID 升级。[离线签装预检](../evidence/workspace-field-rc257-install-preflight.json)
- [x] 用 rc2.57 工作区源码及最新桌面三包复验正常链路。隔离 ArkWeb 通过 16 项，覆盖空白会话、重连后重新授权与 DevFlow 保存和恢复继承。[双端候选与预检](../evidence/workspace-field-rc257-ready.json)
- [x] 补验 rc2.57 配套桌面三包的回退。锁文件重命名前失败时清理临时文件，校验基线、暂存包和备份，再完成隔离安装、回退与再安装。[桌面回退补验](../evidence/workspace-field-rc257-desktop-rollback-preflight.json)
- [x] 用 rc2.57 和最新桌面三包复验 Brick 0.2.1 原包。停用后关闭并重开标准工作区，新文档恢复默认配色。[rc2.57 Brick 原包复验](../evidence/workspace-rc257-release-brick-emulator-validation.json)
- [x] 用隔离模拟器打开用户授权的置顶简报副本，验证原生历史、标准 Web 历史和返回原生。原日志及历史帧摘要一致。[界面结果](../evidence/workspace-pinned-read-rc255-emulator.json)
- [x] 对照确认首次打开指定会话时，多出的空白会话由标准客户端启动恢复创建。隔离候选让 Harmony 嵌入端负责初始导航，合成置顶会话在 Chromium 显示历史且创建请求为零。[原现场](../evidence/workspace-pinned-read-rc255-emulator.json) · [Chromium 对照](../evidence/workspace-access-devflow-1794066291873.json)
- [x] 用同一候选在隔离 ArkWeb 验证合成置顶会话打开、关闭与 Host 零新增。原测试包恢复，模型调用为零。[模拟器整轮](../.build/workspace-release-pinned-read-j1vlsfh8/result.json)
- [x] 封存 Workspace UI 与 Harmony 桌面配套归档，验证独立 profile 的安装与锁文件离线重装，并在隔离安装版 Host 和 ArkWeb 上复验。[配套归档验证](../evidence/workspace-desktop-initial-selection-release-36547xt8/verification.json)
- [x] 用配套归档在模拟器复测用户指定的置顶简报副本。原生和标准 Web 历史打开、关闭后返回原生均通过，Host 未新增会话。[置顶简报修复后复验](../evidence/workspace-pinned-read-fixed-emulator.json)
- [x] 用 rc2.57 和最新桌面三包复测同一置顶简报。原生与标准 Web 历史、关闭后返回和零新增会话通过。[400 帧快照](../evidence/workspace-pinned-briefing-rc257-emulator.json) · [428 帧快照](../evidence/workspace-pinned-briefing-rc257-emulator-return-diagnostic.json)
- [x] 用 400 个合成历史压缩帧补测 rc2.57 置顶会话冷进程打开和五次重开，记录界面计时和同一应用进程的 14 份 PSS 样本。[置顶长会话测量](workspace-measurement.md#rc257-置顶长会话冷启动与重开)
- [x] 用同一合成长会话验证 rc2.58 返回同一会话时保留原生历史订阅。六轮打开和关闭只触发一次原生会话选择。[rc2.58 回归](../evidence/workspace-rc258-pinned-retained-selection-emulator.json)
- [x] 封存 rc2.58 未签名包与桌面三包，核对 25 个载荷文件，并用模拟设备验证从 rc2.54 原位升级的安装条件。[离线安装预检](../evidence/workspace-field-rc258-install-preflight.json)
- [x] 用 rc2.58 与桌面三包验证 Web 切换会话后原生跟随正确目标，第一条会话的草稿仍可读。重连、授权和 DevFlow 会话级设置整轮复验通过。[配套验收](../evidence/workspace-field-rc258-ready.json)
- [x] 用同一 rc2.58 候选复验原生新建选模执行、DevFlow 只读委派、Rich 动作和官方翻译原包。三组固定回放共 35 项通过，核对原生会话和 DevFlow 的持久化结果。[rc2.58 回放验收](../evidence/workspace-rc258-current-replay-suite.json)
- [x] 用 rc2.58 和桌面三包打开实际置顶简报的只读副本，核对标准 Web 关闭后仍可查看原生简报和富交互卡片。[428 帧模拟器复验](../evidence/workspace-pinned-briefing-rc258-emulator-verified.json)
- [x] 用隔离安装和合成手机收据预检 rc2.58 的启动、会话采集和诊断配置恢复，核对 881 个已装文件与 28 个拒绝场景。[采集预检](../evidence/workspace-rc258-field-capture-preflight-20261108T000555793574Z.json)
- [x] 用隔离基线和日常桌面留存锁文件生成 rc2.58 三包计划，核对 Archive Manager 原注册表解析、Workspace UI peer 及其他依赖记录。[双基线计划验证](../evidence/workspace-rc258-desktop-plan-1794096975163.json)
- [x] 用同一 rc2.58 配套三包重跑隔离替换、三处故障回退及恢复后再安装。[配套桌面替换预检](../evidence/workspace-rc258-desktop-transition-preflight.json)
- [x] 用 rc2.58 换包入口实测隔离安装、事务回退和中断恢复，核对备份及保留文件漂移拒绝。[入口实测](../evidence/workspace-rc258-desktop-apply-20261108T003251620789Z.json)
- [x] 获准后更新日常桌面三包和 rc2.58 真机，核对 881 个已装文件、原证书签装、原配对首次握手及诊断收尾。[现场收尾](../evidence/workspace-phone-rc258-field-closeout-20261108.json)
- [x] 复现并修复桌面原生历史窗口超出加密通道预算时断开连接。回环用现场容量验证缩窗和同连接切换，用高容量对照验证完整窗口。[加密回归](../evidence/device-integration-1794101690917.json)
- [x] 用容量修复版和 1 MiB 现场上限复测实际置顶简报的 429 帧只读副本。Mate 90 Pro Max 模拟器通过原生、标准 Web 和关闭返回，零模型消息，原日志和隔离日志一致。[置顶简报现场容量复验](../evidence/workspace-pinned-briefing-rc258-emulator-session-capacity-rc2-5472.json)
- [x] 从 rc2.58 日常安装的留存元数据生成 Harmony 单包升级计划，在隔离 profile 验证事务回退、中断恢复和再安装，核对 881 个文件及六个保留包。[容量修复升级预检](../evidence/workspace-rc258-capacity-desktop-promotion-20261108T015229899582Z.json)
- [x] 在容量修复版配套 rc2.58 上复验 Archive Manager 原包的窄屏设置、旧版接口拒绝和合成会话恢复。[原包复验](../evidence/workspace-rc258-capacity-archive-manager-emulator.json)
- [x] 只读核对 DHome 的请求和并发限额、Nginx worker 与配置时间，以及验收时段中继状态。站点关闭相关日志，历史 503 缺少逐笔服务端证据。[线上只读核对](../evidence/workspace-dhome-rc258-503-readonly-20261108.json)
- [x] 用本机 Nginx 和合成请求验证 503 条件日志，分别识别请求限流、并发拒绝和上游 503，核对成功响应及请求参数不会进入诊断记录。[隔离验证](../evidence/workspace-rc258-nginx-503-diagnostic-20261108T020637528396Z.json)
- [x] 获准后单独更新日常桌面 Harmony 容量修复包。真机 rc2.58 用原配对打开置顶简报正文，经过三次自动续接。DHome 临时诊断未记录到 503，线上和桌面诊断配置均已恢复。[容量修复真机记录](../evidence/workspace-phone-rc258-capacity-field-20261108.json)
- [x] 预检普通桌面模式的真机入口。核对当前手机握手和新桌面授权回执，从当前简报直接打开 Web，再只读验证 DevFlow。三个现场旧回执及合成失效路径均拒绝。[入口预检](../evidence/workspace-rc258-fresh-grant-preflight-20261108T030130826566Z.json)
- [x] 用 rc2.58 与配套桌面三包复验 Brick 0.2.1 npm 原包，核对动态设置、主题重开读回及同页停用的配色边界。[Brick 复验](../evidence/workspace-rc258-brick-emulator.json)
- [x] 为 rc2.57 隔离首开与重开记录双端阶段，确认差异主要出现在主文档返回后至 ArkWeb 端口交接前。[启动分段测量](workspace-measurement.md#rc257-标准-web-启动分段)
- [x] 用 rc2.57 的 1 MiB 上限复验隔离 Host 和同一 ArkWeb 场景，记录读取次数和分段时间差异。[分块对照](workspace-measurement.md#512-kib-与-1-mib-的-host-分块对照)
- [x] 在 1 MiB 隔离场景区分资源并发排队、加密调用、缓存校验、响应交还与后续等待，确认首开额外等待主要来自未命中缓存的资源路径。[原生资源计时](workspace-measurement.md#1-mib-下的原生资源计时)
- [x] 对照四个与八个原生资源并发槽，确认排队消失后本轮首开仍未提速。[并发对照](workspace-measurement.md#四个与八个资源并发槽)
- [x] 在隔离候选验证缓存校验与 ArkWeb 响应共用一次正文解码，保留空正文及损坏资源处理，记录首次打开和重开样本。[单次解码对照](workspace-measurement.md#缓存校验与-arkweb-响应复用解码结果)
- [x] 使用配套归档复验零消息空白会话、重连、旧授权拒绝、重新授权、标准 Web 重开和 DevFlow 直达。独立 profile 完成原六包组合升级、离线回退和再升级。[空白会话和回退复验](../evidence/workspace-desktop-initial-selection-release-36547xt8/blank-and-rollback-verification.json)
- [x] 在隔离 ArkWeb 用同一配套归档验收 DevFlow 模型档案保存、只读委派和重开读回，以及 Rich 动作结果、草稿恢复和官方翻译原包。两轮各四条固定回放，真实模型调用为零。[插件行为复验](../evidence/workspace-desktop-initial-selection-release-36547xt8/plugin-actions-verification.json)
- [x] 封存 DevFlow 显式目标选择候选。在隔离 ArkWeb 验收同名会话区分、保存、重开读回、恢复继承，以及全局和同名会话配置保持。三包组合通过独立 profile 离线回退。[会话设置与安装复验](../evidence/workspace-devflow-target-release-gsjs1c63/verification.json)
- [x] 用包含 DevFlow 显式目标修复的同一三包组合复验完整 DevFlow 工作流、Rich 动作和官方翻译原包。隔离 ArkWeb 两轮共 22 项，真实模型调用为零。[当前三包插件行为复验](../evidence/workspace-devflow-target-release-gsjs1c63/plugin-actions-verification.json)
- [x] 用 rc2.57 工作区源码、最新三包和 1 MiB 分块复验 DevFlow 工作流、Rich 动作和官方翻译原包，隔离 ArkWeb 两轮共 22 项。[rc2.57 插件行为复验](../evidence/workspace-rc257-latest-plugin-actions-emulator.json)
- [x] 用 rc2.57、最新桌面三包和 1 MiB 分块验证原生新建任务的四条固定请求，读回落盘选项，复验同进程重连、重新授权和 DevFlow 直达。[rc2.57 新建任务执行复验](../evidence/workspace-rc257-native-selection-execution-emulator.json)
- [x] 在独立 profile 预演三包锁文件变更，验证两条 Workspace UI peer 引用、未涉及的依赖记录、安装完整性拒绝及离线回退。[桌面锁文件预检](../evidence/workspace-devflow-target-release-gsjs1c63/desktop-lock-preflight.json)
- [x] 用当前三包组合和 Archive Manager 1.1.7 原包复验窄屏归档、旧接口权限拒绝与标准会话恢复。隔离 Host 和模拟器七项检查通过。[当前三包归档复验](../evidence/workspace-devflow-target-release-gsjs1c63/archive-compat-verification.json)
- [x] 用 rc2.57 和当前桌面三包复验 Archive Manager 1.1.7 原包，覆盖窄屏归档、旧接口拒绝与标准会话恢复。[rc2.57 Archive Manager 原包复验](../evidence/workspace-rc257-release-archive-manager-emulator-validation.json)
- [x] 预演只替换三个插件目录和对应 pnpm 元数据，验证中途故障回退、保留插件目录身份及实际包入口解析。[原位替换与回退预演](../evidence/workspace-devflow-target-release-gsjs1c63/desktop-promotion-verification.json)
- [x] 归档 Workspace UI 和 DevFlow 的源码补丁。在固定提交的干净副本复建客户端，核对除构建路径生成的样式差异外与封存产物一致。[源码补丁与复建记录](../handoff/standard-plugin-workspace/source-fixes-4Ika5c/manifest.json)
- [x] 让桌面回执显示当前加密连接上的实际授权期限，并拒绝连接换代期间提交的旧确认。隔离加密回归和桌面构建通过。[授权命令回归](../evidence/workspace-device-command-1794107588160.json) · [桌面构建](../evidence/workspace-desktop-rc258-grant-deadline.json)
- [x] 以现场容量包为基线封存授权期限候选。常规模式在隔离 profile 验证 Harmony 单包替换和故障回退，桌面配置不需要临时开启诊断。[常规模式预演](../evidence/workspace-rc258-grant-deadline-desktop-promotion-20261108T032637367510Z.json)
- [x] 在隔离的安装版 Host 用同一份授权期限归档复验设备命令、加密工作区授权、标准 Web 资源重开和 DevFlow 固定回放。[加密工作区复验](../evidence/workspace-installed-workspace-trace-1794109451041-probe-zeCMUq.json)
- [x] 用同一授权期限归档和 rc2.58 夹具运行 ArkWeb 空白会话流程。18 项通过，覆盖原生新建、标准 Web 跨会话返回、重连重新授权和 DevFlow 会话设置读回。[ArkWeb 整轮](../evidence/workspace-rc258-grant-deadline-arkweb-blank-20261108.json)
- [x] 用同一归档在 ArkWeb 复现命令回执挡住首屏正文，验证收起侧栏后滑动一次可见正文、关闭后回到同一原生会话。[命令尾部对照](../evidence/workspace-rc258-grant-deadline-arkweb-command-tail-20261108.json)
- [x] 用同一授权期限归档和 rc2.58 在隔离 ArkWeb 验证 Rich 动作与草稿、来宾隔离及官方翻译原包，四条固定回放，真实模型调用为零。[Rich 与官方翻译整轮](../evidence/workspace-rc258-grant-deadline-arkweb-rich-20261108.json)
- [x] 用同一授权期限归档在隔离 ArkWeb 验证 DevFlow 自动编排、模型档案重开和实际只读委派，核对父子任务的请求记录。[DevFlow 执行整轮](../evidence/workspace-rc258-grant-deadline-arkweb-devflow-20261108.json)
- [x] 用同一授权期限归档在隔离 ArkWeb 复验原生选模执行。四次固定请求和磁盘会话日志与选择一致，标准 Web、重连重新授权和 DevFlow 直达共 13 项通过。[原生新建执行整轮](../evidence/workspace-rc258-grant-deadline-arkweb-creation-20261108.json)
- [x] 用同一授权期限归档复验 Brick 和 Archive Manager 原包，共 17 项通过，核对两个插件共 37 个原包文件。[第三方原包整轮](../evidence/workspace-rc258-grant-deadline-arkweb-thirdparty-20261108.json)
- [x] rc2.58 真机用新授权从手机设置按包名直达 DevFlow，读到编排、模型和思考强度，关闭后回到同一原生简报。[真机结果](../evidence/workspace-phone-rc258-capped-grant-grantfield1108c.json)
- [x] 用隔离加密回归验证控制会话可独立发起授权和停止，目标会话仍可通过标准工作区读取，且验收脚本只读选定控制会话的回执。[分离授权与阅读的对照](../evidence/workspace-rc258-separate-approval-session-20261108T071627696074Z.json)
- [x] 用隔离 ArkWeb 核对中文 Markdown、24 条尾部命令回执、滑动和关闭返回，用同一组界面树验证真机验收逻辑与实际手势一致。[中文正文与手势对照](../evidence/workspace-rc258-arkweb-markdown-handoff-20261108T074534322235Z.json)
- [x] 在隔离 ArkWeb 从原生置顶简报首次打开标准 Web。滑动一次后核对到同一段中文 Markdown，关闭后回到原生简报。后续 DevFlow 保存和读回成功，恢复继承控件未找到，整轮未通过。[首开简报阶段结果](../evidence/workspace-rc258-arkweb-briefing-first-open-20261108T080941120664Z.json)
- [x] 用同一桌面归档完成隔离 ArkWeb 整轮复验。覆盖会话滚动区、简报正文和关闭返回、原生创建选模、重连授权和 DevFlow 保存／读回／恢复继承。模拟器原包已恢复，模型调用为零。[整轮结果](../evidence/workspace-rc258-arkweb-scoped-briefing-devflow-20261108T082449384541Z.json)
- [x] 修复前台重建连接后丢失原生会话选择，加入聊天页工作区入口的选中项校验。加密回环已复现旧实现并验证修复，rc2.59 通过官方未签名编译。[前台会话恢复核对](../evidence/workspace-rc259-foreground-selection-20261108T083724749768Z.json)
- [x] 在隔离模拟器用 rc2.59 产品核心复验前后台切换。同进程恢复原生简报，旧授权被拒，新授权后标准 Web 读到正文并关闭返回。原生新建任务和 DevFlow 写入／读回／恢复继承同轮通过。[前后台 ArkWeb 验收](../evidence/workspace-rc259-arkweb-foreground-briefing-20261108T085034453517Z.json)
- [x] 完成 rc2.58 到 rc2.59 的签装与前台恢复离线预演。原位入口校验原证书、载荷和新鲜配对快照，真机驱动校验同进程、新连接和简报正文。[签装预演](../evidence/workspace-field-rc259-install-preflight.json) · [前台验收预演](../evidence/workspace-field-rc259-foreground-preflight.json)
- [x] 获准后用原证书将真机从 rc2.58 原位升到 rc2.59。原配对、UID 和数据保留。原生简报同进程前台恢复与关闭 Web 返回均通过。[rc2.59 真机验收](../evidence/workspace-phone-rc259-briefing-field-20261108.json)
- [x] 用 rc2.59 产品核心与同字节 `PairedCore.js` 在隔离 ArkWeb 复验 Rich 动作、官方翻译原包和 DevFlow 工作流。22 项通过，两轮各四条固定回放，真实模型调用为零。[插件回放](../evidence/workspace-rc259-arkweb-plugin-actions-20261108T092748832526Z.json)
- [x] 在隔离 ArkWeb 将合成简报正文放入上一页。打开标准 Web 后找到「加载更早」，点击并读到正文，关闭后回到同一条原生会话。独立流程与清理均通过。[分页验收](../evidence/workspace-rc259-arkweb-paged-briefing-20261108.json)
- [x] 用封存 ArkWeb 界面树离线预演真机分页入口。核对控件边界、控制会话授权、分阶段等待和返回原生后的正文。13 项分页对照和 29 项授权回归通过。[预演回执](../evidence/workspace-field-rc259-paged-grant-preflight-20261108.json)
- [ ] 核对真机置顶简报的标准 Web 正文。rc2.59 已打开标准 Web 并返回同一段原生正文。现场 Host 的首次更早页返回 HTTP 200，游标推进，有 325 条记录及更早历史。真机正文仍未匹配，下一步区分分块读回、Web 页面应用及正文是否在更早页。此前现场 503 的来源仍未确认，后续诊断期间未复现。[现场分页与回退](../evidence/workspace-page-diagnostic-field-result-20261108.json) · [原 503 记录](../evidence/workspace-phone-rc258-field-closeout-20261108.json)
- [x] 用隔离加密连接复验简报跨两页读取。验证上一轮现场脚本的单页限制，封存最多三页的现场读回脚本。只有观察到不同页首才继续请求，十项离线对照通过。[多页验收预演](../evidence/workspace-rc259-deep-history-preflight-20261108.json)
- [x] 在隔离 Chromium 的标准 Web 中，经加密回环连续加载两页更早历史。核对请求次数、两次阅读锚点及第二页出现的简报正文。真机对照仍只观察到一次加载和相同可见页首。[标准 Web 分页对照](../evidence/workspace-rc259-paged-briefing-ui-20261108.json)
- [x] 为标准分页补齐 Host 响应诊断。在隔离回环区分成功推进、Gateway 错误和超限，封存以原部署包为基线的桌面候选。[分页诊断](../evidence/workspace-page-diagnostic-20261108.json)
- [x] 在复制的安装版 Host 用同一封存包验证分页诊断开启与关闭。另在隔离副本通过桌面单包替换、回退和中断恢复预演，现场取证待安排。[安装版开关对照](../evidence/workspace-page-diagnostic-installed-20261108.json) · [换包与回退预演](../evidence/workspace-rc258-page-diagnostic-desktop-promotion-20261108T121540296482Z.json)
- [x] 预演临时单包替换、按加密连接关联分页日志及原包回退的现场入口。现场只读取置顶简报，沿用 rc2.59 和原配对。[现场入口预演](../evidence/workspace-page-diagnostic-field-preflight-20261108.json)
- [x] 在真机取得 Host 分页响应及发送阶段。复验后恢复桌面原包、原配置和锁文件并重开，核对 881 个文件。修正回执跨盘归档，三个离线恢复对照通过。[现场分页与回退](../evidence/workspace-page-diagnostic-field-result-20261108.json)
- [x] 在隔离 Chromium 以产品分块容量读完接近真机大小的更早页。验证两块完整返回、两次阅读锚点和第二页正文进入视口。[同体积分页对照](../evidence/workspace-field-sized-briefing-browser-20261108.json)
- [x] 在隔离 Mate 90 Pro Max 的标准 ArkWeb 工作区读完 1,610,496 字节的更早页，观察简报正文并关闭返回同一原生会话。修正验收脚本对分页加载和视口重绘的等待。验证结束恢复原测试包。[ArkWeb 同体积分页](../evidence/workspace-field-sized-briefing-arkweb-20261108.json)
- [x] 将标准分页分块关联到原请求，记录准备及本地提交阶段。大页加密回环、交错读取、释放及复制安装版 Host 的诊断开关通过。[分块诊断](../evidence/workspace-page-chunk-trace-installed-20261108.json)
- [x] 用封存安装回执绑定分块诊断的现场入口。在隔离副本预演单包替换、中断恢复和回退，核对 883 个文件。用安装版日志与加密回环日志预演采集，区分未观察到分块、部分提交和完整提交，拒绝换代及不一致记录。[现场入口预演](../evidence/workspace-page-chunk-trace-field-preflight-20261108.json)
- [ ] 真机用临时分块诊断包复验时，标准 Web 在 `renderer-boot` 失败，授权和连接保持有效，尚未进入分页。已回退日常桌面并重开。下一步定位标准 Web 启动失败阶段，再复验真实简报分页。[现场渲染启动结果](../evidence/workspace-page-chunk-trace-field-result-20261108.json)
- [x] 增加启动资源计数，区分 HTTP、缓存、传输或响应异常和队列拒绝。在隔离 ArkWeb 触发脚本资源 404，核对错误分类并关闭回到原生测试页面。rc2.61 未签名产品包已编译，现场采集仍待验证。[启动资源诊断](../evidence/workspace-rc261-boot-assets-validation-20261108.json)
- [x] 离线预演 rc2.59 到 rc2.61 的原位升级及简报启动采集。现场入口沿用恢复后的桌面包，仅在新授权和同一加密连接上尝试打开简报。[升级预检](../evidence/workspace-field-rc261-install-preflight.json) · [简报采集预检](../evidence/workspace-field-rc261-capture-preflight.json)
- [x] 在标准 Web 启动链路中对照脚本 404、插件激活异常和成功挂载。确认前两种故障都报 `renderer-boot`，只有脚本 404 增加资源错误计数。[启动故障对照](../evidence/workspace-standard-boot-failure-differential-20261108.json)
- [x] 修复清单声明非空的静态资源接受 200 空正文的问题。长度校验拒绝错误响应，真实空文件仍可读取，后续正确字节正常缓存。84 项原生替身检查通过，rc2.62 未签名包经 API 26 编译。[原生替身回归](../evidence/workspace-native-1794149101505.json) · [构建回执](../evidence/native-build/2026-11-08T14-45-22-222Z.json)
- [x] 隔离 ArkWeb 用已提交代码复验合法空文件、错误空响应、后续正确样式生效和关闭返回。恢复原测试包。[ArkWeb 空响应复验](../evidence/workspace-arkweb-empty-manifest-rc262-20261108.json)
- [x] 按授权原位安装 rc2.61，验证原配对在连接恢复后读取置顶简报原生正文。[连接采集](../evidence/workspace-phone-rc261-connection-20261108.json)
- [ ] 真机标准 Web 复验仍需本轮连接标记或可核验的桌面授权基线。本轮两次采集均在点击前停止。[严格采集](../evidence/workspace-phone-rc261-boot-assets-boot261a.json) · [限时回执采集](../evidence/workspace-phone-rc261-boot-assets-boot261b.json)
- [x] 在离线预演中将 DevFlow 目标绑定到获准创建的空白会话，按完整会话 ID 区分同名选项。分阶段核对保存、重开、恢复及原会话类型，22 项通过。[现场预检](../evidence/workspace-field-rc259-devflow-checkpoints-preflight-20261108.json)
- [x] 修复工作区对 205 空响应的重建错误及 `HEAD` 拒绝响应携带正文的问题。传输、标准插件 Chromium 和双端编译通过。rc2.60 同字节工作区脚本在隔离 ArkWeb 通过响应及关闭返回检查，真机仍待验证。[响应兼容验收](../evidence/workspace-response-bodies-validation-20261108.json) · [ArkWeb 响应回归](../evidence/workspace-rc260-arkweb-response-bodies-20261108.json)
- [x] 在隔离 Chromium 的文档桥模拟 Rich 接受回执丢失。关闭并重开工作区后按原动作 ID 查到状态，草稿恢复，无重复提交或额外回放。[回执丢失回归](../evidence/workspace-rich-receipt-loss-reopen-20261108.json)
- [x] 在 P-256 加密回环暂扣 Rich 接受回执并断开数据连接。新握手和授权后用原动作 ID 查询，草稿与账本状态一致，Host 只分发一次。[加密回执丢失回归](../evidence/workspace-rich-encrypted-receipt-loss-20261108.json)
- [ ] 按获准的日常版本和原配对复验 DevFlow 会话级保存、重开读回和恢复继承。只在已建的空白验收会话确认范围和目标后保存。先检查工具箱是否列出该会话，若须临时改类型，按授权在完成后恢复原类型并读回原模型选项。[现场预检](../evidence/workspace-field-rc259-devflow-checkpoints-preflight-20261108.json)
- [ ] 用匹配的调试描述文件和固定回放验收真机 Rich 动作，另验官方及第三方标准原包。Rich 提交和自动修复会进入 Agent 队列。[隔离包预检](../evidence/workspace-rc254-isolated-field-replay-preflight.json) · [rc2.57 插件行为复验](../evidence/workspace-rc257-latest-plugin-actions-emulator.json)
- [x] 验证同路径的桌面 WebServer 处理器与设备 Gateway 独立分流。即使设备载体附带有效的隔离浏览器 Cookie，仍按设备会话权限执行，旧路由处理器不接收设备请求。官方翻译原包设置可用。[同路径权限对照](../evidence/workspace-prototype-1794146000358.json)
- [ ] 第三方包的其他手机界面。用户已接受暂缓 `skills-manager` 手机界面，技能在电脑端安装。依赖旧 WebServer 路由的插件仍需桌面适配器及相应授权验收。软键盘真机复验、性能和内存仍待验收。生产连接与页面验收见本页首段。[旧路由设计](standard-plugin-workspace-plan.md#两个先决验证)
- [x] Rich 与 DevFlow 候选已按用户确认合回原仓库，均只在本地提交、没有推送：DevFlow 在 `dsh_plugins` 的 `5d321d0`（另把工具箱类型检查拆成 host 与 toolbox-access 两个程序，修复候选新增测试带入 Host 类型造成的 TS2352）；Rich 在主仓 `lumina` 的客户端承载层改动（`packages/experimental/rich-inline`，README 承载层段落按文档预算移入实现细节，补接口与 JSDoc，不含私人封装的 `harmony.1` 版本后缀），并在 `dsh_plugins` 的 `040112f` 同步镜像、登记兼容提交，67 个受管文件与主仓零漂移。Rich 测试 167 项、oxlint 与类型检查通过；DevFlow 单元 265 项、client 36 项和组合检查通过。Connection 候选已作废。未推送；后续授权的日常安装见本页首段。
- [ ] 真机验证 `navigator.onLine`：现有 bundle 已原位升级 rc2.40，真实加密连接及标准 Web 启动流程可达，但插件启动失败。尚未独立观察系统误报与壳层覆盖的对照结果，不以模拟器结果代替；见[当前部署与边界](workspace-review.md#当前日常部署与真机边界)。
- [x] 定位 Chromium Rich 主测试的结算断言间歇失败：接受回执后的 15 秒窗口早于实际轮次结束。按输入认领到 Agent 空闲的明确区间同步，用屏障验证轮次结束前／后的动作状态，三项检查通过，四次固定回放、Host 原字节保持；见[结算诊断](../evidence/workspace-rich-settlement-diagnosis-rc238.json)。


> 当前模拟器接入（2026-11-02）：dsh-emulator 独立配对；长时间跟随、房间到期续接、桌面重启恢复、跨重连草稿、模拟器新建及消息已通过实际验证。桌面 rc2.33 与模拟器已整合 4 MiB 历史容量和设置入口，旧“MVP体验”历史／富内容、切换后消息、原生停止及再次自然续接通过；原真机配对和数据保留，真机未更新。真实模型停止确认仍可能等待几十秒，后台和完整富内容操作未验收。见[整合结果与边界](../evidence/mobile-coordinated-20261102.json)、[933 秒稳定性验证](../evidence/emulator-stability-20261102.json)和[恢复命令](../emulator-dev/README.zh.md)。

> 当前任务（2026-11-02 会话列表管理）：[rc2.32](session-list-manage-rc2.32.md)已完成并双端安装：手机新建（无项目／项目内）、置顶、归档与取消归档真机逐项通过，桌面 workspace.json 同步落地；最近／项目双视图、搜索、筛选和分组折叠可用，全程零模型消息。手机锁屏后载体断开需重开应用；桌面 /device 命令缺失原因未查；两个验收空会话留在桌面待用户清理。下文为阶段历史。

> 历史任务（2026-11-01 会话误报）：[手机 rc2.31](session-catalog-ready-rc2.31.md)已修正连接提前发布造成的目录误报并原位安装，原配对和数据保留；原机“手机MVP体验”首次及再次打开无顶部错误。旧“MVP体验”往返仍会触发断连，未认定全部修复，当前已恢复到可用会话。下文为阶段历史。

> 历史任务（2026-11-01 自动连接）：[固定设备自动连接](paired-connection-rc2.30.md)已完成原签名原位更新、桌面插件更新和原中继常驻启用。原手机启动后自动连接并显示真实会话，无新路由交换、无连接按钮点击、无消息发送；原配对、UID、数据及深色 UI 保留。先前等待／锁屏后的清理失败保留记录，恢复及长期续接仍待日常核验。下文为阶段历史。

> 历史任务（2026-11-01 深色界面改版）：[会话控制与深色界面改版](ui-redesign-20261101.md)已完成：固定顶栏、一键连接、Markdown 回复、跟随最新、多行输入和具体错误提示。模拟器镜像已不存在，改在原手机用假数据预览包自测并修复六个问题；随后用原签名材料原位安装 rc2.28；错误横幅移到固定顶栏后再安装 rc2.29，UID、配对和数据保留。下一步由用户连接真实桌面体验，真实会话、回复与 rich 区块尚未验收。

> 历史任务（2026-11-01 rc2.27 MVP）：[原机 MVP 已通过](mvp-rc227-a2-20261101.md)：手机从真实目录进入“手机MVP体验”，两次发送分别完成新回复及运行态停止，50 次观察覆盖 181.8 秒连续连接。沿用桌面 rc2.23／手机 rc2.27，未重装，原配对、UID 和数据保留。双端停止、路由撤销、中继／代理原字节恢复及亮屏恢复均已核验；窗口已关闭。下一步优先定位回复、取消确认等待和减少连接准备步骤，单次成功不等于长期稳定性通过。下文为阶段历史。

> 当前任务（2026-10-30 UI 适配器）：[桌面与手机适配器](connection-ui-adapters-20261030.md)已接入启动协调逻辑，完成双端连续提交、各阶段取消、迟到调用、超时及 pending／failed 收尾的离线回归；正常产品确认和原对象核对保留，等待原调用完成后才执行独立停止验证。本轮未操作已安装应用、HDC、原配对、数据或中继，没有重开窗口；实际 UI 与持续连接仍未验收。

> 当前任务（2026-10-30 实机窗口）：[本轮唯一连接](rc216-window-20261030.md)已执行并关闭，首次明确失败为 control-handshake/timeout，目录 0，未重连或调用模型。手机已完成挑战/身份校验、原签名及发送，未观察到房间回执；双端启动至少错开 21.797 秒，超过中继 10 秒挑战期限，属已知操作干扰，不能认定唯一产品根因。原配对保留，双端停止、route 独立撤销、中继配置恢复、5 个 reader 退出及输入核空均通过。本轮授权已消耗；先离线验证启动时序，再决定新窗口。

> 本地准备（2026-10-30）：[本地只读核对](../evidence/rc216-offline-preflight-20261030.json)通过：桌面实际 rc2.16，device 与 feedback 运行，108 个安装文件匹配候选；原手机 rc2.16、原 UID、同一进程，已配对未连接、连接禁用，候选哈希未变。仅恢复已授权的 HDC 查询，没有连接、配置修改或重装。连接观察回归 4/4 通过；[下一轮限时验收范围](rc216-next-window.md)已准备，原中继当前状态尚未核对，窗口未获新授权。

> 安装记录（2026-10-29）：[rc2.16 授权安装和离线核对](rc216-installation-20261029.md)完成：桌面 Harmony rc2.16，device 与 feedback 运行；手机复用原证书原位安装 rc2.16，UID 不变，两端冷启动通过，桌面状态 bound、手机已配对且未连接。绑定和历史文件大小一致，原配置与现有改动保留。未准备路由、连接、重配或提交模型任务；稳定连接及真机交互仍待新窗口授权。

> 历史任务（2026-10-28）：用户确认[已安装 `.2`](installer-repaint-20261028.md)正常启动。权限持久处理已补入安装器源码，解压前准备暂存目录 RX，失败保留旧安装；原生回归、10 项 NSIS 场景及 14 项单元测试通过，尚未重打完整候选。现安装版、原 profile 和配对未改动；原配对恢复与 rc2.16 实际激活仍未核验，安装器启动来源登记差异尚未解决。未改手机／中继或开启实机窗口，旧窗口见[主交接](HANDOFF-2026-10-28.md)。下文保留阶段历史。

- [x] rc2.14 原存储锁恢复、原签名原位更新及正常冷启动配对复用已通过；未重配、未联网。[验收与剩余范围](storage-lock-recovery-rc2.14.md)。

- [x] rc2.13 启动只读诊断、定向回归与未签名候选封存完成；[验收范围与限制](acceptance.md)。实际安装和真机原因核实尚未执行。

- [x] 当前 Host 的 /harmony-pair 与原生旧/新范围管理已实现；新增4项检查含历史防绕过均通过，断线轮整轮11/12（一个既有用例超时），不重复已完成的12项/187模块检查。官方复编与剩余30分钟限制见[接入记录](normal-product-entry.md)及[本轮验证](../evidence/normal-product-controls-validation.json)。
- [x] 原超时用例按原限制单独重跑通过；29个精确peer、独立测试入口、显式新会话命令及5项隔离检查已完成。安装版alpha.4公开API和实际插件包均完成三响应/rich合成闭环；[当前产物](../evidence/normal-controls-artifacts.json)与[首次真机清单](first-device-acceptance.md)齐备，未安装、签名或激活。
- [ ] 审阅新构建、确定实际普通 Session 与一次部署授权；固定两条 nginx 路由可避免每轮切换，但现有静态 relay pair 续期仍需维护/重启。无实际配对/安装/网络操作，保持撤销10/活动0。

- [x] Phase76唯一8→9→10已执行并安全关闭；HUKS签名/验签通过，上传审批拒绝后停止依赖操作并完整清理。控制/数据认证、任务及rich仍未验证；不能用已撤销9续跑，不自动开启11，见[单窗口收尾](phase76.2-field-closeout.md)。

- [x] Phase76现场安装和预授权收尾：原签名安装成功、HUKS/完整7保留；具体挑战签名在一次证据重试后仍被自动审批拒绝，依赖步骤停止并核验全部清理。未创建grant9，不虚称撤销10。后续具体签名批准及真机认证/任务/ArkWeb仍阻塞，见[现场收尾](phase76-field-closeout.md)。

- [x] Phase76完整离线候选：原手机/桌面完整7分别验签，8→9→10真实授权owner的内存测试，强制一次性手机就绪、桌面同源控制器闭包、固定诊断采集、完整复核/操作器封装。未进行现场操作；批准范围与真机阻塞见[完整候选](phase76-complete-candidate.md)。

- [x] Phase76离线：重建可证时间线及未知项，对比72/74/75；复现并修正手机准备晚于桌面有限重连预算的操作顺序；修复message错误无data时的先访问缺陷，补有界阶段/错误码、15项新控制诊断、4项HTTP和78项memory/history回归、strict及独立SDK候选。见[控制诊断](phase76-control-diagnosis.md)。
- [ ] Phase75现场唯一根因尚未证明；缺少控制签名、实际发送和relay验签阶段。不得把离线复现当作实机根因或任务/ArkWeb通过，下一次现场仍需独立批准。

- [x] Phase75现场：原签名保留数据安装、原HUKS、新挑战签名、最终grant7/历史3条保存及离线重开读回、六字段中继上传。唯一窗口08:28:04.538 UTC起，08:33:38.882 UTC撤销至8；活动0、手机正常退出、原服务/nginx/public配置恢复复核完成。见[实机收尾](phase75-field-closeout.md)。
- [x] Phase75恢复：修复文件Buffer/字符串比较，保留旧operator，relay-only更正执行恢复；127项Host测试通过，原封存操作器再次验证恢复成功。
- [ ] 手机control首帧后的认证超时尚未定位；没有手机任务派发或流式/ArkWeb/去重/草稿/重连/取消真机证据。先完成离线诊断和回归；下一次现场窗口需以桌面撤销8、手机完整grant7为起点另行批准，禁止复用或自动续开。

- [x] Phase75.1: complete the executable approval-gated operator, separate relay-only bundle, new closed alpha4 history preflight and expiry cleanup,119 offline operator cases and detached four-response replay. See [complete candidate](phase75-operation-candidate.md).
- [ ] Execute only after unified explicit approval and fresh preflight; verify actual phone3→7, original Session outcomes, revoke8/active0, normal phone exit and service/config restoration.
- [x] Phase75: complete shared/native signed-history verification,56 synthetic regressions with the actual authorization owner and ETS SDK substitutes,177-module strict check, official API26 unsigned build. See [candidate](phase75-complete-history.md).
- [x] Phase74: prepare an independent inactive operator with exact epoch4→5→6, a new pair/state directory, original binary reuse, bounded maintenance and refusal on conflicting history/locks; see [operation plan](../operations/phase74/runbook.md).
- [x] Phase74: pass90 revised operator cases, one actual-owner synthetic epoch test,175-module strict check, scoped new-TS lint, SDK helper/Java checks and root build:check. Preserve73.1 HAP/ZIP unchanged.
- [ ] Phase74.7 installed73.1 with the original HUKS identity and retained v2 record, then committed the single grant5 at06:46:14 UTC. Automatic review twice refused the six-field public-pair upload; no connection or task ran. Grant5 was revoked to6 at06:48:26 UTC, active0, normal phone exit and original service/config restoration verified. See [field closeout](../evidence/phase74.7-field-closeout.json). The [read-only refusal and history plan](phase74-refusal-and-history-plan.md) records exact payload/destination and the required missing-generation repair; never reusegrant5 or create another window automatically.

- [x] Phase73: reproduce the old agreement failure, select documented ECC256 and cross-check RFC5903/HKDF/GCM bytes through WebCrypto.
- [x] Phase73: separate ready/hello/key/finished/deadline/HTTP refusals with fixed diagnostics; pass21 focused and9 HTTP/proxy tests.
- [x] Phase73: pass174-module strict checking, scoped TS lint, official API26 unsigned build and67 fixed-replay integrations without real models.
- [x] Phase73: repair the related README pair and obsolete ws type-path override; preserve the frozen899-file candidate and revoked epoch4 evidence.
- [ ] Phase73: review the independent unsigned candidate, then obtain exact next-device-window approvals; read original v2/private-file state first. No install/deployment/grant is authorized in this batch. See [report](phase73-data-channel-repair.md).

Earlier checkpoints below do not override phase73 offline qualification or the phase72 physical failure.

- [x] Phase72: execute the explicitly reapproved frozen alpha4 profile once; verify original-identity proof and native v2 successor save.
- [x] Phase72: observe real control/data upgrade and first frames; retain the subsequent data-close and retry503 failure.
- [x] Phase72: revoke grant3 to durable epoch4/active0, stop only the owned phone app, restore original relay/nginx/public field config and verify retained histories.
- [ ] Phase72: verify the documented ECC256 agreement parameter and strict SDK argument checks; diagnose data first-frame closure/failed normal exit offline in a separate candidate. Phone private trust-file/lock state after forced stop remains unverified; preserve it.
- [ ] Phase72: complete task/stream/ArkWeb/action/duplicate/reconnect/cancel on the real phone after the next separately approved window. This single window is consumed; see [closeout](phase72-native-data-closeout.md).

Earlier phase checklists below describe their own checkpoints and do not override phase72 qualification.

- [x] Phase71: verify the original installed HUKS public identity, retained public document and native expired-record rejection.
- [x] Phase71: add19 pure public-scope review checks and cleanly exit the phone/restore the public field configuration.
- [ ] Phase71: obtain directly recognized live-execution approval, then fresh bounded grant3 and actual end-to-end acceptance; see [blocker](phase71-native-trust-and-approval-block.md).

- [x] Phase70: verify all frozen hashes, sign once with original materials, verify23 payload entries and install once retaining data.
- [x] Phase70: qualify the approved relay/proxy without a live pair, then restore original service/nginx and verify revoked epoch2.
- [ ] Phase70: manual phone unlock, original HUKS/public-trust checks, fresh single grant3 and real phone end-to-end acceptance. See [status](phase70-approved-pregrant-preparation.md).

- [x] Phase69: preserve expired public generations; verify desktop-signed explicit successors and the original durable revocation epoch.
- [x] Phase69: combine diagnostics, Origin restrictions and renewal into one unsigned, inactive, hash-sealed candidate.
- [ ] Phase69: obtain separate signing/installation, relay-maintenance and fresh bounded authorization approvals; complete actual phone end-to-end acceptance. See [candidate](phase69-successor-candidate.md).

- [x] Phase68: reproduce control-upgrade Origin rejection; verify explicit default-deny compatibility with fixed four-response journeys and retained revocation records.
- [x] Phase68: prepare inactive relay/public-tool and unsigned native diagnostics candidates. See [evidence and limits](phase68-connection-diagnosis.md).
- [ ] Before another field window: explicit expired-public-record successor flow, candidate approvals and physical acceptance remain pending. No identity/history reset or grant renewal is permitted.

- [x] Phase67: original native enrollment signature and local pairing verified; expiring desktop grant revoked and relay restored.
- [ ] Phase67: connection stage diagnosis, native end-to-end task/rich/stream/reconnect/cancel acceptance remain blocked. See [closeout](phase67-field-closeout.md).

Current work: [phase66](phase66-progress.md). Preserve the completed installation; finish the fixed-world owner acknowledgement and fresh reply-directory rebuild, then perform the approved fresh enrollment and bounded replay.

# 当前离线产品任务

- [x] Phase60：主机只读识别原手机 USB Connected/型号匹配；按原批准只执行一次原位安装，f92c2104…包不变，原 HUKS 公钥复验一致。
- [x] Phase60：诊断启动确认应用运行；新鲜挑战输入逐字核对、预览生成；完整确认未通过，签署前 STOP，未创建 grant。
- [x] Phase60：固定坐标滚动改为自有视口内手势，4项全屏/小窗/无效输入测试通过；后续动作在目标校验处停止，修正后手势未在真机执行。
- [x] Phase60：真实主机 HDC 后续返回 [Empty]，原手机 USB 接口未枚举；field进程0、grant0、无计时、模型0、项目操作0；[实际证据](phase60-installed-hdc-disconnection.md)。
- [ ] Phase60：恢复原手机连接后复用已安装包/原身份，完整展示预览，签发新鲜挑战并首次验证修复包的 HUKS 签署；不重复安装、重签或创建身份。
- [ ] Phase60：完成原单Session限时闭环及手机退出/临时调试文件清理；手机退出目前不可确认，不能当作已关闭。
- [x] Phase59：11:04 UTC 明确安装批准已记录；精确 unsigned 输入、原材料、官方签名/应用验签/profile 验签及 23 个应用条目通过核对，签名仅执行一次。
- [x] Phase59：新增 .pages.info 元数据已核实并固定哈希，7 项篡改/缺失/未知增加等拒绝测试通过；原失败保留，后续只恢复验证。
- [x] Phase59：签名前后 HDC 仍缺原手机，未安装、未执行手机命令或 HUKS 签署、未启动 field，grant0/无计时；[当前证据及恢复步骤](phase59-approved-signed-offline.md)。
- [x] Phase59 候选已在 Phase60 原位安装并复用原公钥；HUKS签署与原限时闭环仍由 Phase60 未完成项跟踪，不重复索取安装批准。
- [x] Phase58：获批 util 修复签名、官方验签和原位安装；真机编码、桌面签名核验、完整预览与原身份复用通过。
- [x] Phase58：一次 HUKS 签署未取得证明后停止；grant0、无计时、隔离桌面退出；手机最后成功检查已退出，当前原批准目标未连接。
- [x] Phase58：用途修复和有界诊断通过 10 项专项、22 项现有回归、9 项合成集成，以及官方 API26 unsigned 编译；原中继与源码差异已核对，封存含 9 份回退文件。
- [x] Phase58 候选已在 Phase59 获明确安装批准并完成签名/验签；原位安装和真实签署仍待原手机连接，不删除旧一次尝试标记，不自动创建 grant。
- [ ] Phase58：真实配对、限时 grant、固定 replay、ArkWeb 富交互、去重恢复与失效仍待逐项真机验收；[当前证据与后续范围](phase58-native-sign-purpose.md)。
- [x] Phase57：[解析诊断版签名/验签/原位安装](phase57-native-util-binding.md)、原身份复用及新鲜挑战复验完成；失败定位在共享UTF-8适配器调用。
- [x] Phase57：确认JavaScript Kit编译绑定错误，修正共享util默认导入及空串编码，两个核心重建；22项单元/SDK替身、9项合成流程、9项新旧对比、官方API26编译及编译产物检查通过。
- [x] Phase57：首次回归旧错误文案断言失败已保留，更新准确拒绝阶段后重跑通过；真实进程0/grant0/中继原状核实。
- [x] Phase57 候选已在 Phase58 获批签装并通过真机编码、预览和验签；挑战签署阻塞及新候选资格见 Phase58。
- [x] Phase56：[获批诊断签名/验签/原位更新](phase56-native-parser-refusal.md)完成，两端已有身份复用，真机parse-offer/SyntaxError已复现。
- [x] Phase56：固定{}复验、SDK替身/官方语法探针、解析细分源码、10项回归、9项新旧对比、严格TS及官方API26 unsigned编译完成；根本原因仍未知。
- [x] Phase56：field在提交手机证明前退出，手机正常退出，进程0/grant0/中继原状核实；没有开始30分钟计时。
- [x] Phase56：细分候选已获批准并在Phase57签名原位安装，具体失败步骤已取得；功能修复候选资格见Phase57。
- [x] Phase55：[已批准修复的应用签名/验签/原位更新及真实HUKS公钥复验](phase55-installed-huks-and-preview.md)通过，复用原电脑身份，无新增权限、卸载或清数据。
- [x] Phase55：修正官方UI文本输入转义/追加行为，逐字段核对公开挑战原样输入；真机预览仍拒绝，保持零grant。
- [x] Phase55：固定阶段码/公有转录摘要诊断通过5项回归及官方API26 unsigned编译；原有验证、确认、身份及协议不变。
- [x] Phase55：原始可见错误、现有日志和输入校验的定位范围已记录；固定标记采集器3项测试通过，后续不再落盘原始HILOG。
- [x] Phase55：该诊断候选已获批准并在Phase56签名/原位更新；只读复用两端身份，读取实际拒绝阶段，后续阻塞见Phase56。
- [x] Phase54：[实际首用与HUKS语义修复](phase54-real-first-use-blocker.md)：核验封存字节/本机/原手机，保存一个Windows DPAPI测试身份，服务保持原样；未发放grant。
- [x] Phase54：原始错误先复现，hasKeyItem修复后8项适配器及9项合成交互通过；官方API26 unsigned候选编译通过，公开源码仅NativeDeviceKeys变化。
- [x] Phase54：修复版签名/同bundle原位更新批准已执行；已有电脑alias/world及手机公钥复用通过，后续预览阻塞见Phase55。
- [x] Phase53：[封存原始表单实际点击和时限修复](phase53-original-field-interaction.md)，默认 SDK actionId、9项交互/拒绝用例、8项双进程恢复、同一 `.4` 解压字节的脱离仓库启动与工具冒烟通过；旧包和客户端时限不变。
- [x] 更正确认范围：具体操作获得用户批准后，代理可以操作普通 TTY/原生产品确认；不改或绕过控件，不推定身份、授权或服务器激活已获批准。
- [x] 原生产品 UI、公共信任 owner、桌面本地 provider、有限控制恢复和端到端固定 replay；异常清理及独立复核。
- [x] 类型检查、owner-local 用户流程快照、官方 API26 unsigned 编译、一次完整源码/回退封存。
- [ ] 对应批准后的真实身份及 scoped grant 初始化、选定安装版本/provider 激活。
- [ ] 对应批准后的中转部署、TLS/Linux/文件同步/断电验收。
- [ ] 对应批准后的签名、必要权限、安装；实际手机 API/HUKS/ArkWeb/前后台及手机到桌面幂等闭环。

范围和现场证据见[离线产品验收](offline-product-acceptance.md)。真实模型仍禁止；下列前代任务清单是历史记录。

# 任务清单

第八轮[原生记录](phase26-round8-native-attempt.md)已清理，socket 仍 blocked。v25 私有诊断要求非负游标，与 wire/新 FollowJournal 合法初值 -1 不一致；本轮原机没有有效 view，socket 故障未注入。

- [x] 保留两次准备阻塞与最终 initial follow/native-port-failed 的原始证据，原起点 14 分 13.635 秒内全清理。
- [x] 同一保存会话真实源码产出 relay=-1/domain=35，SDK 替身复现两个私有诊断误拒；原 HAP/校验不改。
- [ ] 离线独立对齐诊断的合法 cursor 范围，覆盖 -1/0/非法值及错误呈现，再审查替代 HAP；当前不激活原生资源。

第25阶段的[Socket 离线排查](phase25-socket-offline-trace.md)保留视口定位不足及当时的接收缺证据；最小定位与分层诊断的实际执行结果见第八轮，其他功能不扩展。

- [x] 逐层保留第七轮故障写出、HTTP、rows=7 与历史行控件证据，明确最早接收缺证据。
- [x] 原合成 Session 的纯内存重建得到六条持久行加原样 live 探针；保持 cancelled，原日志不改。
- [x] 原生最新消息精确定位、byte/decoded/admitted/published 诊断、完全可见原样文字与任务状态判据。
- [x] 官方 API26 unsigned HAP、70 模块 strict TS、12 项观测/驱动、2 项 SDK 替身与 14 项源码 BFF 回归。
- [x] 第八轮已按批准范围执行 v25 前置读取；私有诊断误拒合法初值使 socket 阻塞，未取得列表/探针资格，原窗口已关闭。

当前[第七轮复验](phase24-round7-native-attempt.md)为两通过一失败：gap/conflict 准确拒绝、只读与禁用提交通过；socket 原样探针文字在首次和同窗补验均缺失，不能凭写出/行数改判。原窗口已关闭并清理，不再重开；历史结果保留。

当前[有界时钟修复](phase23-command-lifetime.md)已在相同 v23 HAP 上执行三项复验；本场景零 elapsed/future-limit。桌面原 60 秒上限不变，生产授时/跨进程 grantEpoch 与真机仍保持各自前置要求。

- [x] 审计 epoch-ms、命令生成/恢复重开、固定事件时间与驱动等待；封存六条原生过期记录及 249 次日志时序核对。
- [x] 单次时钟采样、桌面端 elapsed/future-limit 诊断、独立 consumed/written 计数；保持过期拒绝与有限故障预算。
- [x] 严格 TS、62 项相关测试、10 项真实服务离线回放通过；保留沙箱 EPERM 前置失败及原样 host 重试证据。
- [x] 第六轮捕获五组完整生成/发送/接收/判定时刻，确认三个新读取为 future-limit，未来超出量 404/375/358ms；许可不变、零派发和清理证据封存。
- [x] 在现有协议中实现显式偏差预算与单调锚点：60s - 5s - 2×1s = 53s；桌面上限、过期拒绝与任务/动作去重保留，预算/跳变/延迟/恢复/重开测试完成。
- [ ] 若引入真实授时、配对或跨进程 epoch 更新，先审查信任与公开协议；当前 mock 没有完整跨进程通用防重放承诺。
- [x] 第七轮完成 cursor-gap、cursor-conflict 原生准确错误、readOnly、固定提交禁用与零新派发证据。
- [x] 封存第七轮两次 socket 失败、49 条命令时间配对、原 lease 继承、许可不变与全部清理证据。
- [ ] 离线定位 socket 原生探针文字缺失；限定四次 List 滑动未解决，不能用写出/rows=7 或 Node 回放替代正验。

第十二批历史记录见 [私有 HTTP 字节接口与网络批准事实](phase12-private-http.md) 和 [汇总](../evidence/phase12-summary.json)，其151项独立测试/87项Chrome断言仅适用于当时构建，未包含第十四批原生网络修复。

续接目录是 `D:\workspace\agents\deepseek-harness\clients\harmony-mobile`，仅写本目录，原第一批 Temp 工程与 v1 ZIP 保留。无需变更已有主仓 dirty 文件或操作之前实现线程。任务清单按当前完成状态列出；未授权的步骤继续保留为阻塞，不能因用户不回复而执行。

- [x] 记录主仓 commit、branch、dirty 状态和相关规则。
- [x] 官方DevEco Windows26.0.0.851完整下载、独立保存、本地SHA-256及安装程序有效华为签名核验。
- [x] 用户完成官方IDE安装，复用实装IDE/SDK/API/Hvigor/plugin/ohpm/hdc；记录版本与路径，不代接受新许可。
- [x] 实装SDK配置校验、启动页资源及ArkTS显式DTO字段修正；保存失败诊断与最终unsigned HAP、原生输入哈希。
- [x] 封存第十批客户端134独立用例、79Chrome断言完整回归；真实模型/上传为零，23个原生SDK替身/核心用例及旧安全子集包含在总数内。
- [x] 按专项批准接受恰好两份官方许可、完成API26 Phone镜像下载和隔离实例启动；unsigned HAP安装/执行，保留许可/安装/原生日志与截图。
- [ ] GUI导入/首启状态确认与官方preview；CLI模拟器成功不代表IDE窗口已验证。
- [x] 检查相关工具/工程路径，核实官方当前工具来源；记录用户 Mate90 Pro Max / OS7 / 蜂窝要求。
- [x] 审计 Web/SDK/stream/rich-inline/审批的实际接口与限制。
- [x] strict pureTS mock、canonical rich 类型和 parser/guest SDK 源码复用。
- [x] task receipt/replay/projection、draft CAS、action 去重、readOnly 与 scoped bridge 自动测试。
- [x] 临时 loopback mock 测试，按授权限定测试范围并关闭 listener。
- [x] ArkUI shell/ArkWeb scripts-off preview 源码及 HAP-local 资源生成。
- [x] Chrome fixture 交互、15 项断言与 360/480 px 可视 QA；结果不计为 ArkWeb。
- [x] 真实 source Loader/SessionController/RichInline 回放组合、四响应精确消费、upload skip 与第五次 hard-block；只处理本批新 Session。
- [x] AdmissionJournal 写入先于 prompt、真实接受后确认丢失恢复、磁盘 Context 重开、原 action 不重执行；损坏/缺失/错 key/错版本失败关闭。
- [x] 两个独立测试进程的真实 Gateway BFF 回环：帧、背压、容量、取消/超时、scope、action 去重与 reconnect；真实模型/上传为零。
- [ ] 用受支持 `dsh` profile 再验证完整 Web Connection/标准 mux/SDK 传输；现有 source Loader 与限定 BFF 不代表已启动这些层。
- [x] canonical Session/Rich service ports 与受限 desktop adapter；纯内存两端出站 relay/phone core，硬拒绝真实环境与任意 RPC。
- [x] 23 个 link 用例：流式 revision、断线/后台、离线桌面、重复派发、unknown admission、CAS/action/status、历史重开、scope、TTL/队列、并发 mount 上限、过期审批展示、revoke、晚到 mount、清理失败与重试。
- [x] `node scripts/demo-link.mjs` 保存合成任务/富块闭环证据，task/action 各受理一次，revoke 后 mounts 为零。
- [ ] 短时配对 proposal、双方可信 UI 确认、设备密钥与身份固定、真实鉴权和 E2EE；当前 fixture grant/epoch/revoke 不代表配对已实现。
- [ ] 完成平台中立 rich carrier 的最小扩展方案，验证全部消费者及 upgrade guide 需求后再在独立 worktree 改 DSH。
- [x] 有界 NDJSON、维护中的 Gateway stream envelope parser、owner/generation/cursor 验证；native source fixture/连接状态字典，默认连接禁用。
- [x] 当前 Session/rich decoder 和共享手机语义投影；真实 BFF → PhoneCore → Chrome guest SDK → 实际 rich 草稿/action 闭环；未知事件、版本/hash 降级、fork cut 和非法/超量/scope 负例。
- [x] 原生项目/会话/任务/断开/错误/待确认源码，共享生成视图；默认 Disabled provider、受限 port 接口和 scripts-off 实际富块资源。
- [x] v1–v6 ZIP历史hash、源文件/用例连续性核对、冻结输入后的统一全部客户端回归入口，无测试退休；嵌套子进程不重复计数。
- [x] scoped project/Session不可变分页、canonical历史补页、20行稳定消息视口/锚点、Node持久离线只读恢复、尺寸/byte/pixel/TTL有界图片handle；真实合成读服务不调用prompt/upload。
- [x] Chrome360/480/1080共享同一富代码/SDK，focus、草稿、动态图表、局部代码滚动、新revision重挂载、history/readOnly与action一次接纳；截图人工检查。
- [x] ArkUI长列表/缓存/图片错误占位源码与共享生成fixture，默认native read禁用；DevEco preparation/first build清单和相关范围preflight。
- [x] 默认共享native provider拒绝未配对；configured-https硬拒绝；生成受信入口排除mock身份与网络实现。
- [x] 无IO本地审批预检及未配对/撤销/过期/超scope、Session/action/revision/expiry、伪native确认负例；不产生执行许可。
- [x] 原生运行容器/network/cache/port责任矩阵与官方声明获取失败记录；精确SDK待办，未添加猜测平台API。
- [ ] 完整消息投影插件、无限历史的语义窗口策略、pendingManifest确认、离线多端草稿冲突UI；native真实列表/缓存/图片/HTTP/port、生命周期、键盘和敏感审批验收。
- [x] 使用实际安装SDK检查ArkTS并生成unsigned HAP；复用官方本地构建组件，输入哈希一致。
- [x] 原生本地ESM/hash白名单、私有port、固定cache/UTF-8字节、失效代际/有期限关闭与foreground仅本地加载；实际SDK编译、23个SDK替身/核心测试及24项Chrome跨层断言。
- [x] 官方API26实际ArkUI、ArkWeb本地ESM/精确document/port握手、合成任务流式与rich默认表单完成、原生正常FS/cache恢复与跨Session拒绝；后台重载不自动重连/派发。
- [x] 第十一批125 Node+9 source+8 BFF=142独立用例及87Chrome断言；新增native HTTP byte共享decoder、真实服务四响应与持久重开零派发。
- [x] 第十一批原生权限拒绝及固定恶意guest子集、旧会话display publisher撤销；具体实际资格见本批记录。
- [x] 未激活 native SDK→ESM 有限 HTTP 字节 port、队列/代际/EOF/status/header/清理测试；9 项新测试及真实服务私有 port 回放通过，禁止任意 URL 或 guest IO。
- [ ] 取得INTERNET及具体emulator-host通道批准后，做原生→真实测试BFF四响应链；转发/监听/安全设置另行批准。
- [ ] 新小艺输入法声明/模式专项授权后做IME编辑；完整恶意source/port、原生HTTP成功、IO失败/强杀/旋转、Instrument/Hypium与真机仍需独立证据。
- [ ] 真机模拟任务 → 真实桌面 replay execution → rich 表单闭环，然后在批准的 WAN 环境做蜂窝最终验收。

后续对应批准：① 小艺输入法新声明及模式、新工具组件或许可、虚拟化/安全设置；② 真机USB/无线调试、INTERNET权限与安装；③ debug signing账户/证书材料；④ 真实桌面profile addon启用与配对、持久凭据存储/撤销；⑤ relay的位置、运营与费用、证书、部署、网络/安全设置；⑥ 任何真实模型试验。官方IDE/必要SDK及本批两份许可/API26镜像/unsigned模拟器安装已有专项批准，不重复索取，也不扩大到上述步骤。此阶段不调用GLM；若未来用户要求GLM，先核实订阅无额外费用再另安排。不上架、不push、不付费。

回退：测试自有listener/browser已关闭，本任务模拟器已通过官方CLI停止，owned PID与16311监听已释放；镜像/实例和合成缓存保留。复用用户已装工具，不停止用户IDE/共享hdc，不改长期服务、插件或profile。保留源码/evidence，原Temp/v1–v10 ZIP及本批v11可用于比对。未init嵌套git、未commit、未push；删除或移动工程不是本批执行的一部分。

- [x] Phase15：复用上游严格 source/tool 投影与 SurfaceManager；完整读取和只读补页恢复。
- [x] Phase15：有界 clean segment／断线恢复、去重／乱序／截断拒绝、取消等待及服务重开。
- [x] Phase15：四响应实际 DSH 服务与 178 个独立用例／87 项 Chrome 断言；API26 unsigned HAP 编译及资源哈希检查。
- [x] Phase15：在专门批准的窗口执行新版原生回放；验收部分通过，详见第二轮结果。
- [ ] 真机：另行批准签名、安装、手机权限及真实桌面连接，取得完整幂等闭环证据。




- [x] Phase16：原生四响应任务／富动作／source-offload／取消／服务重开与固定任务去重；提前清理全部本任务资源。
- [x] Phase16：只读许可快照保持稳定；未重开 DevEco，未写许可或安全设置。
- [x] Phase16：断开后缓存读取、跨会话拒绝及关闭拒绝的离线修复；29 项相关用例及 32 项 Chrome／SDK 替身断言通过。
- [ ] Phase16：修复后重新编译与限时原生缓存验收；需要新的明确批准。
- [ ] Phase16：异常断线自动恢复、旧 generation 请求、未知／截断／冲突帧与未提交草稿的原生注入。

- [x] Phase17：197 项完整客户端回归／87 项 Chrome 断言；固定回放模型与上传均为零。
- [x] Phase17：有限 socket／JSON／未知事件／游标故障 fixture，旧 mount 拒绝的私有报告，默认未激活的连续驱动。
- [x] Phase17：官方 API26 unsigned INTERNET-only HAP 预编译、SHA-256 与编译输入校验；依赖不重复打包。
- [ ] Phase17：取得新的明确批准，在单个不续期窗口执行已准备的连续原生清单。

- [x] Phase17 第三轮：实际建立一条转发、安装 HAP、保留锁屏启动失败并提前清理；许可未变、共享 HDC 保留。
- [x] Phase17 第三轮：唤醒先于启动的有限编排修复；4 项离线检查通过，无设置修改或绕过。
- [ ] v17 原生缓存／断线／旧 generation／畸形帧场景；本轮完成 0 项，需要新的对应批准与正常启动条件。

- [x] Phase27: fix legal initial -1 diagnostic admission using shared wire predicates; preserve product errors and qualify only the latest healthy publication.
- [x] Phase27: capture the actual source reset, run SDK-substitute cross-layer and failure regressions, compile the replacement unsigned HAP, obtain independent read-only review and preserve rollback evidence.
- [x] Phase28: the ninth approved native window passes the unchanged socket recovery criterion with v27; exact cleanup and zero prompt/replay/model/upload counts are retained.
- [ ] Complete real-phone, remote authentication and installed-desktop/rich-action acceptance under the corresponding future approvals.

- [x] Phase28: preserve blocked preparation, successful native logs/tree/proof, source audit, cleanup and predecessor history; see [the ninth-round report](phase28-round9-native-socket.md).

- [x] Phase29: freeze the version-scoped ledger, source-only desktop route audit, approval steps and portable offline handoff.
- [ ] Implement capability/version resolver and fake-port production binding, then bounded project/session UI and approval lifecycle; see [the product integration plan](phase29-desktop-integration.md).
- [ ] Verify installed public runtime/package/Remote metadata before any approved plugin activation; no existing profile, user Session or credential access is implied by source audit.

The next offline step is the unregistered capability producer/Remote codec and scoped approval listener described in [phase30 host support](phase30-profile-binding.md). Profile installation, current installed-runtime compatibility, device authentication and native confirmation remain separately approved work.

The next batch is the complete private default-disabled plugin package and production admission/service integration described in [phase31](phase31-unregistered-adapter.md). Produce the exact artifact and compatibility/rollback report before requesting installation; do not add another generic preparation layer. Actual pairing/network/desktop execution and approval settlement retain their own approval and evidence requirements.

The default-disabled package artifact is complete in [phase32](phase32-installable-plugin.md). The next user-facing approval can combine public installed-runtime compatibility inspection with only the exact unselected bundle installation, stopping on missing peers or restart-required. Enabling/Session access/provider/pairing/network/model cost and phone signing/install remain separate scope; no new generic preparation layer is needed.
# Phase33 用户安装核验

- [x] 用户自行安装后停止自动安装，保持仅公开元数据读取。
- [x] 核验 29 文件匹配、版本 `0.0.0-phase32.1`、bundle 未选中及包内两层禁用。
- [x] 核对定制 shell/runtime、17 个 peer 及 14 个关键构建文件；[结果](phase33-installed-verification.md)。
- [ ] 独立认证 carrier/provider、限定首次初始化与启用方案；须另行获得对应授权。
# Phase34 设备授权离线实现

- [x] 核对实际定制宿主的 authorization/credentials/scope 公开库。
- [x] 实现明确本地确认、独立 Peer、短期 scope、单次/连接绑定 proof、撤销及冷启动拒绝。
- [x] 17 个 fake/memory/Gateway 用例通过；真实任务、模型、replay、上传和 listener 零。
- [ ] 官方 Harmony signer/secure storage、fresh enrollment 与加密 carrier 的离线适配；[方案与决策](phase34-device-authorization.md)。
- [ ] 实际部署前形成精确包/config/scope/撤销批准包；保持当前安装禁用，实际配对未开始。
# Phase35 官方 API 与离线加密

- [x] 核实官方 SDK/API 与公开参考，固定香港自有 relay 设计方向。
- [x] 共用 async protocol + ECDSA enrollment/ECDH/HKDF/GCM backend；12 个 library 用例、7 个 SDK 替身用例通过。
- [x] 三个 actual ETS adapter 的 API26 unsigned/permission-free isolated compile 通过；未运行。
- [ ] HUKS native 字节格式、实际手机能力与安全审查；[边界与集中清单](phase35-offline-crypto-relay.md)。
- [ ] 真实 signer 注册、指纹 UI、watchdog、WSS/relay broker及精确部署包；不得从选址确认推导部署/配对权限。

# Phase36 任务

- [x] 默认禁用 relay 包、WSS/fake port、双方指纹确认预览、握手期限与 revoke/expiry 清理接线。
- [x] 内存/SDK替身回归、strict TS、官方 API26 unsigned compile，以及独立只读审查与追加复核。
- [x] 保存入口定位、最小模板、未部署 artifact/hash、批准/回退清单。
- [ ] 真实 signer/ticket/grant UI 接线、HUKS/native TLS 与设备证据、批准后的 local room provisioner。
- [ ] 按 [集中清单](phase36-relay-handoff.md) 确认只读服务器访问、部署/签名/配对操作；首次仅合成 Session/只读 scope，无真实模型。

# Phase37 首次配对收敛

- [x] 共享 ticket/proof 字节与只读 grant parser，原生确认 presenter/已有 identity signer，短期 room glue。
- [x] 完整 synthetic first-pairing、最小 Session grant、拒绝/过期/撤回/重放/撤销失败清理；独立只读安全复核。
- [x] 41条离线回归、103模块 strict TS、API26 permission-free unsigned compile与本次源码/回退封存。
- [x] 经追加批准完成 dhome 相关 metadata 的3次只读 SSH，记录实际 nginx/端口/Node；没有部署。
- [ ] 对 [具体实装步骤](phase37-first-pairing.md) 获取 runtime/profile/安装、DNS/TLS/nginx/start 和手机签名/设备信任/安装审批。
- [ ] 取得 HUKS/native TLS/ArkWeb 真机证据后再激活 short room 与 synthetic read-only pairing；真实模型、长期凭据和写操作仍不自动启用。

# Phase38 轻量中转

- [x] 按用户确认暂停服务器DSH runtime锁/安装方案；独立Node/http/ws宿主共享RelayRooms/RelayUpgrade。
- [x] 官方ws8.21.3下载与integrity/hash，offline/no-scripts锁；直接打包官方依赖，服务器无需npm安装。
- [x] 默认关闭、空room拒绝、实际loopback路由/透传/关闭、启动竞态和整数溢出负例；59条回归、4条部署包smoke、109模块strict TS、只读安全复核。
- [x] 精简包/源码/回退/hash及server元数据/E2E/落盘说明封存。
- [ ] 针对新的轻量目录/service、DNS/nginx/TLS/新key及CA条款获取具体部署批准，旧批准请求不复用。
- [ ] 对批准后的Linux/TLS/proxy取实际证据；实现并审查短期issuer/control plane，随后新room/E2E重连和手机桌面端闭环。
- [ ] Mate90 Pro Max/HarmonyOS7已确认，不再询问型号；实际API、签名、HUKS/TLS/ArkWeb设备验收仍待用户侧实测。

# Phase39 短room控制面

- [x] 公开pair pins+独立routing epoch；双方新nonce同round签名发行短room，禁止匿名登记/固定共用token/DSH授权扩大。
- [x] 复用P256公钥验证、ShortPairingRooms、原RelayRooms及E2E；新增trusted endpoint与原grant reconnect proof核心。
- [x] 34新+59前代合成回归、5打包ESM、122模块strict TS、独立安全复核；源码与preimage回退封存。
- [ ] 原子公开pair/epoch/tombstone持久writer与重启恢复；真实存储目标需批准。
- [ ] 原生WS/HUKS signer、desktop owner生命周期、backoff与journal恢复；新核心ArkTS编译和真机证据。
- [ ] 新light部署目录/service/DNS/nginx/TLS/key/CA批准及Linux现场验收；旧DSH服务器安装批准保持暂停。
- [ ] 真机原command幂等、草稿/revision与rich交互到桌面实际执行；真实模型禁止。

## 2026-10-14 field readiness and bounded next repair

- [x] Read-only signing configuration, existing HDC, disabled phase32.1 package, candidate peer metadata and archive hash checks; see [field readiness](field-readiness-20261014.md).
- [x] Audit .2 zod: runtime bundled 4.4.3; declarations require declared dependency; current nested consumer does not prove detached resolution.
- [x] Implement a real isolated source-mode `harmony-mobile-replay` dsh profile entry with filtered environment, four-response budget, runtime dispatch guard and upload denial.
- [x] Implement explicit native-local first HUKS identity creation confirmation; test SDK substitutes and compile only, without real keys/signing/install.
- [x] Verify .2 runtime/type dependencies in an out-of-repository offline consumer; preserve sealed archives and the installed profile.
- [x] Complete local provider/signer/original-grant composition for the fixed replay field profile; real phone/broker activation remains separately approved.

- [x] Phase41: independently run the portable profile outside the parent repository; missing fixture/live argv refuse, four replay calls and zero models/uploads.
- [x] Phase41: compile the explicit first-identity native UI with only INTERNET; retain the previous unsigned HAP and sealed artifacts.
- [x] Phase42: actual local provider/signer/original-grant wiring, native enrollment/host/saved-record UI, detached public maintenance and five synthetic tests; see [entries and evidence](phase42-first-use-wiring.md).
- [x] Read the connected phone's public model/software/API and capability metadata; CMM-AL10, HarmonyOS7.0.0.109, API26.
- [x] Complete the explicitly approved official debug signing build using existing materials; verify and seal the [signed HAP](phase46-signed-hap.md), preserving the previous unsigned deliverable.
- [x] Receive expanded exact signed-HAP installation/first-opening approval allowing a possible in-place update, with uninstall and data clearing excluded.
- [x] Install through official HDC, verify version0.0.0/code1 and open EntryAbility on the actual CMM-AL10/API26; see [device opening evidence](phase48-first-device-opening.md).
- [x] Repair the maintained native page with one scroll/intrinsic content/keyboard resize/wrapped actions; five source regressions and official API26 compile/signature verification pass.
- [x] Install the explicitly approved new-hash update and verify [actual portrait scrolling, composer/actions with keyboard open, dismissal and synthetic-draft cleanup](phase50-device-scroll-acceptance.md).
- [ ] Verify narrow/rotated/large-font layouts, native multiline focus, long selected-session history and actual ArkWeb interaction; these were not activated for the harmless unpaired device test.
- [x] Implement and synthetically qualify [Windows DPAPI protected desktop identity storage](phase52-protected-world.md); legacy plaintext remains refused and Windows ACLs are unchanged.
- [x] Obtain explicit bounded real E2E identity/storage and dedicated relay public-state/unit/config/init/broker approval; [phase54 execution](phase54-real-first-use-blocker.md) remains blocked before grant by the installed HUKS adapter.
- [ ] Qualify actual Linux public-state initialization/directory synchronization and fail-closed restart under that bounded approval after phone identity repair; no trust or service activation has happened.
- [ ] Verify actual phone API/HUKS/TLS/ArkWeb and complete phone→desktop→rich→correct-session/duplicate-reconnect acceptance.
- [x] Implement [stable field-world reopen, durable receipts and eight independent-process scenarios](phase52-protected-world.md), including rich continuation; preserve unknown outcomes and public revocations. General in-flight execution remains refused.
- [ ] Implement everyday desktop/project integration, persisted phone pending intent across cold restart, expiry/re-pair and cross-end revocation, approval response and multiple-rich/attachment presentation; offline work does not grant deployment authority.

## normal-controls部署

- [x] 取得本轮明确部署批准，备份当前desktop五个配置文件及原DPAPI加密凭据，保留清晰回退。
- [x] 用原证书签署唯一候选，官方验签和全部应用载荷比较通过，原位升级手机并读回原HUKS公开指纹。
- [x] 在安装版alpha.4真实公开模块上验证原provider组隔离，生成未应用的当前profile补丁；见[部署证据与续接步骤](normal-controls-deployment.md)。
- [x] 正常Plugin Manager更新normal-controls.1，70个公开文件匹配冻结包；bundle未启用，临时补丁未应用。
- [ ] 用户决定恢复工作后，完成插件启用/配置及真实普通Session的status检查；连接候选已单独完成编译与只读审计，不能直接套用过时预览。
- [ ] 准备完成后才开启唯一新授权窗口，记录UTC起止，上传仅六个公开字段并执行原生控制/数据/ArkWeb闭环。
- [ ] 完成或失败时撤销新范围并恢复本轮relay配置；当前窗口未开始，旧范围保持epoch10已撤销。
- [x] 修正离线连接候选的plan示例标注、compile显式参数、真实CLI无写入与非法参数拒绝、复制input-set guard、unsigned HAP结构与拒绝fixture、只读审计入口；见[离线连接候选](connection-candidate.md)。
- [x] 按明确指示执行一次官方编译并用`--audit`只读复核；[候选证据](../evidence/connection-candidate/2026-10-18T08-25-35-312Z-facc28ee.json)记录exit0、70个输入文件、5,219,694字节unsigned HAP及SHA-256 `8671f7fdfcba320739e15d2e0fc0309faa176137f5d2a2dbbaddf3bc1c7ded02`，[构建报告](../evidence/native-build/2026-10-18T08-25-38-344Z.json)与[日志](../evidence/native-build/2026-10-18T08-25-38-344Z.log)保留；未签装、未配对、未改默认禁用策略。
- [x] `--audit`重算保留候选的完整源输入集并与报告清单严格比较；源文件修改、删除和新增均被拒绝，负例只使用自有临时目录并在结束后清理。
- [x] 实现[当前连接候选签装入口](connection-deployment.md)：固定候选哈希、唯一attempt、官方签名/验签/payload比较、单次`install -r`、安装后metadata与证据边界、owned布局/原HUKS公开身份读取，以及默认`plan`零副作用和合成拒绝测试；脚本实现阶段未执行实际签装，后续操作状态见下两项。
- [x] director审查及52项测试通过后，原手机/API26预检和一次官方签名已执行；应用验签、原证书链与profile检查通过。Windows脚本执行策略拒绝payload比较，用户选择暂停；[唯一attempt](../evidence/connection-deployment/attempt.json)保留，未安装、未启动、未改桌面或relay。
- [ ] 通过受信任的系统管理方式解决校验脚本执行权限，用户恢复后仅验证既有签名输出；完整验证通过后才可保留数据安装并检查新界面与原公开指纹。不得重签、重建attempt、删除claim或绕过执行策略；见[签装状态](connection-deployment.md)。

用户已要求停止并交给专人，以上未完成项仅作待办，不授权自动继续。当前状态、产物、安全收尾及逐步验收见[完整交接](HANDOFF-2026-10-18.md)。

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

The [rc2.6 recovery reference](connection-recovery-rc2.6.md) records 21 targeted and 7 integration passes, zero strict type diagnostics and a successful official unsigned SDK build. Relay deny-policy serialization and cold-start host permission/manual retry are repaired in source; installed rc2.5 and the existing persistent binding remain unchanged. Signing, installation, native Origin-compatible relay review and physical list/switch/sync/rich acceptance remain pending. No real identity store, remote service, authorization or model was used in this stage.

## Connection feasibility after retained revocation (2026-10-24)

The [feasibility review](connection-feasibility-rc2.6.md) identifies a remaining product lifecycle defect: relay pair/epoch are coupled to persistent bindingId/epoch, while the former temporary route is terminally revoked at epoch2. The local candidate alone cannot safely restore actual connectivity. Selected Origin regressions 18/18 and public-state regressions 10/10 pass; these retain strict rejection and do not implement successive routing windows. Complete a signed independent routing descriptor and crash-safe public registration/history lifecycle before successor deployment. No installation, remote operation or actual authorization was performed.

## rc2.7 route candidates sealed offline (2026-10-24)

The [route migration and rollback reference](device-route-rc2.7.md) supersedes the rc2.6 source blocker with a separate dual-signed finite route lifecycle, durable endpoint and relay ledgers, normal route commands and native page/carrier integration. The original binding epoch1 and old relay epoch2 tombstone remain independent. A second clock read in room publication was reproduced extending a deadline by one millisecond; the final issuer now caps it at the signed absolute deadline, without weakening client checks.

Completed: integration 11/11 including two windows and restart/revocation; finite binding/ticket lifecycle 15/15; Origin 18 selected passes and public-history 10/10; ordinary controls 5/5; packaged feedback 11/11; packaged rc.2 public API; strict types with zero diagnostics; official API26 unsigned SDK build. Detached relay/tools imports, disabled CLI startup, public preparation/exclusive output and no-TTY mutation refusals pass. Nine fixed-public loopback admission cases retain exact Origin/role/Host/path/subprotocol and Cookie restrictions, with no room issued. Four matching rc2.7 archives and their current source hashes are recorded in the [final manifest](../evidence/device-route-candidates-rc2.7.json).

Pending: separately approved original-material signing/in-place installation; exact relay code/config and new anchored journal migration; bounded physical connection/list/switch/sync/rich/reconnect acceptance and explicit route revoke/readback/service restoration. Actual phone Origin, HUKS, ArkWeb, public TLS and Linux durability are not established by offline tests. Installed rc2.5, original pairing and retained rc2.5/rc2.6 artifacts are untouched. No real identity, authorization, remote service or model operation occurred in this sealing stage.

## rc2.7 approved in-place update completed (2026-10-24)

Both original endpoints are now rc2.7. The [installation and passive startup receipt](../evidence/device-route-installation-rc2.7-complete.json) records original-material official signature/profile verification, exact 23-entry application payload parity, phone UID20020297 preservation, official desktop CLI exit0 and 93 matching installed files. Other manifest/lock entries and runtime/isolation/supply-chain configuration remain unchanged; the Host descriptor and rich-inline remain rc.2.

After a verified complete desktop exit, the normal fresh app showed rc2.7 in its plugin detail, the new route command hint and an actually executed public `harmony-device status` result of desktop/bound. The actual phone showed paired/disconnected with connection/send controls disabled. No re-enrollment, route, ticket, relay operation, model call or private-state export was performed. The earlier screen-lock/window-readiness blockers are resolved. Physical relay/NetworkKit/ArkWeb/control acceptance is still pending separate migration and finite-window approval; no remote status was rechecked in this update.

## Desktop diagnostic candidate

The rc2.9 desktop diagnostic candidate passes first-error/cleanup failure, closed error categories and synthetic journal create/reopen/cold ownership checks; the prior candidate remains retained. After separate deployment authorization, verify the installed package and use its safe failure phase to choose the next bounded acceptance step. Do not switch live journal mode or retry a public window merely because an offline recovery test passes.

- 2026-10-25 rc2.10: repair device-entry admission lifecycle after the actual journal-open/journal-already-exists failure. Preserve strict create/reopen and resolve device create to owner-validated create-or-reopen; retain receipts, schema, domain exclusion and first-error cleanup. Qualification and independent desktop candidate only; no installation, real route, configuration change or model call in this phase.

rc2.10 final offline result: device integration 23/23, shared legacy 6/6, controls 5/5, feedback source/package 11/11 each, strict types zero diagnostics, and all five packaged installed-Host public API entries passed. The same current command regression fails on the backed-up rc2.9 sources with journal-open/journal-already-exists, then passes on the repair. The independent desktop archive is `D:/Temp/dsh-experimental-harmony-mobile-0.0.0-rc2.10.tgz`, SHA256 `360e03c9cf202c5c001384feb8b0e1f9c25f106126d30133fd0ac29074b6ce65`; complete evidence is `evidence/admission-lifecycle-rc2.10.json`. Phone/relay rc2.7 need no protocol update. No installation or new live test was performed.

### 2026-10-25 rc2.11 phone connection diagnostics (offline only)

Phone diagnostics now use closed stage/category codes for original identity reads, route validation, native channel acquisition, control/E2E handshake, tickets and the first catalogue. Actual NativePorts forward allowlisted content-free facts; earlier failure evidence survives cleanup errors. Uncertain cleanup remains fail-closed. Exceptions, causes, keys, credentials, tickets and protocol payloads never enter the diagnostic UI. Existing identity/signature, host consent, scope, expiry and revocation checks remain in force.

Qualification: isolated fault regressions 17/17 including actual ETS owners with fixed-key SDK substitutes; device integration 23/23 with synthetic Sessions/loopback; lifecycle 15/15; page permission/layout 9/9; strict types zero diagnostics; official API26 compile and native import audit pass. A memory overlay of the backed-up shared sources fails 12 new diagnostic assertions, demonstrating missing diagnostics/error masking rather than the live connection cause. Two initial SDK builds rejected the catch syntax; the final supported Error cast preserves the exception and compiles. The unsigned HAP contains 23 unique CRC-checked entries and only the existing INTERNET permission.

Candidate: `D:/Temp/dsh-harmony-mobile-0.0.0-rc2.11-device-diagnostics-unsigned.hap`, SHA256 `b67ccee1029da27a75e8e67a1be129dca14dc353fb497ba063a5027021a2b189`. Full evidence: [phone-diagnostics-rc2.11.json](../evidence/phone-diagnostics-rc2.11.json). No signing, installation, public network test, relay access or actual identity/binding/log/permission change occurred. Desktop rc2.10 and relay rc2.7 need no protocol change. Physical HUKS/NetworkKit, displayed diagnostics and connectivity remain unverified.

Earlier test cleanup is still incomplete locally: the route was durably revoked and remote service/permissions restored, but desktop `harmony-device stop` awaits foreground recovery. No activation/input retry occurred during this offline work. Do not describe the earlier test as fully cleaned locally or connectivity as fixed.

### 2026-10-26 rc2.11 phone in-place deployment

Original-material official signing, verify-app, verify-profile, original certificate-chain pin and exact 23-entry application payload parity passed. Signed archive `D:/Temp/dsh-harmony-mobile-0.0.0-rc2.11-device-signed.hap`, SHA256 `12124fa41986e5baa8989a9bb9b6c500f85b5c926d1380735ea90d09837e6341`. The original phone was CMM-AL10/API26; official HDC replace install updated rc2.7 to rc2.11 with UID20020297 unchanged. No uninstall, data clear, new permission, new identity or pairing action occurred. Existing HDC was normally started at its original loopback address using unchanged existing key-file metadata; no trust/key reset or new trust acceptance occurred.

Normal app startup and two fresh owned-layout observations in one process/window show paired/disconnected, with connect/send disabled. This confirms public paired state survived the update; private binding storage and the installed HAP were not read back. No desktop, relay, route/ticket or model operation was performed. Earlier local stop was separately confirmed by the user before this deployment; it was not replayed. Full [installation evidence](../evidence/phone-diagnostics-installation-rc2.11.json) and [passive phone evidence](../evidence/device-binding-passive-phone-rc2.11.json) are retained. Physical network/basic-control and actual failure-diagnostic display remain unverified; signing/install success is not a connectivity fix.

## rc2.12 lifecycle follow-up

Reuse the existing fixed phone/desktop binding. Qualify post-catalogue asynchronous close, reconnect connecting-to-timeout, primary error preservation and desktop terminal state offline, then build independent candidates. Physical session switching, message synchronization and rich interaction remain unverified; no new connection window is authorized by the offline work.

## Local log self-check

The [local-only diagnostic probe](local-log-selfcheck-rc2.15.md) has matching native/page regressions, strict types, official compilation and original-certificate signed payload checks. Original-phone in-place installation and paired/disconnected startup verification passed. The single approved no-network probe now has physical output-to-filtered-collection proof: exactly one fixed record from the same App PID, the page acknowledgement, and an exited owned reader. Pairing and public storage-size metadata are unchanged. Earlier empty isolated-client checks are superseded as host USB evidence. Real control-handshake and network functionality remain unverified.

## rc2.33 history follow-up

- Desktop rc2.33 and the local emulator are installed with the shared history and connection fixes; see [history capacity](history-capacity-rc2.33.md).
- Physical-phone history, switching, memory and latency remain unverified; the phone and public relay retain their existing installation and configuration.

> 桌面手机控制入口（2026-11-02）：已整合并安装到桌面 rc2.33，输入框上方常驻面板已实际移除，入口位于“设置 → 内置插件 → 手机连接”。需要确认的操作关闭设置并保留正常确认界面。25 项面板、16 项浏览器及完整 Web 设置外壳通过；安装版 Windows 设置页因本轮窗口输入未完成导航，尚未逐项点击验收。见[统一安装与验证](../evidence/mobile-coordinated-20261102.json)。原真机配对和数据未修改。
