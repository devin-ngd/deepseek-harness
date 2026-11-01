---
kind: reference
description: rc2.16 桌面控制面板的离线构建、交互验证、候选包与实机边界。
---

# rc2.16 控制面板离线候选

## 摘要

rc2.16 通过原 Session 的正式命令 API 提供七项连接控制，挂载不创建 Session、不连接中转、不发送模型消息。候选仅供后续独立部署审核；已安装桌面仍为 rc2.12，手机最后实测为 rc2.15。原配对、撤销历史和已消耗窗口的证据保留在 [10 月 28 日交接](HANDOFF-2026-10-28.md)。

## 构建输入

[投影输入准备器](../scripts/projection-inputs.mjs)把 retained 的三个解释器和当前共享源码按原字节生成到 `.build/projection-inputs-<摘要>/`，并记录每个原文件及摘要。解释器依赖的类型、校验、authored、limits 和 usage 仍与 retained 基线逐项核对；当前 guest SDK 直接取自主仓，不要求与未消费的 retained SDK 相同。原目录及 `source.json` 均只读。生成目录先完整写入私有暂存目录，再原子发布；并发构建验证同一份完整快照，已有文件被修改时拒绝，不覆盖。

registry 的两处既有泛型擦除检查保留。安装版 API 检查仍直接消费本机安装的 rc.2 / protocol4 公开模块，不用 retained 源码替换安装依赖。源码类型检查显式解析当前已安装的 Vitest 声明，供历史源码测试引用使用；无需给 retained 目录安装依赖。

## 离线交互

[浏览器验证入口](../scripts/check-control-panel-browser.mjs)使用临时 Chrome 配置，加载正式客户端工厂、官方 QuestionComposer 和 renderer 的订阅绑定，调用隔离 Host 的正式命令服务。Host 使用已安装公开模块、公开夹具密钥和内存凭据，relay mount 是无网络替身。页面请求被测试驱动拦截，不访问真实中转。测试结束关闭浏览器、等待命令结算并销毁临时 Host。

14 项交互检查覆盖 retained 空会话状态查询、正常批准与取消、重复点击阻止、非法回执本地拒绝、签名夹具回执的 Host 校验、连接与手动重连、本地停止、会话切换、语言切换、组件重挂载和插件卸载；浅深主题分别检查 360px 和 900px 宽度。未选择 retained Session 时面板不挂载，也不自动创建会话。截图仅含合成信息。

这些组件检查不运行完整 DSH 外壳；完整外壳的补测范围与缺口见下节。DPAPI、手机 HUKS、ArkWeb、TLS、稳定连接及实机富交互均未验收。

## 完整 Web 外壳补测

[外壳验证入口](../scripts/check-control-panel-shell.mjs)使用仓库正式 Web scaffold，启动完整 `dsh-base` 与 `dsh-web-app`，通过真实 HTTP 和 `/api/remote.mux` WebSocket 操作正常客户端。临时 profile 的名称和目录选为 `desktop`；候选包复制到隔离目录，补充 rich-inline 依赖联接，108 个包文件逐项保持原摘要。当前已通过正式 `build:official` 重建完整 Host、Desktop、Client 和 Web 产物，再次通过六项外壳场景；[完整桌面候选](desktop-hostfix-candidate-20261028.md)还完成实际 EXE 解包核验和隔离运行时 smoke。后续[原生 Electron 六项离线验收](native-electron-rc2.16.md)使用独立 profile、真实候选命令及合成密钥，候选字节和原配对保持原状。

客户端来自 rc2.16 候选包；设备命令使用当前源码及公开夹具密钥，只有身份解保护替换为离线夹具。凭据、配对和会话均属临时 profile。确认由完整外壳实际启用的 rich-inline 界面和正常 Remote answerer 完成，没有注入自动回答器；测试不点击连接或重连，不打开中转。当前修复与验收见[会话导航修复报告](../evidence/control-panel-shell-rc216-navigation-fix.json)；[初次补测报告](../evidence/control-panel-shell-rc216-closeout.json)保留修复前的缺口和环境失败。

