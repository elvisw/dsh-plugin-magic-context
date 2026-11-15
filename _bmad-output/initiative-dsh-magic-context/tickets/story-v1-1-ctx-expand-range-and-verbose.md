---
id: 12
type: story
title: "V1.1: ctx_expand range and verbose"
parent: initiative-dsh-magic-context
after: [11]
refined: true
hitl: false
risk: high
---

# V1.1: `ctx_expand` range and `verbose`

## Description

Add the two locators deliberately deferred by the signed recovery contract:
inclusive `start`/`end` ranges and a `verbose` range view. The upstream tool
uses message ordinals because its host exposes `<session-history>` message
numbers; DSH does not. This story therefore maps ranges to **DSH log event
seq**, the same identifier already used by the V1 `message` locator, and keeps
the mapping visible in the tool description and docs. A range is a read-only
transcript over raw events, not a second drop-recovery path.

## Decisions (settled in this refinement)

1. **Unit.** `start` and `end` are **decimal strings** holding inclusive DSH
   log event seq values; this matches the existing `message` argument and lets
   the parser reject whitespace/`+1`/`01`/empty input before `Number()`.
   Both are required together. They are non-negative safe integers (`0` is
   valid because DSH seq can be 0), and `start <= end`. They are not upstream
   message ordinals and not tag numbers.
2. **Event scope.** A range covers `user/message`, `assistant/message`, and
   `tool/result` events. Tool calls are rendered from the assistant message's
   `tool-call` blocks (name, callId, raw arguments), not as a second standalone
   `tool/call` entry, so inputs never appear twice. Excluded predicates:
   `system/message`, `developer/message`, `source.kind` equal to
   `magic-context` or `compact-checkpoint`, and content matching
   `^\[compacted §C\d+§\]$`. These excluded events are not rendered at all and
   count as skipped, never as literal transcript. Dropped `[dropped §N§]`
   blocks are rendered literally and are not resolved by range.
   Events are emitted in ascending `seq` order; order is persisted order, not
   surface order.
3. **Read-only.** Range reads never change drop state, never create a pending
   row, never rewrite a surface node, never re-execute a tool, and never call a
   model. A range does **not** require a prior drop; it is a transcript reader.
   `tag` and `message` keep their stricter dropped-item gate.
4. **Non-verbose payload.** One text result:
   - header `Events <start>-<end> (<included> events, <skipped> skipped):`;
   - one section per event: `[<seq>] <type>` plus role/tool/call identity;
   - text content verbatim; tool-call input rendered as compact JSON
     (parse the raw `arguments` string; if parsing fails, show the raw string);
     tool result content rendered as text blocks (non-text blocks named, not
     fabricated);
   - all output is text blocks; never forward an executable `tool-call` block;
   - a continuation line when the 15,000-token budget cuts the range:
     `Truncated at event <last> ... Call again with start=<last+1> end=<end>.`
     If the first included event alone exceeds the budget, include a bounded
     head and mark it `[event truncated]`; the continuation says to use
     tag/message for that event, not `start=<seq+1>` (which would skip the
     unread remainder). The result never exceeds the budget by an unbounded
     event.
5. **Verbose payload.** One entry per event with `seq`, event type, role,
   tool name and callId when present, and a bounded per-part preview (text
   preview, tool input preview, content type); no full body. Preview is 200
   characters per part. The header names the requested seq range and says to
   recover a tag or message in full. Verbose obeys the same 15,000-token
   budget; there is no separate event-count cap. `verbose` must be boolean;
   `verbose` without `start`/`end` is an error. A boolean `verbose` supplied
   with `tag`/`tags`/`message` is ignored (upstream mode behavior), not a
   second locator.
6. **Mutual exclusion and presence.** A range cannot be combined with a
   non-empty `tag`, `tags`, or `message`; any such combination returns
   `pass either tag, tags, message, or start/end, not more than one`.
   Host filler `start="0",end="0"` is treated as absent when a tag/tags/message
   locator is present, regardless of `verbose` (upstream mode behavior); a
   real `{start:"0",end:"0"}` range alone remains a one-event range. Empty
   `tag`/`tags`/`message` strings count as absent when another locator is
   present; an empty `message` alone is still invalid. One bound alone, a
   reversed bound, a non-decimal string, whitespace, `+1`, `01`, or an unsafe
   integer is refused without guessing; bounds are never number-coerced.
7. **Live surface.** Liveness applies only to surface-bearing events
   (`user/message`, `assistant/message`, `tool/result`); tool calls are blocks
   inside assistant messages and have no separate liveness. If every readable
   event in the requested range is still on the current surface, return a
   successful range payload with no event entries and one text block:
   `{ok: true, locator: 'range', events: [], content: [{type: 'text', text:
   'Events <start>-<end> are already on the live surface; no raw history was read.'}]}`.
   Journal it as `ctx_expand: read 0 events (live surface)`, not `restored 0`.
   If any event is shadowed (Historian or compaction), return the raw events;
   the range may therefore contain both shadowed and live events.
8. **Failures and skipped count.** `skipped` counts every in-bounds event that
   is not rendered, including excluded types/source-kinds, standalone
   `tool/call`, `assistant/attempt`, and compaction events. Seq gaps do not
   count. A 1-100 range over a 5-event log does not report 95 skipped. No readable events:
   `no readable events in range <start>-<end>`. Missing/excluded events are
   never fabricated into originals. The V1 failure names for tag/message
   locators are unchanged. A range success payload is
   `{ok: true, locator: 'range', events: [seqs], content}`; a failure is
   `{ok: false, locator: 'range', reason}`. Do not include `restored` or
   `refused` in a range payload, so the client does not render “restored 0”.
