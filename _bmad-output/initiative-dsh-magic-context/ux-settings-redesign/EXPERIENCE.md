---
name: Magic Context Settings Experience
description: Experience contract for the host-native redesign of the Magic Context Settings card.
status: draft
sources:
  - ../../../docs/dsh-plugin-settings-ui-contract.md
  - ../../../README.zh-CN.md
updated: 2026-11-17
---

# Magic Context Settings — Experience Spine

> Paired with `DESIGN.md`. Visual tokens live there; this file specifies behavior, information architecture, states and flows. Where this file conflicts with a wireframe, this file wins. Where it conflicts with `DESIGN.md` on visual treatment, `DESIGN.md` wins. `FIELDS` wins on the field inventory.

## Foundation

- **Form factor:** desktop-first DSH Web Settings dialog, usable in a narrow split-screen window.
- **UI system:** DeepSeek Harness Settings shell and DSH alias tokens. A plugin-owned React render function renders the card; the card does not own the outer dialog, host navigation or the placement of the host Save button.
- **Existing contract:** one top-level `settings.section` card, one revision-fenced Save, volatile config values, no plugin-owned config write. The redesign keeps the existing field set, validation and Save semantics.
- **Host constraint:** the card is rendered inside a scrollable dialog. `SettingsForm` has no footer prop and no `busy` prop. It renders a fixed footer containing only **Save** (no global Reset), disables that Save when `!dirty || invalid || saving`, and calls `onDiscard` when the page unmounts. The design does not add a second user-visible Save; `保存并…` and rollback call the same revision-fenced Save programmatically.
- **Why this redesign:** the current form is a flat list of 22 core fields plus 12 vector fields. The controls work, but state and actions are discoverable only by scrolling. The exact current height is not a requirement; the success metric is that the first viewport answers four questions and every section is one jump away.

### Success criteria

At 1280×900, without scrolling the card:

1. What is the reclaim policy?
2. Is the Historian enabled, and which effort is pinned?
3. Which vector space is active?
4. Is a rebuild running, paused, complete or absent?

The first viewport must also show the unsaved state without rendering a second Save.

## Information Architecture

| Surface / block | Reached from | Purpose |
|---|---|---|
| Summary strip | Top of card | Four metrics: reclaim policy, Historian, vector space, rebuild coverage |
| Status strip | Last child before the fixed footer | Unsaved count, validation count, busy or saved state; not a footer slot and not sticky |
| Jump row | Below summary | Move to a section without losing draft state |
| 常规 | Default visible | Execute/force thresholds, assumed window, reclaim TTL, protected results, budgets |
| Historian | Jump / scroll | Enable switch, route pins, reasoning effort, node/token/timeout limits |
| Journal | Jump / scroll | Enable switch, retention, mirror |
| 向量检索 | Jump / scroll | Provider, preset, endpoint, model, key env, probe, rebuild, rollback |
| 维护与诊断 | Jump / scroll | Maintenance route, compaction switch, `/ctx-status` hint |

The card is a **single page**. The jump row is a set of anchor buttons, not tabs: all sections stay mounted, drafts survive, and browser find still works.

Ordering rationale:

1. Policy and health-adjacent state first.
2. Common configuration next.
3. Vector search after memory and Historian, because it is opt-in and has the most consequences.
4. Diagnostics last, because it is consulted when something is wrong.

### Summary data sources

| Metric | Source | Unavailable display |
|---|---|---|
| Reclaim policy | Config snapshot: `policy.executeThreshold` / `policy.forceThreshold` | `—` |
| Historian | Config snapshot: `historianEnabled`, `historian.reasoningEffort` | `—` |
| Vector space | Embedding status: `model` + coverage for both local and remote; never read remote `embedding.model` for a local target | `本地` without a model, never `0d` |
| Rebuild | Embedding status: state + `covered / total` for a remote target | `未启用` for local or `rollback-local`; `—/N` when total unknown. Local coverage stays in the vector section, not the rebuild metric. |

The card never presents a live context-pressure metric because that value is not part of the Settings snapshot. It may show the configured thresholds; it must not invent a percentage.

### Seat variants

