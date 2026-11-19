# Magic Context for DeepSeek Harness — elvisw fork

[![CI](https://github.com/elvisw/dsh-plugin-magic-context/actions/workflows/ci.yml/badge.svg)](https://github.com/elvisw/dsh-plugin-magic-context/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@elvisw/dsh-magic-context)](https://www.npmjs.com/package/@elvisw/dsh-magic-context)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/package.json)

> **English** | [简体中文](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/README.zh-CN.md)

Two things keep happening in long sessions. What you worked out last session is gone this session, so
you hit the same wall twice. Tool output piles up until the context window is full, and then
compaction throws away the cache prefix and you pay for the expensive part again.

This plugin brings project memory and context management to DeepSeek Harness. Facts distilled in a
session become project memories that survive across sessions. Tool output can be tagged and reclaimed,
with the original text pullable later. History that has been digested becomes summaries instead of
disappearing.

One command to install:

```bash
dsh plugin --profile web add @elvisw/dsh-magic-context
```

## Install

You need Node ≥ 22.19 and a DSH host with a web client (desktop app or `web` profile). The supported
host versions are declared in `engines.dsh` as `0.2.1-rc.1` or `0.2.2-rc.1`.

The command above targets the `web` profile. The desktop app keeps its own profile, so use
`--profile desktop` there, or whatever your profile is named.

The package ships its build output, so restart the profile and it works. Profiles with HMR hot-load
it instead.

From 0.18.0 the same package also serves Android dsh-go 1.1.0 — see [Android](#android).

> **Package name.** The unscoped `dsh-magic-context` on npm is a different implementation by another
> maintainer. It is neither this fork nor its upstream. This fork publishes only as
> `@elvisw/dsh-magic-context`, so the `@elvisw/` scope is required in every install command.

If you installed an older package, remove it first with
`dsh plugin --profile web remove @elvisw/dsh-plugin-magic-context`, using the same `--profile` you
installed with. This fork's old name is
`@elvisw/dsh-plugin-magic-context` (0.12.x); the upstream one is `dsh-plugin-magic-context`. All
three share one loader row id (`magic-context-dsh`), so installing more than one loads a single row
and the settings page can disappear. Upgrading from 0.12.x also needs a one-time package-name
migration in the profile patch — the steps are in
[package identity and release](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/independent-package-release.md).

## What you get

The words this README keeps using are defined here once. Details and the files behind them are in the
[glossary](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/glossary.md), which is
written in Chinese.

| Term | What it means |
|---|---|
| `§N§` | The tag on a tool result; the model addresses items by it, and you never type it |
| overlay | The layer the host draws above the conversation; the telemetry badge lives there |
| composer | The input area at the bottom; the badge sits above it |
| surface | The exact message list the host sends to the model; rewriting it invalidates the cache prefix |
| reclaim band | The moment a rewrite of the surface is allowed; queued reclaims land here |
| historian | The role that summarises; it replays the real prefix and writes to the store only |
| compartment | One digest produced by the historian, covering a contiguous run of history |
| baseline | The frozen block injected into every request (project memories, profile, global domain) |
| FTS5 | SQLite's full-text extension; its behaviour on Chinese is under Known limits |
| embedding | Turning text into vectors for semantic search; local MiniLM, 384 dimensions, in-package |
| tick | The maintenance loop, every 30 minutes by default |
| parity / gate | The shared-vector-space consistency check; failing it falls back to full-text search |
| pre-step | The host hook that runs before each model request; most decisions happen here |
| execute band | The pressure band entered past the execution threshold (65% by default); historian digests land on the surface here |
| force band | The pressure line where the plugin drops on its own instead of waiting for `ctx_reduce` |
| protected window | What the force band leaves alone: the newest results, up to 5% of the window (clamped to 8k–64k tokens), and at least the newest eight by default |
| four summary layers | The p1–p4 detail tiers of one digest, degraded by importance as the digest ages |
| flat/headless | A host shape with no web or desktop UI |
| HMR | The host's module hot-reload; with it on, no restart is needed after installing |
| `H` / `Q<n>` | Badge abbreviations: `H` is the historian state, `Q<n>` the number of queued reclaims |
| defer | The other decision: leave the surface alone this step because pressure is low |
| token pair | Context tokens used, and the window they are measured against |
| host side | The part of the adapter that runs in the DSH host process |
| three-state | The persisted reclaim state: none, pending, landed |

What changes once it is installed:

- Tool results carry `§N§` tags, and the overlay gains a telemetry badge showing live context usage.
  Open it for the token breakdown and the activity log.
- Settings gains a top-level **Magic Context** page. The old Plugins-page card is removed, so a host
  without a `settings.section` slot has no configuration entry.
- Three tools are registered: `ctx_reduce`, `ctx_expand`, `ctx_memory`. Project memory is on by
  default, and facts distilled by the historian settle on their own.

It also reclaims without being asked. Routine reclaim is agent-driven — nothing is dropped
because a result got old, and `/ctx-flush` only marks already-queued reclaims to land on the
next message. The exception is the force band. When a management pass has a current pressure
reading at or above `policy.forceThreshold` (85% by default), it drops tagged tool results
itself, outside the protected window: the newest results that fit in 5% of the context
window, clamped to 8k–64k tokens, plus at least the newest `protectedToolResults` (eight by
default). Without a known context window, only that count floor applies. The order is by
class, not by age: everything else goes first, then `edit` / `write` / `apply_patch` /
`grep` / `glob`, and `read` / `todowrite` / `task` last, oldest first within a class. A pass
triggered by `/ctx-wrapup`, a pass with no pressure reading, or one whose reading predates a
`/ctx-flush` landing, a published digest or a baseline refresh does not fire the band. Neither
does it fire when dropping every reclaimable result still could not make the request fit a
known window.

Reclaimed output is not lost either. The tag stays a pointer, and when the model needs the
original — because a result it already consumed turns out to matter — it calls `ctx_expand` and
gets the text back as a new tool result; the placeholder stays where it was. That is an agent
move, not a user task: nothing in the UI asks you to pick a tag.

If the provider rejects a request as too long, a second path first publishes any digest that
is ready, then drops the same way — same window, same class order — and retries once, but
only after the surface actually changed: with nothing published and nothing dropped, the
retry would fail identically. Neither path has its own switch.

The system prompt also teaches the model the `§N§` habit, and once the tagged tail reaches
60k tokens with at least 25k of it not yet dropped, reminders start. How hard they push
depends on how much of the tail is still undropped: gentle, firm, urgent, and at the top a
"make it your next step" reminder at 50k or more undropped and three quarters of the tail
undropped. A band that stays the same re-fires no sooner than five user turns later.
Reminders ask; they never drop anything.

## Common tasks

**You do not manage reclaim.** It runs as described above: the model stamps what it has finished
with, and at 85% the force band drops tagged results outside the protected window. A queued
reclaim lands on the next reclaim band rather than immediately because rewriting the
conversation invalidates the cache prefix. If a stamped reclaim should land now rather than wait
for that band, `/ctx-flush` makes queued ones land on your next message. You don't need to name
a tag and you never pick which output goes.

**Record a project fact.** Memories are per project, and project identity comes from the git root.
You can also use this directly from the model's tool call when it learns something worth keeping.

```text
you:     remember that we never tag a release before main CI is green
model:   ctx_memory {"action": "write", "category": "CONSTRAINTS",
                     "content": "never tag a release before main CI is green"}
```

**Compress old history now.** Automatic summarising waits for pressure; `/ctx-wrapup` gives you a
manual entry point that keeps the newest N entries.

```text
/ctx-wrapup 20
```

## Commands and tools

The model calls these tools; you reach them by asking in words, not by typing ranges. The slash
commands below are yours to type.

| Tool | Purpose |
|---|---|
| `ctx_reduce` | Queues outputs for reclaim (a range or a list); landing waits for the reclaim band |
| `ctx_expand` | Retrieves original text by `tag`, by `message` (a session log event seq) or by a `start`/`end` range |
| `ctx_memory` | Memory read/write: `list` / `search` / `get` / `write` / `update` / `archive` / `merge`, plus `review_global` and `promote` |

| Command | Purpose |
|---|---|
| `/ctx-status` | Pressure, decisions, the reclaim ledger, digests, baseline, policy |
| `/ctx-flush` | Marks already-queued reclaims to land on the next message; starts no historian, makes no model call |
| `/ctx-recomp` | Re-runs the historian and replaces stored summaries in place |
| `/ctx-wrapup` | Queues one manual compaction for the next pre-step, keeping the newest N entries (default 20) |
| `/ctx-profile` | Confirm, reject or retire user-profile candidates |
| `/ctx-global` | Domain membership and candidate approval |

Two commands from the original Magic Context (`cortexkit/magic-context`) are not registered here:
`/ctx-dream` needs the full dreamer
task set, and `/ctx-embed` targets session history, memories and git commits, while this adapter's
vectors cover memories only. The command matrix is in
[PARITY.md](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/PARITY.md), and the exact
upstream versions each baseline was checked against are under Provenance.

## Settings

Under **Settings → Magic Context**: five sections and four summary rows, with jump links and an
advanced disclosure, plus a plain-text status strip above the host footer. Interface text switches
between Chinese and English live.

![Settings page, upper half](https://raw.githubusercontent.com/elvisw/dsh-plugin-magic-context/main/docs/img/settings-page-v2-top.png)

![Settings page, lower half](https://raw.githubusercontent.com/elvisw/dsh-plugin-magic-context/main/docs/img/settings-page-v2-bottom.png)

The entries people actually touch:

- **Historian routing.** Pin provider and model, or leave both empty to follow the session. Reasoning
  effort comes from the host model list.
- **Vector search.** Local MiniLM by default. To use an OpenAI-compatible embedding API (SiliconFlow,
  for example), pick the preset in this section, load the models and test the connection. The key is
  write-only, goes into the host credential store, and the card only reports configured or not.
- **Compaction takeover.** Can take over the host's compaction engine, but only in the shape
  described above with no web UI; it does nothing in Web or desktop, and is off by default.
- To turn project memory off, add `enabled: false` inside the existing `memory` block of your
  profile patch. Do not write a bare `config:` block — it replaces the bundled config rather than
  merging, which silently drops keys such as `registerCompactionEngine`.

The full key table with defaults is in the
[configuration reference](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/configuration.md).
When writing profile overrides by hand, note that `config` **replaces** the bundled config rather
than merging into it.

**Telemetry badge.** A pill above the composer. Collapsed it shows live pressure, the token pair, the
historian state and the reclaim queue (`H` / `Q<n>`); in a narrow window it shrinks to icons. Opened,
it shows the host token breakdown bar (system / tool definitions / messages), estimated message
composition (conversation / tool calls / compacted spans / memories / user profile / other), sections
for historian, memory, queue and maintenance, and at most 12 live activity rows. Values the host does
not report show `—`. Focus stays inside the panel while open; clicking outside, pressing Escape,
losing window focus or hitting close dismisses it and returns focus to the pill.

## Android

The same package provides native panels for **Android dsh-go 1.1.0**. Choose the **on-device engine**.
No Flutter build, and not a second package.

Once the market entry is available, open **Plugin market → DSH Go adapter** and search for
`@elvisw/dsh-magic-context`. If it is not there, install the exact version from the app's local
terminal and restart the engine:

```bash
dsh plugin --profile web add @elvisw/dsh-magic-context@0.18.3
```

The host side registers the status strip and panels only when the bridge is present; desktop and Web
profiles load as usual without it.

- **Composer status strip.** The same summary as the desktop pill, e.g. `context 62% · reclaim 3`. It
  yields to the host while a reply streams.
- **Context panel.** When opened from a conversation, it uses only that session's data; when opened
  from All features, it is labelled a global view. Missing values show `—`. The phone does not
  recompute tokens.
- **Vector panel.** Shows provider, model, probed dimensions, coverage and rebuild progress. It can
  load model IDs, test the connection, start a rebuild after confirmation, and pause or resume.
  Opening the panel or saving config never probes or rebuilds on its own.

![Session context](https://raw.githubusercontent.com/elvisw/dsh-plugin-magic-context/main/docs/img/dsh-go-context.zh.png)
![Vector rebuild progress](https://raw.githubusercontent.com/elvisw/dsh-plugin-magic-context/main/docs/img/dsh-go-embedding.zh.png)

Remote embedding keys are entered in the desktop or Web settings page. The native settings page
declares the same roles, but dsh-go 1.1.0's bridge does not yet pass the credential reference to the
app, so the native key field is disabled — see
[dsh-go issue #1493](https://github.com/ccch1mneyyy/dsh-Go/issues/1493). Until then the phone works
with local MiniLM and needs no key.

On 2026-11-18 the full local-vector path was verified on the same phone with the published 0.18.0
package: three memories were backfilled by the maintenance loop into 384-dimension vectors, search
returned `match=hybrid` for rows matched by both lanes and `match=semantic` for the row only the
vector lane could reach, and after an engine restart the shared-space gate reported `parity: 1`.
Details in the
[T25 report](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/_bmad-output/initiative-dsh-magic-context/acceptance-android-dsh-go-2026-11-18-t25-local-vector/acceptance-report.md).

Not yet tested: the English phone UI, iOS, long-history throughput, real vendor traffic, and Chinese
keyword retrieval.

## What it accesses

The dsh-go plugin market scans package contents automatically and rates this package as high risk,
with four flags: `native-code` (high), `shell` (medium), `network` (low) and `filesystem` (medium).
None of the four is decoration, but one of them flags far more files than actually do anything. Each
is spelled out below.

**`native-code` (high) — 1 file.** Only `vendor/onnx/ort-wasm-simd-threaded.wasm` triggers it. That
is WebAssembly bytecode, not a native module, and the package needs no native compilation at all.
Without it, local vectors cannot run; the only alternative would be a remote provider that needs
network access and an API key.

**`shell` (medium) — 12 files, 2 of them real.** Just 2 import `node:child_process`:
`lib/core/memory-bridge.js` runs `git rev-list --max-parents=0 HEAD`, and `lib/dsh/project-drift.js`
runs `git rev-parse --show-toplevel`. Both are read-only and time out after 3 seconds. The memory
bridge falls back to a directory hash when git is absent; the drift check simply reports nothing. The
other 10 are false positives: the scanner's `exec(` pattern also matches `db.exec('PRAGMA …')` SQLite
calls and a regular expression's own `.exec()`. Those false positives account for 52 hits.

**`network` (low) — 7 files, all accounted for.** `lib/core/embedding-local.js` fetches model assets
from huggingface.co or its mirror on first use, pinned by sha256 and cached afterwards.
`lib/core/embedding-remote.js` only contacts an endpoint you configured, and only after you explicitly
test the connection, load the model list, or start a rebuild — never on its own. The 4 `fetch()` calls
in `lib/client.js` are all same-origin relative paths (`/mc-embedding/*`, `/mc-telemetry/*`) against
the host's own loopback routes; the only absolute URL in that file is a hint string in an input field.
`lib/dsh/telemetry.js` and `lib/dsh/embedding-lane.js` contain `telemetry.invalid` and
`embedding.invalid`, which are `new URL()` parse bases and never connect. The remaining 2 are the
vendored onnxruntime files, which we drive with local file paths and which make no request at runtime.

**`filesystem` (medium) — 6 files, and this one is accurate.** The adapter store, `memories.db`, the
journal and the model cache default to `~/.local/share/cortexkit/magic-context-dsh-poc/`, all outside
the workspace. Set `dataDir` to move them.

## Known limits

- Historian triggering and budgets estimate tokens as characters divided by four, not with a real
  tokenizer. The retrieval-vector path does use the real tokenizer.
- The detail tiers of a digest are produced in a single call; upstream accumulates them across calls.
- Chinese keyword retrieval is weak. FTS5's `porter unicode61` tokenizer does not segment Chinese, so
  a run of Han characters counts as one token and Chinese queries depend on the vector lane. This is
  upstream behaviour, not an adapter defect.
- `review_global` approval cards must be raised inside an agent turn. Headless hosts with no answerer
  refuse explicitly and change no state.
- A journal that is off at mount time needs a restart to be turned on at runtime.
- The desktop does not persist host logger output, so observability rests entirely on the plugin's own
  journal.

## Troubleshooting

The host does not persist `ctx.logger` output, so the plugin writes its decisions and results into its
own journal. There are two destinations, both under the data directory: a structured `journal` table
you can query with SQL, and a single-line text mirror `activity.log` that rotates past 5 MiB. Message
bodies are never recorded — only counts, tag numbers, token estimates, reasons and durations.

From a checkout of this repository (an installed copy has these under `node_modules`):

```sh
npm run doctor         # read-only health report
node scripts/mc-report.mjs --days 7 [--json]   # journal review
node scripts/mc-acceptance.mjs [--hours 72]    # corpus acceptance, exits 1 on failure
```

The report covers execute/defer ratios, net reclaim, historian failure rate and duration, emergency
reclaims, tool-call counts, plus health notes such as "no execute pass in the window". The event kinds
are listed in the
[architecture document](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/architecture.md).

If a term is unfamiliar, the
[glossary](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/glossary.md) collects
them in one place (Chinese).

## Documentation

**Currently maintained**

- [Configuration reference](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/configuration.md) — every key, its default, and remote embedding details
- [Architecture and internals](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/architecture.md) — layout, the two databases, storage and retrieval, journal kinds
- [Glossary](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/glossary.md) — the internal words used in this README
- [Settings UI contract](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-plugin-settings-ui-contract.md) — host seams and copy rules for the settings page
- [Operations runbook](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-plugin-operations-runbook-2026-10-10.md) — routine checks, thresholds, incident handling
- [Upgrade follow-up](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-plugin-upgrade-followup.md) — the re-alignment process
- [Package identity and release](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/independent-package-release.md) — package identity, migration, release flow
- [PARITY.md](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/PARITY.md) — line-by-line alignment with the upstream adapters

**Historical material**

Kept for provenance only, not a current guarantee. Each file opens with its own status note and
evidence baseline.

- [Memory write contract](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-plugin-memory-write-contract.md)
- [Memory promotion contract](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-plugin-memory-promotion-contract.md)
- [Memory acceptance](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-plugin-memory-acceptance.md)
- [Config UI contract](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-plugin-config-ui-contract.md)
- [Main-UI telemetry contract](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-plugin-ui-telemetry-contract.md)
- [Hooks coverage](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-plugin-hooks-coverage-2026-10-08.md)
- [Port feasibility](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-port-feasibility-2026-10-06.md)
- [Platform takeover and domains](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-plugin-platform-takeover-and-global-domains-2026-10-09.md)
- [Dreamer vector decision](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-plugin-dreamer-vector-decision-2026-10-08.md)
- [Memory mechanisms inventory](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/memory-mechanisms-inventory-2026-10-09.md)
- [Upstream source analysis](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/upstream-source-analysis-2026-10-09.md)
- [Domain source investigation](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/global-domain-source-finding-2026-10-10.md)
- [Memory architecture challenge](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/memory-architecture-challenge-2026-10-10.md)
- [Domain naming decision](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/domain-naming-work-global-2026-10-25.md)
- [Test design audit](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-plugin-test-design-audit-2026-10-07.md)
- [Surface write audit](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/dsh-surface-write-audit-2026-10-09.md)
- [Local embedding runtime audit](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/docs/local-embedding-runtime-audit-2026-10-15.md)

## Contributing

- [CONTRIBUTING.md](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/CONTRIBUTING.md) — environment, code conventions, PR flow
- [SECURITY.md](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/SECURITY.md) — report vulnerabilities privately
- [CHANGELOG.md](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/CHANGELOG.md) — release notes

This repository uses npm as its only package manager, with `package-lock.json` as the authority. CI
runs typecheck, tests, build and the i18n check on Node 22.x and 24.x.

## Provenance and license

This repository is a fork of
[`wk544863858/dsh-plugin-magic-context`](https://github.com/wk544863858/dsh-plugin-magic-context)
(npm `dsh-plugin-magic-context`). The last public upstream release is 0.11.2. This fork published
0.12.0 through 0.12.3 as `@elvisw/dsh-plugin-magic-context` and switched to
`@elvisw/dsh-magic-context` at 0.13.0. Versions and tags belong to this fork; the upstream repository
and npm package remain with their maintainer.

Changes in this fork since upstream 0.11.2, up to 0.18.3:

- **Recovery semantics changed, and it is a breaking change.** `ctx_expand` hands the original back
  without moving anything on the surface: the old placeholder stays untouched, its tag stays spent,
  and reclaiming the same tag again is refused as already dropped.
- **Original text stays readable after the historian.** `ctx_expand` gained `message` addressing,
  which accepts a session log event seq, including original tool results shadowed by the historian. It
  re-runs no tool and rewrites no summary.
- **`/ctx-flush` added.** Marks queued reclaims to land on the next pre-step. Starts no historian, no
  recomp, no model call.
- **Reclaim state is persisted.** Decisions use the stored three-state value rather than whether a
  placeholder is still on the surface.
- **No time-based tag pruning.** The 30-day prune at mount and `tags.retentionDays` were removed. A
  stale key in an old profile is ignored with at most one warning per process.
- **Settings UI rebuilt.** Only the top-level `settings.section` is registered, Chinese and English
  switch live, and reasoning effort comes from the host model list.
- **Telemetry v2.** Adds the token breakdown bar, estimated message composition, and
  historian/memory/queue/maintenance/reclaimable/warnings sections.
- **Plugin schema upgraded.** Older databases are migrated automatically when opened; no manual step.
- **Renaming does not migrate data.** A 0.12.x profile patch still names the old package. The DSH
  loader matches on both `id` and `name` and skips the whole row on a mismatch, so run
  `tools/migrate-profile-package-name.mjs --patch <cordis.patch.yml>` once before opening Settings.
  Memories, journal and a custom data directory keep their paths.

This fork guarantees only its own plugin behaviour and data migrations. It does not promise long-term
UX or API compatibility with upstream 0.11.x; compatibility semantics follow the original
`cortexkit/magic-context`, with DSH still the host.

**Two baselines, not one.** The context-management behaviour table was reconciled line by line
against cortexkit v0.49.30; the command surface was checked against v0.49.59. The two numbers differ
because the batches differ, not because one is a typo. Do not read PARITY as full upstream parity.

**Copyright.** The upstream DSH adapter is `wk544863858/dsh-plugin-magic-context`
(npm 0.11.2, MIT, Copyright (c) 2026 wukai) and is the direct upstream of this repository. Changes in
this fork are Copyright (c) 2026 elvisw, also MIT. The originating magic-context project is MIT,
Copyright (c) 2025 Ufuk Altinok, extracted from upstream tag v0.46.0.

**Third parties.** DeepSeek Harness is consumed as a dependency rather than bundled; the code is
written against 0.2.1-rc.1, and the `latest` tags on those packages lag by one release line, so take
exact versions from devDependencies. The package vendors `vendor/onnx/` (a WASM subset of
onnxruntime-web, MIT © Microsoft) and embeds `tests/helpers/mock-adapter.ts` verbatim from the DSH
test tree.

Details in [NOTICE](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/NOTICE), license in
[LICENSE](https://github.com/elvisw/dsh-plugin-magic-context/blob/main/LICENSE).
