---
ticket: 22
title: "/ctx-wrapup manual live-history compaction — plan"
status: done
---

# Implementation plan: `/ctx-wrapup`

## 1. Marker

Use `stores.setMeta` / `stores.getMeta` (`src/core/stores.ts:269-270,1521-1528`).
No `deleteMeta`; the convention is `setMeta(key, '')` and `''` means absent
(`src/dsh/historian.ts:897-900,920-926`; `tests/historian-terminal.spec.ts:812`).

Key: `wrapup_request:<sessionId>`.

```json
{
  "keep": 20,
  "requestedAt": 1730000000000,
  "attempts": 0,
  "compartmentIds": []
}
```

- `compartmentIds` is empty until the historian stores a compartment.
- **Persist attempts on every forced pass**, including deferred and
  baseline-retry passes. Increment, write the marker, then do the work. Without
  this write the cap is unreachable because ID-present passes skip the
  historian and never touch the marker.
- `attempts > 3`: clear the marker and journal the last reason.
- Malformed or non-object values are absent: clear with `setMeta(key, '')`,
  journal once, and allow a new request. A malformed value is not "already
  pending".
- Per session; another session's marker is ignored.

## 2. Range helper

Add `src/dsh/wrapup-command.ts`:

```ts
export function planWrapupRange(
  nodes: readonly SurfaceNode[],
  keep: number,
  input: {
    readonly covered: ReadonlySet<number>
    readonly baselineNodeSeq?: number
  },
): {
  readonly prefix: SurfaceNode[]
  readonly retained: SurfaceNode[]
  readonly retainedEligible: number
  readonly compactedEntries: number
} | undefined
```

`compactedEntries` is `prefix.length` (physical surface entries), not the
eligible subset.

### Shared predicate and span bounds

Extract from `selectHistorianRange` (`src/dsh/historian.ts:197-219`):

- `isHistorianEligibleNode(node, covered, baselineNodeSeq)`:
  not `system`, not baseline, not covered, not `isPlaceholder`, not
  `SKIPPABLE_PLACEHOLDER` (dropped/compacted/checkpoint), and `hasText`.
- `historianSpanBounds(nodes, start, cut, covered, baselineNodeSeq)`:
  - skip leading skippable nodes;
  - then skip leading `tool` results (orphan result would 400 the replay);
  - trim the end while it is a `tool` result or an assistant that requested
    tools;
  - return `undefined` if empty.
- `selectHistorianRange` uses the same helpers, so automatic and manual spans
  cannot drift.

### Tail count, preference, final trim

1. Scan from tail with the eligible predicate; total `<= keep` -> `undefined`.
2. Find the `(keep + 1)`-th eligible from the tail; initial cut is `index + 1`.
3. Move the cut backward to the nearest `user` entry as a preference.
4. Call `historianSpanBounds` with that cut. The returned cut is authoritative;
   if the tail trim moves it away from the user entry, pairing correctness
   wins. Do not move it back to a user after trimming.
5. Reject if the prefix is empty, `retainedEligible < keep`, or the middle
   contains `system`, baseline, covered, `[compacted]` or `[checkpoint]`. A
   middle `[dropped §N§]` is allowed; the forced pass lands drops before the
   historian and the placeholder may legitimately be digested. A middle
   `system` would be removed by the replacement, so it is a hard no-op.
6. `developer` is eligible.

The command uses the helper only for preview/no-op; the pre-step re-plans after
drop landing and wire repair.

## 3. Command

`src/dsh/wrapup-command.ts`:

- `parseWrapupKeep(raw)`: empty -> 20; `/^\d+$/` and `1..1000` -> number;
  otherwise usage string.
- `readWrapupMarker(stores, sessionId)`:
  - empty -> undefined;
  - parse JSON; require `keep` integer in `1..1000`, `requestedAt` a finite
    number, `attempts` a non-negative integer, and `compartmentIds` a number
    array;
  - any schema violation -> clear and return undefined. Adoption depends on
    `requestedAt`, so a marker without it is malformed, not pending.
