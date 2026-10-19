# 第七批源码交接

本批以冻结源码的统一回归结束，不继续增加合成产品功能。最终清单与实际数量以 [phase7-summary.json](../evidence/phase7-summary.json) 和 [regression-final.json](../evidence/regression-final.json) 为准；后者的 output 指向同一轮全部原始日志、库存、源码 hash、BFF 回放和 Chrome 截图。v1–v6 快照及既有报告保持原字节，新建 v7 为回退点。v7 不含本机依赖、`.build`、凭据或可安装 HAP。

| 功能或约束 | 源码 | 执行证据 | 资格范围 |
| --- | --- | --- | --- |
| 未配对默认拒绝、HTTPS 保留配置不可用 | src/native-disabled.ts、src/network-phone.ts、src/native-runtime.ts | security.test.mjs 与 native-handoff stage | Node 与生成 ESM 静态检查；ArkTS 未执行 |
| 设备撤销/到期/Session 和 operation scope | 现有 link grant 所有者与 src/approval-review.ts | security.test.mjs，全量 Node stage | 合成 grant 的纯状态拒绝；无生产身份 |
| Session/action/revision/expiry 本地审批绑定 | src/approval-review.ts | security.test.mjs，Chrome 伪审批负例 | local-review-only，不授予桌面权限，旧 approval.list 仍只展示 |
| 任务接受/stream/rich/draft/CAS/action/断线幂等 | 共享 PhoneCore/语义模型、canonical rich SDK、限定 BFF adapter | source-replay 9 项、bff-replay 7 项与实际 BFF Chrome | 新合成 Session、固定四响应、真实服务实现；非已安装桌面/标准 mux |
| 历史分页/只读 cache/有界图片/20行消息窗口 | PhoneLibrary、MessageWindow、read adapter | 全量 Node 与本轮 phase6-network/phase6-browser | Node 文件与 Chrome；非 ArkUI/cache/decode |
| 富消息移动与桌面一致 | canonical rich source/guest SDK 和共享视图 | 本轮 360/480/1080 截图及 25 组断言，原 Chrome/BFF 各 15 组 | Chrome reference carrier；非 ArkWeb |
| SDK 与实际平台停点 | harmony/platform.json、禁用 provider、scripts-off RichPreview | native-preflight、native-handoff、inert-native-preview stages | 相关范围未发现工具，SDK版本 null、无权限与构建配置 |

支持 profile、SDK mux、运行容器、native network/cache/port、生命周期及真实审批 endpoint 均未完成，不能把源码存在当编译完成。官方 OS7 页面未提供可核实声明，已停止具体 SDK 调用；[平台适配](native-platform.md) 列出声明、返回类型、资源关闭和最低 API 的逐项验收责任。共享 TS ESM 与 rich guest 分开，后者不得获得 native session/cache/approval 或任意执行桥。

下一轮先提供批准后的官方 DevEco/SDK 版本和路径，核实手机 build/API，再完成 unsigned app-owned 模块执行/关闭，随后 byte-stream、合成 cache 和 port 编译测试。批准依赖步骤分别是工具安装、设备调试/权限/安装、签名、真实桌面 profile/配对/持久凭据、WAN/证书/网络设置；此封存不批准其中任何项。真实模型、GLM、上传、付费、上架、commit 和 push 都没有执行。

回退只需使用某个已封存版本继续独立开发；本批不重启或覆盖用户已安装 DSH。新代码仅在 `clients/harmony-mobile`，原主仓 dirty 文件保持。未来修改 src/tests/integration/network-tests/scripts 后必须重跑统一入口并生成下一版，不能复用本轮 hash 或覆写既有 ZIP。
