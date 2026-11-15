---
id: 14
type: story
title: "Documentation index and contract status audit"
parent: initiative-dsh-magic-context
after: [13]
refined: false
hitl: false
risk: medium
---

# Documentation index and contract status audit

Status: revision 3 — independent re-validation PASS (READY TO START); optional suggestions applied.

## Goal

Make the README documentation index tell the truth about **which documents are
current fork documentation and which are historical upstream research**, and
give every indexed document a visible status header. This is a documentation
classification and correction ticket, not a rewrite of upstream research.

## Why

- `README.zh-CN.md:277-301` and `README.md:335-361` present one flat
  "Contracts / Design decisions / Retrospectives & runbooks / Reports" list.
  Several entries are upstream snapshots from 2026-10, not current guarantees.
- The clearest contradiction is `docs/dsh-plugin-config-ui-contract.md`:
  - it states at `:42` that "we have no client half at all";
  - `:46-49` says Settings is only official hand-written sections;
  - `:289-295` lists "no client half / no entry" as the current gap;
  - `:518-524` gives the old "add src/client/index.js + register
    plugins.row.config" recipe.
  The fork already has `src/client/index.js` (`makeCard`, registrations at
  `:2210-2231`), and T13 adds a top-level `settings.section` page. The old
  document is therefore historical upstream analysis, not a current
  contract. Its host-mechanism analysis is still useful, so only the
  plugin-specific conclusions are superseded by T13's current contract.
- The opposite failure also exists: `docs/independent-package-release.md`
  is a current fork process document but is not in the index.
  `docs/research-handoff-ctx-flush-2026-11-11.md` explicitly says it is a
  0.11.1 historical baseline, so it must be historical, not current.
- `docs/dsh-plugin-ui-telemetry-contract.md` also contains the old
  "no client half" statement (`:35`, `:67`), the old "no dsh.client"
  statements and the old "add src/client/index.js / fall back to host-only"
  advice (`:401`, `:405-410`), and links the old config UI contract as a
  sister document (`:7`, `:459`); it cannot stay `current` unchanged. Mark it
  historical unless all those claims are corrected and the current telemetry
  mechanics are split into a current document.
- Leaving the index unchanged makes readers treat 2026-10 design snapshots as
  current behavior. Removing the index would hide provenance and make the
  current docs undiscoverable. The correct fix is classification plus status
  headers.

## Settled decisions

The implementation plan resolves these; they are not open questions.

1. **Exact status vocabulary.** `current`, `historical`, `superseded` are the
   working set. Decide whether a document can be `current` while still
   carrying dated evidence, and what "last verified" means for a research
   report.
2. **Scope of the audit.** At minimum every document linked from the current
   README index. Also decide whether the four unindexed docs
   (`docs/independent-package-release.md`,
   `docs/research-handoff-ctx-flush-2026-11-11.md`,
   `docs/upstream-followup-2026-10-30.md`,
   `docs/domain-naming-work-global-2026-10-25.md`) must be added, left in
   place with a historical header, or explicitly left unindexed with a
   reason; do not move/delete files (the upgrade-followup doc links one).
3. **What "current" requires.** A current document must describe behavior
   that still exists in this fork and must not contradict the source. A
   historical document may contain stale claims; it must say so. A superseded
   document must name its replacement.
4. **How much body correction.** Historical documents keep their original
   evidence and are not rewritten; current documents get only the corrections
   needed to remove false guarantees. Do not turn this ticket into a full
   documentation rewrite.
5. **Where the current config/settings contract lives.** T13 owns and creates
   `docs/dsh-plugin-settings-ui-contract.md` (Settings top-level section,
   Plugins legacy location, zh/en, catalog-backed effort picker, write path,
   DSH 0.2.2-rc.1 evidence). T14 only marks the old
   `dsh-plugin-config-ui-contract.md` as `historical` with a scoped
   `Superseded by:` note; it does not rewrite the old body or create the new
   contract.
6. **README language parity.** Both READMEs get the same two-section split
   and the same link set; translations may differ but must not omit a
   document.
7. **Evidence for classification.** Each decision must cite either source,
   host package behavior, or a dated ticket/report. "Looks old" is not enough.

## Requirements

- Add a visible status header to every README-indexed document, in a
  consistent place (immediately after the title), for example:

  ```md
  > Status: current — last verified 2026-11-15 against DSH 0.2.2-rc.1
  > Scope: this fork's runtime and operator documentation
  ```

  or:

  ```md
  > Status: historical — upstream research snapshot (2026-10, DSH 0.2.0-rc.2;
  > package-name note added 2026-11-14)
  > Not a current guarantee; plugin-specific conclusions superseded by:
  > docs/dsh-plugin-settings-ui-contract.md
  ```

- Mark `docs/dsh-plugin-config-ui-contract.md` **`historical`** with a scoped
  `Superseded by: docs/dsh-plugin-settings-ui-contract.md` line. Its
  host-mechanism analysis remains useful; do not rewrite its body or the
  2026-10 source line numbers.
- The current Settings UI contract is the file T13 creates at
  `docs/dsh-plugin-settings-ui-contract.md`. T13 must give it a visible
  `> Status: current` header immediately after the title; T14 verifies the
  header and content, and does not create or edit the contract.
- Rewrite `README.md` and `README.zh-CN.md` documentation indexes into:
  - **Current documentation maintained by this fork**;
  - **Historical research / upstream snapshots (not current guarantees)**.
  Current docs go first; historical docs are grouped as historical contracts,
  design decisions, audits/retrospectives, and reports. Every existing link
  stays somewhere; include `hooks coverage` under historical. The final link
  set is the baseline 20 plus any newly indexed current docs (at least the
  T13 contract and the release guide); do not hardcode 20.
