# Telemetry UI requirements — DSH Web/Desktop

Status: **research draft 2026-11-16**, for ticket 17. No implementation.
Upstream reference: `cortexkit/magic-context@v0.49.56`.
Current product baseline: working tree at `@elvisw/dsh-magic-context@0.14.0`.

This document answers one question: what should the DSH telemetry surface
communicate, and which parts of the OpenCode TUI sidebar idea should survive the
move from a persistent terminal sidebar to a dock pill plus popover?

## 1. Problem

The current DSH surface is a compact pill plus a popover:

- the pill is one line with a status dot and a short label
  (`src/client/index.js:2095-2365`);
- the popover header shows status and pressure;
- the body is a single-letter ledger `O L M P U T K V R E` plus an operations
  feed (`src/client/index.js:2450-2497`);
- the live data comes from `/mc-telemetry/summary` / `/mc-telemetry/events`
  (`src/dsh/telemetry.ts:312-326`).

That is useful as a compact audit strip, but it does not answer the questions a
user actually asks:

- why is context pressure this high?
- is the Historian running, idle, or stuck?
- how many memories are injected and how much do they cost?
- what is waiting in the reclaim queue?
- what did maintenance last do?
- is anything warning me before I hit a threshold?

The upstream OpenCode TUI sidebar answers those questions with a persistent,
sectioned surface. It has a collapse state, a pressure headline, a segmented
token bar with legend, and sections for Historian, Memory, Status, Dreamer and
Stats (`packages/plugin/src/tui/slots/sidebar-content.tsx:162-342, 744-1063`).
The full `/ctx-status` view adds Tags, Reductions, Pending Queue, Context
Details, Cache TTL, History Compression and Memory
(`packages/plugin/src/shared/status-view.ts:624-695`).

DSH cannot copy the persistent right rail: the Web host gives a dock/status seat
and a popover overlay, not a full-height sidebar. The requirement is therefore
**conceptual parity, not layout parity**: same information hierarchy and
priority, progressive disclosure adapted to a pill + panel.

## 2. Design principles

1. **One glance first.** The pill answers “am I near a threshold, and is
   anything running or waiting?” without opening anything.
2. **Progressive disclosure.** Pill → popover → `/ctx-status` full text. The
   popover should not become a dense debug console.
3. **Actionable over decorative.** Pressure, queue, Historian state and warnings
   outrank 24h counters and historical totals.
4. **Never fabricate precision.** Provider-anchored occupancy, host heuristic
   composition and adapter estimates are different truths; labels must say so.
5. **Unknown is a valid state.** If a field has no source, show `—` or omit the
   row; never render `0%`, `0 tok` or an empty bar as if it were measured.
6. **Live by event, with a quiet fallback.** Prefer SSE frames; poll only while
   the panel is open and for slow progress that emits no events.
7. **Localized and accessible.** Every card-owned string goes through `t()`;
   tooltips cannot be the only way to read a value.
8. **One data contract for Web and dsh-go.** The phone native renderer should
   consume the same view model, not parse the Web DOM.

## 3. Upstream reference map

| Upstream element | What it does | DSH decision |
|---|---|---|
| Header `▼ Magic Context` + version | Collapse/expand, identity, version | Keep identity/version in the panel; the pill itself is the collapsed state. No separate collapse toggle in v1. |
| Pressure headline | `usage% / executeThreshold%` and `tokens / contextLimit`, tone by pressure | Keep; tone must use configured `executeThreshold` / `forceThreshold`, not hardcoded 65/80. |
| Segmented token bar + legend | System, Docs, Compartments, Facts, Memories, Profile, Conversation, Tool Calls, Tool Defs with tokens and % | Keep the concept, not the category set. The bar has three host segments: System, Tool definitions, Messages. Message categories (Conversation, Tool calls, Compartments, Memories, Profile, Other) are an estimated **sub-list under Messages**, never peers of the host segments. Docs/Facts have no separate DSH source. |
| Hygiene row | Reclaimable share and two masses | Keep if the adapter can compute it from tagged surface nodes; label as estimate. |
| Historian section | running/idle, compartment count, recomp progress | Keep running/idle and compartment count. Recomp live progress is deferred unless a shared progress source exists. |
| Memory section | total memories and injected count | Keep total and injected; token cost only if `memory-recall` / `profile-recall` provides `estTokens`. |
| Status section | pending queue, notes, smart notes | Keep queue. Session notices exist as a journal kind (`session-notice`); smart notes have no DSH equivalent and stay out. |
| Dreamer section | current task, last run, backlog | Rename to **Maintenance** for DSH; show last tick and counts. No progress/backlog unless the maintenance worker exposes it. |
| Stats section | total tokens | Keep a session input-token total only if `tokenUsage` is available; do not call it “total” without a scope. |
| Warnings / host limitations | Persistent failure lines | Keep as a warning block above sections; source from recent error journal rows and config drift. |
| Collapsed summary | Historian, Dreamer, Memories, Status | This is the role of the DSH pill; compress to pressure, tokens, Historian, queue and error dot. |
| Preferences (sections/collapse) | User hides sections, remembers collapse | Defer section visibility; the popover is already transient. Persist only if users ask. |
| `/ctx-status` full view | Tags, reductions, cache, history, config, details | Keep as the full text fallback; the panel should not duplicate every row. |