| Host seat | Treatment |
|---|---|
| `settings.section` | Full redesign: summary, jump row, sections, advanced disclosures, status strip |
| `plugins.item` | Removed in T21; the old Plugins card is deprecated |
| `plugins.row.config` | Removed in T21; the old row-config card is deprecated |

T21 requires a host that provides `settings.section` (the 0.2.2-rc.1 shell used by current gates). Removing the legacy registrations is a deliberate, release-noted breaking change for older hosts, not a silent fallback.

## Voice and Tone

| Do | Don't |
|---|---|
| “本地模型 · 已就绪” | “向量引擎状态：OK” |
| “远程配置已保存，尚未开始重建” | “配置已提交，等待异步任务调度” |
| “这会重新计算 12 条记忆，可能产生 API 费用” | “确认执行重建操作？” |
| “测试连接只发送一条短文本” | “Probe succeeds if the endpoint is healthy” |
| “回滚到本地不会删除远程向量” | “Rollback is reversible” |
| “未配置” / “不可用” / “—”，按实际情况选用 | 把未知显示成 0 |

Microcopy is short, concrete and consequence-first. Chinese and English are written as peers, not translated word-for-word.

## Localization Contract

Chinese is required for every surface in this design and is **release-blocking**, not a follow-up.

- The card must be fully usable in `zh-CN`: every section, field label, hint, status, empty state, alert, confirmation, action button and `aria-label` has a Chinese string.
- Switching the host locale updates all copy immediately, without remounting the host or losing drafts.
- The shared exception list is: provider/model/effort IDs and values, endpoint URLs, header names, environment-variable names, the product name `Magic Context`, technical labels such as `Token`, `ID`, `API`, `URL`, `/ctx-status`, and protocol terms such as `OpenAI-compatible`. Outside those exceptions, no English fallback may appear in a Chinese panel.
- No sentence is assembled by concatenating English fragments in the client. Use complete dictionary entries so Chinese grammar stays correct.
- Error codes map to localized copy; raw provider bodies are never shown.
- The Chinese and English layouts are both checked at wide and narrow widths.
- A missing Chinese key, a hardcoded English label, or an English toast/alert in the Chinese panel is release-blocking.

## Component Patterns

| Component | Use | Behavioral rules |
|---|---|---|
| Summary metric | Top strip | Values come from the table above. Unknown is `—`, never `0`. The vector metric is a button: Enter/Space jumps to 向量检索; it is not the only way to reach the section. |
| Status strip | Last child before the fixed footer | Text only: `已保存`, `3 项未保存`, `2 项无效`, `保存中…`, `迁移中，暂停后可保存`. It never renders Save or Reset. It scrolls with the form; the host footer is not a slot. |
| Jump button | Below summary | Scrolls the target section into view; keeps drafts; sets `aria-current` only on the topmost intersecting section; a bottom sentinel clears the last target. |
| Section header | Every section | Title + optional status chip. The chip conveys state through text, not through color alone. |
| Field row | All fields | Label and control are programmatically associated. Hints are always visible for common fields; security and limitation hints are never truncated. Advanced fields may put detail behind a help disclosure. |
| Override marker | Field label line | `已覆盖` and `重置` appear only when a user-level override exists. It is distinct from `未保存`, which belongs to drafts. Reset reverts that field's draft to the saved value; it does not write defaults. |
| Advanced disclosure | 常规, Historian, Journal, 向量检索 | Closed by default. Opening it does not change any value. The expanded area holds baseline/memory budgets, historian limits, journal mirror, auth header, dimensions override, query instruction, document prefix, timeouts and batch size. |
| Remote action bar | 向量检索 | `刷新` refreshes status only. `加载模型` and `测试连接` use the saved config. `开始重建向量` is the only primary action; `暂停`/`继续` are contextual; `回滚到本地` is a danger outline. The full matrix is below. |
| Inline alert | Above status strip or field | One primary alert per region, ordered by severity. Raw provider bodies never appear. |
| Confirmation dialog | Rebuild and rollback only | `role="dialog" aria-modal="true"`, labelled and described, initial focus on Cancel, Escape closes only the dialog. Resume uses an inline warning above the action bar, not a modal. |

## State Patterns

### Card states

