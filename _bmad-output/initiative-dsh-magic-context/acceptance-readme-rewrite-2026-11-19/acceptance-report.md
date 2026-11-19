# T26 acceptance report — README rewrite for readers

Date: 2026-11-19
Ticket: `tickets/story-readme-rewrite-for-readers.md` (id 26)
Status: implementation complete, verification complete, nothing published.

## 1. What changed

Product documentation only. No file under `src/`, `tests/` or `scripts/` changed, and
`package.json` was read but not edited.

| File | Before | After | Change |
|---|---|---|---|
| `README.md` | 242 lines / 24,220 B | 408 lines / 26,468 B | rewritten |
| `README.zh-CN.md` | 241 lines / 22,017 B | 354 lines / 24,286 B | rewritten |
| `docs/glossary.md` | did not exist | 112 lines / 5,335 B | new |
| `docs/architecture.md` | 64 lines / 3,900 B | 93 lines / 6,612 B | `## 观测` section; `flush_requested` migration note and `dataDir` default added to `§双库` |
| `docs/configuration.md` | 75 lines / 8,806 B | 75 lines / 8,949 B | `dataDir` row added to the key table |

Line counts grew. That is the intended direction of three requirements, not drift: the
term table (~26 rows) exists because Requirement 3 forbids unexplained terms; the "What it
accesses" section exists because Requirement 9 answers the market scanner's four flags with
measured facts; and the 2,564-character line carrying 19 links became 25 itemised entries.

## 2. What the rewrite was measured against

Baseline measured on `HEAD` before the rewrite (`evidence/readme-lint-before.json`,
74 checks, 48 failing):

- one line carrying 19 links at 2,564 characters (English) and 2,252 (Chinese);
- legacy Plugins card removal stated 3× per file; compaction-takeover scope 3×;
  memory-on-by-default 2×; shared row id 2×; `ctx_expand` semantics 6×;
- upstream version cited 3× with two different numbers (`v0.49.30` and `v0.49.59`);
- `pending_drops`, `compartments`, `schema v11` in reader-facing prose;
- 16 unexplained internal terms.

Two of those baseline numbers were corrected during validation, because my first
measurements were wrong:

- "memory on by default" is **2× per file**, not 1 — the first regex was case-sensitive
  and missed "On by default.";
- "host values never 0" is **4× per file**, not 3 — line 124 says "omitted rather than
  shown as 0", which is the same statement in other words.

Both corrections are recorded in the plan's source-fact table rather than quietly fixed.

## 3. Verification performed

### 3.1 Mechanical checks — `evidence/readme-lint-after.json`

81 checks, 0 failing. Covers heading structure (1 h1 + 12 h2, identical order, no h3),
the hard banned-word lists, the 11 duplicate-count targets, forbidden identifiers
(including schema version numbers), line length and link count, and the risk section's
eight numbers plus four per-flag levels against `evidence/market-risk-scan.json`.

The banned-word lists are parsed out of the plan rather than duplicated in the script, so
there is one list rather than two that can drift apart.

### 3.2 Links — `evidence/link-check.json`

100 unique targets: 74 in-repo paths, 4 repository-relative paths, 2 in-page anchors, and
11 unique external URLs (20 links total). 0 failures.

In-repo targets are checked offline against `git ls-files` plus the working tree. They all
point into this same repository, so requesting them over HTTP would only have earned rate
limiting — the first version of the script did exactly that and hung.

External URLs were fetched once each. GitHub answered 200 for all of them on the final run;
the script carries a `gh api` fallback for transport failures, because this host reaches
GitHub through a proxy that dropped connections intermittently during development. npmjs
answers 403 to non-browser clients and is recorded as anti-bot rather than dead.

### 3.3 The four risk flags — `evidence/market-risk-scan.json`

Produced by replaying `ccch1mneyyy/dsh-go-market`'s scanner rules against the **published**
0.18.0 tarball (`matchesPublished: true`, established against registry `dist.integrity`),
not a local `npm pack` — the README changed after the release, so a fresh pack cannot
reproduce the published bytes.

