---
title: README rewrite for readers
ticket: 26
status: done
---

# README rewrite — plan

## Scope

Files touched inside the product tree:

- rewritten: `README.md`, `README.zh-CN.md`
- extended: `docs/configuration.md` (add the missing `dataDir` key), `docs/architecture.md`
  (add `flush_requested` migration note and the capability table)
- new: `docs/glossary.md`
- possibly reworded: `CONTRIBUTING.md` §语言约定, only if the new structure needs it

Everything else in `_bmad-output/initiative-dsh-magic-context/acceptance-readme-rewrite-2026-11-19/`
is acceptance material: the lint script, its JSON output, the link check, the market scan and the
report. Those files live in the ticket directory, not in the product tree, and are not shipped.

No product code, no `package.json`, no version, no CI, no release.

## Source facts (re-measured after the ticket validator's corrections)

| Fact | README.md | README.zh-CN.md |
|---|---|---|
| bytes / lines | 24,220 / 242 | 22,017 / 241 |
| longest line | 2,564 chars, 19 links (205) | 2,252 chars, 19 links (204) |
| prose paragraph max | 622 (154) | 379 |
| legacy Plugins card removed | **3** — 42, 101, 228 | **3** — 41, 100, 227 |
| compaction flat/headless only | 3 — 37, 70, 168 | 3 — 36, 69, 167 |
| memory on by default | **2** — 43, 111 | **2** — 42, 110 |
| Chinese FTS limit (`porter unicode61`) | **1** — 164 | **1** — 163 |
| row id / cannot co-install | 2 — 35, 233 | 2 — 34, 232 |
| "host values never 0" | 4 — 72, 124, 143, 229 | 4 — 71, 123, 142, 228 |
| "second package not needed" | 2 — 31, 140 | 2 — 30, 139 |
| `ctx_expand` semantics | **6** — 43, 54, 67, 81, 223, 224 | **6** — 42, 53, 66, 80, 222, 223 |
| upstream version cited | 3 — 19 (`v0.49.30`), 97 (`v0.49.59`), 205 | same three |
| headings (1 h1 + 12 h2 + 4 h3) | **17** total | **17** total |

The baseline column records what exists **before** the rewrite; the target column in Requirement 4
records what must exist **after**. They are different numbers on purpose — the lint asserts the
after-targets, and this table is what proves the rewrite actually changed something.

Corrections applied after two validator rounds: the Chinese legacy-card count is 3 (not 2); "memory
on by default" is **2 in both languages** (43/111 and 42/110 — the earlier "1, implicit table row"
reading was wrong because my regex was case-sensitive and line 111 says "On by default."); the
Chinese-FTS limitation is already exactly 1 per file, and lines 158/157 are the *untested* disclosure
in the Android section, which must not be deleted. The heading total is 17 under the counting set
Requirement 6 defines (1 h1 + 12 h2 + 4 h3), not 16 — 16 was the h2+h3 count, which excludes the h1.

Two extra duplicates the validator surfaced, both real and both now rows in Requirement 4's table
rather than falling under any global threshold:

- `ctx_expand` semantics appear 6 times per file;
- the upstream version is cited three times per file with **two different numbers** (`v0.49.30` at
  line 19, `v0.49.59` at line 97). Unify: the behaviour table was reconciled against v0.49.30 and the
  command surface against v0.49.59, so state both with their scopes in one place and drop the third.

## Target outline (identical in both languages)

1 h1 + 12 h2, **no h3 at all**.

| # | 中文 | English |
|---|---|---|
| — | `# Magic Context for DeepSeek Harness — elvisw fork` | same |
| 1 | 安装 | Install |
| 2 | 装完会看到什么 | What you get |
| 3 | 常用操作 | Common tasks |
| 4 | 命令与工具 | Commands and tools |
| 5 | 设置 | Settings |
| 6 | Android | Android |
| 7 | 它访问什么 | What it accesses |
| 8 | 已知限制 | Known limits |
| 9 | 排障 | Troubleshooting |
| 10 | 文档 | Documentation |
| 11 | 参与 | Contributing |
| 12 | 出处与许可 | Provenance and license |