| State | Where | Treatment |
|---|---|---|
| Loading snapshot | Whole card | Skeleton summary strip; fields disabled; do not render a half-filled form. |
| Snapshot error | Whole card | Error text; fields disabled; preserve any draft already in memory. There is no `ConfigForm` reload API; the error clears on the next host snapshot. Reopening Settings is the manual fallback. |
| Read-only / not writable | Whole card | Values are readable and copyable via `readOnly` + `aria-disabled`; config-writing actions disabled; Pause remains available if the host transport permits it, so a read-only user can stop remote spend. |
| Clean | Status strip | `已保存`; host Save disabled. There is no global Reset. |
| Dirty | Status strip | `N 项未保存`; host Save enabled. There is no global Reset. |
| Invalid | Field + status strip | Inline error, `aria-invalid`, message linked by `aria-describedby`; host Save disabled; strip says `N 项无效`. The first invalid advanced field opens its disclosure and receives focus as soon as it becomes invalid, because the disabled host Save never fires `onSave`. |
| Saving | Status strip | `保存中…`; fields read-only; one submit only; host Save unavailable. |
| Save failed | Status strip | Inline alert with retry; drafts retained; no optimistic clean state. |
| Revision mismatch | Status strip | `配置已过期`; offer reload; do not retry the same revision blindly. |
| Busy (probe/migration) | Status strip | `测试中…` or `迁移中，暂停后可保存`; mutating controls disabled; Pause remains available while migrating. |
| Memory disabled | Whole card | One notice: vector settings are preserved but inactive until memory is enabled; vector actions disabled. |

### Remote states

| State | Where | Treatment |
|---|---|---|
| Local | Summary + section | Local vector space; no remote actions; advanced vector fields hidden. |
| Off / `remote-off` | Summary + section | `语义检索已关闭`; remote fields hidden; no probe/start. |
| Missing key | Section alert | `未找到环境变量 SILICONFLOW_API_KEY`; Load models/Test/Start disabled; editing the env name is allowed. |
| Not probed | Status chip | `未探测`; dimensions `—`; Start disabled; Load models enabled when the endpoint is saved or the preset default applies; Test enabled only when endpoint and model are saved. |
| Probe running | Status + button | `测试中…`; Test/Load disabled; timeout and cancel are visible; duplicate click is ignored. |
| Model list loading | Model field | Spinner/`加载中…`; Test disabled until a model exists; previous list stays selectable. |
| Model list empty | Model field | `没有返回可用模型` + manual entry remains available; retry action. |
| Model list error | Model field | Classified error + `重试`; the saved model is not cleared. |
| Probe error | Alert | Classified as auth, not-found, rate-limit, timeout, network, invalid-response or unsupported-dimensions; next action is `重试探测`. |
| Configured, not started | Status | `未开始重建`; coverage `0/N` or `—/N`; Start primary; no quota has been spent on embeddings. |
| Target missing | Status | `等待首批向量 · 0/N`; the target is armed but has no rows yet. Start hidden; Pause hidden; Rollback available if armed. |
| Migrating | Status + progress | `迁移中 · processed/total`; Pause available; Start hidden. The host Save cannot be disabled through a `busy` prop; the card keeps its `onSave` guard and the strip says `迁移中，暂停后可保存`. |
| Paused | Status | `已暂停 · processed/total`; Resume primary; Start hidden. |
| Ready | Status | `已就绪 · N/N`; Start hidden; maintenance continues in the background. |
| Coverage incomplete | Status | `覆盖率不足 · N/M`; explain that remaining rows are FTS-only; `增量重建` (Start) re-runs the missing set. No historical trend is claimed. |
| Remote error | Alert | Separate `探测错误` and `重建错误`; rebuild error offers Resume/Retry, not `重试探测`. |
| Unsupported dimensions | Alert | `维度不符`; Start blocked; next actions are re-probe or change the model/dimensions override. |
| Rollback pending save | Status | `待保存回滚`; provider staged local, remote still armed until the host Save succeeds. |
| Rollback complete | Status | `已回滚到本地`; remote actions disabled until provider is remote and saved again; local coverage shown; local backfill continues in the background. |
| Remote inactive | Section | Remote fields readable but not actionable after rollback; Test/Start disabled with a one-line reason. |

### Status enumeration

The client derives the summary short label and section chip from one mapping, not from separate literals.

