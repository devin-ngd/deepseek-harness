# 第十批：官方模拟器原生离线验收

2026-10-11在既有DevEco26.0.0.851、SDK26.0.0.105/API26、Hvigor/plugin6.26.8、Emulator26.0.0.402及hdc3.2.0f上编译、安装和运行unsigned HAP；没有重装工具、签名、真实模型、上传或操作已安装DSH。本批只写客户端目录。完整记录见 [汇总](../evidence/phase10-summary.json)、[镜像与许可回执](../evidence/phase10-emulator-setup.json)、[HAP核对](../evidence/phase10-hap.json) 和 [完整回归](../evidence/regression-final-regression-final-EZhVW6/summary.json)。第九批封存文档、ZIP和HAP保持原字节。

用户单独批准了审阅过的两份官方许可、API26官方Phone镜像及unsigned模拟器安装/执行。本轮交互式接受恰好两份许可，工具退出0；接受记录及完整原文保存在本任务Temp审阅目录。官方 `-license` 在接受后仍列出两份协议，不能用它判定“未接受”；有效证据是实际确认回执和后续镜像安装/启动。没有把该授权扩展到输入法、手机、账户、网络权限或安全设置。

镜像目录为 `D:\Temp\dsh-harmony-images-api26-20261011`，官方Phone包下载2090038765字节并完成解压；catalog为HarmonyOS7.0.0(26.0.0)、software7.0.0.107 Release，guest报告7.0.0.107(SP8)。镜像元数据abi为x86，实例CPU配置为x86_64，分别保留原值。目录含厂商签名侧文件，但本任务没有独立验证镜像签名或计算整包哈希。

隔离实例 `DSHOfflineAPI26` 位于 `D:\Temp\dsh-harmony-hvd-api26-20261011`，1080×2340、density480、360dp、6.5英寸、4GB内存、8GB存储、cold boot/noWindow。已存在的Windows Hypervisor Platform可用，未修改虚拟化或防火墙。创建时写IDE设备管理配置的警告未阻止启动，未修改用户IDE配置/ACL。仅本任务调试监听127.0.0.1:16311；复用已有共享hdc服务8710。只检查了已知hdc身份文件的旧时间/大小元数据，没有读取、复制、输出或生成密钥；这不构成工具内部密钥行为的完整审计。

| 层与路径 | 实际证据 | 资格限制 |
| --- | --- | --- |
| ArkTS/ArkUI与HAP | 官方CompileArkTS/assembleHap成功；744145字节unsigned HAP，modules.abc为150084字节；hdc安装及Ability启动成功 | 模拟器安装；未签名、未安装真机 |
| 本地ESM/私有port | HAP白名单/hash资源→真实ArkWeb模块→core-ready→ArkUI会话选择；页面完成地址及controller地址分别记录 | 仅官方API26实例；最低兼容API、其他设备未执行 |
| 合成任务/流式 | native选择A、发送固定任务；日志running→completed、0→4live→3committed；执行归属mock-desktop | MockDesktop在HAP本地；不是实际桌面profile或远端持久会话 |
| rich表单/图表 | opaque iframe显示表单与A3/B7；默认表单action后completed，会话仍connected/readOnly=false/error=none | 实际渲染和提交通过；native重复action、代码/schema重挂载、恶意guest隔离未执行 |
| 原生缓存 | 实际app-owned FS保存/只读恢复；进程重开与HAP重装后A恢复3行，B读取A缓存拒绝且0行 | 正常IO路径及跨Session拒绝；部分写入、fsync/rename失败/空间不足仅替身覆盖 |
| 生命周期 | 输入法前后台切换后旧port关闭、本地ESM再次ready；不会自动连接或重发任务 | 未覆盖native强杀桌面恢复、renderer崩溃、所有后台期限 |
| 输入与UI | native CLI填充固定测试文本；富块及只读743px列表截图已查看 | 小艺键盘新声明未接受；IME编辑、selection/键盘遮挡/旋转未验收 |
| HTTP/安全 | 生产provider硬拒绝；requestPermissions和signingConfigs为空；源码/Node/Chrome测试通过 | 未执行native HTTP、网络负例、CSP/伪造port/source攻防；不能从Chrome提升资格 |