Heading count: 13 total (1 h1 + 12 h2), h3 count 0. This is the definition Requirement 6 and the lint
both use. The current files have **17** headings under the same counting set (1 h1 + 12 h2 + 4 h3),
so the rewrite removes the h3 layer. Those four h3 sections are:

| Removed h3 | Where its content goes |
|---|---|
| `### Telemetry badge` (en 117 / zh 116) | folded into `## Settings` as a paragraph plus the existing screenshot links; the panel walk-through stays there too, since `docs/configuration.md` has no telemetry section today and this ticket does not create one |
| `### How far the phone has been verified` (en 152 / zh 151) | folded into `## Android` as one short paragraph; the full acceptance record stays in the linked T25 report |
| `### Differences from the upstream DSH adapter` (en 217 / zh 216) | **stays in `## Provenance and license` as prose**. This is the only carrier of the breaking-change disclosure, the package-rename migration and the "cannot co-install" rule. It is not moved to `docs/` and not summarised away |
| `### Copyright and third parties` (en 237 / zh 236) | **stays in `## Provenance and license` as prose**, same reasoning (MIT attribution must remain in the README, which is what npm renders) |

Folding the last two into their parent means `## Provenance and license` grows; Requirement 7's
four-sentence rule applies per paragraph, not per section, so the section is written as several short
paragraphs rather than one long one.

Section 7 sits after Android because the flags are what a dsh-go market visitor sees first, and
before Known limits so a reader meets the capability list before the caveats.

## The risk-flag section (Requirement 9)

Measurement object: the **published** 0.18.0 tarball, SHA-256
`0ab7f5168bda13cf38db83c9af68067a14f5f78c764757ad80d73d0ce852aa30`, which matches the registry
`dist.integrity`. A local `npm pack` today produces different bytes because README changes after the
release, so it is **not** used for the numbers. The scan and its JSON are
`evidence/market-risk-scan.mjs` and `evidence/market-risk-scan.json`.

Levels come from the scanner's own constant (`scripts/core.mjs:33-36`):

| Flag | Level | Files | Category |
|---|---|---|---|
| `native-code` | high | 1 | `vendor/onnx/ort-wasm-simd-threaded.wasm` |
| `shell` | medium | 12 | 2 real, 10 false positives |
| `network` | low | 7 | 2 outbound, 1 same-origin, 2 URL bases, 2 vendored |
| `filesystem` | medium | 6 | real |

`special` note on `native-code`: the trigger is a `.wasm` file, i.e. WebAssembly bytecode, not a
native addon. The package still needs no native compilation, which is what the README has always
promised. The section says so explicitly instead of echoing the flag's name as if it were a native
module.

`shell` breakdown — `filesImportingChildProcess: 2`,
`filesWithoutChildProcess: 10`, `sqliteExecCalls: 52`:

- real: `lib/core/memory-bridge.js` → `spawnSync('git', ['rev-list', '--max-parents=0', 'HEAD'])`;
  `lib/dsh/project-drift.js` → `spawnSync('git', ['rev-parse', '--show-toplevel'])`. Both
  `timeout: 3000`, `windowsHide: true`, read-only, falling back to a directory hash when git is
  absent.
- false positives: `db.exec('PRAGMA …')` across the SQLite stores, plus `rule.pattern.exec(text)`.

`network` breakdown — all 7 files accounted for, no residue:

| File | Verdict |
|---|---|
| `lib/core/embedding-local.js` | **outbound** — model assets from `huggingface.co` / `hf-mirror.com`, sha256-pinned, cached after first load |
| `lib/core/embedding-remote.js` | **outbound** — only after the user enables a remote provider and starts a rebuild; endpoint is the user's own |
| `lib/client.js` | **same-origin** — 4 `fetch()` calls to `/mc-embedding/*` and `/mc-telemetry/*`; the only absolute URL is the endpoint hint string |
| `lib/dsh/telemetry.js` | `http://telemetry.invalid` is a `new URL(path, base)` parse base |
| `lib/dsh/embedding-lane.js` | `http://embedding.invalid`, same |
| `vendor/onnx/ort-wasm-simd-threaded.mjs` | vendored runtime; we pass a local file path |
| `vendor/onnx/ort.node.min.mjs` | vendored runtime, same |

