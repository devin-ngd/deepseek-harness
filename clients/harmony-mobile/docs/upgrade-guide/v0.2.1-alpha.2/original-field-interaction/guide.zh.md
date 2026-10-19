---
kind: upgrade-guide
description: 公开中继维护必须提供端点时限，固定回放完成实际 SDK action。
---

# 原样现场交互

## 变更

后继固定回放通过维护的 replay 占位机制，从规范 Interactive input 读取完成 actionId。原 HTML、bindForm 脚本和共享 guest SDK 保持普通的随机 action 身份。测试不再替换表单脚本，也不为浏览器交互指定另一套身份。既有身份、Session、world 和 relay journal 格式不变。

公开首用配置准备、预览与初始化必须显式传入 endpointTimers。维护命令必须通过 --limits 提供 harmony-relay-endpoint-timers/1，由选定桌面和手机 relay 策略投影生成。签发期限超过任一端允许值时，在输出配置或初始化公开状态前拒绝。源码服务器提案使用10秒挑战与30秒房间，端点上限仍为15秒和60秒。

## 迁移

1. 保留封存的 .3 runtime 和 .2 维护工具。构建、审查后继版本，不随构建启用部署。
2. prepare-public-config.mjs 与 initialize-public-trust.mjs 都通过 --limits 传入候选的 relay-endpoint-timers.json。同进程消费者显式传入同一限额，旧 argv 拒绝。
3. 保持桌面与手机策略不变。实际端点配置变化后重新生成投影，核对来源哈希并重新检查中继兼容性。
4. 在封存候选的原样页面上实际点击，以观察到的 SDK actionId 核对完成和重复回执。浏览器执行不能证明 ArkWeb 验收。
5. 保留所有既有 credentials、Session、回执和公开撤销记录。本源码变化不触发部署、身份迁移、新 grant 或服务激活。

## 本地确认

TTY 与原生确认控件保持执行。人类明确批准具体身份、绑定、限时 grant 与服务操作后，代理可以在该授权内代操作正常产品确认。存在 UI 控件本身不意味着必须由人亲手点击。密码或私钥传输、账号登录或其他强制交接仍受单独限制。本指南不授予真实身份或部署操作权限。
