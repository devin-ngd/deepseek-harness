---
kind: reference
description: 会话列表改造 rc2.32：手机新建/归档/置顶会话，最近与项目双视图，原机逐项验收结果及已知限制。
---

# 会话列表管理 rc2.32

参考 Codex、Claude Code、Cursor、GitHub Mobile 和 Happy 的会话列表，本轮给手机端加上完整的列表管理：最近／项目双视图、搜索、全部／运行中／已归档筛选、项目分组折叠、行内置顶与归档菜单、先选项目的新建弹层、组内新建，归档会话只读横幅加一键取消归档；无标题会话显示“新会话”，空会话不在列表出现。

协议扩展免重新配对：载体 metadata 增加 projects（不含路径）和行扩展字段（updatedAt/running/pinned/archived/blank），新增 manage 方法承载 create/archive/unarchive/pin/unpin。授权沿用已认证连接 ticket 和全部可见会话范围，不扩大配对签名操作集；代价是任何持有有效 ticket 的已配对手机在 ticket 期限内都能执行这五种列表管理（仍不能发消息或读历史，读取路径未变），ticket 过期或撤销即失效。旧桌面缺少扩展字段时按空闲、未置顶、未归档、非空、时间未知填充；缺少 projects 时整表只读，manage 被拒绝。桌面端实现复用 sessionController 与 workspaceRegistry，归档调用既有的 archiveSession（stopActivity），不经过 Host 原始接口。

构建与安装：桌面插件以 rc2.32 覆盖安装（安装前备份保留在部署目录），手机用原签名材料原位更新到 rc2.32，UID 20020297、配对与数据不变；中继保持 rc2.30、connectionMode paired。检查通过：桌面与手机 TypeScript 编译、check-device-binding 21/21、check-phone-diagnostics 47/47、手机页面测试 33/34；既有失败保留：集成测试两处断言来自前轮提交、偶发取消时序、mvp-page 与 native-source 仍在断言旧页面，均非本轮引入。

真机逐项验收（全部通过，双端证据）：手机新建无项目会话，桌面出现对应 Session 目录；项目分组内新建 jl707_custom 会话，Session 落在该项目工作区；置顶后行首出现图钉且提前，取消置顶恢复原序，pinnedSessionIds 在桌面 workspace.json 同步增减；归档后从“全部”消失、出现在“已归档”，桌面 archivedSessionIds 同步；归档会话页显示只读横幅与“取消归档”，输入框提示已归档且发送禁用，取消归档后回到“全部”；搜索“MVP”只保留两条匹配；分组折叠隐藏组内会话。全程未发送任何模型消息。

已知限制：手机锁屏或退后台后载体连接被系统挂断，表现为 connection-cleanup-failed 或 follow-budget-exhausted，需要重开应用；亮屏前台期间连接稳定（桌面到中继的空载 TCP 观察 160 秒无断开），此前归因于中继或代理的约 75 秒断连主要发生在手机锁屏窗口内。手机端没有后台保活，属于产品级取舍，本轮未动。用户在桌面找不到 /device 命令或面板，但设备组件与自动连接实际在运行，命令缺失原因未查。桌面留有本轮验收产生的两个空会话（一个无项目且仍置顶、一个在 jl707_custom），可在桌面端取消置顶或删除。验收期间息屏时间用 power-shell 改为 10 分钟，恢复原值的命令被设备拒绝，重启手机后还原。“运行中”筛选只有预览包覆盖，真机未单独点击。

现场与证据保留于 handoff/deploy-rc232-20261102/：签名日志 sign-journal-*.json、安装报告 phone-install-*.json 与 desktop-installed.json、桌面更新计划 desktop-update-plan.json、真机布局 layouts/ 与截图 shots/、各验收序列 seq-*.json。
