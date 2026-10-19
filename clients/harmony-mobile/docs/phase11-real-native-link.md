# 第十一批：真实服务字节链与原生负例

原生手机到真实 DSH 服务的 HTTP 链尚未打通。本批把共享 wire decoder 提取为 `ByteNetworkPhone`，保持原 fetch 消费接口，并新增 `NativeHttpBytePort`：Node SDK 替身执行实际 `.ets` HTTP 控制逻辑，连接临时 loopback BFF 和真实 SessionController/RichInline/JSONL/StorageDomain/Gateway。HAP 仍只运行本地 MockDesktop；没有把此测试写成模拟器或已安装桌面连接证据。见 [真实服务记录](../evidence/phase11-real-services.json)、[本批汇总](../evidence/phase11-summary.json) 与 [HAP核对](../evidence/phase11-hap.json)。

创建 owner 消费恰好四个固定响应：流式 rich publication、action 完成工具、完成文本、待取消 hang。实际 prompt 为三次，action 重复调用返回原 receipt；重新连接后重发同一 task 不派发，第四响应由真实 SessionController 取消。随后关闭服务并创建新 Context，从原合成 JSONL/journal/ledger 查询历史、原 task receipt 和 action completed，再提交原 task：prompt 与 replay 均为零。这个顺序重开没有模拟掉电或 OS 强杀，identity 仍是 fixture grant。网络 listener、native SDK 替身请求和服务资源都等待关闭；真实模型/上传为零。

`HttpBytePort` 只提供 HTTP 状态、内容类型、有限字节流及等待关闭。平台负责 HTTP callbacks，共享 decoder 负责 UTF-8/NDJSON、响应字段、Session/desktop/device、流结束和大小上限；不得自动重试任务。Native factory 只接受固定 loopback command/follow endpoint，拒绝 HTTPS生产模式、外部主机、query、hash 和 credentials。`.ets` 配置禁用 proxy/cache/redirect，BusinessError 201 显示 `stream-permission-denied`。当前 HAP 未把 native HTTP 注册到私有 ESM port；获准连通之前还要实现有限的 native 字节 IO 调用、代际撤销、背压与失败回执，不能暴露任意 URL 或原生执行方法。

官方 [HTTP API声明](https://raw.githubusercontent.com/openharmony/docs/master/en/application-dev/reference/apis-network-kit/js-apis-http.md) 说明 requestInStream 需要 `ohos.permission.INTERNET`，201 表示权限拒绝。实装 SDK26 的声明、编译器权限警告及本任务 API26 模拟器自检对应核对；上游 master 文档不是手机最低兼容 API 的证明。自检只对模拟器自身 `127.0.0.1:1/mobile/command` 发送空 JSON，没有端口转发、主机服务访问、权限申请或凭据。HAP 的 permissions/signingConfigs 仍为空；原生拒绝证据不是原生 HTTP 成功资格。

原生合成 B 改为固定恶意 guest 自检，A 保留原表单。Worker/WebSocket 的拒绝必须观察异步 CSP violation，不能根据构造函数是否返回判定。shell 负例只在当前有效序号返回精确 `forbidden` 时通过：程序有限探测被拒绝的序号，这些请求不会推进 gate；一般错误、未知结果与超时均不算通过。伪造 cache.clear/submit 走普通 parent.postMessage，拿不到私有 native port；还需通过任务行数不增加、A旧缓存正常恢复来核对无效果。这些固定负例不覆盖全部 WebRTC/download/source/port/lifecycle 攻击。

实际发现会话切换时 rich.dispose 的旧回调会发旧 Session 视图，native 的严格 Session 校验因此关闭 port。修复在共享 `NativeOfflineHost` 退役前撤销该 core 的 display publisher，等待 follow/renderer/core 清理后才创建新 core；native admission 没有放宽。Chrome 覆盖 A富块→B负例→A恢复，确认旧消息不会混入新会话。新增固定任务按钮避免打开未经授权的小艺输入法，HTTP自检放在静态入口，避免压缩运行中消息列表。

失败证据保留：早期 native worker/WebSocket 测量显示 UNEXPECTED；旧视图切换触发 native-port-failed；Node fetch SDK 替身一度在重开关闭时挂住，最终改为 Node自带HTTP流并等待 request/response close；一次既有 phase5 Chrome 等待拒绝超时原因未确认，补充诊断后后续通过。资源生成与构建曾重叠，编译器退出0但输入哈希变化，构建 gate 返回 artifact=null，该产物不作为交付。原始记录位于 [初始负例](../evidence/native-emulator/phase11-security-initial/analysis.md)、[切换失败](../evidence/native-emulator/phase11-retiring-view-failure/analysis.md) 及本批各 regression/native-build 目录。

最终原生 [HTTP拒绝](../evidence/native-emulator/phase11-final-http/analysis.md)、[安全结果](../evidence/native-emulator/phase11-final-security-top/analysis.md) 与 [A旧缓存恢复](../evidence/native-emulator/phase11-final-cache/analysis.md) 已执行，截图实际查看。CLI在PNG写完前返回，两个早期截图副本被截断；已从相同文件名的完整原始PNG按字节重新复制，保留坏副本与旧manifest，并增加有界PNG尾标记等待。此采集脚本是完整产品回归后的唯一脚本变更；[独立拒绝测试](../evidence/phase11-capture-validation.json) 验证截断PNG不发布，[逐图核对](../evidence/phase11-png-audit.json) 验证六个已知合成目录的副本匹配完整来源。该等待不是任意PNG结构验证。静态fixture入口列表高度和固定按钮文字截断仍是原生UI待办，IME与完整视觉/辅助功能资格没有提升。

后续首要独立工作是未激活的 native SDK→ESM 字节 port，并用可控 EOF、status/header失败、UTF-8切分、关闭超时、代际撤销、背压和跨Session包测试。原生连接真实测试服务必须先取得 INTERNET 与具体 emulator-host 通道批准；如果需 reverse forwarding、监听或安全设置，还要相应批准。已安装 DSH profile/addon、配对/持久凭据、WAN/TLS、签名、真机调试/安装和任何真实模型都另行批准。不要因用户离开而启用。IME新声明仍跳过。

复现顺序为 `node scripts/regression.mjs`，资源完成后再 `node scripts/build-native.mjs`，然后按既有授权安装到专用模拟器。hdc 参数必须使用分离参数 `-p -s 127.0.0.1:8710 -t 127.0.0.1:16311`；粘连的 `-s127...` 被本地版本错误解析为端口127，退出0且无有效结果，不能算执行证据。现有共享hdc/IDE不重启。所有执行均固定 replay/mock，源码写入只在本客户端目录；v10 ZIP/HAP保持原字节，v11单独保存。最终交付仍需手机发任务→真实桌面执行→原Session流式/rich闭环→断线不重执行与可信审批的真机证据。
