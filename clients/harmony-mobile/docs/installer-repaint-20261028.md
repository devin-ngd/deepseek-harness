---
kind: reference
description: Windows 安装器目录误拒绝修复、原生重绘验证和完整桌面候选交付证据。
---

# Windows 安装器重绘修复候选

## 当前候选

用户已手动完成 `.2` 原目录覆盖安装，[公开载荷核验](../evidence/desktop-installed-20261028.json)通过；[授权后的单目录 RX 修复](../evidence/installed-acl-repair-20261028.json)使同一隔离 profile 正常显示窗口并退出。用户随后确认正常启动。原 profile／配对未由 Agent 读取，插件激活状态未验收。安装器的权限持久处理现已进入源码并通过原生回归，但尚未生成包含该源码的新整包，见[本轮验证](../evidence/installer-access-persistence-20261028.json)。

安装前 `.2` 在正确原目录的所有权错误保留为[现场反证与隔离诊断](../evidence/installer-residual-20261028.json)。从登记可见的上下文完成安装，不等于已消除通用资源管理器入口的登记可见性差异；下述旧 A/B 与离线检查保留各自范围。

正式模板的隔离只读副本已分别通过静默检查、首页离开检查和包含安装前检查的完整导航；只在检查返回后记录的变体也未复现拒绝。这些副本移除安装载荷与实际安装 Section，并在目录所有权检查后截断写入检查，不能替代真实安装验收。

用户明确授权的一次最多五分钟观察已捕获[真实安装器的注册键打开失败](../evidence/installer-registry-open-20261028.json)：`RegOpenKeyExW(HKCU, Software\\7808434f-469e-5eba-848e-edf64d3b94ce, 0x20119)` 返回 `2`，随后才枚举非空目录并拒绝。安装器与观察进程的用户 SID 相同，均无 package identity；使用安装器缓存的用户／Software 根句柄读取产品登记，两种视图均返回 `2`，观察进程新打开的 HKCU／显式 HKU 根则均能读取对应键。观察已结束，已通过 `CheckRemoteDebuggerPresent` 确认无调试器附着；未修改进程代码、注册表、安装应用或原配对。

[相同 EXE 的启动来源对照](../evidence/installer-launch-context-20261028.json)排除了单个旧进程缓存失效：用户从资源管理器重新打开的首页进程仍读不到原登记；正常关闭该首页后，由诊断执行器启动同一个、同路径且摘要未变的 `.2`，两种视图均可读到登记并匹配原目录。该进程仍为 wpdev／Medium、未提权、无 AppContainer 或调试器，用户在此窗口手动安装完成。启动上下文影响登记可见性已得到对照支持，具体 Windows 隔离机制仍未定位，安装后也未重测资源管理器启动安装器；Agent 未点击安装、未直接写注册表或调整安全设置。

完整 Windows x64 未签名候选为 `0.2.1-rc.2.20261028.2`，版本号经用户确认。[安装器 EXE](../../../apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/deepseek-harness-0.2.1-rc.2.20261028.2-win-x64-unsigned.exe) 为 288,384,450 字节，SHA-256 为 `7ae9188440af6b72865589d13faa49df022d2efd7ed17adaaacdc3639858ce9a`。[产物核对](../evidence/installer-repaint-artifact-20261028.json)确认交付副本摘要一致，旧 `.1` EXE 保留原字节。

原目录仍为 `C:\Users\wpdev\AppData\Local\Programs\DeepSeek Harness`。本次没有卸载、清空原目录或重新配对；实际安装由用户执行，Agent 仅只读核验公开程序载荷。程序文件完整性通过不代表原 profile 和配对的安装后读回已通过。

## 安装版启动阻碍

[安装版启动失败证据](../evidence/installed-startup-failure-20261028.json)记录空隔离 profile 的同一失败：Electron 到达 JavaScript 调试入口后，在 `electron/shell/browser/win/install_dir_access.cc:52` 主动以 `0x80000003` 退出，未出现窗口。原生致命日志明确指出安装目录已有某个 AppContainer package SID 访问项，却没有 `ALL APPLICATION PACKAGES` 的读取／执行访问项。只读 DACL 核对与该条件一致；本次不是依据历史 Low 标签推测原因。

用户明确授权后，仅在 `C:\Users\wpdev\AppData\Local\Programs\DeepSeek Harness` 增加 `S-1-15-2-1:(OI)(CI)(RX)`；原安装根 SDDL 已备份。修复回执确认只新增一个读取／执行访问项，没有写入权限或删除原规则，owner、group 和继承模式均保持不变，EXE 与 ASAR 字节也未变。系统父目录、原 profile、配对、完整性标签及 Electron 沙箱设置未改。相同隔离启动由原生致命退出变为真实欢迎窗口及正常退出，进程和 inspector 监听均已关闭。用户已确认正常启动；配对恢复、会话完整性和插件激活尚未单独核验。

