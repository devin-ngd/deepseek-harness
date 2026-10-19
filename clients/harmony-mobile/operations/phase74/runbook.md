---
kind: reference
title: Phase74 bounded device operation
description: 独立、默认不激活的原手机、原桌面身份和固定回放操作计划。
---

# Phase74 操作计划

## Summary

本包只增加操作计划、校验器、适配脚本和离线测试，不改变73.1 HAP/ZIP、封存alpha4桌面应用或phase69 relay代码。`plan.json` 是唯一范围来源；`approved:false` 是封存事实，不能通过修改它获得权限。执行人必须先从可信会话核实用户对操作范围的明确批准，再记录该人类消息、计划hash、当前执行文件清单hash及全部scope。父线程可在不改变操作范围的工程纠错后更新执行hash基线，另存关联原授权的新执行记录，保留旧记录；不得把hash变化本身当成新增用户授权，也不得伪造用户消息。文件本身不证明授权。所有执行命令还要求本地TTY确认，默认 `verify` 只检查公开文件hash。

## Contents

- 前置核验和安装
- 原会话授权和relay维护
- 结束和失败处理
- 离线重现与限制

## 前置核验和安装

命令在原Windows工作区执行。`$op` 指向封存包内 `cli.mjs`，`$approval` 是批准后另存的记录；本包 `approval.example.json` 不可直接使用。每个命令的确认短语为 `EXECUTE PHASE74 <command>`。回执均在 `D:/Temp/dsh-harmony-phase74-operation` 独占创建，路径已存在即拒绝新一轮，不自动换名或覆盖。以下是待批准后的执行顺序；本包没有运行这些实机命令。

```powershell
node $op verify
node $op init-run $approval
node $op launch-existing $approval
```

在原应用正常原生UI读取已有身份公钥，核对原HUKS指纹；点击“读取已保存的公开配对配置”，导出完整v2到选定公开JSON，正常“断开并退出”。这项内容只读操作会创建自己的临时 `mobile-product-public-trust.owner-lock`，成功关闭时释放自己的锁；不会删除既有锁。以实际读取和关闭结果填写独立观察文件，字段见 `phone-observation.example.json`，`documentSha256` 是导出文件原字节hash，`observedAt` 是Unix毫秒。不得用历史回执或预测结果填写成功。当前没有经过验证的HDC私有目录零写入读取路径；UI读取、正常退出或锁释放不明确时立即停止，不删锁、不清数据、不重建身份，也不继续安装。

```powershell
node $op record-phone-read $approval $exportedV2 $phoneObservation
node $op sign $approval $phoneReadReceipt
node $op install $approval $phoneReadReceipt
node $op launch $approval
```

`record-phone-read` 同时读取原桌面受保护凭据文件中的公开元数据，拒绝非revoked4、活动grant、异身份或不匹配的完整历史。读取不会解密或输出受保护私钥。签名和安装要求5分钟内的成功读回；过期只能重新正常读取，不能改观察时间。`sign` 复用原官方签名配置和材料，输出独立73.1 signed HAP，校验原证书链、原profile、全部应用ZIP条目及SDK独立推导的 `.pages.info`；不会复用旧bitmap hash。未知签名结果只能 `verify-sign`，不会再签一次。安装固定原目标、bundle和API26，用官方HDC `install -r`，禁止卸载/清数据/新增权限；安装结果未知不自动重试。

原公开profile参考位于home同级的 `phase59-signature-verification/profile.p7b`，不在 `fixed-world` 内；签名前同时核对其固定hash和当前原签名配置所引用profile的hash。74.2曾因错误参考路径在签名尝试记录写入前拒绝，未调用签名器、未安装、未创建grant；74.7修正该路径并固定已核实公开profile的hash，只在长度及SHA-256清单校验中允许零字节依赖；普通状态、回执和JSON读取仍拒绝空文件，初始化完成和激活共用显式非空journal/head检查。不改变HAP、签名身份或权限。原74.2包和本次停止回执保留；父线程已确认这类纠错处于原用户批准范围；更新并留存执行基线映射后可继续，仍须重新读取过期的手机预检证据。