| Server state | zh chip | en chip | Summary short label |
|---|---|---|---|
| `remote-off` | 语义检索已关闭 | Semantic search off | 关闭 |
| `local` | 本地就绪 | Local ready | 本地 |
| `remote-unprobed` | 未探测 | Not probed | 未探测 |
| `remote-configured-not-started` | 未开始重建 | Not started | 未开始 |
| `remote-target-missing` | 等待首批向量 | Waiting for first vectors | 0/N |
| `remote-migrating` | 迁移中 | Migrating | N/M |
| `remote-paused` | 已暂停 | Paused | 暂停 |
| `remote-ready` | 已就绪 | Ready | N/N |
| `remote-error` | 远程错误 | Remote error | 错误 |
| `rollback-local` | 已回滚到本地 | Rolled back | 本地 |

`coverage incomplete` and `missing key` are derived presentation states, not additional server states.

### Alert priority

Only one alert is expanded at a time. Order: blocking failure (auth, unsupported dimensions, save failed) → missing configuration (key/model) → degraded operation (coverage incomplete, paused) → informational (probe succeeded). Lower-priority alerts remain collapsed with a count.

### Button matrix

| State | 刷新 | 加载模型 | 测试连接 | 开始重建 | 暂停 | 继续 | 回滚到本地 |
|---|---|---|---|---|---|---|---|
| Local / off | enabled | hidden | hidden | hidden | hidden | hidden | hidden |
| Remote, dirty | enabled | `保存并加载模型` | `保存并测试` | disabled, reason | contextual | contextual | disabled, reason |
| Not probed | enabled | enabled if endpoint/default | enabled if model | disabled | hidden | hidden | enabled if armed |
| Configured, not started | enabled | enabled | enabled | enabled (0 memories: disabled) | hidden | hidden | enabled if armed |
| Target missing | enabled | enabled | enabled | hidden | hidden | hidden | enabled if armed |
| Migrating | enabled | disabled | disabled | hidden | enabled | hidden | disabled, `先暂停` |
| Paused | enabled | disabled | disabled | hidden | hidden | enabled | enabled |
| Ready | enabled | enabled | enabled | hidden / `增量重建` if incomplete | hidden | hidden | enabled if armed |
| Remote error | enabled | enabled | enabled | disabled / retry | contextual | contextual | enabled if armed |
| Rolled back | enabled | disabled | disabled | disabled | hidden | hidden | hidden |

`刷新` only refreshes status; it never discards drafts. `保存并…` performs the existing revision-fenced Save first, then the action; if Save fails, the action never fires. `开始重建` always asks for confirmation when memories exist, including the first rebuild.

## Interaction Primitives

- **Keyboard:** Tab follows visual order; Space/Enter activates buttons; Escape closes the host Settings dialog only when no inner dialog is open. Advanced disclosures use native buttons with `aria-expanded`.
- **Focus:** opening an advanced disclosure moves focus into the first control; closing returns focus to the disclosure button. Confirmation traps focus, initial focus is Cancel, and closing returns focus to the trigger or, if it unmounted, the section heading.
- **Scroll:** jump buttons use `scrollIntoView({ block: 'start' })`; the status strip is non-sticky (no footer slot), never covers the last field, and the form reserves 12px scroll padding at the bottom.
- **Dirty guard:** changing provider or preset may clear a model that does not belong to the new provider; the cleared model appears as a staged change and is never saved silently. A draft provider/preset/model change resets the probe display to `未探测` and dimensions to `—`; the previous probe result is not attached to the new draft.
- **Historian off:** when `historianEnabled` is false, route/effort/budget controls stay readable and disabled; drafts are preserved and are not silently cleared on save.
- **Read-only and busy:** config-writing controls are read-only; Pause remains available while migrating, subject to host transport permissions. Because `SettingsForm` has no `busy` prop, the card's `onSave` guard refuses to write while a probe or migration is in flight and shows a notice; the host Save is never silently accepted.
- **Remote actions:** Load models/Test use saved config. When dirty, their labels become `保存并加载模型` / `保存并测试`; the client performs one revision-fenced Save, then the action. Start/Rollback require a clean form; Pause/Resume do not depend on config draft state.
- **Rollback order:** confirm → stage provider `local` → host Save → call the `disarm` action only after Save succeeds → show `已回滚到本地`. If Save fails, remote remains armed; do not call disarm.
- **Destructive actions:** Starting a rebuild opens the modal and warns when coverage > 0, because remote quota may be spent. Resume warns inline with the remaining row count. Rollback opens the modal and explains that remote rows are kept and local search may be partial until the local rebuild completes.
- **Copy:** `/ctx-status` is a text button that copies the command; clipboard failure shows a selectable fallback. It does not execute the command.
- **Polling:** while visible, poll embedding status every 2s during migrating, else every 15s; stop on paused/remote-off/error and when `document.visibilityState !== 'visible'`; keep the 15s refresh while `remote-ready` so background maintenance/coverage does not go stale; deduplicate in-flight requests and back off on repeated failure.
- **Host close:** `SettingsForm` calls `onDiscard` on unmount and exposes no before-close hook. Closing the Settings page therefore drops drafts; the design does not promise an unsaved-exit confirmation. While the page is open, the strip must say `未保存`; it must never imply drafts are persisted.

