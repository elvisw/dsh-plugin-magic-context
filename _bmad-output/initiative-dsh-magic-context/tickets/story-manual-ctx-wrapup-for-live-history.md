---
id: 22
type: story
title: "/ctx-wrapup manual live-history compaction"
parent: initiative-dsh-magic-context
after: [21]
refined: false
hitl: false
risk: high
covers:
  - src/dsh/wrapup-command.ts
  - src/dsh/historian.ts
  - src/dsh/management-pass.ts
  - src/dsh/pre-step.ts
  - src/dsh/drop-landing.ts
  - src/core/policy.ts
  - src/core/stores.ts
  - src/index.ts
  - tests/wrapup-command.spec.ts
  - tests/pre-step-wrapup.spec.ts
  - tests/historian-terminal.spec.ts
  - tests/command-surface.spec.ts
  - PARITY.md
  - README.md
  - README.zh-CN.md
  - CHANGELOG.md
verify: "npm test && npm run typecheck && npm run build"
---

# /ctx-wrapup: manual live-history compaction

## Why

Upstream Magic Context's `/ctx-wrapup` compacts the still-live tail on
request, keeping the newest N messages. The DSH adapter has the historian and
the compartment publisher, but no way to ask for that compaction before the
pressure bands fire. `/ctx-recomp` only re-digests landed compartments;
`/ctx-flush` only lands queued drops.

The command must be a queue request, not an immediate surface rewrite. The
historian needs the session route/effort and the live profile collector, and
the publish needs the same recall/profile inputs as a normal execute pass.
Running the historian in the command handler would either duplicate that
resolver or lose the baseline memory/profile content. The command therefore
records a request and the next pre-step runs one forced execute pass named
`wrapup-pending`.

## User-visible contract

### Invocation

```
/ctx-wrapup            # keep the newest 20 eligible surface entries
/ctx-wrapup 40         # keep the newest 40
```

- The argument must be an integer in `1..1000`. Anything else returns a usage
  line and writes nothing.
- `keep` counts **eligible surface entries**, not physical nodes. Placeholders,
  system nodes and empty nodes do not count.
- If the live surface has `<= keep` eligible entries, the command reports
  "nothing to wrap" and writes no marker.
- If a valid wrapup request is already pending, the command refuses; it never
  overwrites it. A malformed marker is treated as absent and cleared.
- The command does not call the LLM, does not spend historian tokens, and does
  not mutate the surface. Its receipt says the request is queued for the next
  pre-step.
- The command is gated only by `registerStatusCommand: false`. It does not add
  a second `historianEnabled` gate at command time; if the historian is
  unavailable when the queued pass runs, that pass clears the marker and
  journals the reason.

### Eligibility and span

The eligible predicate is the one the historian already uses in
`selectHistorianRange`, extracted and shared:

- not `system`;
- not the baseline node;
- not already covered by a compartment;
- not `isPlaceholder`, not a dropped/compacted/checkpoint marker, and has text.

`developer` entries are eligible. This is explicit because the old ticket text
omitted them while the historian predicate accepts them.

The span calculation:

1. Count eligible entries from the tail until `keep` would be retained (find
   the `(keep + 1)`-th eligible entry from the tail).
2. The initial cut is immediately after that entry: prefix compacted, tail
   retained.
3. Move the cut backward to the nearest `user` entry as a preference, so the
   retained tail starts at a user turn when possible.
4. Call the extracted `historianSpanBounds` to apply the historian's head and
   tail pairing rules:
   - skip leading skippable nodes and then leading `tool` results;
   - trim the end while it is a `tool` result or an assistant that requested
     tools.
   The final pairing-trimmed cut is authoritative. If the trim moves the cut
   away from the user entry, pairing correctness wins; the receipt reports the
   actual retained count, not the preferred boundary.
5. Reject the span if the prefix is empty, retains fewer than `keep` eligible
   entries, or contains `system`, baseline, covered, `[compacted]`, or
   `[checkpoint]` in its middle. A middle `[dropped §N§]` is allowed: the
   forced pass lands pending drops before the historian, and the digest may
   legitimately see that placeholder. A middle `system` node would be removed
   by the compartment replacement, so it must never be swallowed.
