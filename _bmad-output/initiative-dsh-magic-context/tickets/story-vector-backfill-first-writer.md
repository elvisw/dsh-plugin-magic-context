---
id: 8
type: story
title: "Vector backfill first-writer bootstrap"
parent: initiative-dsh-magic-context
after: [7]
refined: true
hitl: false
risk: high
---

# Vector backfill first-writer bootstrap

## Summary

Fix the empty-corpus deadlock in the local embedding lane.

On a store with `memories` rows but zero `memory_embeddings` rows,
`resolveSharedSpace()` returns `modelId: null`; `runVectorBackfill()` checks
parity before it asks for a plan and returns `parity-unproven`; `planBackfill()`
would return no candidates anyway because there is no dominant space. The only
writer of `memory_embeddings` is that backfill, so the first vector can never be
written. The lane stays permanently FTS-only.

The fix is a **first-writer bootstrap**, not a weakening of the parity gate:
only the “no embedding space exists yet” case may create the first space. A
dims mismatch, a failed parity sample, or a failed embed remains closed.

## Requirements

1. **Planning can name the first space.**
   - `planBackfill()` accepts an optional `bootstrapModelId`.
   - When `measureVectorLane()` reports no dominant space and
     `bootstrapModelId` is provided, the plan returns that model id and the
     active memories that have no row in it (newest first, same bound).
   - Without `bootstrapModelId`, the existing empty-plan behavior and reason
     remain unchanged.
   - Archived memories are never candidates; an empty active corpus reports
     `total: 0` with a truthful reason.

2. **The gate distinguishes bootstrap from all other closures.**
   - `resolveSharedSpace()` returns `bootstrapModelId = embedder.modelId` only
     when no dominant space exists.
   - Dims mismatch, parity failure, empty embed, and embed failure return no
     bootstrap.
   - The value is journaled with the gate outcome.

3. **The backfill writes only the bootstrap space.**
   - `runVectorBackfill()` accepts `bootstrapModelId`.
   - Normal path: `parityModelId` must equal `plan.modelId` exactly.
   - Bootstrap path: `parityModelId` is null, `bootstrapModelId` is present,
     and `plan.modelId` must equal `bootstrapModelId`; otherwise
     `parity-mismatch`.
   - Bootstrap logs a distinct `backfill-bootstrap` outcome.
   - The existing whole-batch abort for a closed gate stays.

4. **The read side recovers in the same process.**
   - After a bootstrap backfill creates at least one row, clear the memoized
     `sharedSpacePromise`.
   - The next query re-resolves the gate: the new dominant space must pass the
     normal dimension check and parity sample before vectors are read.
   - A bootstrap that creates zero rows must not clear the memo.

5. **No behavior change outside the empty-space case.**
   - No schema migration.
   - No new writer besides `storeEmbedding`.
   - No change to FTS-only fallback when the gate is genuinely closed.
   - No direct edit of `lib/`; build output is regenerated.

## Verification

- Unit tests:
  - `planBackfill` with no space and `bootstrapModelId` returns newest-first
    active candidates; without it returns the existing empty plan.
  - archived rows are excluded, and an empty active corpus has `total: 0`.
  - `runVectorBackfill` writes with `parityModelId: null` plus a matching
    `bootstrapModelId`, and does not write when the plan model differs.
  - a null parity with no bootstrap still returns `parity-unproven` and calls
    neither embed nor store.
  - normal parity-pass writes still work.
- `npm test`, `npm run typecheck`, `npm run build`.
- Host gate (isolated profile, no daily data): a fresh own-corpus store has an
  active memory but zero embeddings; after the maintenance tick the store has
  a row under the embedder model id, and a subsequent `ctx_memory search` uses
  the semantic lane rather than only FTS. If the host/model download cannot be
  made deterministic, record `blocked` for the host portion rather than
  substituting the unit test.
- Evidence: the new test output, build output, journal outcomes
  (`backfill-bootstrap`, then `parity-pass`), and DB counts before/after.

## Boundaries

- Not the stats `total` display issue; that is a separate ticket.
- Not a fix for model-download failure; a failed download remains a closed
  lane with a clear journal row.
- Not a change to the upstream package or a `node_modules` patch.
- Not a release; version bump and npm publish are separate.
