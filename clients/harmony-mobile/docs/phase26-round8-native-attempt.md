# 第八轮 socket 原生复验

本记录涵盖明确批准的第八轮 API26 模拟器窗口，只补 socket 自动恢复，使用相同[封存 v25 HAP](../evidence/phase25-hap.json)及稳定驱动。真实结果为零通过、零已执行失败、一 blocked；socket/reset-snapshot 故障没有注入，不能判断恢复正验通过。本轮没有放宽校验、改变载荷/预期文字、重建 HAP 或重开结束后的窗口。[汇总](../evidence/phase26-summary.json)与[原始文件索引](../evidence/phase26-artifact-index.json)保存完整事实，第七轮原有两次 socket 失败继续保留。

## 原窗口、准备与清理

首次转发 `2026-10-13T01:01:21.758Z`，30 分钟截止 `01:31:21.758Z`，清理预留 `01:28:21.758Z`；首次创建的驱动截止 `01:21:26.383Z`。所有同窗替换继承这些时间，没有刷新起点。最终清理 `01:15:35.393Z`，距首次转发 853635ms（14 分 13.635 秒）。共有三次自有模拟器启动、两次顺序映射，任意时刻最多一条；第二次准备没有映射。主机[核对](../evidence/phase26-native/round8-resume2/final-host-check.json)只保留原 HDC PID33004/loopback8710，没有重启共享 HDC 或启动 IDE。

| 尝试 | 原生进度与结果 | 清理 UTC |
| --- | --- | --- |
| 首次 round8 | v25 正常就绪；应用检查记录在驱动前超过既有 60s 有效期，prewindow-app-not-ready；零 follow/故障 | 01:01:29.686 |
| 同窗 resume1 | 冷启动后 aa start 被 screen-not-ready 阻断；未建映射、未启动驱动场景 | 01:06:18.107 |
| 同窗 resume2 | 无密码常规上滑、前台/私有文档/新控件就绪；初始 follow 后 native-port-failed，等待有效原生 view 超时；socket 未执行 | 01:15:35.393 |

首次准备与驱动间隔造成过期，原拒绝和记录保留，没有修改 freshness 上限。第二次准备的锁屏拒绝没有绕过。第三次先观察[普通锁屏](../evidence/phase26-native/round8-resume2/prelaunch-screen.jpeg)，沿用此前同范围已批准的单次无密码上滑，并核对[主屏](../evidence/phase26-native/round8-resume2/awake-screen.jpeg)后正常启动；没有密码/PIN、认证、开发者模式或锁屏设置操作。就绪与开映射/驱动紧邻执行，仍使用原计时。

两次开窗映射分别为 `tcp:18081 tcp:34091` 和 `tcp:18081 tcp:56783`；中间准备的 BFF 端口 36735 没有映射。三次自有资源清理均成功：准确映射删除并核验为空、各 BFF 退出与 listener 关闭、独立 netreplay 包卸载并确认缺席、官方 CLI 停止各自模拟器与目标端口关闭。12 份启动/停止前后纯文件许可 metadata 的 SHA-256 均为 `4bc31a223ddc953bbddd05fed2f7d88b8f00fdf800de7647a0ea33eb4ccbefe4`，mtime 均为 `2026-10-12T02:57:25.618Z`；没有 `-license` 探测、交互输入、接受新许可或复制原始许可文件。

## 最早失败与根因

最终初始 session.sync 的 commandId 为 `native-core-1871f552-b94c-4d91-afbc-fa4e68c4028b-1`。原生 generatedAt=1791854084846、sentAt=1791854084908，桌面 receivedAt=1791854085165、checkedAt=1791854085170；expiresAt=1791854137846，wire TTL=53000ms，接纳剩余期 52676ms，仍在原 `(0,60000]` 范围内。桌面 trusted，elapsed/future-limit 均为零。HTTP 200/NDJSON marker 接纳后，ArkTS 收到并交给 sink 76009 字节。

`09:14:45.347` 与 `.387` 两条原生日志报 native-port-failed；随后该读取以 ended=false、code=stream-closed 关闭。没有有效 `DSH native view` 或精确探针发布，socket 故障尚未执行。最早失败是初始帧的私有诊断接纳，发生在可见原生展示之前；不是 fault-written、到期拒绝或断线恢复失败。上游随后生成 rich.mount 读取命令，也没有到达已关闭端口之后的 BFF。

诊断源码存在明确不匹配：wire parser 允许合法 `relayCursor=-1`，新 FollowJournal 没有本代际 transport 帧时从 -1 开始；持久 Session cursor=35 是另一条序列。v25 NativeRuntimeOwner 的 decoded/admitted 私有诊断却要求 relayCursor 非负，抛出 native-follow-diagnostic-invalid，被接收层归为 native-port-failed 并关闭 owner。私有诊断在拒绝前没有打印字段值，因此原机没有该值的直接包日志；源码生产规则、同一保存会话的真实源服务复现和同一 staged `.ets` 复现共同确认了不匹配，不能将离线复现冒充原机完整接纳证据。

[只读源码复现](../evidence/phase26-source-repro-2026-10-13T01-27-45.318Z/source-reset.json)实际产出 reset/relayCursor=-1/domainCursor=35，共享 SemanticPhone 接纳，task=cancelled、readOnly=false，零 prompt/replay。新临时 loopback 测试结束关闭，不连接原生资源。[v25 SDK 替身复现](../evidence/phase26-diagnostic-repro.json)在校验过构建哈希的 staged NativeRuntimeOwner 上分别发送合法 -1 的 decoded/admitted 诊断，两者都重现 native-port-failed；该复现成功只证明缺陷，不是诊断接纳通过。此前 v25 SDK 替身只覆盖了正游标，漏掉合法初始值。

本轮没有修改诊断条件、wire parser、桌面接纳、payload 或预期文字；封存 v25 HAP SHA-256 `5d11bd2a4b3b06d9bab85ebcb3e0d411e90a7ce1c165fabdfcbaa56bbd29a5f7` 原样保留。后续需在离线独立修改中对齐私有诊断和现有 wire 的合法游标范围，覆盖 -1/0/非法更小值及失败处理，再审查替代 HAP。当前没有额外原生窗口批准，本轮到此关闭。

## 检查、封存与资格

本批只为第八轮增加精确 environment/world 绑定和 socket-only 限制；eighth 模式必须显式 checkpoint-proof，不能走原发任务/缓存/其他故障场景。原 HAP、校验和值域没有改变。25 项相关驱动/window/lease/proof 检查通过，新增只读复现后 71 模块 strict TS 通过，源码 sentinel 复现一项通过；均不提升原生 socket 资格。[检查](../evidence/phase26-checks.json)记录实际命令。

新增源码复现首次有两个编译错误（unused import 和 protocol 字面量未显式标为 MobileCommand），且测试自身取消清理抛错；错误记录保留。只修正该测试的类型及独立 cleanup，服务 finish 在 consumer 取消异常时仍执行，原传输/诊断校验不变；同一行为检查随后通过。

三次原生尝试及新增只读复现的真实模型、上传、prompt/replay、用户真实任务派发均为零。没有配对、持久凭据、公网/LAN、隧道、防火墙、签名、系统时间或权限设置变化；已安装 DSH 和主仓其他任务改动未触碰，没有 commit/push。当前仅实际运行 API26 模拟器、既有真实源码服务与 mock/固定合成状态，不代表真机、WAN、已安装桌面 profile 或最终手机客户端完成。回退使用[修改前 hash](../evidence/phase26-before-hashes.json)、`.build/phase26-before` 和 v25 源码链；旧封存和失败记录不覆盖。
