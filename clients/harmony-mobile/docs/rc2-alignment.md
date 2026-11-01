---
kind: reference
description: rc.2 手机桌面插件候选、实际验证范围与现场阻塞。
---

# rc.2 手机桌面插件对齐

## 2026-10-23 命令结果显示修复

`0.0.0-rc2.4` 已通过官方 CLI 更新，74 个安装文件与独立候选逐项一致，DSH 已启动。被动客户端通过官方命令完成事件向原会话发送安全通知，不等待根上下文的会话专属服务。独立 Client strict 检查为零诊断，源浏览器工厂与打包工厂的同一组 8 项通知测试均通过，被动 Host 载体检查确认未注册私有通信服务；[构建清单](../evidence/rc2-controls-artifacts-0.0.0-rc2.4.json)、[客户端测试](../evidence/command-feedback-tests-0.0.0-rc2.4-1792745870198.json)、[打包客户端](../evidence/command-feedback-package-0.0.0-rc2.4-1792746051976.json)和[安装启动回执](../evidence/rc2-feedback-installation-20261023.json)分别记录范围。旧包和旧证据保留，模型、隔离组与安全配置哈希不变。用户已在当前首页实机看到 `desktop` profile、目标 Session 的 `not-started` 状态，rc2.4 命令通知显示验收通过；此结果不代表配对或端到端验收。随后只读前置检查发现原手机为 USB Offline、在线目标数为零，尚未读回当前 App 状态及原 HUKS 公钥，详见[显示验收与前置检查](../evidence/rc2-feedback-user-acceptance-preflight-20261023.json)。手机、身份库、配对 grant、relay 和真实模型任务未触及。

## 2026-10-22 保留记录

当前客户端桌面候选为 `0.0.0-rc2.2`，DSH peers 精确固定 `0.2.1-rc.2`，Cordis 为 `~4.0.5`，Schemastery 为 `~3.18.5`。安装版已更新为本候选，70 个公开文件与候选清单逐项一致，bundle 已选入；配对命令入口已配置启用，其余两个入口禁用；DSH 已启动，命令实际注册及真机闭环尚未验证。上游和安装版 DSH 未升级。

## 候选与检查入口

- 插件包：`D:/Temp/dsh-experimental-harmony-mobile-0.0.0-rc2.2.tgz`，180199 字节，SHA256 `bb9b236c469117c234df595860e8e642955a9fc043ae18eb73d7fa86139e9c50`；[打包清单](../evidence/rc2-controls-artifacts.json)记录所有公开文件与源输入。未完成打包流程的 `rc2.1` 归档保留，不用于部署。
- `npm run check:installed` 消费实际安装 rc.2 / protocol4 的公开模块；`npm run check:installed-package` 强制使用打包入口。两者从安装 ASAR 和已安装 rich-inline 解析，不用工作树替代运行时依赖。
- `npm run test:controls` 复用已有五项合成检查；`npm run check:isolation` 验证临时 provider/authorization 隔离。固定回复仅属于既有测试 export，本轮未增加固定回复产品入口。
- `npm run package:desktop` 只生成桌面插件归档，与手机 HAP 独立，禁止覆盖已存在版本。默认禁用策略保留；打包成功不表示插件已经加载。

源码检查使用当前 rc.2 rich-inline 和其他主仓 API。浏览器投影因主仓尚无对应公开 export，继续保留外部提取源码；共享类型、校验器、guest SDK 和 registry 入口逐项比对当前源码哈希。Typert registry 的源码检查仍保留原有两处泛型擦除包装，并严格比较差异仅限这两处；不关闭 strict 检查，不修改主仓包，安装版 API 检查不使用该提取 registry。外部提取源码仍须保留，不能声称已完全脱离 `D:/Temp`。

## 已验证与边界

strict TypeScript 6.0.3 的 169 个 lab/integration 模块及 191 个 product 模块通过；源入口和打包入口分别在安装版的 489 个公开模块上完成既有合成流程；五项 controls、92 模块隔离验证、52 项部署 guard/claim 测试通过。证据分别为 [安装版 API](../evidence/rc2-controls-api.json)、[打包入口](../evidence/rc2-controls-package-smoke.json)、[controls](../evidence/rc2-controls-tests.json)、[隔离](../evidence/rc2-controls-isolation.json)。这些结果不代表真实模型任务或真机表单、重连验收。

## 现场阻塞

2026-10-22 正常启动现有官方 HDC 服务，未使用 restart；`127.0.0.1:8710` 的设备列表为 `[Empty]`。未执行安装、手机启动、配对、挑战或授权。手机连接并解锁前，今天的安装和运行状态仍未验证。

