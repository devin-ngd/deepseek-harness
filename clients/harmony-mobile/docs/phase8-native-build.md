# 第八批官方原生构建

用户已完成DevEco安装并打开IDE。本轮复用 `D:\Program Files\HuaWei\DevEco Studio`，不重复下载、安装或等待旧UAC。公开安装元数据与CLI确认DevEco26.0.0.851（build261.23567.138.36.2600851）、SDK26.0.0.105/API26、Hvigor和plugin6.26.8、bundled Node24.14.1、ohpm26.0.0.630及hdc3.2.0f。工具未加入用户PATH，构建使用绝对路径；版本与资格汇总见 [phase8-native-build-summary.json](../evidence/phase8-native-build-summary.json)。

本轮已完成真实ArkTS编译和unsigned HAP打包。[最终官方构建日志](../evidence/native-build/2026-10-11T06-46-24-046Z.log) 明确包含CompileArkTS和BUILD SUCCESSFUL；[构建报告](../evidence/native-build/2026-10-11T06-46-24-046Z.json) 记录命令、34项输入SHA-256、构建前后输入一致与产物。HAP为397062字节，SHA-256为 `790171a7929a241b418b3a628f2c0d47e04e994d7f42536721f28722de724991`，包含74456字节的 `ets/modules.abc`。无signingConfig，未签名、安装或声明可在手机直接安装；独立副本保存于 `D:\Temp\dsh-harmony-mobile-20261011-api26-unsigned.hap`。

修正均限本客户端。实装构建器要求API26的compile/target写作 `26.0.0`，兼容下限候选仍为 `5.0.0(12)`；这只是构建设置，不确认手机实际API。Ability补齐启动页图标和背景资源，去除重复资源，entry包版本符合官方校验。ArkTS拒绝生成DTO的构造参数属性，生成器改为显式字段与赋值，保留共享SemanticPhone/MessageWindow生成视图。没有复制协议reducer、增加any或关闭类型检查。

`build-native.mjs` 先核对实际IDE/SDK/Hvigor版本，确认permissions与signingConfigs为空，复用官方本地包；模块junction只在工程node_modules内引用实装组件。构建缓存留在本工程，子进程使用环境白名单，禁用daemon、不安装依赖、不下载组件、不部署。共享核心仍作为HAP-local ESM打包；当前默认Disabled provider和scripts-off RichPreview保持关闭，尚未在原生受信运行容器执行。

| 本轮检查 | 结果及证据 |
| --- | --- |
| strict与完整客户端回归 | [当轮报告](../evidence/regression-final-regression-final-mWbvAn/summary.json)：95 Node + 9 source replay + 7 BFF =111独立用例；2个嵌套子进程已包含，不另加；TypeScript6.0.3检查41个模块 |
| Chrome参考载体 | 15旧fixture + 15 BFF富块 + 25共享手机/桌面断言 =55；不得计为ArkWeb |
| 原生源码及安全子集 | 4 native-source + 6 security =10通过，包含在95 Node中，不重复加总 |
| 构建错误修复 | 保留SDK版本格式、缺启动页资源与21条构造参数属性诊断；[诊断目录](../evidence/native-build) 保留失败与通过日志 |
| 安全与清理 | 固定replay预算四响应，第五次拒绝；真实模型/上传0，临时loopback listener关闭；无签名、配对、权限或已安装DSH改动 |

沙箱曾阻止官方Node路径解析/junction，以及测试loopback连接（EPERM/EACCES）。仅在这些实际错误后窄范围host重试相同构建/回归，没有改变防火墙或产品安全设置。完整回归在冻结输入上通过；之后仅调整文本校验脚本忽略Hvigor生成目录，并单独运行文本/链接校验。原生构建输入未受该文本工具改动影响。

DevEco收到一次打开工程请求，但Java窗口可访问性无可读控件，CUA初始化失败，局部公开窗口截图为空白；没有确认GUI导入或首启步骤完成。该请求另启了本任务拥有的IDE进程，已按准确PID/开始时间清理，保留用户原有PID59988。CLI构建可独立运行；不能据此声明GUI协议已接受或工程已在IDE显示。

收尾查询时原有PID59988已不存在，退出原因未确认；本任务没有终止或重启该用户进程。当前GUI状态不能从早先进程存在推导，后续先以用户实际界面为准。

官方Emulator26.0.0.402存在，但 `Emulator.exe -list` 返回Empty，`-imageList -downloaded true` 无条目；沙箱与只读host查询一致。未创建/启动模拟器、下载镜像、启用虚拟化或调试。Previewer二进制存在，`-h` 仅返回PrintLog诊断，没有完成原生UI或ArkWeb渲染验证。

`Emulator.exe -license` 无输入调用显示两份协议的review提示并终止，记录见 [原始提示](../evidence/phase8-emulator-license-display.txt)。这是显示协议的命令，不能据此判断用户是否已接受。实装公开文件标题为HarmonyOS SDK License Agreement和HarmonyOS Software License and Service Agreement；后者含区域/版本变体。若后续实际启动提出新接受要求，先让用户核对对应变体，不执行accept。公开文件路径、hash与 [隐私声明](https://legal.cloud.huawei.com/legal/privacy/statement.htm?code=CN&language=en_US) 记录在汇总中。

下一步先复核 [实装SDK声明](../evidence/phase8-sdk-declarations.json)，实现app-owned受信ESM容器的最小执行/关闭探针，再HTTP byte-stream、cache与scoped message port；不把通用JS proxy或Electron桥引入ArkWeb。GUIpreview/模拟器、IME/触摸/CSP/端口/生命周期、签名安装与真机分别验收。真实桌面profile、配对与持久访问、INTERNET权限、WAN和签名账号继续关闭，任何新许可或安全设置分别确认。

回退保留v1–v7源码ZIP与第七批封存报告。原生输入和生成资源可由check/assets/phase5-assets/prepare-native重建；独立unsigned HAP与构建证据不依赖IDE临时目录。没有commit、push、上传或修改原有DSH dirty文件。
