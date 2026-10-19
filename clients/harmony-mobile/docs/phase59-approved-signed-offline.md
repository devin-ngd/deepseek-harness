# 已批准的签名用途修复包，待恢复原手机连接

用户于 2026-10-15 11:04 UTC 明确回复“允许安装”（Sentinel_d48d1df92240819189504e899e9fc290），批准复用原材料签名、官方验签及同 bundle 原位更新。该批准继续有效；手机重新连接后不必再次询问同一候选的安装权限。具体范围见 [批准记录](../evidence/phase59-authorization.json)。原限时授权仍只覆盖一个固定 replay 测试 Session，grant 最长 30 分钟，从实际创建起算且不自动续期；真实模型和用户项目操作均不在范围内。

输入严格使用 [第58阶段](phase58-native-sign-purpose.md) 封存的 `D:/Temp/dsh-harmony-mobile-20261015-huks-sign-purpose-unsigned.hap`，5272033 字节，SHA256 `14cd20fcb88d80c9fbde50ef61bb7d057debdee0950752deb28618f8eabee016`。签名前核对全部 59 个封存源码/证据哈希；没有重编译、替换候选或修改原签名工程源码。官方 SDK 使用原材料签名一次；密码处理委托已安装的官方 Hvigor 辅助模块，不自行实现解密，不输出凭据、命令参数或原始签名工具日志。

已验证的签名包位于 `D:/Temp/dsh-harmony-mobile-20261015-huks-sign-purpose-signed.hap`，5333688 字节，SHA256 `f92c21045d4d6ae6fd78f6ba8aa19015982ef95283620e1c3d89b76b896abf5e`。官方 `verify-app` 与 `verify-profile` 均返回 0，提取的 profile 与原批准材料逐字节一致；配置哈希保持不变。bundle 仍为 `local.dsh.mobile.offlineproduct`，版本 0.0.0/code1，权限只有 INTERNET。身份、ECE 选择和数据处理代码没有新变化。[签名与验签记录](../evidence/phase59-signed-build.json) 区分 11:13 UTC 的实际签名和 11:22 UTC 的验证恢复，避免将重复验证计作重新签名。

最初的补充条目比较要求 signed/unsigned ZIP 条目集合完全相同，因此被官方工具新增的 `.pages.info` 拒绝。实际对比确认：原 23 个应用条目的名称、大小和 SHA256 全部一致，唯一增加的文件是 `.pages.info`，312 字节，SHA256 `88e3c89c1ba979b1add12c52918a13488b0dd35b434f6bddaa90b85410bcf675`。安装 SDK 的签名 JAR 在 FileUtils、Zip 和 ZipEntryData 类中处理该名称；记录其 JAR 哈希及标识，见 [SDK 证据](../evidence/phase59-pages-info-sdk.json)。检查现在只接受该确切新增条目，拒绝应用内容变化、缺失条目、未知增加、错误元数据、缺失元数据及重复名称；[7 项验证](../evidence/phase59-payload-tests.json) 通过。原失败与差异证据保留，随后仅恢复验签，没有重新签名。它不放宽 HUKS 签名、公钥或协议校验。

签名前后均只查询共享 HDC 目标列表；收到“继续”后再次核对，11:25:56 UTC 仍未找到原批准目标，未向其他设备或手机应用发送命令，见 [连接状态](../evidence/phase59-phone-availability.json)。因此本轮没有调用安装、启动手机应用、创建/删除密钥、尝试 HUKS 签署、启动 field、创建 grant 或修改中继。最后成功的手机退出证据仍属于第58阶段，不能当成本轮重新连接验证。现有电脑 DPAPI 身份复用，grant 为 0，计时未开始。[状态核对](../evidence/phase59-closeout.json) 记录这些限定。

官方 SDK 辅助模块首次因缺少原签名工程的 NODE_PATH 在签名尝试前停止；使用既有依赖路径后遇到沙箱 realpath 拒绝，窄范围主机执行通过。后续执行通道断开后，先核对签名尝试标记、host 结果、测试与产物状态，再使用 `node scripts/phase59-sign.mjs --verify-existing` 恢复只读验证。没有删除尝试标记或自动重试签名。仅新增的公开完整性检查运行 7 项测试；第58阶段的 10 项专项、22 项回归、9 项合成流程及官方 API26 编译没有重跑，签署的是它们对应的原始 HAP。

本轮公开源码增量位于 `D:/Temp/dsh-harmony-approved-sign-purpose-20261015-delta.zip`，含 4 份文档回退文件，最终大小、哈希及条目核对见 [交付清单](../evidence/phase59-deliverables.json)。前代源码包、HAP 和封存证据保持原字节；不打包实际 home/world、凭据、签名材料、profile/cert 导出、公开交换正文或原始设备日志。

恢复步骤：确认原批准手机重新出现在共享 HDC 且为唯一目标；核对上述签名包哈希与官方验签记录后，使用 `scripts/phase59-install.mjs` 进行一次 `install -r`。该脚本在动作前写入排他尝试标记，结果未知时必须先检查，不自动重复安装。随后使用原 HUKS/DPAPI 身份与新鲜挑战验证签署，保留第58阶段的一次尝试标记；只有手机证明验证通过后才继续原批准 grant 和固定 replay 闭环。出现新权限、密钥替换、协议验证变化或扩大网络访问的要求时停在对应前提。新候选的真实 HUKS 签署、配对、ArkWeb 富交互及完整真机端到端仍未验收。
