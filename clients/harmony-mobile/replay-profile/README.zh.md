# 隔离源码回放 Profile

[English](README.md) | 中文

可移植候选通过 `node launch.mjs` 运行公开的 `dsh --profile harmony-mobile-replay` 入口。它创建全新隔离 home/agents/temp 目录，拒绝覆盖，只注册固定四响应回放，不允许真实模型或上传。当前候选为 Windows x64，已使用 Node24.13.0 执行。无需安装包或重启当前桌面。

该 Profile 使用规范源码 Session/富交互服务、合成手机适配器和夹具授权。它不连接真实手机，也不激活配对/broker。单独编译的手机工程有原生首次身份 UI，权限仅 INTERNET；签名/安装/真实 HUKS 仍是另行批准的操作。

first-use.2 候选另外携带单独选定的交互[现场入口](FIELD.md)、严格公开设置和现有桌面身份/授权/提供方组合。禁用及无人值守入口会在激活密钥、服务或网络前拒绝。默认流程仍是合成流程；[完整本地接线证据](../docs/phase42-first-use-wiring.md)不能证明手机通过验收，也不授权激活。

源码、原生替身、独立依赖和编译器证据见[首次使用报告](../docs/phase41-first-use.md)。源码构建使用已有且明确解析的工作区工具；可移植运行时自带依赖和 worker 资源。
