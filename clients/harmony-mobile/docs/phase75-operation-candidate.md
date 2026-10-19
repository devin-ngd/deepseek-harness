---
kind: reference
description: phase75.1可执行操作器、新旧闭包差异、离线证据和统一批准范围。
---

# Phase75.1完整候选

本候选提供unsigned HAP、独立alpha4桌面闭包、审阅ZIP和单独操作ZIP。操作器已实现签名/原位安装、正常原生UI预检、完整历史续接、六字段pair staging、relay初始化/维护及双端收尾；默认只有`verify`可运行，现场动作必须有与最终plan及manifest绑定的人类批准和本地TTY。旧非执行草案已由[完整操作器](../operations/phase75/runbook.md)取代，旧审阅包及所有现场历史保留。

## 闭包差异

新桌面在`.build/phase75.1-desktop-candidate`，从899文件的原封存包复制其桌面闭包，保留原dsh alpha4、授权所有者、依赖和回放资产。原应用`runtime/node_modules/@local/dsh-harmony-replay/lib/index.js`只有两类修改：外层签名检查替换为`history-verification.mjs`的完整校验；提交后按真实expiry中止TTY等待并进入原finally撤销。新模块从当前共享历史源码和`GrantDeadline`编译，前者与HAP内共享协议hash一致。`history-update.json`及147文件清单记录精确差异；原包不改，操作器拒绝改用旧路径或未知清单。

旧bundle保留既有v1/v2字段解析和写入编码，完整历史接收校验使用新模块；旧的外层检查入口已删除。测试直接调用新闭包内的实际`DesktopFirstUse.issueRenewal`，验证正常历史通过，并用“中间签名错误、外层签名仍有效”的输入验证拒绝，避免只测源码却执行旧冻结实现。构建不重新打入主仓当前用户改动。

手机fresh导出3、桌面完整签名5和撤销6各自核对。5必须自然到期，精确原始hash、规范摘要、原指纹及完整3→5链均匹配，才能作为桌面续接前驱；它从不作为手机当前记录导入。新7必须同时延伸手机3和桌面5。stage/init/activate及原生保存/连接前，再读回唯一活动7并比较完整scope/expiry；撤销5、6、7、旧expiry、缺环、篡改、错身份、重用pair或旧状态回滚都拒绝。

## 外发及收尾

pair只有`pairId`、`desktopPublicSpki`、`phonePublicSpki`、`epoch`、`expiresAt`、`revoked`六项，目标`dhome:/home/devin/harmony-relay/phase75-successor/relay-pair.json`。`field.authorized.json`将它加入原broker策略并绑定新public journal路径。不存在私钥、token、room capability、其他访问凭据、Session或消息字段。六字段校验在SSH前执行，拒绝额外字段；远端operator仅含relay策略，构建/测试拒绝桌面Session、指纹、ID及home/world路径泄漏。准备阶段的代码、hash清单、relay模板、限额及维护文本均在操作包中封存，实际清单随最终证据给出。

提交后的expiry计时器负责中止TTY等待，原所有者撤销至8并关闭资源。子进程结束后，本地public配置和远端service/nginx恢复各尝试一次，分别报告未知结果；保留journal、签名历史、失败文件及旧凭据，不以回滚恢复授权。新`desktop-final`只读核对撤销6或8/活动0，不推断手机退出或资源关闭。手机正常退出及完整7读回仍需原生UI实测；脚本不强停、不解锁、不删锁或清数据。

## 已有证据与限制

119项[操作器/安全测试](../evidence/phase75-operator-tests-latest.json)、56项[完整历史回归](../evidence/phase75-tests-latest.json)及178模块strict通过。实际授权所有者使用纯内存凭据和固定测试密钥；实际ETS所有者使用SDK替代。独立新闭包[脱离仓库冒烟](../evidence/phase75.1-detached-profile.json)完成1次桌面合成派发、4个固定回放响应、23个流帧、rich、历史查询和取消，真实模型/上传为0，禁用及无TTY拒绝通过；不是手机或ArkWeb验证。

unsigned HAP为原phase75 API26编译产物，5,183,409字节，SHA-256 `79c9f1862ad5adf9f07771b1e340ba0ad96031b276fd950ace8a43dc543bdb5c`。本轮改动仅在Node桌面、操作器及测试，HAP源码/输入未变，未重复编译；官方34任务ArkTS编译及导入审计证据仍适用，另验证当前操作器的SDK公共Java校验器及helper加载，不解密或调用签名。新旧封存文件和包hash核对后再打包。

本轮没有手机、SSH、签名、安装、上传或现场grant。尚待一次明确批准后的真机3→7读回、HUKS/DPAPI实际证明、原Session任务/流式/rich/去重/重连/取消及8/活动0与服务恢复证据。操作包可执行不表示这些验收已经通过；真实设备屏幕、锁和控件不符仍会停止。

## 最小统一批准范围

批准对象须列明最终HAP、审阅ZIP及操作ZIP的完整hash和plan/manifest hash。动作限定：原签名保留数据安装；原手机已有HUKS身份的公开读回、比较、必要证明和正常退出；原隔离home/Session由新alpha4闭包重开，一次新grant7最长30分钟、最多4个固定回放响应并撤销8；只向上述SSH目的地传六个公开字段，按封存relay-only文件清单准备独立目录并限时维护/恢复原service/nginx。短期room token仅在正常TLS握手中按角色保护，不能伪称公开数据。无新增权限、身份、长期访问凭据、公共端口、防火墙、证书、真实模型或用户项目操作。

批准文案及三个产物的最终大小/完整hash由封存后的结果提供，不在ZIP内递归写入自身hash。收到批准后仍须新鲜预检；未知、锁冲突、历史不符或自动审批拒绝均停止，不自动重开窗口或换上传通道。
