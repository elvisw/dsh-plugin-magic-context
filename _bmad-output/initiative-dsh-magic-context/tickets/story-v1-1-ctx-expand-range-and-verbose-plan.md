---
ticket: 12
title: "V1.1: ctx_expand range and verbose — plan"
status: built
---

# Plan — V1.1 `ctx_expand` range and `verbose`

Ticket: 12
Story: `tickets/story-v1-1-ctx-expand-range-and-verbose.md`
Status: implementation plan (ticket must pass independent validation first)

## 1. Scope lock

Implement only the story’s decisions:

- `start`/`end`: inclusive DSH log event seq, both required, non-negative safe
  integers, `start <= end`.
- Event families: `user/message`, `assistant/message`, `tool/result`; tool
  calls are blocks inside assistant messages, not standalone entries.
- `verbose`: preview view; only meaningful with `start`/`end`.
- Range is read-only and does not require a prior drop.
- No changes to `ctx_reduce`, flush, landing, Historian, schema, retention.

The upstream v0.49.55 sources are the semantic reference for range/verbose
shape, not a literal port: upstream `start`/`end` are message ordinals; DSH
does not expose those, so the adapter uses event seq as already decided for
`message`.

## 2. Tool surface

### 2.1 Types

In `src/dsh/tool-bridge.ts`:

```ts
type ExpandRequest =
  | { kind: 'tags'; tags: readonly number[] }
  | { kind: 'message'; message: number }
  | { kind: 'range'; start: number; end: number; verbose: boolean }
  // parsed from decimal strings; the numeric fields are the validated seq values
  | { kind: 'reason'; reason: string } // existing shape may stay inline
```

Use a discriminated error variant only if it keeps `expandRequest` readable;
the existing `{ reason: string }` is acceptable.

`defineCtxExpandTool` generic gains:

```ts
start?: string
end?: string
verbose?: boolean
```

Parameters schema adds `start`/`end` as `string` (decimal digits) and
`verbose` as `boolean`. This mirrors `message` and lets the parser reject
whitespace/`+1`/`01`/empty input with an exact error before `Number()`.
`tag`/`tags`/`message` remain strings.

### 2.2 Parsing rules

Add a range parser beside the existing tag/message parser. The precedence must
be deterministic:

1. **Normalize.** `tag`/`tags` are trimmed; empty means absent. `message` is
   absent when it is `""`; `" 1"`/`"01"`/etc. are invalid, not trimmed.
   `start`/`end` are strings; empty means absent; a non-string is invalid.
2. **Bounds presence.** If exactly one of `start`/`end` is non-empty:
   return `pass both start and end (DSH log event seq, inclusive)`.
   This applies even when a tag/message is present.
3. **Filler.** If both bounds are non-empty and both are exactly `"0"`, and a
   tag/tags/message locator is present, treat the range as absent (upstream
   host-filler behavior). `verbose` does not change this. A real
   `{start:"0",end:"0"}` range alone remains a one-event range.
4. **Range conflicts first.** If both bounds are non-empty and not the filler,
   and any of tag/tags/message is present, return:
   `pass either tag, tags, message, or start/end, not more than one`.
   This wins even when `tag` and `tags` are both present: a real range plus
   both aliases is a range conflict, not the tag/tags alias error.
5. **No range, tag locators.** With no range:
   - `tag` and `tags` both non-empty: `pass either tag or tags, not both`
     (existing V1 text);
   - `tag`/`tags` plus a non-empty `message`:
     `pass either tag, tags, or message, not more than one` (existing V1 text);
   - otherwise the tag/message path continues.
6. **Bound validation (range only).** Each bound must match
   `/^(?:0|[1-9]\d*)$/` and be a safe integer:
   `start must be a non-negative decimal integer string` (same for `end`).
   Then `start <= end`: `start must not be greater than end`.
7. **No locator.** With `start`/`end` absent and tag/tags absent:
   - a non-empty message is the message path;
   - an empty message (`""`) alone is
     `message must be a non-negative decimal integer string`;
   - otherwise `no tag given (pass tag: "N")`.
8. **verbose.** If present and not boolean: `verbose must be a boolean`
   (for every locator, including tag/message). A boolean value with
   tag/tags/message and no range is ignored (upstream behavior).
   With no range and no tag/tags/message, return
   `verbose requires start and end`.
9. **Empty `message` with another locator.** An empty `message` is absent when
   tag/tags or a range is present; it does not create a mixed-locator error.
   An empty `tag`/`tags` is absent when a range/message is present.

Examples of the exact outcomes:

