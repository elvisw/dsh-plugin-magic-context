---
ticket: 17
title: "Telemetry UI requirements and information architecture — plan"
status: in-progress
---

# Plan — Telemetry UI requirements and information architecture

Ticket: 17
Story: `tickets/spike-telemetry-ui-requirements-and-information-architecture.md`
Deliverable: `research-telemetry-ui-requirements.md`

This is a research/requirements spike. It changes no runtime, test, package,
release or profile file.

## 1. Scope lock

Allowed outputs:

- the ticket leaf and this plan;
- `research-telemetry-ui-requirements.md`;
- a short initiative/ticket status update.

Forbidden outputs:

- edits under `src/`, `tests/`, `scripts/`, `docs/`, `README*`, `CHANGELOG.md`,
  `package.json`, `package-lock.json`, `.github/` or `cordis.patch.yml`;
- installs, browser runs, host gates, version bumps, tags or publishes.

## 2. Research steps

1. Read the upstream v0.49.56 sidebar and status-view sources, recording the
   information architecture and the true source of each field.
2. Read the current DSH pill/popover (`src/client/index.js`), telemetry summary
   and SSE service (`src/dsh/telemetry.ts`) and `/ctx-status`
   (`src/dsh/status-command.ts`).
3. Check which host projections already exist (`contextPressure`,
   `contextBreakdown`, `tokenUsage`) and which adapter stores/journal fields can
   supply the rest.
4. Classify every candidate field with one truth label: exact,
   provider-anchored, host-heuristic, adapter-estimate, derived, unavailable or
   design.
5. Decide the pill, popover and `/ctx-status` placement; do not copy the
   persistent sidebar layout.
6. Write English and Chinese static text wireframes; keep the illustrative
   numbers consistent and do not let message sub-rows double-count the host bar.
7. Write the v1 recommendation and the deferred list.
8. Propose the minimum additive telemetry payload; do not implement it.

## 3. Document outline

1. Problem.
2. Design principles.
3. Upstream reference map.
4. Data sources and truth levels.
5. Information architecture (pill, popover, full status).
6. Requirements matrix (`TEL-01`…).
7. Minimum additive telemetry API.
8. Interaction, layout and refresh.
9. Localization and accessibility.
10. Acceptance criteria for the implementation ticket.
11. Non-goals.
12. Resolved decisions for v1.

## 4. Key research findings to preserve

- `contextBreakdown` only has `systemTokens`, `toolsTokens`, `messageTokens`;
  the bar uses those three segments. Message categories (Conversation, Tool
  calls, Compartments, Memories, Profile, Other) are a separate estimated
  sub-list, not peer segments.
- `compartment.coveredTokens` is digested span size, not current compartment
  replacement size; do not use it as a bar segment.
- `memory-recall.estTokens` / `profile-recall.estTokens` are adapter estimates
  for the memory/profile rows, not provider measurements.
- DSH has no smart-note or cache-TTL source; omit those rows. Session notices
  are available from the `session-notice` journal kind.
- Recomp live progress has no shared progress source; defer it.
- The current single-letter ledger is compact but not a substitute for labeled
  sections; the pill can stay compact, the panel should become sectioned.
- Pressure tone should use configured thresholds. The pill currently hardcodes
  50/65 and the panel 60/85; both must read policy.

## 5. Validation

1. Run an independent read-only ticket validation against the story, plan and
   research document.
2. Address every Critical/Fix in the same files.
3. Re-run validation until READY TO START.
4. Mark the ticket `ready-for-dev`; do not implement.

Validation must confirm:

- upstream and DSH citations are real and correctly scoped;
- every matrix row has one truth label and a source or is explicitly unavailable;
- English and Chinese wireframes use the same numbers and information hierarchy;
- v1 does not promise unsourced fields, and unknown is never rendered as zero;
- the additive API is additive and fail-open;
- the dsh-go mapping uses the same view model;
- no runtime/package files changed.

## 6. Follow-up (not this ticket)

A later implementation ticket will add the P0/P1 telemetry fields, the pure view
model, the panel rendering, tests and a real DSH Web gate. The dsh-go port stays
after that implementation, per
`research-dsh-go-port-2026-11-16.md`.
