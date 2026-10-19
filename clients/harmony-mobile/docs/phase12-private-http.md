# 第十二批：关闭状态的原生私有 HTTP 字节接口

本批只实现和验证关闭状态的 SDK→私有 ESM 字节接口，工程仍位于 `clients/harmony-mobile`。HAP 的 `requestPermissions` 与 `signingConfigs` 仍为空，原生宿主只运行本地 MockDesktop；本轮不启动模拟器、不创建 HDC 转发、不连接已安装 DSH，不读取账户或签名材料。第十一批 ZIP、HAP、封存文档及证据保留原字节。

## 已实现接口

`NativeHttpIo.ets` 由原生所有者持有固定地址和限额，Web 请求只包含 `command/follow` 选择器及协议 JSON。`http.begin` 返回原生签发的短期句柄，`http.read` 每次拉取一个 base64 字节块或 EOF，`http.close` 等待 SDK 回调移除和销毁。句柄只在当前私有 port 所有者内有效，不能指定 URL、请求头、凭据、文件、shell 或批准操作。原生资源中的 enabled/baseUrl 保持 false/空字符串，宿主初始化及资源生成 gate 均拒绝启用。

`NativePortHttpBytePort` 把有限 IO 接入既有 `HttpBytePort`，继续复用 ByteNetworkPhone、NDJSON/UTF-8 decoder、Session/Rich admission 与 PhoneCore，未复制 domain/runtime。可信调用方的 URL 只用于精确本地端点检查，不跨 port 传递；guest 仍只有既有 scoped rich SDK，拿不到此端口。生产 ESM 导出未激活的字节适配器，离线 ESM 入口仍排除网络实现。

队列按字节、块数和总量限制，单句柄最多一个待取读取，句柄总数有限。SDK 流式 API 没有在这里提供暂停接口，因此慢消费者超过限额时显式失败并销毁请求，不宣称可无限背压。绝对期限关闭丢失 reply 后的请求；已到期句柄仍占有界槽位，直到客户端释放或所有者退休，避免未知结果触发重试。所有者退休唤醒读取并等待全部 SDK 清理，清理失败单独报告，不能被正常取消覆盖。Web close 使用同一 Promise，原生已释放/未知句柄拒绝，传输不重发任务。

`tests/native-private-http.test.mjs` 覆盖 UTF-8、禁用状态、端点/外来句柄、并发读取、慢消费者、绝对期限、取消、HTTP/MIME/201/EOF、非规范 base64、销毁失败和旧 generation。真实服务回放沿用第十一批的隔离 synthetic Session，增加实际 Node MessageChannel 与原生句柄逻辑；这属于 SDK 替身测试，不是 ArkWeb/模拟器 HTTP 验收。

## 网络批准事实与最小联调候选

[官方 OpenHarmony 普通系统授权权限列表](https://raw.githubusercontent.com/openharmony/docs/master/en/application-dev/security/AccessToken/permissions-for-all.md) 将 `ohos.permission.INTERNET` 列为 normal、system_grant；[权限声明说明](https://raw.githubusercontent.com/openharmony/docs/master/en/application-dev/security/AccessToken/declare-permissions.md) 要求在 module.json5 的 requestPermissions 声明。系统在安装应用时授予此类权限，不通过 user_grant 运行时弹窗。它是应用级互联网能力，操作系统层面并不限制到本实验端口；本项目的原生固定地址、私有 port 和 guest CSP 才限制使用范围。它不要求修改 Windows 防火墙，也不需要为此调用权限申请弹窗或安装时强制 grant。华为文档网站本次只返回导航/不可读页面，不能据此声称读到了 Huawei API26 权限全文；API26 编译警告及第十一批实际 201 拒绝提供补充本地证据，手机 API 仍需核实。

[官方 HDC 指南](https://raw.githubusercontent.com/openharmony/docs/master/en/device-dev/subsystems/subsys-toolchain-hdc-guide.md) 定义 `rport remotenode localnode` 为设备到主机的反向端口转发，并提供 `fport ls`、`fport rm` 的查看/删除语法。本机已安装 hdc 3.2.0f 的只读帮助同样列出这些操作；这不是 ADB。上游 [HDC TCP 实现](https://raw.githubusercontent.com/openharmony/developtools_hdc/master/src/common/forward.cpp) 的设备监听及目标连接均使用 127.0.0.1；这是对候选通道地址的源码依据，不是已安装 Huawei 二进制或模拟器上的实测。不能套用 Android 的 10.0.2.2，尚未证明本机模拟器 rport 可达性。

| 项目 | 下一次最小测试候选 | 批准与状态 |
| --- | --- | --- |
| HAP 权限 | 独立测试变体只新增 INTERNET；保留零权限 HAP和现有缓存 | 需要用户明确批准应用清单权限和此变体安装；本轮未声明/安装 |
| Windows BFF | 固定回放的真实 source-service 测试所有者，127.0.0.1:0；操作系统分配 P 并记录 | 既有离线临时 listener 授权覆盖本轮测试；跨模拟器联调用途由父任务统一确认，不是已安装 DSH |
| 模拟器入口 | 仅 DSHOfflineAPI26，候选 127.0.0.1:18081 → 主机 127.0.0.1:P；先检查端口冲突 | 需要独立批准一条临时 HDC rport；未创建，实际监听地址仍待批准后验证 |
| 调试服务 | 复用已有 127.0.0.1:8710，目标 127.0.0.1:16311，始终使用分离的 `-p -s 127.0.0.1:8710 -t 127.0.0.1:16311` 参数 | 不启动或重启共享 hdc/IDE；16311 是已有任务模拟器调试端口，不是新增 BFF 端口 |
| 存续 | 单次联调最多30分钟；仅 synthetic Session，四个固定响应，真实 dispatch/upload 硬拦 | 所有者超时/结束均进入清理；不创建持久凭据或后台服务 |
| 系统设置 | 防火墙、虚拟网卡、虚拟化、路由、代理、隧道、证书、ADB、真实手机调试 | 候选方案不需要修改；若失败先停下并报告，不自动扩大这些权限 |

批准后的计划操作是先记录现有转发，启动独立固定回放测试所有者并取得 P，再针对本任务 target 创建 `rport tcp:18081 tcp:P`，只安装该测试变体并通过私有字节接口进行合成任务/富交互。最终清理顺序为停止应用 IO、按完整 taskstring 删除本任务那一条转发、复核该条已消失、关闭 BFF 并验证 P 释放、停止本任务模拟器。应用权限回退优先使用独立变体包名卸载，避免触碰既有实验 app 的合成缓存；此变体及清理脚本仍应在批准后单独实现和评审。不清空其他转发、不杀共享 hdc、不重启已安装 DSH。

## 资格与下一步

本批编译、回归、HAP 和 ZIP 的最终路径/哈希以 `evidence/phase12-summary.json` 与 `evidence/phase12-hap.json` 为准。第十二批未在模拟器执行，因此第十一批 ArkWeb/cache/恶意 guest 证据仅适用于其已封存版本；Chrome 和 SDK 替身不能提升第十二批资格。原生 HTTP 成功、模拟器→真实 source BFF、受支持 dsh profile/标准 SDK mux、已安装桌面连接、IME、WAN、真机与最终验收仍未完成。

下一阶段可先完成批准后的测试变体与原生联调；生产配对、持久凭据、TLS/WAN、真机签名及权限分别需要具体批准。已经能独立开发的有限字节接口、生命周期和离线测试在本批完成，不因用户暂不回复而停留在方案阶段。
