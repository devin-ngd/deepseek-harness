---
kind: reference
description: rc2.16 完整候选的隔离原生 Electron 离线验收结果、证据范围与剩余限制。
---

# rc2.16 原生 Electron 离线验收

## 当前结果

用户将候选完整性标签调整为 Medium 后，完整候选 `0.2.1-rc.2.20261028.1` 已在原生 Electron 窗口通过六项离线界面场景。[验收证据](../evidence/native-electron-rc216-medium-20261028.json)收录 21 个原生截图与状态检查点的摘要、候选字节核对、失败尝试和退出结果。原安装版未操作，原配对未访问，未部署或开启实机联调；本轮没有修改安全标签、DACL、系统协议关联或 Chromium 沙箱。

| 场景 | 原生窗口结果 |
|---|---|
| 空白首页入口 | 面板可展开，挂载不执行命令；状态检查返回 `bound`，未检查前变更入口禁用 |
| 空白会话往返 | 仅含命令的会话离开后仍在侧栏；返回恢复同一确认 ID，未重复提交 |
| 拒绝确认 | 正常 Deny／Submit answer 返回失败，变更锁定；本地停止返回 `stopped` 并解锁 |
| 已有会话往返 | 两个录制会话间往返保留 Allow 草稿和待答 ID，另一会话的并发命令被拒绝 |
| 允许确认及结果归属 | 正常 Allow 只产生本地合成 offer；结果只留在原会话，连接仍禁用，返回不自动重发 |
| 关闭确认 | Return to conversation 不产生新 offer，变更锁定；本地停止后恢复可用 |

空白会话轮和已有会话轮均正常退出，应用退出码为 0。最终候选进程数为 0，记录的 Host 与 inspector 回环监听数为 0。检查点中的合成身份和绑定保持不变，模型调用及新增模型轮次均为 0；录制历史中的旧轮次不计作本轮执行。

## 候选与隔离方式

使用[完整桌面候选](desktop-hostfix-candidate-20261028.md)的独立 application 副本，EXE、ASAR 和安装器在验收后保持原摘要。应用 EXE 为 `a2effe12ea2de0ff9edd4f6beacdde3e46530bf6e593788e5d293b9ba9a1eb65`，ASAR 为 `ddf151881c55780b0f188c87abf592e26fa096486e582a7a549cd4328e40282b`，安装器为 `7d500fa3877af75d39dbabe0a9642acf49bfdd3a6758959f5ab4da47a21185a1`。临时 profile 内激活的 Harmony 包全部 108 个文件与原 rc2.16 清单一致。

测试目录为 `.build/native-electron-rc216-ZxecvF/`，HOME、`DSH_HOME`、`DSH_AGENTS_HOME`、userData、临时目录和日志均独立，依赖缓存复用此前隔离构建保留的副本。候选附带的 Harmony 与 rich-inline tarball 通过候选自带 CLI 离线装入临时 profile；依赖准备使用保留缓存及已验证桌面构建的共享包链接，运行时实际解析到 ASAR 内的 Cordis，且通过同一 Context 实例断言。没有激活安装版 profile 中的候选插件。

临时环境仅提供明确无效的合成 API key 字符串，使普通凭据存在检查能够进入工作区；没有登录或读取真实账号、密钥。`llm/stream` 夹具在模型派发前拒绝请求，遥测禁用。设备夹具仅使用仓库公开固定测试密钥和 `relay.example`，通过 Windows CurrentUser DPAPI 保护合成密钥；正常候选 `/device` 命令、Remote answerer 和 rich-inline 确认界面均保留。Allow 只验证本地签名 offer，未确认手机回复、连接 relay 或提交任务。

以宿主 Medium 进程启动候选，入口通过 `--inspect-brk=127.0.0.1:0` 暂停，进程内钩子固定临时路径、阻止系统 `dsh://` 注册、外部页面打开和 Renderer 非回环网络请求，然后继续原应用入口。实际窗口为 `dsh-app://app/`，`app.isPackaged`、`sandbox`、`contextIsolation` 均为 true。界面操作使用 Computer Use；inspector 只承担隔离准备、只读状态检查、截图及正常退出。Renderer 非回环阻断计数与外部页面打开计数均为 0，该计数不等于全系统网络抓包。

## 启动与夹具失败记录

[标签调整前的记录](../evidence/native-electron-rc216-20261028.json)保留两次直接失败和只读调试观察：候选 Low、异常 `0x80000003`、LastError 5。本轮只读确认用户调整后的 Medium 标签；低令牌沙箱内启动仍失败，宿主 Medium 启动才进入原生窗口。不回改旧失败记录，也不恢复用户的标签调整。

验证器曾因入口暂停时使用 `awaitPromise` 卡住、过早读取 BrowserWindow，以及退出前未断开 inspector 而失败；这些尝试及仅针对自有进程的停止记录已保留。修正验证器后正常启动和退出通过。临时依赖准备曾缺少离线元数据，同路径夹具 tgz 曾复用旧缓存，录制种子曾缺少 `seq`；后续采用内容命名 tgz 和仓库录制会话解码器。一次夹具 POST 准备请求返回 400，已有会话改为启动前置夹具准备；不把这些失败记为产品场景通过。

启动日志仍有 `dsh-desktop:mandatory-status` 未注册 handler 的提示，界面场景可继续完成，本轮未修复该提示。关闭确认在命令日志中显示 `operation/unclassified-failure`，面板进入预期的失败锁定状态；本轮只验收未授权、不新增 offer 和本地停止恢复，未优化该错误分类。

## 剩余范围

本结果建立候选包、临时 Host、合成数据和原生 Electron 界面的离线资格，不建立已安装 Desktop、原配对稳定握手、真实手机 HUKS／ArkWeb、relay 传输、实机重连或模型任务资格。安装验收现使用[安装器修复候选 `.2`](installer-repaint-20261028.md)：`.1` 的目录误拒绝已单独复现并修复，未变的外壳代码逐字节核对一致。本页六项场景不包含真实安装流程；实际覆盖安装仍待用户手动验收，部署和新的实机窗口继续等待明确授权，旧批准不可复用。
