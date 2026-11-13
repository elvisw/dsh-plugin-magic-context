# 跨 Harness 上下文缩减/记忆插件调研摘要

> 证据回收草稿，不是最终判断。主代理发现下文若干推论过强：Rust模式拒绝tag不等于原文不可恢复；DCP摘要有损不等于底层原文被删除；recall超8KB是默认拒绝而非截断；更新较早不等于已宣布停更。修正口径见`cross-parent-recovery.md`、`citation-semantic-alternatives.md`及主报告，引用时以修正后的表述为准。所有运行能力未经本次独立实测，不能把下文“高”理解成运行验收通过。

- 调研问题：AI coding agent 的上下文缩减方案中，哪些真正区分了「工具结果可逆卸载 + 稳定 ID + 恢复当时原文」「永久剪枝」「仅摘要/语义记忆」；据此判断另做 DSH 上下文插件是否有空间。
- 证据规则：仅使用本轮检索到的 GitHub 源码/README/release 与厂商页面。**未运行任何插件或其测试**，因此所有运行时行为均属「源码/文档显示」而非「实测」。
- 访问时间（accessed）：2026-11-09T14:14Z–14:25Z（UTC），由本机 `Get-Date -AsUTC` 校准。
- 明确排除：`wk544863858/dsh-plugin-magic-context`（由其他代理负责）。
- 注意：npm/GitHub 上存在多个 DCP fork（如 `@vikrant82/opencode-dcp`、`@lexwdex-org/opencode-dcp`），本摘要只把 `Tarquinen/opencode-dynamic-context-pruning` 当 canonical，fork 不单独计入。

## 结论摘要（面向「是否值得另做 DSH 插件」）

1. **四种机制在市场上已被分别占据**：可逆卸载（Magic Context、opencode-recall）、有损摘要但块级可回滚（DCP、compressed-context）、代理层黑盒优化（Sleev）、跨会话语义记忆（claude-mem）。没有发现一个方案同时做到「任意工具结果 + 稳定不可变 ID + 精确恢复当时字节 + 跨 harness 通用」。
2. **最接近目标形态的是 Magic Context**：`ctx_reduce` 标记、`[dropped §N§]` 占位符是 tag id 的纯函数、`ctx_expand(tag=N)` 返回该项完整内容；但它与 DCP 互斥、自身声明「端到端拥有上下文管理」，且其 Rust transform 模式明确**拒绝按 tag 查询**，稳定 ID 恢复存在模式断层。
3. **DCP 已经不是纯「永久剪枝」**：v3 起改为单一 `compress` 工具 + `/dcp decompress <n>` 块级还原，宿主历史不被修改。但它的还原单位是「压缩块」，不是「单个工具结果的稳定 ID」；且作者已把主要开发迁往闭源 Sleev，DCP 进入维护放缓。
4. **opencode-recall 机制上最贴近「落盘 + 指针 + 恢复原文」**：`[RCL:o:...]` 指向 `.opencode/rcl/blobs/`，`rcl_restore` 读回原快照；但它是 0.1.0、单人、最后 push 2026-01，属于早期原型，不能视为成熟替代。
5. **对 DSH 的含义（推断，非证据结论）**：真正未被占满的差异化点不是「再做摘要」，而是**在 DSH 宿主内提供稳定 ID、可逆卸载、且恢复原文语义在所有 transform/runner 模式下都成立**；如果做不到跨模式一致性，产品价值会退化为又一个压缩插件。

## 方案 1：Magic Context（cortexkit）