`filesystem` — `lib/core/corpus-store.js`, `lib/core/embedding-local.js`, `lib/core/journal.js`,
`lib/core/stores.js`, `lib/dsh/embedding-lane.js`, `tools/migrate-profile-package-name.mjs`.
Accurate: the adapter writes to `<home>/.local/share/cortexkit/magic-context-dsh-poc/` by default
(`src/core/stores.ts` `defaultDataDir()`), overridable via `dataDir`
(`src/dsh/config.ts:11`, consumed at `src/index.ts:249` as `config.dataDir ?? defaultDataDir()`).

Wording rule: state the flag, the artifact that triggers it, and what breaks if the capability is
removed. Do not argue with the scanner and do not claim a level is wrong. `filesystem` is correct and
is stated plainly. `src/` paths stay in `docs/architecture.md`; the README carries artifact paths
only.

## Where displaced content goes

| Displaced from README | New home |
|---|---|
| Config key table, defaults | `docs/configuration.md` §键 — add one row to the `总开关` group: `dataDir`（默认 `~/.local/share/cortexkit/magic-context-dsh-poc`，空 = 用默认） |
| `schema v11` | `docs/architecture.md` §隔离纪律 (already there) |
| `pending_drops` | `docs/architecture.md` §双库 (already there) |
| `flush_requested` and the v10→v11 auto-migration | `docs/architecture.md` §双库 — **must be written before the README line is deleted**; verified absent from both docs today, present only at `README.md:230` / zh `:229` |
| Model asset hash pinning, mirror fallback | `docs/architecture.md` §存储与检索引擎 (already covers sha256 + mirror) — README keeps one link |
| Journal table and `activity.log` rotation size | `docs/architecture.md` — add a new `## 观测` section |
| Source-file component map | `docs/architecture.md` §组件地图 (already there) |
| `dataDir` default path and where it is consumed | `docs/architecture.md` — add to §双库 or §观测; `src/dsh/config.ts:11`, `src/index.ts:249`, `src/core/stores.ts` `defaultDataDir()` |
| Term definitions | new `docs/glossary.md` |

## Glossary design

`docs/glossary.md` is **Chinese only**, matching `CONTRIBUTING.md:6` (`docs/` is Chinese). Terms are
grouped by area rather than alphabetised, one line each: term, one-sentence meaning, and the file
that implements it where useful. The English README links to it and marks the target as Chinese.

Requirement 3 asks each README to explain the words *that file actually uses*: the Chinese file
explains 回收带 / 基线 / 门禁 / 嵌入-向量 / 四层摘要, the English file explains reclaim band /
baseline / gate / embedding / compartment. Words common to both (`§N§`, `H`/`Q<n>`, historian,
FTS5, tick, parity, overlay, composer, flat/headless, pre-step, execute band, four summary layers,
HMR, surface) appear in both. The glossary holds the union, so a reader who lands on it from either
file finds the same set.

Every term on those lists must actually appear in the corresponding README; the lint asserts it.
`压缩段` is **not** on the Chinese list even though it appears at zh `:123`, because there it is a
UI label inside the message-composition list, not an unexplained concept. `四层摘要` is on the list
instead: it is unexplained at zh `:68` and `:162`.

## Banned-word list

This list is the single source of truth. The lint script parses the two marked blocks below and
fails the build on any literal hit, so the ticket and the script cannot drift apart.

**Hard list — zero tolerance, checked mechanically.**

<!-- banned:zh -->
赋能
助力
打造
一站式
无缝
极致
全方位
令人叹为观止
深刻变革
深入探讨
众所周知
<!-- /banned:zh -->

