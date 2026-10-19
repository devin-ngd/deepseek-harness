---
kind: reference
description: 首次普通会话手机链路验收的批准范围、部署目标与尚缺条件。
---

# 首次手机链路验收

本清单是停止前的验收方案。用户已在2026-10-18 04:08:20 UTC要求停止开发部署，当前手机和桌面包已更新、bundle未启用、临时补丁未应用、授权窗口从未开始；当前HAP连接配置仍为默认禁用。实际状态和后续条件见[开发者交接](HANDOFF-2026-10-18.md)。旧现场仍为撤销10/活动0，不续用其grant、签名答复或pair。

## 目标与前置缺口

当前运行的安装版为0.2.1-alpha.4、Host protocol4；desktop profile位于C:/Users/wpdev/.dsh/profiles/desktop。Harmony插件已更新至0.0.0-normal-controls.1，含/product、/pairing和/test-session导出，但未选入bundles或加载临时入口。29个peer精确匹配实际安装版，没有放宽范围。[安装版API检查](../evidence/normal-controls-alpha4.json)在临时profile中完成命令注册、正常产品任务、三个固定响应及rich完成；不能代替实际运行Host验证。产物哈希见[清单](../evidence/normal-controls-artifacts.json)。

本机PATH中的全局dsh仍为0.1.5-rc.2；部署应使用上述安装版Host的Plugin Manager，不使用该旧CLI操作目标profile。[包消费检查](../evidence/normal-controls-package-smoke.json)已校验tgz及其解包文件哈希，用实际打包的product、pairing、test-session、transport入口再次通过alpha.4合成闭环。

启用测试入口后，在现有desktop profile的普通根会话中执行 /harmony-test new，取得唯一的新SessionId，再打开该会话；命令直接指定“手机链路验收（合成，无模型费用）”预设，重复执行返回同一SessionId。不得复用已有个人会话或harmony-mobile-replay固定世界。/harmony-pair status的目标须相同；/harmony-test status须显示harmony-link-test/fixed-three、responses=0及未来到期时间。当前窗口选中项未通过只读Host API确认，不能由文件更新时间推断。本轮只在临时测试profile创建合成会话，没有创建用户会话或读取个人会话内容。

GLM订阅覆盖未验证，首轮禁止真实模型。独立 /test-session入口注册非默认测试预设，绑定启用后新建的一个普通根会话，最多三个固定响应，模型路由、工具呈现及拒绝监听只覆盖该Agent；不安装全局离线策略，不保存全局默认模型，也不另建Context。产品和配对入口不引用固定回复代码。[五项行为检查](../evidence/normal-controls-tests.json)覆盖已使用的其它provider、富表单闭环、重复请求、越界、耗尽、卸载、冷重开、缺失富能力、到期及新会话创建去重。卸载只取消测试Agent并保留其拒绝监听；不得把这个测试历史会话改作真实模型会话。

未来部署仅需显式启用 /pairing 和 /test-session 两行并应用各自公开示例；保留generic行禁用。若原rich-inline的activePresets非空，只追加harmony-mobile-link-test，保留其它项；空列表本已允许全部，不改成单项列表。原生工具呈现由Agent局部API提供，不需要更改其它预设的PTC设置。缺少rich_inline_complete时在准备请求前失败，不消耗响应槽，也不改用真实provider。

## 手机产物

| 产物 | 已核对的 SHA-256 | 用途 |
| --- | --- | --- |
| D:/Temp/dsh-harmony-mobile-20261017-phase76-signed.hap | a25381696f7e0c5e88cce5bd6390663df407f940ee422fed1a7d73acb8d42a6a | 原签名旧包；不含新的普通范围管理，不能拿它验收新代码。 |
| D:/Temp/dsh-harmony-mobile-normal-controls-unsigned.hap | bc4fb0d6a2a1e99dddbee1997759012a45ae26bbdabd11f5b551cf4994afb316 | 当前源码的官方API26无签名构建，源文件和签名后应用载荷均已核对。 |
| D:/Temp/dsh-harmony-mobile-normal-controls-signed.hap | b756d287608438d72439f6475a01e8a90a7a27c62e6e7fff121dae2e378d6607 | 本轮批准后使用原证书签署并原位安装的当前手机包。 |

新包保持local.dsh.mobile.offlineproduct应用标识及现有INTERNET权限；原证书链摘要83cccc2f34814563cc606e36f8e78b67273a33265fcc2cd56843627d30d46bd9已匹配，原位升级与原HUKS公开身份读取通过。没有卸载或清数据；本版本的ArkWeb与桌面执行链路仍未验证，详见[分层证据](normal-controls-deployment.md)。

## 服务器最小变更

