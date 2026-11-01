---
kind: reference
description: 包含命令会话导航修复的完整 Windows 桌面候选、离线构建输入和验收证据。
---

# Host 导航修复桌面候选

## 当前状态

安装验收现使用[安装器修复候选 `.2`](installer-repaint-20261028.md)。下述 `.1` 包保留构建与运行时证据；其安装器存在已复现的同步重绘寄存器覆盖问题，会误拒绝正确原目录，不再作为安装验收候选。

完整 Windows x64 未签名桌面候选 `0.2.1-rc.2.20261028.1` 已生成并通过解包验证；版本号由用户确认。[EXE](../../../apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/deepseek-harness-0.2.1-rc.2.20261028.1-win-x64-unsigned.exe) 为 288,384,497 字节，SHA-256 为 `7d500fa3877af75d39dbabe0a9642acf49bfdd3a6758959f5ab4da47a21185a1`。本轮未安装、部署或开启实机窗口，原配对及实机状态以[主交接](HANDOFF-2026-10-28.md)为准。

[收尾汇总](../evidence/desktop-hostfix-closeout-20261028.json)汇集构建、定向测试、实际产物和关闭结果。[改动保留检查](../evidence/desktop-hostfix-preservation-20261028.json)核对原有快照的 80 个文件：78 个保持原字节，2 个按本任务同步当前文档，没有意外变化；根锁文件与产品清单保持不变。[进程及端口核验](../evidence/desktop-hostfix-process-cleanup-20261028.json)确认本轮关联进程和三个 smoke 回环监听均为零。

## 构建输入

当前 `lumina` 改动保留；产品清单仍为 `0.2.1-rc.2`，候选编号仅通过构建环境传入。主仓正式 `build:official` 九个步骤通过，包含 Host、Desktop、Client、Web 产物及两侧汇总检查。新增构建脚本改动后的 `build:check` 再次通过；本轮没有更改根锁文件、根 package.json 或全局 pnpm 配置。

旧目标目录先通过 17,267 个文件的完整摘要校验，再保留为独立目录；原路径和保留路径见[构建输入记录](../evidence/desktop-hostfix-candidate-inputs-20261028.json)。新的 304 个第一方运行时包来自当前源码构建。生产依赖使用复制到任务目录的 pnpm store 和 v12 注册表缓存，以现有 npmmirror 缓存来源解析，563 个包离线安装完成，下载数为零。实际解析出的锁文件、工作区配置、包集合及补丁保存在本轮 `.build` 下的 `resolved-closure`。

Electron 44.7.0 缓存使用锁定 npm 包自带的校验值验证，不跳过校验。`prepare:dsh --offline --store-dir <绝对路径> --cache-dir <绝对路径>` 将锁文件解析和生产安装都限定为离线，缓存缺项明确失败。相对路径、离线标志缺失和未知选项均已实际拒绝，见[四项参数检查](../evidence/desktop-hostfix-offline-options-20261028.json)。该参数只控制运行时准备；其他阶段使用现有本地缓存，详见[桌面打包说明](../../../apps/desktop/packaging/README.zh.md)。

## 离线证据

[正式构建日志](../evidence/desktop-hostfix-build-official-20261028.log)和[最后一次构建检查](../evidence/desktop-hostfix-build-check-smoke-final-20261028.log)保留实际退出结果。233 项定向测试首轮为 232 项通过、1 项 5 秒超时；失败文件及新增 Electron 校验参数所在文件在原时限下复跑 11 项全部通过，分别见[首轮报告](../evidence/desktop-hostfix-focused-tests-host-20261028.json)及[局部复跑报告](../evidence/desktop-hostfix-runtime-leaf-20261028.json)。沙箱缓存 rename EPERM 的零执行结果另外保留，不计为测试通过。

完整源码重建后，[六项 Web 外壳验证](../evidence/control-panel-shell-rc216-1793169062476.json)再次通过，包括空白首页、命令会话侧栏入口、已有会话 A→B→A、实际 Allow／Deny 确认和关闭确认框；所用 rc2.16 插件仍保持原摘要。浏览器、夹具和 scaffold 均已等待关闭。该证据属于完整 Web 外壳，不代表原生 Electron 窗口或手机验收。

## EXE 内容与运行时

[最终产物验证](../evidence/desktop-hostfix-candidate-20261028.json)从实际 EXE 解包，不执行安装流程。归档内会话控制器 `lib/index.js` 与本轮构建逐字节一致，包含 `command/run` 清除 blank 和投影 stateVersion 2；模块 SHA-256 为 `e3362a5b3cd4bf1d9ecc7b75bdff54e25cb278ae92c44928cd285fb9de8f010e`。304 个共享包、17,257 个运行时文件及其解包成员均通过完整清单核对。

打包前、组装后的应用目录和实际 EXE 解包目录分别完成运行时 smoke：Node 24.21.0、pnpm 11.28.5、Koffi、Sharp、HTML、PTY、ripgrep／glob、CLI 插件安装与移除、正式 Host 启动、插件 API，以及 DOCX／XLSX／PPTX 转 PDF 和 skill CLI 路径均通过。全部使用临时 profile 和回环服务，并等待 Host 和资源关闭；这些 smoke 属于 Electron Node 模式，后续原生窗口资格见[独立验收](native-electron-rc2.16.md)。最终验证后 EXE 摘要保持一致。

额外资源 `harmony-mobile-candidate` 附 rc2.16 插件及 rich-inline 0.2.1-rc.2 tarball。rc2.16 插件保持原有 `44335cb027b3f16ae42a0c2ce225e6c8a544f5bcc587152c76d3f2352fdc70c1` 摘要；两包均未自动激活，现有 profile 保持原状。未签名候选关闭本地更新策略，不生成发布完成记录。

## 失败记录与剩余范围

首次生产准备完成安装和功能检查后，在目录夹具链接的清理阶段长期未退出，已停止该进程并保留失败记录。smoke 改用通过正式 API 安装的本地 tgz 夹具后，已封存生产目录重新通过前后完整摘要核对和全部 smoke，并正常关闭；组装目录及 EXE 解包目录随后也通过同样检查。首次解包验证脚本的 Windows ASAR 路径错误记录另行保留；最终验证报告为独立的成功结果。

前轮全仓 doc-sync 的 CLI 帮助检查留有 `acp --help` 30 秒超时记录；本轮未复验该全仓门禁，不宣称其通过。用户调整 Medium 后，[原生 Electron 六项离线验收](native-electron-rc2.16.md)已通过，临时 profile 激活候选插件，21 个检查点、正常退出和候选字节核对均已保存。安装、稳定连接、手机富交互及实机接受仍需后续独立授权和验收；旧联调批准不可复用。
