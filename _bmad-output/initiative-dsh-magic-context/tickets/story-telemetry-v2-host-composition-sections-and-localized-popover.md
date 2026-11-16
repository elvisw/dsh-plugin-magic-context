---
id: 18
type: story
title: "Telemetry v2: host composition, sections and localized popover"
parent: initiative-dsh-magic-context
covers: [src/client/index.js, src/dsh/telemetry.ts, src/index.ts, tests/client-pure.spec.ts, tests/telemetry.spec.ts, tests/telemetry-view.spec.ts, CHANGELOG.md, scripts/phase-map.mjs, scripts/mc-i18n-check.mjs]
after: [17]
refined: false
hitl: false
risk: high
---

# Telemetry v2: host composition, sections and localized popover

Status: revision 1 — implementation ticket. Design source:
`_bmad-output/initiative-dsh-magic-context/research-telemetry-ui-requirements.md`
(T17, accepted).

## Why

The current DSH Web pill is a single-letter ledger. It exposes pressure and a
few counters, but not the information that makes the upstream OpenCode sidebar
useful: host token composition, Historian state, memory injection, reclaim
queue, maintenance and warnings. The T17 research fixed the information
architecture and the honest data sources. This ticket implements that v1.

This is a Web/Desktop feature. It does not port to dsh-go; that is a later
ticket after this contract ships. No package, release, schema or daily-profile
change.

## Requirements

### Server (`src/dsh/telemetry.ts`, `src/index.ts`)

Add the minimum additive fields to `/mc-telemetry/summary`:

- `adapterVersion`: runtime `package.json` version, read fail-open; omit/null on
  failure. No build-time metadata and no build-step change.
- `policy`: configured `executeThreshold` / `forceThreshold`.
- `contextBreakdown`: `{ systemTokens, toolsTokens, messageTokens }` from the
  live session projection; `null` when the projection is missing.
- `messageComposition`: `{ conversation, toolCalls, compartments, memories,
  profile, other, residualTokens }`, each `number | null`, built server-side from
  `messageTokens`, surface text, current-tier `renderCompartment()`, and the
  newest `memory-recall` / `profile-recall` `estTokens`. `conversation` strips
  the baseline block before counting, so Compartments/Memories/Profile are not
  counted twice; `compartments` only counts landed/current compartments.
  `other = max(0, messageTokens - classified)`; if classified exceeds
  `messageTokens`, the rows are scaled proportionally, `other` is zero, and the
  removed amount goes into `residualTokens` (the view model turns a non-zero
  value into a warning). The object is `null` only when `messageTokens` is
  unavailable, the session is finished, or `messageTokens` is 0. If only a
  residual `other` exists, return the object with `other > 0`; the `Other` row
  renders only when `other > 0`. The object must not be an all-null/all-zero
  stub.
- `historian`: `{ running, compartments, coveredTokens, lastPublishedAt }`;
  `lastPublishedAt` is epoch milliseconds from the newest
  `compartment-published` journal row, `null` when no row exists.
- `queue`: `{ pendingDrops, tags }` from `listPendingDrops(sessionId)`.
- `memory`: `{ total, injected, estTokens, profileEstTokens }`; `memory` is
  `null` when `memoryStats` is unavailable, and `injected`/`estTokens`/
  `profileEstTokens` are `null` when no corresponding recall row exists.
- `surface`: `{ tagged, dropped, reclaimableTokens }`; `null` when a live
  `Session` is not available.
- `queue` is session-scoped; do not call `listPendingDrops(undefined)`.

Rules:

- Existing summary keys and their types stay.
- Omitted means not applicable; `null` means applicable but unknown; `0` means
  measured zero. A missing projection must never become three zeros.
- Live session: resolve with `ctx.sessions.get(id)`, first frame from
  `sessionProjections.snapshot`, then `onChanged`; cache the last value.
- Finished session: `historian.running = false`; `surface = null`;
  `messageComposition = null` (no live surface); other fields from
  stores/journal.
- Global scope: omit `contextBreakdown`, `messageComposition`, `historian`,
  `queue`, `memory` and `surface`; keep only adapter/version/global counters and
  use the existing top-level `summary.sessionId`.
- Every new dependency is fail-open and must not throw the summary.

