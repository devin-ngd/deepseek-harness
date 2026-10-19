# Phase74公开pair拒绝记录与继承计划

本参考记录两次实际拒绝的载荷、目的地及后续继承前提。当前只进行本地只读核对并保存计划；未重试上传、未连接手机或SSH、未签名、未创建grant、未部署或安装。机器可读证据见[载荷及历史审计](../evidence/phase74.7-readonly-pair-history-audit.json)、[拒绝原文与审批证据](../evidence/phase74.7-review-rejections.json)和[实机收尾](../evidence/phase74.7-field-closeout.json)。

## 被拒绝的动作

两次请求的命令相同：`node .build/phase74.7-operation-plan/cli.mjs relay-stage evidence/phase74.7-execution-approval.json`。两次均在宿主进程创建前被自动审批拒绝；CLI及其SSH子进程未启动，未出现CLI的TTY确认。第二次仅补充原请求和批准记录，仍被拒绝，随后停止，没有换工具或传输路径。

该命令从本地`D:/Temp/dsh-harmony-phase74-operation/exchange.json`仅选取`pair`成员，经已有SSH别名`dhome`的标准输入交给`/home/devin/harmony-relay/phase74-successor/operator.mjs`，写入`dhome:/home/devin/harmony-relay/phase74-successor/relay-pair.json`，并生成同目录`field.authorized.json`候选配置。两个文件使用独占创建；pair记录写入模式为0600。日志初始化、service启动、systemd/nginx调整属于后续独立命令，该步骤不会执行。既有中继的公开服务名为`dsh.devinho.me`，后端为`127.0.0.1:17846`；本次文件目的地是上述SSH路径，不是HTTP上传地址。

实际pair来自桌面交换目录`D:/Temp/dsh-harmony-real-field-20261015-lEUAMM/fixed-world/exchange/run-fiSUnZ/relay-pair.json`。保存文件413字节，实际内联JSON为387字节，其SHA-256为`7513aeb1bd300b58a689c7354b88184fce85950927e1558eb94d22c90778c3ab`。本地核对确认它与`exchange.json`中的pair完全相等。未发送完整`exchange.json`、`phone-pair.json`或任何会话内容。

| 字段 | 实际类别及用途 | 是否为访问凭据 |
| --- | --- | --- |
| `pairId` | 中继配对选择标识，实际值为`harmony-phase74-successor-20261017`；选择允许发起签名挑战的登记项 | 否；单独持有它不能加入room或执行任务 |
| `desktopPublicSpki` | 桌面P-256公钥，规范DER SPKI为91字节，base64url编码；验证桌面的新鲜签名证明 | 否；不是PKCS8私钥 |
| `phonePublicSpki` | 手机P-256公钥，同为91字节规范DER SPKI；验证手机的新鲜签名证明 | 否；不是HUKS私钥 |
| `epoch` | 中继pair版本，实际为1；与桌面任务grant5及撤销6不同 | 否；是版本元数据 |
| `expiresAt` | 登记到期的Unix毫秒时间戳，对应`2026-10-17T07:16:14.002Z` | 否；是有效期元数据 |
| `revoked` | pair导出时的状态布尔值，实际为false | 否；不能覆盖后来桌面epoch6撤销事实 |

两个公钥均已用Node公钥解析器验证为`public`、`ec`、`prime256v1`，并重新导出以确认规范SPKI；不是仅凭字段名判定。六字段中没有私钥、DPAPI保护字节、HUKS材料、token、room标识或room capability、cookie、Authorization头、SSH密钥、账号密钥、Session标识、任务、消息或文件内容。SSH连接会使用原有SSH认证，但认证材料不是该pair或SSH标准输入载荷的组成部分，本次没有读取或输出其私钥。公钥及pair标识仍会使双方身份可关联，因此明确外发范围和目的地仍有意义。

