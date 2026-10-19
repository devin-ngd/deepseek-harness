# 原生手机客户端离线验收

原生 ArkUI 页面管理配对决定、项目和会话选择、输入、消息流、任务状态、取消及本地撤销。ArkWeb 只显示当前会话的富块，沿用 rich-inline 的 renderer、guest SDK、draft CAS 和 action ledger。共享 TypeScript 管理信任、连接重建、请求关联和会话投影；没有 Electron 桥或任意宿主执行接口。默认配置关闭连接，正式手机运行尚未验收。

## 已验证的有限用户流程

| 用户步骤 | 验收事实 | 实际执行层 |
| --- | --- | --- |
| 启动、未配对 | 默认启动没有文件、密钥或网络 IO；拒绝连接 | 实际 ETS owner，SDK 替身 |
| 核对并确认 | 仅原生决定能力可确认；展示双方公钥指纹和范围；未核对拒绝；只保存公共记录 | 实际 ETS、共享核心、合成现有身份 |
| 连接本地桌面 | 双方新控制证明、瞬时房间密钥、原始授权再次证明；项目和会话只包含授权范围，不返回宿主路径 | 实际 loopback WS、当前源码 Gateway 和桌面插件 |
| 选择、发送、流式消息 | 固定任务进入原 SessionController，观察到实时文本和富块 | 实际合成 SessionController，固定 replay |
| 表单提交 | 实际 HTML 表单经私有 MessagePort 和实际 ETS rich owner 回传；重复 action 得到相同 canonical receipt | Chrome 360/480、SDK 替身、真实 rich-inline 服务 |
| 断线恢复 | 双方控制连接丢失后有限退避、新房间和重新证明；保留原会话、cursor、task id；原任务只派发一次 | 共享恢复 owner、实际 ETS、loopback |
| 历史富块重开 | 新 mount 查询既有 action 的 completed 状态；拒绝富文档发 task.submit | 原 rich ledger 和当前富块投影 |
| 取消、撤销、退出 | 第四固定响应显式取消；本地 tombstone 重开仍拒绝；桌面授权另经原 owner 撤销；端口、文件和 socket 关闭 | 实际 ETS 的 SDK 替身、桌面原 owner |

四个固定响应覆盖任务、rich 查询/动作后的消息和取消。整个流程调用真实源码服务，但所有 Session、身份、授权和任务均为隔离合成数据。原任务派发一次；rich 回调和取消任务合计另两次 prompt；真实模型及上传均为零。稳定观察值比较 [owner-local expected fixture](../tests/fixtures/product-user-flow.expected.json)，详细结果见 [单次用户流程](../evidence/product-user-flow.json) 和 [最终验收记录](../evidence/product-acceptance.json)。

原生入口是 [Index.ets](../harmony/entry/src/main/ets/pages/Index.ets)，使用资源字典显示操作和错误。配对确认需要本地选择的合法公共记录、已存在的 HUKS alias、固定获批 host 和已核实 API；应用不会创建、导入或删除身份。`product.config.json` 的启用标记为 false，host/alias 为空，已核实 API 为 0。公开记录没有 bearer、房间 token 或私钥。

未知持久写入立即拒绝连接并保留专用 owner lock；后续 owner 不会读取旧的允许记录继续使用。连接重建只重建传输，不重发任务或动作。丢失结果保留原请求 id，使用 receipt/status 核对；本地撤销只停止此手机客户端，桌面上的原 grant 需要独立的本地撤销。后台关闭连接及富文档，前台先等待清理并重建本地视图，需要用户再次连接。通知异常、迟到资源和 rich 结果不会绕过清理或代际检查。

## 编译、测试和复核

使用已安装 DevEco Studio 26.0.0.851、SDK 26.0.0.105/API26、Hvigor 6.26.8，未安装或下载新工具。权限列表和 signingConfigs 均为空。生成的 `local.dsh.mobile.offlineproduct` HAP 是默认关闭、仅编译、未签名的成果。SDK 的设备能力、异常处理和 INTERNET 权限提示保留在编译日志中；编译成功不代表这些 API 已在目标手机执行。

133 项测试通过，1 项旧证据写入用例明确排除，141 个模块通过 strict TypeScript 6.0.3。独立复核仅检查源码及断言，未执行程序；所审范围没有剩余源码阻断项。可重复命令依次为：

```sh
node scripts/build-product-core.mjs
node scripts/product-native-substitute.mjs
node scripts/prepare-product-native.mjs
node scripts/product-check.mjs
node scripts/product-test.mjs
node scripts/build-native.mjs --product-test
```

检查使用 source aliases 和独立状态目录。测试启动器移除模型/账户环境，强制四响应 replay，并阻断真实模型和上传。仅临时 127.0.0.1 socket；实际 native NetworkKit/HUKS/FS/WebMessagePort 由显式替身提供，浏览器只运行合成静态文档。API26 编译不安装 HAP，不启动模拟器、不签名。测试不能建立当前手机版本的系统行为保证。

## 剩余现场验收及批准

| 剩余项目 | 对应批准和证据 |
| --- | --- |
| 真实身份和授权 | 批准读取/使用选定身份、初始化公共信任及原桌面 scoped grant；确认当前安装版本和独立 provider；未经批准不激活、替换或重启已安装 DSH |
| 中转部署 | 批准指定目录、服务、DNS/nginx/TLS、证书和开放网络；核对 Linux 文件同步、独立回滚锚、未知写入、断电与代理限制 |
| 手机安装 | 批准签名账户、证书、必要 INTERNET 权限及安装；Mate90 Pro Max/HarmonyOS7 的实际 API、HUKS ECE、公钥编码、密钥保护尚需测量 |
| 原生现场 | 实际 ArkUI 布局/IME、ArkWeb opaque frame/CSP/私有 port/导航、前后台清理与 TLS 验证；同一任务从手机进入实际桌面、流式和 rich 回传同一 Session、重连及重复 action 不重复执行 |

真实模型测试仍禁止；不得从用户未回复推断权限。审批 list/response 和图片扩展未在此最小流程开放，仍明确拒绝并由原桌面审批 owner 负责。首次现场任务应继续采用受控合成任务和固定 replay，真机证据不能由 Web 或 SDK 替身补充。

## 交付和回退

交付一个相对 Phase40 的源码增量 ZIP、一份对应源码的 unsigned HAP，并复用已封存的 Phase40 relay ZIP。没有改动已安装 DSH、服务器或手机，没有提交或 push。封存记录核对每个 ZIP entry 和 HAP 的字节哈希，并核对旧代成果不变。

源码 ZIP 包含变更清单及每个修改文件的前像；回退时只恢复这些客户端文件、移除清单中的新增文件，保留原会话、admission receipt、公共撤销状态、旧档案及无关 dirty 文件。新增手机私有公共记录为 `harmony-product-public-trust/1`；没有改变已发布 Session、原桌面 grant 或 SQLite schema。已封存前代文档和证据保持原字节。
