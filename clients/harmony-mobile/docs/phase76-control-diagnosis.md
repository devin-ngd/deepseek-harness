---
kind: reference
description: Phase75控制认证的已知时间线、离线顺序复现、message错误修复与独立诊断候选。
---

# Phase76 控制认证诊断

本轮找到可复现的配对/连接顺序缺陷和独立的message错误处理缺陷，未证明phase75现场唯一根因。没有接触手机、SSH、真实凭据或新grant；[phase75撤销8收尾](phase75-field-closeout.md)和原封存产物保留。[结构化审计](../evidence/phase76-diagnosis.json)记录时间精度、源码哈希和未知项；[候选清单](../evidence/phase76.1-candidate.json)记录编译层级和产物。

## 已采集证据能证明什么

| 顺序 | 记录时间（2026-10-17 UTC） | 含义 |
| --- | --- | --- |
| 1 | 08:29:04.392 | relay激活的Host回执；随后操作了桌面CONNECT提示。不是桌面首个socket的精确时间。 |
| 2 | 08:30:00.483 | 手机最终公开文档输入回执。 |
| 3 | 08:31:15.971 | 手机保存最终文档请求回执；后续原生页面显示已配对。 |
| 4 | 08:31:39.535 | 手机Connect点击回执，与relay激活回执相隔155.143秒。 |
| 5 | 08:32:43.968 | 诊断采集起点；保留的顺序为control dial/upgrade/first-frame/deadline/close，多代重复。没有data连接成功记录。 |

`first-frame`在NativeRelaySocket的message回调进入时、错误和字节检查之前写入，不能据此声称收到合法challenge。phase75采集器只保存connection阶段及异常行计数，丢弃HUKS、解码、验证、proof发送和时间戳；原始日志未保留。因而“challenge已解码、字段通过、HUKS调用/返回、proof排队/发送、relay验签”均未知，不能补造其时间线。原生异常行计数0也不能证明被捕获的异步操作成功。

phase72记录了control之后的data升级和首帧，证明当时control曾推进到room；phase74仅完成新enrollment签名，在公开pair上传被拒后结束，没有control成功基线。phase73.1到75的NativeRelaySocket、HUKS signer、控制Port、临时agreement及PairedCore保持相同；phase75主要新增完整历史验证。该验证在创建control socket及其deadline之前完成，不会直接消耗同一socket的握手时间，但可延长另一个已启动端等待手机的时间。HUKS的ECE/ECC256/SHA256及签名purpose没有改变；enrollment成功不能替代control签名证据。

## 可复现缺陷与最小修复

原ConnectionSupervisor、RelayControlClient和RoomBroker使用固定测试身份及真实broker生成的challenge JSON，在8次尝试、10秒challenge、500毫秒重连延迟下复现：手机准备155.143秒时，桌面在第8次预算后进入blocked；稍后手机正确签名且broker接受proof，仍没有另一个角色，拿不到room。先完成手机最终记录核对/本地保存，留下Connect按钮，再启动桌面并立即连接手机，同样限额下第一代拿到双方room。源码提示已明确该顺序；没有延长grant、重连次数或challenge寿命。现场缺少桌面逐阶段时间，不能宣称桌面确在某一秒耗尽，或排除其他问题。

官方已安装API26的WebSocket定义为`AsyncCallback<string | ArrayBuffer>`；基础定义明确错误时data不可用。旧NativeRelaySocket先取`data.byteLength`再检查error，原封存源码在同一错误回调夹具中抛TypeError；修复先处理error、记录有界错误码并关闭，不访问data。没有证据表明phase75实际触发了该回调缺陷。SDK文件路径与摘要保存在结构化审计中。

共享控制器增加可选固定阶段观察器：收帧、解码、字段和本地身份验证、签名开始/结束、proof排队、room验证、过期及按阶段拒绝。Native IO另记实际send开始/返回/失败，HUKS阶段附UTC毫秒。proof排队不等于网络发送完成，网络发送返回也不等于relay验签；room通过只表明已有合法room，后续E2E和device授权仍独立。桌面源码提供同样的阶段观察器；既有封存桌面闭包不修改。诊断不包含载荷、私钥、公钥、nonce、签名、token、标识符、endpoint或异常正文；观察器故障只输出固定fallback。解析器保留原日志顺序、时间和有界记录数，不伪造跨设备精确排序。

## 验证与限制

15项新控制/诊断测试覆盖先失败后通过的顺序、连接返回前早到文本、真实ETS签名和原broker验签、HUKS/发送失败、二进制/JSON/字段/主机拒绝、签名过期、观察器故障和无data错误回调；另4项既有HTTP403/503拒绝和2项FIFO顺序测试通过。固定challenge夹具来自原broker和公开已知测试标量，并非现场抓包。78项memory/history回归和178模块strict通过。官方SDK候选编译及具体产物以候选清单为准；SDK替代、Node和Web结果均不能代表真机HUKS、TLS或ArkWeb。

独立unsigned项目只替换6个控制诊断相关原生输入，保留原配置、bundle、INTERNET唯一权限和空signingConfigs。没有新的可执行现场操作器或批准记录。下一次实机必须另获授权，以桌面撤销8及手机完整grant7为起点，先把双方准备到可立即连接的状态；本轮不续开、不部署、不签装。