| input | outcome |
|---|---|
| `{start:"1",end:"3"}` | range |
| `{start:"0",end:"0"}` | one-event range |
| `{start:"3",end:"1"}` | `start must not be greater than end` |
| `{start:"1"}` | `pass both start and end...` |
| `{start:"",end:"1"}` | `pass both start and end...` |
| `{tag:"1",start:"0",end:"0"}` | tag path (filler) |
| `{tag:"1",start:"1",end:"2"}` | mixed-locator error |
| `{tag:"1",tags:"2",start:"1",end:"2"}` | mixed-locator error (range wins) |
| `{tag:"",start:"1",end:"2"}` | range (empty tag absent) |
| `{message:"",start:"1",end:"2"}` | range (empty message absent) |
| `{message:""}` | `message must be a non-negative decimal integer string` |
| `{verbose:true}` | `verbose requires start and end` |
| `{tag:"1",verbose:true}` | tag path, boolean verbose ignored |
| `{tag:"1",verbose:"yes"}` | `verbose must be a boolean` |

### 2.3 Description

Update the tool description to separate locators:

- `tag` / deprecated `tags`: dropped tool results, A-only new result.
- `message`: one dropped tool result by DSH log event seq.
- `start`/`end`: raw event range by DSH log event seq, inclusive; not upstream
  message ordinals; `verbose` previews.
- `tag`/`message`/range are mutually exclusive; `verbose` only affects range.

## 3. Range reader

Keep the implementation in `tool-bridge.ts` unless it needs event-shape
helpers from `seams.ts`.

### 3.1 Event access

Use `session.snapshotEvents()` (includes shadowed events). Do not use
`session.surface.nodes` for the payload; use it only for the live-surface
check.

Allowed event types and renderers:

| event.type | label | content |
|---|---|---|
| `user/message` | `user` | `data.content` text blocks |
| `assistant/message` | `assistant` | `data.message.content` text blocks; its `tool-call` blocks render as `tool call <name> (callId)` + compact JSON from the block's raw `arguments` string (parse; fall back to the raw string) |
| `tool/result` | `tool result <name?>` | `data.message.content` text blocks; include `toolCallId` |

Standalone `tool/call` events are **not** emitted as separate entries: the
assistant message's `tool-call` block is the single carrier, so arguments never
appear twice. A standalone `tool/call` is still used to resolve a tool name for
a `tool/result` header when the assistant block is outside the range.

Exclusion predicate (all three must be checked):

1. `event.type` is not one of `user/message`, `assistant/message`,
   `tool/result` (this covers `system/message`, `developer/message`,
   `assistant/attempt`, `compaction/*`, and standalone `tool/call`);
2. `source.kind` is `magic-context` or `compact-checkpoint` (the compartment
   publication/baseline markers; note `compact-checkpoint` is a source kind,
   not an event type);
3. the text content matches `^\[compacted §C\d+§\]$`.

Excluded events are not rendered and count as skipped. A `[dropped §N§]` block
is **not** excluded: it is rendered literally, and range does not follow it to
an original. (Use `tag`/`message` for recovery.) This avoids inventing a second
recovery path.

### 3.2 Live-surface check

Build `live = new Set(session.surface.nodes)`. Every readable event here is
surface-bearing (`user/message`, `assistant/message`, `tool/result`); tool calls
are blocks inside assistant messages and have no separate liveness. If the
selected range has at least one readable event and **every** readable event is
in `live`, return:

Return a successful range payload with no event entries and one text block,
not `ok:false` and not an empty `content` array:

```ts
{
  ok: true,
  locator: 'range',
  events: [],
  content: [{
    type: 'text',
    text: 'Events <start>-<end> are already on the live surface; no raw history was read.',
  }],
}
```

Journal it as `ctx_expand: read 0 events (live surface)`, not `restored 0`.
If at least one readable event is shadowed, render the readable events. Do not
clamp the range to a compartment boundary; document that live events in a mixed
range are returned because the DSH surface does not expose upstream message
ordinals.

### 3.3 Selection and ordering

- Filter by inclusive `seq` bounds.
- Keep persisted ascending order.
- `skipped` counts **every in-bounds event that is not rendered**, including
  `system`/`developer`/source-kind/compacted, standalone `tool/call`,
  `assistant/attempt`, and compaction events. Seq gaps do **not** count.
  This keeps the denominator equal to the number of events physically in the
  range.
- If no readable events remain, return
  `no readable events in range <start>-<end>`.

### 3.4 Non-verbose rendering

