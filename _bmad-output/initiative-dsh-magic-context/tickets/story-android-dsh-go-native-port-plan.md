---
title: Android dsh-go native telemetry and embedding controls
type: feature
ticket: "23"
created: 2026-11-17
status: ready-for-dev
baseline_revision: bf9c62fa694884fb4390b1564fc2f0cf138174ae
route: full
route_source: auto
risk: high
review: quick
review_source: auto
lenses_ran: []
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

- [ ] Add one strip and two native panels with unique IDs; capabilities/locale/scope follow the released example.
- [ ] Connect shared telemetry and scoped lifecycle; add pure view, bridge-absent and cleanup tests.
- [ ] Add embedding actions over the existing lane, including cancellation and target-change tests; expose model IDs for copying rather than a second settings writer.
- [ ] Add server refusal tests and a local→remote round-trip test that commits both changes without opening/status-reading a panel.
- [ ] Add safe native schema descriptions/groups and mobile setup guidance. Keep env-only key configuration; document plaintext `.env` and restart requirements.
- [ ] Update README/Chinese README, PARITY, CHANGELOG and test phase-map. Capture documentation screenshots only from the final candidate.
- [ ] Run final checks, freeze artifact, then execute one Android gate and write one concise evidence-based report.

Acceptance: follow the story's functional criteria. Do not count source feasibility, Windows mocks or preliminary ADB checks as Android success.

## Implementation Notes

Approved 2026-11-17; preserve the frozen block. Execution handoff: the coding agent implements source/tests/manifest/schema metadata and user docs, following TDD and recording focused verification. It does not run ADB, install on the phone, commit, push or publish. The parent agent owns the final full checks/pack, independent diff review and single Android gate/screenshots/report. This is workflow ownership, not a scope change.

## Plan Change Log

## Review Triage Log

2026-11-17: Independent ticket check found three blocking design gaps. Added authoritative server action guards, synchronous parent-owned `loader/volatile-update` disarm, and post-await target/key checks with entry-derived cache eviction. The reviewer's initial cross-model-dimensions premise was withdrawn after verifying `readCache` exact matching. One targeted re-check returned READY FOR USER PLAN APPROVAL; closure was plan-only. User subsequently approved; no further ticket-review round.

## Verification

Semantic assertion: a native view uses the same scoped summary and remote activation state as desktop, preserving null/zero and never starting paid work merely on display/configuration.

Delivery: `adb push` the final `.tgz` to `/sdcard/Download/dsh-mc-t23/`, then run `dsh plugin --profile web add <absolute-tgz-path>` inside the App's local terminal. Enable the App's existing shared-file access if needed, only at this gate. Record SHA-256 plus commit: package version alone does not identify an unpublished candidate.

User path, frozen before execution: preserve the plugin config only (never copy credentials); precheck the memory-enabled flag without dumping config; if absent, explicitly enable `memory` in the test plugin row because native Config intentionally omits it. Use separate plugin data and one new test conversation to write/recall memory; open strip/details/settings; explicitly probe/start a small fixture rebuild and pause/resume as observable; fully restart the engine and recall the test memory. A real conversation uses the user's configured model and may incur token cost.

The fixture runs on the computer and is reachable by `adb reverse tcp:<port> tcp:<port>` at phone `http://127.0.0.1:<port>/v1`; no real embedding key. Label this simulated-provider evidence, not SiliconFlow. Do not read/change phone `.env` or model credentials. Restore only test-owned config changes after collecting evidence.

Persistence and service lifecycle justify the restart check beyond the basic path. Do not repeat the desktop Web matrix or manufacture failures on the phone.

Commands once the batch is ready: focused Vitest tests; `npm test`; `npm run typecheck`; `npm run check:i18n`; `npm run build`; `npm pack`. Validate native payloads against the released SDK/schema, not main.

Review budget: one independent ticket check before implementation, then one quick diff review, at most one fix re-check, and one read-only report audit. Suggestions go to backlog. Text-only evidence corrections reuse existing runtime artifacts. Heavy implementation/review agents use `deepseek-v4.1-flash`.
