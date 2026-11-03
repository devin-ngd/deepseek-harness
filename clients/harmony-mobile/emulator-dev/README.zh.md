# 本机鸿蒙模拟器调试

[English](README.md) | 中文

已配置的 Mate90 Pro Max 模拟器以独立的 `dsh-emulator` HUKS 身份与已安装的 `desktop` 配对。原生界面及 `ProductCore.js` 逐字节复制共用手机端源码与构建产物；模拟器专有改动只有本机中继地址和应用私有 CA 加载。共用修复通过同一源码进入后续真机构建，本轮不更新真机。安装的 HAP 和签名仍有区别。桌面适配器直接构建共用设备源码，仅隔离服务名和凭据；不提取旧安装包内部实现。[首次验证](../evidence/emulator-communication-20261102.json)保留原双向消息结果及失败。

已安装的桌面端和模拟器运行时，在 `clients/harmony-mobile` 中执行：

```powershell
python emulator-dev/resume.py
```

该命令恢复模拟器 `127.0.0.1:5555` 的 `18081` 端口到宿主回环 `17847` 端口的 HDC 反向映射，必要时启动本地桌面监听，并在模拟器应用已停止时打开它。沿用现有配对，不发送模型消息；命令成功表示准备完成，实际连接状态仍以应用为准。原真机配对和桌面配置行保留。凭据、TLS 私钥、生成包及验证文件放在 `.build/emulator-link`。

共用产品配置使用 `continuous` 前台跟随：正常读流续订不再耗尽总段数，连续八次传输失败仍会停止读流；有限夹具仍可选择有总段数限制或仅读取一次的策略。新通道会重新打开上次选中的仍可见会话，只恢复历史和跟随读取，不重放消息或其他修改操作；草稿在重连期间仍属于原会话。原生 Socket 清理识别已确认的关闭和打开前被拒绝的 HTTP 升级，未确认释放成功的情况仍禁止复用。[稳定性验证](../evidence/emulator-stability-20261102.json)记录实际时长、新建、消息和恢复结果。存在未发送草稿或运行中任务时不要关闭应用。后台运行和完整富内容交互仍需分别验收。

`prepare.mjs` 从当前源码构建本地适配器，并以 `.build/native-controls-device-rc2-32` 准备新的原生工程；`--desktop-only` 仅重建适配器。`build-native.mjs` 调用现有共用产品构建器，将核心、页面和富内容资源复制到已有模拟器候选。桌面适配器、本机中继与原生候选统一从 `product.config.json` 读取容量，保留模拟器身份、CA、房间期限与帧数配置。随后用 `node scripts/build-native.mjs --project=.build/native-controls-emulator-local` 编译，以 `python emulator-dev/control.py install` 原位更新模拟器。`install-desktop.py` 是已执行的一次性配置，检测到已有安装会拒绝；日常调试使用 `resume.py`。更新桌面适配器需要重新加载其 Host，仅关闭窗口可能保留旧 Host。`control.py` 只操作模拟器，提供依据当前布局的界面操作及显式验证命令。

[整合验收](../evidence/mobile-coordinated-20261102.json)记录桌面 rc2.33、4 MiB 历史预算和共用稳定性修复的安装结果。已验证旧大历史与富内容显示、返回测试会话后发消息、原生停止及自然续接；真实模型取消确认仍可能等待几十秒。桌面输入区常驻面板已移除，新的设置入口通过完整 Web 外壳验证；安装版 Windows 设置页尚未完成实际点击验收。模拟器不代替真机的内存、耗时、后台和硬件验收。