- `registerCtxWrapupCommand(ctx, deps)`:
  - deps: `stores`, `logger`, `journal`.
  - Handler:
    - no session id or `stores.closed` -> error receipt;
    - invalid keep -> usage;
    - valid marker -> refuse;
    - preview `planWrapupRange`; no range -> "nothing to wrap";
    - `setMeta` marker; on throw -> error receipt, do not claim queued;
    - queued receipt with requested/retained counts and next-pre-step note.
  - No LLM call, no surface mutation, no extra `enabled` gate.

Register in `src/index.ts` next to flush/recomp behind `registerStatusCommand`;
include `/ctx-wrapup` in the log line.

## 4. Historian trigger

In `src/dsh/historian.ts`:

- add `trigger?: 'automatic' | 'manual'` to `runHistorian` /
  `runHistorianExclusive`; pass to `callHistorian` instead of hardcoded
  `'automatic'` (`historian.ts:1022`); default automatic.
- wrapup passes `trigger: 'manual'`.
- pass `contextWindow` from `pre-step.ts:555` so manual chunking uses the live
  window, not `historianAssumedWindow`.
- pass `signal: payload.signal` and `profileCollect` when present.
- pass `nodes: fullSurface`, `forcedRange: prefix`; full surface is required
  for `systemSeq` (`historian.ts:1028-1030`).
- `forcedRange` already bypasses no-progress/budget (`historian.ts:972-1012`);
  no second bypass.

## 5. Pre-step forced pass

In `src/dsh/pre-step.ts`:

1. Before the normal decision, read the marker. Valid + non-empty -> execute
   with `reason: 'wrapup-pending'`. Add to `PassDecision` union
   (`src/core/policy.ts:131-133`).
2. Reuse normal execute inputs: `memoryRecall`, `profile`, `memoryUpdates`,
   `route`, `watermarks`, `profileCollect`, `memoryPromote`,
   `historianRoute`/`historianEffort`. No second route resolver.
3. Forced pass:
   - increment `attempts` and **write the marker before work**; if this write
     fails, journal and clear; if clear also fails, end without running the
     historian (do not leave an empty-ID marker that looks fresh).
   - `attempts > 3` -> clear, journal, end.
   - no LLM or historian disabled -> clear, journal, end;
   - `hasHistorianInFlight(sessionId)` -> leave marker, journal wait, end;
   - `landPendingDrops` (`src/dsh/drop-landing.ts:43`) **before planning**;
   - `repairWirePairing` **before planning** (export the helper from
     `management-pass.ts`);
   - re-plan `planWrapupRange` on the post-landing/post-repair surface. For
     adoption, remove a recent candidate's own covered seqs before planning and
     require its covered seqs to equal the resulting prefix exactly; take the
     newest exact match. A compartment with a different span (e.g. an automatic
     run) is never adopted. No-op with no candidate -> clear, journal, end;
   - if no exact-span candidate, call `runHistorian` with full surface, prefix,
     `contextWindow`, route/effort, `profileCollect`, `signal`, `trigger:
     'manual'`;
   - throw/abort -> clear, journal, end;
   - success -> write compartment ID plus the plan counts into marker. If write
     fails, journal and continue with the in-memory ID; exact-span adoption
     handles a later pass, and a normal execute pass can publish if the process
     dies.
4. Call `runManagementPass` with `skipForce: true` and **no `historian` input**.
   It lands any remaining drops, repairs wire, publishes all unlanded
   compartments, promotes facts, and refreshes the baseline with full
   recall/profile inputs.
5. After the pass:
   - target unlanded -> deferred; keep marker (attempts already persisted);
   - target landed + `baselineOk === true` -> clear;
   - target landed + `baselineOk === false` -> keep; next pass skips historian
     and retries the normal execute pass;
   - target ID absent from `listCompartments` -> clear + journal (stale/corrupt
     marker; do not retry);
   - terminal rejection (`landedReason`) -> clear + journal.
6. Exactly one pass row: `decision: execute, reason: wrapup-pending`, with
   `wrapup: { compartmentId, trigger: 'manual', retainedEligible,
   compactedEntries }`. Suppress the normal `decision: defer` row for this
   pre-step.

## 6. Management pass

