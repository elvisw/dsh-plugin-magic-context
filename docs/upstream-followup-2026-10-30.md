# 上游 MC 跟进分析：v0.46.0 → v0.49.30（2026-10-30）

> **取源**：`git clone https://github.com/cortexkit/magic-context .upstream/magic-context`
> （完整历史，HEAD=tag v0.49.30 = 47bcd71a2；`.upstream/` 已在 `.gitignore`，只读分析）。
> 基线：PARITY.md / upgrade-followup §1 的对齐目标 **v0.46.0**（2026-10-08 发布）。
> 区间 **1513 commits / 34 tags**（v0.46.1、v0.47.0、v0.48.0、v0.49.0–v0.49.30；
> v0.49.30 发布于 2026-10-29）。npm `@cortexkit/magic-context` latest = 0.49.30。
> 本文按 upgrade-followup §4「对齐面清单」+ §6 跟进流程执行，只评估功能，无 DB 兼容义务
> （2026-10-13 硬切换后 corpus 是自有库）。

## 结论摘要（TL;DR）

**适配器的移植核心零变动。** §4 对齐面引用的六个核心文件（inject-compartments.ts、
storage-memory.ts、workspaces.ts、memory/search.ts、emergency-drop.ts、agents/historian.ts）
加 cosine-similarity.ts 与 reference-seeds（source.xml / generated.ts）在 v0.46.0..v0.49.30
**全部 0 提交**（已确认文件未被改名/挪位）。存储 schema 仍是 **v95**（migrations.ts:3210，
唯一一条 migrations 提交是 Bun 1.4.4 兼容，无新迁移）⇒ fence/写契约无动作。
0.47/0.48 两个 minor 的功能（keep_reasoning_tokens、host stall profiler、smart notes 开关、
OMP 修复族）全部落在 OpenCode/Pi/OMP 宿主车道，DSH 无对应接缝（PARITY §B1–B5）。

1513 提交中命中对齐面的只有 7 个文件、共 9 条提交；逐条核对后：
**建议跟进 3 项**（§3），**判定不需跟进 12 类**（§4），**可选特性 4 项记录在案**（§5）。

## 1. 变更分布（按车道）

| 车道 | commits | 判定 |
|---|---|---|
| `hooks/magic-context/`（transform×67、postprocess×57、rust-mode、read-session×、strip-content×16） | 470 | OpenCode 宿主专属（PARITY §B1/§B5 已判不移植） |
| `packages/pi-plugin/`（context-handler×138、refusal×38…） | 604 | Pi 宿主管线 |
| `v2/`（OpenCode 2 lane，context.ts×57） | — | OpenCode 2 宿主 |
| `crates/mc-module/src`（transform.rs×53、lib.rs×29、historian_chunk.rs×14、selection.rs×2） | 124 | Rust 模块车道；仅 selection.rs 2 条与适配器有关（§3.1） |
| `features/magic-context/` | 262 | 多为测试与性能（storage-tags×31 全为索引/warm-up/#650 恢复）；实质项见 §3/§5 |
| `dashboard/src-tauri` | 70 | Dashboard 独立发版线 |

## 2. 对齐面命中明细（§4 清单逐行）

| 对齐行 | 提交数 | 结论 |
|---|---|---|
| inject-compartments.ts（m[0]/m[1]、水位） | 0 | 无需动作 |
| storage-memory.ts（29 列写契约） | 0 | 无需动作 |
| workspaces.ts（share_categories 容错） | 0 | 无需动作 |
| memory/search.ts + cosine-similarity.ts（融合/向量） | 0 | 无需动作 |
| emergency-drop.ts（分层 T1/T2/T3） | 0 | 无需动作 |
| agents/historian.ts | 0 | 无需动作 |
| reference-seeds.source.xml / generated.ts | 0 | **seeds 未漂移**，`build:seeds --check` 无需重跑 |
| migrations.ts | 1 | Bun 兼容修复；schema 仍 v95 ⇒ fence 95 不动 |
| ctx-reduce-nudge.ts（reduce 五阈值） | 1 | 仅抽取共享计数模块 `tail-hygiene-output-count.ts`，**阈值/文案/计数语义逐字节未变**（`uTokens > 0` 过滤原样）；N/A |
| agents/magic-context-prompt.ts | 1 | smart-notes 能力开关剥离（§4 判 N/A：适配器 desk 段无 smart-note 子句） |
| compartment-prompt.ts | 2 | ① memory opt-out 门控 ② `userObservationsRequested` 开关 → §3.3 |
| features/magic-context/search.ts（unified ctx_search） | 11 | 加法车道（rerank/auto-search worker/引用恢复），融合权重 0.7/0.3 未动 → §5 |
| crates/mc-module/src/selection.rs | 2 | #731 保留语义 + execute-band 老化 → §3.1 |
| historian-prompt.source.md | 1 | `<unprocessed_from>` 全覆盖规则；适配器 historian 是 digest-JSON 契约、无此字段 → N/A |
| compartment-runner-incremental.ts / -historian.ts | 19/10 | #802 无进展闸、按 end-id 续跑、按链定块大小等 → §3.2 / §4 |