Current DSH Web hardcodes two threshold pairs: the pill uses 50/65
(`src/client/index.js:2270-2272`) while the panel uses 60/85
(`:2400`). Both are UI drift; the implementation must read the configured
policy thresholds, not either hardcoded pair.

## 4. Data sources and truth levels

| Source | What it gives | Truth level |
|---|---|---|
| `contextPressure` projection (`src/index.ts:808-841`) | `pressureTokens`, `projectedTokens`, `contextWindow` | Provider-anchored occupancy; the headline number. |
| `contextBreakdown` projection (`node_modules/@deepseek-ai/dsh-token-meter/lib/types/projection.d.ts:48-68`) | `systemTokens`, `toolsTokens`, `messageTokens` | Host heuristic composition with exactly three segments; a fixed density estimate underprices CJK text and JSON schemas, so it does not necessarily sum to `projectedTokens`. |
| `sessionProjections.snapshot(session, keys)` / change feed (`node_modules/@deepseek-ai/dsh-session-projection/lib/types/index.d.ts:163-166,185`) | consistent read of registered projections, plus `onChanged` updates | Adapter can read it; resolve the live session with `ctx.sessions.get(id)` (`dsh-session/lib/types/index.d.ts:491`). A finished session uses journal/store fallbacks where available; `surface` needs a live `Session` and is null. |
| adapter stores | compartments, tags, pending drops, baseline, memory rows | Exact persisted state, but not all are “tokens in the next prompt”. |
| journal | `memory-recall`, `profile-recall`, `pass`, `drop-landed`, `compartment-published`, `historian`, `error` | Exact events, approximate token costs only where `estTokens` is written. |
| `/ctx-status` (`src/dsh/status-command.ts:82-106`) | pressure, pass decision, tag counts, queue, historian/compartments, baseline, policy, journal | Full-text diagnostics; not a live UI feed. |
| `/mc-telemetry/summary` (`src/dsh/telemetry.ts:260-326`) | adapter, project, health counters, recent rows | Current UI feed; missing many fields listed below. |

Important distinction:

- `projectedTokens` is what the next request would cost, anchored to the last
  provider-reported prompt.
- `contextBreakdown` is a heuristic composition with **three host segments**
  (`systemTokens`, `toolsTokens`, `messageTokens`); it must be labeled
  “estimated composition”. It is not a 9-category breakdown, and it does not
  necessarily sum to `projectedTokens`: the host uses a fixed density estimate
  that underprices CJK text and JSON schemas
  (`projection.d.ts:48-54`). Covered/digested history is absent for a separate
  reason: it is no longer on the current surface.
- `compartment.coveredTokens` is the span the Historian digested, not the
  tokens the compartment replacement currently occupies. It is a history fact,
  not a current bar segment.
- `memory-recall.estTokens` is the injected memory block estimate for that pass;
  it is the right source for the “Memories” row in the message sub-list, not the
  number of rows. It is an adapter estimate, not a provider measurement.
- Message-category rows (Conversation, Tool calls, Compartments, Memories,
  Profile, Other) are **sub-rows under Messages**, estimated by splitting
  `messageTokens`. They must not be added to System/Tools as peers, or the bar
  double-counts surface nodes.

Truth labels used in the matrix:

| Label | Meaning |
|---|---|
| `exact` | persisted or host-reported value read without estimation |
| `provider-anchored` | anchored to the last provider prompt; deltas may be heuristic |
| `host-heuristic` | host-computed composition (three segments only) |
| `adapter-estimate` | adapter text-length or last-event estimate |
| `derived` | computed from other fields (tone, residual) |
| `unavailable` | no DSH source; must not be rendered as a number |
| `design` | contract/mapping only; no runtime value |

Unknown is not zero. A field that is unavailable is omitted; a field that exists
but cannot be measured is `null`; `0` is rendered only when the source measured
zero (for example, no system prompt).


## 5. Information architecture

### Tier 0 — pill (always visible)

One line, maximum one visual row on a narrow composer. Required fields, in
priority order:

1. status dot: healthy / connecting / unavailable / error;
2. pressure `42%` (no decimals);
3. token pair `53k/128k`;
4. Historian state `H idle` / `H run` (or an icon with accessible label);
5. queue count `Q3` only when > 0;
6. error count `!2` only when recent errors exist.

The pill must not show the brand name if the dock is already crowded; the
accessible label and tooltip carry “Magic Context”. The pill is not a place for
24h counters, memory totals or operation history.

Proposed compact form:

```text
● 41% · 53k/128k · H idle · Q3
```

If the dock supplies its own occupancy pill, the DSH pill may drop `53k/128k`
to avoid duplication; that is a host-composition decision, not a data change.

### Tier 1 — popover (default expanded view)

Order matters; this is the reading order:

1. **Header**: `Magic Context` + version + status label + pressure headline
   (`41.4% / 65%` left, `53k / 128k` right), color from thresholds.
