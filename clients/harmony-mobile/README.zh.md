---
kind: reference
description: 原生鸿蒙客户端开发、离线检查与当前验收资格。
---

# DSH 鸿蒙手机客户端实验

[English](README.md) | 中文

现场部署与激活仍按用户要求停止。[开发者交接](docs/HANDOFF-2026-10-18.md)记录手机和桌面包已安装、未激活、原身份保留、授权窗口未开始及剩余工作。已安装的原证书HAP仍是历史默认禁用构建，不是本轮候选。独立的[离线连接候选](docs/connection-candidate.md)已完成一次官方API26 unsigned编译：[候选证据](evidence/connection-candidate/2026-10-18T08-25-35-312Z-facc28ee.json)记录exit0、70个输入文件、5,219,694字节unsigned HAP（SHA-256 `8671f7fdfcba320739e15d2e0fc0309faa176137f5d2a2dbbaddf3bc1c7ded02`）；[构建报告](evidence/native-build/2026-10-18T08-25-38-344Z.json)与[日志](evidence/native-build/2026-10-18T08-25-38-344Z.log)保留。该候选未签名、未安装、未配对、未经真机API确认；只读复核命令为`node scripts/check-connection-candidate.mjs --audit=evidence/connection-candidate/2026-10-18T08-25-35-312Z-facc28ee.json`。其原生界面与HUKS证据不能证明真实链路通过。

## 概述

开发原生 ArkUI 手机客户端，控制由桌面执行的 DSH Session。ArkWeb 通过共享 rich-inline guest SDK 渲染限定范围的 HTML/CSS/JS。Guest 不获得 Electron 或任意宿主执行桥。源码配置默认禁用；测试使用固定回放、合成身份与隔离 world。

[phase76单窗口收尾](docs/phase76.2-field-closeout.md)记录原HUKS证明及grant9成功，六公开字段上传被自动审批两次拒绝后，核验撤销10/活动0。控制/数据认证及任务均未开始；原签名已安装应用与冻结候选保留。

## 内容

- 架构与范围
- 离线检查
- 验收资格与安全

## 架构与范围

[普通 profile 产品入口](docs/normal-product-entry.md)支持对一个既有 Session 进行本地首次配对，并通过8项针对性测试，包括签名范围传递、原生公开记录及桌面 Session 重载、流式、持久去重和审批等待。模型及 SDK 签名均由测试注入。其 ESM 输入没有 replay fixture；已安装手机与真实连接尚未获得此入口的验收资格。

ArkUI 管理选择、输入、任务状态与取消。原生 owner 提供生命周期、存储、原 HUKS 身份和 NetworkKit/CryptoArchitectureKit 适配。共享 TypeScript 处理 control、E2E、设备证明、回执与 rich 状态；桌面 Session/Rich 服务执行任务。参见[架构](docs/design.md)、[真实服务](docs/real-services.md)、[原生平台](docs/native-platform.md)及[受保护存储](docs/phase52-protected-world.md)。

所有客户端写入均限于此目录。`source.json` 是只读依赖定位文件。保留已安装 DSH、仓库无关更改、旧 HAP、清单、公开代次与回执。复用既有依赖和已获批的 API26 工具链；新候选与冻结的 phase69 包分开。

## 离线检查

在此目录运行。以下命令准备测试 bundle，并用合成 SDK 适配检查实际源码；不会安装或配对应用。

```powershell
node scripts/phase35-native-substitute.mjs
node scripts/phase73-transport-build.mjs
node scripts/phase73-port-build.mjs
node --test tests/phase35-native-crypto.test.mjs tests/phase73-agreement-vector.test.mjs tests/phase73-transport.test.mjs tests/phase73-diagnostic-lines.test.mjs tests/phase73-port-order.test.mjs
node scripts/product-check.mjs
pnpm run test:control
```

`node scripts/phase73-integration.mjs --ordered` 使用新的合成 world、清理后的环境和原四响应限制。每次运行保留独立报告。其回环/浏览器 fixture 不能建立真实 NetworkKit TLS、HUKS、ArkWeb 或手机资格。先记录沙箱失败，再对同一检查进行最窄宿主提权。已编译的连接候选通过`node scripts/check-connection-candidate.mjs --audit=evidence/connection-candidate/2026-10-18T08-25-35-312Z-facc28ee.json`只读复核，不重新编译；plan、compile和audit语义见[离线连接候选](docs/connection-candidate.md)。参见[验收](docs/acceptance.md)和[任务](docs/tasks.md)。

## 验收资格与安全

修复选用文档规定的 `ECC256` agreement 参数，并报告不含载荷的固定握手阶段。RFC5903 向量和 Node/WebCrypto 检查不能证明真实现场首次故障。参数、帧、超时与 HTTP503 失败分别保留离线证据。没有增大限流、放宽 Origin 白名单、跳过证书检查或改变 grant 策略。

真机操作遵循[已记录批准和部署状态](docs/normal-controls-deployment.md)。保留原HUKS/DPAPI身份、已撤销范围和历史证据。不得删锁、清数据、重置身份、重放旧证明或复用固定到已消耗grant的脚本。超出已记录目标或范围的变化需要另行授权。

原生编译、SDK替身、浏览器fixture和真实设备行为属于不同证据层级。任务/流式/ArkWeb/action/去重/重连/取消全流程，仍须在已批准的真机窗口中通过后才能验收。