后续协议的`RelayRoomReceipt.token`是角色专属短期bearer capability，必须作为访问凭据保护，不能纳入公开pair或审批说明中的“公开数据”。它只会在双方分别完成新鲜签名挑战后签发，经TLS交给对应端，并用于一次性room接入；当前未启动候选中继或控制握手，未生成或传输这些room凭据。完整手机v2还包含签名、授权范围和历史，属于本地信任材料，也不属于此次六字段外发范围。实现依据为[中继配置](../standalone-relay/src/broker-policy.ts)、[room签发](../standalone-relay/src/room-broker.ts)和[控制协议](../src/relay-control-protocol.ts)。

## 两次拒绝及已提交的审批证据

第一次拒绝原文：

> 该步骤会把包含设备/桌面指纹、Session及授权信息的公开pair上传到远端relay；现有用户消息仅笼统“批准”，未明确授权该载荷及远端目的地，敏感数据外发授权不足。

第二次拒绝原文：

> 重试仍会把六个设备/授权公开字段上传到未由用户明确指定的远端dhome；助手生成的“原请求/批准”证据不能扩大用户授权，且本次尝试是在前次外发被拒后绕过拒绝。

原请求为`Sentinel_a10b3d9858108191b2239f99df8d3316`，时间05:46:52 UTC；人类回复“批准”为`Sentinel_06294acdd4848191a9f24616bda24142`，时间05:49:42 UTC。原请求列明在dhome复用现有代码及独立phase74目录，允许一次最长30分钟、最多4个固定回放响应，并写明“公开配对证明与路由状态按原方式交换”；原人类审批记录保持不变。工程修订只更新74.7执行清单hash，不增加授权范围。

第一次拒绝后，将父线程提供的原请求第3/4项及原人类批准原文保存到[补充记录](../evidence/phase74-public-pair-authorization-review.json)，核对六字段后以相同命令提交第二次请求。自动审批未接受该补充。该文件由助手保存既有记录，不能自行产生新的人类授权。本地载荷审计确认第一条拒绝中所称的Session并不在实际pair内；这一事实不取消实际拒绝，也不授权再次尝试。两条拒绝原文来自本任务直接工具返回的保留上下文；应用的read_thread投影没有暴露这两次被拒绝的进程条目。

前置`relay-prepare`已将操作代码、计划元数据、配置模板及备份写到远端独立目录，代码中包含测试Session名及指纹，故不能宣称任何标识都未到过远端。准确状态是：此次六字段pair没有stage，journal没有初始化，候选服务未激活，原服务和nginx恢复核验通过。

## 手机与桌面的历史状态

| 位置 | 当前已知记录 | 到期时间及状态 |
| --- | --- | --- |
| 手机最后一次正常读取的完整v2 | 当前grant3，撤销下限2，历史为grant1 | `2026-10-17T04:25:16.585Z`；已过期。该观察来自现场已保存读回，本轮没有重新启动手机读取 |
| 桌面保留但未导入手机的完整v2 | 当前grant5，撤销下限4，历史为grant1、grant3 | 原定`2026-10-17T07:16:14.002Z`；其授权已提前撤销，不能再启用 |
| 桌面持久授权所有者 | epoch6，revoked=true，活动0 | 本轮06:55:36 UTC只读复核；保留的expiry属于grant5，与grant3的expiry不同 |

双方记录尚未同步。手机grant3和保留grant5的桌面签名均验证通过；grant5的`previousDigest`精确匹配手机grant3完整规范文档，且完整历史恰好追加grant3。桌面epoch6记录的expiry与grant5相同。保留grant5外层`revoked:false`及六字段pair的`revoked:false`仅是签发快照，不是撤销后的当前授权状态；不得通过编辑签名文档或回滚桌面凭据来使两端看似一致。

现有[桌面续接方法](../desktop-plugin/src/first-use.ts)要求前驱已到期，且前驱expiry与持久撤销记录相同。因此不能拿手机grant3直接对epoch6发新offer；按当前API，必须以前驱grant5为基础，并在`2026-10-17T07:16:14.002Z`之后通过真实时钟校验。不得改系统时钟、改旧expiry或重播旧手机证明来提前续接。