| 项 | 内容 |
|---|---|
| URL | https://github.com/cortexkit/magic-context ；架构 https://raw.githubusercontent.com/cortexkit/magic-context/master/ARCHITECTURE.md ；兼容性 https://docs.cortexkit.io/magic-context/help/compatibility/ |
| Publisher | CortexKit（仓库 owner `cortexkit`） |
| pub_date | 仓库最新 release `v0.49.44` 发布于 2026-11-09T06:42:53Z；默认分支 HEAD commit `9690094`，pushedAt 2026-11-09T06:29:47Z。项目首次发布日期未核查。 |
| accessed | 2026-11-09T14:15Z 前后 |
| 机制分类 | **可逆卸载 + 稳定 tag ID + 摘要分层 + 跨会话记忆**（复合型） |
| 功能证据 | README（自述）：agent 调 `ctx_reduce` 标记过期工具输出/长消息；drops 排队、按 cache-safe 时机应用；historian 把旧历史压成分层 compartment；dreamer 维护记忆；安装会关闭宿主 compaction。ARCHITECTURE.md（源码仓库文档）：`[dropped §N§]` 是「tag id 的纯函数」，drop 只改 in-memory outgoing wire，原始历史留在 `opencode.db`。`packages/plugin/src/tools/ctx-expand/tools.ts`（**源码直读**）：`ctx_expand(tag=N)` 按 tag 渲染该项全文；也支持 `message`/`start-end` 按 ordinal 展开。 |
| 发布/维护证据 | 2026-11-09 仍有 release 与 push；README/架构文档描述 OpenCode 1/2、Pi、OMP 多宿主；release notes 显示高频补丁（v0.49.36、v0.49.44）。 |
| 重要局限 | (a) 兼容性文档明示与 `opencode-dcp` **互斥**，启动检测到就禁用自己；(b) 需要 historian 模型配置，缺失时运行失败；(c) **源码显示 Rust transform 模式拒绝 tag 查询**（`CTX_EXPAND_RUST_TAG_REFUSAL`），只能改用 ordinal，稳定 ID 恢复并非全模式成立；(d) 架构极复杂（cache bust 分类、m[0]/m[1]、ride-only reclaim），release notes 里出现过多起 OpenCode 2 请求校验失败、`/compact` 零回收、per-pass 开销随会话增长等回归；(e) 体量大、与宿主 compaction 强耦合。 |
| confidence | 机制与限制：**高**（README + 架构文档 + 直读源码）。运行时正确性/性能：**中低**（未实测，且 release notes 自曝多起回归）。 |

## 方案 2：Dynamic Context Pruning / DCP（Tarquinen）

| 项 | 内容 |
|---|---|
| URL | https://github.com/Tarquinen/opencode-dynamic-context-pruning ；release https://github.com/Tarquinen/opencode-dynamic-context-pruning/releases/tag/v3.2.0 |
| Publisher | Tarquinen（个人维护） |
| pub_date | 仓库 created 2025-11-20；最新 release `v3.2.0` 发布于 2026-09-20T17:34:05Z；pushedAt 2026-09-25T03:17:20Z。 |
| accessed | 2026-11-09T14:16Z 前后 |
| 机制分类 | **有损摘要压缩（可块级还原）**，请求侧改写，宿主历史不改 |
| 功能证据 | README（自述）：session history never modified，pruned content 以 placeholder 替换后再发给 LLM；`compress` 工具有 `range` / `message` 两种模式，生成高保真技术摘要；dedup、purgeErrors；明确承认会破坏 prompt cache。`lib/commands/decompress.ts`（**源码直读**）：`/dcp decompress <n>` 把 compression block 置为 inactive，恢复其下消息并回退 token 统计；若目标嵌在 active 压缩块内，要求先恢复外层。 |
| 发布/维护证据 | v3.2.0 增加 OpenCode V2 支持；release notes 明说「most new context-management development has moved to Sleev」，DCP 仍可用但新功能先进 Sleev。 |
| 重要局限 | (a) 还原粒度是压缩块，不是「单条工具结果的稳定 ID」；(b) 摘要本身有损，restore 只能回到未被删除的原始消息，不能恢复已被压缩改写的语义；(c) 维护放缓、路线迁往闭源产品；(d) README 自承 cache 失效权衡；(e) 未实测其 decompress 在 V2 的真实行为。 |
| confidence | 代码存在性与机制：**高**；运行时效果与 V2 边界：**中**（源码 + release，未实测）。 |

## 方案 3：Sleev