6. The historian receives the **full live surface** as `nodes` and the selected
   prefix as `forcedRange`; `systemSeq` is resolved from the full surface. The
   run is recorded with `trigger: 'manual'`.

### Publish and baseline

The next pre-step sees the pending marker and returns an execute decision with
reason `wrapup-pending`. It reuses the normal execute branch's inputs:

- live route/effort (`generationRoute ?? sessionRoute`, effort merged);
- `memoryRecall` memories, profile and memory updates;
- baseline watermarks and the current `route`;
- `memoryPromote` and `profileCollect` when those seams are present.

The forced pass:

1. increments and persists `attempts`; if `> 3`, clears the marker, journals,
   and ends.
2. If `compartmentIds` is empty, adopts an existing compartment created at or
   after `requestedAt` (if one is present) instead of running the historian
   again. This is the recovery path when the historian stored a compartment
   but the marker ID write failed.
3. If no compartment was adopted:
   - clear the marker and end when the LLM is absent or the historian is
     disabled;
   - leave the marker and end when `runHistorian` is already in flight;
   - land queued pending drops **before** planning, using the normal
     `landPendingDrops` lane;
   - repair stranded wire results **before** planning, using the same
     iron-rule repair as the normal pass;
   - re-plan the span on the post-landing/post-repair surface;
   - if no-op, clear the marker and end;
   - run one manual historian with full surface, prefix, `contextWindow`,
     route/effort, `profileCollect`, `signal`, and `trigger: 'manual'`;
   - on throw/abort, clear the marker and end;
   - on success, write the compartment ID into the marker. If that write
     fails, journal it and continue with the in-memory ID; the adoption rule
     above prevents a second historian run, and a normal execute pass can
     publish the compartment if this process dies.
4. Call `runManagementPass` with `skipForce: true` and **without** a
   `historian` input. This is otherwise a normal execute pass: it lands any
   remaining queued drops, repairs wire pairing, publishes **all** unlanded
   compartments, promotes facts, and refreshes the baseline with the full
   recall/profile inputs.
5. After the pass:
   - target still unlanded -> deferred; keep the marker (with the persisted
     attempts) and retry next pre-step;
   - target landed and `baselineOk === true` -> clear the marker;
   - target landed and `baselineOk === false` -> keep the marker; the next
     pass skips the historian and retries the normal execute pass;
   - target ID not found in `listCompartments` (stale or corrupt marker) ->
     clear the marker and journal; do not retry;
   - terminal rejection (`landedReason` set) -> clear the marker and journal.

`refreshBaseline` must only render **landed** compartments
(`landedEventSeq !== undefined`). A deferred or rejected wrapup must not leak
its digest into the baseline while its original span is still on the wire.

Landing queued drops and publishing other unlanded compartments is deliberate:
the normal execute pass already owns those invariants, and a wrapup-only
publish would let an unlanded digest leak into the baseline. The command does
not create new drops; it only triggers the existing execute lane. The force
band is skipped for this pass because the manual digest already reduces the
wire; if pressure is still above the force threshold, the next normal execute
pass applies the normal policy.

No defer row is written for this pre-step; exactly one
`decision: execute, reason: wrapup-pending` row is written, with a
`wrapup: { compartmentId, trigger: 'manual', retainedEligible,
compactedEntries }` field. `compactedEntries` is `prefix.length` (physical
surface entries in the compacted span), not the eligible subset.

### Failure and retry

- **No eligible span at run time**: clear the marker, journal a no-op, do not
  call the historian.
- **Historian unavailable or disabled**: clear the marker, journal the reason,
  do not retry.
- **Automatic historian already in flight** (`runHistorian`'s per-session
  in-flight guard): leave the marker pending and journal a wait; next pre-step
  retries. `recompactCompartments` calls `callHistorian` directly and is
  outside this guard; the command does not claim to serialize with it.
