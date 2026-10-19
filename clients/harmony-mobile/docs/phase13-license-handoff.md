# 原有许可的人工交互入口

本次没有打开DevEco许可页面。computer-use界面控制连续两次初始化失败，原错误为 `MXC launcher: cannot locate required Windows platform directory: HRESULT 0x80070003`，因此不能给出已经现场核实的Device Manager按钮路径。已安装DevEco和Emulator均保留；联网服务、模拟器与转发保持未启动。本记录提供官方实装help和已有完整交互记录支持的人工命令入口，不代用户执行许可命令或接受操作。

## 完整命令

在当前普通用户桌面的 **Windows PowerShell** 中运行下面这一行。Windows Terminal中明确选用PowerShell标签也可以；若用DevEco内置Terminal，先确认其shell为PowerShell。这是交互式官方工具调用，不需要管理员权限、工作目录切换或额外安装。

```powershell
& "D:\Program Files\HuaWei\DevEco Studio\tools\emulator\Emulator.exe" -license
```

命令不带accept、force、start、install或create参数，不含管道或自动输入。此工具版本为26.0.0.402；已保存的实装help明确提供 `-license [accept]`，其中accept会自动接受，因此本交接仅使用-license。证据见 [实装help与命令回执](../evidence/phase9-emulator-audit.json) 和 [人工入口核查](../evidence/phase13-license-handoff.json)。本次没有重新运行该命令。

## 停在哪个提示

同版本已有真实交互的首个提示如下，运行至这里即可停下；此时尚未发送接受输入。

```text
There are 2 license agreements that need to be reviewed.
Do you want to continue? (y/N):
```

如用户要展开第一份条款，仅在上述 **Do you want to continue?** 提示自行输入y并回车。已有完整交互记录确认这一步继续显示正文，随后会停在实际许可确认提示；它与下一步的“是否同意协议”不同。代理本次不输入y。全文后的实际提示为：

```text
Please read carefully and confirm whether agree to the above agreement? (y/N):
```

到实际确认提示后停下并通知父任务。两份预期协议名称为 **HarmonyOS Software License and Service Agreement**（已记录先显示，包含2026-06-28通用部分和2026-07-07 WATCH部分）以及 **HarmonyOS SDK License Agreement**（没有单独版本/日期）。进入后续一份可能需要先处理前一份确认，不要把阅读继续键当作可自动贯穿全部流程的输入。当前两份安装源文件已与先前批准副本逐字节核对相同，详见 [只读诊断](phase13-license-diagnosis.md)。本次不确认任一协议；其他账号、新条款、收费或系统安全提示也不确认。

## 中止

在任一等待提示按 **Ctrl+C** 即可中止。此前相同许可流程中Ctrl+C终止已记录，退出码为-1073741510；许可提示接受n或直接回车也会按默认N取消。中止后不要执行启动、下载或网络转发命令，先通知父任务。该官方许可流程会尝试读写用户许可配置，不能把-license或中止动作声称为持久状态的纯只读查询；本次正因如此只交接命令，没有代运行，也没有修改或复制.emu_config。

如果用户需要完成相同旧条款的人工确认，由父任务另行安排；当前交接只要求进入并识别许可提示，不要求用户重装SDK、迁移确认文件、创建另一实例或调整Hyper-V/防火墙。联网授权仍限原来单条临时rport最多30分钟，尚未使用，开始和截止时间均为空。
