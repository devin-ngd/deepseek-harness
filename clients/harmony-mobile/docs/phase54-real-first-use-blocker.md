# 真实首用停在HUKS存在查询

本次真实闭环尚未通过。用户于2026-10-15 02:13 UTC明确批准一个手机HUKS测试身份、一个独立Windows DPAPI测试身份、固定回放测试会话和最长30分钟grant，以及专用中继公开状态/窄写目录/短暂重启；普通确认可由代理操作。实际执行停在手机首次创建前的存在查询，未发放grant、未开始授权计时、未绑定指纹、未激活中继配对。源码修复、8项SDK替身适配器测试、9项合成交互和官方API26 unsigned编译已完成；新签名和原位更新仍需另行批准。

## 实际执行与保留状态

| 操作 | 实际证据与结论 |
|---|---|
| 本机/封存包 | DEVIN-MATEBOOK、Node24.13.0；[preflight](../evidence/phase54-preflight.json)核对 `.4`、工具`.3`和源码增量SHA256，并复制到唯一新目录；未合并alpha.3或替换现用DSH |
| 手机连接/启动 | [CMM-AL10、OpenHarmony-7.0.0.109、API26](../evidence/phase54-device-inspect.json)，官方HDC同一masked target，现有bundle `local.dsh.mobile.offlineproduct` v0.0.0/code1正常启动；未安装 |
| 手机首次身份 | 原生名称 `harmony-phase54-phone`，仅一次“创建设备身份→确认创建”，随后一次“查看已有设备公钥”；[结果](../evidence/phase54-layout-existing-identity-result.json)没有公钥，创建未成功。创建在旧存在查询抛错处停止，不自动重试，不删除别名或改存储级别 |
| 手机错误 | 仅本应用PID30282：HksKeyExist为-13，后续HksExportPublicKey为-13；[API对照](../evidence/phase54-huks-api.json)确认NOT_EXIST。未执行HUKS签名/配对/WS，不把源码推导当真机修复通过 |
| 电脑身份 | `.4`受限dsh入口通过真实TTY确认，在独立home创建 `harmony-phase54-desktop`；[DPAPI记录](../evidence/phase54-desktop-identity.json)证明/2密文保存、原API解密重开及公私钥一致性通过，只投影公开SPKI/指纹和保护类型 |
| 电脑任务/授权 | 导入手机公钥前主动拒绝继续；[规范Session](../evidence/phase54-actual-session-events.json)只有1个session创建事件，用户消息和模型请求均为0；设备grant为0。根目录录制replay fixture不计为实际执行 |
| 本地清理 | field进程已退出，[精确路径Node查询为0](../evidence/phase54-owned-processes.json)；home配置已准备为reopen，保留原身份/world/空Session，不再次create。手机经原生“断开并退出”关闭，[最终PID为空](../evidence/phase54-device-final.json) |
| 中继准备 | 新目录 `/home/devin/harmony-relay/field-20261015-phase54-lEUAMM`，公开状态子目录0700；原公开config/unit备份，核验工具ZIP并安全解压7个条目；未上传双方身份或pair，未初始化journal/head |
| 中继未激活 | 原MainPID3763855、Restart=no、ReadWritePaths为空、broker仍关闭；配置及server与原备份/哈希一致。没有unit覆盖、pair或信任文件，无重启、TLS/防火墙/DNS变更；公开工具目录保留 |

电脑公开指纹为 `p256-sha256-ee92b90cd922b7049b680933191c74a050ad450493098ad3c43e9180bc2746dc`。当前没有手机指纹，因此没有任何双方指纹比较成功的声明。私钥未出现在聊天、日志、源码交付或服务器；独立home内的DPAPI密文、凭据文件和原始应用错误日志不进入交付包。

## 根因与修复

