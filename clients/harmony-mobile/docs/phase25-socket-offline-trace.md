# Socket 探针的离线分层追踪

本参考只追踪第七轮最后一次 socket 探针，定义最小定位修复、分层诊断和未激活的复验准备。[第七轮两通过一失败](phase24-round7-native-attempt.md)及两次 socket 原生失败保持原结果。本批没有启动模拟器、安装或建立转发，也没有新的原生窗口批准。工程与所有写入仍限于此客户端目录。

## 已知链路与最早缺证据

| 层级 | 第七轮最后一次实际证据 | 可得结论与限制 |
| --- | --- | --- |
| 故障与新 follow | command `...-6` transport-reset、`...-9` reset-snapshot 的 taken/written 配对；后续 follow 继续 | 一次性故障确已写出；不是未注入或 expiry 阻塞 |
| BFF 内容写出 | checkpoint 字符串与源代码分支、fault-written 时间明确 | 没有记录该帧的具体字节/载荷指纹，写出本身不能证明手机接收 |
| ArkTS HTTP | 200/NDJSON marker 接纳，reset 时 CURL 18；新请求成功，原生日志恢复 connected | 没有按 commandId 记录具体探针字节交付；这是最早的接收证据缺口 |
| decoder/语义接纳 | native view 从 rows=6 变为 7，readOnly=false、error=none | 原日志未记录 payload 或 liveText 指纹，不能凭行数证明原样探针接纳 |
| 原生发布 | 同一会话 cancelled、connected、rows=7 | 未记录具体 live 行文字；可以确认界面获得了新增行数量 |
| UI 展示/观测 | 最后 List bounds 为 `[48,835][1032,1044]`，高 209px；可见历史 action 与取消任务，无探针 Text | 四次滑动后仍停在历史第 5、6 行，没有定位到 live 尾项；准确文字正验失败 |

[离线追踪证据](../evidence/phase25-trace.json)保存原故障时间、原生日志和控件几何；原始证据仍在 v24。可以确认驱动的视口定位不足，不能据此证明原机已接纳或已渲染原样探针，也不能把缺失文字全归因于视口。没有复现共享 decoder/投影缺陷；实际原机接收与渲染仍缺直接证据。

## 探针语义与重建

reset-snapshot 将唯一 `DSH read checkpoint ...` 放在现有 snapshot 的 `assistantStream.activeAttempt.stream` 中，使用已定义的 text-delta；它没有追加持久事件、改变 cursor 或执行模型。decodeDomain 接纳 activeAttempt，SemanticPhone 生成独立 liveText，NativeAppHost 将其追加为 `native-live-<sessionId>` 行。该行不属于持久消息总数，因此 `7 / 6` 是六条持久展示行加一条 live 行，不是重复消息计数错误。

本批未改变这个载荷、文本、期限或接纳规则。通过[已保存合成 Session](../evidence/phase25-synthetic-journal.v4.jsonl)的 36 条实际事件和相同注入/投影源码，纯内存重建得到六条持久展示行加原样 live 探针，任务仍 cancelled，接纳后 connected/readOnly=false。原始日志 SHA-256 为 `9b4b124f09298e2273aa44257276bc2c4cd5e18b64e45a15e8c0e5ac86f6cb58`，没有写原会话或调用网络/SDK。重建并非原 HTTP 字节的捕获回放：当时的完整 snapshot 与 assistant revision 未保存，证据明确保留这一限制。

`node scripts/phase25-audit.mjs` 从保存的 Session 输入运行当前共享实现，可重建上述结果。它只写离线证据和 `.build`，不会创建 BFF、调用模型、Native IO 或 SDK。新真实源码 BFF 回归另外验证了 socket 断开后新 follow 的相同探针从实际字节经 decoder/PhoneCore 到 NativeHostView，且 prompt/replay/真实模型/上传为零；其结果不能提升原生资格。

## 最小修复与诊断

