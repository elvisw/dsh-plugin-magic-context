# Recovery Contract — T1

状态：**已签收（2026-11-13）** — Q1 A-only；Q2-B `tag` + `message`；Q3 `tag` 为正式参数、`tags` 为多 tag 过渡别名；Q4 标记 + 下一次 preStep；Q5 移除/关闭 30 天 prune，按原版消息/会话删除与 `compacted` 状态。
对象：`dsh-plugin-magic-context@0.11.2`，DeepSeek Harness `0.2.2-rc.1`
性质：行为契约，不是实现计划；实现细节留给 T2–T5。

## 0. 验收口径与兼容目标

- **兼容目标：原版 `cortexkit/magic-context` 的语义**，不是本 fork 既有 `dsh-plugin-magic-context` 的行为。
- **不承诺兼容 fork 上游的既有行为**；旧 0.11.1/0.11.2 的原地恢复体验不作为契约。
- **DSH 仍是宿主**：原版的标识（消息序号、事件模型）不能直接照搬；需要 DSH 映射时必须写明。
- **验收 gate：** 插件在 DSH 可用；不要求运行级 upstream parity。上游参考是既有研究记录（固定提交 `33fb6ac9` / `17801ffd`），不是本轮运行。

| 依据 | 用途 | 等级 |
|---|---|---|
| `research-context-lifecycle.md:49`、`claims-mc.md:6`（ref=8）、`verifier-mc.md:8`、`analyzer-q2-mc.md:9` | 上游 `ctx_expand` 返回新结果、不撤销缩减 | 源码+独立复核，`33fb6ac9` |
| `research-context-lifecycle.md:51-53` | tag 按持久化身份；raw history 与 LKG 分离；恢复有类型边界 | 源码+复核 |
| `research-context-lifecycle.md:65-69`、`analyzer-q4-tests.md` | 测试边界：缓存 fixture、SIGKILL、Windows、raw source 依赖 | 测试断言 |
| `research-context-plugin-landscape.md:33`、`issue-ctx-flush.md:34-38` | 上游 flush 语义 | 源码/文档，`v0.49.30` |
| `acceptance-windows-dsh-2026-11-13/acceptance-report.md` | 0.11.2 在 DSH 的实际行为；#13/#14 仍复现 | 真实宿主+真实模型 |

## D1. `ctx_expand` 语义（#13 A，已定）

**决定（2026-11-13）：A-only。** 不做原位恢复，不保留双模式。

1. `ctx_expand` 按 tag（或 T3 的 `message` 回退定位，见 D4）读取持久化原始历史，把原文作为**本次工具结果**返回；不修改旧占位符、不修改旧节点的内容或身份。
2. 旧 tag 保持 dropped；再次 `ctx_reduce` 旧 tag 是 **no-op**，回执明确 `already dropped`，不得再回 `Queued`。该判定必须基于持久化 pending/landed 状态，不依赖 live 占位符；pending 返回 `already queued`，landed 返回 `already dropped`。
3. 本次 `ctx_expand` 结果由宿主现有的 post-execute tagger 分配**新 tag**；后续 `ctx_reduce` 新 tag 正常入队、落地。
4. `ctx_expand` 不得以“当前 surface 上仍可见占位符”为前提；占位符不可见时，仍应能按持久化 tag 读取 raw history。
5. 如果 tag 不在当前会话、已随消息/会话清理、或原始来源缺失：显式拒绝，不生成替代内容，不重新执行原工具。
6. 这条替换现有原位恢复路径；旧 0.11.1 的 “expand 撤销回收、同 tag 再回收” 用例不再适用。

**失败路径：** `no such tag` / `not a tool-result tag` / `tag no longer available` / `raw source unavailable` / `cross-session tag` / `not dropped` / `not dropped yet` 均为可诊断错误。单 tag 为全有或全无；仅 deprecated 多 tag `tags` 允许部分成功，逐 tag 返回结果。

## D2. Historian 后的原文读取（#14）

**决定：复用 D1 的读取路径，不新增第二套恢复模式。**

1. Historian 发布 compartment 后，旧 tag 的占位符可能已不在 surface；`ctx_expand` 仍按持久化 tag 读取 raw history，返回新结果。
2. 不撤销 compartment、不重建旧位置、不重新生成摘要、不重新执行原工具。
3. 摘要保持不变；这里的“不变”指已发布 `compartments` 行的 `tier_p1..p4`、`facts`、`events`、`importance`、`covered_*`、`baseline_epoch`、`landed_event_seq`、`landed_reason`、`superseded` 字段不变。后续正常 pass 把同一个摘要重新渲染进 baseline 节点，单独记录，不算摘要重写。原文只出现在本次 `ctx_expand` 结果中。
4. 如果 tag/message 已过期或 raw source 缺失：显式失败；不得用摘要文本冒充原文。
5. **类型边界：** 文本与工具输入/输出可恢复；reasoning/结构噪声可能省略；附件/图片可能只返回位置或提示，不作字节级还原承诺（`research-context-lifecycle.md:53`）。
6. **定位标识：** 原版支持 tag、message、start/end、verbose；DSH 的事件序号不是原版消息序号。V1 做哪些见 Q2。

