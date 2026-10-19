# Phase5：事件域与手机视图

工程仍位于 `clients/harmony-mobile`。未改发布的 DSH 包、Session v4 数据、安装应用或安全设置。`domain.ts` 验证 BFF JSON 后才进入展示，`SemanticPhone` 是唯一语义归一化实现，`PhoneCore` 连接真实回环 provider，ArkUI fixture 与 Chrome 使用同一模型。

## 数据与展示

`upstream-domain.ts` 引用当前仓库的 Session wire 断言、surface manager、已知事件目录、authored/marker 解析器、rich values 校验、theme 和 guest SDK。现有 esbuild 打包叶模块并记录输入 hash，没有复制 Electron preload。完整 Chat 模块会把 Host/Client 服务声明混入一个 TypeScript 程序，所以手机本地仅保留其 AUTH 文本抑制规则，不引入整个 UI 服务。

代码保留在 text block 内，图片和文件仅投影持久附件引用，不产生下载 URL 或宿主路径读取。注入的 user-role 上下文归为 `context`，保留数据并从默认聊天展示中折叠。当前 rich-inline 的交互派发文本同时匹配生成的 `rich-` RPC 来源、协议字段和可见持久 block 时也折叠；提交值与结果在富块内展示。这是当前实现的展示规则，不赋予权限；普通用户的协议示例和无效文本继续显示。富块引用由持久 assistant message 推导；HTML 不能选择 session。历史替换使用原 surface 校验器并保留来源序列；缺少消息投影插件时降级并禁用修改，不伪造完整历史。

未知 ignorable 事件保留为不透明事实并推进游标；未知 required 事件保留游标但使视图只读。不同 Session 格式只展示版本/游标元数据，不解释记录。非法字段、超量、错 scope、序列错误、历史冲突和 rich revision 矛盾均在提交游标前拒绝。窗口满时要求重新开窗；本批没有新增分页端点。

传输、durable seq、live revision、renderRevision、dataRevision、draftRevision 和 ledgerSeq 独立校验。accepted 与 completed 分开，outcome_unknown 不表示未执行。相同 native intent 只发一次，丢失回执仅查询原 requestId。断开保留桌面任务状态，停止 follow 不取消任务；空重连后缀通过已校验的只读回执确认连接。fork 最后一个 inherited `session/end-seed` 标记划定旧内容，不把只读扩散到之后的新 rich 块。

## 富块与原生壳

`BrowserRichRenderer` 在 opaque sandbox iframe 内安装原版 guest SDK，校验原 HTML/CSS/JS/stateSchemaVersion 的 SHA-256。表单/图表保留自包含 HTML 丰富度；360/480px fixture 控件达到 44px，长代码局部滚动。CSP 拒绝 guest 网络和原生 form navigation。renderer version、rich protocol 或 hash 不兼容时显示 fallbackText 并停止脚本。pendingManifest 与已提交代码分开，不自动覆盖草稿；executable revision 改变需要新 mount。

`RelayGuestGate` 校验 source、mount、render revision、sequence 与 bounded packet，仅开放 draft.save/action.invoke/action.status 和无权诊断。凭据、provider、任意 RPC、文件授权、shell 和审批答复不进入 HTML。审批列表来自 native-owned `approval.list`；正确 scope 的伪审批也被拒绝。TS NativeProvider/NativeRichPort 和 .ets 接口已定义，默认 Disabled；实际 ArkWeb port、HTTP、身份和生命周期实现尚未激活。

ArkUI 源码增加项目/会话选择、共享任务标签、断开后电脑可能继续、错误和待确认展示。发送/取消显示 transport disabled，不再用定时器伪造完成。NativePresentation 由共享投影生成，两条 fixture 会话各自持有正确选择与状态。`phase5-rich-preview.html` 来自实际回环已校验的富块；ArkWeb 仍禁用 JavaScript、文件与网络图片。

## 重现与证据

依次运行 `node scripts/check.mjs --integration`、`node scripts/assets.mjs`、`node scripts/phase5-assets.mjs`、`node --test tests/domain.test.mjs tests/wire.test.mjs tests/guest-runtime.test.mjs tests/native-source.test.mjs`、`node scripts/phase5-check.mjs`、`node scripts/phase5-native-preview.mjs`。这是标准测试进程，不是支持的 dsh application/profile。首次 connect EACCES 报告保留；窄范围自动审批通过后原样重试，每次等待 listener、child 和 Chrome 关闭。

证据为 `evidence/phase5-network.json`、`phase5-vitest.json`、`phase5-node.txt`、`phase5-summary.json` 和两张 `phase5-browser-*.png`。服务与手机 Node 进程不同 PID。真实流进入手机视图，Chrome 草稿通过真实 CAS 保存，固定 action 返回原 session 并完成，480px 历史重开不重执行，第四个 replay 等待 native 取消。每个 isolated Context 严格四响应，real/upload 为零。

| 层 | 已覆盖 | 剩余验收 |
| --- | --- | --- |
| Domain/TS | 合成真实 log、流式、工具、附件引用、未知事件、rich/draft/action、取消/失败、降级、fork、超量和错 scope | 完整 payload 目录、消息投影插件、窗口分页/冷列表、多设备草稿冲突 |
| BFF→PhoneCore→Chrome | 两进程、真实服务、表单闭环、历史 remount、版本/hash fallback、拒绝伪审批、正常 teardown | 标准 Web Connection/mux/SDK、支持的 dsh profile |
| ArkUI/ArkWeb | 增强源码、共享生成数据、Disabled provider、scripts-off 富块资源 | ArkTS/HAP、native HTTP/port、IME/键盘、accessibility、内存、生命周期和真机 |
| 网络/安全 | 未激活接口，无持久凭据或安全设置变更 | 对应批准后的配对/撤销/身份/TLS、WAN/蜂窝和安装 |

图片下载、审批答复、pendingManifest 可信确认 UI、离线持久草稿、真实项目列表和 Session 生命周期操作仍未开放。Chrome 不能替代 ArkWeb 或真机。未改发布入口或持久类型；私有实验 API 的消费者一起更新，不需要 DSH 发布升级指南。
