---
description: "可选的消息内 HTML、CSS、JavaScript 插件，使用隔离桌面容器和持久化交互回执。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-rich-inline

[English](README.md) | 中文

## 概述

这个可选配置层让 Agent 在消息内发布任意 HTML 片段、CSS 和 JavaScript。桌面端为每块建立独立原生容器，浏览器显示已保存的文字版本。通过桌面插件管理器安装本地包并启用开关，默认配置不包含它。Host 管理草稿、附件、动作接收和结果；生成页面不能授权工具。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

### 安装到配置

本工作树包含必要的聊天插槽和桌面容器改动。用 `pnpm run dev:desktop` 构建并启动，之后可用 `pnpm run start:desktop` 启动已有构建。在 **Plugins → Add plugin** 输入本地 `.tgz` 绝对路径，完成安装并启用 **@deepseek-ai/dsh-experimental-rich-inline**。停用开关移除配置层并停止新的富交互，已保存的会话数据保留。本包尚未发布，不要按包名从公共 registry 安装。

替换已安装包后，完整退出并重新启动桌面应用。只刷新页面或看到插件 Running，不能证明 Host 已加载新模块。可在下一条任务的轨迹中核对新版系统提示词和 `rich-inline:output-format` 运行时上下文；最终原文应包含 `rich-html` 代码。出现 Markdown 兼容提示意味着该回答没有遵循新输出协议。

构建 Host 和 Client 后打包：

```powershell
pnpm run build:lib
pnpm --filter @deepseek-ai/dsh-experimental-rich-inline run bundle
pnpm --dir packages/experimental/rich-inline pack --pack-destination D:\Temp\dsh-rich-package
```

CLI 管理的 **Web** 配置已验证以下安装/移除路径：

```powershell
$env:DSH_HOME = 'D:\Temp\dsh-rich-profile'
node apps/cli/lib/bin.js plugin --profile web add 'D:\Temp\dsh-rich-package\deepseek-ai-dsh-experimental-rich-inline-0.2.1-alpha.1.tgz' --ignore-scripts --config.auto-install-peers=false
node apps/cli/lib/bin.js plugin --profile web remove '@deepseek-ai/dsh-experimental-rich-inline'
```

CLI 拒绝管理 `desktop`，桌面端应使用应用插件管理器。`dsh.bundle.patch` 激活 [cordis.patch.yml](cordis.patch.yml)，插入 `rich-inline` 项。只有 npm 依赖不会启用插件。验收采用源码 [overlay](../../../apps/web/tests/rich-inline.overlay.yml)。

### 获得的能力

默认的 `activePresets: []` 在整个配置中启用交互输出。设置 `activePresets: [lumina]` 后，仅选择了这个[已声明模式](../../preset/agent-preset-registry/README.zh.md)的会话要求交互输出。其他模式保留普通 Markdown 和编码工具，不提供 rich 工具或格式修正；已有交互卡片仍可查看。Lumina 模式可以使用标准模式的完整子插件列表，从而保留相同的编码能力。

`projectDefaults` 为指定项目目录中的新空白会话选择已声明的模式，不修改恢复或已开始的会话、子目录，或另一个已明确选择的模式。新会话中的模式选择器可在首轮开始前覆盖项目默认值。这两个字段属于 `rich-inline` 项的配置，编辑后完整退出并重启桌面端：

```yaml
activePresets: [lumina]
projectDefaults:
  - path: /absolute/path/to/project
    preset: lumina
```

项目路径必须存在；重复的规范目录会导致启用失败。空的 `projectDefaults` 不添加项目默认值。模式声明和默认值分别配置：未知或不可用的模式由现有模式选择操作拒绝。

在启用的会话模式中，插件提供默认[创作规则](src/host/guidance.ts)，放在通用交付规则之后，并提供写入会话日志的运行时格式提醒；已有会话的下一回合也生效。报告、要闻、方案、列表和对比默认使用有布局、样式及合适本地控件的 HTML，动画和交互界面同样如此。自然提问即可，不必提醒工具名。简短交流及明确要求的文字或源码保持原展示。已有至少 600 字符的结构化长回答显示有明确标注的兼容阅读，不新增模型调用。这仍是 Markdown 的展示，不代表模型生成了交互 HTML；原文可查看，持久化内容不改写。

