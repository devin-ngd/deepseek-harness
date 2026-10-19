# Phase41：首次使用入口及脱仓候选

本批补齐独立源码 replay profile、原生首次身份创建入口和桌面 `.2` 的脱仓依赖验证。它仍是未签名、未安装的候选，不是已验收的真机 APP。服务器、当前 desktop、真实签名与身份均未修改，真实模型及上传为零。

## 原生首次使用

ArkUI 的身份名称输入和二次确认按钮调用实际 `NativeProductOwner.initializeIdentity(alias, confirmed)`，由 `NativeDeviceKeys` 调用 HUKS ECE ECC256/SHA256。连接配置为空、远程连接关闭时也可由用户单独确认初始化；启动不创建密钥。owner 读取实际 `deviceInfo.sdkApiVersion`，API20 以下拒绝；非法名称、未确认、重复别名及关闭后的调用拒绝。已有身份只在明确选择后检查公开 SPKI/指纹；不会导出私钥、配对或联网。关闭期间完成的创建报告需要本地检查，不自动删除或重试。

新测试从无 HUKS 别名、无本地 trust 文件启动，经未确认拒绝、显式替身创建、重复拒绝、原始 grant 本地确认，再完成实际源代码 Gateway/SessionController/rich-inline 的任务、流式、表单、重复回执、控制链路恢复、历史重开、取消与撤销。原任务只派发一次，四次 replay，真实模型/上传为零。另一个测试从连接配置默认关闭、alias 为空、已验证 API 为 0 的状态创建替身身份，仍没有 public 文件或网络 IO。见 [旅程证据](../evidence/first-use-user-flow.json)、[测试结果](../evidence/first-use-vitest.json) 和 [期望结果](../tests/fixtures/first-use-user-flow.expected.json)。

测试使用实际 ETS owner 与明确 SDK 替身；生成的是固定 fixture 身份。Chrome 执行 HAP 富文档、SDK form 与 scoped port，360/480 宽度通过；这是 Chrome 证据。测试驱动现在在 form 显示前转发启动 snapshot 请求，与原生 port 的持续转发一致；没有增加超时时间或放宽断言。实际 HUKS、ArkUI 点击、ArkWeb、TLS 和手机 API 仍未验收。

## 可移植 source replay profile

`replay-profile/launch.mjs` 创建全新 home、agents、invocation 和 temp，过滤继承的环境，只调用受支持的 `dsh --profile harmony-mobile-replay`。guarded entry 拒绝其他 argv、profile、live 或缺 guard 的启动。fixture 解析和精确四个 response 检查在服务构建前完成；只注册固定 route，上传硬拒绝。读取的是独立目录 `.env`，不读取父仓或用户 DSH home。

实际应用 plugin 复用 `sourceComposition`、`installFourResponses`、已有 mobile adapter 和 canonical Session/rich owners，具备自己的 profile manifest、patch 与打包资源。源码依赖在构建时显式解析；运行时携带维护中的 `node-addon-require-builtin` 0.1.9、native loader 0.1.9、Windows x64 builtin binary 0.1.9、Koffi 3.1.1 及其 Windows x64 binary 3.1.1。Session verifier 作为 ESM worker 独立携带，LLM attribution 保留原 owning-package 版本；未修改父仓源码。

完整候选被复制到父仓之外的新目录，没有 symlink 或父仓 node_modules。全新启动得到原任务派发 1 次、replay 4 次、23 个流式帧、rich 完成/历史状态/取消、真实模型和上传 0、listener 0。人为传入的合成 model env 和 NODE_PATH 不进入实际 app；错误 mode/argv 和缺 fixture 拒绝，没有 live fallback。见 [脱仓运行证据](../evidence/detached-replay-profile.json)。包只验证当前 Windows x64/Node24.13.0，不声明其他平台已验收。

此 profile 的 grant/手机 transport 是明确的 synthetic fixture，未注册生产配对，也不接受真手机。原生完整旅程另行验证实际 auth owner、原始 grant 和 loopback paired transport。两条证据各自独立，不能合并称为生产 phone-to-desktop 连接。

