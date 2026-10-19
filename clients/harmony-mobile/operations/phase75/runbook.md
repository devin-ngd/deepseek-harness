---
kind: reference
description: 已实现但未批准执行的phase75原手机、独立桌面闭包和六字段中继操作器。
---

# Phase75完整操作器

`cli.mjs verify`只读校验unsigned HAP、审阅ZIP、全部操作器文件及独立桌面闭包，不读手机、凭据或SSH。其余命令必须使用由真实人类决定支持的审批记录，绑定本包plan和文件清单hash、全部scope及人类消息ID，并在本地TTY输入`EXECUTE PHASE75 <command>`；示例记录为false，旧phase74批准不能使用。审批文件只能记录批准，不能创造批准。目录、签名、安装、启动、grant、journal等未知结果不能盲目重试。

## 数据与执行归属

手机最后已知完整v2为grant3、撤销下限2。操作器同时核对桌面保留的完整签名grant5、下限4，及持久撤销6/活动0；两份精确文档、原指纹、scope和expiry都必须匹配。grant5自然到期后仅用作桌面续接前驱，不导入为手机当前配对。新offer须原手机用既有HUKS作新鲜证明并经桌面确认，唯一新grant为7，最长30分钟、最多4个固定回放响应；手机使用同一共享算法验证完整3→5→7并只保存7。原Session为`harmony-mobile-field-replay-session`，十操作为`task.submit`、`task.receipt`、`session.cancel`、`session.sync`、`rich.mount`、`rich.snapshot`、`rich.saveDraft`、`rich.invoke`、`rich.status`、`rich.dispose`，不含审批写入。

桌面固定使用`.build/phase75.1-desktop-candidate`，其147文件清单另行固定。原alpha4 dsh、授权所有者、重开机制、原回放资产及依赖保留；仅原应用bundle的外层签名检查改为新的完整历史模块，并加入到期中止TTY等待的计时器。验证模块与unsigned HAP使用同一共享协议源码hash。操作器绝不启动旧phase69桌面路径，也不重建当前主仓的用户改动进该闭包。应用仍由原`field-launch.mjs --home`选择`dsh --profile harmony-mobile-replay`启动。

中继pair载荷严格只有六项：`pairId`（公开路由标识）、`desktopPublicSpki`和`phonePublicSpki`（P-256公钥）、`epoch`（pair版本1）、`expiresAt`（本次到期时间）、`revoked`（false快照）。目的地为`dhome:/home/devin/harmony-relay/phase75-successor/relay-pair.json`；同目录`field.authorized.json`只把该pair加入原relay策略并指定独立journal路径。二者不含私钥、token、room capability、其他访问凭据、Session、任务或消息。六字段在启动SSH前本地严格校验，extra字段、旧pair、错误公钥和过期记录都拒绝；并重新核对原桌面唯一活动授权恰为7，与完整公开7的scope/expiry相等。

准备阶段传输的是已封存的relay-only operator、40项旧relay文件hash、公开模板、计时限额、nginx和unit文本及其备份；不把完整桌面plan编入远端程序，也不得整体上传操作ZIP或审阅ZIP。构建和测试检查远端包不含桌面Session、身份指纹、desktop/device/profile ID或本地home/world路径。中继仍复用原`phase69-successor`代码、既有TLS入口`dsh.devinho.me`及`127.0.0.1:17846`，没有新端口、防火墙、隧道、证书或身份。后续control握手签发的短期room token属于访问凭据，只经TLS交给对应端，不能写进公开pair、配置或诊断。

## 批准后的命令顺序

下列`$op`为封存包的`cli.mjs`，`$approval`为同一包的人类批准记录。此文档中的命令本轮均未执行。

```powershell
node $op verify
node $op init-run $approval
node $op launch-existing $approval
node $op native-ui $approval inspect
node $op native-ui $approval layout
```

通过原UI读取既有HUKS公钥和完整saved v2，再使用原UI退出并核对PID为空。`native-ui`只允许原bundle及原目标，可读取布局、填写原alias、读取公开记录、滚动、核对/签署当前offer、填写和比较当前最终7、保存7、连接及正常退出；不能创建身份、清理私有文件、强停应用、解锁系统或任意点击。若屏幕锁定、可见控件不唯一、布局/指纹/scope不符或无法正常释放自己的临时锁，停止，不删锁。UI输入助手的实际布局行为仍须在获准真机上核实；需要跨屏比较时可使用同一原生UI手动核对，不绕过原生确认。

把完整原生导出路径和新鲜正常读回/退出观察按`phone-observation.example.json`记录，时间不得改写。签名、安装前均重新核对phone3与retained5及桌面撤销6。

```powershell
node $op record-phone-read $approval $phoneV2 $phoneObservation
node $op sign $approval $phoneReadReceipt
node $op install $approval $phoneReadReceipt
node $op launch $approval
```

