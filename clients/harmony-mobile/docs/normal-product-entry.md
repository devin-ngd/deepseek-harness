---
kind: reference
description: 普通 DSH 单会话首次配对、产品入口、离线验收与最小部署条件。
---

# 普通 DSH 会话接入

## 概要

桌面插件的 /product 入口复用既有身份、配对、授权和会话服务，支持本地 owner 为当前普通 profile 中一个既有 Session 配对手机。源码数据链已经闭合：选定配置→签名 offer→原生校验/证明→桌面授权→公开记录保存及重载→从已确认 grant 生成产品配置→原会话目录。真实模型、桌面部署和手机连接不属于本次离线结果。

当前0.0.0-normal-controls.1的精确依赖、独立合成测试入口及本地产物见[首次真机清单](first-device-acceptance.md)；生产入口不引用固定回复。alpha.4公开API和实际插件包已通过正常任务/rich合成闭环，仍不能替代运行中Host安装或真机验证。

[当前 Host 命令入口](../desktop-plugin/src/pairing.ts)以默认禁用的 /pairing 插件注册 /harmony-pair，直接选取发起命令的既有根会话。启用后的操作顺序为 status→start <手机公开身份 JSON>→confirm <手机签名答复 JSON>→connect；start、授权确认和连接准备均经原桌面交互服务明确确认。公开答复可重读，重复确认不重复授权；另一会话不能接管待配对状态。stop 撤销桌面 grant 并释放所属传输；relay 公开撤销仍单独维护。身份尚不存在时才使用有独立确认的 identity-create。完整公开配置见[未应用示例](../desktop-plugin/pairing.enabled.example.json)。本批没有在已安装 Host 中启用该入口。

[原生范围管理](../harmony/entry/src/main/ets/product/NativeProductOwner.ets)提供“管理已保存范围（停止当前连接）”和“确认并另存为新范围”。列表按 profile/Session 标识旧、新范围，选择只切换独立文件并显示预览，不自动连接或复用跨范围确认。旧文件及全部签名历史保留；同一旧范围不得另存克隆，已撤销记录不得以另存恢复。冷启动不保存活动选择或恢复权限。共享目录校验位于 [trust-scopes.ts](../src/trust-scopes.ts)，ArkTS 仅拥有文件选择及原生界面。

## 内容

- 配置与持久化
- 验收证据
- 最小部署及所需授权
- 固定网络配置与权限影响

## 配置与持久化

[产品入口](../desktop-plugin/src/product.ts)导出本地库函数 createPairing 和既有 DesktopIdentitySigner。调用方使用现有受保护身份，并明确提供当前 dsh launcher 的 profileContext.name、desktopId 和单个 SessionId；这些选择来自桌面本地产品配置，手机不能替换。入口核对 launcher profile，通过 SessionController.inspect 检查既有 Session，然后构造原 DesktopFirstUse。冷读持久化 Session 不恢复 Agent 或派发任务。

原 owner 的 issue/confirm 继续执行桌面签名、手机证明与本地授权。签名覆盖 ticket 中的 profileId、唯一 sessions 项和全部操作/期限。原生 enrollment 与公开记录预览均展示 profileId 和 Session。确认后调用 install，使用 productOptions(authority, journalMode)从实际已提交 grant 生成同一产品入口的配置。具体配置和生命周期见[插件说明](../desktop-plugin/README.md)；这些本地库调用没有新增 Remote、HTTP 或富块宿主方法。

Session、profile 和操作范围沿用原持久化字段，不迁移或重写旧记录。保存后的公开记录保留相同选择；桌面重新从本地配置和 Session 存储加载。冷启动不会自动恢复 grant 权限。续期仍要求原公开历史已过期、原桌面 tombstone、新 pair namespace、原身份及完全相同 profile/Session/操作；取得新挑战不代表取得新授权。撤销、过期或未确认时 productOptions 拒绝，不能绕过本地确认。旧限测试 offer 的手机共享模块会拒绝普通 offer，需更新源码构建，不能以旧已安装包直接验收。

## 验收证据

针对性命令为 node scripts/test-normal-product.mjs、node scripts/product-check.mjs 和 node scripts/build-normal-product.mjs。测试准备复用已有共享核心生成器与真实 ETS owner，平台方法替换为固定密钥/内存 SDK；无真实 HUKS 或凭据文件。记录见[测试结果](../evidence/normal-product-tests.json)、[原生共享核心构建](../evidence/normal-product-native-build.json)、[桌面 ESM 输入](../evidence/normal-product-build.json)和[检查汇总](../evidence/normal-product-validation.json)。