安装后再次正常读取完整v2并正常退出，保存新的公开导出和观察。若指纹、历史、原生退出或锁状态变化，停止。`launch-existing`/`launch` 只启动原生UI，启动本身不配对、不发任务、不创建身份。AA返回0仍须检查错误码及原bundle PID；10106102表示系统锁屏拒绝，需要用户正常解锁，不自动解锁或改设置。配对及任务输入仍通过原生UI明确选择；ArkWeb只能使用原scoped rich SDK。

## 原会话授权和relay维护

```powershell
node $op desktop-inspect $approval
node $op relay-probe $approval
node $op relay-prepare $approval
node $op relay-probe $approval
node $op prepare-field $approval $freshExportedV2 $freshPhoneObservation $freshRelayProbeReceipt
node $op start-field $approval
```

`relay-probe` 只检查原服务、端口连接、40个原代码文件、两代旧公开journal/head、nginx和pair未使用情况。`relay-prepare` 独占创建 `/home/devin/harmony-relay/phase74-successor`，保存备份、操作器和公开模板，创建空的独立 `state` 目录；不改变服务、不创建pair/journal。新路径、新pair或旧drop-in已存在、原代码/config/旧journal/hash改变即停止。该目录的首次准备失败会保留失败标记，不能直接重新准备。旧代码目录 `/home/devin/harmony-relay/phase69-successor` 始终只读复用。

`prepare-field` 在新鲜公开观察、原revoked4、原Session字节和封存899文件全部匹配后，只替换原home的 `field.json`：新pair、完整v2前驱路径、32768字节上限；其余设置保留，备份原配置但绝不备份/恢复凭据。原baseline配置仍指向最初phase54 pair，完整v2前驱指向phase69 pair，校验器分别核对这两个事实。不会重用phase71脚本。已有world所有权锁立即拒绝，不能由操作脚本清理。

`start-field` 把home规范化为原Windows启动器要求的绝对路径形式；已结束且没有任何新exchange的启动前拒绝只允许在核实revoked4后恢复public配置，保留所有失败回执，不盲目重放。实际启动只使用原封存 `field-launch.mjs --home` 所选dsh profile，启动前重新核对revoked4和所有输入。保留其原交互：`REOPEN FIXED WORLD`、身份仅选 `OPEN`、`IMPORT PHONE`，将新offer放入原生UI比较身份/Session/操作/期限并签署新证明，然后 `READ PHONE PROOF`、`ALLOW FIXED REPLAY`。不得选择 `CREATE`，不得复用旧proof。原profile签名/授权实现验证完整v2和持久撤销下限；本次只接受grant5，结束必须持久撤销至6。该profile有真实模型硬拒绝、上传拒绝、固定四响应上限；唯一Session为 `harmony-mobile-field-replay-session`，操作固定为plan的10项，不含审批响应或任意宿主执行。

保持该TTY等待新公开文件；在第二个TTY处理本次新exchange，不能填旧路径。准确UTC开始/到期时间由原profile提交后打印，`collect` 再核对。任何初始核验失败均不得提交授权；提交后任何失败或到期都结束该次窗口，禁止自动再授予。

```powershell
node $op collect $approval $newExchange
node $op relay-stage $approval
node $op relay-initialize $approval
node $op relay-activate $approval
```

`collect` 校验grant5、撤销下限4、完整两代history、前驱digest、桌面签名、原指纹、原Session和最长30分钟期限，再允许上传6字段relay公开pair。`relay-initialize` 使用原公共工具和真实远端TTY，需要比较路径/公开指纹/期限后输入 `INITIALIZE PUBLIC TRUST`；独占初始化新journal/head，既有journal/head/lock或先前初始化尝试均拒绝，未知结果不得重试。

