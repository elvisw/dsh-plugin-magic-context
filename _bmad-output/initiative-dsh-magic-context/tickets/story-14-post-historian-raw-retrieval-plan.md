---
title: '#14: post-Historian raw retrieval'
type: feature
ticket: '3'
created: '2026-11-14'
status: in-progress
baseline_revision: '3efa8da8f24ea258d007b0a3b21fa4c77c9a9315'
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

**Problem:** T2 lets `ctx_expand` read a dropped tool result by its persisted tag, but it has no fallback locator and no host-level proof that the same read survives a real Historian publish. T3 adds `message` as a persisted DSH log-event-seq fallback and proves both the tag and message paths after a real compartment.

**Approach:** Add an optional `message` locator to `ctx_expand`. Resolve the seq to a persisted `tool/result` event in the current session, reuse the T2 call-identity read path, apply the same drop gate, and return the original as new tool content. Do not add a second storage path or change drop state.

## Boundaries & Constraints

**Always:** reuse T2's persisted tag → call identity → `tool/result` read path; `message` only reads an already dropped item; keep the published compartment and old placeholder immutable; only a new tool result is added; keep journal `restored`/`refused` shape; keep `tag` canonical and `tags` the deprecated alias.

**Never:** do not implement `start`/`end`/`verbose` (V1.1), `/ctx-flush` (T4), or retention (T5); do not change production Historian selection/thresholds/summarization/publish schedule; do not recompact, rewrite a compartment, edit the injected summary, or delete/supersede a compartment; do not change tag numbering/prefix/tagger; do not add a storage schema or duplicate raw-content table; do not make `message` a cross-session or general-history lookup; do not re-execute the original tool or use summary text as a substitute.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Post-Historian tag | tag `1` landed; placeholder covered by a real compartment; `tag:"1"` | original as new result; old tag stays spent | no rewrite of compartment/placeholder |
| Message = original event | `message:"20"` points at the original `tool/result`; tag row landed | original as new result | — |
| Message = placeholder | `message:"31"` points at the landed `[dropped §1§]` | original as new result | — |
| Active tag | tag row exists, drop state `none`, no placeholder; `message:"20"` | refused `not dropped` | no payload |
| Pending tag | drop state `pending`; `message:"20"` | refused `not dropped yet` | no payload |
| Emergency drop | tag row exists, drop state `none`, placeholder exists; `message:"20"` | original as new result (call-level placeholder evidence) | no pending row required |
| Unknown seq | no event with that log seq | refused `no such message` | no population |
| Non-tool result | user message or `[compacted §C1§]`; `message:"61"` | refused `not a tool-result message` | no source guess |
| Untagged call | tool result with no tag row and no placeholder tag evidence | refused `not a tool-result tag` | no population |
| Deleted tag | call has a placeholder tag, but its tag row is gone | refused `tag no longer available` | no recovery from a stale placeholder |
| Missing source | tag row exists; only placeholders remain and none cite an original | refused `raw source unavailable` | no summary substitution |
| Locator conflict | `tag` + `message`, `tags` + `message`, or none | refused with a diagnostic; no read | no payload |
| Invalid seq | `-1`, `1,2`, `1-2`, `" 1"`, `"1 "`, `"01"`, `"+1"`, `""`, `abc`, unsafe integer; `0` is valid when the log has seq 0 | refused with a diagnostic except valid seq 0 | no read |
| Restart | same session log replayed with `Session.create(id, snapshotEvents())`; `message:"20"` | same original | no live placeholder needed |
| No such seq | current session log has no event with that seq (including a seq only another session has) | refused `no such message` in the current session | never read other sessions |

</frozen-after-approval>

## Code Map

- `src/dsh/tool-bridge.ts` — `expandRequest` 120-139; `defineCtxExpandTool` 235-348. Add `message?: string` to the args, a strict parser, locator exclusivity, and a message resolver that applies the same drop gate and calls `originalContentOfToolCall`.
- `src/dsh/seams.ts` — `dropTagOfContent` 131-137; `originalContentOfToolCall` 257-287. Add `toolResultAt(session, seq)` returning a discriminated union: `{ kind: 'tool-result'; seq; callId }` / `{ kind: 'not-tool-result'; seq }` / `{ kind: 'unknown' }`. It resolves identity only; call-level placeholder evidence comes from `originalContentOfToolCall(...).droppedTag`, not from the event shape. Do not duplicate the content read.
- `src/core/stores.ts` — `pruneTags` 1563 makes the deleted-tag fixture without a new store API.
- `src/dsh/pre-step.ts` / `src/index.ts` — no change expected; the post-execute tagger still tags the new expand result.
- `tests/ctx-expand-result.spec.ts` — extend `ExpandArgs` with `message`; add message happy paths, active/pending, unknown/non-tool/compacted, untagged, deleted tag, missing source, invalid seq, locator conflict, restart, and post-Historian regression.
- `tests/tag-state.spec.ts` — no change unless the call-level helper needs a store fixture.
- `README.md`, `README.zh-CN.md`, `PARITY.md` — document `message` as a DSH log event seq fallback, not the original Magic Context message number, and state the raw-source boundary.
- `scripts/phase-map.mjs` — no new spec expected; if a new spec file is added, map it to Phase 0 and update the blind list.

