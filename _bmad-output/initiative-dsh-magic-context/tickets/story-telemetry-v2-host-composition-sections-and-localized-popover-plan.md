---
ticket: 18
title: "Telemetry v2: host composition, sections and localized popover — plan"
status: done
---

# Plan — Telemetry v2

Ticket: 18
Story: `tickets/story-telemetry-v2-host-composition-sections-and-localized-popover.md`
Design: `research-telemetry-ui-requirements.md`

## 1. Scope lock

Implement only the T17 v1 set:

- P0: pressure, threshold pair, token pair, three host bar segments, Historian,
  compartments, queue, warnings, operations, version, stale, i18n.
- Cheap P1: message sub-list, memory total/injected, maintenance last tick,
  hygiene if the current surface estimate is available.
- P2 (tag counts, session token total, details drawer) stays out of the default
  panel; keep it in `/ctx-status`.
- No cache TTL, smart notes, recomp progress, remote embeddings or dsh-go.

Do not change `src/core/*`, schema, package metadata or the historical
telemetry contract.

## 2. Server fields

### 2.1 Types

Extend `TelemetryDeps` with fail-open callbacks:

- `adapterVersion(): string`
- `policy(): { executeThreshold?: number; forceThreshold?: number }`
- `projection(sessionId): { contextBreakdown?: { systemTokens: number; toolsTokens: number; messageTokens: number } } | null`
- `messageComposition(sessionId, messageTokens): { conversation: number | null; toolCalls: number | null; compartments: number | null; memories: number | null; profile: number | null; other: number | null; residualTokens: number | null } | null`
- `historian(sessionId): { running: boolean; compartments: number; coveredTokens: number; lastPublishedAt?: number } | null`
- `surface(sessionId): { tagged: number; dropped: number; reclaimableTokens?: number } | null`

`messageComposition` is computed in `src/index.ts` from user/assistant surface
text (baseline block stripped first, using `findBaselineRange`/`stripBaseline`),
tool-result text (call arguments are not counted; they fall into `other`),
landed/current compartments only, and the newest `memory-recall` /
`profile-recall` `estTokens`; `other = max(0, messageTokens - classified)`. It is
server-side so the client never needs a Session. The object is `null` only when
`messageTokens` is unavailable, the session is finished, or `messageTokens` is
0; it is never an all-null/all-zero stub. If classification exceeds
`messageTokens`, scale the classified rows proportionally to `messageTokens`,
set `other` to zero and expose the removed amount in `residualTokens`; the view
model turns a non-zero value into a warning. If only a residual `other` exists,
return the object with `other > 0`; the `Other` row renders only when `other >
0`.

Keep `memoryStats` and `maintenanceLast`; derive `memory.injected` from the
newest `memory-recall` row and `profileEstTokens` from the newest
`profile-recall` row. `queue` reads stores only for a session scope.

### 2.2 `health()` additions

- `adapterVersion`
- `policy`
- `contextBreakdown` (null when the callback is absent or returns null)
- `messageComposition`
- `historian`
- `queue`
- `memory`
- `surface`

Do not fill absent values with zeros. Keep the existing `journalRows`,
`lastEventAt`, counters and `surfaceLedger` keys. `messageComposition` is null
only when `messageTokens` is unavailable, the session is finished, or
`messageTokens` is 0; a residual-only object stays `{ other: messageTokens,
residualTokens: 0 }`. `memory` is null when `memoryStats` is unavailable;
`lastPublishedAt` is null when no `compartment-published` row exists; global
scope omits `contextBreakdown`, `messageComposition`, `historian`, `queue`,
`memory` and `surface`.

### 2.3 Wiring (`src/index.ts`)

- Add `sessions` to the inject list (`ctx.inject(['tools', 'llm', 'sessions'], …)`
  or a separate `ctx.inject(['sessions'], …)`), then resolve a live session with
  `ctx.sessions.get(sessionId)`.
- Create a telemetry-only `ctx.inject(['sessionProjections'], …)`; do not reuse
  the journal-gated listener at `:808-815`. Use
  `sessionProjections.snapshot(session, ['contextBreakdown'])` for the first
  frame and subscribe to its change feed for the cache.
- A finished session returns no projection; `historian.running = false`,
  `surface = null` and `messageComposition = null`.
- `adapterVersion` reads the runtime package version fail-open; omit/null on
  failure and do not add a build step.
