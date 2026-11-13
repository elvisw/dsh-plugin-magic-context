---
title: '#13 A: result-return expand'
type: feature
ticket: '2'
created: '2026-11-14'
status: done
baseline_revision: 'f2e1f7a2c317fe60d3a0265a4dceedb476e2637e'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `ctx_expand` currently restores the original content in place and lets the spent tag become liveagain; `ctx_reduce` then acknowledges `Queued` without a landing, which is the #13 defect. The signed contract (T1) chooses A-only: expand returns a new tool result, the old tag stays dropped, and old-tag reduce is a durable no-op.

**Approach:** Resolve a tag to its persisted call identity, read the original `tool/result` event from the session log, and return it as new tool content; add a durable pending/landed state so `ctx_reduce` refuses a spent tag before touching `queueDrop`. Keep `tag` canonical and `tags` as a deprecated multi-tag alias.

## Boundaries & Constraints

**Always:** old placeholder and old event are immutable; only new tool content is added; the adapter's post-execute hook tags the new result; use persisted state rather than a live placeholder; keep the journal `restored`/`refused` shape; no release or version bump.

**Never:** do not implement `message` (T3), `/ctx-flush` (T4), or the retention change (T5); do not change drop scheduling, protected window, thresholds, Historian, `ctx_memory`, or `ctx_search`; do not rewrite the old event; do not re-execute the original tool or summarize it; do not change the tag prefix or allocation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Happy | tag 1 landed; `tag:"1"` | new result begins `§N§ §1§ …`; old `[dropped §1§]` remains | — |
| Old tag again | tag 1 landed; `ctx_reduce drop:"1"` | refused `already dropped`; no new pending row | no throw |
| Pending tag | tag 1 queued; `ctx_reduce drop:"1"` | refused `already queued`; row unchanged | no throw |
| Multi alias | `tags:"1,4"` | payloads joined by `\n\n---\n\n`; one new tag; per-tag refusals | partial success is allowed |
| Active tag | tag 1 never dropped; `tag:"1"` | refused `not dropped` | no payload |
| Restart | same dataDir, new adapter instance | same original from persisted log | no live placeholder needed |
| Missing | unknown tag / non-tool target / cleaned / cross-session | `no such tag` / `not a tool-result tag` / `tag no longer available` / `cross-session tag` | no fabrication |
| No source | tag row exists, original event gone | `raw source unavailable` | no payload |

</frozen-after-approval>

## Code Map