2. **Token composition (host bar + message sub-list)**:
   - host bar segments: System, Tool definitions, Messages from
     `contextBreakdown`, drawn as a 100% stacked composition of those three
     segments; the pressure headline above is occupancy and uses a different
     denominator;
   - a secondary “Message composition (estimated)” list: Conversation, Tool
     calls, Compartments, Memories, Profile, Other; each row only if a source
     exists, and the rows must not exceed `messageTokens`;
   - no Docs/Facts rows without a host source;
   - if `coveredTokens > 0`, state that covered history is absent from the
     current surface and is not part of the bar.
3. **Historian**: running/idle, compartment count, last publication time if
   available; recomp progress only if a real progress source exists.
4. **Memory**: total project memories, injected count, estimated injected
   tokens; profile row if profile injection is active.
5. **Status**: pending queue count, queued tags, session notices (journal
   `session-notice`); smart notes are unavailable and are not shown.
6. **Maintenance**: last tick time, expired/verified/updated/archived counts;
   no “dreamer backlog” fiction.
7. **Warnings**: persistent error/config warnings, capped to 2–3 lines with a
   “view all” entry to `/ctx-status` or operations.
8. **Recent operations**: the existing feed; keep it last and collapsible in a
   later iteration.

The panel should be scrollable, not grow beyond the viewport. It should not
duplicate the whole `/ctx-status`; details such as tag counts, cache TTL,
protected tags, denominator source and config generation belong there unless a
user asks for them in the panel.

### Tier 2 — `/ctx-status`

Keep the existing full text surface. Add only fields that become newly available
and are useful for support, e.g. context denominator source, active/dropped
tags, pending marker, cache state. Do not turn the panel into a second full
status dialog.

## 5.1 Static wireframe

These are text wireframes, not implementation. Numbers are illustrative.

### Pill — healthy

```text
● 41% · 53k/128k · H idle · Q3
```

### Pill — warning / error

```text
● 72% · 92k/128k · H run · Q3 · !2
```

### Pill — unavailable / no telemetry route

```text
○ — · telemetry unavailable
```

### Popover — wide (352px, default expanded)

```text
┌──────────────────────────────────────────────┐
│ ● Magic Context                 v0.14.0  ×   │
│ 41.4% / 65%                     53k / 128k    │
│ [█████▓▓▓░░░░░░░░░░░░]  composition of 53k   │
│ System          12k  23%                      │
│ Tool definitions 8k  15%                      │
│ Messages        33k  62%                      │
│                                               │
│ Message composition (estimated)               │
│ Conversation    14k                           │
│ Tool calls       9k                           │
│ Compartments     6k  (3)                      │
│ Memories         3k  (12 total / 8 injected)  │
│ Profile          1k                           │
│                                               │
│ Historian        idle · 3 compartments        │
│ Memory           12 total · 8 injected        │
│ Reclaim queue    3 pending                    │
│ Maintenance      last 12m ago · 4 archived    │
│ Warnings         !2 recent errors      [view] │
│                                               │
│ Recent operations                     last 5  │
│ ● Reclaim pass   reclaimed 6.8k tok   10:42   │
│ ● Memory recall  recalled 8 rows      10:41   │
│ ● Historian      digest ready         10:38   │
└──────────────────────────────────────────────┘
```

The bar is a 100% stacked composition of the three host segments; the headline
above it is occupancy (`53k / 128k`), not the bar denominator. Legend
percentages are composition shares of `53k`, not shares of the context window.
The message sub-list is an adapter estimate and does not re-add those tokens to
the bar. The illustrative numbers are consistent: 12k + 8k + 33k = 53k
(23% + 15% + 62% ≈ 100%); the sub-list 14k + 9k + 6k + 3k + 1k = 33k.

### Popover — narrow (composer < 480px)

```text
┌────────────────────────────┐
│ ● Magic Context        ×   │
│ 41.4% / 65%     53k/128k   │
│ [███▓▓░░░░░░░]             │
│ System / Tool defs / Messages │
│ H idle · Q3                │
│ ─────────────────────────  │
│ Historian     idle         │
│ Queue         3 pending    │
│ Maintenance   last 12m ago │
│ [More details]             │
└────────────────────────────┘
```

In the narrow variant the bar stays a 100% stacked composition of the three host
segments; the message sub-list is hidden. Do not replace it with
Compartments/Memories as peer segments. The pill always stays one line. `!0` is
never rendered: the error indicator appears only when the count is greater than
zero.


### Empty state

```text
Magic Context
No telemetry data yet
The adapter is loaded; waiting for the first model request.
```

### Unavailable state

```text
○ Magic Context            telemetry unavailable
This host exposes no /mc-telemetry route.
[Open /ctx-status]
```

### Warning state

```text
● Magic Context                 v0.14.0  ×
⚠ 2 recent errors · config drift detected
[Show details] [Open /ctx-status]
```

### Optional details drawer

```text
▸ Details
  Tags            active 48 / dropped 12 / total 60
  Denominator     128k (route-disclosed)
  Session tokens  input 1.2M · output 84k · cache 920k
```

