---
title: "Vector backfill first-writer bootstrap — implementation plan"
ticket: 8
status: done
---

# Vector backfill first-writer bootstrap — implementation plan

## Progress

- 2026-11-14: Ticket opened from the live DSH test report. Confirmed the ordering in `src/core/vector-backfill.ts` (parity check before plan) and the empty-plan branch in `src/core/vector-lane.ts`; a parity-order change alone is insufficient because the plan has no model id.

## Steps

1. `src/core/vector-lane.ts`
   - Add `bootstrapModelId?: string` to `planBackfill` options.
   - Use it only when `measureVectorLane().dominantModelId` is undefined.
   - Enumerate active memories without a row in that space, newest first, bounded by `limit`; keep the existing behavior when no bootstrap id is supplied.
   - Make the empty-active reason truthful.
2. `src/dsh/memory-lane.ts`
   - Extend `resolveSharedSpace()` to return `bootstrapModelId` only for the “no dominant space” outcome, and journal it.
   - Pass `space.bootstrapModelId` into `planBackfill` and `runVectorBackfill`.
   - After `created > 0` on the bootstrap path, clear `sharedSpacePromise` so the next query re-resolves parity.
3. `src/core/vector-backfill.ts`
   - Add `bootstrapModelId?: string`.
   - Keep the early `parity-unproven` abort when neither parity nor bootstrap is available.
   - For the bootstrap path, require `plan.modelId === bootstrapModelId`; log `backfill-bootstrap`.
   - Keep the normal `plan.modelId === parityModelId` check and the existing no-candidate/no-plan behavior.
4. Tests:
   - `tests/vector-lane.spec.ts`: bootstrap plan, no-bootstrap refusal, archived exclusion, empty active corpus.
   - `tests/vector-backfill.spec.ts`: bootstrap write, bootstrap model mismatch, closed gate negative control, normal path regression.
5. Run target tests, `npm run typecheck`, full `npm test`, `npm run build`, and `git diff --check`.
6. Independent Quick review of the diff; fix Critical/Fix.
7. Host gate: isolated DSH profile, fresh own-corpus store with one active memory and zero embeddings; wait for the maintenance tick; verify a vector row under the embedder model id and a semantic-lane journal outcome. Record `blocked` for host evidence if the real model/download cannot be driven; do not substitute unit output for it.
8. Commit, mark built/done, push. No direct `lib/` edit and no npm release unless requested.

## Stop conditions

- If `planBackfill` cannot distinguish “no space” from “dims mismatch” without changing the report contract, add an explicit report field rather than inferring from an empty model id.
- If the host gate requires touching the daily profile or a real credential, stop and report the boundary.
- Do not change the stats `total` display issue in this ticket.
