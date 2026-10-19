# 用户安装后的只读核验

用户允许公开兼容性检查后自行报告“装好了”，本任务随即停止自动安装。未调用 PluginManager、未写入 installed profile、未启用或重启宿主，也没有执行任务、读取用户 Session/凭据、配对或创建访问权限。只读证据见 [安装状态](../evidence/phase33-installed-check.json)、[公开运行时清单](../evidence/phase33-runtime-audit.json)与[接口字节比较](../evidence/phase33-interface-comparison.json)。

已安装 `@deepseek-ai/dsh-experimental-harmony-mobile@0.0.0-phase32.1` 位于 `C:/Users/wpdev/.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-experimental-harmony-mobile`。管理 manifest 的 dependency 指向批准的本地 tgz，bundle 未选中；安装包 patch 为 `disabled:true`、`config.enabled:false`。29 个安装文件的长度及 SHA-256 全部匹配 phase32 artifact manifest。原 tgz SHA-256 仍为 `33550473f3a46a0b541b7d7867691916c6f9ccfae288924ef36278feac2dae82`。

正在运行的宿主可执行文件位于 `C:/Users/wpdev/AppData/Local/Programs/DeepSeek Harness/DeepSeek Harness.exe`。其实际 ASAR shell 版本为 `0.2.1-alpha.2.20261012.1`，公开 runtime release 为 `0.2.1-alpha.2`、Host protocol 4、Node 24.21.0、pnpm 11.28.5、win32/x64。16 个声明 peer 由 immutable runtime 清单提供；rich-inline 由当前 desktop profile 提供，版本为 `0.2.1-alpha.2`。所有 17 个 peer 的公开版本符合包声明；未给版本豁免。

未仅依赖 semver。实际 ASAR 的 SessionController、Gateway、Typert protocol/registry、StorageDomain、Connection、Agent、PluginManager、插件 UI，以及当前 profile rich-inline 的入口、host、shared types/validation、Typert descriptor 共 14 个关键文件，与本地已准备构建的字节及 SHA-256 完全一致。该比较支持这些公开接口的静态兼容，不证明整个已安装应用对应某个 Git commit，也不等于启用后的运行验收。

核对实际安装的 UI/服务代码后，插件页“添加插件”的新安装请求使用 `enabled:false`；完成页的“立即启用”另行调用启用操作。直接 Service/tool 安装缺省为启用，不能省略 `enabled:false`。用户已经安装，无需重复操作；维持当前关闭状态即可。不要按“立即启用”来验证本阶段。

本包没有网络监听实现，也不创建认证 provider、设备密钥、配对或持久 grant；当前 bundle 未选中，安装包两个禁用声明保持原样。本次没有调用运行中宿主的 service/listener 查询，不能据此声明全机没有其它监听或访问权限。现有安装状态不证明手机远控、真实任务/审批、配对、ArkWeb 或真机可用。

如用户选择卸载，使用相同 managed 插件页移除这一个 bundle dependency；不要删除整个 profile、改动定制宿主或清理 Session/journal。本任务在用户安装前没有写配置，因此没有可声称的安装前配置备份，也不会擅自回滚用户安装。下一次工作应先确定独立认证 carrier/provider、限定 Session/operation、撤销机制和首次 journal 初始化方案，再提交启用/访问/网络所需的具体授权；本次核验不包含这些权限。

默认宿主 sandbox 无法读取 CIM/peer realpath，已对原只读命令作窄 host 重试；读取范围限定为匹配 DSH 的进程 ID/可执行路径、指定安装 ASAR 的公开包/接口，以及明确 desktop profile 的 package selection 和声明 peer manifests。没有修改产品 sandbox 或安全设置。