The details drawer is P2. It keeps tag/token-total/cache facts out of the
default reading order; it must not be used to invent cache TTL or smart notes.

## 5.2 中文版线框

中文版不是把英文逐字替换，而是先固定一套术语，再按同一信息层级排版。
技术 id（`ctx_*`、`/mc-telemetry`、`Historian`）在详情/提示中保留，不在
主标签里堆英文。

### 术语表

| 英文 | 中文 UI 文案 | 备注 |
|---|---|---|
| Magic Context | Magic Context | 产品名保留 |
| Pressure | 上下文压力 | 胶囊只显示百分比 |
| Execute threshold | 执行阈值 | 与策略一致 |
| Force threshold | 强制阈值 | 与策略一致 |
| Token composition | 上下文构成（估算） | 必须带“估算” |
| System | 系统 | 宿主 system prompt |
| Tool definitions | 工具定义 | `toolsTokens` |
| Messages | 消息 | 宿主 `messageTokens` |
| Message composition | 消息构成（估算） | 消息的二级拆分 |
| Compartments | 压缩段 | 技术名 `compartment` 放详情 |
| Memories | 记忆 | 项目记忆 |
| User profile | 用户画像 | 画像注入 |
| Conversation | 对话 | 用户/助手正文 |
| Tool calls | 工具调用 | 工具结果/调用 |
| Other | 其他 | 未能分类的余量 |
| Historian | 历史摘要 | 技术名 `Historian` 放提示 |
| Reclaim queue | 回收队列 | pending drops |
| Session notices | 会话提示 | `session-notice` journal |
| Maintenance | 维护 | 原 dreamer 切片 |
| Warnings | 警告 | 错误/配置漂移 |
| Recent operations | 最近操作 | 现有 feed |
| Tags | 标签 | 详情抽屉 |
| Hygiene | 可回收比例 | 估算 |
| Cache TTL | 缓存有效期 | DSH 暂无来源，v1 不显示 |
| Smart notes | 智能笔记 | DSH 无对应概念，v1 不显示 |

token 数字统一保留 `k` / `M` 单位，不做“万/亿”换算；模型窗口本来就用
`128k` 这类写法，混用会降低可读性。

现有字典把 Historian 写成“历史归档”，和记忆分类 `archive` 的中文“历史归档”
撞名；本设计改用“历史摘要”，实现时同步 `record.historianFailed` 等既有文案。

### 胶囊

```text
● 41% · 53k/128k · 摘要 空闲 · 队列 3
```

警告/错误：

```text
● 72% · 92k/128k · 摘要 运行 · 队列 3 · 警告 2
```

不可用：

```text
○ — · 遥测不可用
```

### 弹层（宽屏，默认展开）

```text
┌──────────────────────────────────────────────┐
│ ● Magic Context                 v0.14.0  ×   │
│ 41.4% / 65%                     53k / 128k    │
│ [█████▓▓▓░░░░░░░░░░░░]  53k 的构成            │
│ 系统            12k  23%                      │
│ 工具定义         8k  15%                      │
│ 消息            33k  62%                      │
│                                               │
│ 消息构成（估算）                              │
│ 对话            14k                           │
│ 工具调用         9k                           │
│ 压缩段           6k  (3)                      │
│ 记忆             3k  (12 条 / 注入 8 条)      │
│ 用户画像         1k                           │
│                                               │
│ 历史摘要         空闲 · 3 个压缩段             │
│ 记忆             12 条 · 已注入 8 条           │
│ 回收队列         3 条待落地                    │
│ 维护             最近 12 分钟前 · 归档 4 条    │
│ 警告             2 个近期错误          [查看] │
│                                               │
│ 最近操作                              最近 5 条│
│ ● 执行回收       回收 6.8k tok        10:42   │
│ ● 加载记忆       加载 8 条            10:41   │
│ ● 历史摘要       摘要就绪             10:38   │
└──────────────────────────────────────────────┘
```

条是三个宿主段的 100% 堆叠构成；上方的 41.4% 是窗口占用，不是条的
分母。百分比是 `53k` 的构成占比，不是窗口占比。消息构成是二级估算，
不再加回条段。示例数字自洽：12k + 8k + 33k = 53k（23% + 15% + 62% ≈
100%）；消息构成 14k + 9k + 6k + 3k + 1k = 33k。

### 弹层（窄屏）

```text
┌────────────────────────────┐
│ ● Magic Context        ×   │
│ 41.4% / 65%     53k/128k   │
│ [███▓▓░░░░░░░]             │
│ 系统 / 工具定义 / 消息     │
│ 摘要 空闲 · 队列 3         │
│ ─────────────────────────  │
│ 历史摘要     空闲          │
│ 回收队列     3 条待落地    │
│ 维护         12 分钟前     │
│ [更多详情]                 │
└────────────────────────────┘
```

窄屏只保留三个宿主段的 100% 堆叠构成，隐藏消息构成；不要把压缩段/记忆
当成条段。`警告 0` 不显示，只有数量大于零才出现警告项。


### 空状态 / 不可用 / 警告

