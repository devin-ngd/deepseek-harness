---
kind: reference
description: 手机端 rc2.16 完整未签名候选、固定输入、归档核验及离线验证范围。
---

# 手机端 rc2.16 未签名候选

## 交付

[完整封存 ZIP](../handoff/phone-rc2.16-20261029.zip)包含 [HAP](../handoff/phone-rc2.16-20261029/dsh-harmony-mobile-0.0.0-rc2.16-device-unsigned.hap)、完整原生工程、147 个实际消费模块的源码字节快照、构建入口和本轮验证回执。版本为 `0.0.0-rc2.16`，bundle 为 `local.dsh.mobile.offlineproduct`，versionCode 保持 2；设备模式开启，连接配置默认禁用。封存内容未放入真实身份、配对、路由或签名材料；同载荷 HAP 已按独立授权完成[原签名原位安装及离线核对](rc216-installation-20261029.md)，未开启实机联调窗口。

| 产物 | 字节数 | SHA256 |
|---|---:|---|
| 完整封存 ZIP | 2603483 | `089b82ae1db25fbf8e80aaa928d3d9c4382e1962cd99fd2c9f7f4910be699b62` |
| 完整未签名 HAP | 5592795 | `deea95eb544f978f103098c6a1ae31968cd0564669d04860d510318415193255` |

文件清单和复核方法见[封存 README](../handoff/phone-rc2.16-20261029/README.md)、[manifest](../handoff/phone-rc2.16-20261029/manifest.json)及 [SHA256SUMS](../handoff/phone-rc2.16-20261029/SHA256SUMS)。在解压目录执行 `python verify.py` 可离线复核每个封存文件、HAP CRC 与版本。ZIP 自身摘要由上述表格及[封存回执](../evidence/phone-candidate-rc2.16-20261029.json)记录。

## 构建输入

候选包含[公开绑定读取、原生端口获取和握手取消修复](phone-connect-cancellation-20261029.md)。共享 guest SDK 的本轮差异是把滚动条切换移出 ResizeObserver 回调，并避免将其循环提示当作内容执行失败；普通执行错误仍上报，配对及传输协议未改。实际消费的 SDK SHA256 为 `5ed72e33dc59fee6678206a0f4dc96563fa5e6799d7bb5201299296cb3dd5bed`。

[准备入口](../scripts/prepare-device-native.mjs)在独立目录重建 ProductCore、PairedCore 和 product-rich-document，三个 bundle 消费同一份捕获字节，原生资源索引同步新富文档的大小和摘要。准备与封存均复核输入；本轮封存时全部输入匹配当前源码。主工程已有生成文件、共享 SDK 修改、旧候选与原配对保留。历史离线演示资源沿用主工程原字节，设备模式实际入口消费的三个新输出在输入回执单列；保留的旧演示资源不作为最新 SDK 执行证据。

完整原生工程经过 DevEco Studio 26.0.0.851、SDK 26.0.0.105 / API26、Hvigor 6.26.8 的无 daemon、无签名编译。编译后的两个 core 原生 util 导入检查通过，HAP 中的 modules.abc 与编译器输出一致，全部 rawfile 与固定工程逐项一致。没有用源码检查替代实际 HAP 内容检查。

## 离线验证

| 范围 | 结果 |
|---|---|
| 共享 SDK 与预览 | 23/23 通过，消费本轮最新改动 |
| 连接诊断与取消隔离 | 42/42 通过 |
| 设备绑定、会话及富交互隔离 | 15/15 通过 |
| 实际加密回环、动态选择及快照 | 定向 1/1 通过，同文件另 22 项未执行 |
| HAP 校验器 | 26/26 通过，含指定版本、额外签名、重复条目及多权限拒绝 |
| 实际 HAP | 23 个条目的 CRC、未签名连续布局、版本、SDK、权限及内容核验通过 |
| 实际 HAP 富文档的 Chrome 验证 | 9 项通过，浏览器和原生替身 owner 均完成关闭 |
| 严格类型与官方 API26 编译 | 0 类型诊断，完整 HAP 构建通过 |

Chrome 使用从 HAP 读取的 product-rich-document 原字节，以及候选自己的 ETS 富文档外壳和资源索引；原生 SDK 能力由隔离替身提供。实际提交合成表单并完成回传，360/480/900px 无横向溢出，高文档与缩短文档分别切换滚动状态。ResizeObserver 提示不产生内容错误，普通错误负对照仍上报；不透明 iframe 不能读取父页面。所有网络请求受测试驱动拦截，不连接真实 Host 或模型。

首次 SDK 回归因沙箱缓存重命名 EPERM 而未执行，宿主同命令通过；官方编译的工具链 junction 和 Chrome 的 crashpad IPC 也受沙箱限制，宿主原命令通过。浏览器最初缺少 SDK canIUse 替身的失败单独保留。没有关闭产品隔离、放宽测试断言或覆盖失败证据；编译器的异常处理和设备能力警告保留。

## 验收边界

此封存仍是完整未签名离线候选；实际签名和安装状态由[安装记录](rc216-installation-20261029.md)单独记录。Node、固定密钥、SDK 替身、回环和 Chrome 的通过不建立真机 HUKS、WSS、ArkWeb 或稳定连接资格；历史目录后断开和握手超时原因仍未确认。原生调用未返回时，取消仍等待清理，没有承诺真机最长完成时间。

候选构建阶段没有访问原配对或已安装应用。后续独立授权的签名、原位安装和离线冷启动已完成，见[安装记录](rc216-installation-20261029.md)；稳定连接和手机交互仍需另行明确新窗口范围。
