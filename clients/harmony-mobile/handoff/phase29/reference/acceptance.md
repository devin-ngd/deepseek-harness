> 本文是生成副本，仓库相对引用保留为源码位置，不代表安装文件。

# 截至 v28 的验收矩阵

本参考用于判断接入产品前还缺哪些证据。当前应用是 v27 HAP，v28 只改运行编排并在该 HAP 上通过 socket 恢复。版本、层级与后续影响的完整记录在 验收台账（源码引用：../evidence/phase29-acceptance-ledger.json）；历史失败保持原结果。

## 当前结论

最后一次完整离线集合是 v17：167 个 Node、12 个 source replay、18 个 BFF，共 197 个独立用例；3 个嵌入子进程用例已包含，87 组 Chrome 断言另计。v27 的 131 个相关用例有通过记录，其中两个准备问题修复后的定向复测是 22/22；这不是最新版全套。v28 的编排测试 26/26、严格检查 72 模块、原生 socket 用例 1/1 各有自己的证据，不能相加成为一个全产品通过数。

| 能力 | 已执行版本与结果 | 后续影响 | v27 HAP / v28 编排的状态 |
| --- | --- | --- | --- |
| TS 协议、语义投影、幂等、权限范围 | v17 完整离线；v27 相关定向回归 | v23 时钟、v25/v27 观测与关闭 | 有定向证据，没有当前全套声明 |
| 项目/会话/历史/图片 | v6–v17 合成服务与 Chrome | PhoneCore、解析、配置变更；无真实桌面目录 | 原生生产目录未验收 |
| FS/cache/私有 port/guest 隔离 | v10/v11 离线包；v14/v16 对 v13 网络 HAP 的部分观察 | 后来启用 INTERNET、私有 HTTP、宿主关闭及诊断变更 | 历史部分证据，不能覆盖完整新版隔离 |
| 任务、流式、rich 表单/draft/action、取消、重开 | v14/v16 部分通过；v18 用 v17 HAP 通过四个基础 checkpoint | v23 53s TTL；v25/v27 共用宿主改动 | 当前 HAP 尚未复验完整基础闭环 |
| 断连后 cache.restore | v16 失败，离线修复后 v18/v17 HAP 通过 | v27 关闭发布路径变化 | 保留旧通过，需新版基础组复核 |
| 服务 generation / 旧 mount / 原 receipt | v18/v17 HAP 第四组通过 | 时钟与观察 wrapper 改变 | v28 没有重开服务，不能代替该组 |
| malformed / truncated / required unknown / budget exhaustion | v20/v17 HAP 四项通过，整轮仍是 4 pass / 3 fail | v23 时钟、v27 观测与关闭 | 当前 HAP 未跑四项 |
| cursor gap / conflict | v20 失败，v22 阻断，v24/v23 HAP 两项通过 | v25/v27 初始帧观测变化 | 不自动继承到 v27 |
| socket 恢复与最新探针可见 | v18/v20/v24 失败，v26 初始诊断阻断；v28/v27 HAP 通过 | v28 没有重编或改变应用 | 此单项有当前原生实证 |
| 时钟与期限 | v23 单调预算/跳变负例；v24/v28 受控时差采样通过 | 尚无生产校时、持续 grant epoch | 受控 replay 证据，非 WAN 协议 |
| 真实审批 | realReplayPorts 返回空审批列表；无回应操作 | 尚未接 Agent scoped waterfall | 未实现真实审批闭环 |
| 用户已安装桌面、设备授权、WAN、真机 | 尚未执行 | 安装版本、身份与生产传输均待确认 | 未验收 |

## 最小必要回归

R1 在下一次实际修改协议、PhoneCore 或生产绑定时执行：相关 wire/domain/link/clock、NativeAppHost/私有 HTTP 与新 binding 的纯测试，再做一次隔离 source/BFF 合同回归。改变模型或产品输出的代码要更新对应的合成输出证据。只改文档和交接包时不重跑完整集合。本批只验证台账、来源 hash、独立交接程序和文件格式。

R2 在安装前执行：同进程真实服务端口的假调用测试，覆盖 capability 缺失拒绝、设备/会话/方法 scope、接纳持久化先于派发、unknown 不重发、同 requestId/actionId 内容冲突、撤销及旧 grant/mount、$events pending 生命周期、两端同时回应、审批只能来自可信原生 UI。所有模型和用户数据均使用合成端口或固定 replay；这不是安装实例测试。

R3 在将来对应批准的原生窗口执行：用同一最终 HAP hash 一次复核四个基础 checkpoint，以及六个非 socket 故障组。追加 cache 的 Session 切换/关闭、guest 最小否认组与 native 审批生命周期。若应用和传输未变，不为凑数重跑已通过的 v27 socket；如果变了，其 v28 结果转为历史证据并复验。真机键盘、平台隔离、签名和 WAN 分别有自己的验收，不能由 Chrome、SDK 替身或 API26 模拟器替代。

## 版本来源

手机共享语义投影仍依赖 v15 隔离投影来源（源码引用：../projection-source.json），主仓还有用户 dirty 变更。安装插件前必须对齐安装实例的公开 release metadata、包版本、生成的 Remote 导出和 rich 投影版本；当前源码版本不代表安装版本。此阶段没有读取真实会话、profile patch、cookie 或凭据，也没有启动已安装桌面。