| 项 | 内容 |
|---|---|
| URL | https://sleev.ai ；文档 https://sleev.ai/docs/faq |
| Publisher | Sleev（商业产品） |
| pub_date | 页面未标注发布日期（未知）。 |
| accessed | 2026-11-09T14:17Z 前后 |
| 机制分类 | **本地代理层上下文优化（闭源黑盒）** |
| 功能证据 | 官网（自述）：local gateway / local proxy；支持 Claude Code、OpenCode、Pi、Grok Build、Hermes、Codex、ChatGPT、Copilot、Kimi、Z.AI；称在「预期节省超过 provider cache 更新成本」时才优化；宣称「forget about compaction」「no lossy summaries」。DCP v3.2.0 release notes 指其主要开发已迁至 Sleev，构成第三方交叉信号。 |
| 发布/维护证据 | 官网在线、有定价/企业/离线许可页面；无公开源码、无公开版本号或 changelog 可核。 |
| 重要局限 | 闭源，无法验证「无损」与恢复语义；需把请求接入本地代理，部署面变大；FAQ 页面正文未展开（抓取到的是折叠标题），具体机制、数据留存、失败回退均**未验证**；商业许可对团队使用有限制。 |
| confidence | 存在与定位：**高**；技术主张：**低**（纯营销自述，无源码/实测）。 |

## 方案 4：opencode-recall（SleepingBag945）

| 项 | 内容 |
|---|---|
| URL | https://github.com/SleepingBag945/opencode-recall ；npm https://www.npmjs.com/package/opencode-recall |
| Publisher | SleepingBag945（个人） |
| pub_date | 仓库 pushedAt 2026-01-21T18:28:01Z；npm 版本 0.1.0；无 GitHub release。首次发布具体日期未从 registry 核实（Snyk 页面称 first published 约 9 个月前，属二手）。 |
| accessed | 2026-11-09T14:18Z 前后 |
| 机制分类 | **工具 I/O 落盘 + 路径指针 + 按需恢复原文**（最接近目标形态的早期实现） |
| 功能证据 | README（自述）：重复/过期/可替代的工具 I/O 写入 `.opencode/rcl/blobs/`，上下文只留 `[RCL:o:...]` / `[RCL:i:...]`；`rcl_restore` 找回「当时的完整快照」；`rcl_explore` 起子会话读大文件只回结论；含 dedup、supersedeWrites、purgeErrors。`lib/restore-tool.ts`（**源码直读**）：从 blobs 目录读 `*.output.json` / `*.input.json`，默认超过 8000 bytes 拒绝恢复、需 `force=true`；有目录穿越防护，只允许 blobs 目录内路径。 |
| 发布/维护证据 | 单一 maintainer、0.1.0、最后 push 2026-01，之后无 release；`package.json` peer 依赖 `@opencode-ai/plugin >=0.13.7`，SDK `^1.1.3`，对 OpenCode 2 的兼容性未验证。 |
| 重要局限 | 已约 10 个月无更新，基本可视为停更原型；ID 是文件路径而非单调稳定 tag，重命名/迁移会断链；默认 8KB 恢复上限会截断「原文」诉求；无跨会话/跨 harness 能力；未实测。 |
| confidence | 代码机制：**高**；可维护性与生产可用性：**低**（明确停更迹象）。 |

## 方案 5（非直接替代）：claude-mem

