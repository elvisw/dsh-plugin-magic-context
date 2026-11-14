---
id: 4
type: story
title: "#15: manual ctx-flush"
parent: initiative-dsh-magic-context
after: [2]
refined: true
hitl: false
risk: medium
---

# #15: manual ctx-flush

## Description

Adds a real `/ctx-flush` slash command for the current session. The command does not rewrite the current request: it durably marks the session's already-pending `ctx_reduce` drops for forced landing, reports the requested/pending counts, and lets the next `preStep` land exactly those drops outside the normal pressure/TTL gate. The next model request sees the placeholders; the command itself starts no Historian, recomp, summary, or model call. DSH has no separate injection-cache object to invalidate; the session surface plus the next request assembly is the cache-equivalent boundary.

## Requirements

Verify: In a fresh session, queue a `ctx_reduce`, call `/ctx-flush`, and make the next request; the next request contains the `[dropped §N§]` placeholder even though the pressure/TTL band would still defer. The command receipt reports the real requested/pending counts, repeated/empty/no-session/storage-failure cases are diagnosable, and no Historian/recomp/extra reclaim or second session is touched.

1. **Command surface**
   **Given** the adapter's command surface is enabled (`registerStatusCommand !== false`)
   **When** the plugin mounts
   **Then** it registers the lowercase command `ctx-flush` (the user types `/ctx-flush`), with a description that says it flushes current-session pending drops, not summaries
   **And** if the host has no `commands` service the adapter logs that `/ctx-flush` is unavailable instead of throwing
   **And** when `registerStatusCommand: false`, the command is not registered (the same surface switch as `/ctx-status`; docs state this). There is no second flush-specific config switch.

2. **Marker, not a synchronous surface rewrite**
   **Given** the current session has one or more rows in `pending_drops` with `landed_event_seq IS NULL`
   **When** the user invokes `/ctx-flush`
   **Then** the command marks only those current-session rows with `flush_requested = 1` and returns without appending or replacing a session surface event
   **And** the receipt distinguishes `requested` (newly marked), `alreadyRequested` (marked before this call), and `pendingNext` (still-pending upper bound); a marker request is reported as “takes effect on the next message”, never as “processed now”
   **And** it never scans another session, never creates a pending drop, and never changes a `landed` drop; the mark is one atomic UPDATE, so a failure cannot partially rewrite a multi-row queue.