```text
Magic Context
暂无遥测数据
插件已加载，正在等待第一次模型请求。
```

```text
○ Magic Context            遥测不可用
当前宿主没有提供 /mc-telemetry 路由。
[打开 /ctx-status]
```

```text
● Magic Context                 v0.14.0  ×
⚠ 2 个近期错误 · 检测到配置漂移
[查看详情] [打开 /ctx-status]
```

### 详情抽屉（P2）

```text
▸ 详情
  标签        活跃 48 / 已丢弃 12 / 总计 60
  分母        128k（路由公布）
  会话 token  输入 1.2M / 输出 84k / 缓存 920k
```

中文版排版规则：

- 标签列按最长中文标签（“工具定义”“历史摘要”“回收队列”）留宽度；
- 警告句子最多两行，超出时显示“详情”；
- 胶囊优先缩写：`摘要`、`队列`、`警告`；
- 所有中文文案走 `t()` 字典，不在组件里硬编码；
- 英文保留 `Historian`、`compartment` 作为技术别名，只在提示/详情出现。



## 6. Requirements matrix

Priority: **P0** = v1 panel/pill must ship; **P1** = v1 if the source is cheap
and reliable; **P2** = deferred or `/ctx-status` only. “Surface” uses
`P` pill, `D` popover, `S` `/ctx-status`. “Truth” uses the labels defined in
§4; each row has exactly one truth label and one priority.

| ID | Requirement | Meaning / source | Truth | Priority | Surface | Empty / error state |
|---|---|---|---|---|---|---|
| TEL-01 | Pressure headline | `projectedTokens / contextWindow`; provider-anchored | provider-anchored | P0 | P/D/S | `—` when no usage; `unknown window` when denominator absent |
| TEL-02 | Threshold pair | configured `executeThreshold` / `forceThreshold` | exact | P0 | D/S | show configured values; `assumed` only for an assumed context window, never a clamp |
| TEL-03 | Token pair | projected / window in compact units | provider-anchored | P0 | P/D | `—`; never `0/0` |
| TEL-04 | Pressure tone | green below execute, amber at execute, red at force | derived | P0 | P/D | neutral when unknown |
| TEL-05 | Host token bar | `contextBreakdown` three segments, 100% stacked composition | host-heuristic | P0 | D | hide bar when breakdown absent; occupancy headline is separate; note covered history absent |
| TEL-06 | System / Tool definitions / Messages | host `contextBreakdown`; the only bar segments | host-heuristic | P0 | D | omit only a measured zero; legend shares are composition shares of the three segments, not window percentages |
| TEL-07 | Message composition sub-list | split `messageTokens` using surface text estimates; Conversation, Tool calls, Compartments, Memories, Profile, Other | adapter-estimate | P1 | D | omit rows without a source; sub-rows must not exceed `messageTokens`; never peers of the host bar |
| TEL-08 | Compartment row | current replacement cost estimate, not `coveredTokens` | adapter-estimate | P1 | D | omit if no replacement text; count is TEL-13 |
| TEL-09 | Memories / profile tokens | last `memory-recall.estTokens` / `profile-recall.estTokens` | adapter-estimate | P1 | D | omit if no recall row; do not show row count as tokens |
| TEL-10 | Conversation / tool calls split | split host `messageTokens` using surface estimates | adapter-estimate | P1 | D | remainder goes to Other; never claim provider-exact categories |
| TEL-11 | Other / residual | `max(0, messageTokens - classified)` | derived | P1 | D | show only if > 0 |
| TEL-12 | Historian running/idle | `historianInFlight(sessionId)`; additive telemetry field | exact | P0 | P/D | `idle` when none; `unknown` when telemetry unavailable |
| TEL-13 | Compartment count / covered | `listCompartments`; covered tokens as history fact | exact | P0 | D/S | `0` is valid; label covered as digested, not current |
| TEL-14 | Pending queue | `listPendingDrops(sessionId)` | exact | P0 | P/D/S | `empty`; count tags only when known |
| TEL-15 | Session notices | journal `session-notice` | exact | P2 | D/S | omit if none; never borrow upstream “smart notes” |
| TEL-15b | Smart notes | no DSH equivalent | unavailable | P2 | — | omit; no placeholder |
| TEL-16 | Maintenance | `maintenanceLast` + journal counters | exact | P1 | D | `never run` or `unknown`; no backlog/progress fiction |
| TEL-17 | Cache TTL / remaining | DSH usage has cache read/write only | unavailable | P2 | S | omit; never invent a TTL |
| TEL-18 | Tags active/dropped/total | stores + surface placeholders | exact | P2 | S | `n/a` on failure; keep out of P0 |
| TEL-19 | Hygiene / reclaimable share | tagged surface estimate | adapter-estimate | P1 | D/S | hide when not evaluable |
| TEL-20 | Warnings | recent error journal + config drift | exact | P0 | P/D | red dot; panel lists at most 3, full list in S |
| TEL-21 | Operations feed | existing journal rows | exact | P0 | D | “no operations yet”; route unavailable copy |
| TEL-22 | Session token total | `tokenUsage` projection; scoped input/output/cache | exact | P2 | D/S | omit; never call it all-time “total” |
| TEL-23 | Version / uptime | `adapterVersion` (new meta field from package.json) + `uptimeMs` | exact | P1 | D | `unknown` |
| TEL-24 | Stale / disconnected | last event time + SSE state | derived | P0 | P/D | muted “stale” after 120 s; never zero values |
| TEL-25 | Localization / a11y | zh/en dictionaries, `t()`, aria, keyboard | design | P0 | P/D | fallback en; no tooltip-only values |
| TEL-26 | Native dsh-go mapping | same view model, different renderer | design | P1 | — | `composer.strip` one line, `panels` sections |

