# 第七轮原生复验记录

本记录只涵盖 v23 clockfix unsigned HAP 在官方 API26 隔离模拟器上，经临时 loopback BFF 与 HDC 映射进行的三项复验。当前资格为两通过、一失败、零 blocked；同窗 socket 补验也失败。第六轮三 blocked、第五轮四通过三失败及全部历史 ZIP/HAP 保持原结果和原字节。机器可读结果见[汇总](../evidence/phase24-summary.json)，原始文件及 SHA-256 见[索引](../evidence/phase24-artifact-index.json)。

## 原生判据与结果

| 场景 | 首次执行 UTC | 实际结果 | 原生证据 |
| --- | --- | --- | --- |
| socket reset 自动读取恢复 | 12:43:38.724–12:44:38.804 | failed：checkpoint-timeout | disconnected→connected，rows=6→7；未观察到唯一探针的原样 Text/originalText |
| cursor-gap | 12:44:38.804–12:44:51.161 | passed | 原生日志 error=cursor-gap、readOnly=true、disconnected；固定任务 Button visible=true、enabled=false；零新派发 |
| cursor-conflict | 12:44:51.161–12:45:03.521 | passed | 原生日志 error=cursor-conflict、readOnly=true、disconnected；相同固定任务 Button 禁用；零新派发 |
| 同窗 socket 补验 | 12:59:29.613–12:59:58.262 | failed：checkpoint-text-not-observed | reset-snapshot 写出且 rows=7；限定四次 List 滑动后仍未观察到原样探针文字 |

socket 的正验要求原生 Text/originalText 精确等于该次唯一 `DSH read checkpoint ...`，仍保留这一判据。首轮服务确实 consumed/written transport-reset、reset-snapshot、cursor-gap、cursor-conflict；补验 consumed/written 两个 socket 故障。写出探针、恢复连接或 rows=7 均不能替代原生文字证据。补验最后的[控件树](../evidence/phase24-native/round7-resume1/last-checkpoint-layout.json)有 `7 / 6`、历史 action 与固定取消任务文字，没有探针；限定滑动未解决缺口。当前不能确认是 lazy-list 视口问题，渲染/布局原因仍待离线排查。

首次[配对证据](../evidence/phase24-native/round7/paired-proof.json)与补验[配对证据](../evidence/phase24-native/round7-resume1/paired-proof.json)分别保留。两张[gap](../evidence/phase24-native/round7/cursor-gap.jpeg)、[conflict](../evidence/phase24-native/round7/cursor-conflict.jpeg)原生截图已目视复核：可见断线状态和禁用任务按钮；准确 cursor 错误字段来自原生日志，不是截图中的文案。源服务测试进程的通过状态仅证明该进程的防护与清理，不代表这三项原生全部通过。

## 时钟与故障关联

复用[有界时钟修复](phase23-command-lifetime.md)的原 HAP，SHA-256 为 `a3cdbc4691ca69fa176cb931d17cda1ed6f31da1f36fae7943b5e577fb69e5fe`，1963175 字节，本轮没有重建。名义 TTL=60000ms、wire TTL=53000ms、桌面 cap=60000ms 不变；没有未来宽限、过期接纳、系统时间调整或公开协议字段变更。

首次 34 条、补验 15 条桌面命令均按 commandId 完整配对原生 generatedAt/ArkWeb monotonic epoch、sentAt/ArkTS Date.now、received/desktop Date.now 与 checked/desktop monotonic epoch。首次剩余期范围 53289–53482ms，补验 53260–53517ms，均在原严格 `(0, 60000]` 接纳区间。六次故障分别关联 fault-taken/fault-written 的同一 commandId、faultIndex 与 expiresAt。两次 owner 均 trusted，elapsed/future-limit 拒绝各为零；这些数据只验证本场景，没有建立生产授时或任意跨设备偏差保证。

首次最终 carrier 为 requests=11、follows=23、disconnected=1、gatewayErrors=0；补验最终为 requests=5、follows=10、disconnected=2、gatewayErrors=1。最终 active 都为零，listenerClosed=true。补验末尾错误计数原样保留，未用此前观察值覆盖最终记录。两次 prompt/replay/真实模型/上传均为零，没有重新发送固定工作任务。

## 单窗口与清理

原始首次转发为 `2026-10-12T12:43:34.992Z`，30 分钟截止 `13:13:34.992Z`，清理预留点 `13:10:34.992Z`；原驱动截止 `13:03:35.438Z`。补验继承原 lease 与 driver anchor，没有重新计时。首次清理完成为 `12:45:07.292Z`；最终补验清理完成为 `13:00:01.989Z`，距首次转发 986997ms（16 分 26.997 秒）。映射依次为 `tcp:18081 tcp:41465` 和 `tcp:18081 tcp:25896`，激活总数二、同时最多一条，旧映射确认删除后才建立第二条。

两次各十项清理全部通过：准确映射删除并核对为空、BFF 退出且 listener 关闭、独立 netreplay 变体卸载并核对不存在、官方 CLI 停止各自拥有的模拟器、模拟器端口关闭。最终主机核对只保留原 shared HDC PID 33004 与 loopback 8710；没有停止或手工重启该 HDC。已安装 DSH、IDE、主仓其他任务文件保持原样，没有 commit/push、真实桌面连接、真机、WAN、持久凭据或权限扩大。

两次启动前/后与停止前/后的许可 metadata 均为 SHA-256 `4bc31a223ddc953bbddd05fed2f7d88b8f00fdf800de7647a0ea33eb4ccbefe4`、mtime `2026-10-12T02:57:25.618Z`。没有接受新许可、写许可字段或复制原始许可文件。补验纯文件预检曾将 PowerShell 已物化的 DateTime 再按本地字符串解析，错误认为清理预留点已到；该失败发生在复制、启动或建映射之前。随后使用既有 Node 时间预算读取原始 ISO 时间，保存[预检](../evidence/phase24-native/round7-resume1/resume-preflight.json)，没有重置截止或改变系统时间。

## 源码、检查与续接

本批只扩展已有驱动和 owner：phase24 精确 world/environment 选择、v23 HAP 选择、同窗口继承、socket-only 子集以及精确探针的有限视口观察。观察最多四次滑动，必须先确认唯一可见、可用且可滚动的原生 List 与有效 bounds；每一步检查原时间预算。没有修改 HAP 产品 UI、PhoneCore、桌面接纳或 rich 协议。

本批执行 `node scripts/check.mjs --integration`（70 模块 strict TS），17 项原驱动/lease/window 检查及包含其在内的 19 项视口观察检查全部通过；两组有重叠，不能相加。`node scripts/phase24-evidence.mjs` 仅读取封闭目录、核对原始矩阵/许可/清理/HAP/时钟，并生成证据，不调用 SDK 或网络。原始字节在索引指向的文件保留；仅对本地可读日志换行规范化，保留对应 `.raw`。前置官方 ArkTS/HAP 构建证据仍属于 v23；本轮是该相同 HAP 的实际 API26 原生执行，没有真机资格。

窗口已关闭，本轮不再重开。后续先离线定位原生探针缺失，保留精确正验标准和两次失败，再按获批范围验证修复。生产授时、跨进程 grantEpoch、防重放、真实 DSH profile、配对、WAN 与真机各自仍需实现审查及对应批准。回退使用[修改前 hash](../evidence/phase24-before-hashes.json)、`.build/phase24-before` 与 v23 源码链；本轮增量不覆盖旧代际。
