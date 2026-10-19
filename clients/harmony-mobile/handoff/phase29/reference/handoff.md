> 本文是生成副本，仓库相对引用保留为源码位置，不代表安装文件。

# 离线交接与下一步

先读 累计矩阵（源码引用：phase29-acceptance-matrix.md） 判断证据版本，再按 桌面接入计划（源码引用：phase29-desktop-integration.md）开发同 profile 的窄插件绑定。当前没有部署产品接入，也没有打开新的原生窗口。

## 独立验证包

`handoff/phase29/` 是生成的独立离线包。它包含共享 TypeScript 源码的 bundle、许可文本、版本台账以及已记录的合成 reset / v28 原生日志和控件树，不包含 SDK、安装器、账户、密钥、用户数据或可连真实桌面的配置。bundle 是生成产物，不是另外维护的协议/runtime 实现。

已有 Node 22.19+ 或 24+ 的机器解压后运行：

```sh
node verify.mjs
```

运行只读取包内文件并校验 hash，再验证当前共享 TS 的合成读取和既有原生证据，且检查追加失败记录后不会误通过。成功输出仍带 `freshNativeExecution=false`、`fullCurrentRegressionClaimed=false`、`installedDesktopVerified=false`。它不监听端口，不调用模型，不读取安装 profile，不发任务，不访问 DevEco/HDC；不会把保存的原生结果当作本次重新执行。

源工程中的生成命令是 `node scripts/phase29-build-handoff.mjs`。该命令已在本批执行；它依赖当前工程已有的 esbuild/源码解析环境，仅生成本地交接包，不安装依赖。生成输入 hash 记于包内 `source-inputs.json`，包内文件 hash 在 `manifest.json`。

## 开发交接

接下来的第一份可审查实现应是 capability/version resolver 和使用 fake typed ports 的 production binding factory，保持现有 synthetic-only 守卫。随后完成合成目录/会话 UI 和真实审批的 projection/取消/过期/竞争回应适配。离线阶段不得注册真实 listener、制造长期凭据、安装插件、读取真实会话或启动真实桌面任务。

外部操作前先交付精确插件包/version/hash、目标 profile 差异、安装 runtime 公开 metadata 对齐、测试与回退；再分别申请计划里列出的安装/重启、真实会话与任务范围、持久访问/配对、签名/手机权限、网络批准。不把已结束的第九原生窗口用于下一阶段。

本批检查（源码引用：../evidence/phase29-checks.json）记录实际执行的离线验证与限定。v29 封存（源码引用：../evidence/phase29-final-seal.json）连接到 v28 的旧封存，源码增量包含当前文档和交接生成脚本，回退保留原 docs 文件；旧 ZIP/HAP/失败记录不被替换。