## `.2` 依赖结论

旧 `0.0.0-offline-product.2` tgz 未修改，SHA-256 仍为 `1f2c07eb361c9490c44d07d7f4fa649588927a77cb209c30d63bc0c0e944f35e`。运行时内联 zod，公共声明需要 manifest 的 zod 4.4.3。仓库外的 consumer 使用 37 个实际 runtime/type 包文件，无 source paths、symlink 或父仓解析；NodeNext strict 类型与默认禁用 ESM 导入通过。移走独立 zod 后类型检查明确拒绝，随后恢复。无需因安装版的其他 zod 版本重写 `.2`，但不能省略其声明依赖。见 [脱仓依赖证据](../evidence/detached-package.json)。未安装或启用桌面插件。

## 权限及编译层

产品 `module.json5` 现在仅声明 `ohos.permission.INTERNET`；NetworkKit WebSocket.connect 的已安装官方 API26 文档明确标注该 permission。SDK 文件为 `D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/ets/api/@ohos.net.webSocket.d.ts`，对应 connect 声明约 359 行。普通 HUKS generate/export 方法没有附加 permission；ATTEST_KEY 和 ACCESS_SE_KEY 属于其他未调用能力。App 私有 filesDir 不需要任意外部文件授权。未申请 GET_NETWORK_INFO、相机、定位、联系人或通用文件权限。[华为 API 文档入口](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-websocket) 本轮抓取超时，权限依据已核对官方 SDK 内文档与本地 manifest，未假称网页抓取成功。

API26 官方编译通过，签名配置为空。最新 [编译证据](../evidence/native-build/2026-10-14T05-10-51-544Z.json) 的 unsigned HAP 为 5,212,090 字节，SHA-256 `b07acd8e998be99de0f3d798146014b35c7354ffd9af75768f20b3f5f4b08466`。网络声明解决 permission 缺项，不证明网络、HUKS ECE 或设备 syscap 可用；SDK 仍提示部分能力不支持所有设备。没有手机安装、真实密钥操作或 signing。

## 检查、候选和后续操作

实际运行：`node scripts/product-native-substitute.mjs`、`node scripts/first-use-test.mjs`（2/2）、`node scripts/product-check.mjs`（145 模块 strict TS6.0.3）、`node scripts/detached-package-test.mjs`、`node scripts/build-replay-profile.mjs`、`node scripts/detached-replay-test.mjs`、`node scripts/prepare-first-use-native.mjs`、`node scripts/build-native.mjs --first-use-test`。Sandbox 的 realpath/junction EPERM 使用原受控命令的窄 host 重试；没有绕过测试失败。候选完整文件及哈希由 `evidence/phase41-seal.json` 持有，打包仅复制本地文件。

可独立运行的 host 候选解压后使用已安装、受支持的 Node 执行 `node launch.mjs`；不执行 npm/pnpm install，不选择日常 desktop。它会在 temp 创建独立 replay profile。手机候选包含完整 ArkTS 工程、固定配置和 unsigned HAP，必须经过另行批准的单设备官方 debug signing 后才可安装。

真实阶段仍需要用户本人连接、解锁并确认 HDC 调试信任；仅读取公开型号/API/系统版本。签名登录及目标设备由用户本人确认；安装前核对该 bundle 是否存在，未批准时不覆盖或卸载。真实 HUKS 创建和原生公钥/签名格式需要单独批准及实测。实际配对还需要具体桌面 local provider/signer/原始 grant composition、公开指纹确认、30 分钟单一合成 Session grant，以及服务器 public-state 初始化和 broker/unit 写入批准。当前 source profile 提供固定 replay，不代替这些生产 composition；不能把余下软件接线描述为只缺批准。

回退使用候选 delta 的 client preimages，只恢复相应源码并移除新增客户端文件；保留 Session、回执、撤销记录、旧 `.2`、旧 HAP 和 phase40.2 relay ZIP。没有 committed Session/grant/journal generation 变化，没有主仓外源码改动或 push。参见 [私有升级说明](upgrade-guide/v0.0.1/first-use/guide.md)。