### Client (`src/client/index.js`)

Build a pure view model and render the pill and popover from it:

- `buildTelemetryView(summary, locale, now, width, lastUpdateAt)` returns the
  headline, three host bar segments, optional message sub-rows, section rows,
  warnings, operations, stale flag, unavailable state and a `pill` variant
  (`full` / `compact` / `icon` / `minimal`). It receives the raw summary, not
  `trimSummary` output.
- Pill: dot + integer pressure + token pair + `H` state + `Q` count; error
  count replaces the queue suffix when recent errors exist. Shrink order:
  drop token pair at `<360px`, iconize `H`/`Q` at `<280px`, dot + pressure only
  at `<220px`. Dot and pressure never drop.
- Popover: 352px wide, `calc(100vw - 24px)` on narrow screens; header,
  100% stacked `System / Tool definitions / Messages` bar, estimated
  `Message composition` sub-list (or its explicit unavailable state),
  then:
  - Historian: `running|idle · N compartments · Ck digested · last published HH:MM`
    (`—` for a missing value);
  - Memory: `N total · M injected · Kk last injection · Pk profile last injection`;
    a missing `injected`/`estTokens`/`profileEstTokens` renders `—`, not blank;
  - Queue: `N pending · tags …`; `0 pending` renders `empty`;
  - Maintenance: `last HH:MM · expired/verified/updated/archived counts`;
    no `maintenanceLast` renders `never run`, not an empty template;
  - Hygiene: `tagged / dropped / reclaimable`, hidden when `surface` is null;
    a missing `reclaimableTokens` renders `—`, not `0`;
  - Warnings;
  - Recent operations;
  - footer link to `/ctx-status`.
  The `Memories` and `Profile` sub-rows under Message composition are labelled
  `last injection`, not current prompt cost. No fake rows.
- Thresholds come from `policy`, not the hardcoded 50/65 or 60/85 pairs.
- Stale after 120 s without a summary/event update; show a muted tag, keep the
  last values, never zero them.
- Keep the existing click/Escape/outside/blur behavior; add keyboard focus
  return, focus trap inside the open panel, `aria-expanded`, accessible labels
  and a text equivalent for the bar. The host gate must check `aria-expanded`,
  focus trap, Escape/outside focus return and the bar's text equivalent.
- Keep the existing overlay/statusbar seats. Do not add a persistent sidebar.

### Localization

- Every new label, section, warning, empty state and tooltip goes through the
  zh/en dictionaries.
- Use the T17 glossary: `上下文压力`, `执行阈值`, `上下文构成（估算）`,
  `消息构成（估算）`, `压缩段`, `历史摘要`, `回收队列`, `维护`, `警告`.
- Rename the existing `历史归档失败` Historian copy to `历史摘要失败`; keep the
  memory category `archive` as `历史归档`.
- No hardcoded Chinese in the component; `check:i18n` must pass.

### Tests

- `tests/telemetry.spec.ts`: existing keys still present; new fields including
  `messageComposition`; missing projection → `null`/omitted; missing
  `messageTokens` → `messageComposition: null`; finished session → null; global
  scope; policy; epoch `lastPublishedAt`; no journal row → `null`; no throw from
  a broken dependency; global scope never calls pending-drop reads; over-limit
  scaling sets `residualTokens` and `other=0`; only-residual returns
  `{ other: messageTokens, residualTokens: 0 }`; `messageTokens: 0` →
  `messageComposition: null`; over-limit rows sum to ≤ `messageTokens`.
- `tests/telemetry-view.spec.ts`: pure view model; three host segments; bar
  `total = system + tools + messages` (not `lastTokens`); shares sum to 100%;
  message sub-list not in bar; `messageComposition` rows; baseline-containing
  user node + over-limit estimate; `residualTokens` warning; `Other: 0` is not
  rendered; over-limit scaled rows sum to ≤ `messageTokens`; unknown → null;
  pressure tone from policy; pill variants at 360/280/220; stale from
  `lastUpdateAt`, not `health.lastEventAt`; zero segments no NaN; section value
  templates (Historian running/idle/digested/lastPublished, Memory
  total/injected/last injection, Queue pending/tags/empty, Maintenance counts/
  `never run`), missing values render `—`, Hygiene missing reclaimable `—`;
  Hygiene row; zh/en labels.
