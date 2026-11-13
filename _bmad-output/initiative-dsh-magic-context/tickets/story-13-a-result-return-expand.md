---
id: 2
type: story
title: "#13 A: result-return expand"
parent: initiative-dsh-magic-context
after: [1]
refined: true
hitl: false
risk: high
---

# #13 A: result-return expand

## Description

Makes `ctx_expand` return the original payload as a new tool result and makes the spent tag a no-op through a durable drop state, so a dropped item can be re-reduced through its new tag without the fork's in-place state machine.

## Requirements

Verify: A dropped tag expands to a new result whose payload matches the original stored event; the old tag is refused as already dropped; the new tag can be dropped and expanded; the deprecated `tags` alias still handles a legacy comma list; a restart still reads the original.

1. **Result-return expand** (contract E1)
   **Given** a tool result was tagged `§1§` and dropped, and its `[dropped §1§]` placeholder is on the surface
   **When** `ctx_expand` is called with `tag: "1"`
   **Then** the tool returns the original payload as a new tool result
   **And** the old placeholder event and its `§1§` tag are unchanged; the old tag remains dropped.

2. **Payload integrity for a single tag** (contract E1)
   **Given** the original event content begins with the adapter's `§1§ ` marker (marker plus one trailing space), and the request carries one tag (`tag`, or `tags` with one value)
   **When** the new result is returned
   **Then** the new result begins with exactly one outer `§N§ ` marker added by the adapter's post-execute hook
   **And** removing that complete outer marker, including its trailing space, yields content byte-for-byte equal to the original stored event content, including its `§1§ ` marker; for text-only results the SHA-256 of the text projection matches, while non-text-only results are checked structurally rather than by a byte hash; no summary, model generation, or re-execution is used.

3a. **Durable old-tag no-op: landed** (contract E2)
   **Given** tag `§1§` is landed (its drop already produced a placeholder)
   **When** `ctx_reduce` is called with `drop: "1"`
   **Then** it is refused as `already dropped`
   **And** no second pending drop is created, `listPendingDrops` is unchanged, and the refusal works even when the placeholder is no longer on the live surface.

3b. **Durable old-tag no-op: pending** (contract E2)
   **Given** tag `§1§` is pending (queued but not yet landed)
   **When** `ctx_reduce` is called with `drop: "1"`
   **Then** it is refused as `already queued`
   **And** no second pending drop is created and the existing pending row is unchanged.

4. **New tag lifecycle** (contract E3)
   **Given** the first expand result is tagged `§N§`
   **When** `ctx_reduce` drops `§N§` and the execute band lands it
   **Then** the new result becomes `[dropped §N§]`
   **And** `ctx_expand` with `tag: "N"` returns a second result whose content, after removing its own outer `§M§ ` marker, equals the first result's content after removing its outer `§N§ ` marker.

5. **API shape and deprecated alias** (contract D4, Q2, Q3)
   **Given** `tag` is the canonical single-tag parameter and `tags` is the deprecated alias
   **When** `tag` carries one tag, or `tags` carries the legacy comma/range list
   **Then** `tag` resolves one tag; `tags` still resolves every requested tag in order, so old sessions do not hard-break
   **And** setting both parameters, or setting neither, is refused with a diagnostic message; for multiple values, successful payloads are concatenated in requested order with `\n\n---\n\n`, the new result carries one new tag covering the combined payload, and criterion 2's single-payload hash does not apply; `message` is delivered by T3, not this ticket.

6. **Restart and no-live-node read** (contract E1.4, E4)
   **Given** the session is restarted at unit level (same data directory, a new adapter instance; cross-process restart remains a host-level T0-B check), or the placeholder is no longer among the live surface nodes
   **When** `ctx_expand` is called with the old tag
   **Then** the read resolves the tag to its call identity and finds the original tool/result event in the persisted log
   **And** it does not require the placeholder to be live; Historian coverage itself is verified by T3.

