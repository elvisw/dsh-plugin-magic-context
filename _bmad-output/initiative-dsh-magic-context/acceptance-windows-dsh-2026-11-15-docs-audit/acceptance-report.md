# T14 — Documentation index and contract status audit

Status: **PASS** (documentation-only audit; no source, package, or release changes).

## Result

All 25 Markdown files under `docs/` are now linked from both READMEs. Each file has a
visible `> Status:` block immediately after its title. The two READMEs use the same
four-document current section and the same 21-document historical section.

Current documentation (4):

- `docs/dsh-plugin-settings-ui-contract.md` — T13's shipped Settings contract.
- `docs/dsh-plugin-operations-runbook-2026-10-10.md` — operator commands and recovery.
- `docs/dsh-plugin-upgrade-followup.md` — current re-alignment procedure; its §1 is
  explicitly a historical v0.49.30 baseline, not v0.49.55 parity.
- `docs/independent-package-release.md` — package identity, migration, and release guide.

Historical (21): the memory write/promotion/acceptance snapshots, the old config UI and
telemetry contracts, hooks coverage, seven 2026-10 design decisions plus the 2026-10-25
domain-naming decision, three audits, two reports, and the two upstream handoffs.

The old config UI contract is `historical` with:

```text
> Superseded by: docs/dsh-plugin-settings-ui-contract.md
```

Its body is unchanged; the body-change guard runs `git diff -U0` for each historical
document and requires exactly one hunk at the title boundary (`@@ -2,0 +3,N @@`) with zero
deletions; it reports 21/21 PASS.

The README quick-start now says the Settings card edits the options it exposes, not
“every volatile option”, matching the 22 entries in `src/client/index.js:322-394`.

## Checks

- `evidence/inventory.txt` — 25 docs, 25 links in each README, no missing or unindexed file.
- `evidence/readme-parity.txt` — the English and Chinese link sets are identical.
- `evidence/readme-split.txt` — 4 current / 21 historical in both languages, no mismatch.
- `evidence/header-check.txt` — every indexed file's first block after the title is `> Status:`.
- `evidence/link-check.txt` — every checked relative Markdown link resolves.
- `evidence/config-ui-check.txt` — historical marker, scoped replacement, replacement exists.
- `evidence/body-links.txt` — in both READMEs the old config UI path appears only in the
  historical index; cross-references in other docs are not current-contract links.
  Telemetry body links are labeled historical.
- `evidence/body-change-guard.txt` — 21/21 historical bodies unchanged beyond the header.
- `evidence/current-claims.md` — spot checks for the four current documents.
- `evidence/no-release.txt` — package/release/workflow diff empty; no T14 tag; no publish.
- `evidence/diff-check.txt` — `git diff --check` produced no whitespace errors (CRLF
  conversion warnings only).

## What was not changed

- No source, test, schema, host-store, package metadata, workflow, tag, or npm change.
- Historical research bodies were not rewritten; only status headers were added.
- The T13 Settings UI contract was not edited by this ticket.
- Current-document verification is a spot check of representative claims, not a full
  re-audit of every historical statement. The status matrix records the evidence baseline
  for each file.

## Residual caveats

- `docs/dsh-plugin-memory-write-contract.md` remains a mixed snapshot: its storage shapes
  are still useful, but §8 authority is explicitly historical.
- `docs/dsh-plugin-ui-telemetry-contract.md` is historical; later appendix notes are
  dated observations, not current guarantees.
- The operations runbook is current for the checked scripts and paths; it was not run
  end-to-end in this ticket.