激活只使用原 `harmony-relay.service` 和新 `/etc/systemd/system/harmony-relay.service.d/74-phase74-successor.conf`。覆盖精确内容由 `dropIn()` 生成：WorkingDirectory为原phase69代码目录，ExecStart指向原server和新 `field.authorized.json`，先以空 `ReadWritePaths=` 重置继承项，再仅加入新 `state`。`ProtectHome=read-only`、`ProtectSystem=strict` 必须保留。配置只替换新pair及journal路径；原Origin `networkkit-v1`、TLS验证、域名/证书、127.0.0.1:17846、计时/容量限制不变。nginx只临时复用此前两处burst2→3的精确文件，5次/分钟和连接4不变，经 `nginx -t` 才reload，不开新端口、不改防火墙/DNS/隧道或证书。

原桌面TTY的 `CONNECT FIXED REPLAY` 只在relay初始化和激活成功后确认。手机原生UI比较并保存新完整v2、确认同一host、连接，然后只运行合成任务、流式和rich表单场景；使用同一request/action核对去重，断线后查询结果避免再次提交；按既定四响应场景验证取消。完整断线重连至少留出一分钟代理限流窗口，不改变限流或扩大恢复策略。只允许本次最长30分钟窗口内的原HUKS/DPAPI enrollment、control、E2E和device-proof签名；不是“总共只签一次”。

## 结束和失败处理

成功、失败或到期均在原profile正常结束其TTY，使原owner撤销并关闭资源；正常手机退出，保留并记录私有公开trust/锁读回结果。`start-field` 在子进程结束后尝试检查原owner持久状态及profile自己的cleanup回执，只在确认revoked6/活动0、资源已关闭时恢复public field配置。尚未创建grant的拒绝保留revoked4；确认前内部已提交又撤销的失败允许保留6。无法确认时不会伪报恢复成功，也不会改凭据。窗口到期会拒绝授权访问；操作人仍须正常结束profile并核实持久撤销，不能把过期视作已经写入epoch6。

```powershell
node $op restore-field $approval
node $op relay-restore $approval
```

`restore-field` 可用于profile启动前的安全中止；启动后必须有真实退出和cleanup证据。原home public配置只能在after-hash匹配时恢复原字节，不回滚凭据或Session。若 `start-field` 已报告自动恢复成功，不重复运行该命令。

`relay-restore` 可在本次其他步骤失败时独立隔离候选；它只移动内容精确匹配的本次drop-in到本次rollback目录，daemon-reload后启动原服务，恢复经hash校验的本次nginx备份，测试后reload，核对原执行路径、空ReadWritePaths、原文件及无后端活动连接。已有TIME-WAIT不等同于活跃连接。外来unit/nginx内容不覆盖，清理失败单列为未知。即使撤销结果未知，也可执行已批准的relay隔离恢复；之后停止授权相关工作并报告。保留新旧journal/head/锁、完整v2、receipt和所有尝试记录，不删除失败目录、历史、凭据或手机数据，不降级v2。服务及nginx恢复不能代替桌面撤销或手机正常退出证据。

## 离线重现与限制

工作区重现：`node scripts/phase74-build.mjs`、`node --test tests/phase74-operations.test.mjs`、`node scripts/phase74-sdk-check.mjs`。封存包自带同一测试文件；设置 `HARMONY_PHASE74_TEST_PACKAGE` 为解压后的包目录，运行 `node --test tests/phase74-operations.test.mjs`。历史fixture是公开grant3导出，仅供离线验签，不是新的手机读回或授权依据。测试只使用合成观察、内存维护适配器和临时独占文件，不调用实机模式、SSH、签名或真实grant owner。

离线通过只能说明参数检查、拒绝路径、事务清理模型和辅助程序加载/编译已检验；Linux/systemd/nginx真实维护、HUKS/NetworkKit、私有文件、ArkWeb及端到端真机结果仍需上述批准后的证据。另有实际原授权owner的独立合成测试，验证4→5→6及完整签名历史，使用固定fixture身份、内存凭据和新合成目录，不读取原home。全库doc-sync10项及ui-devflow lint6项的具体限制保留在原工作区 `evidence/phase73-validation.json`；本次封存alpha4/relay/native路径没有ui-devflow输入，但不能声明全库检查通过。