实际 [最终截图](../evidence/native-emulator/final-rich-action-20261011/Screenshot_2026-10-11T174555.png)、[原生DSH日志](../evidence/native-emulator/final-rich-action-20261011/native-dsh.log)、[只读缓存截图](../evidence/native-emulator/cache-reopened-fixed-layout-20261011/Screenshot_2026-10-11T173514.png) 及各阶段uiLayout保存在 `evidence/native-emulator/`。最初v9安装、连接失败和修复前action断开截图保留，不计为最终成功；initial的system-boot截图只是锁屏。CLI第一张截图曾因把目录参数当文件参数而落到工具默认Pictures位置，具体文件未知；未扫描用户Pictures，随后截图均显式写入本任务已存在目录。

实际平台运行触发两项修正。API26的 `loadData` 将待加载HTML编码为内部data地址，`onPageEnd` 返回data地址而controller仍返回指定document地址；原逻辑过早加载并拒绝合法内部地址。现在只在controller attached后加载，有限期限内匹配native已验hash HTML的精确base64或URI编码字节，并仍要求controller精确document和postMessage精确targetOrigin；未知字节、非主frame、已完成加载后的data地址继续拒绝。官方 [Web事件示例](https://raw.githubusercontent.com/openharmony/docs/master/en/application-dev/reference/apis-arkweb/arkts-basic-components-web-events.md) 和 [loadData说明](https://raw.githubusercontent.com/openharmony/docs/master/en/application-dev/web/web-page-loading-with-web-components.md) 用于核实调用方式，API26实际回调差异由本批日志建立。

rich数据更新原来再次嵌入assistant/message并带sourceEventSeqs，维护中的Session decoder因此拒绝并断开。修复为首次发布assistant/message，后续保留明确ignorable的lab事件，由scoped rich.snapshot提供当前数据；不改产品持久类型或DSH包。新增3个Node测试覆盖精确地址/代际以及真实decoder-follow的action更新，134独立测试=118 Node+9 source replay+7 BFF，79项Chrome断言全部通过；2个内嵌子进程用例已包含在Node总数。真实模型/上传0，第五次replay派发硬拒绝，临时测试listeners已关闭。

最终构建时46项输入未改变。随后完整回归重新生成phase5 browser snapshot，只有随机messageId及其blockId发生变化；3项native核心/策略资源与实际执行HAP字节一致。该单项差异在HAP核对记录中保留，没有改写构建证据或为匹配哈希重写测试结果。最终unsigned HAP SHA-256为 `3a5aa0598ff1b8e6f7adecf56cf9dad4b9489952d70ccddff94f91001cae85de`。

小艺输入法显示新的服务/隐私声明，随后提供完整版、基础版及退出选项。未接受任何模式，未给予网络/通讯录/相机/麦克风权限；按新布局点击“退出应用”。一次输入后沿用旧ID的点击触碰了新弹层，弹层仍保留待选模式；后续均重新获取uiLayout再定位，不能把这种CLI填充称为键盘验证。继续IME验收需单独批准该声明及明确模式。自动审批曾把一次只读uiLayout误归为输入框点击；相同只读命令说明范围后获准，无绕过或权限扩大。

SDK/ArkWeb日志出现平台指标提示，故这里只能报告DSH模型/上传为零，不能声称整个模拟器/SDK无网络或遥测；本任务没有调整平台遥测/安全设置。应用INTERNET权限为空，未激活真实desktop、pairing、持久访问、WAN或证书。

复现时使用官方Emulator和hdc，实例与端口必须来自本任务记录；hdc使用 `-p -s127.0.0.1:8710 -t127.0.0.1:16311` 以复用而不重启共享服务。依次安装记录的unsigned HAP、启动 `local.dsh.mobile.lab/EntryAbility`、取得新PID并仅读该PID的DSH日志；每次输入或切换页面后重新读取 `-uiLayout -a`。截图参数必须为已存在目录，`native-emulator-capture.mjs` 只归档本任务目录中的固定格式PNG与布局，不执行设备命令。Hypium/Instrument独立测试HAP未运行。

回退已执行官方 `-stop DSHOfflineAPI26 -instancePath D:\Temp\dsh-harmony-hvd-api26-20261011`；工具报告成功，owned PID46968及16311监听均已消失。保留SDK、镜像、实例、合成app缓存及用户IDE/共享hdc。v10源码ZIP与unsigned HAP单独封存到Temp，v9及之前保留；不删除工程、不提交、不push。

下一批先取得输入法模式授权并补native键盘/恶意guest/生命周期失败验收；然后在单独批准的受支持DSH profile中做真实桌面replay接入与持久恢复。最后仍需真实手机→真实桌面执行→流式与rich交互→同Session幂等、断线不重执行及蜂窝证据；当前模拟器合成闭环不能替代。
