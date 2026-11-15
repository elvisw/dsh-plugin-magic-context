# Reproduce T14 checks

Run from the repository root. T14 is documentation-only; no host or model run is needed.

## 1. Inventory, headers, parity, links

```powershell
python "_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-15-docs-audit\evidence\check_docs.py"
```

Expected final line: `T14 CHECKS PASS`.

The script writes these files into the same `evidence/` directory:

- `inventory.txt` — 25 docs and 25 links per README, no missing/unindexed.
- `readme-parity.txt` — identical English/Chinese link sets.
- `readme-split.txt` — 4 current / 21 historical, no mismatch.
- `header-check.txt` — first block after every title is `> Status:`.
- `link-check.txt` — every checked relative Markdown link resolves.
- `config-ui-check.txt` — old config UI is historical and points at the T13 contract.
- `body-links.txt` — old config/telemetry body links are historical.
- `body-change-guard.txt` — 21/21 historical bodies unchanged except the header.
- `current-claims.md` — spot checks for current documents.
- `no-release.txt` — no package/workflow diff, no T14 tag, no publish.
- `diff-check.txt` — `git diff --check`.

## 2. Inspect the matrices

Open:

```powershell
Get-Content "_bmad-output\initiative-dsh-magic-context\acceptance-windows-dsh-2026-11-15-docs-audit\evidence\document-status-matrix.md"
```

Every row has a status, evidence baseline, last-verified date, replacement field, and
rationale. The unindexed-doc section records where the five newly indexed files went.

## 3. Basic repository checks

```powershell
git diff --check
git diff -- package.json package-lock.json .github/workflows
```

The first command must have no whitespace errors (Git may print CRLF conversion warnings
on Windows); the second must be empty. This ticket creates no tag and runs no npm command
that publishes.

## 4. Expected counts

- `docs/*.md`: 25 files.
- README links: 25 unique `docs/...md` links in each language.
- Status split: 4 current, 21 historical.
- Historical body guard: 21 PASS.
- No release artifact: no `t14*` tag.