签名沿用原证书、公开profile和现有本地材料，验证全HAP应用条目及SDK导出的pages信息；不输出或导出私钥。安装仅官方HDC原目标`install -r`，不卸载、不清数据、不增权限。签名未知只允许`verify-sign`恢复验证，安装未知停止。更新后重新读回原v2/原HUKS并正常退出，观察必须仍为phone3，不能拿安装前时间代替。

```powershell
node $op relay-probe $approval
node $op relay-prepare $approval
node $op relay-probe $approval
node $op prepare-field $approval $phoneV2 $phoneObservation $relayObservation
node $op start-field $approval
```

relay预检拒绝既有phase75目录、pair、任何phase69/74临时drop-in、changed hash、foreign连接或旧journal变化。准备只创建独立目录和备份，未启服务。`prepare-field`保留原field配置，仅改本次pair、容量及指向完整retained5的续接路径；手机3和桌面5分别保留，不交换角色。原会话字节、资产、899个旧封存文件及新桌面闭包都必须匹配，owner锁不得存在。

新桌面TTY依次选择`REOPEN FIXED WORLD`、既有身份`OPEN`、`IMPORT PHONE`；严禁`CREATE`。通过`native-ui input-offer <本次desktop-offer.json>`、预览/比较、签名及`read-reply`取得本次新鲜手机证明，随后`READ PHONE PROOF`及`ALLOW FIXED REPLAY`。同一新鲜挑战不能重复签；不能回放旧proof。此时才创建7并打印精确UTC起止，创建后任何失败都会消耗此窗口，不再发grant。

在另一个获准TTY收集本次exchange，再执行独立relay步骤：

```powershell
node $op collect $approval $newExchange
node $op relay-stage $approval
node $op relay-initialize $approval
node $op relay-activate $approval
```

完整7须同时延伸手机3和桌面5，所有签名、摘要、连续epoch、身份、scope、历史及有效期都通过才可collect。stage/init/activate每次均重新确认活动7。初始化需远端TTY明确`INITIALIZE PUBLIC TRUST`，空或未知journal/head、既有lock/attempt都拒绝。临时unit只放行独立state目录写入；原ProtectSystem/ProtectHome保留。nginx只按固定原文件把burst2暂调3，仍5次/分钟、连接4，必须通过`nginx -t`。

本窗口已消费并撤销至8，本页不授权再次执行；封存包中的原步骤保留不改。后续独立方案须采用[控制诊断](../../docs/phase76-control-diagnosis.md)确认的准备顺序。

relay成功后，先通过手机`native-ui input-pair`、`compare-pair`及`confirm-pair`完成最终文档核对、本地保存和原生已配对状态确认，停在可立即连接的位置；然后桌面TTY确认`CONNECT FIXED REPLAY`并立即操作手机`connect`，避免桌面在手机尚未就绪时耗尽有限重连预算。这些命令仍只处理collect所得完整7，不接受旧5或任意输入路径。随后仅在原会话完成合成任务、流式、rich表单、重复请求/action、断线后状态查询、草稿和取消验收。重连不重新提交任务；真实模型、文件上传和用户项目硬拒绝。手机界面、协议、任务归属及幂等证据必须实际记录，不能由离线测试代替。

## 到期与失败收尾

grant提交后的精确expiry会中止桌面TTY等待并进入原finally撤销/关闭路径；手动Enter或DENY也进入该路径。提交前保持撤销6，提交后的正常或内部失败应为撤销8、活动0。拒绝把8的epoch与旧5的expiry拼合成合法状态。`start-field`子进程结束后分别尝试原public配置恢复和远端原service/nginx恢复；一方失败不会跳过另一方，最终回执独立记录未知结果。历史journal、独立目录、失败文件和签名文档保留，永不恢复旧凭据。

```powershell
node $op desktop-final $approval
node $op relay-restore $approval
node $op native-ui $approval inspect
```

`desktop-inspect`是开始前撤销6检查；`desktop-final`独立读回撤销6或8及活动0，不推定资源关闭。结束后同时核对`final-cleanup.json`、原owner的`desktop-cleanup.json`，不能拿开始前回执冒充收尾。若自动relay恢复未知，可在明确范围内用`relay-restore`核实/恢复，不能重开grant。手机使用原UI正常退出，核对PID为空；完整7读回可用`read-public final`在默认禁用状态检查，允许过期的历史审计但不激活它。未完成的任务/流式/ArkWeb、手机退出、撤销或服务恢复须分别报告，不以其中一项成功推定其余成功。

不提供自动重授权、回滚epoch、删锁、清数据或重新创建身份的恢复命令。任何未知、锁冲突、签名/历史/身份不符、远端意外状态或自动审批拒绝都停止相关动作，先撤销并收尾，不换通道绕过。
