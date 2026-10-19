# Phase39：已配对身份的短 room 控制面

本批在独立 Node/ws relay 上完成本地合成控制面与共享端点核心；不安装 DSH、不派发真实任务、不访问真实模型，不创建用户长期密钥或持久访问凭据。Mate90 Pro Max/HarmonyOS7 已由用户确认；本批没有重新编译 HAP，没有取得 HUKS、ArkWeb、签名或真机执行证据。安装中的桌面 DSH 与服务器配置未改动。

## 信任与重连

首次配对沿用原生完整 fingerprint 比较、桌面最小 Session grant；relay 的公开登记必须来自该已确认流程及对应操作批准。日常连接只使用既有本地签名 key；未知 pair、自签名新 key、broker JSON 或 room 凭据都不能登记身份、创建 grant 或扩大 Session 操作。服务端必要公开登记为 pairId、两端不同的 P256 SPKI、routing epoch、expiry、revoked；不保存私钥、聊天或房间历史。

新增控制 route 为 `/harmony/relay/control/v1`、subprotocol 为 `harmony-relay-control-v1`；原数据 route 不变。challenge 的固定签名字节包含新域 `harmony-relay-control/1`、request-room、pair、round、role、epoch、fingerprint、audience、proofId、nonce、expiry。只有两端均证明同一新 round 且仍有效时，broker 才分别回传各自的一次性短 token；第三方不能以一个角色签名换另一端 token。双方加入后复用既有 E2E 协议和维护的 Node P256 backend，不复制加密实现。

数据或控制断开、有效角色替换及 room 到期均销毁旧 room。两端新 challenge 撤销旧 endpoint lease；重新连接使用新 room、ECDH agreement key 与 nonce/sequence。旧 token、proof、密文及 binding 不被恢复。端点本地 trust、challenge、room timer 在静默连接上也失效；异步 fingerprint 查验之后及签名之后复查撤销/到期。转发层不重发任务、不保存消息队列；原 command/action id、cursor 与草稿仍由既有端点/桌面 journal 负责，本批未接入产品级恢复循环。

新的 DeviceProofClient 只接受本地保存的原只读 grant 和已认证新 binding，复用已有 challenge parser/签名字节；检查 desktop/profile/device/credential/epoch 与远端桌面 key。合成测试通过原 Desktop DeviceAuthorizationOwner 重新验证，撤销旧连接 lease；操作仍为 session.sync/task.receipt，不能 task.submit、rich.invoke 或 approval.reply。该核心未挂载到实际桌面/手机生命周期，不表示最终“手机发任务→电脑执行”已成立。

## 公开状态与隐私

配置中的公开 pair 记录可以持久化，撤销后的公开 epoch/tombstone 也需要保留；这与不保存聊天的要求相容。PublicPairRevocations 显式定义公开状态提交职责；先拒绝、尝试全部清理，再等待 commit。并发同 pair 撤销共享一个结果，epoch 有安全递增余量，失败不恢复当前进程授权。测试只使用内存 commit 和公开 revoked 记录重载；CLI 尚无持久 writer，不能承诺重启后撤销保持或将故障报告为成功。

控制 broker 可见公开长期 key/fingerprint、pair/round/epoch、nonce/proof/signature，以及内存中的两端临时原始 token；底层 RelayRooms 仅持 digest。E2E 加密的是数据通道的身份/grant proof 与 Session/task/rich/form/draft 正文。完整 server/OS 元数据与落盘限定由 [relay README](../standalone-relay/README.md#what-the-server-sees) 说明。真实 TLS/proxy 限速、无敏感日志、swap/core 限制仍需现场验证。

## 证据与分层验收

| 层 | 本批实际证据 | 未完成 |
| --- | --- | --- |
| 共享 TypeScript | 严格 TS6.0.3，122模块通过；[检查日志](../evidence/phase39-types.log) | 新控制核心未做 ArkTS 编译 |
| 固定身份/授权 | 24项新 memory/crypto/grant 场景，加59项前代回归，共93通过；[报告](../evidence/phase39-vitest.json) | 真实身份 key/HUKS，写操作 grant |
| 实际本地 sockets | 10项新 loopback 场景，包含双签、E2E富块密文、断线换代、旧密文拒绝、控制重连、撤销与入口拒绝；计入上述93项 | nginx/TLS、Linux、网络故障/backoff、真实桌面连接 |
| 打包 ESM | 5项无源码 alias/DSH 的 built ESM smoke；[日志](../evidence/phase39-packed-tests.log) | Linux/Node22实际执行 |
| 独立安全复核 | [只读复核记录](../evidence/phase39-security-review.json)，已修复 pending撤销、late签名、epoch/并发与全资源清理 | 不替代 TLS/HUKS/持久 writer 验收 |
| 手机产品 | 沿用已安装官方 API26 工具，已知 Mate90 Pro Max/HarmonyOS7 | API实测、签名/安装、ArkWeb隔离、真机最终链路 |

本次93项由34项新场景与59项前代回归组成；表中的24项为新 broker/device-proof 用例，10项为新真实 loopback 用例。唯一排除用例会覆盖已封存 Phase36 evidence，其实际 grant/crypto 行为由本批新测试覆盖。首次默认沙箱的 connect EACCES 与一个 fixture 参数错误保留在 [首次日志](../evidence/phase39-first-attempt.log)，修正后以原命令窄范围 host retry 运行本地 sockets；没有将连接失败作为“安全拒绝”通过。

新 release 为 private `local-harmony-light-relay@0.0.0-phase39.1`，依赖仍仅官方 ws8.21.3。复用已验证 tarball 与两项 lock 的依赖解析，只更新自有根版本元数据；没有再次下载、npm安装、依赖脚本或服务器变更。默认关闭，enabled example 不包含公开登记，因而仍拒绝所有外部 join。新源码、前代原始 preimage、包文件/hash 与回退清单见 [封存记录](../evidence/phase39-final-seal.json)；旧 Phase36–38 ZIP/tgz/HAP 均保持原始 hash。

## 下一批独立工作与批准条件

- 实现并测试公开 pair/epoch/tombstone 的原子持久 writer 与重启加载；不创建私钥/凭据，不将 room/chat 写入状态文件，真实写入目标需批准。
- 把共享控制核心接入原生 WebSocket/HUKS signer 与桌面 owner，明确断线 backoff、旧 binding 销毁和 journal 恢复；API26 编译与 SDK substitute 分别记录。
- 获取新的独立 relay 目录/service、nginx/DNS/TLS/key/CA 条款批准后，再验证 Linux、TLS/proxy/限速/日志/停止行为；不沿用暂停的 DSH server 安装批准。
- 手机签名、权限、安装及真机证据单独授权；完成原始 command id 幂等、草稿/revision、rich表单/action与权限明确确认后，才验收手机发任务至真实桌面执行的完整链路。模型保持 replay/mock，GLM不调用。
