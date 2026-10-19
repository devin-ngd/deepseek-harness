# 原生平台适配与共享核心

当前原生资格见[第60阶段](phase60-installed-hdc-disconnection.md)：CMM-AL10 / API26 已原位安装获批 SIGN 用途修复包，原公钥读取及身份复用通过；真实 HUKS 签署仍待验证。沙箱空输出不能作为物理离线证据，手机操作使用已验证主机上下文；后续主机也明确返回 [Empty]，对应 USB 接口未枚举。没有改USB、驱动、网络、权限或密钥；测试驱动以观察到的应用视口限制手势，4项测试通过，尚无修正后真机操作资格。

共享核心新增 NativePortHttpBytePort，原生 NativeHttpIo 提供有限 begin/read/close 私有字节接口并复用同一 wire decoder/PhoneCore；默认关闭、地址不由 Web 选择。真实 DSH 服务经 Node MessageChannel/SDK 替身回放通过，官方 API26 编译通过；v12 未在模拟器运行，HAP 仍为本地 MockDesktop且无 INTERNET 权限。当前资格、应用清单权限/HDC 转发事实和逐项回退见 [第十二批](phase12-private-http.md) 与 [汇总](../evidence/phase12-summary.json)。第十一批原生 ArkWeb/cache/201 证据封存，真实 HTTP、最低兼容 API 和真机仍待验证。

共享ESM入口为 `src/native-runtime.ts`，由esbuild生成HAP-local `trusted-phone-core.js`；入口默认导出 `DisabledNativeProvider`。PhoneCore负责native选择的Session、intent、scope、rich admission；SemanticPhone负责Session解码/投影；PhoneLibrary负责分页、历史、cache envelope和有界图片；guest只得到维护中的rich SDK。MockDeviceRegistry、MockDesktop、SyntheticHost、测试BFF和fetch网络实现不属于该入口。生产入口保持禁用；另有显式native-offline入口仅组合MockDesktop，并已在官方模拟器运行。仅JS资源的存在不表示ArkTS已运行它，不能把TypeScript的Map/union/unknown/AsyncIterable代码直接当ArkTS源编译，也不能让生成HTML装载这个入口。

| 平台角色 | 共享接口与所有者 | 原生已编译候选仍需运行验证的项目 |
| --- | --- | --- |
| 运行容器 | NativeProvider.request/follow/close；PhoneCoreConfig为明确的native-owned配置；DisabledNativeProvider所有操作返回unpaired，close后closed | 确认OS7中应用自带ESM运行方式及ES2022/structuredClone/TextEncoder/atob/btoa/AsyncIterable支持。候选为独立app-owned受信JS容器，经有限消息端口连接ArkUI；不是rich guest本身。先做最小app-owned模块执行/关闭测试，失败就停，不嵌入未知JS引擎或复制语义reducer |
| 原生网络 | NativeProvider的JSON与WireItem接口复用existing wire decoder；NetworkPhone仅保留explicit loopback replay，configured-https现在硬拒绝 | 核实SDK HTTP流式接口、数据回调/UTF8 chunk、Abort/销毁/错误签名、redirect/TLS/权限行为。不能把ArkTS HTTP API假装成浏览器fetch；用窄native byte-stream adapter接共享parser，native持凭据，输出不含Authorization；禁止自动retry任务 |
| cache | CacheStorage.read(maxBytes)/write(text)/clear；shared save/restore先校验owner/epoch/schema/age，source facts/drafts恢复只读 | 核实Application/Ability的app-owned目录获取、stat/open/read/write/fsync/rename/close签名和原子替换保证。长度检查在分配前，同目录独占pending→flush→rename；错误保留旧文件并显示失败；不创建credential存储，先合成app-owned cache |
| rich port | NativeRichPort与RelayGuestGate/BridgeBinding；原SDKpacket parser、actual source、lease、revision、seq和method allowlist | 核实WebMessagePort创建、transfer targetOrigin/rawfile、callback类型、post/close、导航/渲染失败/后台销毁时机。HTML只能调用现有rich方法，不能调用native read/cache/session选择/审批确认。实际bound port由native持有，不能相信packet声称的source |
| native lifecycle/UI | ArkUI fixtures与运行视图均从共享模型投影；生产provider禁用，没有通用JS proxy | 原生Ability回调、私有端口、关闭回执与本地foreground重载已编译/SDK替身验证；实际IME、native滚动、renderer销毁和强杀未验收。当前执行只来自合成宿主 |

2026-10-10官方核实记录： [应用与页面通信](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/web-app-page-data-channel) 和 [WebMessagePort API](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/api/arkts-apis-webview-webmessageport) 超时；[HTTP API](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-http) 只取得文档导航，[文件API](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-file-fs) 无正文。V5 fallback也无可读声明，不拿它作为OS7代码依据。开发前需在官方IDE的已安装SDK `.d.ts` 与官方OS7版本选择器逐项确认上述API和最低API，不把OS7当API7。具体返回类型/重载未知，以上是项目接口责任而不是声称存在的SDK签名。

设备鉴权/配对/撤销/E2EE尚未实现，标准加密操作将通过单独的native `DeviceIdentityVerifier`/密钥存储所有者承担；本轮只定义责任，不写哈希拼接鉴权、签名算法、fake-key crypto或实际密钥。未来验证码/签名须采用平台标准库、明确算法和可审核消息编码，双方可信UI确认后才建立身份。已有合成grant从不投影为production identity；生产provider当前根本没有启用接口。连通SDK并不批准安装、signing、pairing、持久访问或WAN。

官方IDE/SDK路径与版本现已确认，unsigned HAP已在隔离API26模拟器安装/运行，手机build/API仍未知。继续验证IME、恶意guest/精确source/port、原生HTTP及失败生命周期；随后按独立批准推进真实桌面profile、真机signing/调试/安装。顺序见 [设备验证](native-first-build.md)，具体已验与未验分层见 [第十批](phase10-native-emulator.md)。
# 当前真机解析资格

[第56阶段](phase56-native-parser-refusal.md)的诊断HAP已签名验签并原位安装；原HUKS公钥冷读复用，公开挑战与固定{}均在parse-offer阶段以SyntaxError拒绝。根本原因尚未知，不能声明原生验签、设备挑战签名、grant、TLS/E2E或ArkWeb任务闭环通过。解析细分后继仅通过严格TS、SDK替身测试及官方API26 unsigned编译，未安装。
# 当前共享原生模块资格

[第57阶段](phase57-native-util-binding.md)已确认真实调用在共享UTF-8编码处抛错及编译后的util模块绑定缺陷。共享JavaScript现使用系统util默认导入，官方编译后的两个核心均通过导入检查；修复版仅unsigned编译与替身/合成验证，未在手机运行。尚不能声明设备预览、验签、grant、TLS/E2E或ArkWeb任务闭环通过。