对保留连接签包执行的官方应用和 profile 验证通过，载荷报告步骤未完成。复核原子进程的有效策略为 RemoteSigned、文件未列出 Zone.Identifier、前次报告未生成后，使用原脚本、原 Windows PowerShell 和原精简环境做了一次诊断；[明确诊断](../evidence/connection-deployment/payload-diagnostic-1792664502371.json)捕获 SecurityError / UnauthorizedAccess，明确拒绝加载未数字签名的 `phase59-hap-payload.ps1`，`reportExists=false`。这是脚本加载信任检查拒绝，不是 HAP 载荷不一致或 JSON/ZIP 处理失败。未重签、未安装，未修改策略、解除标记、替换执行器或把脚本改为内联执行。RemoteSigned 下该具体路径为什么仍要求签名尚无更深层证据，不据此声称组策略为 AllSigned；[Microsoft 执行策略说明](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1)解释了策略、签名与来源信任检查的关系。该动作已停止，需符合现有系统策略的受信任脚本/验证入口才能恢复。

桌面更新存在官方非 UI 路径：[随包 CLI](../../../apps/desktop/README.md#bundled-command-runtime)要求完全退出桌面后使用安装目录的 `resources/runtime/cli/bin/dsh.cmd plugin --profile desktop ...`；全局旧 dsh 不适用。运行中的 [Plugin Manager](../../../packages/boot/plugin-manager/README.md)也支持安装与 bundle/row 启用，其 `plugin_manager` 工具每次调用要求 danger-full-access 或该次批准，并依赖已认证的应用会话。当前桌面仍运行，本任务没有该认证工具或 Windows UI 会话；未强制关闭用户会话、读取认证 token、直接构造应用 Context 或直接写运行中 profile。候选 bundle 三个入口均默认禁用；安装及选择 bundle 本身不生成身份、挑战、grant 或连接；实际启用连接仍需本次明确范围。五个配置文件已做不展示内容的本地备份并前后复核哈希一致：`D:/Temp/dsh-harmony-rc2-config-backup-20261022-182625`；未复制凭据文件，也未修改 profile。

现场恢复前需由主会话确认原 HUKS/DPAPI 身份使用、唯一普通 Session、既有 relay 的最小 public pair 变更、至多 30 分钟的新授权及撤销方式，以及真实 provider/model 和调用次数/金额上限。旧测试授权不复用；准备好之前不启动授权计时。最终验收仍是普通会话实际任务返回、HTML 表单回传、会话归属与重连去重。


## 当前默认模型与预算依据

仅投影公开配置字段确认桌面默认 provider/model 为 `zai-coding-cn / glm-5.3`；这不是某个已有 Session 的实际选择证明。实际安装 ASAR 的 pi-ai provider 默认指向 `https://open.bigmodel.cn/api/coding/paas/v4`，用户配置没有 baseURL 覆盖，属于 Coding Plan 路由。未读取密钥、账号套餐或余额，也没有请求真实模型。

[官方套餐说明](https://docs.bigmodel.cn/cn/coding-plan/overview)规定按输入、缓存和输出 Token 抵扣积分，并设五小时及周额度；适用套餐耗尽后不会继续扣其他资源包/账户余额。[接入说明](https://docs.bigmodel.cn/cn/coding-plan/quick-start)说明个人套餐、团队套餐和标准 API 的 key 类型不同；[指定工具列表](https://docs.bigmodel.cn/cn/coding-plan/tool/others)未列 DeepSeek Harness，因此不能从路由名称或 pi-ai 库依赖推断 DSH 已获套餐覆盖。实际套餐有效性、余额和适用性未核实，尚不能承诺零额外费用。主会话可据此确认本次 provider/model、最多三次生成、Token/积分上限及适用性；在确认前不发真实请求，不切换到按量 API，不新购套餐。


## 部署结果（2026-10-22）

本次更新前确认 DSH 已退出、候选哈希一致，五个配置文件与备份 `D:/Temp/dsh-harmony-rc2-deploy-20261022-201748/config-backup` 一致。用户明确确认单版本、单次流程的例外后，仅向本次官方 CLI 子进程传递既有排除项加 `dshmarket@1.66.47`；旧包移除与 rc2.2 安装均退出 0，70 个公开文件全部与候选匹配，bundle 已选入。子进程已退出，父进程环境、profile 的持久安全设置及全局安全配置未改变，用户/机器环境没有保留例外。安装完成时三个入口均禁用；随后仅启用本地配对命令并启动 DSH，见下述加载记录。安装有 peer 警告；只读 pnpm 检查返回 profile 依赖图缺失/冲突，尚未观察安装 Host 的加载结果，未自动补装共享包或修改其他插件。详见[桌面安装核验](../evidence/rc2-desktop-installation-20261022.json)。

已消费上轮一次性离线核验证据，未重跑临时 PowerShell 放行。签名连接 HAP 通过官方 HDC `install -r` 原位安装成功，并读回相同 bundle/version 元数据；随后一次官方 `aa start` 成功并观察到应用进程。保留应用数据和原证书，未卸载、清数据或创建身份，没有调用连接、pairing、grant、relay 或模型。安装成功回执、准确签包哈希与安装后元数据共同保存，单凭 versionName 不能区分旧包。完整结果见[本轮部署记录](../evidence/rc2-deployment-20261022.json)。

桌面包安装已完成，连接启用与真机闭环仍待确认。当前 DSH 已启动，下一步须核实命令注册和原身份 provider 的受控接入，再明确单一普通 Session、限时新配对授权、relay public pair 变更和实际模型预算；没有沿用旧 grant，也未执行这些动作。

手机只读布局检查未通过启动验收：应用自有页面显示“配对配置不可用”“未连接”“远程连接尚未启用”“操作未确认完成”及“旧授权已过期”。系统启动命令与 PID 成功仅说明进程已运行，不证明应用就绪；未见系统权限弹窗，没有点击身份/挑战/配对/连接控件。[手机界面状态证据](../evidence/connection-deployment/rc2-phone-deployment-ui-20261022.json)保留诊断，原 HUKS 身份本轮未重新读回验证，不能据此声称身份验收通过。

本次仅为 `/harmony-pair` 配置本地命令入口，当前 profile 的 credentials provider 保留，没有打开历史 DPAPI 文件或执行身份、start、confirm、connect、stop 命令。源码确认注册命令本身无身份、授权或网络 IO。DSH 进程和 Host Web 启动标记已观察，启动日志同时显示既有账户自动获取模型目录；普通启动不是零外连。未核实运行中的命令注册，未把普通进程启动当成功能验收。原 DPAPI 身份位于历史隔离库，其接入及原手机 HUKS 可用性尚未验证；实际 provider 为 `zai-coding-cn` / `glm-5.3`，套餐资格与模型费用仍未知。详见[命令入口启动记录](../evidence/rc2-command-load-20261022.json)。

本次无模型配对准备停在授权窗口开启前：原桌面保护格式与公钥指纹匹配，原文件哈希保持不变，旧 replay 范围 epoch10 仍为 revoked；未解除 DPAPI 保护或导出私钥。HDC 当前没有设备，尚不能核实原手机 HUKS；DSH 仍运行，原凭据隔离组新补丁仅保存在临时目录，未应用。只读 SSH 确认原 relay 为 inactive/dead、broker 禁用、没有登记 pair，服务不支持热重载；代码及配置哈希与交接记录一致。未启用服务、修改服务器、创建 grant、登记 pair 或调用模型；没有本轮活跃授权需要撤销。详见[配对前置检查](../evidence/rc2-pairing-preparation-20261022.json)。

后续只读排障确认 DSH 已完全退出，执行进程与资源管理器同一用户、同一 Windows 会话；原手机在 HDC 详细列表为 USB Offline，普通列表为空不能再解释为没有插线。官方 SDK 客户端与现有服务端均为 3.2.0f。Windows 已枚举原机 MTP/WIA 功能且设备错误码为 0，当前未观察到 HDC 调试接口；日志在 21:32 先记录认证和握手成功，随后报 E001003 USB communication abnormal，不能据此断定未授权或驱动损坏。未重启 HDC、改驱动或安全设置；配对窗口仍未开启，relay 未启动。详见[USB 前置排障](../evidence/rc2-usb-preflight-diagnosis-20261022.json)。

## Device binding candidate closeout (2026-10-24)

The source-only stage is now superseded by the [rc2.5 candidate reference](device-binding-rc2.5.md) and [exact artifact/evidence manifest](../evidence/device-binding-candidates-rc2.5.json). Device integration 6/6, affected legacy controls 6/6, protocol lifecycle 15/15, packaged feedback 10/10, strict type diagnostics 0, packaged rc.2 public API and official unsigned SDK compile passed. The independent candidates remain uninstalled; persistent device access, original signing material, real relay/WSS/ArkWeb and model task acceptance remain pending explicit approval and physical validation. Manual finite-ticket reconnect and the prior SSH access blocker are documented.