3. **Next-preStep flush lane**
   **Given** a session has `pending_drops` rows with `flush_requested = 1`
   **When** the next `preStep` runs, even if the pressure decision would be `defer`
   **Then** before `decidePass` the adapter lands exactly those marked tags through the same placeholder/`markDropLanded` helper the management pass uses (no second landing implementation), clears their flush markers, and on the normal return path leaves the helper's existing `drop-landed` journal row as the durable landing record; it does not add a new `pass` decision/kind (the report scripts keep treating only `execute`/`defer` as pass rows)

   **And** a tag with no live surface node is returned as `skipped`, left pending, and its marker is cleared after the attempt so one request cannot create an unbounded retry loop; skip is a helper/flush-lane result, not a command result and not a new journal row, and a later `/ctx-flush` can retry the still-pending row
   **And** the flush lane does not fire the Historian, does not call recomp, does not force an emergency reclaim, does not publish a ready compartment, does not rebuild the baseline, and does not append a session notice
   **And** when the lane replaced at least one node—including a partial landing that throws after `replaceToolResultContent`—the same preStep marks its pressure reading stale before the execute decision, so the force band cannot reclaim a second batch against a reading that predates the flush (the contract's D3.5 boundary); a normal execute pass in the same preStep sees no duplicate pending work; a partial failure records the replaced tags in the `error` journal row instead of claiming a `drop-landed` row
   **And** if a marked tag is a stranded tool result, the execute-band wire repair may replace its placeholder with the wire-repair note; that is the iron-rule exception and the host gate uses a paired result, not a stranded one.

4. **Persistence and replay**
   **Given** the command marked pending rows and the process exits before the next preStep
   **When** the same session is resumed in a new host process
   **Then** the marker is still present in the store and the first new preStep lands it
   **And** the schema migration is additive (`v11` adds `pending_drops.flush_requested INTEGER NOT NULL DEFAULT 0`); an existing v10 database opens without losing rows, the two hard-coded `SCHEMA_VERSION` assertions move to 11, and a store newer than the adapter still fails closed
   **And** landing clears the marker; `queueDrop` only refreshes `queued_at` and cannot resurrect a landed row (the #13 A state machine), so a stale marker can never force a future drop.

5. **Real failure and no-op states**
   **Given** no active session, no pending drops, an already-marked queue, or a closed/unavailable store
   **When** `/ctx-flush` runs
   **Then** the result is respectively `no-session` (error; defensive unit state only), `noop` (success: nothing to flush), `alreadyRequested` (success, requested 0, pending unchanged), or `storage unavailable` (error, no false success, `pendingNext` unknown)
   **And** a repeated call after the first marker reports requested 0 rather than counting the same rows again (until the next preStep clears the marker; after that the row is still pending and a new call may mark it again)
   **And** a storage write failure leaves the previous `flush_requested` values unchanged; the command must not claim a marker it did not write
   **And** if the row is landed between the read and the UPDATE, requested 0/alreadyRequested 0 is a successful no-op, not an error; if the marker write succeeded but the follow-up read fails, the receipt reports the requested count and omits `pendingNext` rather than saying nothing changed
   **And** skip is not a command state: the command only reads the store; a tag with no live surface node is a preStep result.

6. **No extra model or maintenance work**
   **Given** a flush with pending rows
   **When** it is executed and the next preStep lands it
   **Then** the command itself writes no assistant message and makes no LLM call; journal/`usage_records` contain no new Historian, recomp, or summary run attributable to the command
   **And** no additional drop is created and no compartment is published by the flush lane
   **And** other sessions' pending rows and markers are unchanged
   **And** `/ctx-status` still shows the same pending queue; the marker is not a separate ledger row, and no session notice is appended.

7. **Unit and integration coverage**
   **Given** the implementation
   **When** the test suite runs
   **Then** tests cover the command marker/result text, empty/repeated/already-requested states, storage failure, no session, migration from v10 plus the two updated `SCHEMA_VERSION` assertions, marker persistence across a fresh store handle, the preStep landing helper landing exactly the marked tags while an unmarked pending tag stays pending, skipped tags, and no Historian/recomp invocation
   **And** the management-pass landing path remains behaviorally shared, not duplicated; tests cover a replacement followed by a failing durable write (`onReplaced` fires before the throw), and a `preStepListener` lane test proves the marked drop lands, markers clear, the pass row is stale, a failed durable write leaves the marker for retry with `replacedTags` in the error row, and the host gate's force variant records the same-turn execute pass with `pressureStale: true` and `forceDropped: 0`.

8. **Host gate**
   **Given** an isolated DSH profile with the locally built plugin, a real model route, and a real session
   **When** a first host run queues a normal `ctx_reduce` (not an expand/requeue), a second host invokes the actual `/ctx-flush` command through DSH's real command registry on the resumed agent, and a subsequent request is made
   **Then** the gate asserts `commands.find(agent, 'ctx-flush')` is defined in that profile, `commands.execute(agent, '/ctx-flush', [], signal)` returns a non-undefined settled execution with `execution.result.kind === 'success'` and a real `execution.result.text`, and the host records the real `command/run` and `command/done` events; the receipt reports the real counts; the command made no model call of its own; the next request contains the placeholder
   **And** because headless DSH sends a task as a user message and does not dispatch plugin slash commands, the gate uses the **named, test-only** `acceptance-flush-driver` plugin (`acceptance-windows-dsh-2026-11-14-t4-host/driver-flush.mjs`) that injects `commands`, observes the resumed agent's first creation event, and calls the real `commands.execute` with a real `AbortSignal`; the driver is disclosed in the report and writes the actual settled result to evidence, never a fabricated success
   **And** a second force variant uses `executeThreshold=0`/`forceThreshold=0`/`ttlMs=0` and records the same-turn execute pass with `pressureStale: true`, `forceDropped: 0`, `landed: []`, `published: []`, and `historianStarted: false`
   **And** if the profile has no `commands` service, `commands.find` is empty, the driver cannot obtain a real agent, or the next request cannot be observed, the story is `blocked`; the fallback is a web/TUI composition with a real command dispatch, not a unit test.

## Boundaries

- No new upstream cache object: DSH has no separate injection-cache API; the next request observes the mutated session surface.
- Flush does not expand, compact, summarize, re-run a tool, or repair #13/#14 semantics.
- Flush processes only rows already in `pending_drops`; it never reclaims unmarked content and never changes thresholds, protected windows, or tag retention.
- `/ctx-flush` is not `/compact`: no checkpoint/historian request. It is not `/ctx-recomp`: no digest replacement.
- `start`/`end`/`verbose`, retention, and message/session deletion remain out of scope (T5 / V1.1).
- If a marked tag is a stranded tool result, the execute band's wire-pairing repair can replace the placeholder with the wire-repair note; that is the iron-rule exception, not a flush failure, and the host gate uses a paired read result.
- The flush lane never appends a session notice; `/ctx-status` keeps showing the pending queue as the reclaim ledger, without a separate flush-marker row.

## References

- Contract D3/E7/E8 — `_bmad-output/initiative-dsh-magic-context/tickets/recovery-contract.md:46-55`, `:90-91`, `:116-117`
- Upstream flush source/doc findings — `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-09/issue-ctx-flush.md:22-40`; `docs/research-handoff-ctx-flush-2026-11-11.md:29-43`
- Command registration precedent — `src/index.ts:643-661`; `src/dsh/status-command.ts:36-45`; `src/dsh/recomp.ts:256-268`
- Pending table and landing — `src/core/stores.ts:415-429`, `:894-940`; `src/dsh/drop-landing.ts`
- Execute-band gate — `src/dsh/pre-step.ts:322`; preStep session id — `src/dsh/pre-step.ts:141`
- Command config gate — `src/dsh/config.ts:16-17`
- Host command API — `node_modules/@deepseek-ai/dsh-commands/lib/types/index.d.ts:80-142` (real `commands.execute`; no headless slash dispatch)
