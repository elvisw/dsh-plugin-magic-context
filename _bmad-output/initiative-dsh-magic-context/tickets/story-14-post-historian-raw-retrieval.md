---
id: 3
type: story
title: "#14: post-Historian raw retrieval"
parent: initiative-dsh-magic-context
after: [2]
refined: true
hitl: false
risk: high
---

# #14: post-Historian raw retrieval

## Description

Makes a previously dropped tool result readable through `ctx_expand` after a real Historian compartment has covered and removed the drop placeholder from the live surface, without undoing the compartment, rewriting the published summary, or re-running the tool. Keeps `tag` as the primary locator and adds `message` as a persisted DSH log-event-seq fallback for the same dropped item.

## Requirements

Verify: In a fresh session, drop a small tool result, let a real Historian publish a compartment that covers its placeholder, then `ctx_expand` both the old tag and the original `tool/result` event seq; the original content comes back as a new result each time, the published compartment row is unchanged, the old tag stays spent, and no missing raw source is replaced by summary text.

1. **Post-Historian tag retrieval is a regression gate, not a new tag implementation** (contract D2, E5)
   **Given** a fresh session has a tagged tool result, its `[dropped §N§]` placeholder has landed, and a real Historian publish replaces the containing surface range with `[compacted §C1§]`
   **When** `ctx_expand` is called with `tag: "N"`
   **Then** the original stored tool result is returned as a new tool result
   **And** the tag read path is unchanged from T2 (`tag` → persisted target → `originalContentOfToolCall`); this requirement is a regression proof, not a second implementation
   **And** if the existing path fails post-Historian, the fix is limited to the proven gap and recorded in the plan.

2. **Message locator reuses the same dropped-item gate** (contract D1, D2.6, D4/Q2)
   **Given** the current session log contains a `tool/result` event with DSH log seq `N`, and its persisted tag is `landed` (or its placeholder is the emergency-drop record)
   **When** `ctx_expand` is called with `message: "N"`
   **Then** it resolves the event's `toolCallId` to its persisted tag, reuses the T2 call-identity read path, and returns the original content as a new result
   **And** it works whether `N` is the original tool result or the landed `[dropped §N§]` placeholder; the same `N` after restart of the same session resolves the same content
   **And** it does not change the drop state, add a pending drop, or read another session.

3. **Message applies only to previously dropped content**
   **Given** `message` resolves to a tagged tool result whose drop state is `none` and which has no placeholder
   **When** `ctx_expand` is called
   **Then** it is refused as `not dropped`, consistent with the tag path
   **And** a `pending` drop is refused as `not dropped yet`
   **And** if the event's call has a persisted placeholder tag number (even when `message` points at the original `tool/result`) and the tag registry row is gone, it is refused as `tag no longer available`
   **And** if the call has neither a tag registry row nor any persisted placeholder tag evidence, it is refused as `not a tool-result tag`.

4. **Message is the DSH log event seq, including shadowed events**
   **Given** the caller supplies `message`
   **When** the argument is parsed
   **Then** only a non-negative decimal integer string matching `/^(?:0|[1-9]\d*)$/` is accepted (DSH log seq can be 0); negatives, comma lists, ranges, surrounding whitespace, `01`, `+1`, non-numeric values, and unsafe integers are refused with a diagnostic; an empty `message` alone is refused, while an empty `message` alongside a non-empty `tag`/`tags` is treated as absent (the tag path proceeds)
   **And** docs state explicitly that `message` is the DSH log event seq, not the original `cortexkit/magic-context` message number
   **And** docs state that it may name a shadowed event (for example the original `tool/result` after Historian), but the `[compacted §C1§]` node itself is not a `tool/result` and must not be passed
   **And** docs state the seq is supplied by the harness/UI/journal; the model normally sees only tags.

5. **Locator exclusivity**
   **Given** `tag`, `tags`, and `message` are locator parameters
   **When** more than one locator is supplied, or none is supplied
   **Then** the call is refused with a diagnostic before any read
   **And** `tag` remains single-value, `tags` remains the deprecated multi-tag alias, and `message` is never combined with either.

