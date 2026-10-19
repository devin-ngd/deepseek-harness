# Emulator 许可重复回退：只读调查与检查修复

phase14 的手动确认和原生联调成功证据有效。今天 `disagree` 的状态不能否定昨晚的成功，也不足以直接要求用户重复接受。已修复我们自己的危险状态检查；今天状态回退的具体写入者尚未定位，第二轮联网授权仍未使用。

## 已证实的时间线

| UTC 时间 | 事实与证据 |
|---|---|
| 10-11 07:42:49 | 旧自称只读的 audit 调用 `-license`，stdin 为 ignore，回执含 `License check aborted by user`；没有前后许可快照 |
| 10-11 08:43:18 | 旧自动确认 helper 因文本比较不匹配退出，实际接受输入为 0；保留的运行没有进入 postAcceptance 分支 |
| 10-11 15:10:48 | phase13 记录过相同 disagree 文件；时间与许可取消接近，缺少取消前快照，不能证明因果 |
| 10-11 16:11:14 | 用户手动确认后，75 字节文件的两项均为 agree，SHA-256 为 `4bc31a223ddc953bbddd05fed2f7d88b8f00fdf800de7647a0ea33eb4ccbefe4` |
| 10-11 16:18:36 | phase14 对同一官方文件只读确认 agree/agree，随后实际完成原生合成任务与 rich action |
| 10-11 16:36:15 | 清理记录调用正常 `-stop DSHOfflineAPI26 -instancePath ...`，没有 `-license`、accept 或显式写许可文件；缺少停止前后的许可快照 |
| 10-12 00:40:53 | 本轮首次观察到的 disagree 文件修改时间；79 字节，SHA-256 为 `af14c58a6c54417d5fca45d8524349a3a10c2d343a11f180e6b18377a63c0290` |
| 10-12 01:07:52 | 实际宿主读到同一文件和上述状态 |
| 10-12 01:10:53 | 同一 disagree 内容的修改时间又推进；这是元数据变化观察，不能据此识别写入者或认定首次回退时刻 |
| 10-12 01:24:33 | 修复后的审计在全部子进程 API 被硬拦时完成，文件哈希和修改时间前后相同 |

[完整调查记录](../evidence/phase16-license-forensics.json) 连接各时点的源文件、命令、已知事实和证据缺口。官方实例日志使用本地 UTC+8，最后的 `00:36:17` 对应 phase14 的 `16:36:17 UTC`，不是今天的新一次模拟器启动。

## 路径和用户环境

实际配置位于 `C:/Users/wpdev/AppData/Local/Huawei/Emulator26.0/.emu_config`，创建时间为 `2026-10-11T06:10:40.059Z`。两个已知字段是 `HarmonyOS_Software_Service_Agreement` 和 `HarmonyOS_SDK_Agreement`，均为 disagree；没有复制原始配置文件。

当前宿主与沙箱的 SID 散列相同，USERPROFILE 均为 `C:/Users/wpdev`，sessionId 均为 1。沙箱 LOCALAPPDATA 指向 sandbox 包目录，宿主指向 `C:/Users/wpdev/AppData/Local`；实读官方配置路径与 phase14 记录相同，尚未发现另一个被使用的用户配置。phase14 没有保存 SID，因此当前相等不能证明所有历史进程身份相同。

## 确认的自动化问题与修复

旧 [audit 脚本](../scripts/audit-native-emulator.mjs) 不仅读取文件，还运行 Emulator 的 help/list/imageList/license 命令，其中 `-license` 加关闭 stdin 明确进入了取消路径，不能称为只读。现在 audit 完全不启动 Emulator，也不运行任何子进程；只读取已安装公共元数据、协议文件摘要及显式选择的许可路径，写入新的时间戳证据文件，保留旧 phase9 回执。

许可路径必须通过 `--license-file` 明确提供，不再根据重定向的 LOCALAPPDATA 选择另一个 profile。字段缺失、重复、值未知、文件不可读或读取期间变化均报告未确认状态，不默认为 agree，不修复或复制标记。[共享文件审计实现](../scripts/emulator-metadata-audit.mjs) 保存底层读取失败原因。

旧自有 Temp 自动确认 helper 的 postAcceptance 分支会再次调用 `-license` 并送 EOF。这是另一处危险检查，现已保存原始源码并将旧入口改为立即报错退出；本轮没有执行原始逻辑。其历史回执显示该分支未到达，不能用此源码缺陷解释今天的具体写入。[禁用记录](../evidence/phase16-license-forensics/legacy-helper-retirement.json) 保存原始与替换摘要。

相关离线测试为 8 个，通过 agree/disagree 文件不变、坏字段拒绝、显式路径、缺失文件、官方混合 profile 元数据、缺失协议文件及硬拒绝所有子进程的实际 CLI 场景；[TAP 结果](../evidence/phase16-license-forensics/audit-tests.tap) 保留实际执行。实际安装元数据 audit 同样在 spawn/exec/fork 全部拒绝的条件下通过。未重跑模型、原生执行或不相关的完整客户端回归。

## 仍缺少的证据

取消／EOF 写回 disagree 与现有历史观察相符，但没有今天 `00:40:53` 或 `01:10:53` 的调用记录及写文件进程证据，不能将其定为本次根因。phase14 的清理脚本没有显式许可操作，正常停止的内部副作用也未通过前后快照验证，不能断言它造成或没有造成回退。

只查询上述时间范围内 Emulator.exe 的既有 Windows 4688 事件时，沙箱及现有宿主权限都返回 UnauthorizedAccessException；没有开启审计或更改权限。父任务读取接口返回 0 个 turn，未取得该时段原始调用记录。故当前仍缺少准确写入者和首次状态变化时点，不能把文件最后修改时间当作完整因果证据。

## 避免再次重置的最小流程

只读检查使用下面的文件审计，不执行 Emulator CLI 查询，不通过 n、EOF、Ctrl+C 或重复进入许可问答来判断状态。命令不改变官方配置或条款状态。

```powershell
node scripts/audit-native-emulator.mjs --license-file C:/Users/wpdev/AppData/Local/Huawei/Emulator26.0/.emu_config
```

许可回退原因调查完成且同一实际宿主文件恢复到稳定有效状态后，沿用尚未使用的联网测试授权。后续仅在正常、已授权的 start/stop 前后保存 SID 散列、明确路径、文件摘要与修改时间，补齐当前缺口；不再追加 `-license` 状态探测。出现新的许可提示就停止依赖工作，不自动接受、取消问答或改标记，也不自行扩大安全权限。

当前既有封存和主仓原有修改保留，官方许可文件从修复审计到最终复核未变。没有启动模拟器、安装应用、建立 BFF 或转发；联网窗口仍为 0 分钟。不要求用户重复接受，也没有提供绕过许可的方法。
