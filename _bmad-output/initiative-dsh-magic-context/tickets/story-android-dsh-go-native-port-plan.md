---
title: Android dsh-go native telemetry and embedding controls
type: feature
ticket: "23"
created: 2026-11-17
status: built
baseline_revision: bf9c62fa694884fb4390b1564fc2f0cf138174ae
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - _bmad-output/initiative-dsh-magic-context/dsh-go-port/DESIGN.md
  - _bmad-output/initiative-dsh-magic-context/dsh-go-port/notes.md
---

<frozen-after-approval reason="human-owned intent — approved 2026-11-17">

## Intent

Support Android dsh-go 1.1.0 LOCAL in the existing npm package: native context strip, context details, embedding controls and host-generated configuration. Reuse desktop telemetry/provider behavior; no Flutter changes. Code first; stop phone navigation experiments until the final candidate exists.

## Boundaries & Constraints

Always: preserve desktop startup and existing defaults; use the released dsh-go contract; keep session/global scopes explicit; retain unknown values; provide complete zh/en copy. Respect explicit remote activation and target-space isolation. Secrets stay out of views, config values and evidence. Users provision their own host `.env` and restart; the agent never reads it.

Never: new vendor clients, HTTP routes, database schema, commands, tool cards, iOS claims, host patches, model tables, implicit paid requests, release/version changes. No broad phone-operation framework. Existing-profile testing is specifically authorized, but only with recoverable config and separate plugin data/test conversations.

## I/O & Edge-Case Matrix

| Scenario | Expected behavior |
|---|---|
| No dshGo service | Desktop still loads; optional registration waits. |
| Session / global / missing data | Same summary contract; explicit scope; unknown remains unknown. |
| Cancel / unmount / remount | Release subscriptions and timers; no stale emit or premature shared-service close. |
| Open / configure remote | No automatic probe/rebuild. Each committed local/off provider change disarms, even with no panel open. |
| Probe / start / pause / resume | Server guards and existing state machine; confirm target and missing count before start. |
| Slow action / abort / changed target | Deferred/cancel; compare captured target/key fingerprint after await; no stale cache write/success; fast background start. |

</frozen-after-approval>

## Code Map

- `src/index.ts:848-988` creates telemetry inside `webServer` injection. Give one parent-owned service to both adapters, constructed only after dependencies such as maintenance are ready; dispose once at parent teardown.
- `src/dsh/telemetry.ts` already exposes `summary(sessionId?)`; do not recreate token accounting or change payload semantics.
- New `src/dsh/go-native.ts` registers optional native handlers and scoped feeds. New `src/dsh/go-view.ts` contains localized declarative views and pure mappings. Do not import the browser IIFE.
- `src/dsh/embedding-lane.ts:85-106,458-578` exposes status/models/probe/start/pause/resume/disarm. Start already schedules the runner without awaiting it. Add optional cancellation propagation only where needed; share the provider and activation state.
- Put authoritative action guards in the server lane (or a small server-importable pure helper), including memory/key/probe/coverage and running/paused checks. Keep browser presentation gates; no browser-IIFE import or new bundler.
- Parent `src/index.ts` observes public `loader/volatile-update` and disarms on effective local/off commits. The released loader emits synchronously after reference commits; no polling. Close this listener with the parent.
- `readCache` already isolates models. Guard probe completion against full target/key changes, and derive `writeCache` eviction from the captured entry, not current config.
- `src/core/embedding-remote.ts` remains the only remote client. `src/index.ts` Config remains the settings truth; metadata-only localization/grouping must preserve types/defaults and must not materialize `memory`.
- `package.json` adds dshGo v1 manifest only. Pin references/checks to host commit `e9d3239bee18029d48618c7514303bc7fa7bbf8f`.

## Tasks & Acceptance

- [x] Add one strip and two native panels with unique IDs; capabilities/locale/scope follow the released example.
- [x] Connect shared telemetry and scoped lifecycle; add pure view, bridge-absent and cleanup tests.
- [x] Add embedding actions over the existing lane, including cancellation and target-change tests; expose model IDs for copying rather than a second settings writer.
- [x] Add server refusal tests and a local→remote round-trip test that commits both changes without opening/status-reading a panel.
- [x] Add safe native schema descriptions/groups and mobile setup guidance. Keep env-only key configuration; document plaintext `.env` and restart requirements.
- [x] Update README/Chinese README, PARITY, CHANGELOG and test phase-map. Capture documentation screenshots only from the final candidate.
- [x] Run final checks, freeze artifact, then execute one Android gate and write one concise evidence-based report.