实时回合准备结束时，插件检查完整发布、唯一块名和块外文字。实质性纯文本回答（至少 160 字符）或非法 `rich-html` 会收到至多一次已记录的格式修正请求（`maxFormatRepairAttempts`，0–2，默认 1）。修正只使用已有结果，隐藏工具定义并拒绝工具执行，不能重复业务操作。简短交流、明确要求文字或源码、已有内容块更新均免除修正。查看历史、挂载及刷新不会触发修正。模型仍拒绝格式时保留原回答及兼容提示，不能视为 HTML 验收通过。

新结果使用 `rich-html` 围栏 JSON，字段为 `key`、`html`、`css`、`js`、`fallbackText`、`stateSchemaVersion` 及可选的 `values`。key 在同一消息中唯一。插件负责渲染，Agent 不运行浏览器或交付截图。只有完整且未中断的助手消息才能提交；Host 重新读取该持久化消息，才创建状态并启用脚本。原有 `rich_inline_publish` 工具和标记继续用于更新及修复；同一 `blockId` 更新原消息。

流式预览在独立的只读原生容器中解码 HTML/CSS，不安装生成的 JS 或业务 SDK。更新最多每 34 ms 合并一次。已完成的同级片段保留 DOM；未完成尾部最多解析 32 KiB，因此较大的未闭合章节可能到最终提交时才完整显示。取消或 JSON 无效时保留源码，不发布内容块。可信控件可以终止预览。最终提交释放预览，再挂载完整校验后的文档。条件轮询覆盖草稿、动作、附件、修复和待应用代码；状态不变时不传输 manifest。渲染器没有固定组件目录。

### 任务进度、问答与可编辑计划

在启用的模式中，`compactLiveProcess: true`（默认）显示一条可展开的实时任务状态行，包含最近一条已入档的公开进度文本和工具计数。已有过程行保留父节点，仍可搜索；思考内容保留在过程折叠区和轨迹中。正在流式生成的回答和最终文档继续显示。中断、失败和夹有用户输入的轮次继续展开；完全展开模式保留所有过程行。停用插件或设置 `compactLiveProcess: false` 可恢复普通实时显示。

`htmlQuestions: true`（默认）通过原有问答通道，在 Desktop 和 Web 展示可信 HTML 表单。表单支持单选、多选、文字、明确跳过，以及按会话保存并恢复浏览器草稿。计划审查保留规范 Markdown，提供编辑框和预览：可以直接提交原计划，也可以修改后批准；选择退回修改可提交反馈。提交的 `reviewedPlan` 成为 `exit_plan_mode` 返回的 `plan`。关闭调用原有的问题关闭操作。生成文档中的脚本不能完成这些请求。设置 `htmlQuestions: false` 可使用普通问答面板。

持续更新的文档只发布一次代码，通过 `window.rich.onState` 渲染数据。`rich_inline_update` 接收 `blockId`、`expectedRenderRevision`、`expectedDataRevision`、完整 `values` 和可读 `fallbackText`；它拒绝过期写入，只替换已确认数据，不替换代码、不重新挂载原生页面，也不改变未提交草稿。代码替换使用 `rich_inline_publish`。更新结果提供新的 `dataRevision`；提交交互时也携带页面和数据版本。普通进度不需要新增页面或业务动作 ID。

### 内置暗色样式

默认的 `theme: cyber`、`accent: auto` 为每个原生预览和最终内容块安装同一份基础 CSS，重新打开历史内容块时也会应用。[样式配置](src/shared/theme.ts) 来自 Host profile，模型规则和 Client 使用相同设置。即使 `css` 为空，语义化标题、列表、表格、代码、折叠内容及控件也有统一的间距、对比度和焦点提示。外层聊天主题保持原设置。

在“插件”页打开本组合包详情，在“交互内容主题”小节中选择主题，每个选项都预览对应配色。选择结果保存到 `rich-inline` 行的 profile `config`，Host 无需重启。已打开的内容块先保存草稿，再用新样式重新加载；草稿无法保存的内容块保留原样式和输入。不使用该页面时，可在 profile 层设置相同字段，然后退出并重新启动 Desktop；使用默认值时无需额外配置：

