---
name: Magic Context Settings
description: Experience contract for the host-native redesign of the Magic Context Settings card.
status: draft
sources:
  - ../../../docs/dsh-plugin-settings-ui-contract.md
  - ../../../README.zh-CN.md
updated: 2026-11-17
---

# Magic Context Settings — Experience Spine

> Paired with `DESIGN.md`. Visual tokens live there; this file specifies behavior, information architecture, states and flows. Spines win on conflict with any wireframe.

## Foundation

- **Form factor:** desktop-first DSH Web Settings dialog; usable down to a narrow single-column layout.
- **UI system:** DeepSeek Harness Settings shell and DSH alias tokens. The card is a plugin-owned React render function; it does not own the outer dialog, navigation or global Save geometry.
- **Existing contract:** one top-level `settings.section` card, one revision-fenced Save, volatile config values, no plugin-owned config write. The redesign must preserve the existing field set and Save semantics.
- **Host constraints:** the settings card is rendered inside a scrollable dialog. Sticky elements must stay inside the card's scroll container and must not cover host chrome.
- **Why this redesign:** the current form is a flat list of ~22 core fields plus ~13 vector fields. The controls work, but the page has no summary, no grouping and no action hierarchy. The user must scroll a 3,400px form to discover state and actions.

## Information Architecture

| Surface / block | Reached from | Purpose |
|---|---|---|
| Summary strip | Top of card | Answer: health, pressure policy, Historian, vector space, rebuild coverage |
| Jump row | Below summary | Move to a section without losing draft state |
| 常规 | Default visible | Execute/force thresholds, assumed window, reclaim TTL, protected results |
| Historian | Jump / scroll | Route pins, reasoning effort, node/token limits, enable switch |
| Journal | Jump / scroll | Retention, text mirror, log level |
| 向量检索 | Jump / scroll | Provider, preset, endpoint, model, key env, probe, rebuild, rollback |
| 维护与诊断 | Jump / scroll | Verify route, maintenance switches, recent operations, `/ctx-status` hint |
| 高级（within sections） | Disclosure | Auth header, dimensions override, prefixes, timeouts, batch size |

The card remains a **single page**. The jump row is a set of anchor buttons, not tabs: all sections stay mounted, drafts survive, and browser find still works.

Ordering rationale:

1. Health and policy first, because they explain whether the plugin is working.
2. Common configuration next.
3. Vector search after memory/historian settings, because it is opt-in and has the most consequences.
4. Diagnostics last, because it is consulted when something is wrong.

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

## Component Patterns

| Component | Use | Behavioral rules |
|---|---|---|
| Summary metric | Top strip | Value comes from the server snapshot. Unknown is `—`, never `0`. Clicking the vector metric jumps to 向量检索. |
| Jump button | Below summary | Scrolls the target section into view; keeps drafts; sets `aria-current` only while the target is in view. |
| Section header | Every section | Title + optional status chip. The chip is text, not color alone. |
| Field row | All fields | Label and control are programmatically associated. Hint is always visible for common fields; advanced fields may put detail behind a help disclosure. |
| Override marker | Field label line | `已修改` and `重置` appear only when the field is overridden. Reset unstages that field; it does not save. |
| Advanced disclosure | Vector, Journal, Maintenance | Closed by default. Opening it must not change any value. |
| Remote action bar | 向量检索 | Buttons reflect current state: Start only when startable; Pause only while running; Resume only while paused; Rollback only when a remote target is armed or has remote rows. |
| Inline alert | Above action bar or field | One error class and one next action. Raw provider bodies never appear. |
| Save bar | Bottom of card | Sticky inside the dialog scroller. Save disabled when clean or busy; Reset disabled when no drafts. |

## State Patterns

| State | Where | Treatment |
|---|---|---|
| Loading snapshot | Whole card | Skeleton summary strip and disabled fields. Do not render a half-filled form. |
| Read-only / not writable | Whole card | Fields remain readable, actions disabled, a single explanation appears above Save. |
| Clean | Save bar | Save disabled; Reset disabled. |
| Dirty | Save bar | Save enabled; count of changed fields in the bar (“3 项未保存”). |
| Saving | Save bar | Save label becomes “保存中…”, controls read-only, no duplicate submit. |
| Save failed | Save bar | Inline alert above bar; drafts retained; retry available. |
| Missing key | 向量检索 | Warning alert: “未找到环境变量 SILICONFLOW_API_KEY”; Test/Start disabled. |
| Not probed | 向量检索 | Status chip “未探测”; dimensions `—`; Start disabled until probe succeeds. |
| Not started | 向量检索 | Status “未开始重建”; Start primary; coverage 0/N or unknown. |
| Migrating | 向量检索 | Status “迁移中”; progress `processed / total`; Pause secondary; no second Start. |
| Paused | 向量检索 | Status “已暂停”; Resume primary; Start not shown. |
| Ready | 向量检索 | Status “已就绪”; coverage N/N; Start hidden; maintenance continues in background. |
| Partial / stale | 向量检索 | Status “部分可用” or “覆盖率下降”; alert explains which rows are FTS-only. |
| Remote error | 向量检索 | Error class + “重试探测” action; no raw provider body. |
| Rollback confirm | Dialog | Explains that local rows are kept, remote rows are not deleted, and current search may fall back to FTS until local rebuild completes. |
| Rollback complete | 向量检索 | Status “已回滚到本地”; local coverage shown; remote values remain editable but inactive. |
| Memory disabled | Whole card | A single notice: vector settings are preserved but inactive until memory is enabled. |

