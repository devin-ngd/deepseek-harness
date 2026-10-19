# 修复版已安装，HUKS公钥通过，挑战预览仍拒绝

本轮完成了获批的应用签名、官方验签及同bundle原位更新；真实HUKS身份生成和公钥读取通过。随后原样公开挑战在真机预览入口拒绝，现有界面和本应用日志没有指出失败阶段；不能将其判为特定密码算法错误。设备挑战签名、双方指纹确认、grant、TLS/E2E、ArkWeb任务交互与去重/恢复/取消均未通过或尚未开始。grant一直为0，没有起止时间或续期，中继未激活，真实模型与用户项目操作为0。

## 应用签名与原位更新

用户于2026-10-15 02:47 UTC批准复用原签名材料，对第54阶段修复签名并原位更新，不卸载、不清数据或增加权限；[授权记录](../evidence/phase55-authorization.json)保留消息标识。原独立签名工程只替换已审核的NativeDeviceKeys公开源码，所有AppScope/entry/src与获批unsigned工程核对一致；未重建账号、证书、Profile或密钥，未读取输出私钥内容。

[官方签名构建](../evidence/phase55-signed-build.json)和[安装记录](../evidence/phase55-installation.json)确认 `local.dsh.mobile.offlineproduct` v0.0.0/code1，仅INTERNET。官方verify-app和verify-profile均返回0，提取Profile与原批准材料逐字节相同。初次独立验签使用错误参数大小写；按本机官方帮助改为-outCertChain后验证通过，没有忽略验签结果或重建材料。

实际安装文件 `D:/Temp/dsh-harmony-mobile-20261015-huks-presence-signed.hap` 为5319165字节，SHA256 `a9eef8a51b2beed893d6619d27fe93b43ede0ed2cac6e1a6836b432df00deeb3`。官方HDC对原CMM-AL10/API26执行install -r，明确返回成功；没有卸载、清数据、增加权限或触碰现用DSH。前代已签名布局HAP、封存`.4`及工具`.3`均保留。

## 真实HUKS与电脑身份

更新后先在原生UI查询同一 `harmony-phase54-phone` 别名，本应用PID65271返回HUKS公钥不存在；随后通过原有两步确认，仅创建该测试别名一次，没有换名或覆盖。原生UI已显示[有效公钥](../evidence/phase55-layout-identity-after-create.json)，[本机核对](../evidence/phase55-real-huks-public.json)确认P256、规范SPKI/Base64URL与SHA256指纹一致。请求的存储级别仍为HUKS ECE，无软件或文件密钥fallback；未进行硬件证明，也未验证设备挑战签名。

手机公开指纹为 `p256-sha256-6dbd072d7da53e682d4852d1e11cc8d4b48cc5a414283cd221b2b0c012fe9b99`。电脑通过受限`.4`入口REOPEN原world、OPEN原DPAPI别名，指纹仍为 `p256-sha256-ee92b90cd922b7049b680933191c74a050ad450493098ad3c43e9180bc2746dc`；没有再次创建电脑身份。两者尚未在成功的手机挑战预览中完成比较，不声明绑定成立。

## 原样输入与未分类拒绝

桌面生成一份公开挑战，范围仅 `harmony-mobile-field-replay-session` 及原限定task/receipt/cancel/sync/rich操作，拟申请grant上限1800000ms。挑战有效期至03:13:32.144Z，实际grant未创建。输入驱动最初丢失JSON引号；修正为传送公开文本文件与固定官方UI输入脚本，并用标准Ctrl+A/Delete清空后输入，避免追加。没有改手机页面、SDK、签名或期限检查，也没有通过隐藏执行桥输入对象。

Native TextArea内JSON已逐字段等于桌面原文件，但在仍有约4分钟挑战有效期时预览继续拒绝，界面只显示通用失败，未展示双方指纹；手机/电脑UTC整秒采样相差约-775ms。仅本应用日志没有给出可归因的错误。精确生成的ProductCore公开测试向量在[SDK替身探针](../evidence/phase55-public-core-probe.json)下能验证桌面签名；该探针只证明离线一致性，不能证明真机验证器通过，不能据此放宽任何检查。

首次field在READ PHONE PROOF前主动拒绝继续，首份挑战自然到期；没有手机签名回应、phone-pair/relay-pair、公开信任或设备grant。原home/world及两端身份均保留。手机窗口不再可见后停止全部UI输入；只对本次记录的PID65271对应bundle定向停止，[清理记录](../evidence/phase55-phone-cleanup.json)确认PID为空且未删数据/身份。

用户03:35 UTC报告连接恢复后，重新核对并只读复用两端身份；手机冷进程返回同一公钥，未再创建密钥或安装。原world重开，新鲜挑战输入正确且核验前没有失败提示，但点击后仍出现通用失败、签署按钮禁用，[恢复后记录](../evidence/phase55-resume-preview-refusal.json)证明拒绝被复现。原控制会话随后丢失，STOP没有得到执行确认；[精确路径进程查询](../evidence/phase55-owned-processes.json)另行确认field进程为0，未重发可能重复的停止。手机通过已有退出控件收尾；原中继配置、server和空信任状态未变。没有grant开始时间或到期时间，不能将这些退出结果称为一次grant撤销。

