# alpha.4 手机适配与离线验证

本轮按 `mobile-alpha4-handoff.md` 核实 DSH 与 rich-inline 均为 `0.2.1-alpha.4`，审计起点为 `9053da6635c9f3e179e20fe7a2e23015b6f581fd`，包含目标提交 `86a402200d95fecef4529d969836f1fe13c6cb0d`。验证期间用户提交了 `b23972eb7145ab0bb923c45dc28ffcd9f6556412`，仅将 safe-external-research 的版本对齐到 alpha.4；本轮没有修改该包、根锁文件或用户的 Web 测试。

## 已实现的适配

设备证明通过后，授权所有者使用当前 `connection.createPeer()` 创建 `harmony-device` principal，显式设置 `interactions: none`。旧结构型 `DevicePeer` 和已移除的 `OperatorPeer` 不再使用，Peer 编号由官方连接服务生成。设备策略仅允许过滤后的 metadata 和授权 Session 上的 request/follow；操作、设备、epoch、期限及撤销状态会重新检查，未注册策略时默认拒绝。Peer 释放同步拒绝新调用，并等待该设备消费者清理；策略随授权所有者关闭而撤销。

桌面载体在调用 Gateway 前，从已验证的命令或该 Peer 已有的挂载记录解析 Session，作为独立参数注入；request/follow 的资源声明明确列出该 Session，业务方法再核对实际归属。手机的 profile wrapper 和 `lumina-rich/1` 消息格式保持原样。旧 loopback 夹具明确传递其合成测试 owner Peer；它只存在于原有 replay/loopback guard 内，不用于手机设备准入，也没有身份回退。

富块 snapshot、saveDraft、invoke、status 和 dispose 使用租约记录中的 Session 调用当前官方 RPC。guest 包不能提供 Session 或 mount 路由字段；可信渲染器在使用官方验证器时注入 Session，移动命令仍保留原业务字段。RichDraft、持久化数据及 action 指纹未改格式，已有的重开与 action 去重回归通过。当前手机接口没有暴露 snapshotIfChanged、reportRender、registerFile 或 applyUpdate，未新增这些能力。

源依赖解析现在从已安装的 Gateway 依赖定位 ws 与声明文件，从现有依赖定位 Playwright，不安装软件。ws 8.21.3 保持原先的 fragment/chunk 限制；较旧的声明文件通过具名 options 变量表达额外字段，没有类型断言或移除限制。JSONL 持久化加载方式已适配当前模块导出，新 remoteAccess 服务已纳入合成配置与显式注入。

## 真实运行的检查

`node scripts/phase62-test.mjs`：5 个文件、41 项通过，固定 replay，真实模型 0，用户任务 0，没有真实配对或公网连接。它包括当前官方 Gateway/SessionController/RichInline 的四响应流程、收据未知结果恢复、富块 invoke/status、Session/mount 不匹配拒绝、重开去重、取消、受限身份与策略、释放/撤销/过期，以及 guest payload 和指纹稳定性。沙箱最初使合成任务在 realpath 处 EPERM；按仓库规则在宿主上下文运行相同测试后通过，原始失败报告仍在各独立 `.build/phase62-*` 目录。

`pnpm.cmd run build:check`：宿主上下文的 Host、Client 聚合检查 2 项通过。沙箱尝试未能创建 fnm 临时链接或规范化工作目录，保留其失败日志；没有重复构建或升级安装中的桌面。

`node scripts/check.mjs --integration`：未通过，当前仅剩官方 `packages/typert/registry/src/service.ts:315` 的 TS2375 与 `:414` 的 TS2379。这是手机独立组合程序中暴露的泛型诊断；本轮未改官方包、压制诊断或从失败检查生成新手机核心。正式编译项目的聚合检查通过，不能据此将手机独立检查标为通过。

## 尚未就绪的层级

当前官方 rich-inline 没有浏览器安全的 `message-projections` 入口。手机原先使用的显式隔离扩展仍保留在 `D:/Temp/dsh-harmony-upstream-v15-20261011`，它的基线和未完成 alpha.4 迁移状态记录于 `projection-source.json`；Host 对照导入已切到当前官方源码，3 项对照测试通过。这些测试只覆盖既有样例，不能证明完整版本兼容。没有悄悄回退或把该扩展标为 alpha.4 源码。

本轮只验证源码，没有重建 runtime 发布包、public tools 或 HAP，没有重签、安装、真机 ArkWeb/HUKS/TLS 验收，也没有用旧的过期回应创建授权。下一批应先按编译项目组织解决两项组合检查诊断，在独立源码工作区迁移浏览器安全投影扩展并重建 source-hash 清单，再制作可审阅的 unsigned 候选。改变后的 HAP 必须取得新的候选安装批准，保留原 HUKS/DPAPI 身份与应用数据；签名、安装、连接和授权的结果必须分别记录。

## 回退与继续

公开源码原像位于 `D:/Temp/dsh-harmony-alpha4-adaptation-20261016/preimages`，初始 manifest 记录 396 个文件，后续涉及的 tests 与 control-upgrade 原像也已保留。`evidence/phase62-summary.json` 与变更清单记录本轮文件和哈希；只恢复清单指定的手机目录文件，不回退整个用户工作区。phase61 的原始挑战、HUKS 签名回应、暂停检查点与冻结归档均保留，不将其重放为新授权证据。

环境再次离线时，每隔 30 秒最多尝试 5 次恢复，只重试连接与安全状态检查；先核对在途命令结果，不重放安装、签名、授权或可能已经成功的操作，不绕过权限拒绝。真实闭环仍受原有单个隔离 replay Session、实际创建起最多 30 分钟授权、不自动续期、模型 0 与用户项目 0 的约束。