## Tasks & Acceptance

**Execution:**
- [ ] Add `message?: string` to `ctx_expand` args, the tool description, and the `message` parameter description.
- [ ] Implement strict `/^(?:0|[1-9]\d*)$/` parsing plus `Number.isSafeInteger`; accept seq `0` (DSH logs can start at 0), reject non-string, `"01"`, `"+1"`, whitespace, empty alone, comma/range, negative, and unsafe integers. Treat `tag: ""`/`tags: ""` as absent, and an empty `message` as absent only when a non-empty `tag`/`tags` is present.
- [ ] Add `toolResultAt` as a discriminated union (`tool-result` / `not-tool-result` / `unknown`); do not use `undefined` for both.
- [ ] Extract the post-`getTag` call-level gate into a shared helper used by tag and message; call-level placeholder evidence comes from `originalContentOfToolCall(...).droppedTag`.
- [ ] Implement message as single-value, all-or-nothing: success `{ok:true, restored:[tag], refused:[], content}`; failure `{ok:false, restored:[], refused:[], reason}`; journal keeps `restored:[tag]` and records `message: seq`; never invent a tag in `refused`.
- [ ] Map rejection in this order: `no-session` → locator validation/parse → `unknown` seq → non-tool → call-level `getTag` gap (`tag no longer available` if placeholder evidence, else `not a tool-result tag`) → pending → `missing-event` (defensive; message path is unreachable) → `not dropped` → `missing-source` → success.
- [ ] Extend tests for all I/O matrix rows, including emergency-drop message, simulated publish with both original and placeholder seq, `pruneTags` removed-tag-row, invalid seq, locator conflict, restart, and the tag regression; on every message success assert `dropState` is unchanged and `listPendingDrops` gains no row (emergency stays `none`, landed stays `landed`). Update the existing `pass either tag or tags` / `no tag given` assertions intentionally.
- [ ] Add a `client-pure` assertion for a message success (`restored` count) and, if the host-loop fixture supports it, a `phase1` message call; otherwise record that host-loop coverage is only in the T3 acceptance window.
- [ ] Update README, README.zh-CN, PARITY, and `scripts/phase-map.mjs`'s Phase 0 blind list. Write tag primary, message fallback, `[compacted §C…§]` not accepted, and no recovery promise when the raw event is gone; no i18n dictionary change expected.
- [ ] Run targeted tests, full tests, typecheck, and i18n check.

**Rejection order (authoritative):** `no-session` → locator validation → invalid message → `unknown` seq → `not-tool-result` → missing tag row (`tag no longer available` if call-level placeholder evidence, else `not a tool-result tag`) → `pending` (`not dropped yet`) → `missing-event` → `not dropped` (state `none`, no placeholder) → `missing-source` (`raw source unavailable`) → success.

**Acceptance Criteria:**
- Unit/integration: given a landed tag whose placeholder was covered by a simulated publish, when expanded by `tag`, then the original returns as a new result and the placeholder/tag state is unchanged. Real-Historian proof is the separate host gate.
- Given the original `tool/result` seq or the landed placeholder seq, when expanded by `message`, then the original returns through the same drop gate; active/pending are refused.
- Given an unknown seq, non-tool/compacted node, untagged call, deleted tag row, or missing source, then the named refusal appears with no fabricated content.
- Given invalid message syntax or mixed locators, then the call is refused before reading.
- Given a replayed session log, then the same message seq resolves the same original.
- Given a successful message expand, then `restored` has exactly one tag and `refused` is empty; on failure, `restored`/`refused` are empty and `reason` names the failure.
- Given a successful message expand, then the target tag's `dropState` is unchanged and no pending row is added.

## Implementation Notes

