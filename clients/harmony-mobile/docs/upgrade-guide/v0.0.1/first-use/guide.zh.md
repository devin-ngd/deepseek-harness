---
kind: upgrade-guide
description: 首用候选需要原生身份、桌面 grant 和主机的明确决定，才能进行配对 replay。
---

# 首次使用候选

## 变更

手机源码候选声明 ohos.permission.INTERNET；之前无权限的 HAP 不能使用 NetworkKit WebSocket。启动仍不执行操作。原生身份名称输入框和单独确认按钮可在远程连接关闭时初始化一个不存在的 HUKS ECE 身份。要求实际 API20 或以上；已有 alias 和不确定结果不被覆盖，也不自动重试。富内容来宾不能获得 signer 或私钥。

可移植源码 replay 启动器只选择 harmony-mobile-replay，隔离 home/agents/temp，并丢弃继承的模型和鉴权变量。默认旅程仍为合成测试。first-use.2 的 field 启动器另外接收明确选定的隔离 home 和严格的 field.json，要求本地 TTY 决定，导入原生公钥、签名有期限的 offer、提交原始本地 grant，确认后才装配既有 paired providers。原生界面核验 offer、仅签名其一次 enrollment 挑战、批准确切主机，且只恢复完全相同的已保存公有记录。启动仍为 disabled。

桌面身份在选定 credentials provider 内使用新的 owner payload：harmony-desktop-identity/1。该文件是明文，Windows ACL 防护需单独审阅。Session、原始 grant、公有 trust 和 SQLite generation 不变。中继公有配置准备和独占初始化是分别调用的本地维护工具，都不启动服务。旧 journal 永不覆盖。桌面 .2 产物保持不变，其公有类型需要声明的 zod 4.4.3。

## 迁移

1. 保留旧封存产物。使用首用报告中的候选与哈希，在独立目录运行便携启动器。确认四次 replay、原任务一次派发、真实模型及上传为零，并拒绝不安全模式或缺失 fixture。
2. 签名、手机安装、真实 HUKS 创建或激活前取得批准。debug signing 绑定这台手机及 local.dsh.mobile.offlineproduct；替换前检查已有 bundle。真实 HUKS/TLS/ArkWeb 和设备 API 尚未验收。
3. 按[首用入口与决定](../../../phase42-first-use-wiring.md)执行。用新隔离 home 调用 field-launch.mjs，只传递公有交换文件，本地批准身份存储及固定 grant，中继公有 journal 仅在操作员批准后初始化。激活前确认严格 field 拒绝路径和完整合成旅程。桌面冷启动创建另一个 replay world，需要再次本地 enrollment，不恢复运行中任务。不能把 replay 成功当作手机验收。回退仅恢复列出的客户端源码，保留回执、撤销数据和旧产物。