## D3. `/ctx-flush`（#15）

1. 命令名 `/ctx-flush`（假设；实现时核实命令注册拼写），只处理**当前会话**的 pending drops；不跨会话。
2. 命令本身只登记“强制处理”标记并返回状态；真正的 surface 改写由下一次 `preStep` 的管理拍执行，最迟在下一次模型请求生效。
3. **缓存刷新：** flush 必须使受影响的上下文注入缓存失效或刷新，确保下一次请求不继续复用旧注入内容；若只设置下一拍标记，回执必须明确“尚待下一次请求落地”（`issue-ctx-flush.md:27`）。
4. 不启动 Historian、不调用 recomp、不生成摘要；已有后台任务按各自策略运行。已有 ready compartment 是否随下一拍发布，不在本契约内，由 T4 明确并记录。
5. 不额外回收用户未标记的内容；不改变保护窗口、tag 保留期或阈值。
6. 返回真实状态：`processed`、`pendingNext`、`noop`、`refused`（含原因）；空队列、重复调用、无活动会话、功能关闭、存储失败都必须可诊断。
7. 幂等：同一会话重复 flush 不重复处理；已落地项不再入队。

## D4. 工具 API 形状

**原版形状：** `ctx_expand` 支持 `tag`（单数）、`message`、`start`/`end`、`verbose`；`ctx_reduce` 用 `drop`。本 fork 现有 `tags`（复数、逗号分隔）是 fork 形状，不是原版形状。

| 工具 | V1 候选 | 说明 |
|---|---|---|
| `ctx_expand` | `tag`（原版单数） | 首选；T2 实现 |
| `ctx_expand` | `message`（DSH 映射） | 原版按消息序号；DSH 映射到 **log event seq（含 shadowed 事件）**；不是原版消息序号；T3 实现 |
| `ctx_expand` | `start`/`end`、`verbose` | Q2 已定：V1.1 后置 |
| `ctx_reduce` | `drop`（逗号分隔） | 与原版一致，保留 |

**Q2 决定（2026-11-13）：V1 做 `tag` + `message`；`start`/`end`/`verbose` 留到 V1.1。** `message` 映射到 DSH 的 log event seq（包括 Historian 后已 shadow 的原始事件），文档必须写明“不是原版消息序号”；范围/详细输出需要单独验证，不为了形状相同引入错误标识。

**Q3 决定（2026-11-13）：`tag` 为正式参数；`tags` 仅保留为 deprecated 多 tag 过渡别名。** 别名继续接受旧逗号/区间写法，只用于避免现有 DSH 会话和测试硬中断，不写进兼容承诺，下一 major 移除。

**2026-11-13 交付拆分（签收后修正）：** Q2/Q3 的目标不变，但拆成 V1a（T2：`tag` + `tags` 别名）、V1b（T3：`message` 回退定位）、V1c（T5：保留期对齐）。拆分只改交付顺序，不改变“V1 做 `tag` + `message`”的决定。

**T3 补充（2026-11-14，签收后澄清）：** `message` 是 `tag` 的**备用定位**，不是通用历史浏览器。它只读取**已经被 drop** 的 tool result，并复用 tag → call identity → 原始 `tool/result` 的读取路径；不改变 drop 状态，不新增 pending，不跨会话。`message` 的值是当前会话的 **DSH log event seq**，可以指向原始 `tool/result`，也可以指向 landed 的 `[dropped §N§]` 占位符；它不要求占位符仍在 surface 上。`[compacted §C1§]` 不是 `tool/result`，必须拒绝，调用方应传原始 `tool/result` 的 seq。`message` 的 seq 由 harness/UI/journal 提供，模型通常只看到 tag。`message` 与 `tag`/`tags` 互斥；只用非负安全整数（`/^(?:0|[1-9]\d*)$/` 且 `Number.isSafeInteger`；DSH 日志 seq 可以为 0）。空 `message` 单独出现按非法值拒绝；空 `message` 与有效 `tag`/`tags` 同时出现时按未提供处理，让 tag 路径继续。未 drop 的项与 tag 路径一样按 `not dropped`/`not dropped yet` 拒绝。若 message 指向的 call 有持久化占位符暴露了 tag 号、但 tag 行已不存在，返回 `tag no longer available`；若既无 tag 行也无任何持久化占位符 tag 号，返回 `not a tool-result tag`。判断按 call 级进行，因此 message 指向原始 `tool/result`、同一 call 另有占位符时也适用。

## D5. 失败、降级与保留期