### 6.1 v1 recommendation

Ship P0 plus the cheap P1 fields:

- pressure + threshold + tokens;
- host bar: System / Tool definitions / Messages only;
- message sub-list: Conversation / Tool calls / Compartments / Memories /
  Profile / Other, each only when a source exists;
- Memories and Profile token estimates only when `estTokens` exists;
- compartments count (not a fake bar segment);
- Historian running/idle and queue count;
- maintenance last tick;
- warnings and operations feed;
- no cache TTL, smart notes, recomp live progress, tag counts or token total in
  the popover.

The full upstream 9-category bar is a goal, not a v1 promise. DSH currently has
no exact source for Docs, Facts or a per-category message split; the honest v1
is a three-segment host bar plus a clearly labeled message sub-list. Inventing
peer categories would double-count surface nodes and make the UI look complete
while being wrong.

### 6.2 Feasibility assessment

“Feasible” below means feasible in the plugin without changing the DSH host.
The implementation ticket may add adapter code and additive telemetry fields,
but no host API change is required for the P0 set.

| UI element | Feasibility | Source / work | Honesty rule |
|---|---|---|---|
| Pressure %, threshold and tone | **Yes, exact** | `contextPressure` + policy (`src/index.ts:808-841`) | `—` when no usage; tone uses configured thresholds |
| Token pair `used / window` | **Yes, exact** | `projectedTokens`, `contextWindow` | never `0/0` |
| System / Tool definitions / Messages bar | **Yes, heuristic** | host `contextBreakdown` via `sessionProjections.snapshot` / `onChanged` (`projection.d.ts:56-68`) | label “estimated composition”; 100% stacked three segments; it is not a full 9-category total |
| Message composition sub-list | **Yes, estimate** | split host `messageTokens` using surface text lengths; Conversation / Tool calls / Compartments / Memories / Profile / Other | sub-rows only, never added to the bar; remainder goes to Other |
| Compartment row | **Yes, estimate** | `renderCompartment()` at the current tier (`src/core/compartments.ts:107-142`); do **not** use `coveredTokens` as the current cost | label estimate; covered tokens stay a history fact |
| Memories / Profile rows | **Yes, last-injection estimate** | `memory-recall.estTokens` (`src/dsh/pre-step.ts:491-508`) and `profile-recall.estTokens` (`:510-524`) | label “last injection”; omit when no row |
| Conversation / Tool calls split | **Partial, estimate** | split host `messageTokens` using surface text lengths; remainder goes to `Other` | never claim provider-exact category totals |
| Facts / Docs rows | **No separate source** | facts are rendered inside compartments; docs are inside the host system prompt | fold into Compartments/System or omit; no fake row |
| Other / residual | **Yes, derived** | `messageTokens - classified` | show only when > 0 |
| Historian running / idle | **Yes, additive API** | existing `historianInFlight(sessionId)` (`src/dsh/historian.ts:377-388`); expose through telemetry | `idle` when none; `unknown` when telemetry is down |
| Compartment count / covered history | **Yes, exact** | `listCompartments`; `coveredTokens` is digested span size | label covered as “digested”, not current prompt cost |
| Recomp live progress | **No shared live source** | only journal `compartment-recomp` results today; no progress state | defer; do not infer from a generic running flag |
| Memory total / injected | **Yes, exact + journal** | `memoryStats.total`, `memoryStats.verified/unverified`; `memory-recall.rows` | show total/injected; token cost only with `estTokens` |
| Pending reclaim queue | **Yes, exact** | `listPendingDrops(sessionId)` | `empty` state, not `0` as a measured pressure |
| Session notices | **Yes, journal events** | `session-notice` journal kind (`src/core/journal.ts:53`); smart notes have no DSH equivalent | show notices only if useful; omit “smart notes” |
| Maintenance last run | **Yes, exact** | `maintenanceLast` (`src/dsh/maintenance-wiring.ts:156`) | no backlog/progress fiction |
| Cache TTL / remaining | **No DSH source** | usage has cache read/write only, no TTL | omit entirely |
| Tag counts | **Yes, exact** | stores + surface placeholders | P2 details drawer / `/ctx-status`, not P0 |
| Hygiene / reclaimable share | **Yes, estimate** | tagged surface nodes and token estimates | hide when not evaluable |
| Warnings | **Yes, exact events** | recent error journal + config-drift rows | cap panel lines; full list in `/ctx-status` |
| Operations feed | **Yes, current** | existing `/mc-telemetry/events` + journal rows | keep last |
| Session token total | **Yes, host projection** | `tokenUsage` projection; scope it as session input/output/cache | P2; do not call it all-time “total” |
| Stale / disconnected | **Yes, derived** | client last-frame timestamp + SSE state | muted “stale”; keep last good values |
| dsh-go native mapping | **Design only** | same view model → `composer.strip` + `panels` | deferred until the Web contract is implemented |