Acceptance: follow the story's functional criteria. Do not count source feasibility, Windows mocks or preliminary ADB checks as Android success.

## Implementation Notes

Current checkpoint (2026-11-18): the bounded Android LOCAL path passed on the fixed
candidate. Three fixture memories and two vectors persisted across a new engine
boot; a later real tool search hit all three. Native session/config screenshots
were captured. The test package was removed, the original patch hash restored,
and the user confirmed a cleanup reboot. See the acceptance report. Independent
report audit: PASS WITH CAVEATS, no Critical; the single source-attribution fix
was applied without new tests. Local feature-branch handoff only; no push/release.
Do not repeat product checks for these documentation-only updates.

### Historical checkpoints (not the current status)

Approved 2026-11-17; preserve the frozen block. Execution handoff: the coding agent implements source/tests/manifest/schema metadata and user docs, following TDD and recording focused verification. It does not run ADB, install on the phone, commit, push or publish. The parent agent owns the final full checks/pack, independent diff review and single Android gate/screenshots/report. This is workflow ownership, not a scope change.

Parent source audit corrected the actual `summary.health` mapping and zero-coverage/running action gates before independent review. Real-service integration tests now cover the mapping; a real lane test covers pause/refusals before the first vector exists. Independent review corrected the parent's mistaken memory opt-in premise: `openMemoryLane:126-131` defaults memory ON; the old Config comment was stale. Parent verification: 85 files / 1035 tests, typecheck, i18n and build passed before review fixes; logs are in the T23 acceptance directory. No phone pass or artifact freeze yet. The review model is user-pinned Flash 4.1.

After the single review-fix batch: parent verification passed 85 files / 1043 tests, typecheck, i18n and build (`acceptance-android-dsh-go-2026-11-17-t23/evidence/local/`). The independent fix re-check returned READY: Q1–Q9 closed, including immutable dynamic confirmation IDs and rejection of static start. Three non-blocking suggestions are appended to `deferred-work.md`; no further code review round. Android gate and screenshots remain pending.

Candidate frozen after READY: 4,080,948 bytes / 71 files, SHA-256 `397f7ef89b254ecd20c7728411f3ee99f0adc9e5ac563d1279f8153d25eda5d2`; all 60 packaged `lib/` files equal the checked build. `adb devices -l` then returned an empty device list. Runtime verification is BLOCKED before installation, with no phone changes or model calls. Keep T23 open; resume the same artifact and frozen path when the device reconnects. No repeated suite, review, packaging or report audit merely for reconnection.

Resume: one authorized Android device reconnected, app version 1.1.0 rechecked; the frozen artifact and a small read-only CLI preflight were transferred to `/sdcard/Download/dsh-mc-t23/`. No installation/config change yet. The unnecessary gate-support agent stopped without writing files. Follow official CLI deployment, not GUI installation automation; wait for a single App-local terminal bootstrap instead of researching more navigation/remote execution channels.

2026-11-18 gate progress: the phone confirmed Linux/arm64, Node 24.22.1 and DSH 0.2.2-rc.1; CLI installed the initial candidate into an isolated test row/data directory. The user's first-open screenshot showed correct live status but no controls, making the deferred first-open risk an actual path blocker. A regression failed on the original code; the parent changed only view-time control derivation and its test (no new feature/review round). Updated candidate SHA-256 is `6fa8178c71ad55f5d6e4b553940206d486d9ec012d6e9031b445814a67bb93f4`, 4,081,023 bytes / 71 files; 60 `lib/` files match the build. Full checks passed with 4 Vitest workers (85/1044); an earlier default-concurrency run failed two fixed-250ms initialization cases and is retained, not claimed passing. New package and minimal update command were transferred; runtime confirmation after engine restart remains pending. Continue the same interrupted Android path, not a new matrix.