- `policy` uses `activePolicy()` (live config), not the mount-time policy object.
- `historian.lastPublishedAt` from the newest `compartment-published` row; null
  when no row exists.
- `surface` from `enumerateSurfaceToolResults` only when a live session exists.
- `messageComposition` from the live surface and landed/current
  `renderCompartment`; strip the baseline from user/assistant text before
  counting conversation, and leave each unavailable row `null` rather than zero.
- Any failure returns null/omitted; never throw the summary.

## 3. Pure view model

Add one exported builder in `src/client/index.js`:

```text
buildTelemetryView(summary, locale, now, width, lastUpdateAt) -> {
  status, unavailable, stale,
  pressure: { percent, used, window, executeThreshold, forceThreshold, tone } | null,
  bar: { total, segments: [{ id: 'system'|'tools'|'messages', tokens, share }] },
  messageRows: [{ id, tokens }],
  sections: [{ id, labelKey, value, tone? }],
  pill: { variant: 'full'|'compact'|'icon'|'minimal', label, text },
  warnings, operations
}
```

Inputs:

- `summary` is the raw summary, not `trimSummary` output; do not lose the new
  fields.
- `width` is the pill container width; absent means full.
- `lastUpdateAt` is the client receipt time of the newest summary/event. Stale
  is `now - lastUpdateAt > 120_000`, not `health.lastEventAt` (a quiet session
  can have an old event while the summary is fresh).

Rules:

- `bar.segments` always exactly three host segments; `bar.total = systemTokens +
  toolsTokens + messageTokens`; `share` is a composition share of `bar.total`,
  not a window percentage and not `lastTokens`.
- `messageRows` are estimated sub-rows; never add them to `bar.total`.
- Unknown pressure/tokens → `null`, not `0`.
- A non-zero `messageComposition.residualTokens` produces a warning row; a
  residual-only `other` still renders the Other row.
- Tone uses policy thresholds; never hardcoded 50/65 or 60/85.
- Pill shrink and stale are derived here, so tests do not need a browser.
- Zero segments produce zero shares, never `NaN`.

Export the builder through `__diagnostics` so `tests/client-pure.spec.ts` can
call it without a DOM; add a render-path test that passes the raw summary (not a
trimmed object) and asserts the new fields survive.

## 4. UI

Replace the single-letter ledger body with:

1. header: `Magic Context` + version + close;
2. pressure headline `41.4% / 65%` and `53k / 128k`;
3. 100% stacked bar + three legend rows; `bar.total` is the three host
   segments, not the occupancy headline;
4. `Message composition (estimated)` sub-list, or its explicit unavailable
   state; `Memories` and `Profile` rows are labelled `last injection`;
5. Historian (`running|idle · N compartments · Ck digested · last published
   HH:MM`, `—` for missing values), Memory (`N total · M injected · Kk last
   injection · Pk profile last injection`; missing values render `—`), Queue
   (`N pending · tags …`; zero renders `empty`), Maintenance (`last HH:MM ·
   expired/verified/updated/archived counts`; no row renders `never run`),
   Hygiene (`tagged / dropped / reclaimable`, hidden when `surface` is null,
   missing reclaimable `—`), Warnings;
6. Recent operations, last and collapsible only if it grows;
7. footer link to `/ctx-status`.

Keep the existing overlay/statusbar seats and click/Escape/outside/blur. Add:

- `aria-expanded`, focus trap, focus return, keyboard open/close;
- a text/aria equivalent for the bar;
- narrow popover width `calc(100vw - 24px)`;
- 120 s stale tag;
- the gate must check `aria-expanded`, focus trap, Escape/outside focus return,
  the bar text equivalent and the `/ctx-status` footer link, not just visual
  presence.

No chart library, no DOM scraping, no second sidebar.

## 5. Localization

Add zh/en keys for every new label, section, warning, empty state and tooltip.
Use the T17 glossary. Rename `历史归档失败` to `历史摘要失败`; leave the memory
category `archive` as `历史归档`. Run `npm run check:i18n`.

## 6. Tests

