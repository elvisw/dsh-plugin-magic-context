---
title: '#15: manual ctx-flush'
type: feature
ticket: '4'
created: '2026-11-14'
status: built
route: full
risk: medium
review: quick
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

# T4 implementation plan — `/ctx-flush`

Status: implemented, host-verified, independent Quick review PASS, independent report audit PASS
Ticket: `story-15-manual-ctx-flush.md`
Contract: `recovery-contract.md` D3 (updated to a dedicated next-preStep flush lane)

## 1. Command surface

- New `src/dsh/flush-command.ts`: `registerCtxFlushCommand` + pure `planFlushCommand`.
- Registered in `src/index.ts` next to `/ctx-status`, under the same `registerStatusCommand` gate.
- Registration name is lowercase `ctx-flush`; the user-visible line is `/ctx-flush`.
- No new config switch; update the `registerStatusCommand` comment and README tables to say the whole slash surface is disabled, not only `/ctx-status`.

## 2. Durable marker

- Schema v11: `pending_drops.flush_requested INTEGER NOT NULL DEFAULT 0` (additive migration).
- `AdapterStores` adds `requestFlush` (one atomic UPDATE; returns newly marked rows), `listFlushRequestedDrops`, `clearFlushRequests`.
- `markDropLanded` clears the marker; `queueDrop`'s landed-row upsert also resets it. A landed row stays spent (#13 A) and cannot be resurrected by a marker.
- Command receipt: `requested`, `alreadyRequested`, `pendingNext` upper bound, `processed: 0`; empty queue success; no session / closed store / storage failure are errors with no false success. `pendingNext` is omitted when the store failed.

## 3. Landing lane

- Extract `src/dsh/drop-landing.ts` from the management pass step 1:
  `landPendingDrops({session, sessionId, stores, tags, journal})` returns `{landed, already, skipped}` and keeps the existing `drop-landed` journal row.
- The management pass calls the helper with `listPendingDrops`; behavior is unchanged (skips are silent there).
- `preStep` calls the helper before `decidePass` with `listFlushRequestedDrops`, clears markers after the attempt, and never appends a notice. It does not call `runManagementPass` for this lane.
- The helper calls `onReplaced` immediately after each replacement, before `markDropLanded`; `flushLanded` is also OR-ed with a surface-generation comparison in `finally`, so a partial landing that throws still marks the same turn's pressure reading stale. The same preStep's `pressureStale` then true, so an execute pass in the same turn cannot run the force band against the pre-flush reading.
- No `pass`/new journal kind: the helper's `drop-landed` row is the only new journal record. Report scripts keep seeing only execute/defer pass rows.
- Wire-repair exception: a stranded tool result may have its placeholder replaced by the wire-repair note; host gate uses a paired read result.

## 4. Tests

- `tests/ctx-flush.spec.ts` (13 cases): marker counts/current-session isolation, empty/no-session/closed, marker restart, landed-row marker reset, race/no-op and follow-up-read failure receipts, helper lands only marked, unmarked stays pending, missing node skipped, placeholder reports `already`, replacement before a failing durable write calls `onReplaced`, plus two `preStepListener` cases (normal lane + failed durable write with stale pressure).
- Schema tests: `SCHEMA_VERSION` 11, v10→v11 migration, v7/v5/v3 fixtures drop the new column before reopening.
- Full suite / typecheck / i18n; update `scripts/phase-map.mjs`.
- Host gate: seed pending via real `ctx_reduce`, resume with the `acceptance-flush-driver` test-only plugin (`acceptance-windows-dsh-2026-11-14-t4-host/driver-flush.mjs`) that calls real `commands.find`/`commands.execute`, then observe the next request's placeholder. The normal run keeps `executeThreshold=100`/huge TTL; a second `flush-exec` run uses `executeThreshold=0`/`forceThreshold=0`/`ttlMs=0` to prove the same-turn `pressureStale` guard. If `commands` is absent or the agent cannot be driven, mark blocked; no unit substitute.

## 5. Housekeeping

- README / README.zh-CN command tables; PARITY row.
- Ticket `tickets.toml` description/verify aligned with the marker + next-preStep semantics.
- No new version number for the test build; pack identity is recorded in preflight (tarball SHA, git HEAD, diff SHA).
