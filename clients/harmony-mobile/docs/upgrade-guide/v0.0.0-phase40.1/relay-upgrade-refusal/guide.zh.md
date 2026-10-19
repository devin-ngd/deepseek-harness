---
kind: upgrade-guide
description: Relay upgrade 准入失败改为返回空 HTTP403，并关闭连接。
---

# Relay upgrade 拒绝

## 变更

私有 relay 的 `0.0.0-phase40.1` 后继候选对所有 upgrade 准入失败返回相同的空 `403 Forbidden`、`Connection: close`、`Content-Length: 0`、`Cache-Control: no-store`，写入完成后关闭。响应不含请求字段、身份、capability、房间状态或拒绝原因。服务器仍运行原包，继续直接断开并被 nginx 呈现为502。

合法 WebSocket 握手、双方证明、房间签发、一次性token、E2E帧、配置、限额、journal和expiry不变。TCP容量与HTTP解析失败保留原传输拒绝；准入后的 WebSocket语法错误仍可由维护中的ws返回400。

## 迁移

1. 替换服务器前单独批准候选包的精确hash。保留公共状态和原档案，不安装服务器DSH或执行npm。
2. 将外部准入拒绝检查从连接重置/nginx502改为要求空403；合法路径和资源限额不变。
3. 核对两条精确WS路由、零未授权成功握手、响应无字段泄漏、合法转发及stop/start清理。本地代理模拟不代表真实nginx或候选部署验收。