## 3. 建议跟进（按优先级）

### 3.1 #731：emergency"丢完也装不下就别丢"护栏 — selection.rs:7d393ae78（v0.49.16）

上游修复：`select_emergency` 在 `floor_above_ceiling`（固定开销已超天花板）时**跳过选择、
保留工具结果**，交给最终准入处理溢出——不再为注定装不下的请求白白改写缓存、毁掉上下文。
测试 `issue_731_impossible_fixed_overhead_preserves_tool_results`。

适配器现状（`src/dsh/emergency.ts:72-115`）：`reclaimForEmergency` 把保护窗外**全部**可回收
节点无差别替换为占位符，没有"这次回收是否可能让重试 fit"的判断。当
CONTEXT_WINDOW_EXCEEDED 的成因是超大固定内容（system prompt、未打标的大结果、用户消息）
时，现状会摧毁全部工具结果而重试依然失败。

建议：入口处估算 `overflow = currentTokens - contextWindow` 与
`reclaimableTokens = Σ 窗外可回收节点`；`reclaimableTokens < overflow × 安全系数` 时跳过
丢弃、journal 记录 `skipped-reclaim-cannot-fit` 并让调用方放弃重试/直接上报。量级小，
纯加护栏，不动分层与窗口语义。

### 3.2 #802：historian 无进展后等新消息 — e9075bfec（v0.49.27）

上游修复：一次 run 什么都未能发布后，自动触发**等待会话出现更新的消息**，不再对同一批
消息反复付费（near-full/emergency 路径仍各保留一次尝试）。

适配器现状：`management-pass.ts:725` 每次 execute pass fire-and-forget 调 `runHistorian`，
失败仅 journal（:734-747）；`selectHistorianRange` 仍会选中**同一批未覆盖节点** ⇒ 确定性
失败（路由错、模型持续产出不可解析 JSON）时每个 pass 都烧一整轮 LLM 调用（含 2 次尝试）。

建议：自有 store 记 `(sessionId, failedEndSeq, failedAt)`；自动触发前若
`failedEndSeq >= 当前 surface 末节点 seq` 则跳过并降频 journal。手动路径（checkpoint/forced）
不受限。

### 3.3 user-observations 产出与评审可用性挂钩 — d02292d0d（v0.49.x，compartment-prompt.ts）

上游：dreamer/评审不可运行时，historian **USER prompt**（非 system prompt，字节缓存不受影响）
追加一条指令：不产出 `<user_observations>` 块。同时把"采集开关"与"是否请求产出"拆成
两个函数（`userObservationCollectionEnabled` / `userObservationsRequested`，
`dreamer/task-config.ts`）——2026-10-09 分析记录的"采集与评审硬耦合"（A.9-(1)）在上游已松动。

适配器现状：`historian.ts:231/247` 的 digest 契约无条件要求 `userObservations`；
`historian.ts:899-926` 在 `profileCollect` 未装备时**静默丢弃**已产出的观察 ⇒ 每次摘要调用
白付一段输出 token。建议：采集关闭时在 user prompt 注入一行"skip userObservations"
（产出侧开关），采集与评审的解耦方向与本仓 WP5 的路线一致。

## 4. 判定不需跟进（依据）

1. **#642 切块不得切断 tool arc**：适配器 `planChunkSpans` 已有等价 tool-pairing
   （`historian.ts:471-482`，含真实 400 失败锚点：块不得以 tool result 开头、不得以
   带 tool call 的 assistant 结尾）。
2. **#803 verify 短回复误判（≤32 token 当 outage）**：适配器无此类熔断；max-tokens
   截断"银行已验证部分"语义已有（`maintenance.ts:214-227`）。