| 检查 | 已验证范围 |
| --- | --- |
| 普通服务接入 | 原 Gateway/SessionController 的目录、提交/流式、错误、权限、持久去重和不能由手机回答的真实审批等待。 |
| 配对到产品配置 | 正常选择通过桌面签名、实际 ETS 校验/测试签名、原授权 owner、公开记录保存/重载、配置 JSON 重载及产品 metadata；所有步骤保持同一 Session/profile。 |
| 拒绝 | 错误 launcher/profile、缺失 Session、多 Session/通配符 offer、篡改签名范围、撤销后调用和旧公开记录替换均拒绝。 |
| 冷启动 | 真实合成 Session 文件 flush 后关闭并重开，inspect 不恢复 Agent；测试 grant 文件重读后仍受原 profile/Session 约束，不能自动激活。 |
| 续期 | 未过期或缺 tombstone 不续期，改 Session 不续期；合法新挑战不改变已撤销记录，也不安装 provider。 |
| 输出快照 | 本地[预览/保存/metadata 快照](../tests/fixtures/normal-product-pairing.expected.json)固定用户可见的归属信息。 |

上一轮完整结果为12项通过、187模块 strict 通过，桌面 ESM 的126个输入无 replay。最新断线轮为11项通过、1个既有用例超时；新增命令/范围管理4项均通过，覆盖旧历史克隆拒绝和已撤销范围另存拒绝，不将整轮记为通过。模型只由既有服务测试注入，新增配对测试不调用模型。ETS 的 SDK 替身不替代原生执行；官方复编及源码一致性结果见[本轮验证记录](../evidence/normal-product-controls-validation.json)。冻结候选和已安装产物未变。

连接层没有新增可确认的现场根因；已有顺序/错误回调修复及其证据见[诊断记录](phase76-control-diagnosis.md)。最近[现场收尾](phase76.2-field-closeout.md)止于 public-pair 上传被自动审核拒绝，不能推断手机 control/data 成功。本批没有手机、SSH、实际签名/配对/授权、上传、用户配置修改或新访问窗口，撤销10/活动0保持原状。

## 最小部署及所需授权

下面仅是待批准的实际步骤，本次未执行。运行目标必须使用通过版本核对的新构建，不以当前源码测试代替已安装 Host/手机兼容性。

1. 在目标正常 dsh profile 中核对所需服务/API 与依赖，保留原插件、profile patch、admission 域、Session 与撤销记录；仅替换已审阅的新插件/原生构建。安装、必要的同源重启及手机签装需要相应批准。
2. 由该 profile 的本地 owner 使用产品入口的 createPairing、既有身份与原确认流程，明确选择一个现有 Session、手机公钥及操作/期限。确认后由 productOptions 生成 activation 配置，首次 create 与后续 reopen 必须匹配 admission 域状态。真实身份使用、挑战签名和新范围授权需具体批准；不复用已消耗的 grant9，不自动开启下一 epoch。
3. 仅向批准的 relay 目标提交对应六公开 pair 字段，使用现有本地维护工具准备并初始化新公开 journal/head，定向设置所需服务可写目录和新 pair 配置，再受控重启/启动 relay。上传、公开持久化和服务配置各需授权；没有新增远程 enrollment/admin 端点。
4. 手机使用原身份导入新公开记录，明确确认 profile、Session、权限及期限，再启动双方连接。真机验收发任务→原桌面执行→手机流式/ArkWeb 交互→正确会话回传、重连不重执行、取消及撤销；这些真实操作和安全收尾需一次明确范围批准。

回退保留所有 grant tombstone、公开历史、admission receipt 和原 Session；只停止并还原本轮批准替换的代码/配置。不能删除历史来让旧包重新接纳普通范围。

## 固定网络配置与权限影响

可保持的长期网络结构是现有 TLS host 的两条精确 WebSocket 路由持续代理同一个 loopback relay，端点仍是 /harmony/relay/control/v1 与 /harmony/relay/v1。一次批准配置后，普通任务、重连和后续公开 pair 维护不需要每轮切换 nginx；沿用原 TLS 校验、Host/Origin/子协议规则和同一 loopback 端口，不增加公网 Node 监听或任意路径代理。常驻服务及精确路径长期可达本身需要一次明确批准，不能把既有临时维护授权当作长期授权。

现有 broker 从静态配置和公开 journal/head 启动，未实现动态公开 pair 导入；续期仍需本地维护和受控服务重启，不能声称热加载已存在。保持固定 nginx 不等于延长 DSH 权限：当前 grant 上限仍为30分钟，冷桌面启动和期限结束仍需原确认/续期流程，前台连接也保留有限重试。无人值守持久访问、自动续期或更长期限均不在本次代码或授权内。若将来需要，应单独审阅权限策略；本批没有扩大它。

最小后续实现是为同一 profile/Session 增加明确的到期状态和本地续期命令，继续走原历史、tombstone、新挑战及授权确认，并为静态 relay 更新提供受控交接；该方案仍保持30分钟和冷启动限制，不能解决离开电脑后的长期可用性。后者需要单独批准的“长期设备登记＋短期会话授权”策略，明确登记撤销、冷启动确认和租约恢复，再实现原 provider 的恢复流程；不能只放大 TTL 或自动复活已撤销 grant。本批没有实施该权限变更。