| 场景 | 当前证据 |
|---|---|
| 无工作区首页 | 正常默认工作区初始化前不挂载面板；初始化后自动进入 retained 空白会话。测试用屏障同步初始化请求，避免检查启动瞬态 |
| 空白会话入口 | 面板可展开；挂载不发命令，状态查询正常 |
| 正常确认 | Deny 和 Allow 均通过实际界面；拒绝后锁定变更，显式本地 stop 后解锁；允许后只生成合成 route offer |
| 会话并发 | A 等待确认时，B 命令被 Host 串行锁拒绝，没有转交给 A |
| 仅执行命令的会话切换 | A 的侧栏入口保留；打开 B 后可返回 A 的同一次等待确认，重复请求数为零 |
| 已有聊天会话 A→B→A | 使用仓库原有录制 Session；等待确认时草稿和请求锁恢复，结果只进入 A 的命令记录，B 不接收 A 的结果 |
| 关闭确认框 | Return to conversation 不授予 route；面板拒绝后锁定变更，显式本地 stop 后恢复 |

[会话列表投影](../../../packages/api/session-controller/src/list.ts)在已提交的 `command/run` 或 `turn/start` 后清除列表 blank，未操作的配置草稿仍保持空白。状态版本提升为 2，使旧缓存失效；侧栏组件和 Session 日志格式保持原实现。回归覆盖命令等待期间、拒绝结果和无模型 turn 的日志快照。该修复已进入完整桌面候选，并从实际 EXE 核对；原 rc2.16 插件包自身不包含 Host 改动。

等待中的命令会保留其会话作用域，往返时恢复相同确认和草稿。已结束的请求在最后一个本地引用释放后，面板局部显示随作用域重建；原结果仍可在该 Session 的持久命令记录中查看。返回不会自动查询或重试，后续控制需显式操作。完整外壳快照固定已有录制会话的命令显示和可返回的等待会话行；不添加常驻会话缓存。

初次补测中的 Chrome `ERR_INSUFFICIENT_RESOURCES`、分页文件不足和截图超时保留在历史报告中，不作为通过证据。当前六项离线场景已完整运行通过，browser、设备夹具和 scaffold 的关闭均已等待；WebSocket close 回调仅表示观测到该事件，浏览器关闭以已等待的关闭操作和断开状态为准。

主仓 Host／Client 构建检查、193 项定向回归、221 模块严格检查和类型感知 lint 通过。全仓 doc-sync 首轮通过 39/43 项，三个沙箱权限失败项在宿主单独复跑通过；CLI 帮助检查中的 `acp --help` 子进程仍在 30 秒后超时，不计为通过。附加 pnpm 检查固定使用 11.28.5，并设置进程环境 `pnpm_config_verify_deps_before_run=error`，依赖状态异常时拒绝命令，避免隐式安装。本轮额外检查曾误触发自动预安装，已按原锁文件从缓存离线恢复并补齐命令入口，随后 193 项回归和六项外壳验证再次通过；锁文件、80 个已有改动文件和六个构建入口的恢复核对见当前报告。

## 检查与打包

在 `clients/harmony-mobile` 运行以下离线入口。具名报告采用排他写入；保留旧证据，重新运行时选新的报告名。

```powershell
node --test tests/projection-inputs.test.mjs tests/controls-test-result.test.mjs
node scripts/product-check.mjs
node scripts/test-rc2-controls.mjs --report evidence/rc2-controls-tests-rc216-final.json
node scripts/check-installed-rc2.mjs --report evidence/rc2-controls-api-rc216-final.json
node scripts/check-control-panel.mjs
node scripts/check-control-panel-browser.mjs
node scripts/check-control-panel-shell.mjs
```

controls 运行器为每轮分配独立配置、编译助手和缓存；reporter 缺失或无效时仍保存原输出和失败报告，分别记录退出码、信号、超时及启动失败。空报告或被终止的进程不能成为通过证据。生成包要求当前版本的 API、五项 controls 和客户端检查通过，并复核 API 与客户端输入摘要。

完整候选位于 `.build/artifacts/dsh-experimental-harmony-mobile-0.0.0-rc2.16.tgz`；[产物清单](../evidence/rc2-controls-artifacts-0.0.0-rc2.16.json)记录包摘要、逐文件摘要、源码输入和资格报告。打包后分别运行安装版 Host 的打包入口 smoke、打包客户端反馈／禁用载体检查，以及 `check-control-panel-browser.mjs --package` 的同一组浏览器交互断言。该包已按独立授权完成[实际更新、device 启用和离线核对](rc216-installation-20261029.md)。

## 后续验收

后续独立审核包含 Host 修复的完整候选、部署范围与原绑定；原生 Electron 和合成固定密钥的 DPAPI 离线路径已验收，原身份及实机连接未在本轮访问。新实机窗口以握手阶段、连接保持和关闭首因为首要目标；连接稳定后才依次验收会话隔离、消息同步、重连及 ArkWeb 富交互。旧批准和已撤销 route 均不可复用；本地 stop 不代替中转持久撤销。
