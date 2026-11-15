---
ticket: 14
title: "Documentation index and contract status audit — plan"
status: done
---

# Plan — Documentation index and contract status audit

Ticket: 14
Story: `tickets/story-documentation-index-and-contract-status-audit.md`
Status: implementation plan (ticket must pass independent validation first; starts after T13)

## 1. Scope lock

Documentation-only:

- classify every document linked from the README documentation index;
- add a visible status header to each document;
- split both READMEs into current fork documentation and historical upstream
  research;
- mark the old config UI contract `historical` with a scoped superseded-by
  pointing to T13's current Settings UI contract;
- record decisions for the four unindexed docs.

Not in scope:

- rewriting historical research bodies;
- writing or modifying T13's current Settings UI contract;
- source, tests, schema, host stores, package metadata, release workflows or
  npm.

## 2. Inventory

Current index links (20 files):

| Group | Files |
| --- | --- |
| Contracts | `dsh-plugin-memory-write-contract.md`, `dsh-plugin-memory-promotion-contract.md`, `dsh-plugin-memory-acceptance.md`, `dsh-plugin-config-ui-contract.md`, `dsh-plugin-ui-telemetry-contract.md`, `dsh-plugin-upgrade-followup.md`, `dsh-plugin-hooks-coverage-2026-10-08.md` |
| Design decisions | `dsh-port-feasibility-2026-10-06.md`, `dsh-plugin-platform-takeover-and-global-domains-2026-10-09.md`, `dsh-plugin-dreamer-vector-decision-2026-10-08.md`, `memory-mechanisms-inventory-2026-10-09.md`, `upstream-source-analysis-2026-10-09.md`, `global-domain-source-finding-2026-10-10.md`, `memory-architecture-challenge-2026-10-10.md` |
| Retrospectives & runbooks | `dsh-plugin-test-design-audit-2026-10-07.md`, `dsh-plugin-operations-runbook-2026-10-10.md`, `dsh-surface-write-audit-2026-10-09.md`, `local-embedding-runtime-audit-2026-10-15.md` |
| Reports | `reports/dreamer-token-usage.md`, `reports/memory-solutions-comparison.md` |

Unindexed docs (4):

- `docs/independent-package-release.md`
- `docs/research-handoff-ctx-flush-2026-11-11.md`
- `docs/upstream-followup-2026-10-30.md`
- `docs/domain-naming-work-global-2026-10-25.md`

Inventory method: read both README link blocks, extract every `docs/...`
path ending in `.md`, and compare with `Get-ChildItem docs -Recurse -Filter
*.md`. Baseline is 24 files (20 indexed + 4 unindexed); T13 adds
`docs/dsh-plugin-settings-ui-contract.md`, so T14 starts with 25 files
(20 indexed + 5 unindexed). T14 then indexes the T13 contract and the release
guide, so the final set is at least 22 links; derive the actual set from the
files instead of hardcoding a quota. Exclude `docs/img/*` and README image
URLs; they are not documents. Fail if a linked file is missing or an
unindexed `.md` has no recorded decision.

## 3. Status rubric

| Status | Meaning | Requirements |
| --- | --- | --- |
| `current` | Describes behavior this fork still ships; maintained by this fork. | Claims spot-checked against source/host; `Last verified` date and baseline version; no known contradiction. Long contracts need a section-level checklist, not three random claims. |
| `historical` | Useful upstream research or an audit snapshot; not a current guarantee. | Original evidence preserved; header names the evidence baseline and says it is not current. A `Superseded by:` line may be scoped to the plugin-specific part. |
| `superseded` | The whole document is replaced by a named current document. | Header names the replacement; body is preserved; the replacement is linked from README. Do not use for a partly useful host-mechanism analysis. |

A document that is partly current and partly historical must either be split,
or be marked `historical` with the current part moved/linked to a current
document. `docs/dsh-plugin-config-ui-contract.md` is the second case: its host
mechanism analysis is still useful, but its "no client half" and old
plugin-specific recipe are superseded by T13's contract. Do not mark it
whole-document `superseded`.

Evidence for a `current` decision must be one of:

- a source file + line;
- an installed host package + line;
- a dated ticket/acceptance report that ran against the current host.

Age alone is not a reason to mark something historical; a 2026-10 document
that still matches current source may stay `current`. Conversely, a recent
document that contradicts source must not stay `current`.

## 4. Audit matrix

Create `evidence/document-status-matrix.md` under
`_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-docs-audit/`
with:

| Document | Status | Evidence baseline | Last verified | Replacement | Rationale |
| --- | --- | --- | --- | --- | --- |

Every row cites a source/host line or a named ticket/report. The matrix is the
primary review artifact; the headers and README are generated from it by hand.

Expected starting points (must be verified, not assumed):

- `dsh-plugin-config-ui-contract.md` → `historical` with scoped
  `Superseded by: docs/dsh-plugin-settings-ui-contract.md`. Evidence: its
  `:42` "no client half", `:289-295` gap table and `:518-524` recipe versus
  `src/client/index.js:2210-2231` and T13. Keep its host-mechanism analysis.
- `dsh-plugin-ui-telemetry-contract.md` → mark **historical** unless every
  stale claim (`:7`, `:35`, `:67`, `:401`, `:405-410`, `:459`) is corrected
  and the current telemetry mechanics are split into a current document. Its
  README body links (`README.md:245`, `README.zh-CN.md:202`) must then be
  labeled historical.
- `dsh-plugin-operations-runbook-2026-10-10.md` → current candidate; verify
  commands/paths.
- `dsh-plugin-upgrade-followup.md` → split or mark historical: `:14-18`
  says v0.49.30 is the last full table check and v0.49.50→v0.49.55 is not
  swept, so it cannot be a current "v0.49.55 parity" guarantee.
- `dsh-plugin-memory-write-contract.md`,
  `memory-promotion-contract.md`, `memory-acceptance.md` → verify against
  current memory code. `memory-acceptance.md:3-7` still references the legacy
  shared library path while `scripts/mc-acceptance.mjs:49-53` uses
  `memories.db`; correct the document or mark it historical, and record the
  choice. Long contracts need a section checklist, not three random claims.
- Design decisions, audits and reports from 2026-10 → likely `historical`;
  preserve body, add header. Do not rewrite evidence.
- `independent-package-release.md` → `current` candidate; add to the current
  section if verified.
- `research-handoff-ctx-flush-2026-11-11.md` → `historical`; its `:5` says it
  is a 0.11.1 baseline and no longer current.
- `upstream-followup-2026-10-30.md`, `domain-naming-work-global-2026-10-25.md`
  → review and record whether to index; `upstream-followup` is referenced as
  evidence by `upgrade-followup.md:217`.

## 5. Header convention

Place immediately after the document title, before the original intro:

```md
> Status: current — last verified 2026-11-15 against DSH 0.2.2-rc.1
> Scope: this fork's runtime and operator documentation
```

```md
> Status: historical — upstream research snapshot (2026-10, DSH 0.2.0-rc.2;
> package-name note added 2026-11-14)
> Not a current guarantee.
```

```md
> Status: historical — host mechanism analysis remains useful
> Plugin-specific conclusions superseded by: docs/dsh-plugin-settings-ui-contract.md
```

For audit/report docs, `Scope` names the question and date. For contracts,
`Scope` names the behavior covered. Do not remove the original
`证据基线`/baseline lines; the status header is additive. The config UI
contract's `:8` package-name note means its baseline is "2026-10 content with
a 2026-11-14 package-name edit", not pure 2026-10.

## 6. README restructure

Both READMEs use the same shape:

```md
## Documentation index

### Current documentation maintained by this fork

- Magic Context Settings UI contract (actual document title; T13)
- Operations runbook
- Memory contracts that passed the audit
- Independent package release guide

### Historical research and upstream snapshots

These are preserved for provenance; they are not current guarantees.

**Historical contracts**
- Config UI contract (historical; plugin-specific conclusions superseded →
  Settings UI contract)
- UI telemetry contract (historical unless its stale client-half claims are
  fixed and current mechanics are split out)
- Upgrade follow-up (historical baseline caveat, or split current procedure)
- Memory acceptance (if the legacy path is not corrected)

**Design decisions**
- Port feasibility / seam map
- Platform takeover & global domains
- Dreamer vector decision
- Memory mechanisms inventory
- Upstream source analysis
- Global-domain source finding
- Memory architecture challenge

**Audits & retrospectives**
- Hooks coverage (2026-10-08)
- Test design audit
- Surface write audit
- Local embedding runtime audit

**Reports**
- Dreamer token usage
- Memory solutions comparison
```

The Chinese README uses the same document set with Chinese headings; the
English README does not drop a document that exists only in one translation.
The current config/settings contract is T13's actual
`docs/dsh-plugin-settings-ui-contract.md`. T14 must verify that file exists
and already has its `> Status: current` header before linking it; if T13
ships a different path, T14 uses the actual path and records it in the matrix
rather than creating a new one. The template is illustrative: the matrix
decides which contracts are current, and the final set is baseline 20 plus
newly indexed current docs.

