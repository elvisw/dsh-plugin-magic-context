---
id: 1
type: story
title: "Recovery contract decision record"
parent: initiative-dsh-magic-context
after: []
refined: true
hitl: true
risk: high
companions:
  - _bmad-output/initiative-dsh-magic-context/tickets/recovery-contract.md
---

# Recovery contract decision record

## Description

Writes the signed-off contract for #13 A, #14, #15, API shape, failure/degradation, and tag retention. Q1–Q5 are now decided: A-only expand, original-compatible semantics, no promise to preserve the fork's in-place restore.

## Requirements

Verify: A reviewer can confirm the contract records Q1–Q5 as dated decisions and maps them to D1–D6 and E1–E10, so T2–T4 can start without re-deciding a behavior.

1. **Q1 is recorded as a decision, not a gate**
   **Given** the contract file
   **When** a reviewer reads the Q1/D1/D2 sections
   **Then** they state A-only: result return, old tag stays dropped, no in-place path, and no promise to preserve the fork's 0.11.1 behavior
   **And** no sentence offers B+ dual mode as an open alternative.

2. **D1 result-return contract is complete**
   **Given** the result-return mode in D1
   **When** a reviewer checks its numbered points
   **Then** it states new-result return, old tag no-op, new-tag allocation, raw-history read without a live placeholder, the replacement of the in-place path, and the four failure paths.

3. **D2 post-Historian contract is complete**
   **Given** a first-time drop covered by a published Historian compartment
   **When** a reviewer reads D2
   **Then** it states that the same read path returns the original content, the summary is not undone, the tool is not re-executed, and missing raw source fails explicitly
   **And** it states the text/tool-result versus attachment/reasoning type boundary.

4. **D3 flush contract includes cache refresh and next-request effect**
   **Given** a session with pending drops
   **When** a reviewer reads D3
   **Then** it states current-session scope, the next-preStep effect, invalidation/refresh of affected context-injection cache, no Historian/recomp/summary call, idempotency, and the diagnosable empty/repeat/no-session/disabled/storage-failure paths.

5. **D4 API shape is an open choice, not an assumption**
   **Given** the original's `tag`/`message`/`start`/`end`/`verbose` surface and the fork's `tags`
   **When** a reviewer reads D4
   **Then** `tag` is labeled as the original-compatible canonical form, and `message`/range/verbose and the `tags` alias are tied to Q2/Q3
   **And** no fork-compatibility promise is used to justify `tags`.

6. **D5/D6 make failure and acceptance checkable**
   **Given** the contract is proposed for sign-off
   **When** a reviewer checks D5 and D6
   **Then** D5 names unknown/expired/cross-session/raw-missing behavior, and treats the fork's 30-day retention as a fork default rather than an original-compatible fact
   **And** D6 lists E1–E10 covering #13, #14, #15, API shape, retention, and old-evidence protection, and labels upstream as a source/test reference.

7. **Sign-off is recorded**
   **Given** Q1–Q5
   **When** the user signs off
   **Then** each has a dated decision in the contract and the ticket Notes
   **And** T2–T4 may start without re-deciding the same behavior.

## Constraints

- This ticket writes documents only; no product code, tests, installs, or model runs.
- No compatibility promise with the fork upstream; the original `cortexkit/magic-context` semantics are the compatibility target.
- The contract must not claim upstream runtime validation; cite the fixed research commits and label the evidence level.
- The contract must not overwrite the 0.11.1 evidence or change existing acceptance reports.

## Boundaries

- Must not implement #13/#14/#15, change tool code, or alter the database schema.
- Must not decide release scope, package version, or publishing.
- Must not add `message`/`start`/`end`/`verbose` without a Q2 answer.
- Must not promise recovery beyond the original retention policy or raw-source availability.

## References

- parent — `_bmad-output/initiative-dsh-magic-context/initiative-dsh-magic-context.md`
- contract — `_bmad-output/initiative-dsh-magic-context/tickets/recovery-contract.md`
- research — `_bmad-output/initiative-dsh-magic-context/research-context-lifecycle/research-context-lifecycle.md`, sections 2 and 4
- claims — `_bmad-output/initiative-dsh-magic-context/research-context-lifecycle/claims-mc.md`, ref 8
- verifier — `_bmad-output/initiative-dsh-magic-context/research-context-lifecycle/digests/verifier-mc.md`, ref 8
- acceptance — `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-13/acceptance-report.md`, sections 4.3–4.4
- issue #13 — `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-09/issue-requeue.md`
- issue #14 — `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-09/issue-historian-recovery.md`
- issue #15 — `_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-09/issue-ctx-flush.md`

## Notes

- Decision: 2026-11-13 — Q1 A-only. `ctx_expand` returns a new result; the old tag stays dropped; the fork's in-place restore is not preserved.
- Decision: 2026-11-13 — no compatibility promise with the fork upstream; original Magic Context semantics are the target.
- Decision: 2026-11-13 — T1 is a document gate; implementation tickets T2–T4 are created after sign-off.
- Decision: 2026-11-13 — the initiative is entry-type for now; T2 (#13 A) will be the tracer when the implementation epic is created.
- Decision: 2026-11-13 — Q2-B: V1 `tag` + `message` (DSH event seq); `start`/`end`/`verbose` deferred.
- Decision: 2026-11-13 — Q3: `tag` canonical; `tags` deprecated alias, removed at the next major.
- Decision: 2026-11-13 — Q4: mark + next preStep; receipt says the change is pending the next request.
- Decision: 2026-11-13 — Q5: remove/disable the 30-day prune; tags follow message/session deletion and `compacted` status.
- Risk check beyond criteria: a fresh reviewer compares the contract against the research claims and the 0.11.2 evidence; no unresolved contradiction may remain before `refined: true`.
