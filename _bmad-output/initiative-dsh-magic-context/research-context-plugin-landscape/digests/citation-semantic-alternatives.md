# 引用语义核查：[10]–[21]

核查日：2026-11-09。对象：`research-context-plugin-landscape.md` 中 [10]–[21] 对应的事实句。方法：读报告与三份 digest；用原始 URL/固定 SHA 重新取得 README、源码、npm registry 与 GitHub release。未运行插件、未安装 DSH、未改报告。以下“支持”仅指来源文本支持，不等于运行验收；项目 PRD 的需求不作为外部能力的证据。

## 结论

未发现直接虚构的引文；发现 **1 处范围越界**、**1 处限定词遗漏**，以及若干只能算“作者文档/源码摘要”而非验收的降级项。

- 越界：[12] 被报告第 49 行用来支持“同会话跨压缩的原文读取已有多项方案”。observational-memory 的 `recall(id)` 只支持按已知 12 位十六进制 memory id 精确回查某条 observation/reflection 背后的原始证据，原文明确说 “It is an exact lookup, not search”；它不是任意历史全文检索/分页读取。报告第 35 行本身写得准确，但第 49 行的合并引用过宽。
- 限定词遗漏：DCP 的 `message` 模式在 README 中标注为 “(experimental)”，报告第 44 行只写“range/message 两模式”，事实不假，但会高估成熟度。
- 其余 [10][11][13][14][15][16][17][18][19][20][21] 的核心事实与本轮原文/元数据相符；其中 [18] 的“恢复底层消息”、[16] 的“原文展开”、[11] 的“无跨会话同步”只有部分原句或 digest 支持，仍应保持 medium。

## [10] 多窗口：支持，且“仅同会话”被原文直接确认

报告主张：0.7.0；原生压缩后追加窗口交接；会话私有笔记；`history_search/read`；按稳定 `item_seq` 分页读取完整原始事件；工具不开放任意跨会话访问。

本轮原文（固定 SHA `9dfab48` 的 `README.zh-CN.md`）：

- “版本 **0.7.0**，已针对 **DSH 0.2.2-rc.1 / Node.js ≥ 22.15** 验证。”
- “每次 DSH 提交一次压缩后，插件追加一条**窗口消息**……摘要本身就是 DSH 自己的 checkpoint，不改动、不截断。”
- “`item_<seq>` 是稳定事件地址，不重复索引、不因条目数超过 2,000 而丢弃旧记录。”
- “`history_read` 的 `format: "json"` 可分页读取完整原始事件，包括调用参数和元数据。”
- “所有工具限定在调用者的会话内，不暴露会话选择参数。”

判定：**支持**。报告用的 `item_seq` 是 `item_<seq>` 的简写，不构成语义偏差。README 同时自述“不保证模型无损恢复全部语义”，报告没有把它写成无损恢复，边界正确。`history_read` 需要已知 ID，不是任意全文搜索；报告未声称它是任意搜索。
置信度：能力仍为 medium / unverified；仅 README 自述，未运行。发行记录 [13] 已单独核实，见下。

## [11] rollover：支持“无摘要/确定性交接/实验 preset”

本轮原文（当前 `main` 的 `README.md`）：

- “working context window and continue in a fresh one while preserving durable state — with **no summarization**.”
- “the `"summary"` is a **deterministic checkpoint** (durable notes plus an optional handoff), never an LLM call. Raw session events stay persisted.”
- “**Web profile: rollover only runs in the `standard-rollover` preset.**”
- 默认 `standard` “gets **no rollover tools and no rollover guidance** — no `new_context`, no `get_context_remaining`, no `notes`, no `history`.”
- preset picker 中写作 “**Standard + rollover (experimental)**”。

判定：**支持**。“模型主动换窗、持久笔记＋近期原文尾部、确定性交接不调用摘要模型、Web 必须用实验 preset、默认 standard 不获得工具”均有直接原句。
“无跨会话同步”本轮没有重新截到完整原句；digest 记录了 README 的 Scope 句 “Notes survive context rollovers within a session; no cross-session sync, embeddings, or cloud storage”。该条按 digest 支持，原句复核度较低。
置信度：能力 medium / unverified；当前 DSH 兼容性未测，报告写“待测”是恰当的，不应反推为不兼容。

## [12] observational-memory：能力支持，但“原文读取”范围越界

本轮原文（固定 0.4.1 的 `README.en.md`）：