| 情况 | 行为 |
|---|---|
| tag 不存在 | 拒绝，`no such tag`；不猜内容 |
| message seq 不存在 | 拒绝，`no such message`；不猜内容 |
| message 指向非 `tool/result`（含 `[compacted §C1§]`） | 拒绝，`not a tool-result message`；不让调用方猜源事件 |
| message 指向的 call 既无持久化 tag 行、也无任何持久化占位符 tag 号 | 拒绝，`not a tool-result tag`；不读取未纳入 tag 管理的结果 |
| message 指向的 call 有持久化占位符暴露 tag 号，但该 tag 行已不存在 | 拒绝，`tag no longer available`；不根据残留占位符恢复已清理的 tag |
| message 指向未 drop / pending 的项 | 拒绝，`not dropped` / `not dropped yet`；`message` 不是通用历史浏览器 |
| tag 已随消息/会话清理 | 拒绝，`tag no longer available`；仅消息/会话删除；`compacted` 仍按 D2 可读 |
| 原始事件/工具结果缺失 | 拒绝，`raw source unavailable`；不用摘要或模型生成替代 |
| 跨会话 tag | 仅当前会话没有任何 tag 记录时返回 `cross-session tag`；否则 `no such tag`（裸号按会话独立计数，无法可靠判定）；不读别的会话 |
| 附件/图片 | 返回位置/提示，声明不是字节级恢复 |
| reasoning/结构噪声 | 可能省略，明确声明 |
| flush 无 pending | `noop`，不改 surface |
| flush 无会话/关闭/存储失败 | 拒绝并给原因；不伪造成功 |
| 部分 tag 成功 | 仅 deprecated 多 tag `tags` 允许；逐项返回 success/refused，不整体假装成功 |

**保留策略基线：** 按 Q5 移除 30 天 prune；tag 随消息/会话删除与 compaction 状态变化。恢复承诺以原始历史可用为前提，不承诺永久可恢复。fork 的 `tags.retentionDays` 默认 30 天（`src/index.ts:172`、`:882`、`:1004`）不再作为契约。

**Q5 决定（2026-11-13）：移除/关闭 30 天 prune，按原版保留模型；由 T5 实现。**

源码核对（`v0.49.55`）：

- `storage-tags.ts` 的 `deleteTagsByMessageId` 与 `deleteToolTagsByOwner` 在消息移除时删除 tag；
- `compaction.ts` 的 `onCompacted` 把 `active`/`dropped` tags 标为 `compacted`，不按时间删除；
- 这两个文件中没有按天 prune/TTL 路径。

因此 DSH 不应保留 fork 的 30 天定时 prune；tag 生命周期跟随消息/会话删除与 compaction 状态。若未来要加安全上限，必须单独决策，不能默认 30 天。**注意：** 这是对 `storage-tags.ts`/`compaction.ts` 的定向核对，不是全仓库穷尽证明；若后续发现其他清理路径，以原版实际行为为准。

## D6. DSH 验收检查

| 编号 | 检查 | 证据 |
|---|---|---|
| E1 | drop tag 1 → expand → 返回原文的新工具结果；旧占位符仍在；旧 tag 仍 dropped | 宿主事件 + 内容哈希 |
| E2 | 再 reduce 旧 tag 1 → `already dropped`/no-op；不出现 Queued 假回执 | 工具回执 + pending 查询 |
| E3 | expand 结果获得新 tag N；reduce N → 落地为占位符；再 expand N → 原文 | 宿主事件 + 新 tag |
| E4 | 跨进程重启后 E1/E3 仍成立 | 两个进程 + 持久化历史 |
| E5 | 全新会话首次 drop → 真实 Historian 发布 → 旧 tag 与原始 `tool/result` message seq 均 expand → 原文；`compartments` 行字段不变 | 宿主事件 + compartment 记录 + 字段哈希 |
| E6 | 无 raw source / tag 已清理 / message 非 tool-result → 明确失败，不生成替代内容 | 负向用例 |
| E7 | 队列非空 → `/ctx-flush` → 下一次请求出现占位符；无摘要模型调用；旧注入不复用 | 宿主事件 + usage |
| E8 | 空队列、重复 flush、无会话、关闭、存储失败 → 可诊断结果 | 工具回执 |
| E9 | API 形状按 Q2/Q3 定稿，错误信息可诊断 | 契约审查 + 工具回执 |
| E10 | 保留策略按 Q5 定稿；旧 0.11.1 证据不被覆盖；测试用隔离 profile | 文档审查 + 哈希清单 |

## Q2–Q5 已定

- **Q2（2026-11-13；T3 澄清 2026-11-14）：** V1 做 `tag` + `message`（DSH log event seq，含 shadowed 事件）；`start`/`end`/`verbose` 后置。
- **Q3（2026-11-13）：** `tag` 正式参数；`tags` deprecated 多 tag 过渡别名，下一 major 移除。
- **Q4（2026-11-13）：** 标记 + 下一次 preStep；回执明确“尚待下一次请求落地”。
- **Q5（2026-11-13）：** 移除/关闭 30 天 prune；按原版消息/会话删除与 `compacted` 状态保留。

## 签收

**已签收（2026-11-13）。** 签收表示：

- Q1–Q5 已全部回答；
- D1–D5 按回答定稿，D6 的 E1–E10 作为 T2–T5 的验收映射；
- 允许 T2–T5 按此契约实现；
- 不授权发布、不改旧证据、不运行上游 parity。