6. **Message failure paths** (contract D5, E6)
   **Given** an unknown seq, an event that is not a `tool/result`, a not-dropped or pending item, a deleted tag, a missing source, or no session
   **When** `ctx_expand` is called with `message`
   **Then** the refusal names are `no such message`, `not a tool-result message`, `not dropped`, `not dropped yet`, `tag no longer available`, `raw source unavailable`, or `no-session` respectively
   **And** the untagged-tool-result case is resolved at the call level: if `originalContentOfToolCall` reports a placeholder tag (even when `message` points at the original event) and `stores.getTag(sessionId, { kind: 'tool-result', callId })` is undefined, the refusal is `tag no longer available`; if there is neither a registry row nor call-level placeholder tag evidence, it is `not a tool-result tag`
   **And** a compartment `[compacted §C1§]` node is `not a tool-result message`; the implementation must not guess which source event the caller meant
   **And** no summary text, model generation, or re-executed tool is used as a substitute for missing raw content.

7. **Tag behavior is not regressed**
   **Given** an active tag, a pending tag, a landed tag, a tag with no live placeholder, and a tag whose original event is missing
   **When** `ctx_expand` and `ctx_reduce` are called
   **Then** the existing T2 results hold: active is `not dropped`, pending is `not dropped yet`, landed/placeholder-absent reads the original, missing original is `tag no longer available` or `raw source unavailable`, and a second reduce is `already dropped`
   **And** the existing `tags` comma alias still preserves request order and returns partial results per tag.

8. **Tests and host gate**
   **Given** the implementation and the T3 acceptance harness
   **When** the test suite and host acceptance run
   **Then** unit/integration tests cover message parsing, original-event and placeholder-event resolution, non-tool/compacted-node rejection, untagged/not-dropped/pending refusals, a message targeting the original event when the same call has a placeholder but its tag row was deleted (`tag no longer available`), missing source, exclusivity, restart stability (using `Session.create(id, snapshotEvents())` to replay shadowed events), unchanged drop state, and the T2 tag regressions
   **And** the host gate uses an isolated DSH test profile and a real model + real Historian: it proves E5 for both the old tag and the original `tool/result` message seq, and captures the published compartment row before and after
   **And** after the target compartment row is published, the gate first waits for the **management pass that published it** to complete—observed via the pass journal row or by awaiting `managementPass`’s return, not merely by polling the `compartments` table. Only then does it wait until `historianInFlight(sessionId)` is undefined, proving that every Historian run for the session—including a run joined by this pass or started by an earlier pass—has settled; a proven host-process restart that clears the in-memory in-flight map is an acceptable alternative if the reloaded session and post-restart state are recorded. Rows those runs write are recorded as pre-expand, not as T3 mutations; if the gate cannot prove pass completion and settlement within its timeout, it is `blocked`
   **And** before the pre-expand snapshot, the gate stops the next pre-step/model request; if that cannot be stopped, it must block publish and prove no ready compartment is publishable. Disabling Historian alone is insufficient because `publishCompartments` does not depend on the Historian run
   **And** the post-expand snapshot is taken immediately after the `ctx_expand` result and before any next pre-step, so no publish can race the comparison
   **And** the host gate records the accelerated test parameters (context window, `executeThreshold`, Historian thresholds, driver waits, and the disabled host `tool-result-pruner`); no production Historian selection, threshold, or publish schedule is changed
   **And** between the pre-expand and post-expand snapshots it records: original `callId` has exactly one `tool/call` event and no new `tool/result` for that call, the fixture nonce/SHA is unchanged, no new `historian` or `compartment-published` journal rows appear, and Historian usage does not increase. Agent model-step usage is recorded separately and is not attributed to the Historian
   **And** if either the tag or the message host evidence is missing, the ticket is `blocked`, with the reason written to the ticket and report; unit evidence cannot substitute.

9. **Summary invariant is falsifiable**
   **Given** the management pass that published `C1` has completed, the pre-expand snapshot contains `C1`, `historianInFlight(sessionId)` is undefined, and the next pre-step is stopped or publish is blocked
   **When** `ctx_expand` returns the original
   **Then** the `compartments` row for `C1` is unchanged in `tier_p1..p4`, `facts`, `events`, `importance`, `covered_start_seq`, `covered_end_seq`, `covered_seqs`, `covered_tokens`, `baseline_epoch`, `landed_event_seq`, `landed_reason`, and `superseded`
   **And** between the pre-expand and post-expand snapshots, no new compartment row and no new `compartment-published` event appears
   **And** a normal later pass re-rendering the baseline is recorded separately and is not counted as a summary rewrite or as a violation of this invariant.