- “observer (distills session events into timestamped, relevance-rated observations) → reflector (extracts durable facts from observations) → dropper (prunes observations already covered by reflections), all driven by session events like `turn/end` against token thresholds.”
- “when DSH's compaction engine makes its summarization call … the plugin intercepts it … — instant compaction, zero model calls.”
- “The agent can call `recall(id)` with a 12-character lowercase hex memory id to recover the exact source evidence (timestamped original text) behind an observation or reflection.”
- “**It is an exact lookup, not search: the model cites ids it saw in compacted memory.**”
- 架构图中明确有 “Observer model call”；配置表有 “Worker model override”“memory workers follow the session model”；“empty backlog still costs no model call”。

判定：**支持**报告第 35 行的关键句：按已知 ID 精确回查、不是任意全文搜索；后台 worker 确实有模型调用，“zero model calls”只限定在 compaction/render，不能外推为整体零成本；0.4.1 文档与 0.4.3 发行分离也真实存在。
**越界**：报告第 49 行 “同会话跨压缩的原文读取已有多项方案。[10][11][12][16]” 把 [12] 当作“原文读取”证据。按原文，[12] 只能支持“按已知 memory id 回查原始证据”，不支持任意历史读取/分页/搜索；该项应由 [10][11]（以及 [16] 的 ctx_expand）承担，[12] 应降为“按 ID 精确回查”的窄证据。
置信度：0.4.1 文档 medium；0.4.3 能力未复核；不能把 0.4.1 README 当作 0.4.3 逐项实测。`Memory tab` 的精确标签本轮未逐字截取，按 README UI 段落与 digest 支持。

## [13] 多窗口 npm：完全支持

本轮 registry：`latest=0.7.0`，`time=2026-11-09T09:13:30.312Z`，`gitHead=9dfab4803545a8d5d9c66c60ec77cfa302d94991`。与报告 [13] 的版本、日期、固定 SHA 一致。
判定：**支持**；仅为分发记录，不证明兼容或可用。

## [14] rollover npm：完全支持

本轮 registry：`latest=0.2.2`，`time=2026-09-16T07:17:50.857Z`，`gitHead=0f3e381698283fdf1a507afac84328a54b49e318`。与报告 [14] 一致。
判定：**支持**；仅发行记录。

## [15] observational npm：完全支持

本轮 registry：`latest=0.4.3`，`time=2026-10-30T14:29:10.863Z`，`gitHead=23543fbd3c413e4767759bd322798f88b50b17b5`。与报告 [15] 一致。
判定：**支持**；仅发行记录。它与 [12] 的 0.4.1 文档快照确实是两件事，报告已明确区分。

## [16] Magic Context / CortexKit：核心句支持，整体仍是作者自述

本轮原文（当前 `master` 的 README）：

- “The Pi extension shares the same database as OpenCode; project memories and embeddings pool across both.”
- “The right memories surface automatically every turn, and the agent can search across memories, past conversations, and git history on demand. Across sessions, and across OpenCode, Pi, and OMP.”
- “host's compaction would interfere with its cache-aware deferred operations”; README 同时列 historian、dreamer、project memory。

判定：**支持** “Pi 与 OpenCode 共享数据库”、多宿主（OpenCode/Pi/OMP）、跨会话搜索与记忆；“缓存感知回收、Historian、Dreamer”有 README 支持。
“原文展开”（`ctx_expand`）本轮未重新读 MC 的 expand 源码，只由 cross-harness digest 支持；报告把它作为上游能力参考可以，但应保持 medium。
置信度：整体 medium；未运行，README 的 “never forgets” 等营销句不能当运行证明。报告已注明“官方 README 称”，措辞恰当。

## [17] DCP 当前机制：支持，但 message 模式应保留 experimental

本轮原文（`Opencode-DCP/.../master/README.md`）：

- “DCP reduces context size through a compress tool and automatic cleanup. Your session history is never modified — DCP replaces pruned content with placeholders before sending requests to your LLM.”
- “`range` mode compresses contiguous spans of conversation into one or more summaries.”
- “`message` mode (experimental) compresses individual raw messages independently.”
- “Development on DCP has slowed because most new context-management work has moved to Sleev”; “new features are landing in Sleev first.”

判定：**支持** “请求侧压缩、单 compress 工具、range/message 两模式、不修改宿主历史、作者转向 Sleev”。
**限定词遗漏**：`message` 模式在原文是 experimental；报告第 44 行未带此限定。不是虚假陈述，但若用它判断成熟度，应降级。
置信度：机制 medium；未运行。DCP 仍有 automatic cleanup/dedup/purgeErrors，报告用“单 compress 工具”概括模型工具面可以，但不要理解为只有一种清理机制。

## [18] DCP 解压源码：active 状态被直接确认，“恢复底层消息”只部分复核

本轮源码 `lib/commands/decompress.ts` 的 `handleDecompressCommand` 中直接出现：

- `block.active = false`