**Overall verdict:** every P0 field is implementable with plugin-side work and
additive telemetry fields. The only P0 caveat is token composition: System, Tool
definitions and Messages are host heuristics; Compartments, Memories and Profile
are adapter estimates inside the message sub-list; the UI must say “estimated
composition”. The full upstream 9-category bar is not implementable honestly
without new host accounting for Docs, Facts and per-category message splits.
Cache TTL, smart notes, dreamer backlog and live recomp progress are not
implementable from current DSH sources and should stay out of v1.


## 7. Minimum additive telemetry API

The current `health` payload already has some keys asserted by tests
(`tests/telemetry.spec.ts:88-92`); those keys must remain. Additive fields are
optional, and a missing dependency must degrade to `null`/omission, never to a
zero measurement.

Proposed `health` additions:

```jsonc
{
  "adapterVersion": "0.14.0",
  "contextBreakdown": {
    "systemTokens": 12000,
    "toolsTokens": 8000,
    "messageTokens": 33000
  },
  "historian": {
    "running": false,
    "compartments": 3,
    "coveredTokens": 42000,
    "lastPublishedAt": 1763299080000
  },
  "queue": {
    "pendingDrops": 3,
    "tags": [1, 2, 3]
  },
  "memory": {
    "total": 12,
    "injected": 8,
    "estTokens": 3000,
    "profileEstTokens": 1000
  },
  "surface": {
    "tagged": 48,
    "dropped": 12,
    "reclaimableTokens": 6800
  }
}
```

Optional P2 block, only when the host exposes `tokenUsage`:

```jsonc
"tokenUsage": {
  "uncachedInputTokens": 1200000,
  "outputTokens": 84000,
  "cacheReadTokens": 920000,
  "cacheWriteTokens": 0
}
```

### 7.1 Null, omitted and zero

- **Omitted** means the field is not applicable (for example, the existing
  top-level `summary.sessionId` is absent for the global scope; do not duplicate
  it inside `health`).
- **`null`** means the field is applicable but currently unknown/unavailable.
- **`0`** means the source measured zero. A missing projection must not produce
  `{ systemTokens: 0, toolsTokens: 0, messageTokens: 0 }`.
- `contextBreakdown` is `null` when the projection is missing; when present, all
  three numbers are measured and may legitimately be zero (for example, no
  system prompt).
- `historian` is `null` when the session is not live and no journal fallback is
  available; `lastPublishedAt` is `null` when nothing has been published.
- `queue` is always present for a session scope; an empty queue is
  `{ pendingDrops: 0, tags: [] }`.
- `memory` is `null` when memory stats are unavailable; `estTokens` and
  `profileEstTokens` are `null` when no recall row exists.
- `surface` is `null` when the surface cannot be enumerated; a measured zero is
  `0`.

### 7.2 Sources and session resolution

- `createTelemetryService` receives a `resolveSession(sessionId)` dependency
  from `src/index.ts`; it calls `ctx.sessions.get(id)`
  (`dsh-session/lib/types/index.d.ts:491`).
- **Live session:** first frame from
  `sessionProjections.snapshot(session, ['contextPressure',
  'contextBreakdown'])`; thereafter subscribe to the projection change feed
  (`dsh-session-projection/lib/types/index.d.ts:163-166`) and cache the last
  value. Do not re-snapshot on every poll.
- **Finished session:** no live projection; `contextPressure` and
  `contextBreakdown` are null unless a cached value exists. `historian.running`
  is `false` (the in-memory map cannot know about a finished run), while
  `compartments`, `coveredTokens` and `lastPublishedAt` come from stores/journal.
  `queue` and `memory` come from stores/journal. `surface` is `null`: enumerating
  it needs a live `Session`, and `reclaimableTokens` must not be claimed without
  one.
- **Global scope:** the existing top-level `summary.sessionId` is absent and
  all session-derived projection fields are omitted; keep only
  adapter/version/global counters. Do not duplicate `sessionId` inside `health`.
- `historian.lastPublishedAt`: latest journal `compartment-published` row's
  `at` (epoch milliseconds, matching `lastEventAt` / `maintenanceLast.at`; the
  client formats it).
- `adapterVersion`: add the package version to adapter meta (the current payload
  has `schemaVersion` and `uptimeMs` but no package version); source it from
  `package.json` at build time or from the adapter meta dependency.
- `surface.reclaimableTokens`: `enumerateSurfaceToolResults`
  (`src/dsh/seams.ts:145-179`) plus the existing estimate.
- `memory.total` / `injected`: `memoryStats` (`src/index.ts:746-763`) and
  `memory-recall.rows`.
