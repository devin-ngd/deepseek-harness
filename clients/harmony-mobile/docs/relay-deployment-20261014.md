# 轻量 relay 实际部署记录

用户在 2026-10-14 01:36:55 UTC 明确批准指定 ZIP 部署、专用服务启动、现有 nginx 80/443 的子域名配置和免费 Let's Encrypt 证书，并报告 DNS 已添加。目标为本机 SSH alias `dhome`、8.210.203.110；服务器只运行独立 Node/ws relay，未安装 DSH 或执行 npm 安装脚本。手机/桌面配对、publicTrust 初始化、broker 启用、桌面更新、手机签名安装不在这次批准中，也未执行。

## 已执行

权威 DNS `ns1.alidns.com` 返回 `dsh.devinho.me A 8.210.203.110`，无 AAAA。服务器为 Ubuntu24.04.4、Node22.22.2、Certbot2.9.0；已有 nginx 可 reload、Certbot timer active/enabled。新目录、unit、nginx文件、ACME目录及该域名证书原先不存在，17846空闲。Windows本地 DNS 代理返回198.18测试网地址，所以外部探针使用权威确认的IP，同时保留域名SNI、CA和hostname校验。

部署包为 `harmony-light-relay-0.0.0-phase40.1.zip`，102553字节，SHA256 `a0d3c2cda36ff0efdbb2ec8a4af97b3421e4942b9531c910ec06f76e80e3f288`。服务器核对 ZIP 和全部31个entries后用现有 Python标准库解包；没有安装 unzip 或新依赖。`config.enabled.json` 明确为 host127.0.0.1、port17846、publicHost dsh.devinho.me、broker.enabled false，且不含 publicTrust。

| 新增项 | 实际位置/状态 |
| --- | --- |
| relay目录 | `/home/devin/harmony-relay` |
| unit | `/etc/systemd/system/harmony-relay.service`，User devin、active/running、UnitFileState disabled、Restart no |
| 内部监听 | 仅 `127.0.0.1:17846` |
| nginx | `/etc/nginx/conf.d/harmony-relay.conf`，仅该域名两个精确WS路径，其他路径404 |
| ACME webroot | `/var/www/harmony-relay-acme`，外部挑战探针200；本次临时探针已移除 |
| 新证书 | `/etc/letsencrypt/live/dsh.devinho.me`，ECDSA，仅SAN dsh.devinho.me，2026-10-14 00:55:51至2027-01-12 00:55:50 UTC |
| 新TLS私钥 | 服务器本地生成保存，root:root 0600；没有读取内容或取出 |
| 续期 | 复用原ACME账户；新域名renewal配置为webroot，`renew_hook = /usr/sbin/nginx -t && /usr/bin/systemctl reload nginx`；原timer继续运行 |

ACME服务端条款链接与用户批准的 `LE-SA-v1.8-July-06-2026.pdf` 相同，账户数量始终为1，没有新增账户、邮箱或额外凭据。证书公开SHA256指纹为 `50:4F:6E:40:37:C2:43:D2:8C:1B:89:17:44:05:7C:DF:E0:98:01:E6:61:E5:5D:43:16:76:59:93:6A:D4:40:C4`。续期配置与首次deploy hook已验证；未进行会创建staging账户的续期dry-run，也未把未来续期称为已完成。

nginx始终先通过 `nginx -t` 再平滑reload，master PID916保持不变，未restart。原 `/etc/nginx/nginx.conf`、`sites-enabled/devinhome` 和 `sites-enabled/codexbar-usage` 已在服务器本地备份并逐字节确认未变，没有读取或复制既有私钥；devinho.me、www.devinho.me、usage.devinho.me在变更前后均返回200且TLS验证成功。没有防火墙、云安全组、SSH设置或开机启用变更。

## 验证与实际限制

本地普通HTTP六个路径返回404，包括两个精确relay路径和未提供的pairing/session入口。两个无授权WS请求均被backend直接关闭且没有101/HTTP响应；这是批准包 `RelayUpgrade.handle()` 的既有策略，nginx将其呈现为502。不能把此结果称为应用403或隐藏为健康4xx；它确认本轮请求未被接受，但该版的拒绝呈现仍是一个已记录限制。服务在探针之后保持active，没有因此崩溃。

显式stop/start成功：旧PID3716724结束、端口释放、ExecMainStatus0/Resultsuccess；再次start为PID3727235并仅监听loopback，仍disabled/Restartno。进程退出验证了其所有进程内socket和timer已释放，不把kernel TIME_WAIT当作活跃应用资源。证书链通过服务器OpenSSL校验；外部证据与命令记录见[部署汇总](../evidence/relay-deployment-20261014.json)。

首次就绪检查分别早于Node异步listen和nginx worker切换，后续只读就绪检查成功；未重复安装或签发证书。SSH偶发提前关闭时只重试同一调用一次，没有调整权限/端口。外部探针首次错误假定HTTP4xx，随后查明直接关闭策略；第二次探针未处理TLS恢复会话的空证书元数据，最后改为独立连接，服务器代码和批准包保持原字节。

## 回退与剩余范围

回退应先停止仅这个新service，确认unit/config哈希后将该新nginx文件移出active include，`nginx -t`成功后仅reload，保留新目录和 `/home/devin/harmony-relay/rollback` 的现场记录。原网站配置未修改，不应盲目覆盖其备份。新证书、renewal、账户和DNS的清理各需明确批准，不停止原Certbot timer或删旧私钥。上述回退未执行。

当前broker关闭、room为空，没有设备身份、原桌面grant或publicTrust；此部署只验证TLS入口和拒绝，不建立合法房间/E2E应用通信、手机远控、ArkWeb/HUKS或真机资格。后续身份/配对/公共journal及最窄写目录权限、桌面provider与强制replay profile、手机签名安装仍须另行批准和实际验收。