判定：**支持** “通过取消压缩块的 active 状态”这一关键机制；结合 README 的 “session history is never modified”，报告“不能误称纯永久删除”成立。
“恢复底层消息”是同一 decompress 命令的预期效果，但本轮只逐字确认了 `block.active = false`，没有把后续重新纳入消息的完整代码路径逐行展开；报告已标“源码摘要，未运行”，边界正确。
置信度：medium；V2 运行时行为未测。

## [19] claude-mem：定位与活跃证据支持

本轮 README 与 GitHub API：

- “Claude-Mem runs a second agent beside it that takes notes while it works. The next session starts with a short index of what matters, and pulls in the details only when it needs them. Works with Claude Code, Codex, Cursor, OpenCode and 11 more agents.”
- “observations stream in from your first prompt, and your second session in a project opens with memory from the first.”
- 最新 release：`v15.13.0`，`published_at=2026-11-09T10:06:27Z`。

判定：**支持** “工具活动→observations→跨会话检索与注入”的定位，以及“2026-11-09 仍有 release”的活跃证据。
“工具活动”捕获的 hooks 细节本轮只由 README/digest 支持；记忆质量、DSH 集成运行效果未验证。报告没有把它当作可逆卸载的替代，边界正确。
置信度：存在与活跃度 medium-high（release/README）；实际效果 medium-low。

## [20] Sleev：只能算厂商自述，不能算验收

本轮 `sleev.ai` 首页：

- “A local context optimization layer for your agentic stack.”
- “Works with Claude Code / OpenCode / Pi / Grok Build / Codex / ChatGPT / GitHub Copilot / Kimi.”

判定：**支持** “本地代理层、厂商宣称支持多种 coding harness”。这仍是厂商自述；没有源码、版本、独立测评或恢复语义证据，不能据此确认 DSH 接入、精确恢复、隐私与回退。报告标为 low、并明确“技术主张未独立验证”，正确。
**明确不支持**：把 Sleev 的自述当作验收或可替代安装的证据。报告没有这样做；后续也不要升级。

## [21] opencode-recall：8KB 是拒绝阈值，不是截断

本轮源码 `lib/restore-tool.ts`：

- `const maxBytes = ctx.config?.tools?.settings?.restoreMaxBytes ?? 8000`
- `function shouldBlockLargeRestore(size, maxBytes, force) { if (force) return false; if (size === null) return false; return size > maxBytes }`
- 警告文案：“Refusing to restore large content … Override: rcl_restore(path=…, force=true)”

判定：**支持** “默认超过 8000 bytes 拒绝恢复、`force` 可覆盖”；这是**拒绝**，不是静默截断。报告第 47 行的纠正准确。
“0.1.0 及较早更新记录”本轮未重新核实 npm/GitHub 维护元数据，只有 digest 的 0.1.0/最后 push 2026-01 记录；代码机制支持，维护状态保持 medium。
置信度：代码机制 medium；运行时未测。

## 需要降低置信度的项

1. **[12] 在第 49 行的用法**：从“原文读取”降为“按已知 memory id 精确回查”。这是本轮唯一明确的引用范围越界。
2. **[17] message 模式**：补上 “experimental” 限定；否则会高估 DCP 当前成熟度。
3. **[18] 恢复底层消息**：`block.active=false` 已确认；完整消息重纳入路径未逐行复核，保持“源码摘要”而非验收。
4. **[16] 原文展开**：本轮只复核了共享数据库、多宿主、跨会话搜索；`ctx_expand` 仍依赖 digest/前序源码，未重新取得 MC 源码。
5. **[11] 无跨会话同步**：digest 有 Scope 原句，本轮未重新截取；作为作者文档接受，但不升级为高置信。
6. **[21] 维护状态**：8KB 代码已确认；“0.1.0/最后 push 2026-01”未在本轮重新查 registry/仓库元数据。

## 未覆盖范围

- 未安装或运行任何插件/测试；所有运行时行为、DSH 0.2.2 兼容性、Windows 状态均未验收。
- 未读取 observational-memory 0.4.3 的 README/实现；只核了 0.4.1 快照与 0.4.3 发行元数据。
- 未逐项复核 MC 的 cache-aware reclaim、Historian/Dreamer 内部实现；只核了 README 的共享数据库、多宿主、跨会话搜索等句。
- 未验证 claude-mem 的 hooks、observation 质量、DSH 集成运行效果；只核了定位与 release。
- 未验证 Sleev 的实际机制、隐私、回退、DSH 接入；只核了厂商首页自述。
- 未端到端验证 DCP decompress 在 OpenCode V2 的行为；只核了 README 与 `block.active=false`。
- 未复核 [1]–[9]（指定项目）及本项目 PRD；本轮不据此判断项目价值。
- 未改动 `research-context-plugin-landscape.md`；上述偏差仅供后续修订引用时参考。
