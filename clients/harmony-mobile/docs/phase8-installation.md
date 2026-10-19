# DevEco 安装状态与下载历史

2026-10-11用户已通知安装完成并打开IDE。已确认实际目录 `D:\Program Files\HuaWei\DevEco Studio`，DevEco26.0.0.851、SDK26.0.0.105/API26和Hvigor/plugin6.26.8；真实ArkTS及unsigned HAP构建成功。当前状态见 [原生构建](phase8-native-build.md) 和 [汇总](../evidence/phase8-native-build-summary.json)。不再等待旧UAC，不重装或重新下载；GUI首启和导入仍未获得可读证据。

以下是安装完成前的下载/UAC历史，原始证据保持不变。历史中的“等待UAC”“未安装/编译”仅说明当时状态；当前工具与构建结果以上方链接为准。安装批准不扩展为新许可接受、签名、设备调试、虚拟化或安全设置。

用户已明确批准安装华为官方 DevEco Studio 26，以及本任务必要的官方 SDK/构建组件。完整安装包已下载并核验安装程序华为签名有效，安装启动后等待 Windows UAC 人工步骤。尚未观察到实际安装选项或新安装许可，`harmony/platform.json` 实装字段仍为 null；没有新的 ArkTS/Hvigor/HAP/模拟器证据。此批准不扩展为新协议接受、账号或凭据读取、签名、手机调试、虚拟化、防火墙、长期授权或公网部署。

本轮检查 PATH、三处安装注册表中匹配 DevEco 的记录和七个相关工具/SDK目录，未发现已有 DevEco；沙箱阻止注册表/DNS 后分别做了只读窄 host escalation。未全盘扫描或读取账户配置。机器为 Windows 11 x64（10.0.26200），约32GB内存、22逻辑处理器，D盘检查时空闲175,799,787,520字节（约164GiB），C盘空闲60,690,018,304字节。官方下载首页列出 Windows10/11 64位、内存16GB以上、硬盘100GB以上和1280×800以上分辨率；已核对OS/内存/磁盘，未独立测量显示分辨率。来源：[官方 DevEco Studio 页面](https://developer.huawei.com/consumer/cn/deveco-studio/)。

用户已在本任务独立 Chrome 完成登录并通知。同一窗口已返回 [官方下载中心](https://developer.huawei.com/consumer/cn/download/)，公开卡片实测为 DevEco Studio 26.0.0 Release、Build Version26.0.0.851、发布日期2026/09/23，Windows64位包标示3.1GB。没有读取账号身份、输入框、Cookie、token、认证header或storageState，没有导入用户已有浏览器资料或建立持久登录授权。登录状态的证据限于用户通知及同一窗口实际公开页面，不能据此确认账号身份。

下载由已观察的 Windows 官方包控件启动，过程中未观察到新 EULA，也没有代理接受协议。Chrome显示“3.1GB · 完成”，临时文件完成更名、大小为3,295,837,057字节；完整ZIP已另存至 `D:\Temp\dsh-harmony-official-20261011-deveco-studio-windows-26.0.0.851.zip`，浏览器到期不会删除它。文件名由agent选定，不能冒称官网建议文件名；本地SHA-256、包内EXE路径、签名和版本详见 [下载与UAC证据](../evidence/phase8-download-and-uac.json)。没有使用未完成的 `.crdownload` 安装。

包内安装程序已独立保存至 `D:\Temp\dsh-harmony-official-20261011-deveco-studio-26.0.0.851.exe`。Authenticode状态为Valid，签署者Huawei Technologies Co., Ltd.、GlobalSign签发、Sectigo时间戳，文件描述为DevEco Studio Windows Installer，文件版本261.23567.138.36.2600851，与官方卡片一致。官方SHA控件只复制摘要；自动审批拒绝系统剪贴板读取，理由是来源未获验证、可能包含敏感信息。没有执行或绕过该读取；官方摘要比对和PGP核验仍未完成，不能把本地hash或有效EXE签名写成官网摘要匹配。

安装程序PID63540于03:48:35UTC启动，Windows权限提示进程consent.exe PID55920于03:48:36UTC创建。当前启动窗口只有占位控件，未进入安装选项；时间关联支持UAC等待判断，安全桌面未被读取，具体提示仍须用户本人核对。用户需确认提示指向本次官方DevEco安装程序、发布者为Huawei Technologies Co., Ltd.，允许后通知任务；agent没有代点提权，也没有另启第二个安装程序。新EULA若出现，立即提供准确名称、提示与官方链接并等批准，不能把既有安装许可扩展为条款接受。

内置CUA仍在初始化前退出，旧错误为缺少Windows平台目录HRESULT0x80070003；本地文件控制器也无法唯一定位实际卡片。公开卡片读取、Windows下载及状态检查使用Windows内置UI Automation，仅限自有Chrome进程。没有增加控制端口、扫描私人文件或读取其他浏览器。当前Chrome及临时控制器的状态和到期时间见 [交接数据](phase8-login-handoff.md)。

工具到位后继续 [原生首轮构建](native-first-build.md)：记录实际IDE/SDK/API/Hvigor/plugin版本、核实官方SDK声明、生成unsigned配置并构建当前v7；优先不签名的构建和官方支持的preview/模拟器流程。若模拟器需要新协议、镜像登录、Hyper-V/虚拟化或防火墙变化，分别报告并等批准。保持共享协议逻辑、固定replay和现有测试；不调用真实模型、不执行用户任务或上传Session，也不启用配对、公网中继或签名账户。

首次匿名登录停点保留为 [历史证据](../evidence/phase8-installation-blocked.json)，当前状态以下载与UAC证据为准。本轮仓库写入仅为此客户端的文档和证据，源码与v1–v7备份未改；没有提交、push、重启或修改已安装DSH。UAC完成后继续当前安装实例；不要重新下载完整包，也不要重新启动另一个安装程序。