- **Message is a locator, not a second mode.** Resolve `message` to its `toolCallId`, then let the existing tag/drop logic decide whether the call is dropped and which tag owns it. Extract the post-`getTag` call-level gate into a shared helper used by tag and message; the tag path must remain behaviorally identical (existing tests are the regression gate).
- **Call-level deleted-tag rule.** A message may point at the original event while the same call also has a placeholder. If `originalContentOfToolCall` reports `droppedTag` but `stores.getTag` has no row, return `tag no longer available`; if there is neither a tag row nor `droppedTag`, return `not a tool-result tag`.
- **Return shape.** `message` is single-value and all-or-nothing: success `{ok:true, restored:[tag], refused:[], content}`; failure `{ok:false, restored:[], refused:[], reason}`. Never put a fake `tag` in `refused`. Journal keeps `restored:[tag]` and adds `message: seq`.
- **Rejection order.** Use the authoritative order in Tasks; `missing-event` is defensive and maps to `tag no longer available` on the message path (it should be unreachable after a successful event lookup).
- **Compacted nodes.** `[compacted §C1§]` is not a `tool/result`; reject it as `not a tool-result message`. The original `tool/result` seq is the supported handle.
- **Seq source.** The model normally sees only tags; `message` comes from harness/UI/journal. The tool-level description and the `message` parameter description must say this, and must say `[compacted §C…§]` is not accepted.
- **No behavioral change for the tag path unless proven.** The shared-gate extraction required above is behavior-preserving and required; if the post-Historian tag regression fails, fix only the proven gap and do not add a second read path.
- **Host gate is separate.** T3 code/unit acceptance is this plan; the real-Historian proof is a separate acceptance window under the same ticket and is required before `done`. Unit tests simulate publish; they do not claim a real compartment.

## Plan Change Log

- 2026-11-14: initial plan after ticket sign-off.
- 2026-11-14: pre-implementation review fixes — discriminated seq lookup, call-level placeholder evidence, all-or-nothing message payload/journal shape, authoritative rejection order, safe-integer parsing, existing assertion updates, emergency/post-publish/deleted-tag tests, host seq/in-flight evidence, docs/description requirements.
- 2026-11-14: host-design review fixes — split E1/E2 into independent hosts, settle host + empty-unlanded precondition, target compartment from publish `sourceEventSeqs`, observer `events` parsing, scoped Historian usage evidence, build identity for both lib files, overlay path assertions, actual tag/seq injection, windowed `tool/call` checks.

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| `toolResultEventAt` cannot distinguish unknown from non-tool | high | patch | Plan now uses a discriminated union `tool-result` / `not-tool-result` / `unknown`. |
| Placeholder evidence described at event level, not call level | high | patch | Plan uses `originalContentOfToolCall(...).droppedTag`; no content duplicate. |
| Message success/failure and journal shape undefined | high | patch | Plan fixes all-or-nothing payload and `{message: seq}` journal field. |
| Rejection priority overlaps | high | patch | Plan records the authoritative order and the missing-source/deleted-tag split. |
| Host seq/in-flight observation not executable | high | patch | Plan extracts seq from observer/session log, uses in-process or proven restart, and adds publish-block fallback. |
| Unsafe integer can throw in `SessionSeq` | high | patch | Plan adds `Number.isSafeInteger` after regex. |
| Existing `tag`+`tags` / `no tag` assertions would go red | medium | patch | Plan explicitly updates them; tag+tags text stays, no-locator keeps the substring. |
| Message presence/empty rules missing | medium | patch | Plan defines `message !== undefined` as provided, no trim, non-string invalid. |
| Emergency/post-publish/deleted-tag message cases missing | medium | patch | Plan adds all three, using `pruneTags` for the deleted row. |
| Cross-session expectation was wrong | medium | patch | Plan changes it to “current session has no such seq”. |
| Shared gate extraction not located | medium | patch | Plan requires the post-`getTag` gate helper shared by tag/message. |
| Message `missing-event` mapping missing | medium | patch | Plan maps it defensively to `tag no longer available`. |
| Tool description/docs requirements incomplete | medium | patch | Plan adds compacted-node rejection, tag-primary/message-fallback, no-recovery promise. |
| Host evidence checklist incomplete | medium | patch | Plan lists accelerated params, pruner, callId/no-new-result, journal/compartment/usage, fields, blocked. |
| Unit claimed real Historian | medium | patch | Plan separates simulated-publish unit acceptance from the real-Historian host gate. |
| Disabling Historian does not stop `publishCompartments` | high | patch | Plan requires a settle host and zero unlanded compartments before E1/E2. |
| Two expands in one host pollute the first post snapshot | high | patch | Plan splits E1 (tag) and E2 (message) into independent hosts with pre/post each. |
| Target C1/`covered_seqs` assumption too narrow | high | patch | Plan locates the publish event by `sourceEventSeqs` containing the placeholder and requires its `pass` row. |
| Observer `surface` loses shadowed seqs | high | patch | Plan parses `events` and records file/line plus event JSON hashes. |
| “Usage does not increase” is impossible with model steps | high | patch | Ticket/plan scope the assertion to Historian usage/journal; agent usage is recorded separately. |
| Build identity checked only `tool-bridge.js` | medium | patch | Plan hashes both tool-bridge and seams and asserts the new symbols. |
| Overlay path rewrite can silently reuse the old root | medium | patch | Plan requires both separators, old-root assertion, `--dump-config`, and boot `dbPath`. |
| Hardcoded tag 1 is unsafe | medium | patch | Plan extracts the actual tag and seq and injects them into prompts. |