- **Pending-drop landing or wire repair throws before the historian**: clear
  the marker; journal the error; leave the compartment uncreated.
- **Historian throws or is aborted**: clear the marker; journal the error; do
  not retry automatically.
- **Marker ID write fails after the historian stored a compartment**: journal,
  continue with the in-memory ID, and rely on adoption plus the normal execute
  pass. Do not keep an empty-ID marker that can be mistaken for a fresh
  request.
- **Publish deferred**: keep the marker with the stored IDs and persisted
  attempts; the next pre-step skips the historian and retries. After 3
  attempts, clear the marker and journal the last reason.
- **Terminal publication rejection**: clear the marker; journal the rejection;
  `markCompartmentRejected` means it is not retried.
- **Publish succeeded but baseline refresh failed**: keep the marker with the
  IDs; the next pre-step skips the historian and retries the normal execute
  pass. This avoids a landed `[compacted]` node with no digest in the baseline.
- Marker cleanup uses `stores.setMeta(key, '')`; empty string means absent. A
  new normal wrapup must be accepted after cleanup.

## Non-goals

- No `ctx-embed`.
- No dreamer tasks or scheduler.
- No settings-page changes.
- No new configuration keys.
- No new Web host gate and no real-model requirement. The command and publish
  path are covered by unit/integration tests with a fake LLM, per the
  repository's minimal-verification rule.

## Verify

Minimal set:

1. `planWrapupRange`:
   - default keep 20;
   - tail placeholders/system/empty/covered not counted;
   - `developer` counts;
   - head skips leading tool results; tail pairing is delegated to
     `historianSpanBounds` and covered by the existing historian-terminal suite;
   - user-boundary preference is applied before planning; when that preferred
     cut yields no valid prefix, the planner falls back to the pairing-safe cut;
   - middle `[dropped §N§]` is allowed; middle `system`/`compacted` is no-op;
   - fewer than `keep` eligible entries -> no-op;
   - `compactedEntries` is the physical prefix length.
2. Command:
   - valid/invalid args;
   - pending marker written once; valid duplicate refused; malformed marker
     (including `keep` out of range or missing `requestedAt`) treated as
     absent and cleared;
   - no session / closed store / marker write failure returns an error receipt
     and does not claim "queued";
   - one command-service registration test; do not test
     `registerStatusCommand: false` by starting the whole plugin.
3. Pre-step integration with the fake LLM:
   - command -> next pre-step forced execute `wrapup-pending`;
   - one manual historian call, one compartment, one pass row with the
     `wrapup` field, `trigger: 'manual'` and the retained/compacted counts;
   - pending drops land **before** the historian; the historian replay contains
     `[dropped §N§]` and not the original tool text;
   - automatic historian is not started on the success path or after a manual
     provider failure;
   - marker is cleared after the successful pass.
4. Failure injection:
   - historian throw clears the marker and does not start an automatic run;
   - a marker above the attempts cap clears without a model call;
   - exact-span adoption works; a different-span recent compartment is not
     adopted and the manual historian still runs;
   - a deferred digest is not rendered into the baseline while its span is
     still live.

Shared helpers (wire repair, terminal publish rejection, baseline retry,
unpinned route) keep their existing suites; this ticket does not claim a new
case for each of them.
5. `npm test`, typecheck and build. `check:i18n` is not required for this
   ticket because no UI dictionary changes; run it only if the diff touches
   localized strings.

Do not add a real-model smoke or a Web host gate for this ticket. The behavior
is server-side command scheduling and persistence; the fake LLM exercises the
same `callHistorian` / store / publish path.

## Covers

`src/dsh/wrapup-command.ts`, `src/dsh/historian.ts`,
`src/dsh/management-pass.ts`, `src/dsh/pre-step.ts`, `src/dsh/drop-landing.ts`,
`src/core/policy.ts`, `src/core/stores.ts`, `src/index.ts`, the test files
above, and the user-facing command tables in `PARITY.md`, `README.md`,
`README.zh-CN.md`, `CHANGELOG.md`.
