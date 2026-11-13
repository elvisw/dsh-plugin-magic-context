## 要解决的问题 / Problem

希望增加 `/ctx-flush`，让用户主动要求处理**当前会话已排队的回收操作**，而不必等待正常的压力阈值或缓存 TTL 调度。

`ctx_reduce` 的“先入队、择机执行”有利于保留缓存，但用户已经愿意承担一次缓存失效时，目前缺少明确的手动入口。希望不必为此调低全局阈值、制造额外上下文压力，或用会调用 Historian 的摘要命令代替。

### 已核查的当前状态

2026-11-11 核对上游默认分支，HEAD 为 `93ef5fe4a06a2c05f53e6a6225346919e860d74e`，插件版本为 **`dsh-plugin-magic-context@0.11.1`**。这是源码核查与原版对照，未为本功能另行运行新的真实宿主/模型实验，不声称默认阈值下的所有队列路径都已实测。

- 插件注册了 `ctx-status`、`ctx-recomp`、`ctx-profile`、`ctx-global`，没有发现 `ctx-flush` 或等价的用户主动强制落地入口。
- `ctx_reduce` 仅排队；待回收项由管理拍处理。**自动处理队列的底层能力已经存在**，缺的是用户显式触发能力，不是整个回收功能未实现。
- `/ctx-status` 查看压力、决策和队列，没有执行回收；`/compact` 的手动路径调用 Historian 并写 checkpoint，不等价于 flush。

固定源码：

- [命令注册：index.ts](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/src/index.ts#L643-L680)
- [ctx_reduce 排队语义：tool-bridge.ts](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/src/dsh/tool-bridge.ts#L17-L20)
- [待回收项实际落地：management-pass.ts](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/src/dsh/management-pass.ts#L646-L660)
- [状态命令](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/src/dsh/status-command.ts)、[手动 checkpoint 路径](https://github.com/wk544863858/dsh-plugin-magic-context/blob/93ef5fe4a06a2c05f53e6a6225346919e860d74e/src/dsh/compaction-engine.ts#L298-L309)

## 建议的方案 / Proposed solution

建议提供 `/ctx-flush`，语义尽量对齐原版 Magic Context，但按 DSH 的 surface 和缓存机制适配，不要求复制内部实现：

1. 只针对当前会话，强制处理已排队的有效回收项，不再等待正常阈值/TTL；不等于进入全局紧急回收档，也不能额外回收用户未标记的内容。
2. 刷新或失效受影响的上下文注入缓存，让变化最迟在**下一次模型请求**中生效。不要求命令在当前画面中同步清空内容；若仅设置下一拍强制执行标记，回执要明确“尚待下一次请求落地”。
3. flush 本身不应为处理队列而启动新的 Historian、recomp 或摘要模型调用；已有后台任务及后续正常管理拍仍按各自策略运行。已有 ready compartment 是否也随下一拍发布，由维护者明确边界，不将“强制生成摘要”混入本需求。
4. 返回真实状态，例如已处理数量、待下一拍数量、无待处理项、跳过/失败原因。空队列或重复调用应幂等；不能只返回成功而不改变状态。无活动会话、功能关闭或存储不可用时明确拒绝，不跨会话处理。
5. 遵守工具调用配对、有效性及必要保护边界；文档说明主动 flush 可能打破缓存、增加下一次请求的计费输入，以及和 `/ctx-status`、`/compact`、`/ctx-recomp` 的区别。

### 原版实际行为与参考边界

原版并不是“运行命令就同步清空上下文”：核心 `executeFlush` 将 pending 项更新为 dropped、移出队列，返回 `Changes take effect on next message`；适配器还需要发出刷新/强制 materialization 信号，确保下一次请求不会继续 defer 或复用旧注入。

- [原版 v0.49.30：execute-flush.ts](https://github.com/cortexkit/magic-context/blob/v0.49.30/packages/plugin/src/hooks/magic-context/execute-flush.ts)：该版本已具有核心 flush，不是仅依据更新主干推断缺失。
- [固定提交的命令说明](https://github.com/cortexkit/magic-context/blob/3c2b53940270b7e020b8ee23e8ce10214430f50e/packages/docs/src/content/docs/reference/commands.md#ctx-flush)：强制处理队列并刷新缓存，下一次模型请求生效。
- [同一固定提交的 Pi 适配器](https://github.com/cortexkit/magic-context/blob/3c2b53940270b7e020b8ee23e8ce10214430f50e/packages/pi-plugin/src/commands/ctx-flush.ts)：分别发出 history refresh、pending materialization、system prompt refresh 信号；DSH 不必照搬这些 API。

这些原版参考仅做源码/文档核查，未另行运行原版验收。

### 与其他 Issue 的关系

- **不是 #13 的替代修复。**#13 是原位恢复后重新入队状态错误，导致记录不再被 pending 查询选出；若 flush 仍依赖相同查询，仅新增命令不能修复该缺陷。首次正常入队就足以验证本需求，不应混入 restore/requeue。
- **不解决 #14。**本需求不包含 Historian 发布后的原文独立检索或 `ctx_expand` 语义改变。

### 建议验收（尚未实施或运行）

- 新会话首次读取合成内容并排队，在正常阈值/TTL 尚不满足时调用 flush；下一次模型请求中确认原文已被占位符替代，不只检查成功回执。
- 原始事件仍可追溯、其他会话不变；刷新后不重放旧注入内容，不额外回收未排队项。
- 空队列、重复调用、失效标识、无会话、功能关闭、存储失败均有真实且可诊断的结果。
- 单独验证 flush 没有额外触发摘要模型调用；若做真实 DSH 测试，隔离 profile、会话和插件数据库，记录触发条件与成本边界。

## 备选方案 / Alternatives considered

- 等待自动管理拍：仍保留为默认行为，但不能满足用户显式“现在处理”的意图。
- 临时降低阈值/TTL：需要改策略，影响范围大，也容易忘记恢复，不适合作为常规手动入口。
- `/compact` 或 `/ctx-recomp`：会生成/重算摘要，工作范围和模型成本都不同，不能直接代替 flush。

## 公开披露

已检查现有公开 Issue，未找到同类请求。本文仅含源码结论、原版参考和拟议验收；不含密钥、私人会话、数据库或本机绝对路径。未实现插件变更，建议不代表维护者已接受或已有测试通过。