## 7. Checks

Write one throwaway `evidence/check_docs.py` in the acceptance bundle (not
`scripts/`), run it, and keep its output. It must:

1. **Inventory check**: extract every `docs/...md` link from the README
   **documentation-index block only** (body links are checked separately in
   check 7); compare with `docs/**/*.md` (T14 starts with 25 files: baseline
   20 indexed + 5 unindexed, excluding `docs/img`); fail if a linked file is
   missing or an unindexed `.md` lacks a matrix decision. Derive the final
   count, do not hardcode 20/24/25.
2. **Header check**: the first block after the document title is `> Status:`
   for every indexed doc (not merely somewhere in the first 10 lines).
3. **README parity**: both README link sets are identical; no extra/missing
   doc. Write `evidence/readme-parity.txt`.
4. **Link check**: resolve every relative Markdown link in both READMEs, the
   status matrix, and the changed docs (new contract, `Superseded by`,
   telemetry, upgrade-followup). Write `evidence/link-check.txt`.
5. **Current-claim check**: for each short `current` doc, sample at least
   three concrete claims; for long contracts (memory write/promotion), use a
   section-level checklist covering every section that makes a current
   guarantee. Record file:line in `evidence/current-claims.md`. If full
   verification is not feasible, mark the document historical or state the
   verified sections in its header.
6. **Config UI check**: old doc is `historical` with a scoped
   `Superseded by: docs/dsh-plugin-settings-ui-contract.md`; replacement
   exists; old body unchanged apart from the header.
7. **Body-link semantics**: assert the old config UI path appears only in
   the historical index section, or on a line that also says
   "historical"/"superseded"; it must not appear in a README current-contract
   sentence. If telemetry is historical, its body links are marked historical.
   Write `evidence/body-links.txt`.
8. **Body-change guard**: for every historical/superseded doc, compare
   `git show HEAD:docs/<file>` with the current file after removing the
   status-header block; no other body change. Run
   `git diff -U0 -- <historical-file-list> | rg '^-[^-]'` and require no
   deletions only for those files. Write `evidence/body-change-guard.txt`.
9. **No-release check**: `git diff -- package.json package-lock.json
   .github/workflows` is empty; no tag created during the T14 working window
   (T15's `v0.13.0` already exists, so compare against the T14 start ref) and
   no npm publish. Write `evidence/no-release.txt`.
10. **Diff check**: `git diff --check`.

## 8. Evidence bundle

`_bmad-output/initiative-dsh-magic-context/acceptance-windows-dsh-2026-11-15-docs-audit/`:

- `evidence/document-status-matrix.md` (the authoritative classification);
- `evidence/check_docs.py` (throwaway checker) and its outputs;
- `evidence/link-check.txt`;
- `evidence/readme-parity.txt`;
- `evidence/current-claims.md` (three claims or a section checklist);
- `evidence/body-links.txt`;
- `evidence/body-change-guard.txt`;
- `evidence/no-release.txt`;
- `acceptance-report.md` (what changed, what did not, residual historical
  claims);
- `REPRODUCE.md` (commands to re-run the checks).

No host run or model call is needed for T14. If a `current` classification
needs host behavior that cannot be checked read-only, mark the document
`historical` or leave it out of the current section rather than guessing.

## 9. Workflow

1. Independent ticket validation; fix Critical/Fix.
2. Inventory + matrix; review the matrix before touching docs.
3. Add headers and correct only current docs.
4. Restructure both READMEs, including the body links to the config UI
   contract.
5. Run checks; write report and evidence.
6. Independent diff review; independent report audit.
7. Mark built, then done. No release.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Marking too much historical hides useful current docs | Start from evidence, not age; section checklist for long contracts. |
| Rewriting historical evidence loses provenance | Header-only for historical/superseded; body-change guard. |
| T13's contract name/path differs | T14 starts after T13; verify the actual path and link it. |
| README languages drift | Runnable link-set comparison; same matrix source. |
| A current doc still contains a false claim | Fix the claim or mark the doc historical; never leave a known contradiction. |
| Upgrade follow-up overclaims v0.49.55 parity | Split procedure/current from baseline/historical, or mark historical. |
| Docs-only changes trigger a release | No release in T14; README changes ride a later regular release, not T13. |
