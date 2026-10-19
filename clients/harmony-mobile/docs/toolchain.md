# 工具与官方来源

当前检查日期：2026-10-11。用户已安装并打开IDE，本轮只读相关官方安装目录、公开元数据和SDK声明，复用本地组件完成unsigned构建。当前结果见 [第八批构建](phase8-native-build.md)；没有读取账号、密钥或全盘扫描。

| 已确认官方工具 | 实际版本与位置 |
| --- | --- |
| DevEco | `D:\Program Files\HuaWei\DevEco Studio`，26.0.0.851，build261.23567.138.36.2600851 |
| SDK | sdk/default，26.0.0.105/API26；compile/target26.0.0，compatible候选5.0.0(12) |
| Hvigor/plugin | tools/hvigor本地官方包，均6.26.8；无需dependency下载 |
| bundled Node/ohpm/hdc | 24.14.1 / 26.0.0.630 / 3.2.0f，使用绝对路径，未改PATH |
| Emulator/Previewer | Emulator26.0.0.402；实例和下载镜像查询未发现条目；Previewer存在但未渲染验证 |

以下保留2026-10-10首批检查与官方参考，表中的未发现/null/未安装仅表示当时状态，当前工具资格以上方和构建报告为准。当时只查相关PATH、安装注册表、常见Huawei/DevEco/SDK目录及名称相关工程，没有全盘扫描。

| 项目 | 本机结果 | 当前能力 |
| --- | --- | --- |
| Node | `C:\Program Files\nodejs\node.exe`，24.13.0 | pureTS 构建、Node 测试、临时 mock。 |
| TypeScript | 主仓 node_modules，6.0.3 | 严格源码检查；不代替 ArkTS 编译。 |
| pnpm | PATH 有 pnpm.ps1；sandbox `pnpm --version` 对 cwd canonicalization 拒绝访问 | 本实验无需 pnpm 或安装，使用已安装依赖；未为此提权。 |
| Chrome / Playwright | Chrome 标准位置，主仓 Playwright 1.61.1 | 临时 browser fixture；不代替 ArkWeb。 |
| DevEco / ohpm / Hvigor / hdc | PATH、安装注册表和相关常见目录未发现 | HAP、Hypium、模拟器和真机验证尚未开始；不等同全盘不存在。 |
| 鸿蒙工程 | 主 DSH 仓库未发现 oh-package/build-profile/hvigor 工程；默认相关项目目录未发现 | 新建本目录 harmony 源码，不覆盖其他工程。 |
| 设备 | 用户确认 Mate90 Pro Max、HarmonyOS 7；具体 build/API 和调试连接未确认 | 首版主目标已确定，暂不要求更多信息才能推进 mock。 |

官方当前 Windows 工具候选为 DevEco Studio 26.0.0 Release (26.0.0.851)，版本页记录 2026-09-23 发布；配套 SDK 为 HarmonyOS SDK 26.0.0 Release。实际 compile/target/compatible SDK 字段必须在安装后通过 IDE/SDK 确认，不能简单把 HarmonyOS 7 写成 API 7。本目录 `platform.json` 保留 null，准备脚本拒绝未确认版本。来源：[官方 26.0.0 版本概览](https://developer.huawei.com/consumer/cn/doc/doccenter-release-notes/overview-2600)。

| 官方参考 | 用途与读取限度 |
| --- | --- |
| [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) / [安装说明](https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-software-install) | 官方下载/安装入口。安装说明的本次 crawl 只取得导航，磁盘/内存/登录要求需实际安装前再次核实。未下载或运行安装器。 |
| [ArkWeb 页面数据通道](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/web-app-page-data-channel) / [WebMessagePort](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/api/arkts-apis-webview-webmessageport) | 平台候选使用 createWebMessagePorts、WebviewController.postMessage、onMessageEvent/postMessageEvent；本次 Huawei 页面正文 crawl 不完整，精确签名和限制留给真实 SDK。官方 OpenHarmony 上游文档检索到对应端口示例，从 API9 起；不能将其自动等同目标设备行为。 |
| [OpenHarmony WebMessagePort 文档](https://gitcode.com/openharmony/docs/blob/master/zh-cn/application-dev/reference/apis-arkweb/arkts-apis-webview-WebMessagePort.md) | 上游示例先注册 onMessageEvent 再 postMessageEvent；支持 close。具体 HarmonyOS 7 编译与 rawfile origin/message port 转移必须单独验收。 |
| [后台任务合理使用](https://developer.huawei.com/consumer/cn/doc/doccenter-app-quality/bpta-use-of-background-tasks) | 官方正文明确无后台任务应用可能在几秒内挂起。桌面持久执行，手机前台恢复；不通过虚假音频、定位等保活。 |
| [WebSocket](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V5/websocket-connection-V5) | 原生联网 adapter 候选。当前源码没有联网权限，精确 OS7 API/INTERNET 权限在加入真实 adapter 前核实。 |
| [自动签名](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/ide-signing-auto) / [官方测试](https://developer.huawei.com/consumer/cn/testing/get-started/) | 后续 Hvigor/Local/Instrument/Hypium 与真机链路。没有自动签名、证书或调试材料；用户确认后再执行。 |

需要对应批准的步骤集中在 [tasks.md](tasks.md)。当前没有安装未知软件、申请账户、读取凭据、生成证书、开放网络端口或修改安全设置。支持范围与 Linux/macOS 的当前平台能力不能由本机 Windows 检查推导；本实验也没有作这些平台不支持的判断。
