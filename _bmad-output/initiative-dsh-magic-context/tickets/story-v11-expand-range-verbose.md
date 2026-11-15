---
ticket: 12
title: "V1.1: ctx_expand range and verbose"
status: draft
---

# V1.1: `ctx_expand` range and `verbose`

## Context

V1 deliberately stopped at `tag` + `message`; the signed recovery contract
leaves `start`/`end` and `verbose` for V1.1
(`tickets/recovery-contract.md` D4, Q2). This ticket is **planned**: the first
refinement must settle the identifier and payload decisions before any code is
written. It must not infer that upstream message ordinals map one-to-one to DSH
log event seq.

## Decisions required before implementation

1. **Range unit.** Are `start`/`end` inclusive DSH log event seq values, or
   something else? If DSH seq, is `0` valid (yes for the existing `message`
   path) and are both bounds required?
2. **Allowed event types.** Does a range return only `tool/result` events, only
   tag-managed/dropped results, or also `tool/call` and user messages? The
   existing recovery path only restores raw tool results; a general browser
   would be a different product decision.
3. **Payload shape.** Does a range return one concatenated tool result with
   separators, an array of per-event entries, or a refusal when more than one
   event matches? What does `verbose` add: seq, role, tool name, callId, tag,
   original text, truncation marker, or all of them?
4. **Boundary rules.** What happens when `start`/`end` cross a Historian
   compartment, include `[compacted §C…§]`, include a deleted tag, or point at
   a raw event that is no longer in the log? Reuse the V1 failure names rather
   than inventing a new taxonomy.
5. **Mutual exclusion.** Can a range be combined with `tag`/`tags`/`message`,
   or is it exclusive like `message`? What is the precedence when an empty
   string is supplied?
6. **New tag semantics.** Does a range result itself get a tag from the
   post-execute tagger, and can that new tag be reduced and expanded again
   (`tag` lifecycle)? This must match the A-only result-return model.
7. **Host gate.** Which range anchor comes from a real Historian publish, and
   how do we prove no compartment/baseline/model mutation around the expand?

## Requirements (to be finalized in refinement)

- `ctx_expand` accepts the chosen range locator(s) and `verbose` without
  breaking `tag`, `tags` (deprecated alias), or `message`.
- A range read is read-only: no drop-state change, no new pending row, no
  surface rewrite, no re-execution of the original tool, no model call.
- Raw history is read from the persisted log, including events shadowed by a
  Historian publish; a missing source is an explicit failure.
- `verbose` is deterministic and documented; non-verbose output stays
  byte-comparable to the selected raw event after the documented projection.
- Failure names and precedence are shared with the V1 call-level gate; no
  second recovery path.

## Boundaries

- Do not change `ctx_reduce`, `/ctx-flush`, drop-landing, Historian scheduling,
  compartments, baseline, schema, or retention.
- Do not add `start`/`end`/`verbose` to the README as stable until the
  refinement decides their exact semantics and the implementation passes its
  host gate.
- Do not release a new npm version as part of this ticket.

## Acceptance (post-refinement)

- Unit/integration: inclusive bounds, reversed bounds, missing one bound,
  zero, negative, whitespace, plus-sign, leading zero, unsafe integer, mixed
  locators, non-tool events, compacted events, missing raw source, deleted tag,
  foreign-session seq, and verbose fields/order.
- Existing `tag`/`tags`/`message` tests and the full suite remain green;
  `npm run typecheck`, `npm run check:i18n`, `npm run build` pass.
- Real isolated DSH host gate (or a recorded blocked state) exercises a
  post-Historian range and verbose read, proves no surface/drop/compartment
  mutation, and records the actual seq anchors from the run.
- Independent diff review and host-report audit before `built`.

## Out of scope

- Upstream runtime parity beyond the recorded research.
- A `/ctx-search` or general history-browser command.
- Changing V1’s `message` identifier or failure taxonomy.
- Publishing `0.12.4` or any other version.