- `queue`: `listPendingDrops(sessionId)` and its tag list.
- `tokenUsage` is optional P2; it is **not** part of the minimum v1 payload and
  must not gate the pressure/bar UI.

`staleAfterMs` stays out of the payload; it is a client display constant.
## 8. Interaction, layout and refresh

### Pill

- Single line, `nowrap`, tabular numerals. The pressure percentage and status
  dot never drop.
- Shrink order at narrow composer widths:
  1. drop the token pair;
  2. replace `H idle` / `Q3` text with icon + accessible label (the values stay
     in the tooltip);
  3. at the narrowest width keep only the dot and pressure.
- Width targets: full form at `>= 360px`; token pair drops at `< 360px`;
  `H`/`Q` iconize at `< 280px`; dot + pressure only at `< 220px`.
- Click toggles the popover; click outside/Escape closes; focus returns to the
  pill.
- Tooltip carries the full status and the meaning of abbreviations.

### Popover

- Width: 352px current maximum (`src/client/index.js:2507-2526`); on narrow
  viewports use `calc(100vw - 24px)`.
- Max height: viewport minus margins; body scrolls; header stays visible.
- Sections use label/value rows and a section header; no single-letter ledger
  as the primary reading path.
- A collapsed “Details” group may hold tags, denominator source and token total;
  do not show those in the default reading order.
- Empty sections are omitted; a single “No telemetry data yet” state explains
  why.

### Refresh

- One SSE connection per session; snapshot on connect; live journal events
  append to the feed.
- The `contextBreakdown` projection has a change feed; consume it instead of
  polling the projection. Poll the summary only while the popover is open, at a
  modest interval; do not poll the model or run maintenance.
- Stale state: if no event and no snapshot update for 120 s, show a muted
  “stale” tag and last update time; do not zero out values. The constant lives in
  the client, not in the telemetry payload.
- Recomp progress, if added later, needs its own poll/event source; do not infer
  it from a generic “running” boolean.

## 9. Localization and accessibility

- Every label, section title, empty state and warning sentence goes through the
  zh/en dictionaries; technical ids remain as-is.
- Numbers use compact token units and tabular figures; percentages use one
  decimal in the panel, integer in the pill.
- The status dot has a text label, not color alone.
- The bar has an accessible text equivalent (legend) and a `role="img"`
  description with total and categories.
- Keyboard: Tab reaches the pill, Enter/Space opens, Escape closes, focus trap
  inside the panel while open, focus returns to the pill.
- Contrast: use host theme tokens; do not hardcode colors except the category
  palette, which should remain stable across themes.
- Reduced motion: no animated bar transitions; state changes are instant.

## 10. Acceptance criteria for the implementation ticket

This research spike itself is accepted when the document exists, is sourced and
is independently validated. A later implementation ticket must add:

1. Additive telemetry fields with tests proving old summary keys still exist
   and new keys degrade to `null`/omitted, never a zero measurement and never a
   throw.
2. A pure view-model builder (headline, host bar segments, message sub-list,
   sections, warnings) tested without a browser; the UI renders from that model.
3. The bar is a 100% stacked composition with exactly three host segments
   (System, Tool definitions, Messages); the occupancy headline is separate;
   message categories are a sub-list, never peer segments.
4. Pill remains one line at 1280, 1024 and narrow composer widths; no horizontal
   scroll; token pair drops before H/Q text; dot and pressure never drop.
5. Panel shows P0 fields, hides unavailable sections, and shows explicit
   `unknown`/`stale` states.
6. Pressure tone and threshold pair follow configured policy, not the hardcoded
   pill 50/65 or panel 60/85.
7. No `0` rendered for an unknown measurement; no “Facts”, “Docs”, “Cache TTL”
   or “Smart Notes” rows without a real source. Session notices use the
   `session-notice` journal kind.
8. zh/en parity for all new strings, including the Chinese wireframe terms;
   `npm run check:i18n` passes.
9. Keyboard/focus/aria checks and a browser smoke on the real DSH Web host.
10. `/ctx-status` remains the full diagnostic surface and is linked from the
    panel footer.
11. The same view model is documented for the future dsh-go `composer.strip`
    and `panels` renderer; no Web DOM scraping.


## 11. Non-goals

- No implementation in this spike.
- No persistent right sidebar in DSH Web.
- No exact per-category token accounting where the host does not provide it.
- No cache TTL, smart-note, dreamer-backlog or recomp-progress fiction.
- No dsh-go port; the phone renderer waits for this contract.
- No package, schema, release or daily-profile change.

## 12. Resolved decisions for v1

1. The pill keeps the dot + pressure + optional token pair + `H`/`Q`; the brand
   stays in the panel header and the accessible label. No separate brand text in
   the pill.
2. The panel shows the overview immediately; tags, denominator source and
   session token totals live in a collapsed “Details” group.
3. “Maintenance” is the DSH label; “Dreamer” is not shown in the Web UI.
4. The bar has three host segments; message categories are a sub-list. The
   9-category upstream bar is a future goal, not v1.
5. Stale threshold is 120 s, a client constant; it is not part of the telemetry
   payload.