10. **Contract and documentation alignment**
    **Given** D2 already says the tag read path is reused and D5 lists tag failure names
    **When** `message` is added
    **Then** `recovery-contract.md` records a dated T3 clarification: `message` is a DSH log event seq (including shadowed events), it is an alternate locator for a previously dropped item, it uses the same drop gate and read path, and its message-specific refusal names are added without changing the signed D1/D2 semantics
    **And** the D2.3 summary invariant is defined at the compartment-row level, not as “all baseline bytes”
    **And** `README.md`, `README.zh-CN.md`, and `PARITY.md` all describe tag as primary, message as fallback, and neither promising recovery when the raw event is gone
    **And** the `ctx_expand` tool description names `message` as a DSH log event seq for an already dropped item, says `[compacted §C…§]` nodes are not accepted, and states that the seq comes from the harness/UI/journal.

## Constraints

- Follow contract D1/D2/D4/D5/D6; no return to in-place restore and no fork-UX compatibility promise.
- The published compartment and the old placeholder are immutable; only a new tool result is added.
- Reuse the T2 persisted tag → call identity → `tool/result` read path; do not add a second storage copy of the original.
- `message` is not a general history browser: it only reads a previously dropped item, exactly like `tag`.
- No release, version bump, or publishing in this ticket.

## Boundaries

- Must not implement `start`/`end`/`verbose` (V1.1).
- Must not implement `/ctx-flush` (T4) or the retention change (T5).
- Must not change production Historian selection, chunking, thresholds, summarization, or publish scheduling. Test-profile acceleration is allowed only inside the isolated acceptance window and must be disclosed; the product defaults stay unchanged.
- Must not recompact, rewrite a compartment, edit the injected summary, or delete/supersede a compartment.
- Must not change tag numbering, tag prefix format, or the post-execute tagger.
- Must not make `message` a cross-session lookup; a message seq belongs to the current session.
- Must not add a new storage schema or a duplicate raw-content table.
- Emergency-band drops remain out of scope for the durable `pending_drops` state assertion (same as T2); the tag path may still read one through its persisted placeholder record (live or shadowed), and T3 must not claim durable state for it.

## References

- parent — `_bmad-output/initiative-dsh-magic-context/initiative-dsh-magic-context.md`
- contract — `_bmad-output/initiative-dsh-magic-context/tickets/recovery-contract.md`, sections D1, D2, D4, D5, D6 (E5, E6)
- issue — `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-09/issue-historian-recovery.md`
- T2 report — `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-14-t2-host/acceptance-report.md`
- T0-B baseline — `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-13/acceptance-report.md`, section 4.4
- research — `_bmad-output/initiative-dsh-magic-context/research-context-lifecycle/research-context-lifecycle.md`, sections 2 and 4
- claims — `_bmad-output/initiative-dsh-magic-context/research-context-lifecycle/claims-mc.md`, ref 8
- verifier — `_bmad-output/initiative-dsh-magic-context/research-context-lifecycle/digests/verifier-mc.md`, ref 8

## Notes

- Decision: 2026-11-14 — T3 starts from T2’s result-return path; `tag` is primary and `message` is an explicit fallback for the same dropped item, not a second recovery mode and not a general history reader.
- Implementation note: the tag path already resolves tag → call identity and scans the persisted event log; T3 must prove it across a real Historian publish, not only the pre-Historian case. Requirement 1 should normally produce no product-code change.
- Implementation note: `message` resolves a persisted event seq in the current session, then reuses the call-identity read path. A `[compacted §C1§]` node is not a tool result and must be rejected; the original `tool/result` seq is the supported handle.
- Implementation note: the T0-B Historian run observed a fresh-session drop, a published compartment, and the original event still present in the raw log. T0-B’s plugin DB, `activity.log`, and observer directory are no longer pristine (T2 report section 5); do not reuse that root. Use a fresh isolated root with the T2 harness’s `dataDir`/`outDir` assertions.
- Host gate may be recorded as its own acceptance window/report under this ticket; that is not a separate product ticket.
- Risk check beyond criteria: a fresh reviewer checks tag still works post-Historian, message uses the original log seq rather than the compartment seq, the compartment row is field-identical before and after, no second publish or summary model call occurs, and no original tool call is re-executed.