- `tests/client-pure.spec.ts`: dictionary keys and render-path assertions for
  the new copy; confirm `buildTelemetryView` receives the raw summary and new
  fields survive `trimSummary` or bypass it.
- `scripts/mc-i18n-check.mjs`: update the hardcoded `历史归档失败` expectation to
  `历史摘要失败`.
- Add the new spec to `scripts/phase-map.mjs`.

### One real host gate

Use an isolated DSH Web profile, never the daily profile:

- fresh root under `%TEMP%\opencode\t18-host-<stamp>`;
- isolate `DSH_HOME`, `HOME`, `USERPROFILE`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`,
  `APPDATA`, `LOCALAPPDATA`, `npm_config_cache`, `npm_config_store_dir`;
- install the packed build with `dsh plugin --profile web add`;
- use the real route/provider/model already proven by the T13 harness
  (`DEEPSEEK_API_KEY` from the environment; never print it, record only
  `present: true|false`; absent → `blocked`, not a local simulation);
- use the existing Playwright installation path from the gate root, record its
  version; do not install into the daily profile;
- start `dsh web --profile web --host 127.0.0.1 --port <free> --no-open`, obtain
  the host cookie/token through the same helper as the T13 gate, and record the
  root, URL, host version and plugin tarball SHA-256.

Then send one real model prompt, wait for a pressure reading, open the pill and
assert:

- the three host segments render, plus the message sub-list or its explicit
  unavailable state; `Memories`/`Profile` sub-rows are labelled `last
  injection`;
- the section values render from the payload: Historian
  `running|idle · N compartments · Ck digested · last published HH:MM`, Memory
  `N total · M injected · Kk last injection · Pk profile last injection`, Queue
  `N pending · tags …` (or `empty`), Maintenance counts (or `never run`), and
  Hygiene when surface is available; missing values render `—`, not blank or 0;
  no unavailable row is fabricated;
- switching zh/en updates the new copy;
- `aria-expanded`, focus trap, Escape/outside focus return, the bar text
  equivalent, and the `/ctx-status` footer link;
- no console error and no route error.

Save screenshots, `summary.json`, `ui-gate.json`, `host-version.txt`, the tarball
hash and a short evidence note. No full T13-sized matrix. A detail that cannot be
produced by the real host is recorded as a boundary, not simulated.

### Docs

- `CHANGELOG.md` under `[Unreleased]`.
- `docs/dsh-plugin-ui-telemetry-contract.md` stays historical; do not change its
  status. If a current contract is needed, create a new document with its own
  `> Status: current` header; do not edit the historical 0.2.0-rc.2 analysis into
  a current claim.

## Acceptance

1. Independent ticket validation passes before code.
2. `npm test`, `npm run typecheck`, `npm run check:i18n`, `npm run build` pass.
3. Existing summary keys are unchanged; new fields are additive and fail-open.
4. The view model proves the three host segments and the message sub-list never
   double-count; `messageComposition` is server-sourced and never exceeds
   `messageTokens`; unknown is not rendered as `0`.
5. The real DSH Web gate passes and its evidence is recorded, including
   `aria-expanded`, Escape/outside focus return, the bar text equivalent and the
   `/ctx-status` footer link.
6. No dsh-go, package, release, profile or host-source change.
7. A Quick review and its fix re-check pass before commit.

## Non-goals

- dsh-go native UI (`composer.strip` / `panels`) — later ticket.
- Remote embeddings, cache TTL, smart notes, recomp live progress.
- Replacing `/ctx-status`; it remains the full diagnostic surface.
- Changing the telemetry route shape beyond the additive fields above.
- A persistent sidebar or a settings-page redesign.

## References

- `research-telemetry-ui-requirements.md` — design and data contract.
- `src/dsh/telemetry.ts:42-76,153-326` — current deps and health payload.
- `src/client/index.js:2095-2565` — current pill/popover.
- `src/dsh/seams.ts:145-179` — surface enumeration.
- `src/index.ts:746-763` — memory stats wiring.
- `docs/dsh-plugin-ui-telemetry-contract.md` — historical host seam study; not
  a current guarantee.
