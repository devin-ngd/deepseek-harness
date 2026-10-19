# 许可周期覆写来源：DevEco Device Manager 定时同步

已核实已安装 `device-mgmt-26.0.0.851.jar` 的覆写机制：`ProductConfigSchedule` 首次延迟 1 秒，之后按 1800 秒 fixed-delay 运行；其回调调用 `PrivacyUtil.refreshAgreement(null, null)`，由 `EmulatorUtil.refreshEmulatorConfigFile` 将两个协议字段写回同一个 `.emu_config`。本次只解析 class 文件字节，没有加载或初始化任何被检查的 SDK 类，也没有执行许可方法。

软件协议值取自 IDE 的 `DeviceManagerSettings.getIsConfirmPrivacyStatement()`；SDK 协议值取自 IDE 镜像目录下 `licenses` 目录的存在性。这两项会覆盖文件中的现有 CLI 确认状态。当前 `deviceManager.xml` 没有记录隐私确认字段，Java 默认值为 false；镜像路径为 `C:/Users/wpdev/AppData/Local/Huawei/Sdk`，其 `licenses` 目录不存在。该机制足以产生两个 disagree，与实际文件内容和约 30 分钟的修改周期一致。

相关长时间运行进程为共享 DevEco Studio PID59988，创建于 `2026-10-11T06:10:15.2741480Z`；其 fsnotifier 为 PID33664，共享 HDC 为 PID67100。没有发现活动的 Emulator 许可进程或本任务 Node watchdog；已知历史许可会话 ID2121/97570 均失效。按 SDK/vendor/task 名称筛选的计划任务无匹配，TaskScheduler Operational 日志未启用；不是全系统任务不存在的证明。

已确认的软件机制与本机配置、进程和周期证据高度吻合，实际文件写入 PID 仍属于关联推断，未取得逐次写文件审计。150 秒观察窗口未覆盖前一次 `02:40:56.095 UTC` 更新，记录的 SDK 进程稳定，没有把该窗口当作直接写入证明。[静态代码与调查数据](../evidence/phase16-periodic-writer/summary.json) 保存各证据位置。

最小停止方式是用户保存工作后正常退出 DevEco Studio PID59988，停止该 IDE 内的定时器；仅隐藏 Device Manager 面板不保证停止应用级 singleton。不要强杀 IDE、停止共享 HDC、禁用不明计划任务或修改 jar/标记。当前没有执行任何停止操作，需用户明确批准正常退出共享 IDE，或由用户自行退出。

随后只读确认周期覆写是否停止，再由用户决定官方的许可状态同步步骤。也可让官方 Device Manager 的确认状态与它实际使用的 SDK／镜像许可状态一致，但不能手改 XML、创建虚假 licenses 目录、复制标记或自动接受未批准的条款。本任务不再要求重复运行 CLI 许可问答。原生联网批准仍未使用，开始／截止时间为空，窗口为 0 分钟。
