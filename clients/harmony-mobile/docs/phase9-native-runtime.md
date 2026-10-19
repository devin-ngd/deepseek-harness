# 第九批原生离线适配

工程仍位于 `clients/harmony-mobile`，复用用户已装的官方 DevEco26.0.0.851、SDK26.0.0.105/API26 与 Hvigor/plugin6.26.8。新增原生适配已有实际 CompileArkTS/unsigned HAP 构建；最终构建与源码哈希将记录在本批汇总。真实桌面、配对、网络权限、签名与安装均未激活。

ArkUI 负责会话选择、输入、任务显示和按钮；NativeRuntimeOwner 只从 HAP 固定资源白名单读取并验证长度/SHA-256，再用 ArkWeb `loadData` 加载本地 ESM。`https://dsh-runtime.invalid/offline/` 仅是加载数据的文档基址，不是网络服务。控制器实际 URL、完成 URL 和目标 origin 必须一致才能转移 WebMessagePort；实际 ArkWeb 的 URL/origin 行为尚未运行验证，不会放宽 fileAccess 来绕过失败。

生产入口 `src/native-runtime.ts` 仍导出 Disabled provider，HAP 的 `trusted-phone-core.js` 排除合成身份与网络实现。明确命名的 `src/native-offline-entry.ts` 是另一入口，仅组合现有 SyntheticHost、MockDesktop、RestrictedDesktopAdapter 与 admission journal。其 fixture journal 只在该入口投影为合成 canonical Session 消息/turn/stream，不修改原 lab journal、真实 Session 或已发布数据。重复 native command 和 stable task intent 共用现有去重；合成 action 完成仍由原 MockDesktop ledger 所有。

共享 PhoneCore/SemanticPhone/PhoneLibrary 承担 JSON admission、NDJSON、消息投影、草稿/富块和缓存 envelope。原生端口只提供 `fixture.bytes` 与固定 cache read/write/clear；URL、HTTP启用、生产 token、文件路径、审批确认和任意宿主执行没有 RPC。应用私有端口只交给 app-owned 文档，rich guest 仍是 opaque sandbox iframe，经现有 RelayGuestGate 和原版 guest SDK 操作已挂载的块。

容器 CSP 禁止 connect/worker/form/object/base，父文档只执行已验证的 HAP 内联模块。父文档允许 inline script 是为了让子 srcdoc 的独立 nonce CSP 可以执行原版 SDK；未受信 HTML 从不进入父文档。guest 使用独立 nonce、sandbox `allow-scripts allow-forms`、没有 same-origin 权限。原生关闭 file/dom storage/database/online image/geolocation/multiwindow，并拒绝 Web 权限、文件选择、新窗口、下载 destination 与非允许导航；不注册 JavaScript proxy 或 runJavaScript。

NativeCacheFile 在 app filesDir 的固定文件存源事实和草稿，不存凭据/租约。读取先 stat、限制分配、完成短读并校验 UTF-8；写入通过随机新目录隔离 pending 文件，完整短写、文件 fsync、close 后同文件系统 rename。SDK 没有 EXCL 标志，采用 mkdir 的新目录创建，不伪造 API。目录 fsync、OS 强杀与断电原子性未验证；已提交但清理失败有单独错误，不能当成未提交重试。

NativeHttpStream 按实装 SDK 编译，有 byte/total/time bounds、精确 NDJSON header/status admission、callback disposal、redirect=0 与 cache=false。它没有注册进 offline RPC，配置 enabled=false/url空，权限列表为空，open 在 createHttp 之前拒绝。未来仅 loopback 路径可进入这份候选，且 redirect 控制要求 API≥23；低 API 失败关闭。其 SDK 替身测试不等于真实 HTTP 或网络许可验收。

每次共享视图更新会检查富块，data revision 经 snapshot 更新，render revision 改变时重建 mount。cache 恢复前先停止 follow/renderer，恢复只读并清空旧可交互 iframe；缓存缺失/失败也停止依赖任务，需用户显式重连。后台/销毁先发送有期限的 shared-core close，收到释放回执后撤销代际、端口并清理 native IO；未确认清理会显示错误，不重试任务。foreground 只重载本地文档，不自动连接或提交。原生 pending 状态抑制双击，超时显示 outcome unknown 并关闭载体。

`scripts/native-adapter-build.mjs` 用测试专用 SDK 替身执行实际普通 `.ets` 源码，覆盖短读写、fsync/rename/cleanup、symlink/超量、资源篡改、header/status/timeout、callback 失效及私有端口关闭。`scripts/native-runtime-browser.mjs` 将 NativeRuntimeOwner 实际生成的 HTML 放进 Chrome，以私有 MessageChannel 和内存 SDK 执行 native-byte→shared-core→rich SDK→mock ledger→native DTO→cache/close 链路。不存在公共 browser-native fixture binding；测试泵只在父文档读取自己的队列。

Chrome360/480截图仅包含该本地 HTML 的240px富块视口与当前滚动位置，不含 ArkUI 页面。其 native intent/action 去重、表单、UTF-8增量、只读缓存和 opaque guest 断言不提升 ArkWeb、原生文件系统/HTTP或设备资格。Native HTTP 和测试替身没有真实网络/模型/上传；完整 regression 仍单独覆盖已有 source replay 和 BFF。

只读模拟器检查见 [证据](../evidence/phase9-emulator-audit.json)：官方工具26.0.0.402，CLI实例列表为空、两个镜像目录命令无条目输出，不能由此确认 downloadable catalog 或大小。内置 Phone profile 模板只列API11–17，也不能据此判定SDK26镜像是否可用。`-license` 明确提示两份待审阅协议：HarmonyOS SDK License Agreement 与 HarmonyOS Software License and Service Agreement；未输入同意、未下载/安装/启动镜像、未改Hyper-V/防火墙。官方文档页本轮仍无可读正文；实装 public SDK 声明和CLI help是本批接口依据。

后续先由用户审阅上述协议并决定是否批准，再确认官方镜像名称/API、下载大小与兼容条件；仅在原有安装批准可涵盖且不出现新许可/安全变更时准备镜像。签名、手机USB/无线调试、INTERNET、配对和真实桌面 profile 必须分别批准。最小 ArkWeb 验收为本地模块执行→exact URL/origin端口→富块提交→后台close→foreground仅加载；之后才做固定 replay 桌面和真机闭环。

最终结果见 [汇总](../evidence/phase9-summary.json)：115 Node +9 source replay +7 BFF=131独立用例，两个嵌套用例已包含；Chrome15+15+25+24=79项断言。实际API26构建成功，46项原生输入和回归冻结输入在封存时重核，unsigned HAP为733509字节，包含143728字节modules.abc和三个已核验本地资源。源码回退包为 `D:\Temp\dsh-harmony-client-20261011-source-v9.zip`，对应 `evidence/archive-v9.json` 在ZIP之后生成；HAP为 `D:\Temp\dsh-harmony-mobile-20261011-native-v9-final-unsigned.hap`。v8及此前ZIP/证据保留。工具警告中的权限/可能抛错/Syscap仍留在构建日志，未屏蔽或改宽权限。
