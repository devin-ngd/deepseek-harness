# 第十四批：原生联网执行与实际阻塞

本批在官方 API26 独立模拟器中实际安装 INTERNET-only 回放包，完成原生连接、固定任务和富表单 action 回传。真实 DSH SessionController、agent-loop、rich-inline、JSONL 和 StorageDomain 参与执行；真实模型与上传均为0。完整原生验收未通过：rich action 后出现 `rich-inline/source-offload`，当前客户端没有该事件的消息投影器，转为只读，后续原生取消、重复提交、服务重开和隔离自检未完成。不能用自动化回归或前批截图替代这些项目。

## 工具和许可

用户手动完成官方许可确认后，仅读取 `.emu_config` 的两项已知标记，均为 `agree`；75字节，修改时间 `2026-10-11T16:11:14.0912741Z`，SHA-256 为 `4bc31a223ddc953bbddd05fed2f7d88b8f00fdf800de7647a0ea33eb4ccbefe4`。本批 agent 未输入协议接受项、未修改许可标记。复用 DevEco Studio 26.0.0.851、SDK26.0.0.105/API26、Hvigor6.26.8、Emulator26.0.0.402 和现有共享 HDC。独立实例为 `DSHOfflineAPI26`，目标 `127.0.0.1:16311`，API26 phone_all_x86 镜像；这些是模拟器证据，不是用户手机安装或真机证据。

## 实际链路和修复

安装原封存 v13 回放 HAP 后，实际 BFF 已收到 follow，而原生没有收到首帧，随后报 `native-http-lease-expired`。`NativeHttpStream` 等待 `requestInStream()` Promise 返回200后才交付字节；该 Promise 在流结束后才完成。旧版官方 HTTP 文档示例有 `Status-Line`，实际 API26 响应头只含 cache-control、connection、content-type、date、keep-alive、transfer-encoding、x-content-type-options，未包含该字段。当前 SDK 声明为 `requestInStream(...): Promise<number>` 和 `headersReceive: Callback<Object>`；当前官方文档页面没有返回可读正文。参考入口：[官方 HTTP API](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-http)、[旧版官方示例](https://developer.huawei.com/consumer/cn/doc/harmonyos-references-V3/js-apis-http-0000001281201030-V3)。

修复在共享 BFF 的200响应中增加 `x-dsh-mobile-stream: dsh-mobile-wire/1;status=200`。原生严格检查 NDJSON Content-Type、可用的 SDK Status-Line 和显式流标记，允许在 EOF 前交付有标记的持续流；错误标记和非200 SDK结果均报失败。该标记是 BFF 的协议声明，不是 SDK 在首帧时返回的 HTTP 状态码，也不是鉴权或配对凭据；后续 SDK失败仍终止流。原生替代测试覆盖首帧、非200、错误版本/状态和注入换行；实际 BFF 测试覆盖200协议响应携带标记、403拒绝不携带标记。默认权限为空的离线包仍禁用 native HTTP。

固定回放服务在零任务首轮失败后关闭，在原127.0.0.1:51850端口重启以加载标记修复。唯一 rport、原deadline和独立清理owner保持不变。随后原生连接返回 phase11-desktop；原生固定任务 `phase13-task` 调用真实 SessionController，ArkWeb 展示富表单。显式重连后历史恢复；富表单提交 title=`Final mobile input`、count=`7`，原 Session 的 `phase3-action` 完成，ledgerSeq=4、dataRevision=2，客户端收到 `Mobile action completed by the real rich-inline service.`。

## 验收范围

| 项目 | 实际结果 |
| --- | --- |
| 官方 ArkTS 编译与模拟器安装 | 通过；独立 unsigned INTERNET-only 包 |
| ArkWeb 私有 MessagePort → NetworkKit → rport → DSH BFF | 通过；已收到原会话及富 action |
| 原生任务与流式事件 | 通过；原生日志含 running/completed，Session 日志保留 canonical 事件 |
| 富块 HTML/表单、草稿与 action | 实际提交成功；桌面存储记录对应值、draftRevision1、action completed |
| 断线后显式重连和历史读取 | 首次任务后实际执行；未因此新增 prompt |
| action 后继续交互、取消、重复任务、服务持久重开 | 被投影缺失阻塞；未完成原生验收 |
| 本批 guest 隔离自检 | 未运行；action 后 Web 被只读状态隐藏 |
| 原生流程自动验收 fixture | 失败；仅消费3/4回放、2/3 prompt，未进入 reopen |
| 安装的用户 DSH、WAN、物理手机 | 未连接、未验证 |

`SemanticPhone.project()` 对 `MESSAGE_PROJECTION_EVENT_TYPES` 保留缺失投影保护；不能删除该检查或把事件改成 ignorable。现有 `richSourceProjection` 位于 `packages/experimental/rich-inline/src/host/source.ts`，依赖 node:crypto 和 Host 入口。下一批应在独立 checkout 中提供维护中的浏览器可用投影入口或由服务输出已解释的显示投影，复用原校验，覆盖合法与损坏 target/hash/sourceRef、其他未知 required 事件和连续 action。原事件和已提交 Session 格式世代保持不动。

原生 HTTP lease 与 BFF request 当前均为60秒，闲置后断开且需显式重连。下一批需要有界流段/心跳/重连恢复设计和真实原生证据，不能用延长所有超时掩盖恢复问题。原生按钮截断、富表单需要滚动、只读提示错误称为继承历史，也记录为后续 UI 工作。

## 权限寿命和清理

唯一规则为 `tcp:18081 tcp:51850`，开始 `2026-10-11T16:19:22.229Z`，deadline `2026-10-11T16:49:22.229Z`。在 `16:36:15.274Z` 提前完成清理流程；`16:37:37.936Z` 复核规则和目标为空、16311/51850无监听、本任务模拟器 PID67228已退出，共享 HDC仍为PID67100。测试包官方卸载返回成功；卸载后 scoped bm 返回与安装前缺失包相同的通用错误。

保留原始清理失败：HDC `fport rm` 的带空格单参数被工具保留了引号，退出码0却提示规则未找到，直接删除未成功；模拟器停止返回后即时端口核验仍监听。实例最终退出时规则消失。清理工具已补充零退出码失败文本检查、分开的精确规则参数、卸载确认和有界停止等待，并为未来清理预留3分钟。修订后的删除参数和整套清理仍需下次获准原生执行验证，本批成功清理不能自动授予新版owner资格。未调用 rm-all、未重启共享 HDC、未改防火墙或开放 LAN/公网。

本批记录位于 `evidence/phase14-network/`、`evidence/phase14-summary.json` 和 `evidence/native-emulator/phase14-*`。v1–v13 ZIP/HAP及历史证据保持原字节；新的 variant 生成记录改为时间命名、create-only，避免覆盖封存的 phase13-variant.json。所有改动在客户端目录，没有 commit、push、收费调用、真实用户任务或已安装 DSH变更。