7. **Failure paths** (contract D5, E6)
   **Given** an unknown tag, a non-tool target, a tag cleaned with its message/session, a tag that exists only in another session while this session has no tags, an active/never-dropped tag, a pending tag, a missing original event, or no session
   **When** `ctx_expand` is called
   **Then** each returns a named refusal: `no such tag`, `not a tool-result tag`, `tag no longer available`, `cross-session tag`, `not dropped`, `not dropped yet`, `raw source unavailable`, or `no-session`
   **And** a tag number used by another session is `cross-session tag` only when the current session has no tag records; once the current session has any tag, a number it never used is `no such tag`
   **And** when `tags` carries several tags, successful ones are returned and failed ones are listed per tag, not collapsed into a blanket success.

8. **Tests** (contract E1–E3, E6)
   **Given** the implementation
   **When** the test suite runs
   **Then** the phase-1 in-place test is updated to assert the old placeholder remains and the new result appears; if the journal's `restored` payload shape changes, `client-pure.spec.ts` is updated, otherwise it stays as the pinned compatibility check
   **And** new tests cover old-tag landed/pending refusal, new-tag drop/expand, payload hash, `tag`/`tags` alias, restart, active/pending/cleaned failures, and existing active-tag queue/land tests still pass.

## Constraints

- Follow contract D1/D4/D5/D6; no promise to preserve the fork's in-place restore.
- The old placeholder and old event are immutable; only a new tool result is added.
- No release, version bump, or publishing in this ticket.

## Boundaries

- Must not implement `message` (T3), `/ctx-flush` (T4), or the retention change (T5).
- Must not change the management pass drop scheduling, protected window, thresholds, or Historian.
- Must not change `ctx_memory`/`ctx_search` behavior.
- Must not remove the active-tag `ctx_reduce` queue/land path; only the spent-tag path becomes a no-op.
- Must not delete the old placeholder or rewrite the old event to restore in place.
- Must not change the post-execute tag prefix format or tag-number allocation.

## References

- parent — `_bmad-output/initiative-dsh-magic-context/initiative-dsh-magic-context.md`
- contract — `_bmad-output/initiative-dsh-magic-context/tickets/recovery-contract.md`, sections D1, D4, D5, D6
- research — `_bmad-output/initiative-dsh-magic-context/research-context-lifecycle/research-context-lifecycle.md`, section 2
- claims — `_bmad-output/initiative-dsh-magic-context/research-context-lifecycle/claims-mc.md`, ref 8
- verifier — `_bmad-output/initiative-dsh-magic-context/research-context-lifecycle/digests/verifier-mc.md`, ref 8
- acceptance — `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-13/acceptance-report.md`, sections 4.1 and 4.3
- issue — `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-09/issue-requeue.md`

## Notes

- Decision: 2026-11-13 — A-only per the signed contract; this ticket is the tracer and after T1.
- Decision: 2026-11-13 — `tag` is single; `tags` stays a deprecated multi-tag alias so historical comma/range calls do not hard-break. `message` is split to T3; retention is split to T5.
- Implementation note: the existing `ctx_reduce` only checks `node.isPlaceholder`; a durable pending/landed state is needed so `already queued` and `already dropped` are distinguishable without a live placeholder. Check that state before calling `queueDrop`; do not rely on `queueDrop`'s `ON CONFLICT` branch, which reopens a landed row. This ticket covers `ctx_reduce`-initiated drops only; emergency drops are out of scope.
- Implementation note: the read path resolves tag → call identity → original `tool/result` event in the persisted log; it may use the placeholder's cited source when available, but must not require the placeholder to be live.
- Implementation note: `cross-session tag` needs a global lookup by tag number; if the store only exposes per-session lookups, add one or document a narrower refusal (`no such tag`) in Notes rather than silently mislabeling it.
- Risk check beyond criteria: a fresh reviewer checks the old-tag landed/pending refusal, the payload hash after removing only the new outer tag, the multi-tag alias, and that the tagger prefix/allocation is unchanged.
