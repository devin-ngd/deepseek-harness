---
kind: upgrade-guide
description: 桌面现场身份必须使用 Windows 用户保护，启用配置必须明确选择稳定存储。
---

# 桌面现场存储保护

## 变更

DesktopIdentitySigner 必须显式选择保护提供者，只接受 harmony-desktop-identity/2 加密所有者记录。旧 harmony-desktop-identity/1 明文数据保留并拒绝读取，不自动迁移，不退回明文。启用的 field.json 使用 harmony-replay-field/2，必须配置 identityProtectionTimeoutMs，以及包含 path、mode、maxAdmissionRecords、lockWaitMs 的 world。禁用的 version1 和 version2 配置仍保持惰性并可读取。已发布 Session、grant、relay journal 的世代均不变。

Field create 拒绝任何已有 world 目录。Reopen 必须匹配 ready 状态的 harmony-field-world/1 所有者、原 Session 与 admission journal，不新建替代历史。检查至清理期间持有本机跨进程锁。固定 replay 只恢复已完成且尚未耗尽的响应位置；未结束 turn 或四响应已耗尽时拒绝激活并保留现场。任务 accepted 回执现在必须先完成规范 Session 持久化，再把独立 admission 记录标为 accepted。启用的桌面插件必须提供并注入 SessionPersistence 服务，包含其声明的包 peer。

## 迁移

1. 保留原 credentials 文件。不能修改 format 字段，不能用仅带 base64 标签的数据替换 privatePkcs8。
2. 检查 replay-profile/field.enabled.example.json，选择有上限的 Windows 保护超时和新的绝对 world 路径。首次选 create，后续在同一 world、桌面 id、身份别名、资源及隔离 --home 下选 reopen。Home credentials 文件与 world 必须一同保留。仅源码验证时不要启用配置。
3. 另行批准的新真实身份必须使用新别名与 Windows 当前用户提供者。旧明文别名不能被本版本打开或覆盖；未提供真实迁移工具。
4. 安装或激活前，用合成保护、重开、拒绝测试与候选构建验证。Windows DPAPI 保护该用户上下文中的静态私有字节；同用户失陷与 Windows ACL 强制控制属于其他问题。
5. 旧随机 world 没有新所有者标记，不能通过重命名字段接管。保留旧数据、回执及公开撤销记录。未提供数据接管、执行中模型恢复或已耗尽场景重置工具。
