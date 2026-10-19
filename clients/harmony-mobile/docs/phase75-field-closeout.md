---
kind: reference
description: Phase75 原签名安装、完整继承链实机读回、控制认证失败和独立恢复证据。
---

# Phase75 实机结果

本轮未通过手机任务端到端验收。原签名保留数据安装、原 HUKS 身份、新签名挑战、漏收中间代次后的完整历史保存与读回、公开六字段上传均通过；手机控制连接到达 WebSocket 升级和首帧后反复认证超时，未进入会话列表，未发送任务。实际流式显示、ArkWeb 表单、action 去重、草稿恢复、断线恢复和取消均未验证。

人类批准为 `Sentinel_89e6422f7b5c8191a26ce3f3bee61489`（2026-10-17 08:07:08 UTC），对应四项范围请求 `Sentinel_0ffcecddae688191877de8c40408d420`。实际执行与修复回执见[结构化收尾](../evidence/phase75-field-closeout.json)，原始现场回执保留在 `D:/Temp/dsh-harmony-phase75-operation`。

| 项目 | 实际证据 |
| --- | --- |
| 安装 | 08:13:41.559 UTC，原证书、原 profile、完整应用 ZIP 项匹配，原位安装，不清数据，不新增权限；signed HAP SHA-256 为 `96976ba31de04e7acc6a49f3988eb1207c0111261b717e8a9832090d96a10767`。 |
| 身份与历史 | 安装后原 HUKS 指纹匹配；原手机 grant3/撤销下限2/历史1条读回匹配。新挑战由同一身份签署；最终 grant7/撤销下限6/历史3条原生保存并离线重开读回，公开文档 SHA-256 为 `dcbc1907f09d5b7af3c4de633b7d9ccfd20babe240aa734617dad9e381593453`，未激活中间 grant5。 |
| 唯一窗口 | grant7 起点 `08:28:04.538 UTC`，原定终点 `08:58:04.538 UTC`；失败后 `08:33:38.882 UTC` 已撤销至8。未续开。 |
| 中继 | 六个公开字段成功写入批准的 `dhome:/home/devin/harmony-relay/phase75-successor/relay-pair.json`，独立 journal 初始化及临时服务切换通过；未上传私钥、token、访问凭据或 Session 内容。 |
| 连接 | 手机 control 多次出现 dial-returned、http-upgraded、first-frame、authentication-deadline、socket-closed；无 data 连接成功证据。诊断仅保存阶段和计数，不保存原日志内容。 |
| 执行 | 原固定 Session 未派发任务，四响应回放调用0、真实模型0、上传0。会话文件哈希未变化。 |
| 最终清理 | 原桌面 owner 确认撤销与资源关闭；本地 public 配置恢复，owner 锁释放；原服务和 nginx 恢复并独立复核；手机最后正常退出且 PID 空。journal、完整历史、失败回执和旧封存包保留。 |

恢复过程中发现操作器将文件 `Buffer` 直接交给字符串比较，导致停止服务前拒绝。nginx 独立恢复成功；临时 unit 保留待处理。现已在维护实现中明确解码 UTF-8，并使用真实文件字节的回归覆盖原 nginx 已恢复、非法 UTF-8、尾随内容、外来配置和独立清理失败。修正后的 relay-only runner 仅执行恢复，保留原远端 operator；恢复成功后原封存操作器再次确认 `restored:true`。最初的未知回执不改写，后续成功回执单独关联。

此前 relay 预检的 esbuild 词法导出名问题已在原授权范围内修正，执行清单和实际人类批准记录分别保留；没有把工程记录当作新批准。准备阶段一次错误的本地回执文件名在任何配置写入前拒绝，确认无尝试记录、配置哈希不变后使用实际文件继续。补充 UI 工具的布局回执命名冲突已修正；截图采集被 HDC 拒绝后未重试，布局证据保留，未据此声称有截图或 ArkWeb 验收。

本轮运行 `node --test tests/phase75-operations.test.mjs tests/phase75-operation-security.test.mjs tests/phase75-phone-exercise.test.mjs`：沙箱仅阻止测试临时 junction 创建；原命令在 Host 重跑127项全部通过。修复不改变 HAP、桌面闭包、协议或部署权限。此前编译/strict/脱离仓库回放证据仍见[候选报告](phase75-operation-candidate.md)，它们不能替代此次未通过的真机路径。

后续独立工作先在离线替代环境补齐 native control 收帧、挑战解析、签名及认证结果的无内容诊断，定位首帧之后的失败。任何下一次实机授权都必须以桌面撤销8、手机完整 grant7 为新起点，另行取得批准，不复用本次 grant7、pair 或窗口。不得把 TLS 成功、完整历史通过或 Web 测试解释为手机任务和 ArkWeb 成功。