安装的官方SDK26声明 `isKeyItemExist` 在缺失别名时抛BusinessError12000011；`hasKeyItem` 从API11起在缺失时返回false，其他查询错误仍抛出。[华为FAQ](https://developer.huawei.com/consumer/cn/doc/harmonyos-center-guides/faqs-universal-keystore-12-0000002592784278)的检索正文也确认两者差别；完整网页读取超时，没有用第三方内容替代。真实本应用-13错误与SDK中NOT_EXIST值一致。

旧 [NativeDeviceKeys](../harmony/entry/src/main/ets/native/NativeDeviceKeys.ets)等待前一个API，把所有拒绝转为key-presence-unverified，因而在调用generateKeyItem前退出。旧SDK替身错误地让isKeyItemExist对不存在返回false，掩盖了这条真实失败路径。修复改用hasKeyItem，保留ECE、明确原生确认、原别名不覆盖、查询失败不创建、不启用软件/文件fallback。

替身现在区分两种API。新增回归先在旧适配器上重现key-presence-unverified，再验证新适配器只进行一次创建、已有别名拒绝、查询错误及外来authority不调用创建。[红灯](../evidence/phase54-native-red.json)和[8/8绿灯](../evidence/phase54-native-green.json)均保留；[9/9固定回放/loopback/Chrome/SDK替身交互](../evidence/phase54-interaction-vitest.json)也通过。这些结果不表示手机HUKS创建、SPKI/签名编码或ArkWeb已经通过。

未修改Session、Credentials /2、grant、world、admission journal、relay publicTrust等持久格式，不迁移或删除已保存数据。产品文案、确认控件、共享rich SDK、15/60秒客户端限制及封存 `.4`/工具`.3`保持不变。

## 编译与可审核交付

[官方编译记录](../evidence/phase54-native-build.json)使用既有DevEco26.0.0.851、SDK26.0.0.105/API26、Hvigor6.26.8，类型检查和CompileArkTS通过；保留系统能力/异常处理警告，不把编译当设备能力验证。独立编译目录为 `.build/native-identity-presence-project`，签名配置为空，权限仅INTERNET。与前一已签名工程的AppScope/entry/src逐文件比较，[仅NativeDeviceKeys.ets改变](../evidence/phase54-public-source-comparison.json)，未读取签名文件或账号材料。

unsigned候选为 `D:/Temp/dsh-harmony-mobile-20261015-huks-presence-unsigned.hap`，5262215字节，SHA256 `3e0aca98f07eeadef9c24061dbd6a12b72541e7064406b442a5d8971ec2df8a6`；它尚不能视为可直接安装的签名交付。源码/证据/修改前像与哈希见[交付清单](../evidence/phase54-deliverables.json)。前代 `.4`、工具`.3`、源码增量及已签名布局HAP保留原哈希，不覆盖。

实际运行的相关命令为 `node scripts/phase54-preflight.mjs`、`phase54-device.mjs inspect/launch/layout/input/tap/errors/scroll`、`phase54-relay.mjs prepare/upload-tools/unpack/status/verify`、受限 `.4/field-launch.mjs --home <独立规范路径>`、`phase54-desktop-inspect.mjs`、`phase54-native-test.mjs --red`及不带red、`field-interaction-test.mjs`、`prepare-first-use-native.mjs --identity-presence`、`build-native.mjs --identity-presence`。HDC/SSH及编译junction/CIM曾被沙箱阻止，保留诊断后以窄主机重试；无自动审批拒绝。Windows路径和SSH非敏感系统环境的驱动修正没有绕过产品确认。未运行全仓测试、真实模型、用户项目任务、签名、安装或上游升级。

## 下一步所需批准与剩余验收

修复在手机生效必须产生新的签名HAP并原位更新同一bundle。初始授权要求安装前报告并获准，本轮批准没有覆盖新安装，故暂停手机依赖步骤。可审核的请求是：复用先前已批准的签名材料，仅对这处HUKS修复签名并原位更新；不卸载、不清数据、不更换账号/证书，不增加权限。签名后先提供新哈希并验证原签名归属，再按对应批准安装，不重装旧包或重新创建桌面身份。

恢复时读取 `.build/phase54-active.json`，使用同一个app/home/world和桌面alias，选择REOPEN/OPEN；先在新手机版本只读核对选定别名是否存在。任何未知创建结果均保留，不换alias重复生成。随后才继续已批准的签名挑战/公开指纹比较、一次最长30分钟grant、公开relay信任初始化、窄目录写权限及短暂stop/start；计时从实际grant提交开始，不自动续期或扩大会话/操作范围。

HUKS创建/签名、实际TLS/E2E、双方指纹、手机发任务、流式消息、原始ArkWeb点击、规范actionId完成/同请求重放不重复执行、断线恢复及取消均未验收。当前设备grant从未发放，无需把进程关闭等同于撤销；后续实际grant到期或完成时仍须核对失效。已保存身份、world、receipt及公开撤销状态只能由各owner保留/撤销，源码回退不删除数据。