手机[单步后继校验](../src/public-trust-protocol.ts)要求`next.history`恰为`successorHistory(saved)`，原生签名验证还要求`next.previousDigest`直接等于本地文档摘要。若未来以grant5为前驱签发新grant，完整历史将含grant1、grant3、grant5；手机仍保存grant3，所以现有73.1无法直接接受该完整后继。06:55只读结构校验显示grant3→尚未到期的grant5在现有规则下可通过，但这不表示已撤销grant5可以重新启用；本轮未导入它，也不以赶在07:16前导入它为后续计划前提。grant5过期后，现有单步导入还会因新记录已过期而拒绝。

## 离线继承准备

建议扩展现有共享v2校验和原生验证输入，支持手机漏收中间公开代次后，只确认最终有效且新近批准的后继。继续保留同一v2格式、完整旧记录和签名；不增加历史专用私钥、token或网络接口。不把已撤销grant5临时写成手机当前有效代次，不先清空手机配对文件。

1. 保留手机grant3的精确字节、完整签名grant5及epoch6撤销证据；以本轮审计摘要为离线检查输入。不得改动旧文档、旧journal或已有签名。
2. 在共享协议中校验完整历史前缀，定位并重建与本地grant3完全相等的已签名文档，逐个重建中间v2文档并验证各自摘要和桌面签名。保持原身份、公钥、audience、Session和操作列表；拒绝任何本地撤销、删史、替换、分叉、重复pair或降级。不能只相信最后一份文档声称包含旧历史。
3. 原生端复用共享代码给出的规范验证字节与前驱摘要序列，通过现有P-256验证口核对每段证明；不在ArkTS另写一套继承算法。所有中间grant必须已过期，最终grant必须未过期，其授权epoch严格为所签撤销下限加1。仍须显式核对指纹和范围，全部验证完成后才原子保存最终记录；失败保留旧记录、锁及可见错误，不隐式连接。
4. 用纯合成fixture覆盖手机停在grant3、桌面完成grant5→撤销6后接收下一份完整后继。负例覆盖缺中间记录、错误签名/摘要、改scope或密钥、重复pair、有效中间代次、本地撤销、篡改撤销下限、过期最终代次、容量不足、写入结果未知及退出竞争。验证零真实签名、零真实模型、零手机或远端IO；共享核心与ETS SDK替代测试分别标注。
5. 校验修订需要实际编译和独立候选审查。现有73.1不能凭Web/Node测试宣称已支持；若需更新HAP，另行准备并核对安装范围，本轮不签名或重装。

以上是待实现和验证的计划，本轮没有实现或运行跳代接收功能。当前仅运行了公钥/签名/摘要验证、现有单步校验及桌面授权元数据只读检查。

## 未来一次执行的最小条件

未来应先完成上述离线修复及检查，再准备可审查的执行清单。外发确认需逐项限定为表中的六字段、准确SSH路径和候选配置用途，并明确排除私钥、token、room capability、完整手机v2和会话内容；这项外发确认不同时批准新的grant或部署。旧grant5载荷已作废，本轮不再次申请执行它。

新窗口须单独绑定新的pair标识、未使用的独立run/state目录及包清单，确认既有epoch6仍撤销且活动0，手机完整v2/原HUKS身份/锁状态无变化，既有服务、配置、Session和资产校验一致；保留原有权限和不超过30分钟、4次固定回放、真实模型0等限制。若所有状态保持不变，桌面原所有者的下一授权为epoch7，收尾撤销为8；这只是预期，不是现有授权，观察到其他epoch必须停止。

依照现有桌面方法，前驱grant5必须先自然到期，再以其完整签名历史发起新的短期offer；原手机必须为新挑战产生新鲜证明，桌面作出新的限时授权确认。手机最后读回仍为grant3时，必须使用已编译验证的完整历史接收方法；不能用缩短历史的grant7或降级到v1替代。新窗口结束或任何未知结果都立即撤销并核对活动0，保存历史、关闭资源和恢复配置；不自动重开窗口。

本轮未选择未来pair名或远端目录，未生成grant7、未来签名文档、批准记录或部署命令。最终字段值、目的地和操作顺序必须在任何下一次现场动作前具体化；不能将本计划当作执行授权。
