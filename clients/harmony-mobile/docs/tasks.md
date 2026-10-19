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
