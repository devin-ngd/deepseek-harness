---
kind: reference
description: 离线隔离连接候选的冻结入口、显式参数、复制guard、HAP无签名结构与证据边界。
---

# 离线隔离连接候选

本入口只处理`clients/harmony-mobile`内的离线源码候选：从当前默认禁用的产品源码复制一个新目录，注入可审查的连接配置，并在获得明确指示时调用已安装官方工具链编译unsigned HAP。它不部署、不签名、不安装、不配对、不读取凭据、不启动HDC/SSH/relay、不访问网络、不调用真实模型。**离线参数和编译产物不构成现场授权，也不等于真机API确认。**

## 冻结入口

| 用途 | 命令 |
| --- | --- |
| 测试 | `node --test tests/connection-candidate.test.mjs` |
| 计划（默认示例或完整显式输入） | `node scripts/check-connection-candidate.mjs` |
| 官方编译 | `node scripts/check-connection-candidate.mjs --compile` |
| 只读审计已有通过证据 | `node scripts/check-connection-candidate.mjs --audit=<passed evidence>` |

`package.json`对应脚本为`check:connection-candidate`和`test:connection-candidate`。`--compile`必须同时提供`--host=<host> --alias=<alias> --api=<api>`；缺少任一项会被拒绝，不会退回示例值。计划模式可以不带参数，此时明确标记`approval.example=true`、`approval.explicitInputs=false`。

历史公开host`dsh.devinho.me`和手机alias`harmony-phase54-phone`只作为示例/review输入，不建立信任、不是当前批准值，也不代表手机在线。`--api`只接受与`platform.json`已安装SDK API相等的整数（当前SDK=26）；`platform.deviceApiConfirmed=false`，所以编译配置中的`deviceApiVerified`只是离线候选参数，不是真机校验结果。

所有候选目录使用`native-controls-connection-`前缀并新建于`.build/`，已存在目录不会被覆盖。通过或失败的证据只追加到`evidence/connection-candidate/`；失败保留新建目录和构建输出，不重跑旧签装attempt。

## 候选内容与默认禁用策略

候选只复制维护中的`AppScope`、`entry/src`、`hvigor`和构建描述文件，仅允许两处差异：生成的`entry/src/main/ets/product/ProductConfiguration.ets`和`AppScope/app.json5`的bundleName。复制前后按相对路径计算SHA-256并比较完整输入集：缺配置、额外文件、同数量换键、以及配置/bundle之外的任何差异都会被拒绝。`product.config.json`必须保持`enabled=false`、空host/alias、`deviceApiVerified=0`、`core.enabled=false`；`ProductConfiguration.ets`必须与维护中的默认禁用生成结果逐字节一致。`scripts/build-product-core.mjs`的默认禁用要求不放宽。

候选配置只打开transport批准的host、alias和API，保留原预算、relay与core策略JSON；bundle固定为`local.dsh.mobile.offlineproduct`，权限固定为`ohos.permission.INTERNET`，`signingConfigs`必须为空。编译证据还会拒绝pairing、desktop connection、simulator、ArkWeb、device、native key operation、真实模型和Session上传等任何成功声明。

## HAP“unsigned”的结构依据

HAP签名不等同于JAR的`META-INF`：本仓观察到的官方签名产物没有`META-INF`，而是增加`.pages.info`并在central directory之前插入二进制签名块。只检查条目名不足以证明unsigned，因此`inspectUnsignedHap`同时要求：

- 条目名不含`META-INF/`、`sign/`、`signature/`、签名材料后缀或重复/越界路径；
- 每个local record从偏移0开始首尾相接，local name和大小与central directory一致；
- local payload结束后必须正好是central directory起点，任何插入块或padding都拒绝；
- EOCD后没有追加的签名或trailer；
- `module.json`与`pack.info`的bundle、版本、compile SDK、模块类型、INTERNET唯一权限和API目标与候选一致。

测试包含一个完整合法的ZIP fixture和逐项拒绝fixture，并额外用保留的真实unsigned HAP复核布局。Node/ZIP fixture通过只证明离线检查逻辑，不是真机安装或运行验证。

## 编译、审计与证据边界

官方编译复用`scripts/build-native.mjs --project=.build/native-controls-connection-...`，沿用现有原生JS导入适配、输入哈希稳定性、无signing配置、唯一INTERNET权限和HAP元数据检查。编译成功后写入`evidence/connection-candidate/<label>.json`；失败写入`<label>-failure.json`，保留stage、候选目录、构建证据和输出尾部，不覆盖历史文件。

`--audit`不编译、不复制、不写入：它重新核对通过报告、当前默认禁用源码、生成runtime、候选配置、保留候选的完整源输入集、复制guard、构建证据哈希、输入哈希、unsigned HAP布局与元数据，以及证据记录的零签名/零安装/零设备/零网络副作用。保留目录的每个源文件与描述文件都会重新计算SHA-256，并与报告`inputHashes`严格比较；修改、删除或新增任一输入都会被拒绝。它用于编译后复核和文档收尾，避免重复构建。

当前已完成一次官方API26 unsigned编译与只读产物审计：[候选证据](../evidence/connection-candidate/2026-10-18T08-25-35-312Z-facc28ee.json)记录exit0、70个输入文件、5,219,694字节unsigned HAP（SHA-256 `8671f7fdfcba320739e15d2e0fc0309faa176137f5d2a2dbbaddf3bc1c7ded02`）；[构建报告](../evidence/native-build/2026-10-18T08-25-38-344Z.json)与[日志](../evidence/native-build/2026-10-18T08-25-38-344Z.log)保留。审计未重新编译。该候选未签装、未配对、未做真机API确认，也不是已安装的历史默认禁用包；签名、安装、配对、真机API确认和真实Session闭环仍未验证，编译只生成unsigned候选，不自动进入签装或现场流程。

该候选的签装入口是独立的[当前连接候选签装入口](connection-deployment.md)：它复用本次已审计的准确哈希，默认`plan`零副作用，`prepare`建立唯一attempt，签名/验签/安装/界面读取各有单独guard。该入口本轮只完成实现和合成测试，未执行实际签名、安装、启动或UI操作。

详细历史状态、环境路径和剩余产品缺口见[交接文档](HANDOFF-2026-10-18.md)。