| 项 | 内容 |
|---|---|
| URL | https://github.com/thedotmack/claude-mem |
| Publisher | Alex Newman / thedotmack |
| pub_date | 最新 release `v15.13.0` 发布于 2026-11-09T10:06:27Z；pushedAt 2026-11-09T11:26:08Z；仓库 created 2025-08-31。 |
| accessed | 2026-11-09T14:19Z 前后 |
| 机制分类 | **跨会话语义记忆 / 观察笔记**，不是会话内剪枝 |
| 功能证据 | README（自述）：hooks 捕获工具活动 → observer agent 生成 observations → 下次会话注入紧凑索引；MCP 三段式检索 `search` / `timeline` / `get_observations`；SQLite + Chroma；支持 Claude Code、Codex、Cursor、OpenCode 等；Apache-2.0。release notes 提到 DSH 集成修复（ingested tool memories 保留 `platformSource`），说明其已触达 DSH。 |
| 发布/维护证据 | 2026-11-09 当日仍有 release 与 push，维护活跃；版本已到 15.x。 |
| 重要局限 | 解决的是「跨会话记住」，不解决当前会话工具输出膨胀；注入的是摘要/观察，非原始字节；依赖后台 worker 与额外模型调用，成本与隐私面更大；与「可逆卸载」不是同一层，不能作为直接替代。 |
| confidence | 定位与活跃度：**高**（release/README）；实际记忆质量：**中低**（未实测）。 |

## 机制对照

| 方案 | 剪枝对象 | 稳定 ID | 恢复当时原文 | 宿主历史 | 主要风险 |
|---|---|---|---|---|---|
| Magic Context | 工具输出/长消息/旧历史 | 有（`§N§` tag，但 Rust 模式不可查） | 是（tag/ordinal 读取归档） | 不改，改 wire | 复杂度、互斥、模式断层 |
| DCP | 连续区间/单消息 → 摘要 | 压缩块 id | 块级回滚到原始消息，非单工具项 | 不改 | 有损摘要、维护放缓 |
| Sleev | 代理层请求 | 未公开 | 未验证 | 未公开 | 闭源、不可验证 |
| opencode-recall | 工具 I/O | 路径指针（非单调 ID） | 是（blob 快照，8KB 默认上限） | 不改 | 停更、原型 |
| claude-mem | 跨会话观察 | observation id | 否（摘要/观察） | 独立库 | 非同一层、成本 |

## 未验证 / 开放问题

- Magic Context 在 OpenCode 2 与 Rust 模式下，`ctx_reduce` 后的 `[dropped §N§]` 是否仍能按 tag 恢复原文：源码已给出拒绝路径，**跨模式一致性未验证**。
- DCP `decompress` 对「已被摘要覆盖的原始消息」是否真能逐字节还原，还是仅重新激活保留的原始消息：源码显示是后者，**未实测**。
- Sleev 的「no lossy summaries」与恢复能力：无源码、无独立测评，**未验证**。
- 各方案的 token 节省与 cache 成本的净收益：无实测数据，不采信 README 数字。
- 流行度：本轮未采集 star/fork/download 数据，不做排名。

## 来源清单

1. https://github.com/cortexkit/magic-context — CortexKit，release v0.49.44（2026-11-09），accessed 2026-11-09。
2. https://raw.githubusercontent.com/cortexkit/magic-context/master/ARCHITECTURE.md — CortexKit，commit `9690094`（2026-11-09），accessed 2026-11-09。
3. https://github.com/cortexkit/magic-context/blob/HEAD/packages/plugin/src/tools/ctx-expand/tools.ts — 源码，accessed 2026-11-09。
4. https://docs.cortexkit.io/magic-context/help/compatibility/ — CortexKit 文档，无日期，accessed 2026-11-09。
5. https://github.com/Tarquinen/opencode-dynamic-context-pruning — Tarquinen，release v3.2.0（2026-09-20），accessed 2026-11-09。
6. https://github.com/Tarquinen/opencode-dynamic-context-pruning/blob/HEAD/lib/commands/decompress.ts — 源码，accessed 2026-11-09。
7. https://sleev.ai 与 https://sleev.ai/docs/faq — Sleev，无日期，accessed 2026-11-09。
8. https://github.com/SleepingBag945/opencode-recall — SleepingBag945，v0.1.0，pushed 2026-01-21，accessed 2026-11-09。
9. https://github.com/SleepingBag945/opencode-recall/blob/HEAD/lib/restore-tool.ts — 源码，accessed 2026-11-09。
10. https://github.com/thedotmack/claude-mem — thedotmack，release v15.13.0（2026-11-09），accessed 2026-11-09。