In `src/dsh/management-pass.ts`:

- add optional `skipForce?: boolean`; when true skip only the force-band block
  (`management-pass.ts:709-750`). Drop landing, wire repair, publish and
  baseline still run.
- `refreshBaseline` must filter to **landed** compartments:
  `listCompartments(sessionId).filter(c => c.landedEventSeq !== undefined)`
  before `splitBaselineSets`/`renderBaseline`. This prevents a deferred or
  rejected wrapup digest from entering the baseline while its original span is
  still on the wire. Normal passes already publish all unlanded first, so this
  does not change their successful path.
- add `baselineOk: boolean`:
  - true when a landed baseline target existed and `refreshBaseline` completed
    (even if `updated: false` for byte-identical);
  - false when no target (`management-pass.ts:528-529`) or the pass threw;
  - preserve `published` IDs assigned before a later baseline failure.
- export `repairWirePairing(session, sessionId, journal)` (thin wrapper around
  the existing body, `management-pass.ts:607-634`) for the forced pass.
- do **not** add a wrapupOnly/onlyIds publish mode; all unlanded must publish
  together and baseline must be landed-only.

## 7. Tests

Fake LLM only; no real model, no browser, no new host gate.

`tests/wrapup-command.spec.ts`:

- `parseWrapupKeep`: empty/20, 1, 1000, 0, 1001, non-numeric, whitespace;
- `planWrapupRange`: default tail count, placeholders/system/empty/baseline/
  covered not counted, `developer` counted, leading orphan tool-result skip,
  tail trim, user preference then pairing trim, middle `[dropped]` allowed,
  middle system/baseline/covered/compacted/checkpoint no-op, fewer-than-keep
  no-op, `compactedEntries === prefix.length`;
- command: no session, closed store, marker write throw, marker written once,
  valid duplicate refused, malformed marker treated as absent, `keep` out of
  range and missing `requestedAt` treated as schema-invalid and cleared, no LLM
  call.

`tests/pre-step-wrapup.spec.ts`:

- queued command -> forced execute -> one manual `runHistorian` call;
- one compartment, one pass row with `wrapup` and `trigger: 'manual'`;
- pending drops land and wire repair runs **before** the historian; assert the
  historian's `forcedRange` nodes are post-mutation, not just that a placeholder
  appeared on the surface;
- middle dropped placeholder from landing still allows the span;
- force-band reclaim skipped even above threshold;
- automatic historian not started;
- baseline contains memory/profile lines and only landed compartments;
- facts promoted;
- unpinned route uses session route;
- marker clear then second wrapup accepted.

Failure cases:

- historian throw/abort -> marker cleared;
- marker ID write failure -> exact-span adoption prevents a second historian;
  a different-span recent compartment is ignored; clear
  failure also covered;
- marker `attempts` persists across deferred/baseline retry and stops at 3;
- terminal rejection clears, no retry, and baseline excludes its digest;
- deferred baseline excludes its digest;
- a marker ID absent from `listCompartments` clears and is not retried;
- baseline throw after publish -> marker kept; second pass no LLM call and
  clears after success;
- `setMeta(key, '')` cleanup then new request.

Do not use `tests/historian-pairing.spec.ts` for range tests; it tests the
orphan-detection script. Use `tests/historian-terminal.spec.ts:437-516`,
including the "never opens on an orphan tool result" shape at `:453-466`.

## 8. Docs and metadata

- `PARITY.md`: command surface five -> six; `/ctx-wrapup` supported; add
  `src/dsh/wrapup-command.ts`.
- `README.md` / `README.zh-CN.md`: command row and queued semantics; state that
  a forced pass lands queued drops, skips force-band reclaim, and the next
  normal execute pass applies force policy.
- `CHANGELOG.md`: `[Unreleased]` Added.
- registration log includes `/ctx-wrapup`.
- `tickets.toml` verify stays `npm test`, typecheck and build; no host gate or
  real-model requirement.

## 9. Out of scope

- `ctx-embed`, history/git semantic index, dreamer tasks.
- Settings UI changes.
- Any change to `/ctx-recomp` or `/ctx-flush`.
