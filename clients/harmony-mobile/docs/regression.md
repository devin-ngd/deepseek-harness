# 连续阶段与统一验收

唯一完整入口是在客户端目录运行 `node scripts/regression.mjs`（也可 `npm test`）。它不安装依赖，先核对原 v1–v6 ZIP 的历史 SHA-256 和当前全部测试注册，再执行 strict 编译、资源生成、全部 Node 测试、全部 source replay、全部 Gateway/BFF 测试、原生源码禁用检查、旧 Chrome fixture、新移动/桌面 fixture及原生控制器实际HTML/SDK替身的Chrome闭环。它使用新建的 `.build/regression-*` 合成目录、清理后的环境变量和固定 replay；不读取根 `.env`。监听只在临时 127.0.0.1，结束关闭。沙箱的 loopback EACCES 或 Chrome IPC 失败需要原样命令的窄 host escalation；测试断言失败必须修复，不能换运行环境绕过。

权威清单是 [test-inventory.json](../evidence/test-inventory.json)：TypeScript AST 枚举直接 `test`/`it` 注册及 literal `it.each` 表，每个文件带 hash、层级和用例名称。旧 ZIP 中的源文件和用例均逐项比对；缺失文件或用例会使入口失败。退休清单目前为空。新测试文件必须被所属层枚举并纳入实际执行；动态表或新登记方式需要同步扩展枚举器，不能悄悄少计。

阶段报告是各阶段当时执行的子集，不能把它们相加作为当前覆盖率。Node 顶层、source Vitest 和 BFF Vitest 分开计数；两个 phone 子进程测试由 BFF 父用例实际执行，已包含在父用例覆盖中，不再次加入总数。Chrome 数量是断言组，不是 Node/Vitest 测试数。历史 phase5 测试的合成目录曾与 phase4 共用 `actual-bff`，全部用例一起运行时触发 journal 的已有目录保护；现在 phase5 使用自己的 `phase5-actual-bff`，未删除或跳过用例。

旧 phase5 Chrome 用例在点击后立刻查询 status，会先于 guest 的异步 invoke 接纳，得到 canonical `UNKNOWN_ACTION`；现在先等待 snapshot 出现该 action 再查精确 status。生产服务仍明确拒绝未知 action，不增添 null fallback。新历史只读 fixture 使用冷模型，避免将清空旧草稿的 mock 历史版本塞进已有热模型；旧 revision 回退保护继续成立。

第七批最终截图检查曾发现 360px 的标题/说明窄列，而截图前高度断言已通过；该轮没有封存成功 QA。捕获现在明确设置内容高度对应的实际 viewport，等待字体与两帧布局，再按 viewport 截图，检查标题/说明的宽度、高度及捕获前后完全一致。每张截图仍需实际查看，Chrome 断言不代替 ArkWeb 或真机证据；异常原图和报告保留。

每次完整运行在 `evidence/regression-<label>-regression-<label>-<unique>/` 保存命令、日志、Vitest JSON、对应库存和本次产生的证据，失败尝试也保留。阶段1–6既有证据恢复原字节，当前 inventory、phase7 和 `regression-final.json` 更新；新回放与截图保存到本轮独立目录。读取 [regression-final.json](../evidence/regression-final.json) 中的 output 可定位同一轮证据，不能拼接旧通过报告。执行前冻结全部 src/tests/integration/network-tests/scripts 的 SHA-256，结束逐项检查未变化，并保存实际源码依赖 hash；封存脚本再次核对，改代码或测试后必须重新运行统一入口。

执行型 replay Context 仍恰好消费四个固定响应，真实派发和 upload extension 为零，额外第五次调用明确拒绝。新增只读 Context 安装同样的四响应预算但消费零个，项目、会话、历史及附件读取不得 prompt。完整入口检查这些计数、临时 listener 关闭、活跃请求和资源归零。每个测试都使用合成项目、Session 和固定图片字节。

这些结果证明客户端实验的 source-service 与 Chrome 层。它没有通过 `dsh` 支持 profile、现有 Web Connection/SDK mux 或已安装桌面端发起，不能算这些路径的资格证据；ArkTS/HAP由单独官方构建确认；本入口只建立SDK替身/Chrome的native adapter逻辑证据。实际ArkWeb、手机FS/HTTP/port、WAN和真机仍未验证。
