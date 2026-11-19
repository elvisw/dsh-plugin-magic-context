# Reproducing the T26 README rewrite checks

Everything here is documentation quality evidence. None of it is a product gate: no
typecheck, no vitest, no `npm pack`, no host gate. That is deliberate — this ticket
changed two READMEs plus three documents, and no file under `src/`, `tests/` or
`package.json`.

## Files the checks read

```
README.md
README.zh-CN.md
docs/glossary.md
docs/configuration.md
docs/architecture.md
package.json                    (only the `files` field)
git index                       (via `git ls-files`)
```

## 1. Structure, wording and duplicate counts

```sh
node _bmad-output/initiative-dsh-magic-context/acceptance-readme-rewrite-2026-11-19/evidence/readme-lint.mjs .
```

Prints a JSON report and exits non-zero if any assertion fails. 81 checks. The expected
result after the rewrite is `"failed": 0`.

The script takes the hard banned-word lists from the ticket plan rather than carrying its
own copy, by parsing the blocks between `<!-- banned:zh -->` / `<!-- /banned:zh -->` and
`<!-- banned:en -->` / `<!-- /banned:en -->` in
`tickets/story-readme-rewrite-for-readers-plan.md`. Editing the plan therefore changes the
check, which is the point: one list, one place.

Saved outputs:

- `evidence/readme-lint-before.json` — the same script against the pre-rewrite READMEs
  (48 of 74 checks failing at that point; the count differs because seven assertions were
  added afterwards — the `v11` token and three more risk numbers in both languages).
- `evidence/readme-lint-after.json` — 81 checks, 0 failing.

## 2. Links

```sh
node _bmad-output/initiative-dsh-magic-context/acceptance-readme-rewrite-2026-11-19/evidence/link-check.mjs .
```

Two mechanisms, picked by target:

- A URL under `github.com/elvisw/dsh-plugin-magic-context/blob/main/` or
  `raw.githubusercontent.com/elvisw/dsh-plugin-magic-context/main/` is mapped to a
  repository path and checked against `git ls-files` plus the working tree. About eighty
  targets are in this class; they all point into this same repository, so requesting them
  over HTTP only earns rate limiting.
- Anything else is requested once with a browser user agent and a 15-second deadline.
  Eleven unique URLs are in this class. `403` from npmjs or shields counts as anti-bot,
  not as a dead link.

A file created by this ticket is untracked until the commit, so the path check accepts a
target that exists on disk even when `git ls-files` does not know it yet.

Saved output: `evidence/link-check.json`.

## 3. The four market risk flags

```sh
node _bmad-output/initiative-dsh-magic-context/acceptance-readme-rewrite-2026-11-19/evidence/market-risk-scan.mjs
node _bmad-output/initiative-dsh-magic-context/acceptance-readme-rewrite-2026-11-19/evidence/classify-shell-hits.mjs
```

Both run against the **published** 0.18.0 tarball, not a local `npm pack` — the README
changed after the release, so a fresh pack cannot reproduce the published bytes. The
tarball's SHA-256 is recorded in `evidence/market-risk-scan.json` together with
`matchesPublished: true`, established by comparing against the registry's
`dist.integrity`.

`classify-shell-hits.mjs` splits the 12 `shell`-flagged files into the two that really
import `node:child_process` and the ten whose `exec(` hits are `db.exec('PRAGMA …')` or a
regular expression's own `.exec()`.

## 4. Human reading review

One review, not a loop. The reviewer read both READMEs as a reader rather than an auditor
and answered two questions: whether a newcomer can install the plugin and complete one
reclaim from the README alone, and whether they can paraphrase what installation and
reclaim each did. Findings were fixed in one pass; there is no second round. The
mechanical checks above were out of scope for that review and the reviewer did not
re-run them.

## What this packet does not claim

- It does not claim the documentation change was product-tested. No test suite, build or
  host gate ran for this ticket.
- It does not claim the absolute URLs resolve on the `main` branch *today*: they will,
  once this commit is pushed. The offline check verifies the target path exists in the
  repository, which is the property that makes the URL correct after the push.
- It does not claim the risk-flag classification is exhaustive. It reproduces the market
  scanner's own rules and attributes each flagged file; if the scanner's heuristics
  change, the numbers in `market-risk-scan.json` become stale.
