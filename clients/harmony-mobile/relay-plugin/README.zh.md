# 可选的旧版 DSH 中继适配器

[English](README.md) | 中文

当前源码与用户选定的 standalone-relay 独立 Node 中继共享 RelayRooms/RelayUpgrade；服务器不再需要本 DSH 包或运行时。已封存的阶段 36 产物保留为历史可选适配器。

该阶段 36 包为受维护的 DSH WebServer 添加一条精确 WebSocket upgrade 路由。两个 Bundle 条目与 `config.enabled` 都默认禁用。它没有 bin、凭据读取器、HTTP provisioning 路由、操作者 Connection、Session、Shell 或模型。只可安装到另行批准的最小 `dsh` Profile；尚未安装或激活。

获批的本地 provisioner 必须调用非 Remote 的 `ctx.harmonyRelay.provision`，提供不透明房间 id、两个独立加入能力摘要和较短的绝对到期时间。本包不提供 provisioner、密钥/token 生成器、秘密存储或远程注册控制器。因此，即使启用，空 Profile 仍拒绝所有加入。能力为一次性、按角色区分，独立于桌面执行授权；房间丢失后需要新的本地 provisioning 和新 E2E 密钥，同时桌面日志保留原命令 id。

外部路径为 `wss://dsh.devinho.me/harmony/relay/v1`，子协议为 `dsh-relay-v1`。加入使用 Authorization 及房间/角色头，不接受 URL token、Cookie 或浏览器 Origin。双方加入后仅发出一次文本 `{"relay":"ready","v":1}`；此后所有载荷都是不透明二进制 E2E 帧。该通知不授予身份或操作。文本载荷、缺少对端、到期、断开、帧/队列预算耗尽或发送失败都会关闭双方。没有离线队列、持久房间或自动重拨。

只接受既有 WebServer HTTPS，或获批 TLS 代理后显式配置的 `127.0.0.1`。拟用 loopback 端口 17846 和服务器路由尚未验证；完成服务器清点与批准前不得复制/激活禁用模板。外部代理必须限制连接/upgrade，包括无效加入和 WS 控制帧，房间预算不足以约束这些情况。日志不得记录载荷、原始头、token、密钥或 URL 查询。

自定义 E2E 仍是未通过验收的原型。只读源码审查和内存测试不能证明原生 TLS/HUKS 行为、密码协议审计安全性、公网可用性、设备安装或生产就绪。批准、回滚和剩余验收要求见 `clients/harmony-mobile/docs/phase36-relay-handoff.md`。

nativeOrigin Config 字段默认拒绝；networkkit-v1 选择[独立中继参考](../standalone-relay/README.zh.md)中说明的共享手机 Origin 兼容策略。它不改变房间能力或端点证明。此源码选项未改变任何已部署中继设置。
