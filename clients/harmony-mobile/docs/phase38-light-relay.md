# Phase38：服务器只运行轻量中转

用户明确选择“轻量的中转服务”，服务器不安装 DSH。此前 relay 的 DSH 宿主仅提供 HTTP upgrade 注册和 Cordis 的 effect/dispose，不提供中转所需任务执行能力。独立 Node/http/ws 宿主已替代这些能力；RelayRooms 和提取后的 RelayUpgrade 由独立入口与旧可选插件共同使用，路径/subprotocol/header/密文透传协议不变。旧 DSH runtime 依赖锁/安装准备及旧部署批准请求已暂停；失败的 DSH 元数据请求未取得产物，没有继续下载或安装。

## 实际成果与依赖

部署包为私有 `local-harmony-light-relay@0.0.0-phase38.1`，仅依赖官方 `ws@8.21.3`，没有 DSH/Cordis/WebServer/model/SessionController，也没有平台 native 二进制。官方 tarball 为 `https://registry.npmjs.org/ws/-/ws-8.21.3.tgz`，35,016字节，SHA256 `df3454ef205791ce50b5b9241762dcf9bfe1aa9f7f01d3057229be7dac0c2dc3`；完整 SHA512 integrity 见 package-lock 和 ws.verified.json。ws 无运行时 dependencies、无 OS/CPU 限制；optional native peers bufferutil/utf-8-validate 没有装入本包。

使用已安装 npm11.6.2，仅在 `D:/Temp/dsh-harmony-light-relay-20261013-prep` 对本地已校验 tarball 做 offline/ignore-scripts/package-lock-only 解析，使用独立空配置和清理后的环境；没有 node_modules、上游生命周期脚本或网络解析。lockfileVersion3 仅两项：根包与 node_modules/ws。锁 SHA256 `0241d17d626bc32506e4d66d855498530e260bccc1e66e05fc26f15386fd69de`。交付包直接携带官方 ws 原始文件及原 tarball，所以服务器不需要 npm 安装、账号或安装脚本。有关来源、输入及完整文件 hash 见 [构建信息](../evidence/phase38-build-info.json) 和 [包文件清单](../evidence/phase38-package-files.json)。

主入口为 `node server.mjs --config <静态JSON>`，是用户明确要求的独立中转入口，不作为 DSH 应用 bin/profile 发布。默认配置关闭，导入及 disabled CLI 都不创建 listener/WS/timer。启用也仅绑定127.0.0.1，初始 room 为空，所有 join 拒绝；没有 HTTP/CLI/文件/IPC provisioning，入口不生成凭据或密钥。包中提供 enabled.example 与 systemd/nginx proposal，均不自动激活。

## 当前验证层级

18条独立宿主用例覆盖配置/默认关闭、实际 loopback 空room拒绝、精确路由/host/protocol/role/cookie/origin/token拒绝、一次性加入、原样二进制转发、断开/到期/撤销/text/control关闭、无HTTP provisioning入口、关闭期间晚到listen，以及ws payload/Node timer整数溢出拒绝。另41条旧 relay/E2E/native-confirmation 回归通过；旧会写已封存 evidence 的1条用例有意排除。4条实际部署包 ESM smoke 使用包内官方ws，无源代码 alias/DSH runtime，覆盖 disabled CLI、完整依赖 integrity、空room拒绝/原样转发/撤销及配置拒绝，运行前后包文件 hash 一致。

实际网络测试全部是本地127.0.0.1临时端口并关闭，沙箱 EACCES 后原命令窄 host retry；没有借此跳过行为失败。独立只读安全复核指出并修复了ws把maxPayload截成负32位整数导致上限失效及Node timer溢出问题，修正后的窄审未发现源码阻断项。当前测试宿主是 Windows/Node24；代码 target Node22，依赖无 native/OS限制，现有服务器 Node22.22.2 符合引擎要求，但 Linux服务器执行、公网TLS、真实issuer、手机/ArkWeb都尚未验收。没有新 HAP 或真机执行，手机按用户已明确的 Mate90 Pro Max/HarmonyOS7 记录，准确 API 与签名状态仍待实测。

## E2E 与落盘范围

[部署包 README](../standalone-relay/README.md#what-the-server-sees) 是元数据可见性和持久化范围的唯一说明：proxy可见外部IP、header/room/role/一次性加入凭据；Node可见loopback peer及转发元数据；协议hello和frame header公开，应用正文及身份 proof由端点加密。服务器没有解密密钥，也不验证二进制正文一定经过加密。它不写消息/room/capability/队列/原始header日志，GC清引用不保证内存字节清零；既有proxy/系统日志、swap、core及VM抓取仍可能落盘，proposal里的log/swap/core限制尚未应用。TLS证书/私钥和配置文件若获准创建则会持久保存，与手机pairing key和任务凭据分开。

## 最小新部署清单，尚未执行

| 项目 | 新方案 |
| --- | --- |
| 目录/入口 | 用户devin，候选 `/home/devin/harmony-relay`，解包后 `/usr/bin/node .../server.mjs --config .../config.enabled.json`；新目录存在性未查，若冲突停止 |
| 依赖 | 封存轻量包即可；复用现有Node22.22.2，不装DSH、不创建DSH_HOME/profile，不运行npm install |
| service | 候选 `/etc/systemd/system/harmony-relay.service`；User=devin、MemoryMax256M、MemorySwapMax0、LimitCORE0；只start，Restart=no，不enable开机启动 |
| listener | 127.0.0.1:17846，启动前确认仍无冲突；不开放17846安全组/防火墙 |
| nginx | 新 `/etc/nginx/sites-available/harmony-relay` 及对应enabled链接，limits置 `/etc/nginx/conf.d/harmony-relay-limits.conf`；复用80/443，保留原两个站点与8080/3000服务，nginx -t通过才reload，禁止restart |
| DNS | 权威ns1.alidns.com对dsh A/AAAA此前均NXDOMAIN；由域名DNS管理员在AliDNS新增dsh A=8.210.203.110，TTL600建议；不新增未经核实AAAA，不读取DNS凭据 |
| TLS | 复用已有Certbot2.9.0，certonly/webroot，新dsh.devinho.me lineage；不读取或复制旧私钥，不改旧证书。新TLS key、条款、续期、必要管理员权限仍需批准；账号不可用或需新注册时停止 |
| 关闭/回退 | 停新harmony-relay；移除本次新增nginx链接/config后检查并reload，保留旧站点、旧成果和新包；DNS/证书删除或撤销不自动执行 |

Let’s Encrypt/ISRG 是拟用 CA；申请新证书需用户接受 [Subscriber Agreement v1.8](https://letsencrypt.org/documents/LE-SA-v1.8-July-06-2026.pdf) 与 [隐私政策](https://letsencrypt.org/privacy/)，并批准新TLS私钥在服务器生成/保存，域名证书会进入 [公开CT日志](https://letsencrypt.org/how-it-works/)。本次没有签发、账号注册、DNS写入、服务器上传/安装/启动或安全设置变更。

这一包只能部署默认拒绝的 relay 入口，不能单独完成手机可用配对。生产 ephemeral issuer/control plane 仍未交付/激活，端点必须以新的短期room和E2E键恢复连接，桌面journal保留原command/action ids防重复；relay没有离线消息队列或任务派发。下一阶段对应批准后才验证Linux启动、TLS/proxy限额，再实现并审查不暴露host执行权的最小短期room发行/连接闭环；不能用长期固定token、TOFU或公开create-grant接口替代。
