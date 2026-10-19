# 桌面受保护身份与固定 world 恢复

本批完成两个源码缺口，并产出默认关闭的 Windows x64 候选。实际 CurrentUser DPAPI 合成密钥测试、13项定向测试、8案独立进程崩溃恢复、完整替代端流程及脱离仓库的候选启动检查通过。真实身份、已安装桌面、手机和中继未被本批操作；这些结果不构成真机端到端验收。

## 身份与持久类型确认

[身份消费者](../desktop-plugin/src/identity.ts)使用显式[保护接口](../desktop-plugin/src/secret-protection.ts)和[Windows提供者](../desktop-plugin/src/windows-protection.ts)，通过原 CredentialsLocal 原子记录写入密文。测试只保护公开、固定的合成 PKCS8；未读取真实凭据或迁移真实身份。保护失败、密文篡改、错误 alias/public-key 绑定、未知字段和旧明文记录均拒绝，不回退明文。错误不携带底层私钥或子进程原始输出；私有字节通过匿名管道传输，不进入 argv、环境、临时文件或日志。

| 所有者数据 | 变化与读取策略 | 保留要求 |
|---|---|---|
| Credentials grant 内 harmony-desktop-identity/1 | 原 publicSpki/privatePkcs8 明文记录保持不变；新版 OPEN 拒绝，CREATE 拒绝占用别名 | 不迁移、不覆盖、不删除旧记录 |
| harmony-desktop-identity/2 | publicSpki、protection 和 protectedPkcs8；严格解析、DPAPI 当前用户解密及 P256 公私钥一致性检查 | 必须使用明确选择的提供者；未知写结果不得盲重试 |
| harmony-replay-field/2 | 启用配置显式声明保护超时与 world path/mode/maxAdmissionRecords/lockWaitMs | 禁用 /1、/2 均保持惰性；启用 /1 拒绝 |
| harmony-field-world/1 | 新公开 owner marker：initializing/ready、desktop/profile/session、identity alias、资源 SHA256 | create 拒绝已有目录；reopen 拒绝缺失、损坏、不完整或异主数据 |

本确认涵盖 owner payload、配置及新 world 文件的 serializer/parser；未改动已发布 SessionEventMap、SESSION_FORMAT_VERSION、SQLite SCHEMA_VERSION、grant 或 relay journal/head 世代。所有先前提交世代与封存候选保留。外部可见破坏性变化及迁移限制见[双语升级指南](upgrade-guide/v0.2.1-alpha.2/protected-desktop-world/guide.md)。Windows DACL 未修改或强制收紧；DPAPI 不防止同用户失陷，也不承诺托管内存完全擦除。实际不同 Windows 用户的拒绝、系统断电和异常系统环境尚未实测。

## 稳定 world 与回执

[World owner](../replay-profile/src/field-world.ts)复用现有 withFileLock、SessionController.inspect/resolveAgent、SessionPersistence 与 admission domain。锁覆盖检查、响应位置读取、恢复、运行及 Context 清理；竞争进程超时，死亡进程的遗留锁按现有本机 PID 策略接管。它不支持跨主机共享 world；PID 重用或不完整锁保守阻塞，需要另行审查处理，不能删除活锁。

[生产 ports](../desktop-plugin/src/ports.ts)在 prompt 入队后等待规范 Session 的持久化屏障，成功才允许 journal 标记 accepted。回执查询先捕获匹配证据，再等待屏障；失败返回 unavailable，submitting 保持 unknown。规范 inbox 插入和已消费 user/message 都可提供证据。重复请求只核对原意图和回执，不因缺少证据自动再次派发。插件显式要求并注入 SessionPersistence，声明其包 peer，避免只在测试根 Context 可见。

[固定 replay 位置](../integration/replay-host.ts)从原 Session 的完成记录恢复，先被动检查，再在同一 world 锁内安装剩余响应并激活原 Agent。完成表单响应后重开，剩余 action/tool/final/cancel 顺序不重置。未完成 turn、异源 route、请求/响应数不一致或四响应耗尽时拒绝激活，保留现场。此规则不实现通用执行中模型或工具的自动续跑。冷启动授权仍需新的本地确认；没有恢复长期 grant 或绕过 enrollment。

## 已执行验证