当前安装器源码在创建私有暂存目录后、解压前，通过原生助手添加 ALL APPLICATION PACKAGES 可继承 RX，保留已有 DACL 项；失败时清理暂存目录，以本地化提示和非零退出码结束，旧安装尚未改动。原生回归覆盖已有规则保留、重复调用、子目录和文件继承、缺失路径及普通文件拒绝；10 项 NSIS 事务场景包含真实 WRITE_DAC 拒绝和旧安装保留。目录 smoke 现在必须传入生产助手 DLL。该源码尚未纳入新整包，当前已安装 `.2` 继续使用已经授权修复的目录权限。

## 目录误拒绝与最小修复

实际运行的旧包、运行用户、应用 GUID、注册表 InstallLocation 和输入路径均匹配。发生拒绝时，安装目录仍正确，NSIS 临时寄存器 `$0`、`$1` 已变为按钮尺寸 `150`、`36`。原生同步重绘实验进一步确认：目录比较期间触发自绘按钮回调，会把已读取的原目录覆盖为 `150`，随后产生同一所有权错误。路径大小写、尾部分隔符和注册表视图检查未复现该错误。

[按钮绘制](../../../apps/desktop/installer/pages.nsh)与[复选框绘制](../../../apps/desktop/installer/drawing.nsh)回调现在通过 `System::Store "S"` 保存被中断脚本的寄存器，并在所有返回路径用 `System::Store "L"` 恢复。目录所有权判断与拒绝条件保持不变；本修复未修改 ACL、完整性标签或系统安全配置。

## 原生离线验证

[诊断与验证汇总](../evidence/installer-repaint-20261028.json)保存旧回调与修复回调的原生 A/B 结果。两者在同一目录比较位置强制同步重绘：旧版两次将原目录覆盖为 `150` 并拒绝，修复版在首页、离开首页、安装前检查和空测试 Section 中始终保留原目录且无所有权错误。测试副本中的两个回调与最终产品源码函数体一致。

探针只运行原生 UI 与目录所有权检查，截断生产写入流程，空测试 Section 不安装应用。6 项目录检查通过：32／64 位视图均接受原目录，接受新空目录，拒绝无关非空目录，并在两个视图下拒绝缺少产品 EXE 的登记目录。两个现有安装器测试文件共 14 项单元测试通过；这些结果不等同于实际覆盖安装通过。

实际旧安装器的限时 API 观察没有捕获目标调用，未计入根因证据。原生重绘 A/B 才是本次回调破坏寄存器的复现依据。诊断临时目录和原始报告位于 `.build/installer-ownership-xyR0hN/`，没有保存内存转储或读取原配对载荷。

## 整包构建与运行时

`.2` 复用已通过正式构建及原生窗口验收的完整 `.1` 应用运行时，重新编译安装器并生成完整 EXE；本轮没有重复 TypeScript 全仓构建。[实际 EXE 验证](../evidence/desktop-installer-repaint-candidate-20261028.json)从新安装器解包，核对 304 个共享包及 17,257 个运行时文件，保留 Host 的 `command/run` 清除 blank 修复与投影 stateVersion 2。rc2.16 和 rich-inline 附带包摘要均与原候选一致。

新 EXE 解包内容通过隔离 profile 的 Electron Node 模式 smoke，包含原生依赖、CLI 插件安装／移除、Host 启动、Office 转换及 skill CLI。新旧应用 `lib/` 与 `renderer/` 的 27 个文件逐字节相同，应用元数据仅版本号变化。因此[六项原生 Electron 界面验收](native-electron-rc2.16.md)仍说明未变的外壳运行时；该轮解包验证未执行真实安装流程，也未对 `.2` 重跑六项界面操作。

本轮首次重打包因环境漏传已验证的 `DSH_DESKTOP_VCVARS32` 路径而失败，恢复显式 VS 2022 工具链路径后构建成功。两次独立目录及实际退出状态保留在汇总报告中。全仓 doc-sync 的既有 `acp --help` 超时未复验，不宣称全仓检查通过。

[改动保留检查](../evidence/installer-repaint-preservation-20261028.json)确认原生验收快照中的 79 个其他既有改动文件保持原字节，另外 5 个文档文件按本任务同步；打包前快照中的两个安装器源码也保持原摘要，没有暂存文件或意外的已跟踪改动。[进程及端口核验](../evidence/installer-repaint-process-cleanup-20261028.json)确认本轮隔离探针、构建／验证进程及 smoke 回环监听均已退出；用户自行打开的旧安装器不在清理范围。

## 剩余验收范围

手动安装、公开文件完整性、隔离原生启动及用户正常启动确认已完成；原配对恢复和控制面板插件激活仍未核验，附带 rc2.16 tarball 不等于已激活。权限持久处理的源码及原生回归通过，仍需纳入后续版本候选；启动来源登记可见性差异也未解决。未访问原 profile／配对，未改手机／中继或开启实机窗口，稳定连接、手机交互与模型任务继续等待明确授权和验收。
