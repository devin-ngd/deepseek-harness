---
kind: reference
description: Data 通道离线参数修复、握手诊断、新 unsigned 候选与实机验收前置条件。
---

# 第73阶段：data 通道离线修复

## Summary

原生 agreement 改为 `createKeyAgreement('ECC256')`，Native Port 用显式 FIFO 排序早到及重入帧。修复保留原协议、密码算法、帧格式、权限和限流，并增加不含正文的握手阶段诊断。新的 API26 unsigned HAP 已编译，尚未签名、安装、部署或连接真实现场。原 phase69 冻结包和第72阶段失败证据保留；这两项离线缺陷尚不能被宣布为现场唯一根因。

## Contents

- 参数与字节证据
- 握手与 HTTP 拒绝
- 候选与校验
- 下一次实机步骤

## 参数与字节证据

[官方算法表](https://raw.githubusercontent.com/openharmony/docs/master/en/application-dev/security/CryptoArchitectureKit/crypto-key-agreement-overview.md)为 P256 指定 `ECC256`。官方原生工厂把字符串交给参数解析器；参数表包含 `ECC256`，不含 `ECDH`，未知项在选择实现前被拒绝。已安装 API26 声明只把参数类型写为 `string`，因此编译本身不能发现错误的算法名称。相关公共源文件内容摘要与 SDK 声明摘要见 [官方 API 核对](../evidence/phase73-official-api.json)。

原 Node SDK 替身忽略算法参数。本批先让替身拒绝错误名称，原样 ETS 的两个现有案例分别以 `agreement-derive-failed` 和 `key-invalid` 失败；源码修正后通过。固定 [RFC5903 §8.1](https://www.rfc-editor.org/rfc/rfc5903#section-8.1) 公共测试值还分别经 Node、WebCrypto 和实际 ETS 适配方法得到同一32字节结果，避免只由自编替身定义预期。HKDF 的36字节输出、UTF8 内容和 GCM 密文/16字节 tag 拼接另与 WebCrypto 交叉验证；这些仍不是手机 CryptoArchitectureKit 执行证据。

## 握手与 HTTP 拒绝

共享 E2E owner 可选输出固定阶段：relay-ready、peer-hello、keys-derived、finished-sent、peer-verified、超时及失败所在阶段。未提供观察器时不输出；观察器失败只产生固定备用诊断，不阻止拒绝或清理。原生 agreement 另报告 peer-import、create、derive、derived 和 SDK 数值错误码。日志不包含载荷、公钥、私钥、capability、endpoint 或异常正文；工具解析器只保留已知枚举，最多64条。

测试分别覆盖 ready 文本/二进制不匹配、hello JSON 错误、公钥错误、派生提供方失败、未到 ready 的超时，以及同一批接收 ready/hello/finished 的顺序。HTTP403/503 的 NetworkKit 回调拒绝在收到 E2E 帧前被单独验证，原 burst3/连接上限4 的容量检查仍通过。没有把 HTTP503 改判为首次故障，也没有改变500ms重试策略、Origin、TLS 或部署配置。

实际 Native Port 还独立复现两项顺序失败：缓存帧等待 microtask 时，新帧会先送达；冲刷缓存期间的重入帧也会越过更早帧。显式 FIFO 的单一同步 drain 同时排序缓存和新帧，重入只追加队尾。两个原样失败案例修复后通过，不依赖 sleep 或回调恰好先运行。第73中间 HAP 保留为原字节，最终73.1候选另用项目目录编译。

新日志可区分：在 agreement-create 后出现 SDK401，或在导入/derive/HKDF/finished 前后关闭；它们不能倒推第72阶段未记录的具体帧。正常退出失败及手机私有 trust/锁状态仍待实机核实，本批没有删锁、清数据或重置身份。

## 候选与校验

官方 DevEco26.0.0.851、SDK26.0.0.105/API26、Hvigor6.26.8 编译成功，两个 JS core 的原生 import 审计通过。最终 unsigned HAP 为 `D:/Temp/dsh-harmony-mobile-20261017-phase73.1-unsigned.hap`，5177343字节，SHA256 `063a0967ab4068ec06261b4c8b53198b69be4fc52f3a2707d0b0cf2d9dd01368`。它保持原 bundle、默认断开配置和唯一 INTERNET 权限，没有签名配置。参见 [构建证据](../evidence/phase73.1-unsigned-candidate.json)。SDK 仍报告既有 syscap/异常处理警告；编译成功不证明具体手机支持所有能力。

23项参数、字节、帧、端口顺序和诊断检查以及9项 HTTP/容量检查通过；174个客户端/集成 TypeScript 模块 strict 通过，三个修改的 TypeScript 实现通过显式 lint。最终 FIFO 源码的67项固定回放集成通过，两个实际 ETS owner/回环 WS/浏览器流程均匹配已有预期 fixture，完成四响应、任务/流式/表单、重复回执、连接恢复、取消及清理，原任务只派发一次。它们不建立真实手机资格。仓库检查和候选封存的最终结果记录在 [验证记录](../evidence/phase73-validation.json)。首次集成受沙箱 loopback EACCES 和 world realpath EPERM 阻止；保留失败输出后按原命令作窄范围宿主重试，没有修改产品沙箱或测试预期。

本批修复客户端 README 的配对，并删除 `product-check.mjs` 覆盖中央依赖解析的过期 ws 类型路径。其他旧 README、旧证据引用及无关包问题按检查结果单列；不重写冻结的交付物或无关工作文件。源码更改和构建前字节的对应关系位于新候选 `changes.json`，只可按当前哈希匹配恢复客户端源码，不能恢复授权、Session、手机数据或旧纪元。

## 下一次实机步骤

以下步骤尚未获本批授权执行；准备就绪后再对准确候选、签名/安装、服务维护和唯一短期窗口分别确认。

1. 先在原手机应用中只读核实当前 v2 记录和私有文件可打开状态；遇到锁或不可信状态立即停止并保留，不删除锁或清数据。
2. 确认新 unsigned HAP 的确切摘要、原签名身份和保留数据安装范围。完成安装后先验证旧身份/公开历史保留及过期拒绝；保存配对不应自动连接。
3. 读取原桌面 owner 当前撤销下限并核对原合成 Session 的静止状态；最后已核实为 revoked4/活动0。使用手机当前 v2 前代构造新方案，不能复用旧 v1 前代、旧证明或 epoch3 固定操作脚本。本批没有创建后继 grant。
4. 在新的一次明确获批窗口内先完成双端证明与 E2E/device-proof，采集新固定阶段。只运行原合成会话和最多四个固定响应；任何真实模型、上传或用户项目操作均拒绝。
5. 先验证任务、流式与实际 ArkWeb 表单，再验证同一请求/动作去重、历史重开、断线不重执行和第四响应取消。查询回执不能替代重复提交验证；Web 或 SDK 替身不能替代 ArkWeb。
6. 成功、失败或到期均撤销新 grant、停止拥有的进程、恢复原 relay/nginx并保留所有代次。正常退出和私有文件状态必须另有证据，不能仅用强制停止后的 PID 空作为通过。