## Verification

**Commands:**
- `npm test -- tests/ctx-expand-result.spec.ts tests/tag-state.spec.ts` — expected: all pass.
- `npm test` — expected: full suite pass.
- `npm run typecheck` — expected: clean.
- `npm run check:i18n` — expected: ALL PASS.
- `git diff --check` — expected: clean.

**Host acceptance (separate window):**
- **Build identity:** record `git rev-parse HEAD`, the T3 tarball SHA, and both built/installed `lib/dsh/tool-bridge.js` and `lib/dsh/seams.js` hashes; fail if either differs. Assert the installed lib exposes the `message` parameter and `toolResultAt`.
- **Isolation:** fresh root, copied profile, `dataDir`/`outDir`/driver paths rewritten in both `\` and `/` forms; assert no old root string remains; verify `--dump-config` and the boot `dbPath` in `activity.log`.
- **Seed:** real DSH + real model + real Historian (`historianEnabled:true`, low `historianMinNodes`, `executeThreshold:0`, host `tool-result-pruner` disabled); extract the **actual** read tag from the driver/observer, never hardcode tag 1. Drop that tag and read the historian fixture.
- **Wait/settle:** run bounded wait hosts until the target publish appears; then a settle host with Historian off but `publishCompartments` still active, so any prior draft is published and orphaned in-flight runs get terminal rows. Do not use a fixed “two waits” as proof.
- **Target:** find exactly one `user/message` publish event whose `[compacted §C<k>§]` `sourceEventSeqs` contains the placeholder seq; map it to `compartment_id=k`; require a `pass` journal row with `data.published` containing that id and `landed_event_seq` equal to the publish event seq. Do not rely on `covered_seqs` alone or hardcode C1.
- **Precondition:** after settle/restart, query the plugin DB for the session: `compartments` rows with `landed_event_seq IS NULL AND superseded=0 AND landed_reason IS NULL` must be **0**, and the target row must be landed. Record the query and result. This is what makes a subsequent `publishCompartments` a no-op; disabling Historian alone is not enough.
- **Seq extraction:** parse the observer `events` array (not `surface`); record `seq`, `type`, `data.message.toolCallId`, content, `sourceEventSeqs`, and the source file/line for the original result, placeholder, and publish event. Hash each event JSON across snapshots to prove it was not rewritten.
- **E1/E2:** split into two independent host runs, each resuming once: E1 calls only `ctx_expand {tag:"<actual>"}`, E2 calls only `ctx_expand {message:"<original seq>"}`. Each run has its own pre/post snapshots; the post snapshot is anchored to the observer’s `ctx_expand` `tool/result` event, before any next pre-step. Assert the driver input has exactly one locator and no `tag`/`tags` in E2.
- **Evidence:** both E1/E2 return the original; target `compartments` row fields (`tier_p1..p4`, `facts`, `events`, `importance`, covered fields, `baseline_epoch`, `landed_event_seq`, `landed_reason`, `superseded`) are unchanged; no new `compartment-published` event; no new `historian` journal rows; no Historian usage increase (agent model-step usage is recorded separately and attributed to the agent); original `callId` has one `tool/call` and no new `tool/result` inside each pre/post window; fixture nonce/SHA and returned-content-vs-original-event SHA match; old tag stays `landed` and no pending row appears.
- **Parameters:** record context window, `executeThreshold`, `ttlMs`, `forceThreshold`, `historianMinNodes`, `historianMinBudgetTokens`, `historianTimeoutMs`, `registerCompactionEngine`, `maintenance.enabled`, memory switches, permission/approval mode, driver waits, and the disabled host `tool-result-pruner`.
- Any missing evidence (target publish, pass row, empty unlanded set, tag/message host result): `blocked`, with the reason in the ticket and report.
