---
kind: upgrade-guide
description: Harmony 已配对启动和十分钟中继房间需要双端及中继使用匹配设置。
---

# Harmony 设备连接期限

## 变更

私有 rc2.30 候选中，已启用的桌面 `/device` 组件默认使用 `connectionMode: paired`；手机候选启用 `deviceAutoConnect`，已配对设备启动即连接，掉线后每 5 秒重试，手动断开停止重试。中继的 `pairedDevices: true` 复用设备路由历史中保留且已验签的原绑定，包括已结束临时窗口中的绑定；设备撤销仍然生效。身份、绑定、Session 和历史格式不变。详见[已配对自动连接](../../../paired-connection-rc2.30.md)。

私有 rc2.19 候选签发 10 分钟中继房间。桌面和手机示例接受 10 分钟，桌面设备票据也采用相同期限。上限为 60 秒的旧端点会拒绝这些房间。rc2.21 代理提案还将两条 WebSocket 读取超时提高到 660 秒，否则静默控制连接会在 60 秒关闭活动数据房间。更早的已签名路由截止时间仍限制房间和票据；线协议消息、原身份、绑定及日志格式不变。

## 迁移

1. 审阅[完整离线候选](../../../connection-lifetime-rc2.19.md)，修改已安装应用或中继前取得部署批准。
2. 仅向现有桌面 device 组件合并 `relay.maxRoomTtlMs: 600000` 和 `connectionTtlMs: 600000`。使用匹配的手机候选，其 `relay.maxRoomTtlMs` 为 600000。
3. 向现有中继配置合并 `maxRoomTtlMs: 600000` 和 `broker.roomTtlMs: 600000`。保留身份固定值、绑定、日志路径、head 文件及其他设置，不初始化新的配对状态。
4. 从选定配置重新生成端点期限投影。rc2.21 仅向现有 nginx 的精确 `/harmony/relay/control/v1` 和 `/harmony/relay/v1` location 合并 `proxy_read_timeout 660s`，保留 TLS、请求头、准入限制及其他站点。取得部署批准后，先校验 nginx 配置再重载。审阅[候选证据](../../../proxy-timeout-rc2.21.md)，保留更早的路由截止限制。
5. rc2.30 需要双端与中继一起更新：桌面 device 组件合并 `connectionMode: paired`、`reconnectMs: 5000`，中继合并 `pairedDevices: true`，保留现有已验签设备路由历史。`connectionMode: window` 保留手工临时窗口模式；rc2.30 手机候选使用已配对模式。个人设备的日常服务在配置后持续运行。离线检查不能代替原机自动连接验收。