## Interaction Primitives

- **Keyboard:** Tab follows visual order; Space/Enter activates buttons; Escape closes the host Settings dialog, not an inner section. Advanced disclosures use native buttons with `aria-expanded`.
- **Focus:** opening an advanced disclosure moves focus into the first control; closing returns focus to the disclosure button. Rollback confirmation traps focus and returns it to the rollback button.
- **Scroll:** jump buttons use `scrollIntoView({ block: 'start' })`; sticky Save bar does not overlap the last field; add 12px scroll padding at the bottom.
- **Dirty guard:** changing provider/preset may clear a model that does not belong to the new provider; this is shown as a staged change, never silently saved.
- **Remote actions:** Test connection and Load models act on the saved config, not the unsaved draft. If the form is dirty, the action bar shows “先保存再测试/加载” and the buttons are disabled.
- **Destructive actions:** Rollback requires confirmation. Starting a rebuild warns when coverage > 0 and remote quota may be spent.
- **Copy:** `/ctx-status` is offered as a text button in diagnostics; it copies the command, it does not execute it.

## Accessibility Floor

- Every input has a visible label and a programmatic association; hints use `aria-describedby`.
- Status is communicated by text plus icon/shape, never color alone.
- Focus indicator uses the host focus ring and remains visible on sticky surfaces.
- Buttons and selects have a minimum 32px height; touch targets are at least 32×32, preferably 40×40 on narrow layouts.
- Disabled controls are not removed from the reading order; disabled reasons are announced once, not repeated per field.
- Error alerts use `role="alert"` only for newly surfaced failures; persistent state uses `role="status"`.
- Reduced motion: disclosures and scroll behavior respect `prefers-reduced-motion`.
- Contrast follows host tokens; no custom low-contrast text.

## Key Flows

### Flow 1 — First local setup (protagonist: 林, independent developer, 23:10)

1. 林 opens Settings → Magic Context. The summary says “本地模型 · 已就绪”, pressure `41%`, Historian `开 · low`.
2. He scans 常规, changes execute threshold from 65 to 70. The Save bar says “1 项未保存”.
3. He saves; the bar returns to clean. He never scrolls through vector fields.

Climax: the page answers “is it healthy and what did I change?” without reading every hint.

### Flow 2 — Configure remote embeddings (protagonist: 林, next morning)

1. He jumps to 向量检索. Provider is `本地模型`; the summary says “本地 · 384d”.
2. He selects `OpenAI 兼容 API`, preset `硅基流动`. Endpoint fills, model stays empty.
3. He enters `SILICONFLOW_API_KEY`, clicks `加载模型`, picks `BAAI/bge-m3`.
4. He clicks `测试连接`. Status becomes “未开始重建 · 1024d · 0/12”. A note says only one short probe was sent.
5. He clicks `开始重建向量`. A confirmation says 12 memories will be sent to the endpoint and may cost quota.
6. He confirms. Status becomes “迁移中 · 2/12”; Pause is available. He leaves.

Climax: he understands exactly what will be sent and what will be spent before the first remote batch.

### Flow 3 — Pause and rollback (protagonist: 林, after a rate-limit error)

1. The status turns “远程错误 · rate-limited”; search falls back to FTS.
2. He pauses. The status is “已暂停 · 7/12”; already landed rows remain searchable.
3. He chooses `回滚到本地`. The confirmation explains that remote rows are kept and local search may be partial until local rebuild.
4. He confirms; the provider stages `本地模型`, then he saves. The status says “已回滚到本地”; vector settings remain visible but inactive.

Climax: rollback is a deliberate, explained action, not a silent config flip.

### Flow 4 — Narrow host (protagonist: 陈, support engineer, laptop split-screen)

1. The dialog is 560px wide. The jump row scrolls horizontally; fields stack.
2. The summary becomes two rows; the Save bar stays at the bottom.
3. All controls remain keyboard reachable; no horizontal page scroll.

## Responsive & Platform

- **Wide (≥ 900px):** summary four metrics in one row; two-column field grid inside each section; full jump row.
- **Medium (720–899px):** summary two-by-two; fields one column; jump row scrolls.
- **Narrow (< 720px):** summary two rows; labels above controls; action buttons wrap; save bar remains sticky.
- **Desktop only in this ticket:** DSH Web and Desktop share the same renderer. No mobile-specific gestures.

## Open Questions

- Should the summary strip be clickable as a whole, or only the vector metric?
- Is a “density” preference needed for expert users, or does progressive disclosure suffice?
- Do we keep the legacy Plugins-page card visually identical, or give it a summary-only variant?
- Does the host expose a stable scroll container for sticky Save, or must the card use its own?

## Assumptions

- [ASSUMPTION] The host Settings dialog continues to provide a scrollable content region and a global Save button; we add a sticky action bar inside that region.
- [ASSUMPTION] All fields remain the same; no new config keys are introduced by the redesign.
- [ASSUMPTION] The existing DSH alias tokens remain stable across 0.2.x.
- [ASSUMPTION] Chinese and English are the only locales for this iteration.