```text
Events 20-24 (3 events, 1 skipped):
[20] user/message
<text>

[21] assistant/message
[21] tool call read (call_abc)
{"path":"..."}

[23] tool/result read (call_abc)
<text>
```

Header uses the **requested** range (`start`/`end`), not the first/last included
event. Bound the whole result with `estimateTokens` and
`CTX_EXPAND_RANGE_TOKEN_BUDGET = 15_000` (same budget as upstream). Stop before
adding a block that would exceed the budget when at least one block is already
included. If the first included event alone exceeds the budget, include a
bounded head, append `[event truncated]`, and stop; the result never exceeds the
budget by an unbounded event. In that case the continuation is
`Event <seq> truncated at the budget; narrow start/end for the remainder (tag/message only restore dropped tool results).`
— do **not** suggest `start=<seq+1>`, which would skip the unread remainder.
For an ordinary between-event cut add:

```text
Truncated at event <last> (budget: ~15000 estimated tokens). Call again with start=<last+1> end=<end>[ verbose=true].
```

`last` is the last included event seq, not the last selected seq.

Every event is emitted as **text only**: never forward an assistant `tool-call`
block or any other executable block into the tool result; render it as the
documented text preview.

### 3.5 Verbose rendering

Header:

```text
Events <start>-<end> (verbose; <n> events, <skipped> skipped). Recover a full dropped tool result with tag or message.
```

Each block:

```text
[<seq>] <label>
  • [text] <first 200 chars, newlines collapsed>
  • [tool-call] <name> <compact input preview>
  • [text] <first 200 chars> (tool/result text uses the same text label)
  • [image] <mime/name>
```

Preview bound: 200 characters per part. Verbose obeys the same 15,000-token
budget and has no separate event-count cap; when the budget stops the range,
add the continuation sentence with `verbose=true`. Do not include full tool
outputs in verbose mode. For an oversized first event, apply the same bounded
head rule as non-verbose.

### 3.6 Result shape

Return a range-specific success shape:

```ts
{ ok: true, locator: 'range', events: includedSeqs, content: [...] }
```

Do **not** put `restored: []`/`refused: []` in a range payload: the client panel
renders `restored` whenever the key exists, so an empty array shows “restored
0”. A range is a transcript read, not a tag restoration. The tool renderer uses
`content`; `events` is available to the journal/tests. For a range failure:

```ts
{ ok: false, locator: 'range', reason: '...' }
```

Journal one `tool-call` row per invocation:

```ts
{
  tool: 'ctx_expand',
  locator: 'range',
  start,
  end,
  verbose,
  events: includedSeqs,
  skipped: skippedCount,
  ...
}
```

Summary: `ctx_expand: read <n> event(s)`; for the live-surface answer use
`ctx_expand: read 0 events (live surface)` and `liveSurface: true`. Do **not** write
`restored: []`/`refused: []` for a range success, and do not render
“restored 0”: the range is a transcript read, not a tag restoration. Existing
tag/message journal rows keep their `restored`/`refused` shape. Do not add a
new journal kind.

## 4. Tests

Add to `tests/ctx-expand-result.spec.ts` (or a new
`tests/ctx-expand-range.spec.ts` if that keeps the suite readable; if new, add
it to `scripts/phase-map.mjs`):

### 4.1 Parsing

- both bounds inclusive; `start="7",end="7"`;
- `start="0",end="0"`;
- missing one bound;
- `start > end`;
- negative, fractional, `Number.MAX_SAFE_INTEGER + 1`, `NaN`, whitespace,
  `+1`, `01`, empty string;
- range + tag, range + tags, range + message;
- filler `tag` + `start="0",end="0"` still follows tag; real range alone
  `{start:"0",end:"0"}` still works;
- `verbose` alone; `verbose` with tag (ignored);
- empty `tag`/`tags`/`message` presence rules from the table above;
- tag/message paths unchanged, including `message: ""` rules.

### 4.2 Rendering

- user + assistant (with tool-call block) + tool result in one range; the
  tool call appears once, from the assistant block, with parsed compact
  arguments and a raw-string fallback;
- system/developer/baseline/`source.kind=magic-context`/
  `compact-checkpoint`/`[compacted §C…§]` not included;
- `[dropped §N§]` shown literally, not recovered;
- skipped count counts excluded events, not seq gaps; header uses requested
  range;
- live-surface-only refusal; mixed live + shadowed returns both;
- verbose previews bounded, one entry per event, no 64-event cap;
- non-verbose and verbose budget truncation + continuation hint;
- oversized first event truncated and marked, result bounded;
- range result tagged by post-execute and reducible/expandable again (reuse
  the existing tag fixture); range result payload has no `restored` key.

