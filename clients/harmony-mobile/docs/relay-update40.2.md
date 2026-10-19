# phase40.2 真实部署验证

用户在2026-10-14 02:59:38 UTC批准指定补丁和仅此relay的短stop/start。当前dhome运行 `0.0.0-phase40.2`，103873字节ZIP，32个核验entries，SHA256 `200cb6ff842042589bcc5222ff3a83fb40234f16d0877b037fd1f88fd258e563`。仅替换server.mjs、package/lock/build metadata、README及新增UPGRADE.md。

真实Linux和nginx实测：两条正常未授权upgrade都是空403且Cache-Control no-store；错误协议403，错误外部路径404，重复Host HTTP格式400；没有101成功握手。普通HTTP404和server无pairing/session API不变。TLSv1.3、CA/域名校验成功，公开证书指纹和2027-01-12有效期保持不变。

旧进程3727235和监听已在短stop中释放；新进程3763855 active/running，仍只监听127.0.0.1:17846、UnitFileState disabled、Restart no。拒绝测试后backend无ESTABLISHED连接。broker仍disabled、room空、publicTrust未初始化，没有真实端点/grant、模型调用或Session上传；唯一允许上传为部署ZIP。

config.enabled.json、unit、nginx文件哈希及原三份站点配置字节不变；nginx master PID916不变，没有reload/restart。devinho.me、www.devinho.me、usage.devinho.me前后均200且TLS校验成功。没有TLS/证书/续期、DNS、防火墙、云安全组、SSH或安装DSH/手机改动。

旧ZIP完整留在/home/devin/harmony-relay/relay-0.0.0-phase40.1.zip，旧程序和config备份位于/home/devin/harmony-relay/rollback/phase40.1-before-40.2。准备了限此服务的失败恢复步骤，本次没有触发回退；不得删除或重建公共撤销/receipt状态。

下一真实端点需要分别批准选定桌面signer、手机HUKS alias及指纹/audience核对、原桌面Session/operation scoped grant和publicTrust初始化/最窄写目录，再准备原owner的同进程provider、强制replay的隔离dsh profile，以及手机签名/INTERNET权限/安装和实际API/HUKS/ArkWeb/前后台验证。该TLS/拒绝结果不代表合法房间、E2E任务或真机闭环已通过；真实模型仍硬阻断。

本地探针首次遗漏TLS格式测试端口，在两条403已观测后报错；修正443并仅重跑只读探针，不重复安装、签证书或放宽验证。[完整证据与回退记录](../evidence/relay-update40.2.json)，[原phase40.1部署记录](relay-deployment-20261014.md)保持原有真实502资格。
