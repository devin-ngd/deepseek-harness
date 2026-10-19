# 真机预览通过，HUKS 签名用途候选待安装

2026-10-15，用户批准的 util 绑定修复版已使用原签名材料签名、通过官方应用与 profile 验证，并原位安装；没有清除数据或重新创建身份。安装包 SHA256 为 `8acee8ab11df797948dc128870c76410e8f15c895e3f2cca3878d88bec6ac717`，大小 5327326 字节。证据见 [签名](../evidence/phase58-signed-build.json) 和 [安装](../evidence/phase58-installation.json)。

真机 CMM-AL10 / OpenHarmony-7.0.0.109 / API26 已完成 UTF-8 解析、共享协议校验、原 HUKS 公钥读取、桌面 ECDSA 签名验证和完整配对预览。两端指纹、固定 Session、10 项操作及最长 30 分钟请求均在原生预览核对，见 [确认记录](../evidence/phase58-enrollment-reviewed.json) 和 [原生阶段](../evidence/phase58-enrollment-markers-1792058830126.json)。这次尚未建立设备 grant，也没有启动 30 分钟计时。

原生确认后只尝试签署挑战一次；界面返回操作未确认，未取得公开回应。没有重复签署。已取得的 HUKS 日志不含可用错误码，不能断言失败发生在 init、update、finish 或验签中的哪一步。field 在 READ PHONE PROOF 阶段以 STOP 退出；真机应用正常退出。没有激活中继信任、执行用户任务或调用真实模型。[桌面检查](../evidence/phase58-desktop-identity.json)、[进程检查](../evidence/phase58-owned-processes.json) 与 [真机退出](../evidence/phase58-device-final.json) 分别记录 grant0、进程0、空 PID。

独立代码审计发现，旧实现把 SIGN|VERIFY 同时用于密钥创建和签名会话。[OpenHarmony 官方 HUKS ECC 示例](https://raw.githubusercontent.com/openharmony/docs/master/en/application-dev/security/UniversalKeystoreKit/huks-signing-signature-verification-arkts.md) 对创建使用两种用途，对签名使用 SIGN。候选保留原创建用途及原身份，改为签名全过程只传 SIGN；保留签名公钥核验、字节清理、失败中止和禁止重试。新增日志仅含固定阶段、白名单错误码或 unavailable、签名字节长度；不记录私钥、签名、输入或原始异常消息。该参数缺陷已通过旧代码拒绝回归确认；它尚不能替代真机根因证据。

`node scripts/phase58-sign-test.mjs` 的 10 项测试、`node scripts/phase58-util-test.mjs` 的 22 项回归和 `node scripts/phase58-interaction-test.mjs` 的 9 项合成集成测试通过。集成首次运行的 realpath 被沙箱 EPERM 拒绝，失败证据保留；窄范围主机重试通过。所有集成都使用显式 SDK 替身及固定 replay，不能作为 ArkWeb 或真实 HUKS 验证。

`node scripts/prepare-first-use-native.mjs --huks-sign-purpose` 和 `node scripts/build-native.mjs --huks-sign-purpose` 已通过官方 API26 ArkTS 编译、实际编译 JS 导入检查和 unsigned HAP 打包。沙箱首次拒绝现有 SDK 目录链接，原命令经窄范围主机重试通过。独立目录为 `.build/native-huks-sign-purpose-project`，输出 `entry/build/default/outputs/default/entry-default-unsigned.hap`，5272033 字节，SHA256 `14cd20fcb88d80c9fbde50ef61bb7d057debdee0950752deb28618f8eabee016`；原始证据为 [构建记录](../evidence/native-build/2026-10-15T10-28-01-448Z.json)。没有签名或安装这个新候选，没有新增手机权限。

执行通道恢复后已先核对断线前结果：公开 unsigned HAP 副本与源码差异检查实际完成，中继 verify 于 10:30 UTC 成功，确认原配置/服务代码不变、无配对文件、信任状态或服务覆盖。没有重复执行这些命令。10:48 UTC 的只读状态查询确认原中继仍 active、Restart=no、无 ReadWritePaths；隔离 field 进程为 0，桌面 grant 为 0。SSH/CIM 读取经已观察到的沙箱拒绝后使用窄范围主机重试，没有修改服务。[闭环状态核对](../evidence/phase58-closeout.json) 与 [中继复核](../evidence/phase58-relay-unchanged.json) 记录各自观测时间。

当前工具通道可用；10:51 UTC 的共享 HDC 目标列表未发现原批准手机，未向其他设备发送命令，见 [连接可用性](../evidence/phase58-phone-availability.json)。手机最后一次成功检查仍为 10:17 UTC 正常退出的空 PID，不能将其表述为当前重新连接验证。后续真机测试需恢复原手机连接，禁止删除本轮一次签署标记或重建身份。

公开候选位于 `D:/Temp/dsh-harmony-mobile-20261015-huks-sign-purpose-unsigned.hap`。源码增量位于 `D:/Temp/dsh-harmony-huks-sign-purpose-20261015-delta.zip`，含修复前 9 份回退文件，最终大小/哈希和逐项资格见 [交付清单](../evidence/phase58-deliverables.json)。前代源码包、HAP、已封存证据保持原字节；不打包实际 world/home、凭据、签名材料、公开交换正文或原始设备日志。

待批准的操作仅为复用原签名配置、profile 与材料，对上述确切候选签名及官方验签，再原位更新同一 bundle `local.dsh.mobile.offlineproduct`；版本仍为 0.0.0/code1，权限仍只有 INTERNET，不卸载、清数据、重建密钥或增加权限。本轮没有执行这些新操作。恢复原手机连接并取得该批准后，才可安排复用原 HUKS/DPAPI 身份验证新挑战；grant、固定 replay、富块与重连仍逐项沿用原限时授权，不能因新候选批准而扩大。真实任务、真实模型、权限扩大及长期授权仍未获批准；完整真机端到端验收尚未通过。