### 4.3 Regression

- all existing `ctx-expand-result` and `ctx-reduce-render` tests;
- `tests/client-pure.spec.ts` only if the render shape changes;
- full `npm test`, `npm run typecheck`, `npm run check:i18n`, `npm run build`.

## 5. Docs

- `README.md` and `README.zh-CN.md`: parameter table and examples. State
  “DSH log event seq, not upstream message ordinal”; `start`/`end` inclusive;
  `verbose` only for range.
- `PARITY.md`: note that upstream uses message ordinals and this adapter uses
  event seq; list the deliberate divergences — no compartment-end clamp,
  surface-based liveness, 15k budget with no separate event cap — so the
  mapping is not read as upstream parity.
- `tickets/recovery-contract.md`: add a V1.1 decision subsection under D4
  with the same mapping and the live-surface rule.
- Tool description as above.

## 6. Host gate

Create `acceptance-windows-dsh-2026-11-15-v11-range/` with a new isolated
root. Do not copy a prior profile.

### 6.1 Prepare

- Fresh headless profile, registry or local build recorded by hash; if local,
  record tarball SHA-256, `git rev-parse HEAD`, and the source diff hash.
- Overlay: scoped plugin name, new `dataDir`/`outDir`; assert the overlay text
  does not contain any old root.
- Real model, real Historian publish; record `@deepseek-ai/dsh` version.

### 6.2 Sequence

1. Seed a `read` tool result; capture raw `tool/result` seq and tag from the
   observer.
2. `ctx_reduce`, wait for landing; capture placeholder seq.
3. Wait for the management pass that published the target compartment to
   complete (pass journal row or awaited pass), wait until no historian run is
   in flight, then take a read-only pre-expand snapshot. Prove no unlanded
   compartment remains (`landed_event_seq IS NULL AND superseded=0 AND
   landed_reason IS NULL` is zero rows) and capture the publish seq/row.
4. Host R1 (separate process): `ctx_expand` with `start=<raw seq>`,
   `end=<placeholder seq>`. Expect raw content; placeholder unchanged.
5. Host R2 (separate process, same session): same range with `verbose:true`;
   expect per-event previews, no full body.
6. Host R3 (separate process, regression): `ctx_expand` with
   `message=<raw seq>` and `tag=<tag>` in separate requests; both still return
   raw content.
7. Post-expand snapshots per process around that process’s `ctx_expand`
   result: `pending_drops`, `tags`, `compartments`, baseline, journal
   `drop-landed`/`historian`/`compartment-published`, usage per session. A
   missing pass row or an unlanded compartment is `blocked`, not a pass.

### 6.3 Proof

- `start`/`end` used are extracted from observer events, not hard-coded.
- R1/R2 results contain the raw fixture nonce and not a generated summary.
  The range result is a normal tagged tool result; compare its body after
  stripping the documented outer `§N§ ` marker.
- Each post snapshot is anchored on the observer’s `ctx_expand` `tool/result`
  event and taken immediately after it, not after the host process exits.
- No surface rewrite: compare hashes of the placeholder and covered nodes, not
  the whole surface (the range result is a new `tool/result` node and changes
  the whole-surface list); no new `tool/result` for the original callId.
- No new pending row; no drop-state change. The only tag deltas are the new tag
  assigned to each successful expansion: R1 +1, R2 +1, R3 +2 (tag and message
  requests); record the numbers. The gate’s three requests all succeed, so
  those deltas hold; a refusal would also be tagged by the post-execute hook,
  but is not part of this gate.
- No new compartment/baseline/historian rows in the expand window.
- No model usage in the expand window; the host’s own model step is recorded
  separately.
- The range result tag exists and is reducible; expand it again once in a
  follow-up request (or assert the tag row and queue path; do not re-run the
  whole gate if time-boxed).

If any host stage cannot be driven, mark the ticket `blocked` and report which
stage; unit tests cannot replace it.

## 7. Review and delivery

1. Implement, run targeted tests.
2. Run full `npm test`, typecheck, i18n, build.
3. Independent Quick diff review; fix all Critical/Fix; re-check.
4. Host gate; write `acceptance-report.md`; independent report audit.
5. Fix report; mark `built`, then `done`; commit code + docs + evidence.
6. No version bump, tag, or npm publish in this ticket.

## 8. Explicit non-goals

- No upstream message-ordinal parser or `<session-history>` emulation.
- No range recovery of compacted placeholders (use tag/message).
- No `ctx_search` or arbitrary event search.
- No change to V1 `message` semantics.
- No release.
