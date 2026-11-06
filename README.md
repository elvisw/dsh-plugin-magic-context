# dsh-plugin-magic-context — Magic Context adapter for DeepSeek Harness

[![CI](https://github.com/wk544863858/dsh-plugin-magic-context/actions/workflows/ci.yml/badge.svg)](https://github.com/wk544863858/dsh-plugin-magic-context/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-plugin-magic-context)](https://www.npmjs.com/package/dsh-plugin-magic-context)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](package.json)
[![DeepSeek Harness](https://img.shields.io/badge/DSH-0.2.x-blue.svg)](package.json)

> **English** | [简体中文](README.zh-CN.md)

> Anyone who has run long sessions knows the symptoms: the project details you worked out
> yesterday are gone today, so the same pit gets re-dug; tool outputs bloat the context
> window; and every compaction busts the cache prefix, so the expensive part re-runs.
>
> [Magic Context](https://github.com/cortexkit/magic-context)'s answer: **knowledge should
> persist, context should be managed.** This plugin gives **DeepSeek Harness (DSH)**
> sessions a **persistent, project-aware memory** — knowledge distilled from your sessions
> survives restarts, is searchable with hybrid full-text + local vector search, and is
> re-injected right where the model reads it — while the context window itself is run as
> an asset: tool results become tagged, reclaimable history, digests come back as
> four-level summaries, and none of it ever breaks the live KV-cache prefix.

- **Memory that outlives the session** — a project corpus in the plugin's own SQLite store;
  historian facts auto-promote into it, `ctx_memory` reads/writes/maintains it, and project
  identity is auto-derived (git root or directory).
- **Local-first retrieval** — MiniLM embeddings via WebAssembly (no native build, no API
  keys), hybrid full-text 0.7 / vector 0.3 ranking, fail-open to full-text on any failure.
- **Sharing with a human gate** — machine/org global domains: staging can be automated,
  publishing is always yours (approval cards, `/ctx-global approve`); a user-profile layer
  rides on top with read / collect / review as separate switches.
- **Reversible reclaim, cache-aware compaction** — `ctx_reduce` only queues; drops land as
  `[dropped §N§]` placeholders and `ctx_expand` restores the original; history digests into
  p1–p4 summaries published as range replacements — never a spontaneous prefix bust.
- **Conservative by default** — the host `compaction-basic` engine stays in place unless
  you explicitly opt in.

Requires **Node ≥ 22.19** and a **DSH 0.2.x** desktop host. The package ships compiled —
install straight from the npm registry:

```bash
dsh plugin --profile desktop add dsh-plugin-magic-context
```

New to the plugin? A five-minute tour follows in [Quick start](#quick-start);
configuration, tools and architecture are covered in full below. A complete Chinese
translation is at [README.zh-CN.md](README.zh-CN.md). Contributions are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Quick start

After installing, the plugin hot-loads (no restart). In your next session:

- Tool results carry `§N§` tags; a **telemetry badge** appears in the overlay showing live
  context occupancy, with a panel of live metrics and an operation record behind it.
- A **settings card** for the plugin shows up on the GUI Plugins page.
- The `ctx_reduce` / `ctx_expand` / `ctx_memory` tools are registered for the agent;
  project memory is **on by default** — facts distilled by the historian persist across
  sessions and surface where the model reads them.

Context reclaim, in one exchange (real parameter names):

```text
you:   ctx_reduce {"drop": "4-7"}      # four tool outputs are no longer worth the tokens
agent: queued 4 item(s) — the drops land as placeholders in the next reclaim band
…later in the transcript…
[dropped §4§] [dropped §5§] [dropped §6§] [dropped §7§]
you:   ctx_expand {"tags": "5"}        # wait — what was in §5 again?
agent: the original text of §5 is restored in place
```

The only opt-in surface is the compaction takeover (`registerCompactionEngine`, off by
default — see [Configuration](#configuration)).

## What it does

Memory first, context management second — the first five rows are the memory system, the
last five manage the context window (full design in [Architecture](#architecture) and
[PARITY.md](PARITY.md)):

| Capability | Mechanism |
|---|---|
| **Project memory (own corpus)** | Plugin's own SQLite store (`memories.db`), hard-split from upstream — no shared storage, no compatibility duty. Project identity auto-derived (`git:<root-sha>` / `dir:<hash>`); injected into the m[0] baseline and served to `ctx_memory` for read/write; historian facts auto-promote; FTS 0.7 / vector 0.3 hybrid retrieval |
| **Local vector lane** | MiniLM embeddings run locally via the bundled onnxruntime-web WASM backend — no native build, no API keys; the model download is pinned by revision + sha256 (mirror fallback), cached in the plugin data dir; retrieval candidates get inline + maintenance-tick backfill; any failure fails open to full-text search |
| **m[0]/m[1] memory baseline** | A synthetic notice node carries the frozen baseline plus incremental lanes (`<new-memories>` / `<memory-updates>` / `<user-profile>`); each lane keeps its own watermark, so new memory never rebuilds the cached prefix — unchanged content produces zero diff |
| **Global domains + user profile** | machine/org domains: **staging can be automated** (maintenance tick, LLM classification), **publishing is always human** (approval cards, `/ctx-global approve`); the user profile's render / collect / review are separate switches |
| **Maintenance tick (MC dreamer slice)** | Every 30 min: TTL archiving → batched LLM verify (keep / update / archive) → vector backfill → global-domain candidate staging |
| **Reversible context reclaim** | Tool results get `§N§` tags; `ctx_reduce` **only queues** — drops land in the execute band as `[dropped §N§]` placeholders referencing the originals; `ctx_expand` restores the original text. The cached prefix is never busted spontaneously |
| **Pressure scheduling** | Persistent usage (incl. cache reads/writes) → pressure score → execute/defer decisions (65% threshold, 5 min cache TTL, 85% force band); `CONTEXT_WINDOW_EXCEEDED` triggers emergency reclaim + retry; tiered reduce-guidance nudges |
| **Historian (out-of-band digest)** | One LLM call replays the real prefix (KV cache preserved) → four-tier p1–p4 summary + facts/events, **writes the store only, never touches the wire**; published in the execute band as a `[compacted §C<n>§]` range replacement; `/ctx-recomp` redoes compacted history in place |
| **Compaction seam** | `registerCompactionEngine` can take over `ctx.compaction` (real `compaction/start\|summary\|replace\|end` protocol); **off by default** — the host compaction-basic stays in place |
| **UI integration** | Settings card on the Plugins page (volatile fields, save = live); `shell.overlay` telemetry badge + capsule panel (live metrics + operation record); `session-notice` rows in the session stream; Chinese/English instant switching |

## Installation

From the npm registry — recommended; the package ships compiled `lib/` and `vendor/`, no
local build needed:

```bash
dsh plugin --profile desktop add dsh-plugin-magic-context
```

Registry versions are published automatically by tag pushes (with npm provenance
signatures); see the "Releasing" section of [CONTRIBUTING](CONTRIBUTING.md).

### From source (development)

```bash
git clone https://github.com/wk544863858/dsh-plugin-magic-context
cd dsh-plugin-magic-context
npm install
npm run build     # tsc → lib/ (multi-file ESM) + browser half copied to lib/client.js
dsh plugin --profile desktop add <path to this repo>   # the CLI ships with the app; the spec can be a Git URL, a local path, or a registry version
```

Installing does three things: `pnpm add` into the profile (`link:` for local paths),
appends the package name to `dsh.profile.bundles`, and the loader composes it. **Desktop
has HMR → takes effect immediately** (no restart; running sessions start tagging right
away).

- All `@deepseek-ai/*` in `peerDependencies` are declared `"*"` — the compatibility
  precheck passes on any DSH 0.2.x; the host packages actually imported at runtime are
  also listed as **exact-version dependencies** (resolved with the package; `link:` dev
  installs are served by this repo's own node_modules).
- **Node ≥ 22.19** required: the stores build on the built-in `node:sqlite`, no native
  modules (the desktop host is an Electron RunAsNode process; ABI-compiled modules are not
  portable).
- **Tool-constructor resolution**: `config.defineTool` (host-injected, used by in-tree
  glue) first, then dynamic `import('@deepseek-ai/dsh-tools')` (a hard dependency,
  physically resolvable in every install shape). If both are unavailable the mount **fails
  loudly** — the ctx_* tools are the only entry point for reclaim tags; no silent
  half-boot.
- Two loading modes: **patch-overlay / file URL** (development: overlay yml +
  `config.defineTool` injection) and **profile install** (production: package-name line +
  link dependency). The production path is the `dsh plugin add` above.

Uninstall / disable: disable the bundle on the GUI Plugins page (writes `disabled` into
the profile patch), or `dsh plugin --profile desktop remove dsh-plugin-magic-context`.

## Configuration

Two ways to change configuration, with different semantics (see the
[config UI contract](docs/dsh-plugin-config-ui-contract.md)):

- **GUI settings card**: exposes `policy.*` (incl. historian generation cap / ceiling /
  timeout), `historianEnabled`, `registerCompactionEngine`, `journal.*`, `maintenance.*`,
  `historian.*` and other volatile fields. The two provider/model **route pins**
  (maintenance verify, historian generation) prefer a dropdown fed by the **host's
  configured model catalog** (client `remote.session.modelCatalog()`), with
  "Auto = follow the session route" and clearing; shells without that RPC fall back to
  plain text (values remain hand-editable). Writes go through the settings chain:
  non-volatile keys are preserved untouched, untouched fields never materialize into
  override rows — **saving takes effect immediately** (the host side always reads through
  `liveNumber/liveBoolean/liveString/liveRoute` at the decision point).
- **Hand-written profile override rows**: `config` **replaces** the package patch's config
  wholesale — it is **not** a deep merge. Writing only `memory:` erases
  `registerCompactionEngine: false`. When hand-writing overrides you must spell out every
  key you want to keep.

The bundle's built-in config is one line: `registerCompactionEngine: false` — a
conservative first install that keeps the host compaction engine in place (memory, reclaim
and historian are on by default). To take over compaction:

```yaml
- id: magic-context-dsh
  name: 'dsh-plugin-magic-context'
  config:
    registerCompactionEngine: true
- id: compaction-basic
  name: '@deepseek-ai/dsh-compaction-basic'
  disabled: true          # mutually exclusive; taking over requires disabling the host engine too
```

Configuration reference (full types in [src/dsh/config.ts](src/dsh/config.ts); all keys
writable as profile override rows unless noted):

| Group | Keys (defaults) | Notes |
|---|---|---|
| Master switches | `enabled` (true) · `registerTools` (true) · `registerStatusCommand` (true) · `sessionNotices` (true) · `reduceGuidance` (true) · `searchHint` (true) | `enabled: false` stays loaded but fully inert; `sessionNotices` controls the management notice rows in the session stream |
| Compaction seam | `registerCompactionEngine` (code default: mount when resolvable; **ships false in the bundle**) · `compactionBase` (host-injected base class) | Taking over requires disabling compaction-basic too; pre-step `reconcileEngine` mounts/unmounts dynamically every step |
| Pressure policy | `policy.*`: `executeThreshold` (65) · `forceThreshold` (85) · `ttlMs` (5 min) · `assumedContextWindow` (256k) · `protectedToolResults` (8) · `historianTimeoutMs` (120 s) · `historianMaxTokens` (8192, raised to 8192 if set lower) · `historianMaxTokensCeiling` (32768) · `baselineTokens` (2000) · `memoryBudgetTokens` (8000) · `memoryLimit` (40) · `forceWaitReadyMs` (0) | Thresholds take effect at the next decision point (incl. `/ctx-status` and the compaction-engine paths). `compartmentGuardMode` / `compartmentEntrantTokens` (publish guards) were retired and are no longer configurable |
| historian | `historianEnabled` (true) · `historian.{provider, model}` (**pinned as a pair**; empty = follow the session's last route) | Generation route for out-of-band digests and `/compact` summaries; the GUI card has "Historian provider/model" dropdowns (Auto = follow session, recommended). The only LLM spend besides verify |
| Project memory | `memory.{}`: `enabled` (true, on by default since 0.9.0 — opt out with `enabled: false`) · `dbPath` · `project` (omitted = session cwd) · `domainProjects` · `shareCategories` · `autoPromote` (true) · `write` (true) | `write: false` makes `ctx_memory` read-only |
| Retrieval / vectors | `memory.embedBackfill` (true, query-side inline backfill) · `memory.vectorBackfill` (true, maintenance-tick backfill) · `memory.vectorBackfillLimit` (24 rows/tick) | Any vector-lane failure fails open to FTS |
| S(t) decay | `memory.scoring.{enabled (true), alpha (0.4), beta (0.2), archiveThreshold (2), halfLives}` | Stats are always collected; the distribution default enabled=true takes over ranking; profile-JSON only, not on the settings card |
| Global domains | `memory.global.machine.{enabled (true), excludeProjects, autoStage (true)}` · `memory.global.user.{render (true), collect (true), review (true)}` · `memory.global.review.batchLimit` (50) | Defaults all on: staging can be automated (≤3/pass, paused at ≥10 pending candidates), **publishing is always human**; LLM classification failure is fail-closed |
| User profile | `memory.global.user.{render (true), collect (false), review (false)}` | Read / collect / review are independent halves; the two halves that write to the shared store are off by default |
| Domain resolution | `memory.domains.source` (`adapter` \| `contract`) | `contract` is a fallback pole for comparison, not a supported end state |
| Maintenance | `maintenance.{enabled, intervalMs (30 min), verifyProvider, verifyModel}` | LLM verify needs an explicit route (unpinned = follow the conversation's latest route); the GUI card offers host-catalog dropdowns, Auto = unpinned (same picker for both pins) |
| Observability | `journal.{enabled (true), level (info), retentionDays (30), mirror (true)}` · `tags.retentionDays` (30) | level/mirror apply to the next write; a journal that was off at mount needs a restart to turn on at runtime; `retentionDays` has a `min(1)` floor against accidental pruning |

## Tools & commands

Agent tools (registered at mount; `registerTools: false` turns them off):

| Tool | What it does |
|---|---|
| `ctx_reduce` | Parses MC range syntax (`"3-5,8"`) → **queues only**; landing is a priced bust that waits for the reclaim band, never spontaneous |
| `ctx_expand` | **Restores the original text** from the source event referenced by a placeholder (what gets restored is the tagged original) |
| `ctx_memory` | The shared memory store's read/write port. Reads: `list` / `search` / `get`; writes: `write` / `update` / `archive` / `merge` (with MC's normalized content hashing, mutation log and authority guards in the loop throughout); `review_global` (surfaces machine/org domain candidates one by one as approval cards; publishes only on approval); `promote` (stages a single project memory instantly — a manual lane with no recurrence gate). Every action accepts `project` (absolute path or git root) to operate on another project |

Slash commands (`registerStatusCommand: false` disables only `ctx-status`):

| Command | What it does |
|---|---|
| `/ctx-status` | pressure / decisions / reclaim ledger / compartments / baseline / policy |
| `/ctx-recomp` `all` \| `last:<n>` \| `<startSeq>-<endSeq>` | re-runs the historian and **replaces the stored digest in place** (ranges snap to compartments, never split; identity and landed placeholders unchanged, the next pre-step rebuilds the baseline) |
| `/ctx-profile` `confirm` \| `reject` \| `retire` | confirm / reject / retire user-profile candidates; promotion into the shared profile happens at the next maintenance tick |
| `/ctx-global` `add` \| `remove` \| `status` \| `promote` \| `approve` \| `reject` | the manual lane for global-domain membership and candidate approval (same gate→publish path as the approval cards, `source_type=user`) |

## UI & telemetry

Both UI capabilities ride the same browser half (`src/client/index.js`, copied verbatim to
`lib/client.js` at build time):

- **Settings card on the Plugins page**: visual editing of the volatile config above;
  saving takes effect immediately (see "Configuration").

  ![Magic Context settings card on the DSH Plugins page — execute/force thresholds, scheduling window, reclaim TTL, protected results, historian minimum nodes](https://raw.githubusercontent.com/wk544863858/dsh-plugin-magic-context/main/docs/img/settings-card-top.jpg)

  ![Lower half of the settings card — memory recall budget and limits, journal retention, historian and compaction toggles, verify/historian route selectors, journal switches](https://raw.githubusercontent.com/wk544863858/dsh-plugin-magic-context/main/docs/img/settings-card-bottom.jpg)

- **`shell.overlay` telemetry badge + capsule panel**: collapsed state shows the occupancy
  percentage; the panel holds two metric rows, the beat, and a **live operation record**
  (up to 12 entries, adjacent identical operations folded as `×N`): 🧠 memory write ·
  🔎 memory load · 🗑️ reclaim queued · 🧭 original restored · ✂️ context compacted ·
  🗑️ context dropped · 🧭 archived-stored · 🧰 maintenance sweep · ⚠️ failure. Clicking
  outside the panel/badge, Esc, or window blur closes it.

  ![Telemetry capsule panel — live context pressure, occupancy metrics and a running record of recent reclaim and archive operations](https://raw.githubusercontent.com/wk544863858/dsh-plugin-magic-context/main/docs/img/telemetry-panel.png)
- Data comes from the plugin's own HTTP routes (the harness's Remote event whitelist is a
  compile-time constant; the supported seam for third-party bundles is
  `ctx.webServer.register`):
  - `GET /mc-telemetry/summary` — one-shot snapshot (adapter / project / health + recent
    events)
  - `GET /mc-telemetry/events` — SSE live tail
- **Security**: the routes are loopback-only with no token auth, so they **emit counts and
  one-line summaries only** — no message bodies, no file paths, no credentials.
- **Languages**: browser-side `magic-context` namespace dictionaries (zh/en); Settings →
  General switches instantly without a refresh; the `session-notice` rows written into the
  session stream (model-visible) stay English constants (to avoid cached-prefix churn from
  mid-session language switches). Mechanics in the
  [UI telemetry contract](docs/dsh-plugin-ui-telemetry-contract.md).

## Observability & operations

Desktop **does not persist `ctx.logger` output**, so the plugin writes its decisions and
outcomes into its own append-only journal:

- `~/.local/share/cortexkit/magic-context-dsh-poc/dsh-magic-context.db` → `journal` table
  (structured, SQL-queryable)
- `~/.local/share/cortexkit/magic-context-dsh-poc/activity.log` → single-line text mirror
  (`tail`/grep friendly, auto-rotates to `.1` past 5 MiB)

**Privacy**: message bodies are **never logged**. Only counts, tag numbers, token
estimates, reasons and durations; strings truncate at 300 chars, arrays cap at 20 items
(`redactData` as the backstop).

Journal coverage (by group): lifecycle (`boot` / `config-drift` / `session-first-seen`);
reclaim & compaction (`pass` — every execute recorded, with **tokensBefore→After
net-reclaim proof** and defer reasons, `drop-landed`, `compartment-published`/`-recomp`/
`-guard`, `force-path`, `emergency-reclaim`, `context-pressure`); historian & baseline
(`historian` — start/done/failed pairs with LLM usage, `baseline`, `session-notice`,
`wire-repair`); memory (`memory-recall` / `profile-recall` / `memory-promote` /
`memory-stats` / `vector-lane` / `search-hint` / `project-drift` / `global-review`);
maintenance (`maintenance`); tools & engine (`tool-call` / `engine` / `error` — every
exception swallowed fail-open).

### Operations commands

```sh
npm test               # vitest run
npm run gate           # full gate: typecheck + suite + build + acceptance + memory audit + records
npm run doctor         # read-only health report: corpus fence / event-lane heartbeat / dangling runs / embedding lane

node scripts/mc-report.mjs --days 7 [--json] [--session <id>]   # journal retrospective report
node scripts/mc-acceptance.mjs [--hours 72 --json]              # corpus acceptance, exit 1 on failure
npm run phase          # phase gate: run one phase's suite with verdict and blind spots
```

The retrospective report includes: stores and status, per-kind/per-day counts, key metrics
(execute/defer ratio and reason distribution, net reclaim, historian failure rate and
duration, emergency reclaims, tool calls), recent event details and health hints ("no
execute pass in the window" / "historian never ran" / "errors present" / "latest journal
event older than 24h", …).

`scripts/` specialists: retrieval-weight A/B (`retrieval-eval`), S(t) ranking offline diff
(`score-diff`), dilution & fold dashboard (`report-dilution`), domain-hit stats
(`report-hits`), historian failure classification (`report-classify`), embedding-model
precheck (`embedder-precheck`), reference-seed rebuild (`npm run build:seeds`),
panel-category validation (`mc-records-check`), i18n check (`npm run check:i18n`).

## Architecture

```
src/
  dsh/     # ← the ONLY directory allowed to import @deepseek-ai/* (the
           #    anti-corruption layer). Event names, payload shapes and the
           #    surface vocabulary all live here; a DSH upgrade touches this
           #    directory only.
  core/    # Neutral logic and storage: policy/stores/journal/memory-*/domains.
           #    No DSH dependency.
  client/  # Browser half (settings card + telemetry badge), plain JS,
           #    copied verbatim to lib/client.js at build time.
  index.ts # Composition root: boot probe (fail-loud) → seam listeners →
           #    neutral stores.
```

Isolation discipline (DSH is in developer preview; breaking changes are expected — this
package's structural answer):

- **Fail-loud capability probing**: `probeDshSeams` validates seam availability at boot and
  throws when absent — never silently pretends to manage context;
- **Version fences**: the adapter DB schema chain is at **v10** (forward migrations; a
  newer DB refuses to open); the **own corpus** `memories.db` inherits the **v95** starting
  point (switched 2026-10-13, numbering owned by this plugin; `MEMORY_SCHEMA_MAX_VERSION`
  guards the migration line) — beyond it, reads refuse and writes degrade to read-only
  with a loud warning;
- **Tests as probes**: the integration tests double as seam-contract tests — rerun after a
  DSH upgrade and breakage localizes to `src/dsh/`;
- **Two-database layout**:
  - **Adapter DB** `~/.local/share/cortexkit/magic-context-dsh-poc/dsh-magic-context.db`
    (tags / usage / pending_drops / compartments / baseline / domains / queues / journal…,
    schema v10);
  - **Own corpus** `~/.local/share/cortexkit/magic-context-dsh-poc/memories.db` (project
    memories + global-domain rows + profile + vectors; the legacy `context.db` is sealed
    and unread — the 2026-10-13 hard split; the upstream relationship is feature-following
    only, no storage-compat duty);
- **Upstream parity ledger**: effective-behavior alignment and deliberate differences
  against the OpenCode / Pi adapters are tracked in [PARITY.md](PARITY.md) (aligned /
  host-imposed / intentional verdicts, each citing host files).

## Documentation index

(The linked documents are written in Chinese.)

**Contracts**: [memory write](docs/dsh-plugin-memory-write-contract.md) ·
[memory promotion](docs/dsh-plugin-memory-promotion-contract.md) ·
[memory acceptance](docs/dsh-plugin-memory-acceptance.md) ·
[config UI](docs/dsh-plugin-config-ui-contract.md) ·
[UI telemetry](docs/dsh-plugin-ui-telemetry-contract.md) ·
[upgrade follow-up](docs/dsh-plugin-upgrade-followup.md) ·
[hooks coverage](docs/dsh-plugin-hooks-coverage-2026-10-08.md)

**Design decisions**: [port feasibility (seam map)](docs/dsh-port-feasibility-2026-10-06.md) ·
[platform takeover & global domains](docs/dsh-plugin-platform-takeover-and-global-domains-2026-10-09.md) ·
[dreamer vector decision](docs/dsh-plugin-dreamer-vector-decision-2026-10-08.md) ·
[memory mechanisms inventory](docs/memory-mechanisms-inventory-2026-10-09.md) ·
[upstream source analysis](docs/upstream-source-analysis-2026-10-09.md) ·
[global-domain source finding](docs/global-domain-source-finding-2026-10-10.md) ·
[memory architecture challenge](docs/memory-architecture-challenge-2026-10-10.md)

**Retrospectives & runbooks**: [test design audit](docs/dsh-plugin-test-design-audit-2026-10-07.md) ·
[operations runbook](docs/dsh-plugin-operations-runbook-2026-10-10.md) ·
[surface write audit](docs/dsh-surface-write-audit-2026-10-09.md) ·
[local embedding runtime audit](docs/local-embedding-runtime-audit-2026-10-15.md)

**Reports**: [dreamer token usage](docs/reports/dreamer-token-usage.md) ·
[memory solutions comparison](docs/reports/memory-solutions-comparison.md)

## Known limits

- Historian triggering and budgeting use **chars/4 estimates**, not a real tokenizer
  (retrieval vectorization does use a real one); the four-tier digest is produced in **one
  call** (MC accumulates across calls);
- `review_global` approval cards must be raised inside an agent turn; headless without a
  responder it refuses explicitly with zero state change;
- A journal that was off at mount needs a restart to turn on at runtime (all other
  journal / threshold changes apply immediately);
- Desktop does not persist the harness logger — observability rests entirely on the
  self-kept journal.

## Contributing

- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md) (environment, code conventions,
  PR flow)
- Security reports go through the private channel: [SECURITY.md](SECURITY.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)

This repo uses npm as its only package manager (`package-lock.json` is the truth); CI runs
typecheck → test → build → check:i18n on Node 22.x / 24.x.

## Provenance & license

- **magic-context** (MIT © 2025 Ufuk Altinok): the derivative origin of this repo.
  Extracted from upstream tag v0.46.0 (`651c105a9`); the adapter's own commits were
  replayed verbatim from `e34eda955` (2026-10-08) on the local `dsh` branch.
- **DeepSeek Harness** (MIT): consumed as a dependency, not vendored. Code written against
  0.2.1-rc.1 (checkout `1600d8a1e`, npm dist-tag `next`; note their `latest` tag trails a
  release line — exact pins are the devDependencies).
- Vendored third-party: `vendor/onnx/` (onnxruntime-web WASM subset, MIT © Microsoft),
  `tests/helpers/mock-adapter.ts` (DSH test tree, verbatim). Details in [NOTICE](NOTICE);
  license in [LICENSE](LICENSE).