- Update the README body links that currently present the old config UI
  contract as current (`README.md:144`, `README.zh-CN.md:116`): point them to
  the new Settings UI contract, or explicitly label the old link historical.
  If the telemetry contract becomes historical, update its body links too
  (`README.md:245`, `README.zh-CN.md:202`). Preserve T13's Settings-page /
  Plugins-fallback wording when editing the README; do not overwrite it.
- Add the T13 current Settings UI contract, `docs/independent-package-release.md`,
  and any other document classified `current` to the current section.
  For the unindexed docs not classified current, record the decision in the
  acceptance matrix (add, leave in place with a historical header, or leave
  unindexed with a reason; do not move/delete).
- Ensure every link in both indexes resolves to a file; no link points to a
  deleted or renamed document.
- The current config/settings contract must match T13's shipped behavior:
  Settings top-level section, Plugins-page fallback, zh/en dictionaries,
  catalog-backed effort picker, write path. This ticket does not write that
  contract; it only indexes and status-marks it.
- Correct `docs/dsh-plugin-memory-acceptance.md:3-7` to the current
  `memories.db` path used by `scripts/mc-acceptance.mjs:49-53`, or mark the
  document historical. Record which choice and why.
- No source, schema, host-store, package, or release change.

## Acceptance

- A status matrix exists in the ticket evidence and lists every
  README-indexed document with:
  - status (`current` / `historical` / `superseded`);
  - evidence baseline (date + host/source version);
  - replacement link for the scoped superseded part;
  - one-line rationale with a file:line or ticket reference.
- Every indexed document has the header; the first block after the title is
  `> Status:` (not merely somewhere in the first 10 lines).
- Neither README lists a historical/superseded document under a
  "current contract" heading.
- `README.md` and `README.zh-CN.md` have the same final document set and the
  same current/historical split. The final set is baseline 20 plus newly
  indexed current docs (at least 22: T13 contract and release guide); a
  runnable comparison derives the actual set and reports no missing/extra
  docs. Its output is in evidence.
- `docs/dsh-plugin-config-ui-contract.md` is `historical` with a scoped
  `Superseded by: docs/dsh-plugin-settings-ui-contract.md`; its body is
  unchanged except the header (body-change guard proves it).
- The current Settings UI contract exists (created by T13 with its own
  `> Status: current` header), is linked, and describes the shipped T13
  behavior; no current document claims "no client half", "Settings is
  official-only", or another behavior contradicted by `src/client/index.js`.
- The telemetry contract is historical unless every stale claim (`:7`, `:35`,
  `:67`, `:401`, `:405-410`, `:459`) is corrected and the current telemetry
  mechanics are split into a current document. If historical, its README body
  links are marked historical too.
- `dsh-plugin-upgrade-followup.md` is not presented as full v0.49.55 parity:
  split "current upgrade procedure" from "historical baseline status", or
  mark the whole document historical with the caveat.
- `dsh-plugin-memory-acceptance.md:3-7` is corrected to `memories.db` or the
  document is marked historical; the choice is recorded.
- The four previously unindexed docs have an explicit decision recorded;
  `research-handoff-ctx-flush-2026-11-11.md` is historical, not current.
- All internal links resolve, including links inside `docs/` (the new
  contract, `Superseded by`, telemetry and upgrade-followup references); no
  orphaned/deleted file remains linked.
- `git diff --check` is clean; a body-change guard shows historical documents
  changed only by their header; `git diff -- package.json package-lock.json
  .github/workflows` is empty and no tag/publish was created.

## Boundaries

- Do not rewrite the historical research body; only add status headers and
  the minimum corrections for documents classified `current`.
- Do not create or modify the T13 Settings UI contract; T13 owns and creates
  `docs/dsh-plugin-settings-ui-contract.md` before T14 starts.
- Do not touch source, tests, schema, host stores, package metadata, release
  workflows, or npm.
- Do not use "historical" as a way to avoid correcting a current document's
  false claim.
- No release; this is repo-only documentation. The README changes are not
  part of T15's `0.13.0` release and are not carried by T13's changes; they
  go with a later regular release.

## References

- `README.md:335-361` — English documentation index.
- `README.zh-CN.md:277-301` — Chinese documentation index.
- `docs/dsh-plugin-config-ui-contract.md:42,289-295,518-524` — stale
  "no client half" and old recipe; `:8` notes the 2026-11-14 package-name
  migration.
- `src/client/index.js:2210-2231` — existing client-half registrations.
- `_bmad-output/initiative-dsh-magic-context/tickets/story-historian-reasoning-effort-picker.md`
  — T13, which creates `docs/dsh-plugin-settings-ui-contract.md`.
- `docs/dsh-plugin-ui-telemetry-contract.md:7,35,67,401,405-410,459` — old
  "no client half" / "no dsh.client" / old client plan and sister-document
  links; correct all or mark historical.
- `docs/dsh-plugin-operations-runbook-2026-10-10.md` — current candidate;
  verify commands/paths.
- `docs/dsh-plugin-upgrade-followup.md:14-18` — explicitly says v0.49.30 was
  the last full table check and v0.49.50→v0.49.55 is not swept; do not label
  the whole document current.
- `docs/dsh-plugin-memory-acceptance.md:3-7` — legacy shared library path;
  `scripts/mc-acceptance.mjs:49-53` uses `memories.db`; correct or mark
  historical.
- `docs/independent-package-release.md`,
  `docs/research-handoff-ctx-flush-2026-11-11.md`,
  `docs/upstream-followup-2026-10-30.md`,
  `docs/domain-naming-work-global-2026-10-25.md` — unindexed docs;
  `research-handoff` is historical per its own `:5`.