## Plan Change Log

## Review Triage Log

2026-11-17: Independent ticket check found three blocking design gaps. Added authoritative server action guards, synchronous parent-owned `loader/volatile-update` disarm, and post-await target/key checks with entry-derived cache eviction. The reviewer's initial cross-model-dimensions premise was withdrawn after verifying `readCache` exact matching. One targeted re-check returned READY FOR USER PLAN APPROVAL; closure was plan-only. User subsequently approved; no further ticket-review round.

Independent Quick review, individually verified by the parent (all route to patch; no intent change):

| Finding | Verdict | Evidence and correction |
|---|---|---|
| Q1 memory setup wording | medium | `openMemoryLane:126-131` defaults ON, unlike the stale Config comment; correct new README wording and the misleading comment, not runtime defaults. |
| Q2 clipped English toasts | medium | Pinned SDK `LIMITS.textChars.toast = 40`; several current action strings exceed it. Use concise complete zh/en copy and assert the budget. |
| Q3 confirm labels | low | Pinned component contract clips labels to 12; “Confirm rebuild” has 15 and cancel uses completed “Cancelled”. Direct label correction. |
| Q4 contradictory models empty hint | low | `modelsEmpty` is always emitted/rendered even with loaded rows. Remove or condition the hint; do not add another UI state machine. |
| Q5 retained model list | medium | `models` survives provider/config changes; retained rows can still be copied. The review's “writes host config” wording is overstated: current action only copies to clipboard, but the stale-list defect is real. Invalidate the binding on effective target/config changes. |
| Q6 mutable confirmation target | high | A timer calls the producer and overwrites `shownStartTarget`; current test never advances it between change/click. Bind confirmation to an immutable rendered target using supported v1 actions, not a mutable latest-feed value. |
| Q7 local/off controls and refusal | medium | Local coverage forms a remote rebuild hint; the native null-target shortcut precedes the authoritative provider/memory guard. Render applicable controls and preserve server refusal priority. |
| Q8 unmapped production failures | medium | `statusError`/probe paths emit the cited codes; native error text currently exposes them untranslated. Localize the known codes and distinguish malformed env names from absent values. |
| Q9 maintenance counter source | medium | `verifiedCount` reads `maintenanceLast.verified` but is unused; the maintenance row shows live memory verification totals. Separate the two existing meanings. |

## Verification

Semantic assertion: a native view uses the same scoped summary and remote activation state as desktop, preserving null/zero and never starting paid work merely on display/configuration.

Delivery: `adb push` the final `.tgz` to `/sdcard/Download/dsh-mc-t23/`, then run `dsh plugin --profile web add <absolute-tgz-path>` inside the App's local terminal. Enable the App's existing shared-file access if needed, only at this gate. Record SHA-256 plus commit: package version alone does not identify an unpublished candidate.

User path, frozen before execution: preserve the plugin config only (never copy credentials); precheck the effective memory-enabled flag without dumping config (absent means ON). Only add test-specific memory overrides if needed for isolation/backfill; native Config intentionally omits this block. Use separate plugin data and one new test conversation to write/recall memory; open strip/details/settings; explicitly probe/start a small fixture rebuild and pause/resume as observable; fully restart the engine and recall the test memory. A real conversation uses the user's configured model and may incur token cost.

The fixture runs on the computer and is reachable by `adb reverse tcp:<port> tcp:<port>` at phone `http://127.0.0.1:<port>/v1`; no real embedding key. Label this simulated-provider evidence, not SiliconFlow. Do not read/change phone `.env` or model credentials. Restore only test-owned config changes after collecting evidence.

Persistence and service lifecycle justify the restart check beyond the basic path. Do not repeat the desktop Web matrix or manufacture failures on the phone.

Commands once the batch is ready: focused Vitest tests; `npm test`; `npm run typecheck`; `npm run check:i18n`; `npm run build`; `npm pack`. Validate native payloads against the released SDK/schema, not main.

Review budget: one independent ticket check before implementation, then one quick diff review, at most one fix re-check, and one read-only report audit. Suggestions go to backlog. Text-only evidence corrections reuse existing runtime artifacts. Heavy implementation/review agents use `deepseek-v4.1-flash`.