```yaml
theme: cyber
accent: auto
```

`theme` 可选 `cyber`、`aurora`、`neon`、`terminal`、`ember`、`dark`（石墨）或 `none`。`accent: auto` 使用各主题自带的强调色组合；`blue`、`violet` 或 `teal` 会替换它。所有样式都是暗色，并声明相同的 `--rich-*` 变量和类，自写 CSS 在切换后依然适用：

| 主题 | 风格 | 背景、正文、自动强调色组合 |
| --- | --- | --- |
| `cyber` | 深空控制台：顶部细网格、角标、等宽标签、纯文本 `h1` 渐变 | #070b14、#d6e2f3、#3dd0ff + #8b7bff |
| `aurora` | 极夜极光：柔和的绿紫光带、圆角半透明卡片、胶囊标签 | #071318、#d5e7e6、#4ee3b0 + #a77bff |
| `neon` | 合成波：品红地平线光晕、竖向网格、发光标题、等宽标签 | #0d0718、#e6dcf5、#ff4fd8 + #36e4ff |
| `terminal` | 荧光终端：等宽正文、扫描线、直角、平面卡片 | #050a06、#c6e8cc、#3dff7a + #2ee6d6 |
| `ember` | 暖炭色背景，琥珀到玫红的光 | #110b08、#ece0d6、#ff9a3d + #ff5e7a |
| `dark` | 沉稳石墨，单一柔和强调色，几乎不发光 | #121317、#e3e5ea、#7aaaff + #b49cff |

替换强调色在发光主题中分别为 #3dd0ff/#8b7bff、#b28dff/#4cc2ff、#2ee8c6/#4d9bff，在石墨主题中为 #7aaaff、#b49cff、#5cd4c0。在所有主题和强调色下，正文对比度至少 7:1，次要文字、强调色文字及主按钮文字至少 4.5:1，输入框边框至少 3:1。正文不发光。`theme: none` 关闭基础 CSS 及主题创作规则，保留富交互输出。

每个内容块是一张卡片：可信标题栏包含标识、标题、状态和工具按钮，位于内容块背景上，下方一条细分隔线，之后直接是内容，不再套第二层边框。`rich-answer` 是无边框的包裹层。标题栏、提示行和折叠区读取同一套配色，因此在任一聊天主题下都呈现为一个整体。发光主题的边框带强调色，顶部有边缘光，流式预览期间有扫描光沿边缘移动；开启减少动画偏好后停止。生成的 CSS 在主题之后加载，可以局部覆盖变量或规则；基础元素规则的优先级为零，任何自写选择器都会生效。旧内容写死的颜色仍按原优先级生效；重新生成该结果可采用完整的样式约定。

提示词要求先给简明结论、标题适中、装饰克制、对比度清晰，交互应有实际用途。按内容选择结构，不把所有回答变成仪表盘：

| 常见输出 | 可复用样式 |
| --- | --- |
| 解释或分析 | `rich-answer`、`rich-lead`、`rich-section`、`rich-muted` |
| 对比或可搜索列表 | `rich-table-wrap`、`rich-list`、`rich-tabs`、`rich-badge` |
| 流程或检查清单 | 有序列表使用 `rich-steps` |
| 研究或要闻 | 分节、原生 `details`、`rich-sources` |
| 数据摘要或图表 | `rich-grid`、`rich-card`、`rich-value`、主题图表颜色 |
| 表单或交互工具 | `rich-form`、`rich-actions`、`rich-primary`、带标签的控件 |
| 代码或排错 | 语义化 `pre`/`code`、`rich-callout`、`rich-warning` |
| 动画或演示 | 使用主题颜色的自定义场景与本地动画控制 |

这些类均可选，仍支持任意 HTML/CSS/JS。响应式网格在窄屏收为单列，宽表格在自己的容器内滚动，基础样式尊重减少动画偏好。[四个可运行示例](examples/theme.ts) 展示问答、对比、本地表单和可筛选的条形图。开发者可从 `@deepseek-ai/dsh-experimental-rich-inline/theme` 导入 `RICH_CYBER_CSS`、`RICH_DARK_CSS` 或 `richThemeCss()`；插件已自动注入，模型回答无需重复附带整份样式。