已有配置包含dsh.devinho.me的/harmony/relay/control/v1和/harmony/relay/v1，两者都代理127.0.0.1:17846，可复用TLS、证书和精确路由。本轮只读SSH已核对原server、config.enabled.json、nginx和待复用代码哈希，尚未修改配置或公开日志。切换前仍须确认当前状态，不得用历史记录覆盖后来变化。

新范围仍需独立的静态 pair 配置和公开日志，建议仅新增 /home/devin/harmony-relay/normal-product-acceptance 下的 relay-pair.json、field.authorized.json、state/public.jsonl及其 head，并用 /etc/systemd/system/harmony-relay.service.d/80-normal-product-acceptance.conf 临时指向已部署的 phase69-successor/server.mjs 与新配置，只给新 state 目录写权限，受控切换 harmony-relay.service。旧状态和 drop-in 保留、核对后再恢复；既有 ProtectSystem=strict、ProtectHome=read-only、5次/分钟和连接上限4保持。

四条控制/数据连接可能在启动时集中升级，原留档的两处 burst=2 只能提供三个即时配额；最小窗口提案仍是仅在 /etc/nginx/conf.d/harmony-relay.conf 将这两处临时改为 burst=3，nginx -t 后平滑重载，结束后按哈希恢复。复用路由不代表无需服务或限流配置变更；这些动作必须明确批准。无需新公网端口、监听地址、防火墙、隧道、证书或远程 enrollment/admin 端点。

## 待授权的数据流与操作次序

1. 前置代码和产物核对完成后，备份仅将改动的 profile manifest/patch；升级新唯一版本，默认禁用，再仅启用 /pairing 行与已验证的测试注入。保留 rich-inline、Codex、devflow、自定义模式和无关设置。需要重启时单独包含在同次批准内，不覆盖安装版 runtime。
2. 打开专用普通会话，记录 status 的 profileId=desktop 与实际 SessionId。明确授权仅该会话的现有设备操作，TTL不超过30分钟。手机复用原HUKS别名并导出公开身份；桌面使用本 profile 的受保护身份。若该 alias 不存在，必须在同次批准中明确允许一次受保护身份创建，不能复制旧世界凭据或静默调用 identity-create。
3. 手机公开身份JSON仅交给桌面 /harmony-pair start。桌面签名 offer（含公开密钥、profile/Session、操作和期限）交给手机核对；手机签名答复只交回桌面 confirm，经原授权交互确认。桌面生成的完整公开 phone 记录只导入手机，并以“确认并另存为新范围”保存；旧范围不替换。
4. 仅将 confirm 结果 relayPair 的六字段 pairId、desktopPublicSpki、phonePublicSpki、epoch、expiresAt、revoked 交到 dhome:/home/devin/harmony-relay/normal-product-acceptance/relay-pair.json。不得传 phone 完整记录、Session消息、profile/Session标识、私钥、访问token或房间能力。新字段取自本次普通范围，不复用旧pair或已撤销epoch；用户应明确批准这份数据及目的地，上传仍可能被自动审核拒绝，拒绝即停止依赖步骤。
5. 新日志初始化、静态配置和服务切换核对完成、手机就绪后，才确认桌面 connect 并连接手机。先证明控制和数据通道双向认证，再发唯一合成任务，观察桌面原会话实际执行、流式消息及ArkWeb表单。表单只允许现有 scoped rich SDK；桌面执行固定 rich_inline_complete 并将结果投回同一会话。
6. 首轮建议预算为一个任务、一次表单动作、三个固定模型响应槽（富块、完成工具调用、完成文本），真实模型及外部上传均0。相同 requestId/actionId 各重试一次、手机断开重连一次，再历史重开；需证明任务接受和表单效果各一次、正确Session归属及草稿/revision一致。额外模型请求、跨范围或越权桥、未知结果、到期或认证失败立即停止，不自动扩大范围或重开窗口。取消的独立任务场景可在首条闭环证据成立后另行安排。
7. 结束时撤销本次新普通范围、关闭原生及桌面传输，核对活动授权0并恢复仅本轮改动的服务/限流/profile行。保留原Session、HUKS、签名历史、admission receipt和新撤销记录；回退采用停用及恢复配置，不靠删除历史或降级解锁。旧现场epoch10不变。

## 本轮不能承诺的结果

代码、精确依赖、合成闭环和本轮手机升级已经有各自证据，桌面安装、一次新范围及实际链路验收仍未完成。本轮动作按[已记录批准](normal-controls-deployment.md)逐步执行；改变目标或扩大权限不能由清单自行授权。首次合成链路即使成功，也只证明手机到正常产品服务的执行/富交互链路，不证明真实模型费用、GLM功能、无人值守长期访问、手机审批答复或30分钟后的冷启动恢复。
