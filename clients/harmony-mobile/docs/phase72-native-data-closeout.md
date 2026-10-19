---
kind: reference
description: 冻结 alpha4 的一次获批真机窗口、data 首帧后关闭及安全收尾证据。
---

# 第72阶段：真机 data 连接失败与窗口关闭

## Summary

冻结 phase69.1/alpha4 已实际执行原身份签署、桌面验证和 v2 公开信任续接。真机 control/data 均收到 WebSocket 升级响应和首帧，data 随后关闭，未达到身份认证完成及授权会话状态。手机任务、流式、ArkWeb 表单、重复请求、断线不重执行和取消均未运行，端到端未通过。机器结果见 [phase72-closeout.json](../evidence/phase72-closeout.json)。

## Table of Contents

- [执行范围与授权](#执行范围与授权)
- [已验证与未验证](#已验证与未验证)
- [收尾与保留数据](#收尾与保留数据)
- [下一步](#下一步)

## 执行范围与授权

用户在 `2026-10-17T03:47:18Z` 明确回复“允许”（`Sentinel_4a70baa20df08191a8d1db2a3e54441f`）后，同一条 `node scripts/phase71-start-field.mjs` 启动命令通过自动审批。此前[第71阶段](phase71-native-trust-and-approval-block.md)的两次拒绝保留为历史，未用其他入口绕过。此次没有重签、重装、升级安装版桌面或 rich-inline，也未引入 alpha5；冻结清单的899个文件与已安装 signed HAP 的保留副本哈希全部匹配。

唯一 grant3 在 `2026-10-17T03:55:16.585Z` 提交，原定截至 `2026-10-17T04:25:16.585Z`，范围仅为原 `harmony-mobile-field-replay-session` 和原十项操作。原手机 HUKS 与桌面 DPAPI 身份均复用；新挑战的手机证明由桌面实际验证。公开 successor 携带原 v1 文档、撤销下限2和新授权3，手机核对双方指纹、会话、操作、精确主机和到期时间后显示“已配对”。本次没有通过原生界面重新读取保存后的 v2 字节，不能把 UI 保存成功视为独立持久化读回验证。

## 已验证与未验证

| 层级 | 实际证据与限制 |
|---|---|
| 工具与真机 | 原 `target-54cfb7ac`，API26，`OpenHarmony-7.0.0.109`；只操作本应用。复用既有官方 HDC 被动端口8710，没有执行 daemon 启停命令。收尾时该端口归官方 HDC PID71240，旧记录中的PID20964已不在，无法声称旧PID连续存活。 |
| 原生签署与续接 | 新公开证明、桌面验证、v2 scope/history 审阅和“已配对”界面已取得。保留原 HUKS 和公开历史；未清除应用数据。 |
| relay | 精确候选、既有 loopback17846、唯一新状态目录 ReadWritePaths、精确 Native Origin 和 nginx burst3 已激活；`nginx -t` 成功。Origin/headers 仍不能替代签名、room capability、E2E 和桌面授权。 |
| control/data | [脱敏日志](../evidence/phase70-connection-log-1792209535003.json)记录 control 升级/首帧、两次已观察到的 data 升级/首帧及随后关闭，另有 data 重试 HTTP503。该日志截至 `03:58:55Z`，不代表整个窗口的完整尝试总数。 |
| 身份认证与任务 | 未出现可用授权会话；发送保持禁用。原 canonical Session 只有原两条事件，字节哈希未变；固定回放0/4，真实模型0、上传0、用户项目操作0。 |
| ArkWeb 与恢复 | 表单、草稿、action/query/revision、历史重开、重复任务/动作、断线不重执行和取消均未运行。既有离线或 Web 结果不能替代本次 ArkWeb/真机验收。 |
| 额外限制 | `snapshot_display` 没有产出请求的 PNG，因此没有本次截图；保留布局与内容无关的阶段日志。正常“断开并退出”显示操作未确认完成，不能声称正常退出通过。 |

首次 data 关闭原因仍未知：冻结候选没有可区分 ready/hello/derive/finished/device-proof 的内容无关日志。HTTP503 出现在重试中，不能据此认定限流、Origin 或 TLS 是首次故障原因；此次没有增大限流、放宽 Origin、跳过证书校验或重新创建授权。

## 收尾与保留数据

桌面在 `2026-10-17T03:59:10.180Z` 正常完成清理，持久撤销前进为 epoch4，活动授权0，profile 退出码0。手机正常退出失败后，仅强制停止本次拥有的 PID29016，最终 PID 空；没有清数据、删密钥或改安装。手机私有 trust 文件及锁的退出后状态没有独立读回，不能据此声称可正常重新打开，也不能删除残留锁或清数据规避拒绝。原公开 field 配置按前后哈希恢复，凭据纪元没有回滚。

原 relay 与 nginx 已恢复，临时 drop-in 已移出活动目录，ReadWritePaths 恢复为空。后续只读核验确认原 server/config/nginx、旧公开 journal/head 哈希匹配；新公开 journal/head 保留且锁已释放，原 broker 禁用、配置配对0、后端连接0。详见 [relay 收尾核验](../evidence/phase72-relay-inspection-1792209683756.json)、[手机收尾](../evidence/phase72-phone-cleanup.json)和[公开配置恢复](../evidence/phase72-field-config-restored.json)。

## 下一步

离线审阅已发现一个有依据的候选缺陷：冻结 `NativeTransientAgreement.ets` 使用 `createKeyAgreement('ECDH')`，而[官方算法表](https://raw.githubusercontent.com/openharmony/docs/master/en/application-dev/security/CryptoArchitectureKit/crypto-key-agreement-overview.md)为 P256 指定 `ECC256`。原 Node SDK 替身忽略算法参数。[两种 SDK 替身案例](../evidence/phase72-agreement-contract.json)实际编译冻结 ETS：严格参数检查使原调用拒绝，内存中仅替换为 `ECC256` 后得到32字节合成 agreement；未改应用源文件、冻结包或安装。这是文档参数差异的复现，尚不能证明本次真机关闭就发生于 derive，也不是原生 crypto 资格证据。

先在独立离线候选中核实并修正该参数，同时定位 data 首帧后的 E2E/原生 crypto/帧处理与正常退出失败，补充固定枚举、有限长度、无正文或 capability 的阶段证据及相应测试。保留本次冻结包和全部失败证据，不在原位重构该候选。随后重新审阅新候选；本次唯一现场窗口已经消耗，新的真实 grant/安装或服务激活需要对应的明确批准，不能自动续开。

本次操作助手固定检查 epoch3 与原 v1 前代，不能直接重跑作为下一次现场方案。手机已报告保存 v2/grant3，桌面当前撤销下限4；后续必须先通过原应用核实当前 v2 和私有文件可打开状态，再准备保持完整历史的新方案，不能复用 v1 前代或把纪元回退到2。

本批只改变操作助手和项目证据文档，没有更改应用、协议实现或包内 TypeScript。公开记录审阅与连接日志21项检查、两种 SDK 参数案例及 `pnpm run build:check` 通过；仓库文档与 lint 检查的结果和限制另见 [验证记录](../evidence/phase72-validation.json)。
