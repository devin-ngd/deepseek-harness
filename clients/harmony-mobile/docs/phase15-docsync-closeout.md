# Phase15 文档验收收尾

本记录的范围是 v15 受影响文档与 `acp --help` 的退出诊断。当前状态为等待原生验收批准；没有修改产品代码、增加功能或重新封存既有制品。

## 诊断结论与证据

最初完整 `doc-sync` 中的 ACP help 超时上限为 30 秒；原并发运行已中止，保留的证据不足以重建当时的负载、依赖指向及启动状态，准确根因仍未确认。当前不能将超时确定归因于非交互等待、缺少构建产物或并发负载。

首次诊断在沙箱中被 isolated checkout 的 `realpath EPERM` 阻止。随后使用自有临时 DSH home、清除凭据的环境及 12 秒硬超时诊断。初版网络拦截器误拦已安装 tsx 的本地命名管道；该版结果不能作为正常运行依据。仅放行该既有命名管道、继续硬拒绝 TCP、HTTP 和网络监听后，打开 stdin 与立即 EOF 两种情况分别在 4.4 秒与 4.9 秒内打印帮助并正常退出，stderr 和外部 IO 均为零。[完整探针记录](../evidence/phase15-docsync-attempt-H3tJai/help-probes.json) 保留了退出码、信号、计时和独立超时标记。

原始生成器未改动，使用既有构建产物且没有重新构建；串行执行 `scripts/gen-cli-help.ts --check` 在 48.6 秒内完成 12 次帮助调用、生成 7 个去重页面并确认提交文档当前有效。每个帮助子进程沿用生成器原有的 30 秒上限，聚合诊断另有 300 秒上限；本次未触发任何超时、网络拦截或强杀残留子进程。当前证据不支持 stdin 修复，因此没有添加退出逻辑或扩大超时。

## 已验证范围

| 实际执行的检查 | 结果 |
|---|---|
| CLI help 新鲜度 | 7 个页面当前有效，12 次调用正常退出 |
| 持久化目录新鲜度 | 当前生成文件一致 |
| 持久化类型历史 | 65 roots 对应 15 条历史记录；`changes: []` |
| rich-inline README、持久化目录及 CLI help 双语配对 | 三对通过 |
| 文档类型等价检查 | 通过 |
| README Summary、Model Experience、Known Limitations | 三项通过 |
| CLI help discovery 与 ACP app startup 测试 | 7 个测试通过 |

上述九个命令的预算、退出码、耗时、外部 IO 和日志在[检查清单](../evidence/phase15-docsync-checks/checks.json)。这是受影响文档的有界验证，未重跑完整 `doc-sync` 聚合，不能声称全部文档门禁通过。没有再次调用 pnpm、安装依赖或运行真实模型。

## 依赖、制品及主仓保护

[保护复核](../evidence/phase15-docsync-preservation.json) 检查了 5,571 个依赖链接，整个收尾期间没有变化；24 个根 workspace 依赖均指向主仓对应包并匹配包名，指向 isolated checkout 的残留为 0。v14/v15 的五份封存 ZIP/HAP 与原始摘要哈希匹配，v15 ZIP 对应的 1,783 个源文件及独立 checkout 的 14 个补丁文件逐项未变。主仓原有修改、未跟踪测试、根 package.json 与 lockfile 内容均未变。

本记录、收尾日志和精确诊断程序作为独立补充文件保存；它们没有写入或替换既有 v15 ZIP、HAP、上游补丁或历史摘要。[收尾摘要](../evidence/phase15-docsync-closeout.json) 是本次验证范围与待批准状态的机器可读记录。

## 下一轮原生验收的最小批准范围

需要一次不超过 30 分钟的明确批准：使用现有 API26 Phone 模拟器的本任务实例，准备并核对一个独立 `local.dsh.mobile.netreplay` 未签名测试 HAP，临时安装且仅申请 INTERNET 权限；运行合成四响应 DSH replay BFF，监听本机临时 loopback 端口；最多同时存在一条 emulator `127.0.0.1:18081` 到自有 BFF 的 HDC 转发。服务重开若换端口，只替换这条自有映射，不增加转发规则。

批准范围需包括到期前预留清理时间、删除自有转发、关闭 replay 服务、卸载自有测试应用、停止本任务实例并复核释放；保留共享 HDC、其他 lab 资源及用户已安装 DSH。签名账户或证书、真机、输入法新声明、真实配对或持久访问凭据、公网／防火墙／隧道以及真实模型均不包含在这次批准中。

最小场景依次为：原生发任务及流式消息、rich 表单 action 后 source offload 保持可交互并回到正确合成会话；两段 clean follow 及短暂断线恢复，重复任务／action ID 不重派发；取消第四个固定挂起响应并收到终态；服务重开后恢复回执、草稿及 completed action，重派发为零且拒绝旧实例路由；未知 required 事件、截断／乱序／冲突保持只读且不提交无效游标；恶意 rich guest 无法访问 NetworkKit、任意宿主执行或未授权原生端口。

本次没有执行上述原生步骤。若批准窗口不足，下一轮应清理并记录未完成场景，不能自行延长期限；本地 Web 或 Node 测试不能替代 v15 ArkWeb、NetworkKit 或真机证据。
