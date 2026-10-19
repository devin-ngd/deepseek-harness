---
kind: reference
description: 手机漏收中间公开代次后的完整签名历史验证和离线候选。
---

# 完整签名历史的手机恢复

当前源码支持手机漏收中间公开代次后，验证完整签名链并只保存最终有效代次。原生页面、共享核心和桌面预检使用同一套历史重建及验证输入。公开文档仍为原v1/v2格式，不改DSH Session或SQLite，不增加权限、私钥、token、网络接口或自动连接。原73.1实机和全部已封存产物保持不变；本候选尚未签名或安装。

## 恢复规则

手机保留grant3而桌面曾签发grant5并撤销至6时，不先导入grant5。普通导入会将已撤销的代次写为手机当前配对；其过期后现有有效期检查还会拒绝该导入。恢复直接核对新的完整签名历史，精确锚定手机已保存的完整grant3，验证中间grant5及最终后继的每份签名和前驱摘要，最后只原子保存仍有效的新代次。所有历史记录和回执原文保留，旧代次从未暂时激活。

共享[协议代码](../src/public-trust-protocol.ts)从历史中的record、receipt和完整前缀重建每份文档。每次授权必须紧邻前一代的撤销：旧grant为g时，后继所签撤销下限必须为g+1，新grant必须为g+2。未知代次不能靠一个更高的撤销下限跳过。所有pair标识不同；身份、原公钥、audience、中继pair版本、Session及操作范围保持相同。任一层本地撤销、缺环、分叉、删史、改身份或scope都会拒绝；完整本地锚点也必须逐字节规范等价。

替换时，全部中间grant必须已到期，最终grant必须未到期。验证不会改时钟或旧expiry，不降低epoch，不重用旧grant5。签名和摘要核对全部完成后才进入原有原子写入。验证失败保留原文件；写入结果未知保持拒绝和原有锁，不自动重试或删除锁。精确重开已保存的最终文档仍是显式resume，不重写文件或隐式连接；把它再次作为新后继提交则拒绝。

`publicTrustVerificationInputs(document, previous?)`提供全部规范签名及前驱摘要输入，包括锚点之前的回执；传入previous时必须匹配完整本地锚点，不传时检查保存文档的完整历史。Node[验证适配](../integration/public-trust-verification.ts)和ArkTS现有crypto口分别执行这些输入。原生`renewalInput(raw, previous?)`返回完整验证数组，其`.d.ts`、生成JS及`NativeProductOwner.ets`必须一起更新；这些是内部接口，全部消费者随候选更新，未修改持久字段或公开传输API。

## 离线证据

[测试报告](../evidence/phase75-tests-latest.json)保存命令、独立合成world和逐项日志；[用户流程快照](../tests/fixtures/phase75-history.expected.json)固定手机3→最终7、保留历史1/3/5、撤销下限6、只写一次及连接0。测试通过实际`DesktopFirstUse`所有者、纯内存凭据和固定测试身份生成1→3→5→7，所有合成授权均撤销；原手机、DPAPI、HUKS及远端未参与。

回归包含完整链接受、缺3/5、缺receipt、中间签名/摘要篡改、错误设备/桌面公钥、改Session、重复pair、未知epoch、历史或本地撤销、中间未到期、最终已过期、旧5重放、后继重放、容量不足及写入结果未知。篡改中间内容的测试重新签署外层文档，防止只验证最后签名就误通过。ETS测试运行实际`NativeProductOwner`、公开文件及crypto适配代码，SDK全部替代；不代表真机HUKS、ArkWeb或TLS验证。

官方已安装DevEco Studio26.0.0.851、SDK26.0.0.105/API26及Hvigor6.26.8已完成独立unsigned编译，34项任务全部执行，应用JS导入审计通过；[SDK证据](../evidence/native-build/2026-10-17T07-05-30-021Z.json)。构建目标为`.build/native-history-candidate-project`，使用原73.1配置，只有INTERNET权限，signingConfigs为空，`--no-daemon`。沙箱首次创建Hvigor目录联接失败的EPERM日志保留；原样宿主重试成功。编译不证明模拟器或真机验收。

## 后续完整操作器

后续执行以[phase75.1完整候选](phase75-operation-candidate.md)和[可执行操作器](../operations/phase75/runbook.md)为准，旧静态草案保存在原phase75审阅包。操作器仍未批准，不能执行现场动作。该完整候选保留本页的完整历史恢复规则及全部旧代次。
