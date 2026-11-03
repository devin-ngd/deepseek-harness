# Agent Note: Projection predecessor rows serve through a unit migrate hook; undecidable cold list metadata gets a bounded Agent-free recompute

Status: implemented

[English](2026-10-29-projection-migrate-hook-and-cold-blank-recompute.md) | 中文

## Problem

提升投影单元的 `stateVersion` 会丢弃旧版本的全部持久化缓存行：`viewCheckpoint` 只服务 `ver` 与当前单元匹配的行，因此语义性版本提升会让零 I/O 列表路径读不到任何既有行。当 `sessionListMetadata` 从版本 1（空白 = 没有 `turn/start`）升至版本 2（空白 = 既没有 `turn/start` 也没有 `command/run`，使仅提交过斜杠命令的会话保持可发现）时，所有携带 version-1 行的冷会话失去了缓存的空白状态，按未知处理并保持可见；此前被隐藏的空草稿以无标题行重新出现。

两种 version-1 状态并不对称。version-1 的 `blank: false` 行证明已有轮次开始，在版本 2 语义下同样成立。version-1 的 `blank: true` 行早于命令语义，无法回答是否存在 `command/run`。整体服务旧行会隐藏仅执行命令的会话；整体丢弃旧行会显示空草稿。两种批量答案都不正确，而 [projection-cache 列表身份注记](2026-09-19-projection-cache-listing-identity-and-cached-rows.zh.md) 此前已拒绝在列表路径上恢复无界的正文探测。

## Decision

`ProjectionDefinition` 新增可选的 `migrate(state, version)` 钩子。`viewCheckpoint`——`cachedSnapshot` 背后的零 I/O 读取——在存储状态仍通过当前 `stateSchema` 校验后，把版本不匹配的行交给该单元的钩子；返回状态即服务其视图，返回 `undefined` 则保持该键缺席，由更完整的读取路径重新折叠。折叠播种（`restoreFloor`/`restore`）绝不查询该钩子：迁移值只是服务决定，不是折叠起点。钩子也会看到更新版本留下的行（降级场景），因此它只应回答自己理解的版本。

`sessionListMetadata` 注册的 `migrate` 为：version 1 且 `blank: false` 时原样服务；其余一律不可判定。仍无法判定的冷行——仍为空白的 version-1 行或缺失的缓存记录——由 `packages/api/session-controller/src/list.ts` 的 `recomputeColdMetadata` 回答：只读 `open(id, 'read')`，读取至多 `SESSION_COLD_RECOMPUTE_EVENT_LIMIT` 个事件的前缀（多读一个以识别超大日志），不物化 Session、不激活 Agent。不超出界限的完整日志通过 `coldSnapshot` 完整折叠并刷新存储记录，后续列表重新由缓存服务；超大前缀只在前缀内可见轮次或命令时回答非空白。subagent 来源行（从不按空白门控）、等待迁移的日志（折叠可能误读旧格式事件）、不可读日志以及超大且无法判定的日志保持空白未知并继续可见——重算绝不依据部分证据隐藏会话。

列表的同步快路径保持不变：缓存命中的冷行不跨越微任务边界直接返回摘要，只有未命中才返回 Promise（`list-scheduling.host.spec.ts` 固定该时间片契约）。

## Alternatives considered

**整体服务 version-1 行。** `blank: false` 是可靠的，但 `blank: true` 会隐藏仅执行命令的会话——正是版本 2 要修复的回归。否决。

**丢弃旧行并对每次未命中做冷折叠。** 在前台列表路径上对每次未命中做无界全量日志读取，正是 [列表身份注记](2026-09-19-projection-cache-listing-identity-and-cached-rows.zh.md) 否决的模式；在写回落地前，大型对话会在每次列表时重复支付。否决；有界前缀加上对完整小日志的写回使升级成本只有一次且与规模相称。

**写回迁移后的单行。** 抢救 `blank: false` 不需要写入（零 I/O 即可永久服务），而缓存只公开整记录替换；为单一调用点增加部分行写入面不值得。否决。

**为重算界限提供 Config 配置项。** 该界限是与 `SESSION_SEARCH_RESULT_LIMIT` 同类的安全上限，不是部署选择。否决。

## Consequences

收益：

- 携带旧 version-1 缓存的空草稿在升级后保持隐藏；仅执行命令的会话与已开始对话保持可见；没有会话被重复列出或被新建会话错误复用。
- 重算按行有界、不激活 Agent、自我消除（每个被判定的行都会刷新其缓存记录），且失败安全：一切无法判定的结果都倒向可见。
- 其他投影单元在未来的语义版本提升中获得正式的抢救路径。

代价：

- 缓存无法判定的冷行在记录被重写前，每次列表支付一次只读 open 加一次前缀读取；残余规模很小（旧空白草稿），病态的超大不可判定情形每次列表支付有界前缀。
- `viewCheckpoint` 现在会解析此前直接跳过的版本不匹配行；格式损坏的旧状态仍保持该键缺席。

## Testing

- `session-projection/tests/registry.spec.ts`：`viewCheckpoint` 服务钩子判定的 predecessor 行；不可判定、未知版本与格式损坏的行保持缺席；当前版本行不触发钩子。
- `session-projection-cache/tests/cache.spec.ts`：预置的磁盘记录通过 `cachedSnapshot` 服务迁移后的值；不可判定的记录不服务任何内容。
- `api/session-controller/tests/session-cold.host.spec.ts`：仅含配置事件的持久化草稿经一次有界重算后列出 `blank: true`，伴随 `coldSnapshot` 写回，且不物化 Session、不激活 Agent；仅执行命令的旧会话保持可见；超大日志恰好只读有界前缀，既不折叠也不隐藏；不可读与等待迁移的日志保持可见且不折叠；subagent 子会话从不因空白判定被打开；生产单元的 `migrate` 服务已开始的 version-1 行并让仍空白行保持缺席；进行中的重算读取把取消传播为 `gateway/cancelled` 列表结果且不产出行。
- `api/session-controller/tests/list-scheduling.host.spec.ts`：缓存命中的廉价行在一个工作时间片内保持同步。

## Related

- [Projection-cache 列表身份与缓存行](2026-09-19-projection-cache-listing-identity-and-cached-rows.zh.md)——本改动所基于的读取/折叠身份分离与 cached/sequenced 客户端存储；其中对有界正文探测的否决在此被收窄为仅针对元数据不可判定行的有界、不激活 Agent、失败倒向可见的前缀读取。