## Accessibility Floor

- Every input has a visible label and a programmatic association; hints use `aria-describedby`.
- Read-only values use `readOnly` + `aria-disabled="true"` so they remain focusable and copyable; action groups use `<fieldset disabled>` with one global status announcement.
- Status is communicated by text plus icon/shape, never color alone.
- Focus indicator uses the host focus ring and remains visible on the status strip.
- Buttons and selects have a minimum 32px height; touch targets are at least 32×32, preferably 40×40 on narrow layouts.
- Disabled reasons are announced once globally, not repeated per field.
- Error alerts use `role="alert"` only for newly surfaced failures; persistent state uses `role="status"`.
- Reduced motion: disclosures and scroll behavior respect `prefers-reduced-motion`.
- Contrast follows host tokens; no custom low-contrast text.
- The jump row is a focusable scroll region on narrow widths; the active target is scrolled into view.

## Key Flows

### Flow 1 — First local setup (protagonist: 林, independent developer, 23:10)

1. 林 opens Settings → Magic Context. The summary says `本地 · 已就绪`, policy `65% / 85%`, 历史摘要 `开 · low`.
2. He scans 常规, changes execute threshold from 65 to 70. The status strip says `1 项未保存`.
3. He saves with the host footer; the strip returns to `已保存`. He never scrolls through vector fields.

Climax: he gets an answer to “is it healthy and what did I change?” without reading every hint.

### Flow 2 — Configure remote embeddings (protagonist: 林, next morning)

1. He jumps to 向量检索. Provider is `本地模型`; the summary says `本地`.
2. He selects `OpenAI 兼容 API`, preset `硅基流动`. The endpoint stays empty with a preset-default hint; the model stays empty. Load models is enabled because the preset default resolves.
3. He enters `SILICONFLOW_API_KEY` and saves. The strip says `已保存`.
4. He clicks `加载模型`, picks `BAAI/bge-m3`, and saves again.
5. He clicks `测试连接`. Status becomes `未开始重建 · 1024 维 · 0/12`; a note says only one short probe was sent.
6. He clicks `开始重建向量`. A confirmation says 12 memories will be sent to the endpoint and may cost quota.
7. He confirms. Status becomes `迁移中 · 2/12`; Pause is available. He leaves.

Climax: he understands exactly what will be sent and what will be spent before the first remote batch.

### Flow 3 — Pause and rollback (protagonist: 林, after a rate-limit error)

1. The status turns `远程错误 · rate-limited`; search falls back to FTS.
2. He pauses. The status is `已暂停 · 7/12`; already landed rows remain searchable.
3. He saves nothing — Pause is a server action, not a config change.
4. He chooses `回滚到本地`. The confirmation explains that remote rows are kept and local search may be partial until the local rebuild completes.
5. The client stages provider `local`, saves, then calls `disarm`. The status says `已回滚到本地`; vector settings remain visible but inactive.

Climax: rollback is a deliberate, explained action, not a silent config flip.

### Flow 4 — Narrow host (protagonist: 陈, support engineer, laptop split-screen)

1. The dialog is 560px wide. The jump row scrolls horizontally; fields stack.
2. The summary becomes two rows; the status strip stays above the host footer.
3. All controls remain keyboard reachable; no horizontal page scroll.

## Responsive & Platform