ArkUI 增加 locale-owned “最新消息”按钮，通过绑定的 ListScroller 对当前消息末项执行一次无动画 scrollToIndex/END，提供用户主动定位最新输出的操作；没有自动打断用户的历史阅读。消息 Text 和任务状态分别使用稳定 native id。该操作只移动原生列表，不发远端命令、重连、提交、审批或宿主执行请求。官方已安装 API26 的 `scroll.d.ts` 明确要求 ForEach 数据刷新完成后调用 scrollToIndex；本方案在原生发布和用户/驱动点击之后定位。ListScroller 自 API11 可用，工程仍保留 API12 最低候选，实际最低设备兼容性未验收。[官方 List 参考](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/ts-container-list)的正文获取返回 502；接口签名与时序依据来自已安装 SDK 声明，并由官方编译验证。

仅 acceptance HAP 增加关联诊断：BFF 保存 checkpointFrame 的 commandId/instance/relayCursor/domainCursor、完整 NDJSON 字节数及 payload/text SHA-256；ArkTS 记录收到/交给 sink 的字节数、EOF 和失败；私有 observer 分别记录 owner-bound frame 已解码及共享语义状态已提交的指纹；原生 owner 验证展示 DTO 后只记录有界合成探针文字。没有记录任意任务文本、凭据或完整模型载荷，没有增加 guest 方法。普通 HAP 的 acceptance 标记仍为 false。

新的 `nativeCheckpointProof` 要求各层 commandId、instance、cursor、字节/文字指纹一致，原生 live 文字精确匹配，且带固定 id 的 Text 完全位于唯一可见 List 内；任务状态也须保持原值并显示原 locale 文案。字节回调交付仍不能替代 private port/decoder 接纳。纯诊断文字、rows=7、部分裁剪、错误内容、readonly 或任务改变均不能通过。有限观察最多进行一次“最新消息”原生导航，不再猜测滑动距离；所有观察记录第一缺失环节，并继续使用原窗口时间预算。

## 检查与未激活的复验准备

70 模块 strict TS 通过；12 项 proof/viewport/驱动检查、2 项实际 staged `.ets` SDK 替身检查、14 项真实源码 BFF 固定回放通过。SDK 替身验证 commandId 对应的正常/失败字节统计、原生 DTO 的原样 live 文字发布以及错误指纹拒绝，不声称 ArkUI/ArkWeb 已运行。新增源服务回归验证 unchanged live 探针完整路径；旧 mount 观察的消费者已按 probe 类型筛选，不能把新增诊断条数当代际事件数。[检查记录](../evidence/phase25-checks.json)保存各层结果。

现有官方工具链 CompileArkTS/assembleHap 成功，48 项构建输入哈希一致；[v25 HAP](../evidence/phase25-hap.json)为 1972352 字节、SHA-256 `5d11bd2a4b3b06d9bab85ebcb3e0d411e90a7ce1c165fabdfcbaa56bbd29a5f7`。它是未安装的 API26 unsigned netreplay 变体，仅保留 INTERNET；未签名、未部署、未运行原生资源。两次沙箱 realpath EPERM 分别阻断源服务 Temp 目录与既有 Hvigor junction，按仓库规则原样 host 重试通过，失败记录仍保留。前置 v23/v24 HAP 和归档不覆盖。

[复验准备](../evidence/phase25-revalidation-plan.json)保持 activationAllowed=false。驱动和 readiness 的显式 `--checkpoint-proof` 选择封存 v25，并要求 HAP 诊断能力、相同哈希的 readiness 和可见原生最新消息控件；旧 HAP/readiness 不得回退接纳。未来的新窗口仍须专项批准与对应 round/world 绑定，不能复用已经结束的第七轮授权。获批后先验证前置条件，再只注入 socket/reset-snapshot，按分层记录核对原样文字、原任务及零新派发；缺哪层就报告哪层，清理仍优先。

本批主机[只读核对](../evidence/phase25-host-check.json)只有原 HDC PID33004/loopback8710；[许可 metadata](../evidence/phase25-license-check.json)的 hash/mtime 未改，没有调用 Emulator 可执行文件或复制原始许可。真实模型、上传和用户真实任务派发为零；新增探针回归及日志重建的 synthetic prompt/replay 也为零。完整源码回归仍包含既有固定合成场景，核对三个 synthetic prompt 和恰好四个固定模型响应；不能把这组数字说成零。没有持久凭据、网络开放、系统时间或安全设置变化；已安装 DSH 未触碰，无 commit/push。回退见[修改前 hash](../evidence/phase25-before-hashes.json)、`.build/phase25-before` 与 v24 源码链。