| 验证 | 结果与证据 |
|---|---|
| 身份、world、回执及拒绝路径 | [13项](../evidence/phase52-identity-tests.json)；实际 Windows DPAPI、文件重开签名、篡改/绑定/明文拒绝、并发回执、落盘失败、被动位置拒绝 |
| 独立进程恢复 | [8案](../evidence/phase52-field-restart.json)；每案 A/B 为不同 PID，A 被精确终止，B 重开同一 world；真实模型与监听均为0 |
| 完整首用产品流程 | [定向1项通过，4项过滤跳过](../evidence/phase52-first-use-vitest.json)；实际源 Gateway/plugin/Session/rich、真实 loopback WS、ETS 的 SDK 替代及 Chrome 富表单 |
| 脱离仓库候选 | [启动报告](../evidence/phase52-detached-profile.json)；四响应、一次原任务、23个流式帧、富交互/历史/取消、环境隔离、缺 fixture/live argv/旧启用配置/无TTY拒绝 |
| 类型与构建 | strict TypeScript 6.0.3，163模块；受限 dsh 候选闭合1085个源码输入、6组运行依赖；未安装 |
| 双语升级指南 | 通过维护的 pairing-record helper 检查逐节哈希；未调用翻译技能 |

| 进程 A 检查点 | B 的行为 |
|---|---|
| claim 前 | B 唯一派发原任务 |
| claim 后、prompt 前 | 保留 submitting/unknown，无派发 |
| prompt 后、屏障等待中 | 实际后台 persistBatch 被闸门阻塞超过批写窗口，物理输入为0；B 保持 unknown，不重派 |
| 屏障失败后 | 查询不能凭内存升级 accepted；物理输入为0，B 保持 unknown |
| accepted 后、未额外 flush | A 的规范 inbox/消息已落盘；B 保持 accepted，不重派 |
| 规范完成、journal accept 前 | B 根据持久证据恢复 accepted，保留历史 |
| 完成后 | B 保留一次原任务与历史富块 |
| 历史表单后重开并继续 | A1+B3固定响应；action completed、重复幂等和最终取消均通过；第三个竞争进程被锁拒绝 |

真实落盘闸门只存在于关闭的合成 restart fixture，截获实际 JSONL persistBatch，未改底层 Session/loop。初版故障注入与7/8报告保留为失败证据；最终报告包含正确后台路径及实际 action 终态等待。独立只读安全审阅指出并促成启动版本、持久屏障、并发查询、排他生命周期及故障注入修复；最终复核未发现剩余阻塞。

已运行：node scripts/product-check.mjs；node scripts/protected-identity-test.mjs；node scripts/build-replay-profile.mjs --protected-world；node scripts/field-restart-test.mjs；node scripts/protected-world-flow-test.mjs --flow-only；node scripts/detached-protected-world-test.mjs；node scripts/protected-world-record-pair.mjs。Windows 沙箱 realpath EPERM 的失败已保存，按同一命令窄范围宿主重试；没有自动审批拒绝。根仓全量测试、coverage、doc-sync及平台矩阵未运行；旧全文件校验已有历史证据/链接格式失败，不改写封存字节或声称该门通过。

## 交付、回退与剩余工作

工程仍在 clients/harmony-mobile；主仓用户改动、安装的 DSH、现有签名 HAP 与中继均保留。本批候选、源码差量和 SHA256 见[交付记录](../evidence/phase52-deliverables.json)。候选仅用于审查/合成验证；没有安装、激活、签名、上传、push、新增长期凭据或开放端口。

回退优先继续使用封存的 .2 候选及原已安装应用；它们未被覆盖。撤回本批源码时仅恢复交付清单列出的客户端路径，保留后续原生页面和其他任务改动。任何已初始化 world、credentials、admission receipts、unknown 记录或公开撤销记录必须保留；删除它们不是回退。旧 .2 不支持新身份和 world，不能用旧候选读取新数据或改格式实现降级。

剩余验收：单独批准真实受保护身份创建/存储及任何旧身份迁移；批准指定 relay 状态目录/服务初始化并验证 Linux 持久化；核对实际桌面宿主集成；在真实手机完成 HUKS、TLS、ArkWeb 隔离和手机→桌面执行→富交互→正确会话与断线幂等闭环。本批没有编译或更新 ArkTS/HAP，沿用先前已安装的原生布局版本，其真机证据不能替代本批远程链路验收。
