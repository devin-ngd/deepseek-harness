---
kind: reference
description: 已批准冻结候选的签名安装、服务器预检及手机锁屏阻塞；尚未提交新授权。
---

# 第70阶段：已批准准备与锁屏阻塞

用户在 `2026-10-17T01:19:58Z` 批准[第69阶段计划](phase69-successor-candidate.md)的三组动作，批准记录为 `Sentinel_ba30e73d8ea081919058993e42fafead`。冻结 ZIP、899个候选文件和 unsigned HAP 哈希均匹配。候选内容、已安装桌面 DSH 和 rich-inline 没有改变。

## 已完成

原官方签名材料只执行一次签名。官方应用和 profile 验证通过，提取 profile 与原材料一致，公开证书链与原 signed HAP 的证书链匹配。全部23个应用 ZIP 条目的名称、大小、SHA256保持不变；唯一新增 `.pages.info` 是官方 SDK 从原 unsigned 包按4096对齐独立生成的页位图，与 signed 输出完全一致。旧候选专用的位图哈希检查首先拒绝新位图；拒绝记录保留，之后只恢复验证，没有重复签名。新的比较器对应用变化、缺失/新增/重复条目及错误位图的8项检查通过。

signed HAP 为 `D:/Temp/dsh-harmony-mobile-20261017-phase69.1-signed.hap`，5,234,434字节，SHA256 `59b6e99e8ddf6d09cde450144c674848b48aa345bde8e853084b9b034e23bf4a`。原目标 `target-54cfb7ac` 的一次 `hdc install -r` 在 `01:30:52.024Z` 返回成功。bundle仍为 `local.dsh.mobile.offlineproduct`，权限仅 INTERNET；没有卸载、清数据或生成新身份。新安装中的原 HUKS 和已保存记录仍需解锁后实际核对，不能仅凭安装回执声明通过。

服务器 `/home/devin/harmony-relay/phase69-successor` 已部署并核对40个冻结公开文件，独立 state 目录的原子重命名和目录 fsync 通过。使用无配对、broker disabled 配置，实际应用冻结 systemd drop-in 和 nginx burst2→3提案；服务以 devin 运行，ProtectHome=read-only、ProtectSystem=strict，ReadWritePaths仅为指定 state 目录。真实 TLS/WSS 未配置配对请求返回空403。预检结束后已恢复原服务和 nginx，原代码/配置、旧公开 journal/head 保持原哈希；没有新真实配对、grant 或后端连接。真实配对 journal 初始化、双端认证和数据交互尚未验证。

## 阻塞与安全状态

一次启动被手机系统拒绝，aa日志给出 `2097252` / `10106102`：屏幕锁定，开发者模式下不能自动解锁。没有应用进程或本测试窗口；没有证据表明候选发生崩溃。不会关闭开发者模式、修改锁屏设置、索取密码或绕过解锁。已请求用户在原手机上手动解锁。

新 grant 尚未提交，没有新开始/到期时间。原持久记录仍为 revoked epoch2，活动授权0；旧证明未重放，原固定 Session 保持原哈希，真实模型、上传和用户项目操作均为0。手机任务、流式、ArkWeb表单动作、重复请求、重连及取消均未进行本轮实机验证。

## 续接

用户解锁后复用已验证并已安装的 signed HAP，不重复签名或安装。先启动并核对原 HUKS 指纹、原过期公开记录与拒绝行为；再准备冻结桌面 profile 的原 home/world、续接公开输入、计时与中继准备。全部前置完成后，使用当天新鲜挑战及实际时钟提交唯一一次最长30分钟的 grant3，并立即报告提交和到期时间。旧 grant、旧 pair、历史及 epoch 不重置；新的授权窗口尚未消耗。

入口证据为 [phase70-pregrant-closeout.json](../evidence/phase70-pregrant-closeout.json)，签名与安装证据为 [signed-build](../evidence/phase70-signed-build.json)、[installation](../evidence/phase70-installation.json)，服务器资格和回退记录为 [relay-precheck](../evidence/phase70-relay-precheck.json)。
