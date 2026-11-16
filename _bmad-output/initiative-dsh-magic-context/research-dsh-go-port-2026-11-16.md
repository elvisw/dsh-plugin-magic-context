# dsh-go port — research and plan

Status: **research complete, plan drafted, implementation not started (2026-11-16).**
This is not a BMad ticket and authorizes no code, install, release or profile change.
Prerequisite decision: finish the DSH Web/Desktop telemetry redesign first; the
phone port consumes the same telemetry model afterwards.

## 1. Question

Can `@elvisw/dsh-magic-context` run on
[`ccch1mneyyy/dsh-go`](https://github.com/ccch1mneyyy/dsh-go)? The answer is yes
for the server half; the native UI needs a separate renderer. `dsh-go` is a
Flutter/Dart app name, not a Go rewrite: its local engine is the standard DSH
engine.

Pinned research source: `ccch1mneyyy/dsh-go@f5fa9256db4c82d601078b8064056b93dc3560ec`
(2026-11-16, `main`). Upstream docs may move; re-check this SHA before starting.

## 2. Host facts (source-level)

| Fact | Evidence |
|---|---|
| Android local engine is Ubuntu 24.04 under PRoot, launching `dsh web` | `docs/architecture.md` §0, §3.2 |
| Android bundles **Node 24.22.1** and **DSH 0.2.2-rc.1** | `runtime/build-runtime.sh` (`NODE_VERSION`, `DSH_VERSION`), `runtime/locks/dsh-0.2.2-rc.1/package.json` |
| iOS uses NodeMobile 24.22.1 and the same DSH engine | `docs/architecture.md` §3.6 |
| Plugins install with `dsh plugin --profile web add <path-or-spec>` | `docs/plugins/hosts.md` |
| Existing DSH plugins keep commands, skills, Config schema and tools without App code | `docs/plugins/choose-path.md` §1, `docs/plugins/native-for-free.md` |
| Native UI is declarative: `package.json` → `dshGo` + `ctx.dshGo`; the App does not execute plugin code | `docs/design/native-plugins.md`, `app/assets/skills/dsh-go-plugin/SKILL.md` |
| Web client surfaces can be reused as web islands; coverage is slot-dependent | `docs/plugins/choose-path.md` §4, `docs/plugins/web-panels.md` |
| `settings.section` can become a native Config form; newer App versions may open the web section as an island | `docs/plugins/native-for-free.md`, `docs/plugins/web-panels.md` |
| `shell.overlay` is a web island only on the local engine, explicitly enabled, with resource limits | `docs/plugins/web-panels.md` §App 内网页浮层 |
| Host has agent presets and preset-related patches | `runtime/patches/preset-legacy-delegation.diff`, `web-preset-save-freshness.diff`, `session-preset-resume-errors.diff` |

## 3. Compatibility with this plugin

Our package requires Node ≥ 22.19, uses the built-in `node:sqlite`, has no
native `.node` modules, and runs MiniLM through bundled `onnxruntime-web` WASM.
Node 24.22.1 satisfies the runtime requirement.

| Area | Expected status | Notes |
|---|---|---|
| Tools (`ctx_memory`, `ctx_reduce`, `ctx_expand`) | Works | Server-side; generic tool rows in the App |
| Commands (`/ctx-status`, `/ctx-flush`, `/ctx-recomp`) | Works | Native command menu and transcript |
| Memory / SQLite / journal / schema v11 | Works, needs device smoke | `node:sqlite` must be present on device |
| Historian / maintenance | Works while the engine runs | Phone background lifecycle may pause it |
| Vector lane | Unverified | `onnxruntime-web` WASM + MiniLM download/CPU on device; fail-open to FTS |
| Config schema | Works as native form | Custom `settings.section` card is not native; may open as web island |
| Telemetry overlay | Not native | `shell.overlay` web island is heavy; replace with `composer.strip` + `panels` |
| Tool cards | Generic | Add `presentationMeta` only if needed |
| Compaction takeover | Does not work on Web/Desktop or the DSH Web composition | Same preset isolation as T16; leave the switch off |
| Package market metadata | Missing | Add `engines.dsh` if publishing to the dsh-go market |

## 4. Repo boundary

| Work | Repository | Timing |
|---|---|---|
| Telemetry data contract + DSH Web UI | this repo | first |
| dsh-go runtime spike (install only) | this repo (no dsh-go edits) | can run in parallel |
| `dshGo` manifest + native status/panel handlers | this repo | after telemetry v2 |
| Config schema descriptions / `engines.dsh` | this repo | with the native port |
| dsh-go host changes (preset-scoped compaction, new bridge/slot) | dsh-go fork, if ever needed | only after a host-level decision |
| Separate package/release | not required | same npm package can carry both web and `dshGo` halves |

## 5. Plan (not started)

### Phase 0 — desktop telemetry first

Complete the DSH Web/Desktop telemetry redesign. Define one view model for
context pressure, token breakdown, memory, queue, historian, dreamer and
warnings; render it in the Web UI. This is the source of truth for the phone
renderer.

### Phase 1 — device runtime spike (no UI port)

On an isolated Android local engine:

1. Install the current package.
2. Verify plugin load, `node:sqlite`, FTS search, `ctx_memory`, `ctx_reduce`,
   `/ctx-status` and the settings form.
3. Record whether `onnxruntime-web` initializes and whether MiniLM downloads.
4. Record engine background/reset behavior and the data directory lifetime.

Exit criteria: a written result with device/OS/App/DSH/Node versions and
explicit pass/fail/blocked per item. Do not mutate the daily profile.

### Phase 2 — native UI

Add a `dshGo` manifest and a server-side `ctx.dshGo` adapter in this repo:

- `composer.strip`: one-line state, e.g. pressure + queue + historian;
- `panels`: detailed telemetry using the same view model;
- optional `message.actions` / `turn.note` for quick actions;
- native Config form copy in zh/en;
- `engines.dsh` compatibility range for the market.

Do not use `shell.overlay` as the primary phone UI.

### Phase 3 — optional mobility work

- Remote embedding provider (e.g. an OpenAI-compatible `/v1/embeddings` API)
  with model/dimension migration and FTS fallback.
- Tool result cards for memory/search/status.
- Web islands only where a native surface has no equivalent.

## 6. Risks / open questions

1. `node:sqlite` on the packaged Android/iOS Node build — first smoke item.
2. `onnxruntime-web` WASM and MiniLM CPU/memory on a phone — fail-open policy
   keeps FTS usable.
3. Background engine lifecycle: maintenance and historian may stop when the App
   is backgrounded.
4. Data directory survival across engine reset/upgrade/App uninstall.
5. `settings.section` web-island availability depends on App version.
6. Compaction takeover remains unavailable because of preset isolation.
7. Remote embeddings add privacy, network, cost and full re-embedding on model
   change.
8. Market review may require `engines.dsh`, risk metadata and a stable package
   layout.

## 7. Decision

- Do **not** port the current telemetry UI to the phone first.
- Do **not** create a new repository for the plugin port; add `dshGo` to the
  existing package.
- Do **not** modify the dsh-go host unless a host-level capability (e.g.
  preset-scoped compaction) is explicitly approved.
- Start only after the telemetry redesign has a stable data contract.

## 8. Evidence status

This document is static research, not a host gate. It contains no phone run, no
install, no `node:sqlite` or WASM proof, and no dsh-go profile mutation. Those
are Phase 1 acceptance items.
