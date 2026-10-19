# 具体设备调试签名交接

本次仅只读核对封存 HAP、编译工程和已安装官方工具；没有读取设备、账号或签名私钥，没有登录、签名、创建 key、安装、启动模拟器或修改 relay。

## 已核对的包与工程

| 项目 | 实际值 |
|---|---|
| HAP | `D:/Temp/dsh-harmony-mobile-20261014-first-use-wiring-unsigned.hap`，5,262,630 字节，unsigned debug |
| SHA-256 | `bef84845149b9c8ee28a51d8fdeca651b0ea1ac3f98f5a0da0c61471c835d8bd` |
| bundle / version | `local.dsh.mobile.offlineproduct`；`versionName=0.0.0`，`versionCode=1` |
| 安装 API | HAP `pack.info`：compatible12、target26；编译 SDK26.0.0.105；项目兼容值5.0.0(12) |
| 身份运行 API | 实际 ETS 对身份创建、公钥读取和连接配置要求 `sdkApiVersion >= 20`；编译/安装兼容不能替代 HUKS ECE 及真机验收 |
| 权限 | HAP `module.json` 仅 `ohos.permission.INTERNET` |
| 原生入口 | `entry/src/main/ets/entryability/EntryAbility.ets` → `pages/Index`；module=entry，mainElement=EntryAbility，deviceType=phone |
| 当前完整工程 | `D:/workspace/agents/deepseek-harness/clients/harmony-mobile/.build/native-first-use-wiring-project`；签名配置为空 |
| 封存原生源工程 | `D:/Temp/dsh-harmony-native-first-use-wiring-20261014.zip` |
| 已装 IDE | `D:/Program Files/HuaWei/DevEco Studio/bin/devecostudio64.exe`；product-info.json 确认26.0.0.851 |

元数据直接来自 HAP 的 `module.json`/`pack.info`，与工程 AppScope/build-profile 和 [unsigned 编译记录](../evidence/native-build/2026-10-14T06-48-07-600Z.json) 一致。当前离线 `build-native.mjs` 要求 signingConfigs 为空，保留该检查；真实签名副本走官方 IDE 的签名与构建流程。

## 最小官方操作路径

父任务先只读确认用户已信任的实际手机/API，并在签名授权中指定该设备。签名用封存 ZIP 解压出的独立副本，例如批准后选定 `D:/Temp/dsh-harmony-device-signing-20261014`；保留 unsigned 工程与 HAP 原样。用已安装 DevEco 打开副本根目录，进入 `Project Structure` → `Project` → `Signing Configs`，选择官方自动生成调试签名流程；bundle 必须保持上述值，设备列表仅选本人此次确认的手机。由用户本人完成官方开发者登录，再核对工具显示的签名材料存储位置及设备绑定，确认后应用配置并生成新的 debug signed HAP。记录该 signed HAP 的新 hash、bundle、版本、权限和签名结果，再单独进入安装批准。

入口名称由已安装 `plugins/openharmony/lib/project-mgmt-26.0.0.851.jar` 与 `ohos-certificate-mgmt-26.0.0.851.jar` 的公开资源核对。`plugins/harmony/lib/hos-project-mgmt-26.0.0.851.jar` 的资源明确涉及生成 key/CSR、下载证书/Profile、登记设备及账户/协议检查。[官方调试签名总览](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-signing) 已读取，更新时间2026-10-08；其[自动签名详细页](https://developer.huawei.com/consumer/cn/doc/doccenter-deveco-studio/ide-signing-auto) 抓取超时。尚未操作 GUI，按钮措辞及材料保存位置需在用户选择时现场核对，不猜测现有账号或私有文件路径。

## 分开的批准文本

**A：本 app 的官方调试签名。** 允许使用本人在官方 DevEco 中亲自登录的开发者账号，仅为 `local.dsh.mobile.offlineproduct` 和只读确认的这台手机创建必要调试签名材料、设备登记及绑定 Profile，并允许官方工具在本机保存该签名私钥/keystore、证书和 Profile。本人处理密码、验证码、二次验证以及实际出现的协议/注册/授权选择。先核对显示的保存位置，不向模型、聊天、Git 或交付 ZIP 导出私钥和密码。账户登录持久化选择由本人决定。若需要新 AGC 应用/团队、额外设备、删除已有证书/Profile、发布或付费，停止另报；该批准只覆盖本 app 的设备调试。

**B：核对后的 signed HAP 安装。** A 完成并得到具体 signed HAP/hash 后，允许把该 bundle/version 的 debug app 安装到上述手机，权限仅 INTERNET；可另明确是否首次打开默认禁用页面。安装前只读检查同 bundle。发现已有安装、签名冲突或需要覆盖/卸载时先报告，不把本次安装批准解释为删除数据或替换授权。

调试签名用于系统验证 HAP 安装来源与调试设备资格。E2E 身份用于手机与 DSH 桌面相互证明和建立加密渠道，分别是手机 HUKS ECE key 与桌面 P256 identity。各自独立创建和保存；签名证书/P12 不复用为 E2E identity，A/B 不包含 E2E 身份批准。

## 后续身份与连接顺序

1. A/B 与只读 API/能力检查完成后，另外批准手机原生 UI 创建一个指定 alias 的 HUKS ECE 身份，由手机系统持久管理私钥；明确确认后只导出公开 identity JSON。已有 alias 不覆盖，未知结果保留待审阅。
2. 另外批准桌面 E2E identity 的选定存储与范围。当前 CredentialsLocal 是明文，Windows ACL 从所选隔离 home 继承且未验证；需明确接受该存储或先审阅替代 provider。使用固定 replay profile，不读取已安装 DSH 的凭据。
3. 桌面导入手机公开身份并生成签名 offer；手机核验、比较双方指纹及范围并签 enrollment；桌面本地批准一个设备、一个固定 Session、最多30分钟的原始 grant。双方签名、确认、公有记录保存是可见步骤。
4. 另行批准 relay 的确切公有 pair/path、public-state 目录/unit 写范围、初始化及 broker 配置/重载。手机批准公有记录中的 host 后保存公开配对记录；桌面批准出站 WSS，再单独连接。真实模型继续禁用。
5. 进行手机→桌面执行→流式/rich→正确 Session/幂等与断线恢复的真机验收。初次安装与软件调试签名不能充当这个结果。