3. **#815/#804 空白 drop-marker 回复清除、console 闪烁、OpenCode2 sidebar 0 token、
   thinking 保护、busy-db 重发、30s deadline**：全部要求改写 wire 历史/宿主进程管理，
   DSH 表面 append-only（PARITY B1）——host-imposed。已知残余风险：模型在 DSH 写出
   仅含 `[dropped §N§]` 的回复时无法剥离，只能靠 desk 文案预防（上游同因无法根治，
   其修复依赖历史改写能力）。
4. **keep_reasoning_tokens / signed-thinking / Fusiform / stall profiler / OMP**：宿主接缝。
5. **schema/迁移**：v95 不变；`MEMORY_SCHEMA_MAX_VERSION=95`、29 列契约、fence 测试全部不动。
6. **memory opt-out 门控（memory-enabled.ts）**：适配器 memory-lane 已有等价门
   （`memory-lane.ts:128,183`）；适配器 historian prompt 不注入项目记忆，上游的
   `readEnabledProjectMemories` 包装无对应面。
7. **historian 输入隐式截断修复（2a4640b47，room post 400 字符）**：DSH 无 room post 形状；
   适配器输入侧无隐式截断（`spanRequestMessages` 原文直送）。
8. **storage-tags×31 / raw-ordinal-warmup×18 / lkg-slot×16**：OpenCode 存储性能与 #650
   Pi tag 身份恢复；DSH 打标锚定 surface seq（`seams.ts`），不同车道。
9. **v0.49.26 他插件注入文本不被编号/保存**：OpenCode 多插件 wire 车道；DSH 无此形状。
10. **v0.49.29 配置容错（单字段非法不再整体关记忆）**：上游 config 体系专属；适配器
    Config 面小（cordis.patch 整体替换语义），无同类爆炸面。
11. **#740 historian chains（模型链）**：适配器为单 route + 双 attempt 结构，链式 fallback
    属特性增强而非缺陷（见 §5）。
12. **Pi 插件 604 提交**：context-handler/refusal/dispatch 等 Pi 宿主管线；共享核心零变动
    ⇒ 无跨宿主语义漂移信号，未逐条展开。

## 5. 可选特性（记录在案，本轮不移植）

| 特性 | 上游形态 | 适配器对应面 |
|---|---|---|
| ctx_search rerank | `search-rerank.ts`（505 行）：prose 查询识别（`isProseQuery`）+ 本地 `gte-reranker-modernbert-base-f32` / Synapse 重排，lane 上限 25、1.5s deadline；v0.49.29 增 hosted rerank 配置 | `ctx_search` 融合检索（0.7/0.3 未变）；检索质量有诉求时再评估 |
| historian chains（#740） | 按尝试链逐模型定块大小、链式 fallback | `config.historian.route` 单路由；需要多级 fallback 时跟进 |
| local-embedding-pooling | 按模型声明解析 pooling（mean/cls/last_token），未声明回落 legacy mean+normalize | 本地 MiniLM fp32 固定 mean 正确；**更换嵌入模型时必须回看** |
| auto-search worker / search archive 引用恢复 | 只读 worker + warm pool + 不可达引用从检索档案恢复 | DSH 侧无 auto-search；`ctx_search` 归档恢复思路可借鉴 |

## 6. 后续动作清单

1. （建议）实现 §3.1–§3.3 三个小项，各自补 spec（emergency 护栏 / historian 失败闸 /
   observations 产出开关），`npm run gate` 全绿。
2. （建议）PARITY.md 头部与 upgrade-followup §1 的 MC 锚点更新为
   **v0.49.30（47bcd71a2，2026-10-29，schema v95 不变）**——信息性更新，随上组改动一并提交。
3. 本文档记录分析结论；`.upstream/` 保留供后续 diff 复用（下次只需 `git fetch --tags`）。

## 附：方法与覆盖

- 只读；未改上游与适配器任何源码。逐条亲读的 diff：§2 表中 9 条对齐面提交全文、
  `tail-hygiene-output-count.ts` 全文、`memory-enabled.ts` 全文、selection.rs #731 测试、
  `search-rerank.ts`/`local-embedding-pooling.ts`/`historian-failure-reason.ts` 头部、
  适配器对应实现（emergency.ts、historian.ts 切块与触发、maintenance.ts verify、
  memory-lane.ts、reduce-guidance.ts、pre-step.ts historian 接线）。
- 未覆盖：dashboard 前端、`v2/` 全量、Pi 插件逐条、Rust transform.rs 细节（车道判定依据
  为文件分布与 PARITY 既有结论）。
