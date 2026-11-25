---
kind: upgrade-guide
description: "Rich Inline 和 Safe External Research 的 profile 依赖与插件条目使用新包名。"
---

# 实验插件包名

[English](guide.md) | 中文

## 变更

`@deepseek-ai/dsh-experimental-rich-inline` 改为 `@deepseek-ai/dsh-rich-inline`，`@deepseek-ai/dsh-experimental-safe-external-research` 改为 `@deepseek-ai/dsh-safe-external-research`。Rich Inline 保留 `rich-inline` 条目 ID 和已保存的交互数据。现有安装在迁移 profile 前仍保留旧包；在旧包启用时安装新 Rich Inline 组合包可能同时激活两者。

## 迁移

1. 在 Desktop 中通过 **Manage dsh Command…** 确认使用的是已安装 Desktop 运行时提供的命令；另行安装的 CLI 不能管理保留的 Desktop profile。完全退出 Desktop，包括托盘进程。备份完整 profile 目录，包括 `package.json`、`pnpm-lock.yaml`、`cordis.patch.yml` 和本地插件 tarball；同时备份引用旧名称的 home 或启动参数 patch。记录组合包顺序、启用状态和旧包的准确来源，以便回退。
2. 获取兼容的新包产物。使用 Desktop 命令，对每个已安装旧包执行 `dsh plugin --profile desktop remove <old-package-name>`，再执行 `dsh plugin --profile desktop add <new-package-spec>` 添加对应新包；本地打包的 Rich Inline 使用新 tarball 路径。整个操作期间不要运行 Desktop。如果命令拒绝管理 Desktop profile，应停止并使用支持该操作的 Desktop 版本。其他 profile 使用各自的 profile 名执行相同操作。
3. 在 profile 的 `package.json` 中恢复 `dsh.profile.bundles` 的顺序和启用状态，仅在旧 Rich Inline 已选中时用新名称替换它。安装会自动启用新组合包。在 profile、home 和启动参数 patch 的插件 `name` 字段中将旧包名改为新包名；保留 `id: rich-inline`、配置和禁用状态。自定义包中的导入和依赖声明也需更新。
4. 重启 Desktop：如果原来已启用，确认只选中一个 Rich Inline 组合包、原配置仍显示，并在新 Session 中验证插件可用；如果原来未启用，确认没有选中。对于 Safe External Research，确认配置条目以预期 provider、模型、来源限制和 worker 工具加载。如验证失败，完全退出 Desktop，连同旧包来源一起恢复备份的 profile 和 patch；不要删除 Session 或插件数据。