助手输出示例（消息界面渲染该对象）：

````text
```rich-html
{"key":"hello","html":"<section class='rich-answer'><h2>Hello</h2><button>Count</button><output>0</output></section>","css":"","js":"let n=0;document.querySelector('button').onclick=()=>document.querySelector('output').textContent=String(++n)","fallbackText":"Hello: local counter","stateSchemaVersion":1}
```
````

内容中的 `window.rich` 提供状态、草稿保存、提交、查询和取消。具名表单控件可这样绑定：

```js
rich.bindForm(document.querySelector('form'));
rich.onState(snapshot => {
  document.querySelector('output').textContent =
    snapshot.actions.at(-1)?.state || 'Ready';
});
```

本地交互不必调用模型。提交进入普通 Agent 回合；accepted 回执证明已持久接收，不代表完成。Agent 用 `rich_inline_complete` 记录已知结果，用 `rich_inline_progress` 报告进度。文件选择属于可信工具栏，提交默认携带当前块的授权引用。[examples/content.ts](examples/content.ts) 是创作示例，不是支持类型上限。

Agent 生成完整代码并返回发布对象或旧格式标记，插件负责渲染。脚本异常和未处理 rejection 会作为限定范围的诊断反馈给 Agent 修正代码。每版本只反馈一次，每块整个存续期默认最多自动修复两轮（`maxAutoRepairAttempts` 可设为 0–5），刷新不补充预算。修复使用 `expectedRenderRevision` 拒绝过期替换，保留输入格式，省略 `values` 以保留已确认数据。草稿保存后兼容修复自动应用；格式改变仍要求可信确认。保存失败保留原内容，修正输入后显式更新。关闭停止自动应用，但不撤回已排队的 Agent 回合。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

| 文件 | 职责 |
| --- | --- |
| [cordis.patch.yml](cordis.patch.yml) | 显式插入配置层，不改默认配置。 |
| [src/host/index.ts](src/host/index.ts) | 归属、草稿 CAS、引用、持久化发件箱与结果核对。 |
| [src/host/tools.ts](src/host/tools.ts) | 发布和因果关联的完成/进度。 |
| [src/shared/types.ts](src/shared/types.ts) | `lumina-rich/1` 快照、回执与输入。 |
| [src/client/controller.ts](src/client/controller.ts) | 原生生命周期、更新同步与恢复。 |
| [src/client/guest-sdk.ts](src/client/guest-sdk.ts) | 最新表单输入、保存与重试。 |
| [桌面 rich-guests.ts](../../../apps/desktop/src/rich-guests.ts) | 进程隔离、能力阻断与终止。 |

每个 Session 的权威记录原子保存草稿、原始回执和发件箱。派发使用稳定的 Session 请求 ID 与既有持久化机制。相同动作重试返回原始回执，同一 ID 改变内容会冲突。完成必须来自所属 Session 的成功工具结果和对应回合。接收、完成和外部副作用是不同事实。

已挂载或存在草稿时，代码替换进入待更新。可信按钮先同步当前输入，再撤销旧 lease。兼容格式保留编辑，不兼容格式要求可信归档确认。归档草稿可在生成内容之外查看和复制。临时 DOM 状态留在本地，除非显式保存。历史查看不重放动作。Session 分支只恢复继承前缀的发布事实，不继承父会话动作、草稿或授权；继承块只读。

每块使用新的非持久分区和独立原生进程，保留 `sandbox`、`contextIsolation`、`webSecurity`，禁用 Node。preload 只提供有界 JSON 通道，主进程绑定真实所属窗口及 lease。网络、WebRTC、导航、弹窗、下载、权限、页面文件选择和拖放均阻断。死循环块可关闭、重载，聊天仍响应。支持 DOM、内联 CSS、data 图片/媒体和单独的 `js` 字段；HTML 事件属性、外部依赖、worker 和动态求值受限。

