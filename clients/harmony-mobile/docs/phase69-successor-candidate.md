---
kind: reference
description: 合并候选的显式续接、安全限制、验证证据、待批准动作与回退。
---

# 第69阶段：显式续接与合并候选

此页是候选范围、权限、迁移、验收与下一次获批执行的参考。所有当前改动仅在 `clients/harmony-mobile`，没有提交或推送。原现场已按[第67阶段](phase67-field-closeout.md)关闭：原授权持久撤销纪元2、活动授权0；本轮未读取或修改原凭据、原手机、中继或 Session。

## 行为与持久数据

过期公开记录启动为 `blocked/public-trust-expired`，保留文件和身份，禁止自动连接。显式续接要求用户重新核对指纹与权限；原桌面密钥签名覆盖新记录、完整旧记录及回执、前代摘要和桌面撤销纪元。手机使用原 HUKS 公钥及桌面指纹验证，不生成新密钥。签名、摘要、原身份、主机、准确会话与操作、不同配对标识、未来期限、递增授权纪元均须满足，才原子保存。成功保存也不自动连网。

桌面先读取原授权 owner 中的持久撤销记录，核对旧公开记录、固定会话/十项操作、原身份和完整历史容量，再签发新挑战。已有授权历史不能走初次登记。获批后重新经过原授权 owner 的确认流程；原撤销2只能前进为新授权3。签名回执等提交后步骤失败时，先撤销新授权；撤销失败明确报告结果未知，不返回可用文档。

新增私有公开文件格式 `harmony-product-public-trust/2`，保留 `/1` 读取和完整前代内容；没有修改已发布 Session 类型、格式版本或 SQLite schema。v2 本地撤销只加强拒绝；坏文件、未知写入或拒绝锁不提供重置路径。完整迁移与不可降级限制见[双语升级说明](upgrade-guide/v0.2.1-alpha.4/explicit-public-trust-successor.md)。续接写入与撤销交错时保留新文档及历史，并标记本地撤销。

本候选包含[第68阶段](phase68-connection-diagnosis.md)的无敏感内容阶段日志、有限连接停止状态、精确 Native Origin 兼容和 nginx 初始容量修正。Origin 缺陷是对已检查 SDK 行为的确定性复现；缺乏原现场 HTTP 状态/请求头证据，不能宣称已证明真机首次故障。TLS、DNS、原生运行时和实际代理仍待现场验证。

## 产物与证据

统一目录 `.build/phase69-review-candidate` 含未签名 HAP、独立桌面 dsh profile、中继与配套公开工具、源代码审阅副本、前像、升级说明、待批准动作和完整逐文件 SHA256 清单。`evidence/phase69-final-candidate.json` 是入口，`phase69-candidate-files.json` 是文件清单；封存后不得原位重打包替换。

| 层级 | 证据与限制 |
|---|---|
| 共享 TypeScript 与桌面 profile | 严格源码程序与 profile 程序；构建后脱离工作目录的固定四响应回放、禁用入口、非交互拒绝与缺失 fixture 拒绝。没有真实模型或用户任务。 |
| 续接、安全及完整合成流程 | `phase69-regression-vitest.json`：包括实际 ETS owner 的 SDK 替身、原授权 owner 的内存凭据、新证明/授权、完整流式 rich 交互、断线恢复、去重与撤销。SDK 替身不等于 HUKS/FS/ArkWeb 真机。 |
| Origin 拒绝 | 默认 deny；显式 networkkit-v1 只接受精确 HTTPS 主机和 phone 角色，原 headers、签名、room capability、E2E 与原授权仍必需。重复 Origin、浏览器 Fetch 元数据、Cookie、错误角色、令牌、主机、端口、配对和 query 均拒绝。 |
| 原生编译 | 已安装官方 IDE26.0.0.851、SDK26.0.0.105/API26、Hvigor6.26.8 编译 unsigned HAP；原生 JS import 审计通过。编译包含 syscap 与异常处理提示，未据此声称所有设备可用。 |
| 独立中继 | 复用已封存 phase68.2 二进制及精确文件，默认 Origin deny；公开工具仅准备合成 proposal，非 TTY 初始化拒绝。Linux 运行、目录持久化与实际 nginx 未验证。 |
| 真实桌面/手机 | 本轮无签名、安装、设备 IO、真实授权、远程写入或中继激活；端到端仍未通过。 |

## 下一次获批动作

三组权限分别审阅，授权不会从一组推导到另一组。候选中的 `approval-plan.json` 给出准确文件与哈希、目标、原 Session、拟议新配对标识、新中继日志、期限和操作。任何前置核对失败都先停止，不能靠扩权、清数据或新身份继续。

1. **签名与原位安装**：对封存的 unsigned HAP 使用原批准签名身份，记录新 signed SHA256，再只对原目标 `target-54cfb7ac`、bundle `local.dsh.mobile.offlineproduct` 做保留数据的原位更新。仅 INTERNET 权限，不清除数据或 HUKS 别名。安装后先检查新版本、原公开记录、过期拒绝与完整诊断入口；不创建授权或自动连接。签名身份、原目标、文件摘要或数据保留不确定时停止。
2. **中继维护与预备**：备份现有服务、配置与 nginx；只部署候选文件，原服务和旧配对历史保留。拟议版本目录 `/home/devin/harmony-relay/phase69-successor`，独立新公开日志 `/home/devin/harmony-relay/phase69-successor/state/public.jsonl`；旧日志及 head 不复用。nginx 仅候选精确路由 burst2→3，仍5次/分钟、并发4。先检查 Node/依赖、Linux目录权限与持久化、`nginx -t`、默认禁用/未知配对拒绝和可回退配置，再安排授权窗口。临时 systemd override 仅为该版本目录选择 ExecStart，并只给新 state 目录 ReadWritePaths，其余保护保持；此组不会批准新手机 grant；涉及服务重载/对外接入需对应明确批准。
3. **一次新的有限授权与现场验收**：仅原双端身份、原隔离 home/world 和 `harmony-mobile-field-replay-session`，拟议新 pair `harmony-phase69-successor-20261016`。使用原手机完整公开记录和原 desktop revoked2；新挑战、新手机签名、桌面明确确认，最长30分钟、仅固定四响应与十项已列操作。创建独立新 relay journal/pair，双端重新核对并保存 v2 后显式连接。依次验证手机发任务→原桌面执行→流式与真实 ArkWeb rich→正确会话结果→同请求去重→断线重连不重执行→取消。只在准备全部通过后开始窗口，不自动延长；日志只保留允许的阶段/状态码。未知、失败或到期时撤销新 grant、停双端、恢复中继并保留全部历史。

十项固定操作为 `task.submit`、`task.receipt`、`session.cancel`、`session.sync`、`rich.mount`、`rich.snapshot`、`rich.saveDraft`、`rich.invoke`、`rich.status`、`rich.dispose`。没有桌面任意执行桥、审批代答、上传、真实模型或新用户项目权限。

## 回退

原 signed HAP、phase68.2 unsigned 候选、中继文件及原现场关闭证据保持原样。源码前像位于 `.build/phase68-preimages` 与 `.build/phase69-preimages`，合并候选带副本及差异清单；只对匹配当前哈希的本客户端文件进行审阅回退，不覆盖其他任务文件。尚未迁移的环境可恢复原产物；已保存 v2 的手机先撤销新授权、断开并保留 v2，旧 HAP 保持禁用。旧 grant、旧 relay pair、原 Session/准入日志、撤销纪元和 HUKS 身份不回滚、不删除。