- `src/core/types.ts` — `TagTarget`, `TagRecord`; add a `DropState` union.
- `src/core/stores.ts` — `AdapterStores` at 183-210; `listTags` 815, `queueDrop` 877, `listPendingDrops` 885, `markDropLanded` 890, returned object 1428-1437. Add `dropState()` and `tagSessions()`; do not change the existing `ON CONFLICT` SQL.
- `src/dsh/seams.ts` — `enumerateSurfaceToolResults` 132-168 and `originalContentOfPlaceholder` 206-218. Add `dropTagOfContent()` and `originalContentOfToolCall()`; reuse the existing placeholder citation path.
- `src/dsh/tool-bridge.ts` — imports 22-33, `ackText` 113, `ctx_reduce` 117-181, `ctx_expand` 183-241. Expand gains `tag`/`tags`; reduce checks durable state first; expand returns `ContentBlock[]` through `render`.
- `src/index.ts` — post-execute tagger 361-371. This is the adapter hook that adds the outer tag; do not change it.
- `tests/phase1.spec.ts` — line 105 in-place test; update assertions to old placeholder remains plus new tagged result.
- `tests/tag-state.spec.ts` — new store-level cases for `dropState`/`tagSessions`.
- `tests/ctx-expand-result.spec.ts` — new integration cases for happy path, old-tag no-op, multi alias, active/pending/cleaned failures, restart.
- `tests/ctx-reduce-render.spec.ts` — keep the count/refusal render behavior; no change unless the payload shape forces one.
- `tests/client-pure.spec.ts` — keep the journal `restored`/`refused` shape; no change unless the shape changes.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/types.ts` — add `DropState = 'none' | 'pending' | 'landed'`.
- [x] `src/core/stores.ts` — add `dropState(sessionId, tagNumber)` and `tagSessions(tagNumber)` to `AdapterStores`, implement over `pending_drops`/`tags`, and return them.
- [x] `src/dsh/seams.ts` — export `dropTagOfContent(content)` and `originalContentOfToolCall(session, callId)`; make the latter prefer a non-placeholder event and fall back to the cited source.
- [x] `src/dsh/tool-bridge.ts` — change `ctx_reduce` to check `dropState` before `queueDrop`; change `ctx_expand` to accept `tag` or `tags`, validate the pair, resolve each tag to the persisted call, return `content` for the new result, and use the new refusal names.
- [x] `tests/tag-state.spec.ts` — prove none/pending/landed and cross-session lookup.
- [x] `tests/ctx-expand-result.spec.ts` — prove the I/O matrix rows and the restart case.
- [x] `tests/phase1.spec.ts` — update the existing expand assertion; keep the queue/land discipline assertions.

**Acceptance Criteria:**
- Given a landed tag, when expanded, then the new result carries one outer tag and the original stored content after removing that outer tag; the old placeholder remains.
- Given the same landed tag, when reduced again, then the reply is `already dropped` and no pending row is created.
- Given a pending tag, when reduced again, then the reply is `already queued` and the pending row is unchanged.
- Given `tags` with two tags, when expanded, then both payloads return in order separated by `\n\n---\n\n` and the combined result has one new tag.
- Given an active, cleaned, cross-session, missing-source, or no-session case, when expanded, then the named refusal is returned without fabricated content.
- Given a unit-level restart (same dataDir, new adapter), when expanding the old tag, then the same original returns.

## Implementation Notes

- **Read path.** `originalContentOfToolCall` returns a three-state union: `content` (first full-fidelity `tool/result` for the call, a legacy in-place restore counting as full-fidelity), `missing-event` (the call left the log) or `missing-source` (only placeholders remain and none of their citations resolve). It also reports `droppedTag` when a persisted placeholder exists for the same call.
- **Refusal mapping.** `no such tag` (no per-session row and either the session has tags or no other session owns the number), `cross-session tag` (the number exists only in other sessions **and this session has no tag records at all**), `not a tool-result tag` (user-message target), `not dropped yet` (durable `pending`), `tag no longer available` (`missing-event`), `raw source unavailable` (`missing-source`), `not dropped` (durable `none` and no persisted placeholder). A validation refusal (`tag` + `tags`, neither, a non-single `tag`, an empty `tags`) carries its own reason and no payload.
- **Emergency drops.** The emergency band replaces the node without a `pending_drops` row, so `dropState` stays `none`. Expand treats a persisted placeholder for the call as dropped (`droppedTag`), which keeps those tags recoverable without changing drop scheduling; `ctx_reduce` on such a tag still refuses via the live-placeholder check. `ctx_reduce`-initiated no-op semantics are otherwise purely durable.
- **Landed re-queue.** `queueDrop`'s `ON CONFLICT` branch only refreshes `queued_at` and never clears `landed_event_seq`; a landed tag therefore stays `landed` even if the old SQL runs. The new `dropState` guard above `queueDrop` is what guarantees `already dropped`.
- **Multi-tag alias.** `tags` keeps `parseTagRanges` order (ascending, de-duplicated). Payloads are concatenated as blocks with a `\n\n---\n\n` text block between them, and partial refusals append one text block after the payload. `tag` is canonical and accepts exactly one parsed value.
- **Second-cycle payload.** Per the Design Notes, a re-expanded result carries the stored content verbatim (its earlier outer marker included) with one new outer marker added by the post-execute hook. Story criterion 4's "after removing its own outer marker equals the first result's content after removing its outer marker" is therefore read as "equals the first result's stored content"; the plan's acceptance sentence ("the original stored content after removing that outer tag") is authoritative.
- **Gate map / docs.** `scripts/phase-map.mjs` lists both new specs under phase 0 (the phase-map spec requires every spec to gate a phase). `README.md` / `README.zh-CN.md` now describe result-return expand and the canonical `tag` parameter instead of in-place restore.

## Plan Change Log

- 2026-11-14: implementation added `scripts/phase-map.mjs` mappings and README behavior text, neither of which was in the Code Map. Both are necessary: the phase-map gate fails on an unmapped spec, and both READMEs stated the retired in-place behavior.
- 2026-11-14: review patches also updated `PARITY.md` (reclaim lane moved to intentional deviations; §B2 line/ref premise), the `DropState`/reduce comments, and the phase-0 identity/blind list. Re-ran targeted (37 tests) and full (818 tests) suites; typecheck clean.

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Multi-tag alias returns ascending order, not request order | medium | patch | `parseTagRanges` sorts; `expandRequest` uses it; story/comment say request order. Fix: preserve input order for expand only. |
| `PARITY.md:34-38` still describes in-place restore | medium | patch | The paragraph names the retired behavior and cites the old seam; contract D1 is A-only. |
| `src/index.ts:27` / `pre-step.ts:148-153` comments still say surface restore | low | patch | Comments contradict the new read path; behavior is correct. |
| `cross-session tag` over-reports for any number present in another session | medium | patch | Bare tag numbers are per-session counters; restrict cross-session to a session with no tag records, so a typo in a normal session returns `no such tag`. |
| Restart test reuses one in-memory session, not a log replay | low | patch | Seed a second `Session` from `snapshotEvents()` so `originalContentOfToolCall` is exercised on a replayed log. |
| `tag-state` test title says re-queue reopens as pending | low | patch | The assertion proves the opposite (`landed` stays `landed`). |
| Phase 1 integration still uses deprecated `tags` | low | patch | Switch the host-level call to canonical `tag`; the unit tests cover the alias. |
| `not dropped` guard relies on the placeholder-shape invariant | low | patch | Add the invariant comment; code is correct under the current post-execute hook. |
| Second review: `PARITY.md` §B2 line/ref premise stale | medium | patch | Update the user-message dead-handle rationale and cite the tool-level `not a tool-result tag` refusal. |
| Second review: diff is older than the workspace | low | false | The review diff was a snapshot taken before the last doc edits; regenerate it before the next pass. No code defect. |
| Second review: `DropState` comment ties landed to a live placeholder | low | patch | The durable row is the definition; comments now say so. |
| Second review: `ctx_reduce` comment claims a queue-order reset that the SQL does not do | low | patch | The guard is explicit refusal, not queue-order protection; comment corrected. |
| Second review: Phase 0 identity excludes the new #13 A specs | medium | patch | Phase 0 is now the core regression suite including the recovery lane; blind list names the host-level gap. |
| Second review: contract/story still state unconditional cross-session | medium | patch | D5 and story criterion 7 now state the `records.size === 0` condition. |

## Design Notes

The new result is the original stored `tool/result` content, including its old `§1§ ` marker; the adapter's post-execute hook adds `§N§ ` outside it. That keeps the old content byte-identical after removing one outer marker and avoids a second storage format. Multi-tag `tags` is explicitly a compatibility path, not the canonical shape.

## Verification

**Commands:**
- `npm test -- tests/tag-state.spec.ts tests/ctx-expand-result.spec.ts tests/phase1.spec.ts` — expected: all pass.
- `npm run typecheck` — expected: no errors.
- `npm test` — expected: full suite passes.

**Results (2026-11-14):** targeted specs 4 files / 37 tests pass; `npm run typecheck` clean; full suite 76 files / 818 tests pass; `npm run check:i18n` ALL PASS. Review patches: request-order alias, conservative cross-session refusal, replayed-session restart test, canonical `tag` in the host test, phase-map identity, and stale docs/comments.

**Host acceptance (2026-11-14):** passed in an isolated DSH `0.2.2-rc.1` profile with the real `deepseek-flash` model. `ctx_expand` returned a new tool result, the old `[dropped §1§]` stayed on the surface, old-tag reduce returned `already dropped`, the new tag reduced/expanded, and a restart after changing the fixture nonce restored the old original. Report: `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-14-t2-host/acceptance-report.md`.