默认上限：发布 2 MiB、输入 128 KiB、每文件 10 MiB、每 Session 128 块和 2,000 动作。原生 SDK 预留 64 KiB，恢复快照 Host→内容上限 16 MiB。修改前按 UTF-8 字节检查。保存失败保留可编辑本地输入并显示可信警告，刷新前应复制或修正。超限恢复状态保留完整存储并显示文字。数据包洪泛明确终止对应块。轮询默认一秒，可配置为 250–60,000 毫秒。

验证命令（每次使用新结果目录）：

```powershell
node apps/desktop/tests/check-rich-native-build.mjs 'D:\Temp\rich-static-new'
pnpm exec vitest run apps/desktop/tests/rich-native-lifecycle.spec.ts apps/desktop/tests/rich-guests.spec.ts packages/experimental/rich-inline/tests packages/client/ui-chat/tests --maxWorkers 2
node apps/desktop/tests/run-rich-native.mjs 'D:\Temp\rich-native-new'
$env:DSH_RICH_EVIDENCE_DIR = 'D:\Temp\rich-chat-new'
pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/rich-inline-native.e2e.ts
$env:DSH_TEST_CHROMIUM_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/rich-inline.e2e.ts
```

真实 Electron fixture 检查恶意行为和进程参数。原生聊天测试使用真实 Loader、Host、Session 和 Client，仅模型采用确定性替身，验证发布 → 输入 → Agent → 更新闭环，无付费调用。验收必须包含退出码 0、完整启动状态、通过的断言和已检查截图；仅进程存活或 CSP 配置不足。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

参见[桌面端](../../../apps/desktop/README.zh.md)、[聊天](../../client/ui-chat/README.zh.md)、[插件管理器](../../boot/plugin-manager/README.zh.md)和 [Session 持久化](../../session/session-persistence/README.zh.md)。模型工具仍受既有 Harness 权限检查和 Agent 循环控制。

-----

<a id="model-experience"></a>
## 模型体验

### 交互工具

#### 模型所见

启用的插件项注册全局创作提示词及发布、完成和进度 schema。提交 JSON 进入标记 `inputTrust: "untrusted-rich-ui"` 的用户消息；界面提供数据，不提供授权。渲染诊断标记 `inputTrust: "untrusted-render-diagnostic"`，与业务动作分开。发布返回短标记，不代表运行成功；HTML 和脚本留在普通工具参数和历史中。

#### Token 影响

成功渲染、轮询、保存和本地交互不调用模型；提交和有次数上限的渲染修复进入普通模型回合。创作提示词和工具增加提示词 token，大内容增加历史 token。本包不选择账号或提供方。

#### KV Cache 影响

交互追加既有 Session 事件，不重写旧消息或替换 Agent 循环。启用工具按照既有请求头规则改变有效 schema 集。创作规则段落对所有主题相同；切换主题只改变每轮运行时上下文中注明的当前样式。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 原生验收覆盖 Windows Electron 44，其他操作系统和签名安装程序未验证。完整 Agent 链路使用确定性替身，不属于真实模型验收。Web 显示文字，不执行 JavaScript。

- rendered 信号只表示 SDK 存活，不代表视觉正确或安全验收通过。自动反馈覆盖脚本异常和 rejection，排版问题仍需用户反馈。模型可能不遵循提示词，替身验收不能证明真实模型遵循情况。完整替换系统提示词的 preset 仍会收到已记录的运行时格式提醒。含渲染诊断台账降级前，请阅读[升级说明](../../../docs/upgrade-guide/v0.2.0-rc.2/rich-inline-render-feedback/guide.zh.md)。

- 通道允许提交和取消，不允许任意工具或网络。运行中取消只记录意图，迟到已知结果仍显示。外部结果未知时需先核实再发起新业务动作，不承诺外部操作 exactly-once。可执行内容更新采用重新挂载，不修补正在编辑的 DOM。归档恢复采用手动复制，每块保留最近 16 份。草稿异步保存，刷新前应等待持久化完成。旧报告的链接仍受原生导航策略控制，可从原文视图经可信聊天控件打开来源。

- JSON `single` 重写台账单元，Session flush 可能等待其他写入。大规模使用应评估既有 SQLite 后端。无法恢复的继承历史显示文字，不借用其他会话状态。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护工作上下文——点击展开</summary>

无。

</details>