<!-- banned:en -->
delve
pivotal
testament
cutting-edge
game-changer
harness the power
unlock the full potential
robust solution
<!-- /banned:en -->

**Soft list — reviewer judgement, not linted.** These read as marketing only in certain positions
("强大" before a noun product claim is bad; "高效" describing an algorithm is fine). The reviewer
flags them; the author either rewrites or keeps with a reason.

<!-- soft:zh -->
强大
高效
灵活
开箱即用
值得注意
简而言之
<!-- /soft:zh -->

<!-- soft:en -->
powerful
flexible
comprehensive
effortless
at the end of the day
it's not just
leverage
showcase
<!-- /soft:en -->

**Sentence patterns — manual, not mechanised.** No three-noun benefit lists as an opener; no
"不仅是 X 还是 Y" / "it's not just X, it's Y"; no "作为…的证明" / "stands as a testament".

## Verification plan

1. **Mechanical** — `_bmad-output/.../acceptance-readme-rewrite-2026-11-19/evidence/readme-lint.mjs`
   asserts, and writes `readme-lint-after.json`:
   - heading structure: 1 h1 + 12 h2, identical order across both files, h3 count 0;
   - the hard banned lists above, parsed out of this plan between the `banned:zh` / `banned:en`
     markers, have zero literal hits;
   - the Requirement 4 table's targets: the six "exactly 1" facts appear once per file, the four
     "≤ 2" facts appear at most twice per file;
   - forbidden identifiers absent: `pending_drops`, `flush_requested`, `memory_embeddings`,
     `compartments`, `schema v11`, `EMBEDDING_ASSETS`, `defaultDataDir`, and any `src/` path;
   - single `compartment` is allowed and asserted present where explained;
   - no line over 400 chars; no line with more than 5 links;
   - `docs/glossary.md` exists, covers Requirement 3's union list, and every listed term appears in
     the README that is supposed to explain it;
   - the risk section's four numbers (12 / 2 / 10 / 52) **and all four per-flag levels** equal
     `market-risk-scan.json`'s `numbersForReadme` and `levels`, and every flag names the artifact the
     JSON's `evidence` block attributes it to.
2. **Links** — every absolute URL is requested and every repo-relative path resolved; results in
   `evidence/link-check.json`. Absolute `docs/` URLs are mandatory because `package.json` `files`
   omits `docs/`, so the npm page renders README without those files present.
3. **Human reading** — one independent reviewer answers two questions: can a newcomer install and
   perform one reclaim from the README alone, and can they paraphrase what installation and reclaim
   each did. Findings fixed or recorded in one pass, no second round.
4. **No product gate** — documentation only: no typecheck, no vitest, no `npm pack`, no host gate,
   no `npm run check:i18n` (that validates the client dictionary, not README prose). The report says
   this explicitly instead of implying the change was product-tested.

## Risks

- **Breaking the `CONTRIBUTING.md:6` alignment rule.** Caught by the heading assertion, which counts
  1 h1 + 12 h2 and requires h3 = 0 in both files.
- **Deleting a fact a user needs.** Mitigated by the displaced-content table: nothing is removed
  without a destination, and `flush_requested` plus `dataDir` are the two items where the
  destination must be written before the README line goes.
- **The provenance section growing past readability.** The two h3 sections there are folded into
  prose rather than delegated to `docs/`, because MIT attribution and the breaking-change disclosure
  must stay where npm renders them. Requirement 7 applies per paragraph, so it is written as several
  short paragraphs.
- **Absolute URLs rotting if the repository is renamed.** Pre-existing and already accepted in
  `0142037`; a rename would need a sweep either way.
- **The hard banned list forcing awkward paraphrases.** Kept to literal marketing tokens; ordinary
  technical adjectives sit in the soft list instead.
- **Stale numbers if the package composition changes later.** The lint compares against the scan
  JSON, so a drift fails loudly rather than silently.