## 已有证据能定位到哪里

手机拒绝的是“核验挑战与指纹”对应的 `previewEnrollment()` 操作。恢复连接后的干净界面在点击前没有错误，点击后显示原始文案“操作未确认完成。请查看状态；任务可以查询原回执，避免重复发送。”；双向指纹预览没有产生，“确认并签署这次挑战”保持禁用。这不是手机签名失败或桌面执行失败，因为两个操作均未发生。

现有 `Index.ets` 的通用 `run()` 捕获异常后只设置 `failed=true`，丢弃异常；已安装版的 `enrollmentInput()` 把公钥比较、桌面验签和到期检查合并为同一拒绝。现有应用专属HILOG记录没有本次预览的阶段标记或可归因异常：较早HUKS `-13` 来自更新前进程或本次创建密钥之前，后面的预览日志没有对应HUKS/crypto错误。系统渲染、Web内核初始化错误也不能定位该次预览。旧原始日志只留在隔离现场，不放入交付包。

已先使用现有手段排查：修正官方UI驱动的引号和追加输入问题；从Native TextArea读回并逐字段比较公开挑战；冷启动重读同一HUKS公钥；使用新鲜挑战重现且确认点击前没有旧错误；检查设备时钟；对完全相同的生成ProductCore和公开输入运行纯逻辑/验签探针。后者在SDK替身下通过，不能证明ArkTS引擎和真机crypto API通过。当前证据仍不能区分原生解析、公钥再次读取、签名字节/API互操作、到期复查或指纹预览生成。继续重复相同点击不会增加这个区分度；保留原有检查的阶段诊断需要新的HAP。诊断版用于定位，尚未证明修复。

## 新的有限阶段诊断候选

[NativeProductOwner](../harmony/entry/src/main/ets/product/NativeProductOwner.ets)现在记录parse-offer、read-selected-phone-key、compare-selected-phone-key、hash-public-transcript、verify-desktop-signature、check-challenge-expiry和publish-preview等固定阶段，并将失败归入固定代码/类型。成功到达相应阶段时，只额外输出公开签名转录的长度和SHA256摘要。输入文本、公钥字节、签名、nonce、SDK错误message和私钥均不输出；原验证、期限及确认仍执行，失败仍拒绝，无grant或网络副作用。

[5项回归](../evidence/phase55-diagnostic-tests.json)覆盖成功预览、坏JSON、过期、密钥IO失败、变异桌面签名，均通过；检查失败不回显载荷、过期不读密钥、签名失败不发布预览、没有创建/删除key。官方API26类型检查和CompileArkTS通过，保留能力/异常处理警告。[公开源码比较](../evidence/phase55-diagnostic-source-comparison.json)相对已安装的签名工程仅NativeProductOwner.ets改变。生成器还会在写入前拒绝未知variant，避免选择错误的默认编译目录。

新文件 `D:/Temp/dsh-harmony-mobile-20261015-enrollment-diagnostic-unsigned.hap` 为5266662字节，SHA256 `89617fe382175a44c24ac0d571b7c292e056e21f481132dae9135555612f2a52`，尚未签名、安装或在手机执行。具体源码、编译证据、修改前像及哈希见[本轮交付清单](../evidence/phase55-deliverables.json)。这是诊断候选，不是假定已修复当前真机拒绝。

采集器现在只读取该测试bundle的PID日志，在内存中筛选固定标记，并最多保存64条阶段、白名单类别或公开转录长度/SHA256记录；未知标记、附加字段、原始异常和其余HILOG全部丢弃，不再落盘原始日志。[采集器测试](../evidence/phase55-enrollment-collector-tests.json)3项通过。应用新增记录不包含公私钥字节、签名、nonce、完整挑战、账户、token或SDK异常message；采集器本身不启用网络或读取其他应用日志。候选没有新增页面、权限、服务端配置或持久数据格式，原有INTERNET权限不变。

## 恢复与所需批准

已完成的批准只覆盖第54阶段HUKS修复版更新；新的阶段诊断仍需对应签名/原位更新批准。可审核动作是复用原材料，对此单文件诊断候选签名并原位更新同一bundle，不卸载、清数据、加权限、导出私钥或放宽验证。之后只读复用已存在的HUKS/DPAPI别名，使用同一个home/world，以新鲜公开挑战记录实际失败阶段；不再次创建身份。

原限时联调范围继续有效，但grant必须在真实验证成功后才提交，一次最长30分钟，不自动续期。随后仍需真实公开信任初始化、窄中继写目录/短暂重启、TLS/E2E、手机任务/流式/原始ArkWeb点击、正确actionId完成、同请求去重、断线恢复、取消及授权失效证据。未进行上游alpha.3升级、真实模型、用户项目操作、commit或push。源码回退只恢复前像，保留所有身份、world、receipts和撤销记录。
