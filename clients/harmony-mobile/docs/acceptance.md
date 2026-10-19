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
