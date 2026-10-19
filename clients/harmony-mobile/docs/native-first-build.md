# DevEco 准备与第一轮设备验证

当前复用官方DevEco26.0.0.851、SDK26.0.0.105/API26及Hvigor/plugin6.26.8，真实ArkTS编译与unsigned HAP通过，已在获批API26 Phone模拟器安装/运行。第十一批资格见 [真实字节链与原生负例](phase11-real-native-link.md) 和 [汇总](../evidence/phase11-summary.json)：HAP仍是本地MockDesktop，native HTTP只验证缺权限拒绝；原生连接真实服务仍缺INTERNET/测试通道批准和私有字节port。第十批以前证据封存；未签名、未配对或安装真机，GUI导入/preview仍未观察。

在客户端目录运行 `node scripts/prepare-native.mjs` 和 `node scripts/build-native.mjs`，准备脚本生成unsigned metadata，构建脚本复用已装官方本地包且不下载、签名或部署。资源需更新时先运行check/assets/phase5-assets；共享TS核心保持HAP-local ESM，不改写成ArkTS reducer。

官方来源为 [DevEco Studio](https://developer.huawei.com/consumer/en/deveco-studio/)、[安装说明](https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-software-install) 和 [Hvigor命令行](https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-hvigor-commandline)。本轮以实装公开元数据、CLI与SDK声明核对确切版本；`platform.json` 已记录实际工具路径/API/version。具体手机build/API仍未知，compatible下限为候选，不能从OS7推导API7。

| 步骤 | 明确输入与操作 | 保留证据/停点 |
| --- | --- | --- |
| 1 复用工具 | 已确认实装IDE/SDK/API/Hvigor/plugin版本，不读取账号或证书 | GUI首启状态与导入仍未观察，CLI构建独立通过 |
| 2 确认目标 | 稍后取得Mate90 Pro Max确切OS build/API，再核对兼容下限 | compile/target26.0.0来自实装SDK；compatible候选5.0.0(12)尚未确认手机支持 |
| 3 生成配置 | 已记录版本与installedToolchainConfirmed；prepare-native生成unsigned metadata | 不安装dependency或生成签名；未知版本脚本仍拒绝 |
| 4 修正模板 | 已依据官方校验修正SDK版本格式、启动页资源、DTO显式字段与entry版本 | 未创建替代平台声明或关闭类型检查；保持共享模型生成 |
| 5 unsigned构建 | 已由本地官方Hvigor实际CompileArkTS/assembleHap | 构建时46项输入hash与unsigned HAP保存；官方模拟器安装成功，仍无签名/真机安装证据 |
| 6 离线模拟器 | 已按专项批准接受两份许可、下载API26 Phone官方镜像、创建隔离实例并实际运行本地ESM/流式/rich/cache子集 | 新IME声明未接受；完整原生隔离/HTTP/键盘待验证。实例已停止，保留镜像与证据，不修改虚拟化/安全设置 |
| 7 signing/device | 按 [官方签名](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/ide-signing-auto) 获得单独 debug signing/安装/USB或无线调试批准；用户自己处理账号与证书输入 | 不记录私钥、手机号或账号 token。先安装仅离线 fixture，无 INTERNET 权限；保留机型/build/HAP版本截图与日志 |
| 8 平台交互 | 共享TS本地ESM与native byte/cache/private WebMessagePort已编译，并执行官方模拟器正常路径 | 完整CSP/伪造source/port、IME、HTTP/IO失败与强杀仍独立验收；guest不得获通用JS proxy/任意执行桥 |
| 9 最终闭环 | 单独批准真实桌面 profile addon、配对身份与持久访问、网络权限及蜂窝链路方案后：手机请求→桌面执行→流式和 rich action→原Session/幂等；再断线/重复/前后台/撤销 | 仍用真实模型硬拦或固定 replay先验收。WAN监听、防火墙、隧道/TLS/账户费用分别报批；不能从一次权限批准推导其他批准 |

首轮失败日志至少包括时间、层级、OS/API、IDE/SDK、源码 hash、操作、错误码和回退；不包含凭据或用户 Session 内容。回退仅关闭本任务拥有的工具/测试进程，保留 unsigned产物和证据，不改用户已安装DSH。通过Chrome的表单、图表、focus和触摸结果必须在ArkWeb单独重测；模拟器也不能替代最终蜂窝真机证据。