- **Wide (≥ 760px):** summary four-up; fields two columns; full jump row.
- **Medium (560–759px):** summary two-by-two; fields one column; jump row scrolls.
- **Narrow (< 560px):** summary one column; labels above controls; action buttons wrap; jump row scrolls.
- **Desktop only in this ticket:** DSH Web and Desktop share the same renderer. No mobile-specific gestures.

## Confirmed host constraints

These are verified against `@deepseek-ai/dsh-client-ui-primitives@0.2.2-rc.1`:

1. **No footer slot.** `SettingsFormProps` has no `footer`; it renders a fixed footer with one Save button. `children` render above it. There is no global Reset; field-level `重置` belongs to `SettingsValueField`. T21 requires `SettingsForm`/`SettingsValueField`; the old plain-control fallback and its in-card Save are removed because they would be a second Save and the gate host provides both primitives.
2. **No `busy` state.** `SettingsFormShell` exposes `available`, `writable`, `dirty`, `invalid`, `saving` and `failed`. Save is disabled when `!dirty || invalid || saving`. Probe/migration busy must be handled inside the card (`onSave` guard + read-only fields); the host footer cannot be disabled through a separate busy prop. Pause is rendered outside any disabled `<fieldset>` and must not inherit the current `callEmbedding` guard on `shell.dirty`/`shell.writable`.
3. **No close interception.** `SettingsForm` calls `onDiscard` on unmount; closing the Settings page drops drafts. T21 does not add a fake unsaved-exit prompt.
4. **Legacy seats are deprecated.** T21 registers only `settings.section`; `plugins.item` and `plugins.row.config` are removed. This requires a host with `settings.section` (0.2.2-rc.1 in the gate).

## Appendix A — Field inventory

`src/client/index.js` `FIELDS` remains the source of truth for keys, defaults, validation and labels. This inventory proves that every current field has a home; it does not move defaults into the design.

| Section | Field key | Control | Placement |
|---|---|---|---|
| 常规 | `policy.executeThreshold` | number | common |
| 常规 | `policy.forceThreshold` | number | common |
| 常规 | `policy.assumedContextWindow` | number | common |
| 常规 | `policy.ttlMs` | number | common |
| 常规 | `policy.protectedToolResults` | number | common |
| 常规 | `policy.baselineTokens` | number | 高级 |
| 常规 | `policy.memoryBudgetTokens` | number | 高级 |
| 常规 | `policy.memoryLimit` | number | 高级 |
| Historian | `historianEnabled` | boolean | common |
| 历史摘要 | `historian.provider` / `historian.model` | route-provider + route-model | common |
| Historian | `historian.reasoningEffort` | effort | common |
| Historian | `policy.historianMinNodes` | number | 高级 |
| Historian | `policy.historianMaxTokens` | number | 高级 |
| Historian | `policy.historianMaxTokensCeiling` | number | 高级 |
| Historian | `policy.historianTimeoutMs` | number | 高级 |
| Journal | `journal.enabled` | boolean | common |
| Journal | `journal.retentionDays` | number | common |
| Journal | `journal.mirror` | boolean | 高级 |
| 向量检索 | `embedding.provider` | select | common |
| 向量检索 | `embedding.preset` | select | common |
| 向量检索 | `embedding.endpoint` | text | common |
| 向量检索 | `embedding.authHeader` | select | 高级 |
| 向量检索 | `embedding.model` | text | common |
| 向量检索 | `embedding.apiKeyEnv` | text | common |
| 向量检索 | `embedding.dimensions` | number | 高级 |
| 向量检索 | `embedding.queryInstruction` | text | 高级 |
| 向量检索 | `embedding.documentPrefix` | text | 高级 |
| 向量检索 | `embedding.timeoutMs` | number | 高级 |
| 向量检索 | `embedding.queryTimeoutMs` | number | 高级 |
| 向量检索 | `embedding.batchSize` | number | 高级 |
| 维护与诊断 | `registerCompactionEngine` | boolean | common |
| 维护与诊断 | `maintenance.verifyProvider` / `maintenance.verifyModel` | route-provider + route-model | common |

Count: 34 fields. The two route pairs count as four field paths. `/ctx-status` copy is an action, not a `FIELDS` entry. Only `settings.section` is registered in T21; the legacy Plugins seats are removed.