9. **New tag lifecycle.** The range result is an ordinary `ctx_expand` tool
   result; the post-execute tagger assigns it a new tag. It can be reduced and
   expanded again under the A-only model. No special casing.
10. **Docs.** Update `README.md`, `README.zh-CN.md`, `PARITY.md`,
    `tickets/recovery-contract.md` (V1.1 decision record), and the tool
    description. State explicitly that these are DSH log event seq values and
    that upstream uses message ordinals.

## Requirements

- `src/dsh/tool-bridge.ts`: extend `ExpandRequest` with a `range` variant;
  parse decimal-string `start`/`end` plus boolean `verbose`; preserve
  `tag`/`tags`/`message` behavior exactly; add range execution using persisted
  events.
- `src/dsh/seams.ts`: extract/export a read-only event projection helper if
  needed (message content, tool-call identity, role, surface membership), or
  keep the helper in `tool-bridge.ts` if it stays local. No second recovery
  gate.
- `tests/ctx-expand-result.spec.ts`: add range/verbose cases; keep the existing
  tag/message and multi-tag alias tests green.
- `tests/client-pure.spec.ts` only if the response shape changes client
  rendering; the range result is still a normal tool result, so do not change
  the client contract without a failing test.
- README/PARITY/contract text as above.

## Acceptance

### Unit / integration

- Inclusive bounds: events at exactly `start` and `end` are included.
- `start="7",end="7"` returns one event; `start > end` refuses; one bound
  alone refuses; negative, fractional, unsafe integer, whitespace, `+1`, `01`,
  and empty string refuse; `"0"` is accepted for both bounds.
- Mixed locators (`tag`/`tags`/`message` + range) refuse; the `"0","0"` filler
  with a tag follows the tag; `verbose` alone refuses; `verbose` with
  tag/message is ignored.
- User, assistant (including tool-call blocks), and tool-result events render
  deterministically; system/developer/`source.kind=magic-context`/
  `compact-checkpoint`/`[compacted §C…§]` events do not appear; a
  `[dropped §N§]` placeholder appears literally.
- A range with no readable events reports the exact failure; skipped count
  counts excluded events, not seq gaps; missing raw events do not fabricate
  content.
- Live-surface-only range reports the live-surface refusal; a range containing
  a shadowed raw event returns raw content.
- Verbose previews are bounded and name each event; there is no 64-event cap;
  non-verbose text preserves raw text/tool identity and never returns an
  executable `tool-call` block.
- An oversized first event is truncated and marked, and the result stays
  within the 15,000-token budget.
- The new result is a normal tool result: it can be reduced, landed, and
  expanded through the existing lifecycle.
- Existing `tag`/`tags`/`message` tests, `npm test`, `npm run typecheck`,
  `npm run check:i18n`, and `npm run build` pass.

### Host gate (real DSH, real model, isolated)

- Fresh isolated profile, not a copied prior root; overlay assertions prove
  `dataDir` and observer `outDir` point into the new root.
- A real Historian publish occurs; the run records actual raw `tool/result`
  seq, placeholder seq, and publish seq from the observer/session log. The
  management pass that published the target row must be complete, and
  `historianInFlight(sessionId)` must be undefined (or a host restart must be
  proven) before the pre-expand snapshot; stop the next pre-step or prove no
  ready compartment remains.
- Host 1 calls `ctx_expand` with `start`/`end` covering the raw event after
  publish; the result contains the raw content and the old placeholder is
  unchanged. Host 2 calls the same range with `verbose:true` and receives
  per-event previews, not full bodies. Each host is a separate process with
  its own pre/post snapshot; the post anchor is the observer's `ctx_expand`
  `tool/result` event, not process exit.
- Post-expand snapshots prove no drop-state change, no new pending row, no
  surface rewrite of the placeholder/covered nodes (whole-surface hashes
  necessarily change because the range result is a new node), no
  compartment/baseline mutation, and no historian/model usage increase in the
  expand window. `ctx_expand` itself is still one tool-call journal row per
  invocation; each successful expansion gets one new tag row — R1 +1, R2 +1,
  R3 +2 — and those are recorded as the expected deltas.
- The tag and message locators remain green in the same build (regression
  only, not a new proof).
- If the host gate cannot be driven, the ticket is `blocked`; unit tests
  cannot substitute.

## Boundaries

- No changes to `ctx_reduce`, `/ctx-flush`, drop landing, emergency reclaim,
  Historian scheduling, compaction, baseline, schema, or retention.
- No upstream message-ordinal emulation and no `<session-history>` parser.
- No general `ctx_search` or arbitrary event browser; only the three event
  families above plus tool-call blocks inside assistant messages.
- No release/tag/publish as part of this ticket.
- No claim that range output is byte-identical to upstream's transcript
  format; the mapping and headers are DSH-specific and documented.

## References

- `tickets/recovery-contract.md` D1/D2/D4/D5.
- Upstream v0.49.55 `packages/plugin/src/tools/ctx-expand/tools.ts` and
  `types.ts` (message-ordinal range; verbose per-message previews).
- `acceptance-windows-dsh-2026-11-14-t3-host/acceptance-report.md` for the
  post-Historian tag/message host pattern.