| File | Cases |
|---|---|
| `tests/telemetry.spec.ts` | old keys intact; new fields including `messageComposition`; missing projection → null; missing `messageTokens` → `messageComposition: null`; `messageTokens: 0` → `messageComposition: null`; finished session → null; global scope (no `listPendingDrops(undefined)`); memory null when stats unavailable; policy; epoch `lastPublishedAt`; no journal row → null; broken callback does not throw; over-limit scaling sets `residualTokens`/`other=0` and scaled rows sum ≤ `messageTokens`; only-residual returns `{ other: messageTokens, residualTokens: 0 }` |
| `tests/telemetry-view.spec.ts` | three segments; `bar.total = system + tools + messages` (not `lastTokens`); shares sum to 100%; message sub-list not in bar; `messageComposition` rows; baseline-containing user node + over-limit estimate; `residualTokens` warning; `Other: 0` not rendered; over-limit scaled rows sum ≤ `messageTokens`; unknown → null; pressure tone from policy; pill variants at 360/280/220; stale from `lastUpdateAt`, not `health.lastEventAt`; zero segments no NaN; section value templates and empty states (Queue `empty`, Maintenance `never run`, missing values `—`, Hygiene missing reclaimable `—`); Hygiene row; zh/en labels |
| `tests/client-pure.spec.ts` | new dictionary keys; card/popover render path uses `t()`; no old hardcoded strings; raw summary reaches the builder (not `trimSummary`) |
| `scripts/mc-i18n-check.mjs` | update the `历史归档失败` expectation to `历史摘要失败` |
| `scripts/phase-map.mjs` | register `tests/telemetry-view.spec.ts` |

Run targeted specs first, then `npm test`.

## 7. Host gate

Use an isolated DSH Web profile, never the daily profile:

1. `npm run build`, `npm pack --pack-destination %TEMP%\opencode\t18-pack`.
2. Fresh root `%TEMP%\opencode\t18-host-<stamp>`; isolate `DSH_HOME`, `HOME`,
   `USERPROFILE`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `APPDATA`, `LOCALAPPDATA`,
   `npm_config_cache`, `npm_config_store_dir`.
3. Install the packed build with the real DSH CLI (`--profile web add`); use a
   plugin `dataDir` inside the root.
4. `DEEPSEEK_API_KEY` only from the environment; never print it; record
   `present: true|false`; absent → `blocked`. Use the route/provider/model
   already proven by the T13 harness.
5. Start `dsh web --profile web --host 127.0.0.1 --port <free> --no-open`;
   obtain the host URL/cookie through the same helper as the T13 gate. Record
   root, URL, host version, plugin tarball SHA-256 and Playwright version.
6. Send one real model prompt; wait for a pressure reading.
7. With Playwright, open the page, open the pill, assert:
   - three host segments + legend;
   - message sub-list or its explicit unavailable state; `Memories`/`Profile`
     sub-rows labelled `last injection`;
   - Historian `running|idle · N compartments · Ck digested · last published
     HH:MM`, Memory `N total · M injected · Kk last injection · Pk profile last
     injection`, Queue `N pending · tags …` (or `empty`), Maintenance counts (or
     `never run`), Hygiene when surface exists, and Operations; missing values
     render `—`, not blank or 0; values come from the payload, not labels only;
   - switch zh/en and assert the new copy;
   - `aria-expanded`, focus trap, Escape/outside focus return, bar text
     equivalent, and the `/ctx-status` footer link;
   - no console errors and no route errors.
8. Save screenshot(s), `summary.json`, `ui-gate.json`, `host-version.txt`, the
   tarball hash and a short evidence note. If a section has no source in the real
   host, record it as a boundary; do not synthesize it.

No full browser matrix.

## 8. Docs and changelog

- `CHANGELOG.md` under `[Unreleased]`.
- `docs/dsh-plugin-ui-telemetry-contract.md` stays historical; do not change its
  status. If a current contract is needed, create a new document with its own
  `> Status: current` header; do not edit the historical 0.2.0-rc.2 analysis.

## 9. Validation and review

1. Independent ticket validation before code; fix all Critical/Fix.
2. Implementation; run targeted tests and full gates.
3. Host gate.
4. Quick review of the diff; fix all Critical/Fix and re-check.
5. Commit only after the re-check passes; mark built/done.

## 10. Risks

- `sessionProjections.snapshot` may be expensive; cache the first frame and use
  the change feed, never snapshot on every poll.
- The summary route is also used by tests; additive fields must not change old
  key types.
- `trimSummary` is a whitelist; pass the raw summary to the builder or extend it,
  and keep a render-path test.
- `messageComposition` is server-side; do not recompute it in the client and do
  not let its rows become bar segments.
- The view model is the only place that may combine host and adapter numbers;
  do not duplicate arithmetic in JSX.
- The bar is a composition, not occupancy; do not reuse the 41.4% fill.
- Host gate failures in a field with no source are recorded, not faked.