| Flag | Level | Files | What is real |
|---|---|---|---|
| `native-code` | high | 1 | the vendored onnxruntime `.wasm` — WebAssembly bytecode, no native compilation |
| `shell` | medium | 12 | 2 import `node:child_process`; 10 are `db.exec('PRAGMA …')` or regex `.exec()` false positives (52 hits in that class) |
| `network` | low | 7 | 2 outbound (pinned model download; the user's own endpoint after an explicit action), 1 same-origin, 2 `.invalid` parse bases, 2 vendored onnxruntime files |
| `filesystem` | medium | 6 | accurate as stated |

### 3.4 Human reading review

One read-through, by a reviewer who read the files as a reader rather than an auditor; the
mechanical checks were explicitly out of scope. Verdict: **NEEDS A PASS**, with these
findings, all fixed in one pass:

| Finding | Fix |
|---|---|
| Only `--profile web` shown, while the README claims desktop support | added the `--profile desktop` note; added the `remove` command that was missing |
| `ctx_reduce` shown as if the user types a tool call | examples now show intent → model call; `ctx_expand` and `ctx_memory` corrected too, for consistency |
| Reclaim band never says *when* it opens | names the 65% threshold, the five-minute age limit and `/ctx-flush` |
| "Remove it and local vectors cannot run" reads as an imperative in a security section | "Without it, …" |
| `Copy switches between …` reads as the verb | "Interface text switches …" |
| "That class accounts for 52 hits" — class unclear | "Those false positives account for 52 hits" |
| `command surface` collides with the defined term `surface` | "the slash commands"; `cortexkit` spelled out as `cortexkit/magic-context` |
| Glossary promised to define every term; 4 were missing | added `defer`, `token pair`, `host side`, `three-state` |
| Troubleshooting commands assume a checkout | prefixed with "From a checkout of this repository" |
| `memory.enabled: false` alone would drop bundled keys | says to add `enabled: false` inside the existing `memory` block, and why |
| "Accumulated changes from upstream 0.11.2 through 0.18.0" reads as an upstream release | "Changes in this fork since upstream 0.11.2, up to 0.18.0" |
| **Factual error:** claimed both git calls fall back to a directory hash | memory bridge does (`memory-bridge.ts:391`); the drift check returns `undefined` (`project-drift.ts:95`) — text corrected |
| Chinese direct translations | the sentences the reviewer listed were rewritten: 收成摘要 → 会变成摘要, token 对 → 已用 / 上限 token, 作为依赖消费 → 作为依赖引入, 逐个都有归属 → 每一个都能说清来路, 宿主半侧 → 宿主侧, 版本和 tag 归本 fork → 属于本 fork, plus the glossary's 首次写入时比值 and the unsplit 与-chain |

The factual error is the one worth calling out: it was in the section explaining what the
package does with the shell, and it would have misled exactly the reader who went there to
check.

## 4. What this packet does not claim

- **No product gate ran.** No `npm test`, no typecheck, no `npm pack`, no host gate, no
  version bump. Nothing under `src/`, `tests/`, `scripts/` or `package.json` changed. A
  statement that the documentation checks pass is not a statement that the product passes.
- **No release.** `0.18.0` remains the published version. The npm README still shows the
  pre-rewrite text until a new version is published.
- **Absolute URLs are correct, not yet live.** They point at `main`, so they resolve after
  this commit is pushed. The offline check verifies the target path exists in the
  repository, which is what makes the URL right after the push.
- **The risk numbers are a snapshot.** They reproduce the market scanner's rules as of
  2026-11-19 against 0.18.0. Changing the scanner or the package invalidates them.
- **Two baselines are stated, not unified.** The behaviour table was reconciled against
  cortexkit v0.49.30 and the command surface against v0.49.59. The README now says both
  numbers in one place with their scopes instead of implying a single version.

## 5. Evidence index

| File | What it is |
|---|---|
| `evidence/readme-lint.mjs` | the check script (not in the repo, not in CI) |
| `evidence/readme-lint-before.json` | 74 checks against `HEAD`, 48 failing |
| `evidence/readme-lint-after.json` | 81 checks, 0 failing |
| `evidence/link-check.mjs` | link checker |
| `evidence/link-check.json` | 100 targets, 0 failures |
| `evidence/market-risk-scan.mjs` | scanner replay against the published tarball |
| `evidence/market-risk-scan.json` | flags, levels, per-file attribution, tarball SHA-256 |
| `evidence/classify-shell-hits.mjs` | splits the 12 `shell` files into 2 real and 10 false positives |
| `REPRODUCE.md` | how to re-run each of the above |
| `write_manifest.py` | hashes this directory |
| `evidence/sha256-manifest.json` | the hashes |
