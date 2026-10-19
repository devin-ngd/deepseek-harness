# 诊断版已安装，拒绝定位至解析阶段

本轮完成用户批准的诊断版签名、官方验签及同bundle原位更新。原HUKS公钥与电脑DPAPI身份复用成功，新鲜公开挑战原样输入后，真机明确记录 `parse-offer / SyntaxError`；固定合成 `{}` 也得到同样结果。尚未进入公钥重读、原生验签、手机挑战签名、grant或中继连接。当前只定位到解析阶段，根本原因仍未知；没有已验证的功能修复。

## 已安装的批准候选

[批准记录](../evidence/phase56-authorization.json)对应用户2026-10-15 04:08 UTC的“允许”，范围是复用原签名材料更新上一轮封存诊断候选。封存源码ZIP、unsigned HAP、前代已安装HAP及62项公开工程输入均核对。原签名工程仅更新NativeProductOwner，原build-profile及材料不变；官方verify-app、verify-profile均返回0，提取Profile与原材料逐字节相同。[签名证据](../evidence/phase56-signed-build.json)和[原位安装结果](../evidence/phase56-installation.json)分别记录资格。

实际安装文件 `D:/Temp/dsh-harmony-mobile-20261015-enrollment-diagnostic-signed.hap` 为5328873字节，SHA256 `d1e9ad9a0241faf3c3afd3396285162cf9eac5146e0b48d34054ee1fc0422991`。原CMM-AL10/API26上的bundle仍为 `local.dsh.mobile.offlineproduct` v0.0.0/code1，仅INTERNET；没有卸载、清数据、增加权限或重建身份。官方HDC明确返回安装成功。

## 真机定位及现有手段的限度

更新后启动的本应用PID为29645。通过原生控件读取已有 `harmony-phase54-phone`，与保留的公开身份逐字段一致；公开指纹仍为 `p256-sha256-6dbd072d7da53e682d4852d1e11cc8d4b48cc5a414283cd221b2b0c012fe9b99`。本轮驱动明确拒绝身份创建控件。原world与DPAPI别名通过REOPEN/OPEN复用；[封存运行时核验](../evidence/phase56-runtime-preflight.json)没有发现应用或公开工具字节变化。

桌面新挑战有效期至04:23:53.880Z。原生输入框逐字段等于桌面公开文件，1323字节、SHA256 `276e2f33cbc4bd5b516efa359415a7a86757103706138dfe23a03e625a4d036f`。04:15 UTC点击“核验挑战与指纹”后，固定标记先记录parse-offer，随后记录同阶段SyntaxError；界面显示“操作未确认完成。请查看状态；任务可以查询原回执，避免重复发送。”，未产生指纹预览，签署按钮禁用。未触发手机签名或提交证明。

随后只用固定合成 `{}` 复验，原生TextArea读回确认2字节、SHA256 `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`，仍记录相同阶段和类别。这表明拒绝并非只能由实际挑战内容触发，但不能据此确定JSON解析、共享函数或序列化返回值中的具体原因。原版本把 `this.core().firstUseInput(...)` 与随后的JSON.parse合为同一阶段，现有日志到此为止。

针对完全相同的已安装生成ProductCore，离线SDK替身探针能解析公开挑战，并对 `{}` 返回ZodError。探针观察到的8段固定schema动态函数代码均通过官方es2abc的parse-only检查；这些代码不含现场载荷。[探针证据](../evidence/phase56-core-probe.json)仅说明Node替身和静态语法检查结果，不能确认手机动态执行或跨语言返回行为。手机已知官方系统VM路径不存在；没有安装其他工具，没有通过调试桥注入代码。未把Zod、编码器或密码API推断为根本原因，也未关闭任何验证。

## 新的解析细分候选

新候选将NativeProductOwner的解析段拆成native-parse-json、shared-offer-input、decode-shared-input，并只记录共享返回值的typeof类别和UTF-16长度。共享parseFirstUseOffer增加可选的受信阶段观察函数，默认调用方没有日志；NativeProductFacade使用它记录JSON解析、schema验证、期限复查、签名转录构造和结果序列化的固定阶段。没有新增JSON字段、授权操作、持久格式、页面或权限；原有schema、容量、期限、公钥、签名与人工确认仍执行。

[源码对比](../evidence/phase56-parser-source-comparison.json)确认实际HAP公开输入仅 `NativeProductOwner.ets` 和生成的 `ProductCore.js` 改变。手写源还包括上述共享parser/facade和独立构建variant；已安装工程及旧unsigned输入目录均保留。候选只是进一步定位，尚未证明修复。额外观测调用和少量JSON重复解析可能影响时序；原有期限检查不会延长。

日志仍只采集本测试bundle的PID，最多64条固定阶段、白名单错误类别、公开转录长度/SHA256或共享返回值类型/长度。没有密钥字节、完整挑战、签名、nonce、账户、token、SDK错误message或原始HILOG落盘。当前驱动对布局中的公开JSON只保存摘要；真实公开交换文件留在批准的隔离现场，源交付不包含它们。

[10项回归](../evidence/phase56-parser-tests.json)覆盖原有成功/拒绝路径、原生JSON失败、共享schema失败、序列化JS结果失败及采集器限制；[9项新旧对比](../evidence/phase56-parser-parity.json)确认规范输出和拒绝类别一致。[严格TypeScript](../evidence/phase56-parser-typecheck.json)、[4项构建参数拒绝](../evidence/phase56-build-variants.json)和[官方API26编译](../evidence/phase56-parser-native-build.json)通过，保留SDK能力/异常处理警告。这些结果不能替代真机执行。

新候选 `D:/Temp/dsh-harmony-mobile-20261015-enrollment-parser-unsigned.hap` 为5268624字节，SHA256 `7387f41f9bd3293ebfc74aee3dcbd6a423660263a911d51a30f70d76b6e82b98`；未签名、安装或执行。源码、前像和哈希见[本轮交付清单](../evidence/phase56-deliverables.json)。

## 现场状态与后续批准

本轮field在READ PHONE PROOF处收到STOP并以拒绝状态退出；[精确进程查询](../evidence/phase56-owned-processes.json)确认隔离进程为0。手机通过已有“断开并退出”正常退出，[最终设备状态](../evidence/phase56-device-final.json)确认PID为空。原两端身份、home/world和历史证据保留。没有phone-reply、配对文件或公开信任初始化，[桌面授权检查](../evidence/phase56-desktop-identity.json)确认grant为0，[中继检查](../evidence/phase56-relay-unchanged.json)确认配置、程序、空信任目录和无服务覆盖状态不变。grant计时从未开始，没有续期或撤销成功的声明；真实模型、用户项目操作、commit和push均为0。

下一步需要对这一新候选的签名/原位更新作对应批准：复用原材料，仅更新同bundle，不卸载、清数据、加权限或创建身份；然后复用原身份和world，以新鲜挑战采集细分阶段。该批准原因来自用户要求每个新安装候选先报告修改与风险；04:08的批准覆盖已完成的前一候选。预览通过后才可能继续原有限时闭环，一次grant最长30分钟，不自动续期。真正手机发任务、桌面执行、流式、原始ArkWeb交互、幂等、恢复、取消和失效验证仍待完成。
